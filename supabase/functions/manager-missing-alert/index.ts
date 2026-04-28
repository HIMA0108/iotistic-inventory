// Cron-triggered: weekly (Friday 5 PM). Notifies managers of staff who missed reports this week.
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

  // Build last 6 days range (Sat..Thu, skipping Sunday)
  const today = new Date();
  const dates: string[] = [];
  for (let i = 1; i <= 6; i++) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    if (d.getUTCDay() === 0) continue;
    dates.push(d.toISOString().slice(0, 10));
  }

  const { data: companies } = await supabase.from("companies").select("id");
  let alerts = 0;

  for (const c of companies ?? []) {
    const missingByUser = new Map<string, { name: string; email: string; days: string[] }>();
    for (const date of dates) {
      const { data: missing } = await supabase.rpc("missing_report_users_for_date", {
        _company_id: c.id,
        _date: date,
      });
      for (const m of (missing as any[]) ?? []) {
        const cur = missingByUser.get(m.user_id) ?? {
          name: m.full_name ?? m.email,
          email: m.email,
          days: [],
        };
        cur.days.push(date);
        missingByUser.set(m.user_id, cur);
      }
    }

    if (missingByUser.size === 0) continue;

    // Find managers/admins of this company
    const { data: mgrs } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .eq("company_id", c.id)
      .in("role", ["manager", "admin"]);

    const summary = [...missingByUser.values()]
      .map((v) => `${v.name}: ${v.days.length} day(s)`)
      .join("; ");

    for (const mgr of mgrs ?? []) {
      await supabase.from("system_notifications").insert({
        company_id: c.id,
        user_id: mgr.user_id,
        title: "Weekly report compliance summary",
        body: `Staff with missing reports this week — ${summary}`,
        link: "/work-tracking",
      });
      alerts += 1;
    }
  }

  return new Response(JSON.stringify({ ok: true, alerts }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
