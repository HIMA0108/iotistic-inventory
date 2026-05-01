import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Upload, Link as LinkIcon, FileSpreadsheet, Trash2 } from "lucide-react";

interface Mapping { name: string; email: string; }
interface ImportRow {
  id: string;
  source_label: string | null;
  status: string;
  inserted_count: number;
  skipped_count: number;
  error_message: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const yearStartISO = () => `${new Date().getUTCFullYear()}-01-01`;

export default function ReportBackfillPage() {
  const { companyId, isManager, user } = useAuth();
  const qc = useQueryClient();

  const [mode, setMode] = useState<"upload" | "url">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [externalUrl, setExternalUrl] = useState("");
  const [periodStart, setPeriodStart] = useState(yearStartISO());
  const [periodEnd, setPeriodEnd] = useState(todayISO());
  const [rawMapping, setRawMapping] = useState("");
  const [mappings, setMappings] = useState<Mapping[]>([{ name: "", email: "" }]);
  const [submitting, setSubmitting] = useState(false);

  const { data: profiles } = useQuery({
    queryKey: ["company-profiles", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase.from("profiles").select("id, full_name, email").eq("company_id", companyId);
      return data ?? [];
    },
    enabled: !!companyId,
  });

  const { data: jobs } = useQuery({
    queryKey: ["report-imports", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("report_imports")
        .select("id, source_label, status, inserted_count, skipped_count, error_message, period_start, period_end, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data ?? []) as ImportRow[];
    },
    enabled: !!companyId,
    refetchInterval: 5000,
  });

  const validMappings = useMemo(
    () => mappings.filter((m) => m.name.trim() && m.email.trim()),
    [mappings],
  );

  function parseRawNames() {
    const names = rawMapping.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    if (names.length === 0) return;
    const next: Mapping[] = names.map((name) => {
      const hit = profiles?.find(
        (p) => (p.full_name ?? "").toLowerCase().trim() === name.toLowerCase(),
      );
      return { name, email: hit?.email ?? "" };
    });
    setMappings(next);
    toast.success(`Loaded ${next.length} names — review the emails before submitting`);
  }

  async function handleSubmit() {
    if (!companyId || !user) return;
    if (validMappings.length === 0) {
      toast.error("Add at least one name + email mapping");
      return;
    }
    if (mode === "url" && !externalUrl.trim()) {
      toast.error("Paste an Excel file URL");
      return;
    }
    if (mode === "upload" && !file) {
      toast.error("Choose an .xlsx file to upload");
      return;
    }

    setSubmitting(true);
    try {
      let storagePath: string | null = null;
      let label: string | null = null;

      if (mode === "upload" && file) {
        const ext = file.name.split(".").pop() || "xlsx";
        storagePath = `${companyId}/${crypto.randomUUID()}.${ext}`;
        label = file.name;
        const { error: upErr } = await supabase.storage
          .from("report-imports")
          .upload(storagePath, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
      } else {
        label = externalUrl;
      }

      const { data, error } = await supabase.functions.invoke("start-report-backfill", {
        body: {
          storage_path: storagePath,
          source_url: mode === "url" ? externalUrl.trim() : null,
          source_label: label,
          period_start: periodStart || null,
          period_end: periodEnd || null,
          name_email_map: validMappings,
        },
      });
      if (error) throw error;

      const unmatched = (data as any)?.unmatched_count ?? 0;
      if (unmatched > 0) {
        toast.warning(`Job started — ${unmatched} email(s) didn't match any user`);
      } else {
        toast.success("Backfill job sent to n8n for processing");
      }
      setFile(null);
      setExternalUrl("");
      setMappings([{ name: "", email: "" }]);
      setRawMapping("");
      qc.invalidateQueries({ queryKey: ["report-imports", companyId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to start backfill");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isManager) {
    return (
      <div className="rounded-xl border border-border bg-surface-elevated p-6 text-sm text-muted-foreground">
        Only managers and admins can run a daily-reports backfill.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Daily reports backfill</h1>
        <p className="text-sm text-muted-foreground">
          Upload an Excel sheet (or paste a link) of historical activity. n8n will analyze it and write a daily report
          for each employee for each working day in the period.
        </p>
      </header>

      <Card className="space-y-5 p-5">
        <div className="flex gap-2">
          <Button
            variant={mode === "upload" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("upload")}
          >
            <Upload className="mr-1.5 h-4 w-4" /> Upload file
          </Button>
          <Button
            variant={mode === "url" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("url")}
          >
            <LinkIcon className="mr-1.5 h-4 w-4" /> Paste link
          </Button>
        </div>

        {mode === "upload" ? (
          <div className="space-y-2">
            <Label htmlFor="xlsx">Excel file (.xlsx)</Label>
            <Input
              id="xlsx"
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                <FileSpreadsheet className="mr-1 inline h-3.5 w-3.5" />
                {file.name} — {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="ext-url">Direct download URL (Google Sheets export, OneDrive, etc.)</Label>
            <Input
              id="ext-url"
              type="url"
              placeholder="https://..."
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
            />
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ps">Period start</Label>
            <Input id="ps" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pe">Period end</Label>
            <Input id="pe" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-secondary/40 p-4">
          <div>
            <h3 className="text-sm font-semibold">Name → Email mapping</h3>
            <p className="text-xs text-muted-foreground">
              Specify which email each name in the Excel belongs to. Paste a list of names below to auto-match
              against your team, then fix any blanks.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="raw">Quick paste names (comma or newline separated)</Label>
            <textarea
              id="raw"
              className="min-h-[70px] w-full rounded-md border border-input bg-background p-2 text-sm"
              placeholder="Ali Ahmed, Mona Saleh, …"
              value={rawMapping}
              onChange={(e) => setRawMapping(e.target.value)}
            />
            <Button size="sm" variant="outline" onClick={parseRawNames} disabled={!rawMapping.trim()}>
              Auto-match against team
            </Button>
          </div>

          <div className="space-y-2">
            {mappings.map((m, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input
                  placeholder="Name as it appears in Excel"
                  value={m.name}
                  onChange={(e) => {
                    const next = [...mappings];
                    next[i] = { ...next[i], name: e.target.value };
                    setMappings(next);
                  }}
                />
                <Input
                  list="company-emails"
                  placeholder="employee@company.com"
                  value={m.email}
                  onChange={(e) => {
                    const next = [...mappings];
                    next[i] = { ...next[i], email: e.target.value };
                    setMappings(next);
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMappings(mappings.filter((_, idx) => idx !== i))}
                  aria-label="Remove mapping"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <datalist id="company-emails">
              {profiles?.map((p) => (
                <option key={p.id} value={p.email ?? ""}>
                  {p.full_name ?? ""}
                </option>
              ))}
            </datalist>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMappings([...mappings, { name: "", email: "" }])}
            >
              + Add row
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            {validMappings.length} valid mapping(s). Rows missing a name or email are ignored.
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send to n8n
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold">Recent imports</h2>
        {!jobs || jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No imports yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {jobs.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <div className="text-sm font-medium">{j.source_label ?? "(no label)"}</div>
                  <div className="text-xs text-muted-foreground">
                    {j.period_start ?? "—"} → {j.period_end ?? "—"} · {new Date(j.created_at).toLocaleString()}
                  </div>
                  {j.error_message && (
                    <div className="mt-1 max-w-xl truncate text-xs text-destructive" title={j.error_message}>
                      {j.error_message}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span
                    className={
                      j.status === "completed"
                        ? "rounded-full bg-success/15 px-2 py-0.5 text-success"
                        : j.status === "failed"
                        ? "rounded-full bg-destructive/15 px-2 py-0.5 text-destructive"
                        : "rounded-full bg-secondary px-2 py-0.5 text-muted-foreground"
                    }
                  >
                    {j.status}
                  </span>
                  <span className="text-muted-foreground">
                    +{j.inserted_count} inserted · {j.skipped_count} skipped
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
