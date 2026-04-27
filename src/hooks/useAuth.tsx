import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/types";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  /** Highest privilege role for routing decisions. */
  role: AppRole | null;
  /** All roles assigned to this user (multi-role support). */
  roles: AppRole[];
  isAdmin: boolean;
  isManager: boolean;
  isStaff: boolean;
  /** Custom job title for display ("QC Specialist") if set. */
  displayTitle: string | null;
  fullName: string | null;
  companyId: string | null;
  loading: boolean;
  roleLoaded: boolean;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function pickPrimary(roles: AppRole[]): AppRole | null {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("manager")) return "manager";
  if (roles.includes("staff")) return "staff";
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [displayTitle, setDisplayTitle] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [roleLoaded, setRoleLoaded] = useState<boolean>(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setRoleLoaded(false);
        setTimeout(() => fetchRoleAndCompany(s.user.id), 0);
      } else {
        setRoles([]);
        setDisplayTitle(null);
        setFullName(null);
        setCompanyId(null);
        setRoleLoaded(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchRoleAndCompany(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function fetchRoleAndCompany(userId: string) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, display_title, full_name")
      .eq("id", userId)
      .maybeSingle();
    setCompanyId(profile?.company_id ?? null);
    setDisplayTitle((profile as any)?.display_title ?? null);
    setFullName((profile as any)?.full_name ?? null);

    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const list = (rolesData?.map((x: any) => x.role) ?? []) as AppRole[];
    setRoles(list);
    setRoleLoaded(true);
  }

  async function refreshRole() {
    if (user) await fetchRoleAndCompany(user.id);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const role = pickPrimary(roles);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        role,
        roles,
        isAdmin: roles.includes("admin"),
        isManager: roles.includes("manager") || roles.includes("admin"),
        isStaff: roles.includes("staff"),
        displayTitle,
        fullName,
        companyId,
        loading,
        roleLoaded,
        signOut,
        refreshRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
