import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { DailyReport, ReportTask, Profile } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  Line,
  LineChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { BarChart3, Users as UsersIcon, ListChecks } from "lucide-react";

interface Row {
  report: DailyReport;
  who: string;
  tasks: ReportTask[];
}

function lastNDates(n: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
  }
  return out;
}

export default function WorkTrackingPage() {
  const { isManager, roleLoaded, companyId } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>(lastNDates(30)[0]);
  const [toDate, setToDate] = useState<string>(lastNDates(1)[0]);

  useEffect(() => {
    if (!companyId) return;
    (async () => {
      setLoading(true);
      const [{ data: profs }, { data: reports }] = await Promise.all([
        supabase.from("profiles").select("*").eq("company_id", companyId),
        supabase
          .from("daily_reports")
          .select("*")
          .eq("company_id", companyId)
          .gte("report_date", fromDate)
          .lte("report_date", toDate)
          .order("report_date", { ascending: false })
          .limit(2000),
      ]);
      const profList = (profs as Profile[]) ?? [];
      setProfiles(profList);
      const repList = (reports as DailyReport[]) ?? [];
      const ids = repList.map((r) => r.id);
      let tasksByReport: Record<string, ReportTask[]> = {};
      if (ids.length > 0) {
        const { data: tasks } = await supabase.from("report_tasks").select("*").in("report_id", ids);
        ((tasks as ReportTask[]) ?? []).forEach((t) => {
          (tasksByReport[t.report_id] ??= []).push(t);
        });
      }
      const profMap = new Map(profList.map((p) => [p.id, p]));
      const merged: Row[] = repList.map((r) => ({
        report: r,
        who:
          profMap.get(r.user_id)?.display_title ??
          profMap.get(r.user_id)?.full_name ??
          profMap.get(r.user_id)?.email ??
          "Unknown",
        tasks: tasksByReport[r.id] ?? [],
      }));
      setRows(merged);
      setLoading(false);
    })();
  }, [companyId, fromDate, toDate]);

  const filtered = useMemo(
    () =>
      employeeFilter === "all"
        ? rows
        : rows.filter((r) => r.report.user_id === employeeFilter),
    [rows, employeeFilter],
  );

  // === Aggregations for charts ===
  const perDay = useMemo(() => {
    const map = new Map<string, { date: string; reports: number; tasks: number; quantity: number }>();
    filtered.forEach((r) => {
      const key = r.report.report_date;
      const cur = map.get(key) ?? { date: key, reports: 0, tasks: 0, quantity: 0 };
      cur.reports += 1;
      cur.tasks += r.tasks.length;
      cur.quantity += r.tasks.reduce((s, t) => s + (t.quantity ?? 0), 0);
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [filtered]);

  const perEmployee = useMemo(() => {
    const map = new Map<string, { name: string; tasks: number; quantity: number; reports: number }>();
    filtered.forEach((r) => {
      const key = r.report.user_id;
      const cur = map.get(key) ?? { name: r.who, tasks: 0, quantity: 0, reports: 0 };
      cur.tasks += r.tasks.length;
      cur.quantity += r.tasks.reduce((s, t) => s + (t.quantity ?? 0), 0);
      cur.reports += 1;
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity);
  }, [filtered]);

  const perTask = useMemo(() => {
    const map = new Map<string, { name: string; count: number; quantity: number }>();
    filtered.forEach((r) =>
      r.tasks.forEach((t) => {
        const cur = map.get(t.task_name) ?? { name: t.task_name, count: 0, quantity: 0 };
        cur.count += 1;
        cur.quantity += t.quantity ?? 0;
        map.set(t.task_name, cur);
      }),
    );
    return Array.from(map.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);
  }, [filtered]);

  if (roleLoaded && !isManager) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6 sm:pl-64">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Work tracking</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Visual feedback on employee output, task frequency and warehouse activity.
        </p>
      </header>

      <Card className="shadow-elevation-1">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Employee</Label>
            <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.display_title || p.full_name || p.email}
                  </SelectItem>
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
        </CardContent>
      </Card>

      {/* Summary tiles */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="Reports" value={filtered.length} icon={BarChart3} />
        <SummaryTile label="Tasks" value={filtered.reduce((s, r) => s + r.tasks.length, 0)} icon={ListChecks} />
        <SummaryTile
          label="Total quantity"
          value={filtered.reduce((s, r) => s + r.tasks.reduce((q, t) => q + (t.quantity ?? 0), 0), 0)}
          icon={BarChart3}
        />
        <SummaryTile label="Active employees" value={perEmployee.length} icon={UsersIcon} />
      </section>

      {/* Charts */}
      <Card className="shadow-elevation-1">
        <CardContent className="space-y-2 p-4">
          <h2 className="text-sm font-semibold">Daily activity</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={perDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="reports" stroke="hsl(var(--primary))" name="Reports" />
                <Line type="monotone" dataKey="tasks" stroke="hsl(var(--accent))" name="Tasks" />
                <Line type="monotone" dataKey="quantity" stroke="hsl(var(--success))" name="Quantity" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="shadow-elevation-1">
          <CardContent className="space-y-2 p-4">
            <h2 className="text-sm font-semibold">Output by employee (quantity)</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perEmployee}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-15} textAnchor="end" height={50} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="quantity" fill="hsl(var(--primary))" name="Quantity" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-elevation-1">
          <CardContent className="space-y-2 p-4">
            <h2 className="text-sm font-semibold">Top tasks</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perTask}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-15} textAnchor="end" height={50} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--accent))" name="Times performed" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed grid */}
      <Card className="shadow-elevation-1">
        <CardContent className="p-0">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">All reports</div>
          {loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No reports in this range.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-left">Employee</th>
                    <th className="px-4 py-2 text-left">Tasks</th>
                    <th className="px-4 py-2 text-right">Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.report.id} className="border-t border-border align-top">
                      <td className="px-4 py-2 font-medium">{r.report.report_date}</td>
                      <td className="px-4 py-2">{r.who}</td>
                      <td className="px-4 py-2">
                        <ul className="space-y-0.5">
                          {r.tasks.map((t) => (
                            <li key={t.id} className="flex items-center gap-2">
                              <span>{t.task_name}</span>
                              {t.quantity != null && (
                                <span className="rounded bg-secondary px-1.5 text-xs font-semibold">
                                  ×{t.quantity}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-4 py-2 text-right font-bold tabular-nums">
                        {r.tasks.reduce((s, t) => s + (t.quantity ?? 0), 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="shadow-elevation-1">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-container text-primary-container-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
