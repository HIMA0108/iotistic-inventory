import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { rpcSetUserRole, rpcRemoveUserRole } from "@/services/supabase/inventory";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Users as UsersIcon, ShieldCheck, UserX, Clock } from "lucide-react";
import { Navigate } from "react-router-dom";

interface UserRow {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  role: "admin" | "staff" | null;
}

export default function UsersPage() {
  const { role, roleLoaded, user } = useAuth();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = async () => {
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const roleMap = new Map<string, "admin" | "staff">();
    roles?.forEach((r: any) => roleMap.set(r.user_id, r.role));
    setRows(
      (profiles ?? []).map((p: any) => ({
        ...p,
        role: roleMap.get(p.id) ?? null,
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  if (!roleLoaded) {
    return (
      <div className="rounded-2xl border border-border bg-surface-elevated p-8 text-center text-sm text-muted-foreground sm:pl-64">
        Checking permissions…
      </div>
    );
  }
  if (role !== "admin") return <Navigate to="/" replace />;

  const handleAssign = async (userId: string, newRole: "admin" | "staff" | "none") => {
    setBusyId(userId);
    try {
      if (newRole === "none") await rpcRemoveUserRole(userId);
      else await rpcSetUserRole(userId, newRole);
      toast.success("Role updated");
      await refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update role");
    } finally {
      setBusyId(null);
    }
  };

  const pending = rows.filter((r) => !r.role);
  const active = rows.filter((r) => r.role);

  return (
    <div className="space-y-6 sm:pl-64">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">Approve new signups and manage team roles.</p>
      </header>

      {loading ? (
        <div className="rounded-2xl border border-border bg-surface-elevated p-8 text-center text-sm text-muted-foreground">
          Loading users…
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-warning-foreground" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Pending approval ({pending.length})
              </h2>
            </div>
            {pending.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No pending users.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {pending.map((u) => (
                  <UserCard
                    key={u.id}
                    u={u}
                    isSelf={u.id === user?.id}
                    busy={busyId === u.id}
                    onAssign={handleAssign}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-success" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Active members ({active.length})
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {active.map((u) => (
                <UserCard
                  key={u.id}
                  u={u}
                  isSelf={u.id === user?.id}
                  busy={busyId === u.id}
                  onAssign={handleAssign}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function UserCard({
  u,
  isSelf,
  busy,
  onAssign,
}: {
  u: UserRow;
  isSelf: boolean;
  busy: boolean;
  onAssign: (id: string, role: "admin" | "staff" | "none") => void;
}) {
  return (
    <Card className="shadow-elevation-1">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-container text-primary-container-foreground">
          <UsersIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{u.full_name || u.email || "Unnamed"}</div>
          <div className="truncate text-xs text-muted-foreground">{u.email}</div>
        </div>
        <Select
          value={u.role ?? "none"}
          onValueChange={(v) => onAssign(u.id, v as any)}
          disabled={busy || isSelf}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              <span className="inline-flex items-center gap-1.5"><UserX className="h-3.5 w-3.5" /> No access</span>
            </SelectItem>
            <SelectItem value="staff">Staff</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}
