import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { InventoryLog } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowDownToLine, ArrowUpFromLine, Hammer, Truck, Sliders, History } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = {
  in: ArrowDownToLine,
  out: ArrowUpFromLine,
  assemble: Hammer,
  deliver: Truck,
  adjust: Sliders,
} as const;

const ACTION_TONE: Record<string, string> = {
  in: "bg-success/15 text-success",
  out: "bg-warning/15 text-warning-foreground",
  assemble: "bg-primary-container text-primary-container-foreground",
  deliver: "bg-accent/15 text-accent",
  adjust: "bg-secondary text-secondary-foreground",
};

export default function LogsPage() {
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("inventory_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      setLogs((data as InventoryLog[]) ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-6 sm:pl-64">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Activity log</h1>
        <p className="mt-1 text-sm text-muted-foreground">Last 200 stock movements.</p>
      </header>

      {loading ? (
        <div className="rounded-2xl border border-border bg-surface-elevated p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : logs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface-elevated p-10 text-center">
          <History className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold">No activity yet</p>
          <p className="text-xs text-muted-foreground">Scan or move stock to see entries here.</p>
        </div>
      ) : (
        <Card className="overflow-hidden shadow-elevation-1">
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {logs.map((log) => {
                const Icon = ICONS[log.action];
                return (
                  <li key={log.id} className="flex items-center gap-3 p-4">
                    <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", ACTION_TONE[log.action])}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{log.item_name}</span>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase text-secondary-foreground">
                          {log.item_type}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {log.action.toUpperCase()} · {new Date(log.created_at).toLocaleString()}
                        {log.note ? ` · ${log.note}` : ""}
                      </div>
                    </div>
                    <div className="text-lg font-bold tabular-nums">
                      {["out", "deliver"].includes(log.action) ? "−" : "+"}
                      {log.quantity}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
