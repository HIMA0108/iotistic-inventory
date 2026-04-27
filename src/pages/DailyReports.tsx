import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { rpcSubmitDailyReport, type SubmitTask } from "@/services/supabase/inventory";
import type { DailyReport, ReportTask, TaskTemplate } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useReportCompliance } from "@/hooks/useReportCompliance";
import { Plus, X, FileText, CalendarDays, Loader2, CheckCircle2, Pencil } from "lucide-react";

interface TaskRow {
  template_id: string | null;
  task_name: string;
  quantity: number | null;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DailyReportsPage() {
  const { user, companyId, isManager } = useAuth();
  const { blockingDate, refresh: refreshCompliance } = useReportCompliance();

  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [pastReports, setPastReports] = useState<(DailyReport & { tasks: ReportTask[] })[]>([]);
  const [loading, setLoading] = useState(true);

  // form state
  const [reportDate, setReportDate] = useState<string>(blockingDate ?? todayISO());
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<TaskRow[]>([{ template_id: null, task_name: "", quantity: null }]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (blockingDate) setReportDate(blockingDate);
  }, [blockingDate]);

  const refreshAll = async () => {
    if (!user || !companyId) return;
    const [{ data: tpls }, { data: reports }] = await Promise.all([
      supabase
        .from("task_templates")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("sort_order")
        .order("name"),
      supabase
        .from("daily_reports")
        .select("*")
        .eq("user_id", user.id)
        .order("report_date", { ascending: false })
        .limit(30),
    ]);
    setTemplates((tpls as TaskTemplate[]) ?? []);
    const reportList = (reports as DailyReport[]) ?? [];
    if (reportList.length === 0) {
      setPastReports([]);
    } else {
      const ids = reportList.map((r) => r.id);
      const { data: taskData } = await supabase
        .from("report_tasks")
        .select("*")
        .in("report_id", ids);
      const grouped: Record<string, ReportTask[]> = {};
      ((taskData as ReportTask[]) ?? []).forEach((t) => {
        (grouped[t.report_id] ??= []).push(t);
      });
      setPastReports(reportList.map((r) => ({ ...r, tasks: grouped[r.id] ?? [] })));
    }
    setLoading(false);
  };

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, companyId]);

  const updateRow = (idx: number, patch: Partial<TaskRow>) => {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const removeRow = (idx: number) => setRows((rs) => rs.filter((_, i) => i !== idx));
  const addRow = () => setRows((rs) => [...rs, { template_id: null, task_name: "", quantity: null }]);

  const validRows = useMemo(
    () =>
      rows
        .map((r) => ({
          template_id: r.template_id,
          task_name: (r.template_id
            ? templates.find((t) => t.id === r.template_id)?.name
            : r.task_name
          )?.trim() ?? "",
          quantity: r.quantity,
        }))
        .filter((r) => r.task_name.length > 0),
    [rows, templates],
  );

  const askConfirm = () => {
    if (validRows.length === 0) {
      toast.error("Add at least one task");
      return;
    }
    setConfirmOpen(true);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const payload: SubmitTask[] = validRows.map((r) => ({
        template_id: r.template_id || null,
        task_name: r.task_name,
        quantity: r.quantity,
      }));
      await rpcSubmitDailyReport(reportDate, notes.trim() || null, payload);
      toast.success("Report submitted");
      setConfirmOpen(false);
      setNotes("");
      setRows([{ template_id: null, task_name: "", quantity: null }]);
      await Promise.all([refreshAll(), refreshCompliance()]);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  const editReport = (r: DailyReport & { tasks: ReportTask[] }) => {
    setReportDate(r.report_date);
    setNotes(r.notes ?? "");
    setRows(
      r.tasks.length > 0
        ? r.tasks.map((t) => ({
            template_id: t.template_id,
            task_name: t.task_name,
            quantity: t.quantity,
          }))
        : [{ template_id: null, task_name: "", quantity: null }],
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast.info(`Editing report for ${r.report_date}`);
  };

  return (
    <div className="space-y-6 sm:pl-64">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Daily reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Log the tasks you completed today. {blockingDate && `Pending: ${blockingDate}`}
        </p>
      </header>

      {/* Submit form */}
      <Card className="shadow-elevation-2">
        <CardContent className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
            <div className="space-y-1.5">
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                max={todayISO()}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes (optional)</Label>
              <Input
                placeholder="Any additional context for the day…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Tasks completed</Label>
              <Button type="button" size="sm" variant="outline" onClick={addRow} className="gap-1">
                <Plus className="h-3.5 w-3.5" /> Add task
              </Button>
            </div>

            <div className="space-y-2">
              {rows.map((row, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[1fr_100px_auto] gap-2 rounded-xl border border-border bg-surface-elevated p-2"
                >
                  <div className="space-y-1">
                    <Select
                      value={row.template_id ?? "__custom"}
                      onValueChange={(v) =>
                        updateRow(idx, {
                          template_id: v === "__custom" ? null : v,
                          task_name: v === "__custom" ? row.task_name : "",
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pick a task" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                        <SelectItem value="__custom">Custom task…</SelectItem>
                      </SelectContent>
                    </Select>
                    {!row.template_id && (
                      <Input
                        placeholder="Describe the task"
                        value={row.task_name}
                        onChange={(e) => updateRow(idx, { task_name: e.target.value })}
                      />
                    )}
                  </div>
                  <Input
                    type="number"
                    placeholder="Qty"
                    value={row.quantity ?? ""}
                    onChange={(e) =>
                      updateRow(idx, {
                        quantity: e.target.value === "" ? null : Math.max(0, parseInt(e.target.value) || 0),
                      })
                    }
                    className="text-center tabular-nums"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => removeRow(idx)}
                    disabled={rows.length === 1}
                    aria-label="Remove task"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <Button size="lg" className="w-full gap-2" onClick={askConfirm}>
            <FileText className="h-4 w-4" /> Submit daily report
          </Button>
        </CardContent>
      </Card>

      {/* History */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Recent reports
        </h2>
        {loading ? (
          <div className="rounded-2xl border border-border bg-surface-elevated p-6 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : pastReports.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface-elevated p-8 text-center text-sm text-muted-foreground">
            No reports yet. Your submissions will appear here.
          </div>
        ) : (
          <div className="grid gap-3">
            {pastReports.map((r) => (
              <Card key={r.id} className="shadow-elevation-1">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-primary" />
                      <span className="font-semibold">{r.report_date}</span>
                      {r.edited_by && r.edited_by !== r.user_id && (
                        <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-warning-foreground">
                          edited by manager
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1"
                      onClick={() => editReport(r)}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                  </div>
                  {r.notes && (
                    <p className="rounded-lg bg-secondary p-2 text-sm">{r.notes}</p>
                  )}
                  <ul className="space-y-1">
                    {r.tasks.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center justify-between rounded-lg border border-border px-3 py-1.5 text-sm"
                      >
                        <span>{t.task_name}</span>
                        {t.quantity != null && (
                          <span className="font-bold tabular-nums">{t.quantity}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Confirmation */}
      <Dialog open={confirmOpen} onOpenChange={(v) => !submitting && setConfirmOpen(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" /> Confirm submission
            </DialogTitle>
            <DialogDescription>
              Submit the daily report for{" "}
              <span className="font-semibold text-foreground">{reportDate}</span>?
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl bg-secondary p-3">
            <ul className="space-y-1 text-sm">
              {validRows.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span>{r.task_name}</span>
                  {r.quantity != null && <span className="font-bold tabular-nums">{r.quantity}</span>}
                </li>
              ))}
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes, submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
