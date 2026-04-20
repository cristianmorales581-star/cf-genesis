import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState, Numeric } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { fmtDate, fmtPct } from "@/lib/format";
import { z } from "zod";
import { useAuth } from "@/contexts/AuthContext";

interface Cedente { id: string; razon_social: string; activo: boolean; }
interface Programa {
  id: string; codigo_pcfb: string; cedente_id: string; linea: string | null;
  plazo_ejecucion_dias: number; descuento_base: number; plazo_cuotas_dias: number;
  fecha_inicio: string; fecha_vencimiento: string; contrato_cesion: string | null; activo: boolean;
  cedentes?: { razon_social: string };
}

const schema = z.object({
  codigo_pcfb: z.string().trim().min(3, "Código requerido").max(60, "Máx 60 caracteres")
    .regex(/^[A-Z0-9\-]+$/, "Solo mayúsculas, números y guiones (ej: CFB-CASHEA-2025-C)"),
  cedente_id: z.string().uuid("Selecciona un cedente"),
  linea: z.string().trim().max(60).optional().or(z.literal("")),
  plazo_ejecucion_dias: z.number().int().positive().max(3650),
  descuento_base_pct: z.number().min(0, "Mínimo 0%").max(20, "Máximo 20%"),
  plazo_cuotas_dias: z.number().int().positive().max(3650),
  fecha_inicio: z.string(),
  contrato_cesion: z.string().trim().max(80).optional().or(z.literal("")),
});

const empty = {
  codigo_pcfb: "", cedente_id: "", linea: "PRINCIPAL",
  plazo_ejecucion_dias: 360, descuento_base_pct: 4, plazo_cuotas_dias: 30,
  fecha_inicio: new Date().toISOString().slice(0, 10),
  contrato_cesion: "",
};

