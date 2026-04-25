import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { InventoryLog, LogAction, LogItemType } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { CalendarRange, Package, Cpu } from "lucide-react";

const ACTION_COLS: { key: LogAction; label: string; tone: string }[] = [
  { key: "in", label: "IN", tone: "text-success" },
  { key: "out", label: "OUT", tone: "text-warning-foreground" },
  { key: "assemble", label: "Assembled", tone: "text-primary" },
  { key: "deliver", label: "Delivered", tone: "text-accent" },
  { key: "defective", label: "Defective", tone: "text-destructive" },
  { key: "adjust", label: "Adjust", tone: "text-muted-foreground" },
];

interface MonthBucket {
  key: string; // YYYY-MM
  label: string; // "March 2025"
  start: Date;
  end: Date;
}

function buildMonths(count: number): MonthBucket[] {
  const months: MonthBucket[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    months.push({
      key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
      label: start.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
      start,
      end,
    });
  }
  return months;
}

type Totals = Record<LogAction, number>;
type ItemAgg = {
  item_id: string;
  item_name: string;
  item_type: LogItemType;
  totals: Totals;
};

function emptyTotals(): Totals {
  return { in: 0, out: 0, assemble: 0, deliver: 0, defective: 0, adjust: 0 };
}

export default function HistoryPage() {
  const [monthCount, setMonthCount] = useState<number>(3);
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [loading, setLoading] = useState(true);

  const months = useMemo(() => buildMonths(monthCount), [monthCount]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const earliest = months[months.length - 1].start.toISOString();
      const { data } = await supabase
        .from("inventory_logs")
        .select("*")
        .gte("created_at", earliest)
        .order("created_at", { ascending: false });
      setLogs((data as InventoryLog[]) ?? []);
      setLoading(false);
    })();
  }, [monthCount]);

  // Aggregate per month per item
  const aggregated = useMemo(() => {
    const byMonth: Record<string, { components: Map<string, ItemAgg>; devices: Map<string, ItemAgg>; totals: Totals }> = {};
    months.forEach((m) => {
      byMonth[m.key] = { components: new Map(), devices: new Map(), totals: emptyTotals() };
    });

    logs.forEach((l) => {
      const ts = new Date(l.created_at);
      const key = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, "0")}`;
      const bucket = byMonth[key];
      if (!bucket) return;
      const map = l.item_type === "component" ? bucket.components : bucket.devices;
      const existing =
        map.get(l.item_id) ??
        ({ item_id: l.item_id, item_name: l.item_name, item_type: l.item_type, totals: emptyTotals() } as ItemAgg);
      existing.totals[l.action] += l.quantity;
      // keep most recent name
      existing.item_name = l.item_name;
      map.set(l.item_id, existing);
      bucket.totals[l.action] += l.quantity;
    });

    return byMonth;
  }, [logs, months]);

  return (
    <div className="space-y-6 sm:pl-64">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Monthly history</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Per-month totals of stock movements for each component and device.
          </p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Range</Label>
          <Select value={String(monthCount)} onValueChange={(v) => setMonthCount(parseInt(v))}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">Last 3 months</SelectItem>
              <SelectItem value="6">Last 6 months</SelectItem>
              <SelectItem value="12">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      {loading ? (
        <div className="rounded-2xl border border-border bg-surface-elevated p-8 text-center text-sm text-muted-foreground">
          Loading report…
        </div>
      ) : (
        <Tabs defaultValue={months[0].key} className="space-y-4">
          <TabsList className="flex w-full flex-wrap justify-start gap-1 bg-secondary p-1">
            {months.map((m) => (
              <TabsTrigger key={m.key} value={m.key} className="gap-2">
                <CalendarRange className="h-3.5 w-3.5" /> {m.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {months.map((m) => {
            const bucket = aggregated[m.key];
            const components = Array.from(bucket.components.values()).sort((a, b) =>
              a.item_name.localeCompare(b.item_name),
            );
            const devices = Array.from(bucket.devices.values()).sort((a, b) =>
              a.item_name.localeCompare(b.item_name),
            );

            return (
              <TabsContent key={m.key} value={m.key} className="space-y-4">
                {/* Month summary */}
                <Card className="shadow-elevation-1">
                  <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
                    {ACTION_COLS.map((a) => (
                      <div
                        key={a.key}
                        className="rounded-xl border border-border bg-surface-elevated p-3 text-center"
                      >
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {a.label}
                        </div>
                        <div className={`mt-1 text-2xl font-bold tabular-nums ${a.tone}`}>
                          {bucket.totals[a.key]}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Components table */}
                <ItemSection
                  title="Components"
                  icon={<Package className="h-4 w-4" />}
                  items={components}
                />
                {/* Devices table */}
                <ItemSection
                  title="Devices"
                  icon={<Cpu className="h-4 w-4" />}
                  items={devices}
                />
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </div>
  );
}

function ItemSection({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: ItemAgg[];
}) {
  return (
    <Card className="overflow-hidden shadow-elevation-1">
      <div className="flex items-center gap-2 border-b border-border bg-surface-elevated px-4 py-3 text-sm font-semibold">
        {icon} {title}
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No activity for {title.toLowerCase()} this month.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Item</th>
                  {ACTION_COLS.map((a) => (
                    <th key={a.key} className="px-3 py-2 text-right font-semibold">
                      {a.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.item_id} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{it.item_name}</td>
                    {ACTION_COLS.map((a) => (
                      <td
                        key={a.key}
                        className={`px-3 py-2 text-right tabular-nums ${
                          it.totals[a.key] > 0 ? a.tone : "text-muted-foreground/50"
                        }`}
                      >
                        {it.totals[a.key] || "–"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
