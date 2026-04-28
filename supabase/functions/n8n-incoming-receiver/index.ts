// Receives the processed file URL back from n8n and notifies managers.
// Public endpoint (verify_jwt = false) — auth is enforced via a shared secret
// that n8n must send in the `x-callback-secret` header (or `Authorization: Bearer <secret>`).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-callback-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Constant-time string compare to prevent timing attacks. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

function extractSecret(req: Request): string | null {
  const direct = req.headers.get("x-callback-secret");
  if (direct) return direct.trim();
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const expectedSecret = Deno.env.get("N8N_INCOMING_SECRET");
  if (!expectedSecret) {
    console.error("N8N_INCOMING_SECRET is not configured");
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const provided = extractSecret(req);
  if (!provided || !safeEqual(provided, expectedSecret)) {
    console.warn("n8n-incoming-receiver: rejected request — bad/missing secret");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }


  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { system_report_id, file_url, status, metadata, title } = body ?? {};
  if (!system_report_id || !file_url) {
    return new Response(JSON.stringify({ error: "system_report_id and file_url required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: row, error: upErr } = await supabase
    .from("system_reports")
    .update({
      file_url,
      status: status ?? "ready",
      title: title ?? undefined,
      metadata: metadata ?? null,
      generated_at: new Date().toISOString(),
    })
    .eq("id", system_report_id)
    .select("id, company_id, title")
    .single();

  if (upErr || !row) {
    return new Response(JSON.stringify({ error: upErr?.message ?? "Report not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Notify all managers/admins of that company
  const { data: mgrs } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("company_id", row.company_id)
    .in("role", ["manager", "admin"]);

  const notifs = (mgrs ?? []).map((m: any) => ({
    company_id: row.company_id,
    user_id: m.user_id,
    title: "AI report ready",
    body: row.title ? `${row.title} is ready to download.` : "Your AI-generated report is ready.",
    link: "/ai-reports",
  }));
  if (notifs.length > 0) await supabase.from("system_notifications").insert(notifs);

  return new Response(JSON.stringify({ ok: true, notified: notifs.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
