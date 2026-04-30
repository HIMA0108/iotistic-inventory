// Cron-triggered on the 1st of each month. Aggregates last month's data and POSTs to n8n.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const enc = new TextEncoder();
  const ab = enc.encode(a), bb = enc.encode(b);
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const expected = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!expected || !safeEqual(provided, expected)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const webhookUrl = Deno.env.get("N8N_WEBHOOK_URL");
  const incomingSecret = Deno.env.get("N8N_INCOMING_SECRET");
  if (!webhookUrl) {
    return new Response(JSON.stringify({ error: "N8N_WEBHOOK_URL not set" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Compute previous month range
  const now = new Date();
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const periodStart = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth(), 1));
  const startStr = periodStart.toISOString().slice(0, 10);
  const endStr = periodEnd.toISOString().slice(0, 10);

  const { data: companies } = await supabase.from("companies").select("id, name");
  const results: any[] = [];

  for (const c of companies ?? []) {
    // Pull every daily report and its tasks for the month
    const { data: reports } = await supabase
      .from("daily_reports")
      .select("id, user_id, report_date, notes")
      .eq("company_id", c.id)
      .gte("report_date", startStr)
      .lte("report_date", endStr);

    const reportIds = (reports ?? []).map((r: any) => r.id);
    let tasks: any[] = [];
    if (reportIds.length > 0) {
      const { data: t } = await supabase
        .from("report_tasks")
        .select("report_id, task_name, quantity")
        .in("report_id", reportIds);
      tasks = t ?? [];
    }

    const userIds = Array.from(new Set((reports ?? []).map((r: any) => r.user_id)));
    const { data: profs } = userIds.length
      ? await supabase
          .from("profiles")
          .select("id, full_name, email, display_title")
          .in("id", userIds)
      : { data: [] };

    // Create a system_reports row in pending state so we can match the response
    const { data: sysRow, error: srErr } = await supabase
      .from("system_reports")
      .insert({
        company_id: c.id,
        report_type: "monthly",
        period_start: startStr,
        period_end: endStr,
        status: "pending",
        title: `Monthly report — ${startStr.slice(0, 7)}`,
      })
      .select("id")
      .single();
    if (srErr || !sysRow) continue;

    const payload = {
      system_report_id: sysRow.id,
      company: c,
      period: { start: startStr, end: endStr },
      employees: profs,
      reports,
      tasks,
      callback_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/n8n-incoming-receiver`,
      callback_secret: incomingSecret,
    };

    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      results.push({ company_id: c.id, system_report_id: sysRow.id, sent: true });
    } catch (e) {
      results.push({ company_id: c.id, error: String(e) });
    }
  }

  return new Response(JSON.stringify({ ok: true, results, period: { startStr, endStr } }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
