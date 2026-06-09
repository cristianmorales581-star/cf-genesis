import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState, Numeric, Pill } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Upload, Trash2, Search, Percent } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { fmtDate, fmtPct, addDaysISO } from "@/lib/format";
import { z } from "zod";
import { useAuth } from "@/contexts/AuthContext";

interface Cedente { id: string; razon_social: string; activo: boolean; }
interface Descuento { id: string; descuento: number; etiqueta: string | null; es_default: boolean; activo: boolean; }
interface Programa {
  id: string; codigo_pcfb: string; cedente_id: string; linea: string | null;
  plazo_ejecucion_dias: number; descuento_base: number; plazo_cuotas_dias: number;
  fecha_inicio: string; fecha_vencimiento: string; contrato_cesion: string | null; activo: boolean;
  estado: "activa" | "vencida" | "inactiva";
  cedentes?: { razon_social: string };
  programa_descuentos?: Descuento[];
}

const schema = z.object({
  codigo_pcfb: z.string().trim().min(3, "Código requerido").max(60, "Máx 60 caracteres")
    .regex(/^[A-Z0-9-]+$/, "Solo mayúsculas, números y guiones (ej: CFB-CASHEA-2025-C)"),
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
  const { isOperador, isAdmin } = useAuth();
  const [rows, setRows] = useState<Programa[]>([]);
  const [cedentes, setCedentes] = useState<Cedente[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Programa | null>(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<"todos" | "activa" | "vencida" | "inactiva">("todos");
  const [selected, setSelected] = useState<string[]>([]);
  const [descOpen, setDescOpen] = useState(false);
  const [descPrograma, setDescPrograma] = useState<Programa | null>(null);

  async function load() {
    // Refresca estados automáticamente (marca vencidos)
    try { await supabase.rpc("refresh_programas_estado"); } catch { /* no bloquea la carga */ }

    const [{ data: progs, error: progsError }, { data: descuentos, error: descError }, { data: ceds, error: cedsError }] = await Promise.all([
      supabase.from("programas").select("*").order("codigo_pcfb"),
      supabase.from("programa_descuentos").select("id, programa_id, descuento, etiqueta, es_default, activo"),
      supabase.from("cedentes").select("id, razon_social, activo").order("razon_social"),
    ]);
    if (progsError) toast.error(`Error cargando programas: ${progsError.message}`);
    if (descError) toast.error(`Error cargando descuentos: ${descError.message}`);
    if (cedsError) toast.error(`Error cargando cedentes: ${cedsError.message}`);

    const descuentosByPrograma = new Map<string, Descuento[]>();
    (descuentos ?? []).forEach(d => {
      const item = d as Descuento & { programa_id: string };
      descuentosByPrograma.set(item.programa_id, [...(descuentosByPrograma.get(item.programa_id) ?? []), item]);
    });
    const cedentesById = new Map((ceds ?? []).map(c => [c.id, c.razon_social]));
    setRows(((progs ?? []) as Programa[]).map(p => ({
      ...p,
      cedentes: { razon_social: cedentesById.get(p.cedente_id) ?? "—" },
      programa_descuentos: descuentosByPrograma.get(p.id) ?? [],
    })));
    setCedentes((ceds ?? []).filter(c => c.activo));
  }
  useEffect(() => { load(); }, []);

  function openNew() { setEditing(null); setForm(empty); setOpen(true); }
  function openEdit(p: Programa) {
    setEditing(p);
    setForm({
      codigo_pcfb: p.codigo_pcfb, cedente_id: p.cedente_id, linea: p.linea ?? "",
      plazo_ejecucion_dias: p.plazo_ejecucion_dias,
      descuento_base_pct: Number(p.descuento_base) * 100,
      plazo_cuotas_dias: p.plazo_cuotas_dias, fecha_inicio: p.fecha_inicio,
      contrato_cesion: p.contrato_cesion ?? "",
    });
    setOpen(true);
  }

  const fechaVencimientoCalc = form.fecha_inicio && form.plazo_ejecucion_dias > 0
    ? addDaysISO(form.fecha_inicio, form.plazo_ejecucion_dias)
    : "";

  async function save() {
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    if (!fechaVencimientoCalc) { toast.error("Fecha de vencimiento inválida"); return; }
    setBusy(true);
    const descBase = parsed.data.descuento_base_pct / 100;
    const today = new Date().toISOString().slice(0, 10);
    const estado: Programa["estado"] = fechaVencimientoCalc < today ? "vencida" : "activa";
    const payload = {
      codigo_pcfb: parsed.data.codigo_pcfb,
      cedente_id: parsed.data.cedente_id,
      linea: parsed.data.linea || null,
      plazo_ejecucion_dias: parsed.data.plazo_ejecucion_dias,
      descuento_base: descBase,
      plazo_cuotas_dias: parsed.data.plazo_cuotas_dias,
      fecha_inicio: parsed.data.fecha_inicio,
      fecha_vencimiento: fechaVencimientoCalc,
      contrato_cesion: parsed.data.contrato_cesion || null,
      estado,
      activo: estado === "activa",
    };
    if (editing) {
      const { error } = await supabase.from("programas").update(payload).eq("id", editing.id);
      if (error) toast.error(error.message);
      else {
        await logAudit({ action: "update", resource_type: "programa", resource_id: editing.id, details: payload });
        toast.success("Programa actualizado");
      }
    } else {
      const { data, error } = await supabase.from("programas").insert(payload).select().single();
      if (error) toast.error(error.message);
      else {
        // Crea descuento default automáticamente
        await supabase.from("programa_descuentos").insert({
          programa_id: data.id, descuento: descBase, etiqueta: "Base", es_default: true, activo: true,
        });
        await logAudit({ action: "create", resource_type: "programa", resource_id: data.id, details: payload });
        toast.success("Programa creado");
      }
    }
    setBusy(false); setOpen(false); load();
  }

  async function toggle(p: Programa) {
    if (p.estado === "vencida") { toast.error("Programa vencido — no se puede reactivar sin renovar"); return; }
    const newVal = !p.activo;
    const { error } = await supabase.from("programas")
      .update({ activo: newVal, estado: newVal ? "activa" : "inactiva" })
      .eq("id", p.id);
    if (error) toast.error(error.message);
    else { await logAudit({ action: newVal ? "enable" : "disable", resource_type: "programa", resource_id: p.id }); load(); }
  }

  async function deleteOne(p: Programa) {
    if (!window.confirm(`¿Eliminar definitivamente el programa ${p.codigo_pcfb}?`)) return;
    const { error } = await supabase.from("programas").delete().eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    await logAudit({ action: "delete", resource_type: "programa", resource_id: p.id, details: { codigo: p.codigo_pcfb } });
    toast.success("Programa eliminado");
    load();
  }

  async function deleteSelected() {
    if (!selected.length) return;
    if (!window.confirm(`¿Eliminar ${selected.length} programa(s) seleccionado(s)? Esta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from("programas").delete().in("id", selected);
    if (error) { toast.error(error.message); return; }
    await logAudit({ action: "bulk_delete", resource_type: "programa", details: { count: selected.length, ids: selected } });
    toast.success(`${selected.length} programa(s) eliminado(s)`);
    setSelected([]); load();
  }

  async function deleteAll() {
    const confirm1 = window.prompt(`⚠️ Esto eliminará TODOS los programas (${rows.length}). Escribe BORRAR TODO para confirmar:`);
    if (confirm1 !== "BORRAR TODO") return;
    const { error } = await supabase.from("programas").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) { toast.error(error.message); return; }
    await logAudit({ action: "wipe", resource_type: "programa", details: { count: rows.length } });
    toast.success("Todos los programas eliminados");
    setSelected([]); load();
  }

  const filtered = rows.filter(r => {
    if (estadoFilter !== "todos" && r.estado !== estadoFilter) return false;
    if (q) {
      const t = q.toLowerCase();
      return r.codigo_pcfb.toLowerCase().includes(t)
        || r.cedentes?.razon_social?.toLowerCase().includes(t)
        || (r.linea ?? "").toLowerCase().includes(t);
    }
    return true;
  });
  const filteredIds = filtered.map(r => r.id);
  const allSelected = filteredIds.length > 0 && filteredIds.every(id => selected.includes(id));
  function toggleAll(checked: boolean) {
    setSelected(prev => checked ? [...new Set([...prev, ...filteredIds])] : prev.filter(id => !filteredIds.includes(id)));
  }
  function toggleOne(id: string, checked: boolean) {
    setSelected(prev => checked ? [...prev, id] : prev.filter(x => x !== id));
  }

  function openDescuentos(p: Programa) {
    setDescPrograma(p);
    setDescOpen(true);
  }

  return (
    <>
      <PageHeader title="Programas" subtitle="Programas marco de Certificados de Financiamiento Bursátil">
        {isOperador && (
          <div className="flex gap-2 flex-wrap">
            <Button asChild variant="outline">
              <Link to="/importar"><Upload className="h-4 w-4 mr-1.5" /> Importar Excel</Link>
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button onClick={openNew} className="bg-gradient-primary shadow-elegant hover:opacity-95">
                  <Plus className="h-4 w-4 mr-1.5" /> Nuevo Programa
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle className="font-display text-xl text-primary">{editing ? "Editar" : "Nuevo"} Programa</DialogTitle></DialogHeader>
                <div className="grid grid-cols-2 gap-4 py-2">
                  <div><Label>Código del Programa *</Label><Input value={form.codigo_pcfb} onChange={e => setForm({ ...form, codigo_pcfb: e.target.value.toUpperCase() })} placeholder="CFB-CASHEA-2025-C" maxLength={60} /></div>
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
                  <div><Label>Descuento Base (%) — máx 20%</Label><Input type="number" step="0.01" value={form.descuento_base_pct} onChange={e => setForm({ ...form, descuento_base_pct: parseFloat(e.target.value || "0") })} placeholder="4" /></div>
                  <div><Label>Contrato de Cesión</Label><Input value={form.contrato_cesion} onChange={e => setForm({ ...form, contrato_cesion: e.target.value })} placeholder="N° contrato" maxLength={80} /></div>
                  <div><Label>Fecha Inicio *</Label><Input type="date" value={form.fecha_inicio} onChange={e => setForm({ ...form, fecha_inicio: e.target.value })} /></div>
                  <div>
                    <Label>Fecha Vencimiento (calculada)</Label>
                    <Input type="date" value={fechaVencimientoCalc} readOnly disabled className="bg-muted/50" />
                    <p className="text-xs text-muted-foreground mt-1">Inicio + Plazo Ejecución. Tras guardar, podrás agregar más descuentos al programa.</p>
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

      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por código, cedente o línea…" className="pl-9" />
        </div>
        {isAdmin && selected.length > 0 && (
          <Button variant="destructive" onClick={deleteSelected}>
            <Trash2 className="h-4 w-4 mr-1.5" /> Borrar {selected.length} seleccionado(s)
          </Button>
        )}
        {isAdmin && rows.length > 0 && (
          <Button variant="outline" onClick={deleteAll} className="border-destructive/40 text-destructive hover:bg-destructive/10">
            <Trash2 className="h-4 w-4 mr-1.5" /> Borrar TODOS
          </Button>
        )}
        <div className="flex gap-1.5">
          {(["todos", "activa", "vencida", "inactiva"] as const).map(e => (
            <Button key={e} size="sm" variant={estadoFilter === e ? "default" : "outline"} onClick={() => setEstadoFilter(e)} className="capitalize text-xs">
              {e}
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card shadow-sm-elegant overflow-hidden">
        {filtered.length === 0 ? <EmptyState title="Sin programas" hint="Crea cedentes y luego un programa para empezar a emitir." /> : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                {isAdmin && (
                  <th className="text-left px-5 py-3 font-semibold w-10">
                    <input type="checkbox" checked={allSelected} onChange={e => toggleAll(e.target.checked)} aria-label="Seleccionar todos" />
                  </th>
                )}
                <th className="text-left px-5 py-3 font-semibold">Código</th>
                <th className="text-left px-5 py-3 font-semibold">Cedente</th>
                <th className="text-left px-5 py-3 font-semibold">Línea</th>
                <th className="text-right px-5 py-3 font-semibold">Descuentos</th>
                <th className="text-left px-5 py-3 font-semibold">Vigencia</th>
                <th className="text-center px-5 py-3 font-semibold">Estado</th>
                <th className="text-center px-5 py-3 font-semibold">Activo</th>
                <th className="text-right px-5 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const descCount = (p.programa_descuentos ?? []).filter(d => d.activo).length;
                const isVencido = p.estado === "vencida";
                return (
                  <tr key={p.id} className={`border-t border-border hover:bg-secondary/30 ${isVencido ? "opacity-60" : ""}`}>
                    {isAdmin && (
                      <td className="px-5 py-3">
                        <input type="checkbox" checked={selected.includes(p.id)} onChange={e => toggleOne(p.id, e.target.checked)} aria-label={`Seleccionar ${p.codigo_pcfb}`} />
                      </td>
                    )}
                    <td className="px-5 py-3 font-mono text-xs font-semibold text-primary">{p.codigo_pcfb}</td>
                    <td className="px-5 py-3">{p.cedentes?.razon_social ?? "—"}</td>
                    <td className="px-5 py-3 text-muted-foreground text-xs uppercase tracking-wider">{p.linea ?? "—"}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1 justify-end items-center">
                        {(p.programa_descuentos ?? [])
                          .filter(d => d.activo)
                          .sort((a, b) => Number(a.descuento) - Number(b.descuento))
                          .slice(0, 4)
                          .map(d => (
                            <span
                              key={d.id}
                              title={d.etiqueta ?? ""}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono border ${
                                d.es_default
                                  ? "bg-primary/10 border-primary/40 text-primary font-semibold"
                                  : "bg-secondary/60 border-border text-foreground"
                              }`}
                            >
                              {d.etiqueta && <span className="font-sans normal-case">{d.etiqueta}:</span>}
                              {(Number(d.descuento) * 100).toFixed(2)}%
                            </span>
                          ))}
                        {descCount > 4 && (
                          <span className="text-[10px] text-muted-foreground">+{descCount - 4}</span>
                        )}
                        {descCount === 0 && (
                          <Numeric>{fmtPct(Number(p.descuento_base), 2)}</Numeric>
                        )}
                        {isOperador && (
                          <Button variant="ghost" size="sm" onClick={() => openDescuentos(p)} className="h-6 px-2 text-[10px] ml-1">
                            <Percent className="h-3 w-3 mr-1" /> Editar
                          </Button>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">{fmtDate(p.fecha_inicio)} — {fmtDate(p.fecha_vencimiento)}</td>
                    <td className="px-5 py-3 text-center">
                      <Pill tone={p.estado === "activa" ? "success" : p.estado === "vencida" ? "warning" : "default"}>
                        {p.estado.toUpperCase()}
                      </Pill>
                    </td>
                    <td className="px-5 py-3 text-center">
                      {isOperador ? <Switch checked={p.activo} onCheckedChange={() => toggle(p)} disabled={isVencido} /> :
                        <span className={p.activo ? "text-success" : "text-muted-foreground"}>{p.activo ? "Sí" : "No"}</span>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex gap-1 justify-end">
                        {isOperador && <Button size="sm" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>}
                        {isAdmin && <Button size="sm" variant="ghost" onClick={() => deleteOne(p)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {descPrograma && (
        <DescuentosDialog
          open={descOpen}
          onOpenChange={(o) => { setDescOpen(o); if (!o) { setDescPrograma(null); load(); } }}
          programa={descPrograma}
        />
      )}
    </>
  );
}

/* ============================ Descuentos sub-dialog ============================ */
function DescuentosDialog({ open, onOpenChange, programa }: {
  open: boolean; onOpenChange: (o: boolean) => void; programa: Programa;
}) {
  const [items, setItems] = useState<Descuento[]>([]);
  const [pct, setPct] = useState("");
  const [etiqueta, setEtiqueta] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    const { data } = await supabase.from("programa_descuentos")
      .select("id, descuento, etiqueta, es_default, activo")
      .eq("programa_id", programa.id)
      .order("descuento");
    setItems((data ?? []) as Descuento[]);
  }
  useEffect(() => { if (open) reload(); }, [open, programa.id]);

  async function addOne() {
    const v = parseFloat(pct);
    if (!Number.isFinite(v) || v < 0 || v > 20) { toast.error("Descuento entre 0% y 20%"); return; }
    setBusy(true);
    const { error } = await supabase.from("programa_descuentos").insert({
      programa_id: programa.id,
      descuento: v / 100,
      etiqueta: etiqueta.trim() || null,
      es_default: items.length === 0,
      activo: true,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    await logAudit({ action: "create", resource_type: "programa_descuento", details: { programa_id: programa.id, pct: v } });
    setPct(""); setEtiqueta(""); reload();
  }

  async function setDefault(id: string) {
    await supabase.from("programa_descuentos").update({ es_default: false }).eq("programa_id", programa.id);
    await supabase.from("programa_descuentos").update({ es_default: true }).eq("id", id);
    reload();
  }

  async function toggleActivo(d: Descuento) {
    await supabase.from("programa_descuentos").update({ activo: !d.activo }).eq("id", d.id);
    reload();
  }

  async function remove(d: Descuento) {
    if (!window.confirm(`¿Eliminar descuento ${(d.descuento * 100).toFixed(2)}%?`)) return;
    const { error } = await supabase.from("programa_descuentos").delete().eq("id", d.id);
    if (error) { toast.error(error.message); return; }
    reload();
  }

  async function updateEtiqueta(d: Descuento, value: string) {
    const newEtiqueta = value.trim() || null;
    if (newEtiqueta === d.etiqueta) return;
    // Optimistic update
    setItems(prev => prev.map(x => x.id === d.id ? { ...x, etiqueta: newEtiqueta } : x));
    const { error } = await supabase.from("programa_descuentos")
      .update({ etiqueta: newEtiqueta }).eq("id", d.id);
    if (error) { toast.error(error.message); reload(); return; }
    await logAudit({ action: "update", resource_type: "programa_descuento", resource_id: d.id, details: { etiqueta: newEtiqueta } });
    toast.success("Etiqueta actualizada");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl text-primary">
            Descuentos · {programa.codigo_pcfb}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">Configura múltiples descuentos para este programa. El default se preselecciona al emitir.</p>
        </DialogHeader>

        <div className="grid grid-cols-[1fr_2fr_auto] gap-2 items-end">
          <div>
            <Label className="text-xs">% Descuento</Label>
            <Input type="number" step="0.01" min="0" max="20" value={pct} onChange={e => setPct(e.target.value)} placeholder="4.00" />
          </div>
          <div>
            <Label className="text-xs">Etiqueta (opcional)</Label>
            <Input value={etiqueta} onChange={e => setEtiqueta(e.target.value)} placeholder="Promocional, Volumen, etc." maxLength={40} />
          </div>
          <Button onClick={addOne} disabled={busy} className="bg-gradient-primary"><Plus className="h-4 w-4 mr-1" /> Agregar</Button>
        </div>

        <div className="rounded border border-border overflow-hidden">
          {items.length === 0 ? (
            <div className="p-6 text-sm text-center text-muted-foreground">Sin descuentos configurados.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Etiqueta</th>
                  <th className="text-right px-3 py-2">Descuento</th>
                  <th className="text-center px-3 py-2">Default</th>
                  <th className="text-center px-3 py-2">Activo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map(d => (
                  <tr key={d.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <Input
                        defaultValue={d.etiqueta ?? ""}
                        onBlur={(e) => updateEtiqueta(d, e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        placeholder="Sin etiqueta"
                        maxLength={40}
                        className="h-8 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{(d.descuento * 100).toFixed(4)}%</td>
                    <td className="px-3 py-2 text-center">
                      {d.es_default ? <Pill tone="success">DEFAULT</Pill> :
                        <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setDefault(d.id)}>Marcar</Button>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Switch checked={d.activo} onCheckedChange={() => toggleActivo(d)} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" size="icon" onClick={() => remove(d)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
