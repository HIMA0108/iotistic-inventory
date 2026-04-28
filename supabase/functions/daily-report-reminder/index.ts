// Cron-triggered: 4:40 PM Mon–Sat. Pings staff who haven't submitted today's report.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Skip Sunday (UTC dow 0) — adjust if you need a TZ
  const now = new Date();
  const dow = now.getUTCDay();
  if (dow === 0) {
    return new Response(JSON.stringify({ skipped: "sunday" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const today = now.toISOString().slice(0, 10);

  // Get all companies
  const { data: companies, error: cErr } = await supabase.from("companies").select("id");
  if (cErr) {
    return new Response(JSON.stringify({ error: cErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let totalNotified = 0;
  for (const c of companies ?? []) {
    const { data: missing } = await supabase.rpc("missing_report_users_for_date", {
      _company_id: c.id,
      _date: today,
    });

    for (const m of (missing as any[]) ?? []) {
      // Avoid duplicate reminders today
      const { data: existing } = await supabase
        .from("system_notifications")
        .select("id")
        .eq("user_id", m.user_id)
        .eq("title", "Submit today's daily report")
        .gte("created_at", `${today}T00:00:00Z`)
        .maybeSingle();
      if (existing) continue;

      await supabase.from("system_notifications").insert({
        company_id: c.id,
        user_id: m.user_id,
        title: "Submit today's daily report",
        body: "It's 4:40 PM — please submit your tasks for today before logging off.",
        link: "/reports",
      });
      totalNotified += 1;
    }
  }

  return new Response(JSON.stringify({ ok: true, notified: totalNotified, date: today }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
