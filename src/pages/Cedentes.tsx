import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Upload, Download } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { useAuth } from "@/contexts/AuthContext";

interface Cedente {
  id: string; razon_social: string; rif: string; representante_legal: string | null;
  cargo: string | null; cedula: string | null; nombre_comercial: string | null;
  codigo_cliente: string | null;
  activo: boolean; created_at: string;
}

const schema = z.object({
  razon_social: z.string().trim().min(2, "Razón social requerida").max(200),
  rif: z.string().trim().regex(/^[JGVEPCjgvepc]-?\d{7,9}-?\d?$/, "RIF inválido (ej. J-12345678-9)").max(20),
  representante_legal: z.string().trim().max(150).optional().or(z.literal("")),
  cargo: z.string().trim().max(100).optional().or(z.literal("")),
  cedula: z.string().trim().max(20).optional().or(z.literal("")),
  nombre_comercial: z.string().trim().max(150).optional().or(z.literal("")),
  codigo_cliente: z.string().trim().max(20).optional().or(z.literal("")),
});

const empty = { razon_social: "", rif: "", representante_legal: "", cargo: "", cedula: "", nombre_comercial: "", codigo_cliente: "" };


export default function Cedentes() {
  const { isOperador, isAdmin } = useAuth();
  const [rows, setRows] = useState<Cedente[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cedente | null>(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("cedentes").select("*").order("razon_social");
    setRows(data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function applyRepresentante(target: Cedente, source: Cedente) {
    if (target.id === source.id) return;
    if (!source.representante_legal && !source.cedula && !source.cargo) {
      toast.error("La fila origen no tiene datos de representante para copiar");
      return;
    }
    const payload = {
      representante_legal: source.representante_legal,
      cargo: source.cargo,
      cedula: source.cedula,
    };
    const { error } = await supabase.from("cedentes").update(payload).eq("id", target.id);
    if (error) { toast.error(error.message); return; }
    await logAudit({ action: "update", resource_type: "cedente", resource_id: target.id, details: { copied_from: source.id, ...payload } });
    toast.success(`Representante copiado a ${target.razon_social}`);
    load();
  }

  function openNew() { setEditing(null); setForm(empty); setOpen(true); }
  function openEdit(c: Cedente) {
    setEditing(c);
    setForm({
      razon_social: c.razon_social, rif: c.rif,
      representante_legal: c.representante_legal ?? "",
      cargo: c.cargo ?? "", cedula: c.cedula ?? "",
      nombre_comercial: c.nombre_comercial ?? "",
      codigo_cliente: c.codigo_cliente ?? "",
    });

    setOpen(true);
  }

  async function save() {
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setBusy(true);
    const payload = {
      razon_social: parsed.data.razon_social,
      rif: parsed.data.rif,
      representante_legal: parsed.data.representante_legal || null,
      cargo: parsed.data.cargo || null,
      cedula: parsed.data.cedula || null,
      nombre_comercial: parsed.data.nombre_comercial || null,
      codigo_cliente: parsed.data.codigo_cliente ? parsed.data.codigo_cliente.toUpperCase() : null,
    };

    if (editing) {
      const { error } = await supabase.from("cedentes").update(payload).eq("id", editing.id);
      if (error) toast.error(error.message);
      else { await logAudit({ action: "update", resource_type: "cedente", resource_id: editing.id, details: payload }); toast.success("Cedente actualizado"); }
    } else {
      const { data, error } = await supabase.from("cedentes").insert(payload).select().single();
      if (error) toast.error(error.message);
      else { await logAudit({ action: "create", resource_type: "cedente", resource_id: data.id, details: payload }); toast.success("Cedente creado"); }
    }
    setBusy(false); setOpen(false); load();
  }

  async function toggle(c: Cedente) {
    const newVal = !c.activo;
    const { error } = await supabase.from("cedentes").update({ activo: newVal }).eq("id", c.id);
    if (error) toast.error(error.message);
    else { await logAudit({ action: newVal ? "enable" : "disable", resource_type: "cedente", resource_id: c.id }); load(); }
  }

  function exportCsv() {
    const headers = ["Código Cliente","Razón Social","Nombre Comercial","RIF","Representante Legal","Cargo","Cédula","Activo","Creado"];
    const esc = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    rows.forEach(c => lines.push([
      c.codigo_cliente ?? "", c.razon_social, c.nombre_comercial ?? "", c.rif,
      c.representante_legal ?? "", c.cargo ?? "", c.cedula ?? "",
      c.activo ? "Sí" : "No", new Date(c.created_at).toISOString().slice(0,10),
    ].map(esc).join(",")));

    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cedentes_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader title="Cedentes" subtitle="Empresas emisoras de los programas CFB">
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="h-4 w-4 mr-1.5" /> Exportar CSV
          </Button>
          {isOperador && (
            <>
              <Button asChild variant="outline">
                <Link to="/importar"><Upload className="h-4 w-4 mr-1.5" /> Importar Excel</Link>
              </Button>
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
            </>
          )}
        </div>
      </PageHeader>

      <div className="rounded-lg border border-border bg-card shadow-sm-elegant overflow-hidden">
        {rows.length === 0 ? <EmptyState title="Sin cedentes" hint="Crea el primer cedente para asociarlo a un programa." /> : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">Razón Social</th>
                <th className="text-left px-5 py-3 font-semibold">RIF</th>
                <th className="text-left px-5 py-3 font-semibold">Representante</th>
                <th className="text-left px-5 py-3 font-semibold">Cargo</th>
                <th className="text-left px-5 py-3 font-semibold">Cédula</th>
                <th className="text-center px-5 py-3 font-semibold">Activo</th>
                <th className="text-right px-5 py-3 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(c => {
                const missingCedula = !!c.representante_legal && !c.cedula;
                const isDragOver = dragOverId === c.id;
                return (
                <tr
                  key={c.id}
                  draggable={isOperador && (!!c.representante_legal || !!c.cedula)}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/cedente-id", c.id);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onDragOver={(e) => {
                    if (!isOperador) return;
                    const id = e.dataTransfer.types.includes("text/cedente-id");
                    if (id) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setDragOverId(c.id); }
                  }}
                  onDragLeave={() => setDragOverId(prev => prev === c.id ? null : prev)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverId(null);
                    const srcId = e.dataTransfer.getData("text/cedente-id");
                    const src = rows.find(r => r.id === srcId);
                    if (src) applyRepresentante(c, src);
                  }}
                  className={`border-t border-border hover:bg-secondary/30 ${isOperador ? "cursor-grab" : ""} ${isDragOver ? "bg-primary/10 ring-2 ring-primary/40" : ""}`}
                  title={isOperador ? "Arrastra esta fila sobre otra para copiar representante, cargo y cédula" : undefined}
                >
                  <td className="px-5 py-3">
                    <div className="font-medium text-primary">{c.razon_social}</div>
                    {c.nombre_comercial && <div className="text-xs text-muted-foreground">{c.nombre_comercial}</div>}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs">{c.rif}</td>
                  <td className="px-5 py-3 text-muted-foreground">{c.representante_legal ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground text-xs">{c.cargo ?? "—"}</td>
                  <td className={`px-5 py-3 font-mono text-xs ${missingCedula ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                    {c.cedula ?? (missingCedula ? "⚠ Falta" : "—")}
                  </td>
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
              );})}
            </tbody>
          </table>
        )}
      </div>
      {isOperador && (
        <p className="mt-2 text-xs text-muted-foreground">
          Tip: arrastra una fila sobre otra para copiar <strong>representante legal, cargo y cédula</strong>. Las cédulas faltantes aparecen marcadas en rojo.
        </p>
      )}
    </>
  );
}
