// Kicks off a historical daily-reports backfill.
// Auth: signed-in manager/admin. Creates a report_imports row, generates a
// signed download URL for the uploaded xlsx (or forwards an external URL),
// and POSTs the job to the n8n webhook for processing.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SIGNED_URL_TTL = 60 * 60 * 24 * 3; // 3 days — gives n8n time to process

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Verify the caller via the user-scoped client (RLS-aware)
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = userData.user.id;

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const {
    storage_path,            // e.g. "<company_id>/2026-05-01-uuid.xlsx"
    source_url,              // alternative: external URL
    source_label,
    period_start,
    period_end,
    name_email_map,          // [{name: "...", email: "..."}]
  } = body ?? {};

  if (!storage_path && !source_url) {
    return new Response(JSON.stringify({ error: "storage_path or source_url required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!Array.isArray(name_email_map) || name_email_map.length === 0) {
    return new Response(JSON.stringify({ error: "name_email_map is required (array of {name,email})" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // Resolve company + role
  const { data: profile } = await admin
    .from("profiles").select("company_id").eq("id", userId).maybeSingle();
  const companyId = profile?.company_id;
  if (!companyId) {
    return new Response(JSON.stringify({ error: "User has no company" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: roles } = await admin
    .from("user_roles").select("role").eq("user_id", userId).eq("company_id", companyId);
  const isManager = (roles ?? []).some((r: any) => r.role === "manager" || r.role === "admin");
  if (!isManager) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // If a storage_path is provided, ensure it lives under the caller's company prefix
  if (storage_path && !String(storage_path).startsWith(`${companyId}/`)) {
    return new Response(JSON.stringify({ error: "storage_path must be under your company folder" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Resolve the name→email map to user_ids by joining profiles
  const emails = name_email_map.map((m: any) => String(m.email ?? "").toLowerCase().trim()).filter(Boolean);
  const { data: matchedProfiles } = await admin
    .from("profiles").select("id, email, full_name")
    .eq("company_id", companyId).in("email", emails);
  const emailToUser = new Map<string, { id: string; full_name: string | null }>();
  for (const p of matchedProfiles ?? []) {
    if (p.email) emailToUser.set(p.email.toLowerCase(), { id: p.id, full_name: p.full_name });
  }
  const resolved = (name_email_map as any[]).map((m) => {
    const email = String(m.email ?? "").toLowerCase().trim();
    const u = emailToUser.get(email);
    return {
      name: m.name,
      email,
      user_id: u?.id ?? null,
      profile_full_name: u?.full_name ?? null,
    };
  });
  const unmatched = resolved.filter((r) => !r.user_id);

  // Create the import job row
  const { data: job, error: insErr } = await admin
    .from("report_imports")
    .insert({
      company_id: companyId,
      created_by: userId,
      storage_path: storage_path ?? null,
      source_url: source_url ?? null,
      source_label: source_label ?? null,
      period_start: period_start ?? null,
      period_end: period_end ?? null,
      name_email_map: resolved,
      status: "pending",
      metadata: { unmatched_count: unmatched.length },
    })
    .select("id").single();
  if (insErr || !job) {
    return new Response(JSON.stringify({ error: insErr?.message ?? "Failed to create import job" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Build a downloadable URL for n8n
  let downloadUrl: string | null = source_url ?? null;
  if (storage_path) {
    const { data: signed, error: sErr } = await admin.storage
      .from("report-imports").createSignedUrl(storage_path, SIGNED_URL_TTL);
    if (sErr || !signed) {
      await admin.from("report_imports").update({
        status: "failed", error_message: `Failed to sign URL: ${sErr?.message ?? "unknown"}`,
      }).eq("id", job.id);
      return new Response(JSON.stringify({ error: "Failed to generate download URL" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    downloadUrl = signed.signedUrl;
  }

  // Send to n8n
  const webhookUrl = Deno.env.get("N8N_WEBHOOK_URL");
  const incomingSecret = Deno.env.get("N8N_INCOMING_SECRET");
  if (!webhookUrl) {
    await admin.from("report_imports").update({
      status: "failed", error_message: "N8N_WEBHOOK_URL not configured",
    }).eq("id", job.id);
    return new Response(JSON.stringify({ error: "N8N_WEBHOOK_URL not set" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const payload = {
    job_type: "daily_reports_backfill",
    import_id: job.id,
    company_id: companyId,
    period: { start: period_start ?? null, end: period_end ?? null },
    file: {
      download_url: downloadUrl,
      label: source_label ?? null,
      from_storage: !!storage_path,
    },
    employees: resolved, // [{name, email, user_id, profile_full_name}]
    callback_url: `${supabaseUrl}/functions/v1/n8n-incoming-receiver`,
    callback_secret: incomingSecret,
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`n8n responded ${res.status}`);
    await admin.from("report_imports").update({
      status: "processing", updated_at: new Date().toISOString(),
    }).eq("id", job.id);
  } catch (e) {
    await admin.from("report_imports").update({
      status: "failed", error_message: `n8n dispatch failed: ${String(e)}`,
    }).eq("id", job.id);
    return new Response(JSON.stringify({ error: "Failed to dispatch to n8n" }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    ok: true, import_id: job.id, unmatched_count: unmatched.length, unmatched,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
