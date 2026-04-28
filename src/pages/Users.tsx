import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { setUserRoles, rpcRemoveUserRole } from "@/services/supabase/inventory";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Users as UsersIcon, ShieldCheck, Clock, Pencil, Loader2 } from "lucide-react";
import { Navigate } from "react-router-dom";
import type { AppRole } from "@/types";

interface UserRow {
  id: string;
  email: string | null;
  full_name: string | null;
  display_title: string | null;
  created_at: string;
  roles: AppRole[];
}

export default function UsersPage() {
  const { role, roleLoaded, user } = useAuth();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<UserRow | null>(null);

  const refresh = async () => {
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, display_title, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const roleMap = new Map<string, AppRole[]>();
    roles?.forEach((r: any) => {
      const list = roleMap.get(r.user_id) ?? [];
      list.push(r.role);
      roleMap.set(r.user_id, list);
    });
    setRows(
      (profiles ?? []).map((p: any) => ({
        ...p,
        roles: roleMap.get(p.id) ?? [],
      })),
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

  const pending = rows.filter((r) => r.roles.length === 0);
  const active = rows.filter((r) => r.roles.length > 0);

  return (
    <div className="space-y-6 sm:pl-64">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Approve new signups, assign one or more roles, and set job titles.
        </p>
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
                  <UserCard key={u.id} u={u} isSelf={u.id === user?.id} onEdit={() => setEditing(u)} />
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
                <UserCard key={u.id} u={u} isSelf={u.id === user?.id} onEdit={() => setEditing(u)} />
              ))}
            </div>
          </section>
        </>
      )}

      <EditUserDialog
        user={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refresh();
        }}
      />
    </div>
  );
}

function roleBadge(r: AppRole) {
  const cls =
    r === "admin"
      ? "bg-primary/15 text-primary"
      : r === "manager"
        ? "bg-accent/20 text-accent"
        : "bg-success/15 text-success";
  return (
    <span key={r} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${cls}`}>
      {r}
    </span>
  );
}

function UserCard({
  u,
  isSelf,
  onEdit,
}: {
  u: UserRow;
  isSelf: boolean;
  onEdit: () => void;
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
          {u.display_title && (
            <div className="mt-0.5 truncate text-[11px] italic text-muted-foreground">{u.display_title}</div>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {u.roles.length === 0 ? (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                pending
              </span>
            ) : (
              u.roles.map(roleBadge)
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onEdit} disabled={isSelf} title={isSelf ? "Can't edit yourself" : "Edit user"}>
          <Pencil className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

const ALL_ROLES: AppRole[] = ["admin", "manager", "staff"];

function EditUserDialog({
  user,
  onClose,
  onSaved,
}: {
  user: UserRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [roles, setRolesState] = useState<AppRole[]>([]);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setRolesState([...user.roles]);
      setTitle(user.display_title ?? "");
    }
  }, [user]);

  if (!user) return null;

  const toggle = (r: AppRole) => {
    setRolesState((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Update display_title
      const { error: pErr } = await supabase
        .from("profiles")
        .update({ display_title: title.trim() || null })
        .eq("id", user.id);
      if (pErr) throw pErr;

      // Update roles
      if (roles.length === 0) {
        await rpcRemoveUserRole(user.id);
      } else {
        await setUserRoles(user.id, roles);
      }
      toast.success("User updated");
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update user");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!user} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {user.full_name || user.email}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Display title</Label>
            <Input
              id="title"
              placeholder="e.g. QC Specialist"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">Shown in the header instead of the role.</p>
          </div>
          <div className="space-y-2">
            <Label>Roles</Label>
            <div className="space-y-2 rounded-lg border border-border p-3">
              {ALL_ROLES.map((r) => (
                <label key={r} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={roles.includes(r)}
                    onCheckedChange={() => toggle(r)}
                  />
                  <span className="font-medium capitalize">{r}</span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Users can have multiple roles (e.g. Admin + Staff). Leaving all unchecked sets the user back to "pending".
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
