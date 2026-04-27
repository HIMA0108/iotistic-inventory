import { ReactNode } from "react";
import { useLocation, Navigate, Link } from "react-router-dom";
import { useReportCompliance } from "@/hooks/useReportCompliance";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, FileText, History as HistoryIcon } from "lucide-react";

const ALLOWED_PATHS_WHEN_BLOCKED = ["/reports", "/logs"];

/**
 * Wraps protected routes. If the current Staff user is missing yesterday's
 * report, only Activity (/logs) and Daily Reports (/reports) remain reachable.
 */
export default function ComplianceGate({ children }: { children: ReactNode }) {
  const { roleLoaded } = useAuth();
  const { loading, blockingDate } = useReportCompliance();
  const loc = useLocation();

  if (!roleLoaded || loading) return <>{children}</>;
  if (!blockingDate) return <>{children}</>;

  const onAllowedPath = ALLOWED_PATHS_WHEN_BLOCKED.some((p) =>
    loc.pathname === p || loc.pathname.startsWith(p + "/"),
  );

  if (onAllowedPath) {
    return (
      <>
        <Card className="mb-4 border-warning/40 bg-warning/5 shadow-elevation-1 sm:ml-64">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning-foreground" />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-warning-foreground">Daily report missing</p>
              <p className="mt-1 text-muted-foreground">
                You haven't submitted your report for{" "}
                <span className="font-medium text-foreground">{blockingDate}</span>. Submit it to
                unlock the rest of the app.
              </p>
            </div>
          </CardContent>
        </Card>
        {children}
      </>
    );
  }

  // Force user back to the reports page
  return (
    <div className="mx-auto max-w-xl space-y-4 sm:pl-64">
      <Card className="border-warning/40 bg-warning/5 shadow-elevation-2">
        <CardContent className="space-y-4 p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning/15">
            <AlertTriangle className="h-6 w-6 text-warning-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Submit yesterday's report first</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your access is paused until you fill out the daily report for{" "}
              <span className="font-medium text-foreground">{blockingDate}</span>.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link
              to="/reports"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-elevation-1"
            >
              <FileText className="h-4 w-4" /> Open Daily Reports
            </Link>
            <Link
              to="/logs"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm font-medium"
            >
              <HistoryIcon className="h-4 w-4" /> View Activity
            </Link>
          </div>
        </CardContent>
      </Card>
      <Navigate to="/reports" replace state={{ from: loc.pathname }} />
    </div>
  );
}
