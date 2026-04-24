import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Boxes, Clock, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/iotistic-logo.png";

export default function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading, role, roleLoaded, signOut, refreshRole } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-surface">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Boxes className="h-5 w-5 animate-pulse text-primary" />
          <span className="text-sm">Loading workspace…</span>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  // Logged in but no role assigned — pending approval
  if (roleLoaded && !role) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-surface px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface-elevated p-8 text-center shadow-elevation-2">
          <img src={logo} alt="Iotistic" className="mx-auto h-16 w-16" />
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-warning/15 px-3 py-1 text-xs font-semibold text-warning-foreground">
            <Clock className="h-3.5 w-3.5" /> Pending approval
          </div>
          <h1 className="mt-4 text-xl font-semibold">Account waiting for activation</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account <span className="font-medium text-foreground">{user.email}</span> is created but doesn't have access yet. An administrator must assign you a role before you can use the app.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button onClick={refreshRole} variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" /> Check again
            </Button>
            <Button onClick={signOut} variant="ghost" className="gap-2 text-muted-foreground">
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
