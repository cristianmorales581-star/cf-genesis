import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "admin" | "backoffice";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  role: Role | null;
  sections: Set<string>;
  loading: boolean;
  isAdmin: boolean;
  isOperador: boolean;
  canAccess: (section: string) => boolean;
  signOut: () => Promise<void>;
  reloadPermissions: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [sections, setSections] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        setTimeout(() => loadRoleAndPerms(newSession.user.id), 0);
      } else {
        setRole(null);
        setSections(new Set());
      }
    });

    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setSession(existing);
      setUser(existing?.user ?? null);
      if (existing?.user) loadRoleAndPerms(existing.user.id);
      else setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadRoleAndPerms(userId: string) {
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .order("role", { ascending: true }) // admin < backoffice
      .limit(1)
      .maybeSingle();
    const r = ((roleRow?.role as Role) ?? "backoffice") as Role;
    setRole(r);

    const { data: perms } = await supabase
      .from("role_section_permissions")
      .select("section")
      .eq("role", r);
    setSections(new Set((perms ?? []).map(p => p.section as string)));
    setLoading(false);
  }

  async function reloadPermissions() {
    if (user) await loadRoleAndPerms(user.id);
  }

  const value = useMemo<AuthCtx>(() => ({
    user, session, role, sections, loading,
    isAdmin: role === "admin",
    isOperador: role === "admin" || role === "backoffice",
    canAccess: (section: string) => role === "admin" || sections.has(section),
    signOut: async () => { await supabase.auth.signOut(); },
    reloadPermissions,
  }), [user, session, role, sections, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
