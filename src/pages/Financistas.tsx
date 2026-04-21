import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Upload } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { useAuth } from "@/contexts/AuthContext";

interface Financista {
  id: string; razon_social: string; rif: string | null;
  tipo: "natural" | "juridica"; representante_legal: string | null;
  cargo: string | null; cedula: string | null; correo: string | null;
  celular: string | null; activo: boolean;
}

const schema = z.object({
  razon_social: z.string().trim().min(2).max(200),
  rif: z.string().trim().max(20).optional().or(z.literal("")),
  tipo: z.enum(["natural", "juridica"]),
  representante_legal: z.string().trim().max(150).optional().or(z.literal("")),
  cargo: z.string().trim().max(100).optional().or(z.literal("")),
  cedula: z.string().trim().max(20).optional().or(z.literal("")),
  correo: z.string().trim().email("Correo inválido").max(255).optional().or(z.literal("")),
  celular: z.string().trim().max(30).optional().or(z.literal("")),
});

type FormState = {
  razon_social: string; rif: string; tipo: "natural" | "juridica";
  representante_legal: string; cargo: string; cedula: string; correo: string; celular: string;
};
const empty: FormState = { razon_social: "", rif: "", tipo: "juridica", representante_legal: "", cargo: "", cedula: "", correo: "", celular: "" };

export default function Financistas() {
  const { isOperador } = useAuth();
  const [rows, setRows] = useState<Financista[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Financista | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase.from("financistas").select("*").order("razon_social");
    setRows((data ?? []) as Financista[]);
  }
  useEffect(() => { load(); }, []);

  function openNew() { setEditing(null); setForm(empty); setOpen(true); }
  function openEdit(f: Financista) {
    setEditing(f);
    setForm({
      razon_social: f.razon_social, rif: f.rif ?? "", tipo: f.tipo,
      representante_legal: f.representante_legal ?? "", cargo: f.cargo ?? "",
      cedula: f.cedula ?? "", correo: f.correo ?? "", celular: f.celular ?? "",
    });
    setOpen(true);
  }

  async function save() {
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setBusy(true);
    const payload = {
      razon_social: parsed.data.razon_social,
      rif: parsed.data.rif || null,
      tipo: parsed.data.tipo,
      representante_legal: parsed.data.representante_legal || null,
      cargo: parsed.data.cargo || null,
      cedula: parsed.data.cedula || null,
      correo: parsed.data.correo || null,
      celular: parsed.data.celular || null,
    };
    if (editing) {
      const { error } = await supabase.from("financistas").update(payload).eq("id", editing.id);
      if (error) toast.error(error.message); else { await logAudit({ action: "update", resource_type: "financista", resource_id: editing.id, details: payload }); toast.success("Financista actualizado"); }
    } else {
      const { data, error } = await supabase.from("financistas").insert(payload).select().single();
      if (error) toast.error(error.message); else { await logAudit({ action: "create", resource_type: "financista", resource_id: data.id, details: payload }); toast.success("Financista creado"); }
    }
    setBusy(false); setOpen(false); load();
  }

  async function toggle(f: Financista) {
    const newVal = !f.activo;
    const { error } = await supabase.from("financistas").update({ activo: newVal }).eq("id", f.id);
    if (error) toast.error(error.message);
    else { await logAudit({ action: newVal ? "enable" : "disable", resource_type: "financista", resource_id: f.id }); load(); }
  }

  return (
    <>
      <PageHeader title="Financistas" subtitle="Personas o entidades que colocan capital en cada emisión">
        {isOperador && (
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/importar"><Upload className="h-4 w-4 mr-1.5" /> Importar Excel</Link>
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button onClick={openNew} className="bg-gradient-primary shadow-elegant hover:opacity-95">
                  <Plus className="h-4 w-4 mr-1.5" /> Nuevo Financista
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle className="font-display text-xl text-primary">{editing ? "Editar" : "Nuevo"} Financista</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Tipo *</Label>
                      <Select value={form.tipo} onValueChange={(v: "natural" | "juridica") => setForm({ ...form, tipo: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="juridica">Persona Jurídica</SelectItem>
                          <SelectItem value="natural">Persona Natural</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>RIF / Cédula</Label><Input value={form.rif} onChange={e => setForm({ ...form, rif: e.target.value.toUpperCase() })} maxLength={20} /></div>
                  </div>
                  <div><Label>Razón Social / Nombre *</Label><Input value={form.razon_social} onChange={e => setForm({ ...form, razon_social: e.target.value })} maxLength={200} /></div>
                  {form.tipo === "juridica" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Representante</Label><Input value={form.representante_legal} onChange={e => setForm({ ...form, representante_legal: e.target.value })} maxLength={150} /></div>
                      <div><Label>Cargo</Label><Input value={form.cargo} onChange={e => setForm({ ...form, cargo: e.target.value })} maxLength={100} /></div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Correo</Label><Input type="email" value={form.correo} onChange={e => setForm({ ...form, correo: e.target.value })} maxLength={255} /></div>
                    <div><Label>Celular</Label><Input value={form.celular} onChange={e => setForm({ ...form, celular: e.target.value })} maxLength={30} /></div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button onClick={save} disabled={busy} className="bg-gradient-primary">{busy ? "Guardando…" : "Guardar"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </PageHeader>

      <div className="rounded-lg border border-border bg-card shadow-sm-elegant overflow-hidden">
        {rows.length === 0 ? <EmptyState title="Sin financistas" /> : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">Nombre / Razón Social</th>
                <th className="text-left px-5 py-3 font-semibold">Tipo</th>
                <th className="text-left px-5 py-3 font-semibold">RIF / C.I.</th>
                <th className="text-left px-5 py-3 font-semibold">Contacto</th>
                <th className="text-center px-5 py-3 font-semibold">Activo</th>
                <th className="text-right px-5 py-3 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(f => (
                <tr key={f.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-5 py-3 font-medium text-primary">{f.razon_social}</td>
                  <td className="px-5 py-3 capitalize text-muted-foreground">{f.tipo}</td>
                  <td className="px-5 py-3 font-mono text-xs">{f.rif ?? "—"}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {f.correo && <div>{f.correo}</div>}
                    {f.celular && <div>{f.celular}</div>}
                  </td>
                  <td className="px-5 py-3 text-center">
                    {isOperador ? <Switch checked={f.activo} onCheckedChange={() => toggle(f)} /> :
                      <span className={f.activo ? "text-success" : "text-muted-foreground"}>{f.activo ? "Sí" : "No"}</span>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {isOperador && <Button size="sm" variant="ghost" onClick={() => openEdit(f)}><Pencil className="h-3.5 w-3.5" /></Button>}
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
