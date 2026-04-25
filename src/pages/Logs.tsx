import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { InventoryLog, LogAction, LogItemType } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Hammer,
  Truck,
  Sliders,
  History,
  AlertOctagon,
  User as UserIcon,
  Filter,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = {
  in: ArrowDownToLine,
  out: ArrowUpFromLine,
  assemble: Hammer,
  deliver: Truck,
  adjust: Sliders,
  defective: AlertOctagon,
} as const;

const ACTION_TONE: Record<string, string> = {
  in: "bg-success/15 text-success",
  out: "bg-warning/15 text-warning-foreground",
  assemble: "bg-primary-container text-primary-container-foreground",
  deliver: "bg-accent/15 text-accent",
  adjust: "bg-secondary text-secondary-foreground",
  defective: "bg-destructive/15 text-destructive",
};

const ACTION_OPTIONS: { value: LogAction; label: string }[] = [
  { value: "in", label: "Stock IN" },
  { value: "out", label: "Stock OUT" },
  { value: "assemble", label: "Assembled" },
  { value: "deliver", label: "Delivered" },
  { value: "adjust", label: "Adjust" },
  { value: "defective", label: "Defective" },
];

export default function LogsPage() {
  const { role } = useAuth();
  const isAdmin = role === "admin";

  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { name: string; email: string | null }>>({});
  const [loading, setLoading] = useState(true);

  // Filters (admin only)
  const [actionFilter, setActionFilter] = useState<LogAction | "all">("all");
  const [typeFilter, setTypeFilter] = useState<LogItemType | "all">("all");
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("inventory_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      const list = (data as InventoryLog[]) ?? [];
      setLogs(list);

      const userIds = Array.from(new Set(list.map((l) => l.user_id).filter(Boolean) as string[]));
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", userIds);
        const map: Record<string, { name: string; email: string | null }> = {};
        (profs ?? []).forEach((p) => {
          map[p.id] = { name: p.full_name?.trim() || (p.email ?? "Unknown"), email: p.email };
        });
        setProfiles(map);
      }
      setLoading(false);
    })();
  }, []);

  const employeeOptions = useMemo(() => {
    const ids = Array.from(new Set(logs.map((l) => l.user_id).filter(Boolean) as string[]));
    return ids
      .map((id) => ({ id, name: profiles[id]?.name ?? "Unknown" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [logs, profiles]);

  const filtered = useMemo(() => {
    if (!isAdmin) return logs;
    const fromTs = fromDate ? new Date(fromDate).getTime() : null;
    const toTs = toDate ? new Date(toDate).getTime() + 24 * 60 * 60 * 1000 : null;
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (actionFilter !== "all" && l.action !== actionFilter) return false;
      if (typeFilter !== "all" && l.item_type !== typeFilter) return false;
      if (employeeFilter !== "all" && l.user_id !== employeeFilter) return false;
      const ts = new Date(l.created_at).getTime();
      if (fromTs && ts < fromTs) return false;
      if (toTs && ts >= toTs) return false;
      if (q) {
        const hay = `${l.item_name} ${l.note ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [logs, isAdmin, actionFilter, typeFilter, employeeFilter, search, fromDate, toDate]);

  const clearFilters = () => {
    setActionFilter("all");
    setTypeFilter("all");
    setEmployeeFilter("all");
    setSearch("");
    setFromDate("");
    setToDate("");
  };

  const hasFilters =
    actionFilter !== "all" ||
    typeFilter !== "all" ||
    employeeFilter !== "all" ||
    search.length > 0 ||
    fromDate.length > 0 ||
    toDate.length > 0;

  return (
    <div className="space-y-6 sm:pl-64">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Activity log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Last 300 stock movements{isAdmin ? " · filter by action, employee, item, or date" : ""}.
          </p>
        </div>
        {isAdmin && (
          <div className="text-xs text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{filtered.length}</span> of {logs.length}
          </div>
        )}
      </header>

      {isAdmin && (
        <Card className="shadow-elevation-1">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Filter className="h-4 w-4" /> Filters
              {hasFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-7 gap-1 px-2 text-xs"
                  onClick={clearFilters}
                >
                  <X className="h-3 w-3" /> Clear
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Action</Label>
                <Select value={actionFilter} onValueChange={(v) => setActionFilter(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All actions</SelectItem>
                    {ACTION_OPTIONS.map((a) => (
                      <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Item type</Label>
                <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Components & devices</SelectItem>
                    <SelectItem value="component">Components</SelectItem>
                    <SelectItem value="device">Devices</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Employee</Label>
                <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Everyone</SelectItem>
                    {employeeOptions.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Search item or note</Label>
                <Input
                  placeholder="Item name or note…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="rounded-2xl border border-border bg-surface-elevated p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface-elevated p-10 text-center">
          <History className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold">No activity matches your filters</p>
          <p className="text-xs text-muted-foreground">Try clearing filters or scanning some stock.</p>
        </div>
      ) : (
        <Card className="overflow-hidden shadow-elevation-1">
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {filtered.map((log) => {
                const Icon = ICONS[log.action] ?? Sliders;
                const who = log.user_id ? profiles[log.user_id]?.name ?? "Unknown user" : "System";
                return (
                  <li key={log.id} className="flex items-center gap-3 p-4">
                    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", ACTION_TONE[log.action])}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{log.item_name}</span>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase text-secondary-foreground">
                          {log.item_type}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="font-semibold uppercase tracking-wide">{log.action}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <UserIcon className="h-3 w-3" />
                          {who}
                        </span>
                        <span>·</span>
                        <span>{new Date(log.created_at).toLocaleString()}</span>
                        {log.note ? (
                          <>
                            <span>·</span>
                            <span className="truncate">{log.note}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-lg font-bold tabular-nums">
                      {["out", "deliver", "defective"].includes(log.action) ? "−" : "+"}
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
