import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader, EmptyState, Pill } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { SECTIONS, ROLE_LABELS } from "@/lib/sections";
import { ShieldCheck, Users as UsersIcon, Save, UserPlus } from "lucide-react";

type Role = "admin" | "backoffice";

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
}

const ROLES: Role[] = ["admin", "backoffice"];

export default function UsuariosAdmin() {
  const { user, reloadPermissions } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [perms, setPerms] = useState<Record<Role, Set<string>>>({
    admin: new Set(),
    backoffice: new Set(),
  });
  const [busy, setBusy] = useState(false);
  const [permsBusy, setPermsBusy] = useState(false);

  async function load() {
    const [{ data: profiles }, { data: rolesData }, { data: permsData }] = await Promise.all([
      supabase.from("profiles").select("id, email, full_name").order("email"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("role_section_permissions").select("role, section"),
    ]);

    const roleByUser = new Map<string, Role>();
    (rolesData ?? []).forEach((r: any) => {
      // admin gana sobre backoffice si hubiera ambos
      const current = roleByUser.get(r.user_id);
      if (r.role === "admin" || !current) roleByUser.set(r.user_id, r.role as Role);
    });

    setUsers(
      (profiles ?? []).map((p: any) => ({
        id: p.id,
        email: p.email,
        full_name: p.full_name,
        role: (roleByUser.get(p.id) ?? "backoffice") as Role,
      }))
    );

    const next: Record<Role, Set<string>> = { admin: new Set(), backoffice: new Set() };
    (permsData ?? []).forEach((p: any) => {
      if (next[p.role as Role]) next[p.role as Role].add(p.section);
    });
    setPerms(next);
  }

  useEffect(() => { load(); }, []);

  async function changeRole(u: UserRow, newRole: Role) {
    if (u.role === newRole) return;
    if (u.id === user?.id && newRole !== "admin") {
      toast.error("No puedes quitarte el rol de administrador a ti mismo.");
      return;
    }
    setBusy(true);
    // borrar roles previos del usuario y asignar el nuevo
    const del = await supabase.from("user_roles").delete().eq("user_id", u.id);
    if (del.error) { toast.error(del.error.message); setBusy(false); return; }
    const ins = await supabase.from("user_roles").insert({ user_id: u.id, role: newRole });
    setBusy(false);
    if (ins.error) { toast.error(ins.error.message); return; }
    toast.success(`Rol de ${u.email} actualizado a ${ROLE_LABELS[newRole]}.`);
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, role: newRole } : x));
    if (u.id === user?.id) await reloadPermissions();
  }

  function togglePerm(role: Role, section: string, checked: boolean) {
    setPerms(prev => {
      const set = new Set(prev[role]);
      if (checked) set.add(section); else set.delete(section);
      return { ...prev, [role]: set };
    });
  }

  async function savePerms(role: Role) {
    setPermsBusy(true);
    const desired = Array.from(perms[role]);
    // estrategia simple: borrar todos los del rol e insertar los actuales
    const del = await supabase.from("role_section_permissions").delete().eq("role", role);
    if (del.error) { toast.error(del.error.message); setPermsBusy(false); return; }
    if (desired.length > 0) {
      const ins = await supabase
        .from("role_section_permissions")
        .insert(desired.map(section => ({ role, section })));
      if (ins.error) { toast.error(ins.error.message); setPermsBusy(false); return; }
    }
    setPermsBusy(false);
    toast.success(`Permisos de ${ROLE_LABELS[role]} guardados.`);
    await reloadPermissions();
  }

  return (
    <div>
      <PageHeader
        title="Usuarios y Accesos"
        subtitle="Asigna roles a los usuarios y controla qué secciones puede ver cada rol."
      />

      <Tabs defaultValue="usuarios" className="w-full">
        <TabsList>
          <TabsTrigger value="usuarios" className="gap-2"><UsersIcon className="h-3.5 w-3.5" /> Usuarios</TabsTrigger>
          <TabsTrigger value="permisos" className="gap-2"><ShieldCheck className="h-3.5 w-3.5" /> Permisos por rol</TabsTrigger>
        </TabsList>

        <TabsContent value="usuarios" className="mt-6">
          {users.length === 0 ? (
            <EmptyState title="Sin usuarios registrados" hint="Cuando alguien se registre, aparecerá aquí." />
          ) : (
            <div className="surface-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.16em] text-muted-foreground border-b border-border">
                    <th className="px-4 py-3 font-semibold">Usuario</th>
                    <th className="px-4 py-3 font-semibold">Correo</th>
                    <th className="px-4 py-3 font-semibold">Rol actual</th>
                    <th className="px-4 py-3 font-semibold w-[220px]">Cambiar rol</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-b border-border/60 hover:bg-secondary/30">
                      <td className="px-4 py-3">{u.full_name ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-3">
                        <Pill tone={u.role === "admin" ? "accent" : "default"}>
                          {ROLE_LABELS[u.role]}
                        </Pill>
                      </td>
                      <td className="px-4 py-3">
                        <Select
                          value={u.role}
                          disabled={busy}
                          onValueChange={(v) => changeRole(u, v as Role)}
                        >
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ROLES.map(r => (
                              <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="permisos" className="mt-6 space-y-8">
          <p className="text-xs text-muted-foreground">
            El rol <strong>Administrador</strong> siempre tiene acceso completo, independientemente de esta lista.
            Los cambios en <strong>Backoffice</strong> afectan a todos los usuarios con ese rol.
          </p>

          {ROLES.map(role => (
            <div key={role} className="surface-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-display text-lg font-semibold">{ROLE_LABELS[role]}</h3>
                  <p className="text-xs text-muted-foreground">
                    Secciones visibles para los usuarios con este rol.
                  </p>
                </div>
                <Button size="sm" onClick={() => savePerms(role)} disabled={permsBusy} className="gap-2">
                  <Save className="h-3.5 w-3.5" /> Guardar
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {SECTIONS.map(s => {
                  const checked = role === "admin" ? true : perms[role].has(s.id);
                  const disabled = role === "admin";
                  return (
                    <label
                      key={s.id}
                      className={`flex items-center gap-3 rounded-md border border-border px-3 py-2 ${disabled ? "opacity-70" : "cursor-pointer hover:bg-secondary/40"}`}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={(v) => togglePerm(role, s.id, Boolean(v))}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{s.label}</div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{s.group}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