export default function Programas() {
  const { isOperador } = useAuth();
  const [rows, setRows] = useState<Programa[]>([]);
  const [cedentes, setCedentes] = useState<Cedente[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Programa | null>(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [{ data: progs }, { data: ceds }] = await Promise.all([
      supabase.from("programas").select("*, cedentes(razon_social)").order("codigo_pcfb"),
      supabase.from("cedentes").select("id, razon_social, activo").eq("activo", true).order("razon_social"),
    ]);
    setRows((progs ?? []) as Programa[]);
    setCedentes(ceds ?? []);
  }
  useEffect(() => { load(); }, []);

  function openNew() { setEditing(null); setForm(empty); setOpen(true); }
  function openEdit(p: Programa) {
    setEditing(p);
    setForm({
      codigo_pcfb: p.codigo_pcfb, cedente_id: p.cedente_id, linea: p.linea ?? "",
      plazo_ejecucion_dias: p.plazo_ejecucion_dias, descuento_base: Number(p.descuento_base),
      plazo_cuotas_dias: p.plazo_cuotas_dias, fecha_inicio: p.fecha_inicio,
      fecha_vencimiento: p.fecha_vencimiento, contrato_cesion: p.contrato_cesion ?? "",
    });
    setOpen(true);
  }

  async function save() {
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setBusy(true);
    const payload = {
      codigo_pcfb: parsed.data.codigo_pcfb,
      cedente_id: parsed.data.cedente_id,
      linea: parsed.data.linea || null,
      plazo_ejecucion_dias: parsed.data.plazo_ejecucion_dias,
      descuento_base: parsed.data.descuento_base,
      plazo_cuotas_dias: parsed.data.plazo_cuotas_dias,
      fecha_inicio: parsed.data.fecha_inicio,
      fecha_vencimiento: parsed.data.fecha_vencimiento,
      contrato_cesion: parsed.data.contrato_cesion || null,
    };
    if (editing) {
      const { error } = await supabase.from("programas").update(payload).eq("id", editing.id);
      if (error) toast.error(error.message); else { await logAudit({ action: "update", resource_type: "programa", resource_id: editing.id, details: payload }); toast.success("Programa actualizado"); }
    } else {
      const { data, error } = await supabase.from("programas").insert(payload).select().single();
      if (error) toast.error(error.message); else { await logAudit({ action: "create", resource_type: "programa", resource_id: data.id, details: payload }); toast.success("Programa creado"); }
    }
    setBusy(false); setOpen(false); load();
  }

  async function toggle(p: Programa) {
    const newVal = !p.activo;
    const { error } = await supabase.from("programas").update({ activo: newVal }).eq("id", p.id);
    if (error) toast.error(error.message);
    else { await logAudit({ action: newVal ? "enable" : "disable", resource_type: "programa", resource_id: p.id }); load(); }
  }

  return (
    <>
      <PageHeader title="Programas" subtitle="Programas marco de Certificados de Financiamiento Bursátil">
        {isOperador && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew} className="bg-gradient-primary shadow-elegant hover:opacity-95">
                <Plus className="h-4 w-4 mr-1.5" /> Nuevo Programa
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle className="font-display text-xl text-primary">{editing ? "Editar" : "Nuevo"} Programa</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-4 py-2">
                <div><Label>Código P-CFB *</Label><Input value={form.codigo_pcfb} onChange={e => setForm({ ...form, codigo_pcfb: e.target.value.toUpperCase() })} placeholder="P-CFB-001" maxLength={30} /></div>
                <div><Label>Línea</Label>
                  <Select value={form.linea} onValueChange={v => setForm({ ...form, linea: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PRINCIPAL">PRINCIPAL</SelectItem>
                      <SelectItem value="COTIDIANA">COTIDIANA</SelectItem>
                      <SelectItem value="ESPECIAL">ESPECIAL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Cedente *</Label>
                  <Select value={form.cedente_id} onValueChange={v => setForm({ ...form, cedente_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar cedente" /></SelectTrigger>
                    <SelectContent>
                      {cedentes.map(c => <SelectItem key={c.id} value={c.id}>{c.razon_social}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Plazo Ejecución (días)</Label><Input type="number" value={form.plazo_ejecucion_dias} onChange={e => setForm({ ...form, plazo_ejecucion_dias: parseInt(e.target.value || "0") })} /></div>
                <div><Label>Plazo Cuotas (días)</Label><Input type="number" value={form.plazo_cuotas_dias} onChange={e => setForm({ ...form, plazo_cuotas_dias: parseInt(e.target.value || "0") })} /></div>
                <div><Label>Descuento Base (decimal, máx 0.20)</Label><Input type="number" step="0.0001" value={form.descuento_base} onChange={e => setForm({ ...form, descuento_base: parseFloat(e.target.value || "0") })} /></div>
                <div><Label>Contrato de Cesión</Label><Input value={form.contrato_cesion} onChange={e => setForm({ ...form, contrato_cesion: e.target.value })} placeholder="N° contrato" maxLength={80} /></div>
                <div><Label>Fecha Inicio *</Label><Input type="date" value={form.fecha_inicio} onChange={e => setForm({ ...form, fecha_inicio: e.target.value })} /></div>
                <div><Label>Fecha Vencimiento *</Label><Input type="date" value={form.fecha_vencimiento} onChange={e => setForm({ ...form, fecha_vencimiento: e.target.value })} /></div>
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
        {rows.length === 0 ? <EmptyState title="Sin programas" hint="Crea cedentes y luego un programa para empezar a emitir." /> : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">Código</th>
                <th className="text-left px-5 py-3 font-semibold">Cedente</th>
                <th className="text-left px-5 py-3 font-semibold">Línea</th>
                <th className="text-right px-5 py-3 font-semibold">Desc. Base</th>
                <th className="text-left px-5 py-3 font-semibold">Vigencia</th>
                <th className="text-center px-5 py-3 font-semibold">Activo</th>
                <th className="text-right px-5 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-5 py-3 font-mono text-xs font-semibold text-primary">{p.codigo_pcfb}</td>
                  <td className="px-5 py-3">{p.cedentes?.razon_social ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground text-xs uppercase tracking-wider">{p.linea ?? "—"}</td>
                  <td className="px-5 py-3 text-right"><Numeric>{fmtPct(Number(p.descuento_base), 2)}</Numeric></td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{fmtDate(p.fecha_inicio)} — {fmtDate(p.fecha_vencimiento)}</td>
                  <td className="px-5 py-3 text-center">
                    {isOperador ? <Switch checked={p.activo} onCheckedChange={() => toggle(p)} /> :
                      <span className={p.activo ? "text-success" : "text-muted-foreground"}>{p.activo ? "Sí" : "No"}</span>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {isOperador && <Button size="sm" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>}
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
