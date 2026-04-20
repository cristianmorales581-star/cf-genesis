import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { useAuth } from "@/contexts/AuthContext";

interface Cedente {
  id: string; razon_social: string; rif: string; representante_legal: string | null;
  cargo: string | null; cedula: string | null; nombre_comercial: string | null;
  activo: boolean; created_at: string;
}

const schema = z.object({
  razon_social: z.string().trim().min(2, "Razón social requerida").max(200),
  rif: z.string().trim().regex(/^[JGVEPCjgvepc]-?\d{7,9}-?\d?$/, "RIF inválido (ej. J-12345678-9)").max(20),
  representante_legal: z.string().trim().max(150).optional().or(z.literal("")),
  cargo: z.string().trim().max(100).optional().or(z.literal("")),
  cedula: z.string().trim().max(20).optional().or(z.literal("")),
  nombre_comercial: z.string().trim().max(150).optional().or(z.literal("")),
});

const empty = { razon_social: "", rif: "", representante_legal: "", cargo: "", cedula: "", nombre_comercial: "" };

export default function Cedentes() {
  const { isOperador, isAdmin } = useAuth();
  const [rows, setRows] = useState<Cedente[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cedente | null>(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase.from("cedentes").select("*").order("razon_social");
    setRows(data ?? []);
  }
  useEffect(() => { load(); }, []);

  function openNew() { setEditing(null); setForm(empty); setOpen(true); }
  function openEdit(c: Cedente) {
    setEditing(c);
    setForm({
      razon_social: c.razon_social, rif: c.rif,
      representante_legal: c.representante_legal ?? "",
      cargo: c.cargo ?? "", cedula: c.cedula ?? "",
      nombre_comercial: c.nombre_comercial ?? "",
    });
    setOpen(true);
  }

  async function save() {
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setBusy(true);
    if (editing) {
      const { error } = await supabase.from("cedentes").update(parsed.data).eq("id", editing.id);
      if (error) toast.error(error.message);
      else { await logAudit({ action: "update", resource_type: "cedente", resource_id: editing.id, details: parsed.data }); toast.success("Cedente actualizado"); }
    } else {
      const { data, error } = await supabase.from("cedentes").insert(parsed.data).select().single();
      if (error) toast.error(error.message);
      else { await logAudit({ action: "create", resource_type: "cedente", resource_id: data.id, details: parsed.data }); toast.success("Cedente creado"); }
    }
    setBusy(false); setOpen(false); load();
  }

  async function toggle(c: Cedente) {
    const newVal = !c.activo;
    const { error } = await supabase.from("cedentes").update({ activo: newVal }).eq("id", c.id);
    if (error) toast.error(error.message);
    else { await logAudit({ action: newVal ? "enable" : "disable", resource_type: "cedente", resource_id: c.id }); load(); }
  }

  return (
    <>
      <PageHeader title="Cedentes" subtitle="Empresas emisoras de los programas CFB">
        {isOperador && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew} className="bg-gradient-primary shadow-elegant hover:opacity-95">
                <Plus className="h-4 w-4 mr-1.5" /> Nuevo Cedente
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-display text-xl text-primary">
                  {editing ? "Editar Cedente" : "Nuevo Cedente"}
                </DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div><Label>Razón Social *</Label><Input value={form.razon_social} onChange={e => setForm({ ...form, razon_social: e.target.value })} maxLength={200} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>RIF *</Label><Input value={form.rif} onChange={e => setForm({ ...form, rif: e.target.value.toUpperCase() })} placeholder="J-12345678-9" maxLength={20} /></div>
                  <div><Label>Nombre Comercial</Label><Input value={form.nombre_comercial} onChange={e => setForm({ ...form, nombre_comercial: e.target.value })} maxLength={150} /></div>
                </div>
                <div><Label>Representante Legal</Label><Input value={form.representante_legal} onChange={e => setForm({ ...form, representante_legal: e.target.value })} maxLength={150} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Cargo</Label><Input value={form.cargo} onChange={e => setForm({ ...form, cargo: e.target.value })} maxLength={100} /></div>
                  <div><Label>Cédula</Label><Input value={form.cedula} onChange={e => setForm({ ...form, cedula: e.target.value })} placeholder="V-12345678" maxLength={20} /></div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={save} disabled={busy} className="bg-gradient-primary">{busy ? "Guardando…" : "Guardar"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </PageHeader>

      <div className="rounded-lg border border-border bg-card shadow-sm-elegant overflow-hidden">
        {rows.length === 0 ? <EmptyState title="Sin cedentes" hint="Crea el primer cedente para asociarlo a un programa." /> : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">Razón Social</th>
                <th className="text-left px-5 py-3 font-semibold">RIF</th>
                <th className="text-left px-5 py-3 font-semibold">Representante</th>
                <th className="text-center px-5 py-3 font-semibold">Activo</th>
                <th className="text-right px-5 py-3 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(c => (
                <tr key={c.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-5 py-3">
                    <div className="font-medium text-primary">{c.razon_social}</div>
                    {c.nombre_comercial && <div className="text-xs text-muted-foreground">{c.nombre_comercial}</div>}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs">{c.rif}</td>
                  <td className="px-5 py-3 text-muted-foreground">{c.representante_legal ?? "—"}</td>
                  <td className="px-5 py-3 text-center">
                    {(isOperador || isAdmin) ? (
                      <Switch checked={c.activo} onCheckedChange={() => toggle(c)} />
                    ) : (
                      <span className={c.activo ? "text-success" : "text-muted-foreground"}>{c.activo ? "Sí" : "No"}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {isOperador && (
                      <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
