import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { rpcDecideLeaveRequest } from "@/services/supabase/inventory";
import type { LeaveRequest, LeaveType } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CalendarPlus, Check, X, Plane, BedDouble, Coffee } from "lucide-react";
import { cn } from "@/lib/utils";

const TYPE_META: Record<LeaveType, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  annual: { label: "Annual leave", icon: Plane },
  off_day: { label: "Off day", icon: Coffee },
  sick: { label: "Sick leave", icon: BedDouble },
};

export default function LeavesPage() {
  const { user, companyId, isManager } = useAuth();
  const [items, setItems] = useState<(LeaveRequest & { full_name?: string | null; email?: string | null })[]>([]);
  const [loading, setLoading] = useState(true);

  // Form
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [type, setType] = useState<LeaveType>("annual");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from("leave_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    let rows = (data as LeaveRequest[]) ?? [];

    // Manager view: hydrate names
    if (isManager && rows.length > 0) {
      const ids = Array.from(new Set(rows.map((r) => r.user_id)));
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
      rows = rows.map((r) => ({
        ...r,
        full_name: map.get(r.user_id)?.full_name ?? null,
        email: map.get(r.user_id)?.email ?? null,
      }));
    }
    setItems(rows);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, isManager]);

  const submit = async () => {
    if (!user || !companyId) return;
    if (!start || !end) {
      toast.error("Start and end dates required");
      return;
    }
    if (end < start) {
      toast.error("End date must be on or after start date");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("leave_requests").insert({
      company_id: companyId,
      user_id: user.id,
      start_date: start,
      end_date: end,
      leave_type: type,
      reason: reason.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Leave request submitted");
    setStart("");
    setEnd("");
    setReason("");
    refresh();
  };

  const decide = async (id: string, approve: boolean) => {
    try {
      await rpcDecideLeaveRequest(id, approve);
      toast.success(approve ? "Approved" : "Rejected");
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  };

  const myItems = useMemo(() => items.filter((i) => i.user_id === user?.id), [items, user?.id]);
  const teamPending = useMemo(
    () => items.filter((i) => i.status === "pending" && i.user_id !== user?.id),
    [items, user?.id],
  );
  const teamRecent = useMemo(
    () => items.filter((i) => i.status !== "pending" && i.user_id !== user?.id).slice(0, 30),
    [items, user?.id],
  );

  return (
    <div className="space-y-6 sm:pl-64">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Leave & off‑days</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Request annual leave or off‑days. {isManager && "Approve team requests below."}
        </p>
      </header>

      {/* Request form */}
      <Card className="shadow-elevation-2">
        <CardContent className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as LeaveType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_META) as LeaveType[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {TYPE_META[k].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">From</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Reason (optional)</Label>
            <Textarea
              rows={2}
              placeholder="Add context for your manager…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <Button size="lg" className="w-full gap-2" onClick={submit} disabled={submitting}>
            <CalendarPlus className="h-4 w-4" /> Request leave
          </Button>
        </CardContent>
      </Card>

      {/* My requests */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          My requests
        </h2>
        {loading ? (
          <div className="rounded-2xl border border-border bg-surface-elevated p-6 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : myItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface-elevated p-6 text-center text-sm text-muted-foreground">
            No leave requests yet.
          </div>
        ) : (
          <div className="grid gap-2">
            {myItems.map((r) => (
              <LeaveRow key={r.id} r={r} />
            ))}
          </div>
        )}
      </section>

      {isManager && (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Awaiting your approval ({teamPending.length})
            </h2>
            {teamPending.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-surface-elevated p-6 text-center text-sm text-muted-foreground">
                Nothing pending.
              </div>
            ) : (
              <div className="grid gap-2">
                {teamPending.map((r) => (
                  <LeaveRow
                    key={r.id}
                    r={r}
                    showApprove
                    onDecide={decide}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Recently decided
            </h2>
            <div className="grid gap-2">
              {teamRecent.map((r) => (
                <LeaveRow key={r.id} r={r} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function LeaveRow({
  r,
  showApprove,
  onDecide,
}: {
  r: LeaveRequest & { full_name?: string | null; email?: string | null };
  showApprove?: boolean;
  onDecide?: (id: string, approve: boolean) => void;
}) {
  const Meta = TYPE_META[r.leave_type];
  const Icon = Meta.icon;
  return (
    <Card className="shadow-elevation-1">
      <CardContent className="flex flex-wrap items-center gap-3 p-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-container text-primary-container-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {Meta.label}
            <span className="text-muted-foreground">
              · {r.start_date} → {r.end_date}
            </span>
          </div>
          {(r.full_name || r.email) && (
            <div className="text-xs text-muted-foreground">
              {r.full_name ?? r.email}
            </div>
          )}
          {r.reason && <div className="mt-1 text-xs text-muted-foreground">{r.reason}</div>}
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase",
            r.status === "approved"
              ? "bg-success/15 text-success"
              : r.status === "rejected"
              ? "bg-destructive/15 text-destructive"
              : "bg-warning/15 text-warning-foreground",
          )}
        >
          {r.status}
        </span>
        {showApprove && onDecide && (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="gap-1" onClick={() => onDecide(r.id, false)}>
              <X className="h-3.5 w-3.5" /> Reject
            </Button>
            <Button size="sm" className="gap-1" onClick={() => onDecide(r.id, true)}>
              <Check className="h-3.5 w-3.5" /> Approve
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
