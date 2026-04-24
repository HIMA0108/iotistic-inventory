import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/types";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  companyId: string | null;
  loading: boolean;
  roleLoaded: boolean;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
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
        setRole(null);
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
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();
    setCompanyId(profile?.company_id ?? null);

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const r = roles?.map((x) => x.role) ?? [];
    setRole(r.includes("admin" as AppRole) ? "admin" : r.includes("staff" as AppRole) ? "staff" : null);
    setRoleLoaded(true);
  }

  async function refreshRole() {
    if (user) await fetchRoleAndCompany(user.id);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ user, session, role, companyId, loading, roleLoaded, signOut, refreshRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
