import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Boxes } from "lucide-react";

export default function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

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
  return <>{children}</>;
}
