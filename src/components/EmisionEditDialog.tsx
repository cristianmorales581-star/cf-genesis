import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { addDaysISO, diffDays, round5, rendimientoAnualizado, calcMontos, fmtUSD, fmtBs } from "@/lib/format";

export interface EditableEmision {
  id: string;
  simbolo_cfb: string;
  programa_id?: string | null;
  financista_id?: string | null;
  cedente_id?: string | null;
  valor_nominal_usd: number;
  precio: number;
  dias_colocados: number;
  fecha_emision: string;
  fecha_vencimiento: string;
  tasa_cambio_bs_usd: number;
  rendimiento_anualizado: number;
  cantidad_ordenes_compra?: number | null;
  estado: string;
}

interface Props {
  emision: EditableEmision | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}

interface Opt { id: string; label: string }

const SIN_PROGRAMA = "__none__";

export default function EmisionEditDialog({ emision, open, onOpenChange, onSaved }: Props) {
  const [financistas, setFinancistas] = useState<Opt[]>([]);
  const [cedentes, setCedentes] = useState<Opt[]>([]);
  const [programas, setProgramas] = useState<(Opt & { cedente_id: string })[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    simbolo_cfb: "", programa_id: SIN_PROGRAMA, financista_id: "", cedente_id: "",
    valor_nominal_usd: 0, precio: 1, dias_colocados: 0,
    fecha_emision: "", fecha_vencimiento: "", tasa_cambio_bs_usd: 0,
    cantidad_ordenes_compra: 1, estado: "activa",
  });

  useEffect(() => {
    (async () => {
      const [{ data: fins }, { data: progs }, { data: ceds }] = await Promise.all([
        supabase.from("financistas").select("id, razon_social, rif").order("razon_social"),
        supabase.from("programas").select("id, codigo_pcfb, cedente_id, cedentes(razon_social)").order("codigo_pcfb"),
        supabase.from("cedentes").select("id, razon_social, rif").order("razon_social"),
      ]);
      setFinancistas((fins ?? []).map((f: any) => ({ id: f.id, label: `${f.razon_social}${f.rif ? ` — ${f.rif}` : ""}` })));
      setCedentes((ceds ?? []).map((c: any) => ({ id: c.id, label: `${c.razon_social}${c.rif ? ` — ${c.rif}` : ""}` })));
      setProgramas((progs ?? []).map((p: any) => ({
        id: p.id, cedente_id: p.cedente_id,
        label: `${p.codigo_pcfb} — ${p.cedentes?.razon_social ?? ""}`,
      })));
    })();
  }, []);

  useEffect(() => {
    if (!emision) return;
    setForm({
      simbolo_cfb: emision.simbolo_cfb ?? "",
      programa_id: emision.programa_id ?? SIN_PROGRAMA,
      financista_id: emision.financista_id ?? "",
      cedente_id: emision.cedente_id ?? "",
      valor_nominal_usd: Number(emision.valor_nominal_usd) || 0,
      precio: Number(emision.precio) || 1,
      dias_colocados: Number(emision.dias_colocados) || 0,
      fecha_emision: emision.fecha_emision ?? "",
      fecha_vencimiento: emision.fecha_vencimiento ?? "",
      tasa_cambio_bs_usd: Number(emision.tasa_cambio_bs_usd) || 0,
      cantidad_ordenes_compra: Number(emision.cantidad_ordenes_compra) || 1,
      estado: emision.estado ?? "activa",
    });
  }, [emision]);


  const precio = round5(Number(form.precio) || 0);
  const descuento = round5(1 - precio);
  const dias = form.fecha_emision && form.fecha_vencimiento
    ? diffDays(form.fecha_emision, form.fecha_vencimiento)
    : Number(form.dias_colocados) || 0;
  const rend = rendimientoAnualizado(precio, dias || Number(form.dias_colocados) || 0);
  const { montoUsd, valorBs } = useMemo(
    () => calcMontos(Number(form.valor_nominal_usd) || 0, precio, Number(form.tasa_cambio_bs_usd) || 0),
    [form.valor_nominal_usd, precio, form.tasa_cambio_bs_usd],
  );

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  function onProgramaChange(v: string) {
    const ced = programas.find(p => p.id === v)?.cedente_id;
    setForm(prev => ({ ...prev, programa_id: v, cedente_id: ced ?? prev.cedente_id }));
  }

  function onDiasChange(v: number) {
    setForm(prev => ({
      ...prev,
      dias_colocados: v,
      fecha_vencimiento: prev.fecha_emision && v > 0 ? addDaysISO(prev.fecha_emision, v) : prev.fecha_vencimiento,
    }));
  }

  async function save() {
    if (!emision) return;
    if (!form.simbolo_cfb.trim()) { toast.error("El símbolo es obligatorio"); return; }
    if (!form.financista_id) { toast.error("El financista es obligatorio: ningún título puede quedar sin financista"); return; }
    if (!form.cedente_id) { toast.error("El cedente es obligatorio"); return; }
    if (!(Number(form.valor_nominal_usd) > 0)) { toast.error("Valor nominal inválido"); return; }
    if (!(precio > 0 && precio <= 1)) { toast.error("El precio debe estar entre 0 y 1"); return; }
    if (!(Number(form.tasa_cambio_bs_usd) > 0)) { toast.error("Tasa de cambio inválida"); return; }
    if (!form.fecha_emision || !form.fecha_vencimiento) { toast.error("Fechas obligatorias"); return; }
    if (form.fecha_vencimiento <= form.fecha_emision) { toast.error("El vencimiento debe ser posterior a la emisión"); return; }

    const programa_id = form.programa_id && form.programa_id !== SIN_PROGRAMA ? form.programa_id : null;

    setBusy(true);
    const payload = {
      simbolo_cfb: form.simbolo_cfb.trim().toUpperCase(),
      programa_id,
      cedente_id: form.cedente_id,
      financista_id: form.financista_id,
      valor_nominal_usd: Number(form.valor_nominal_usd),
      precio,
      descuento,
      dias_colocados: dias,
      fecha_emision: form.fecha_emision,
      fecha_vencimiento: form.fecha_vencimiento,
      tasa_cambio_bs_usd: Number(form.tasa_cambio_bs_usd),
      rendimiento_anualizado: rend,
      monto_efectivo_usd: montoUsd,
      valor_efectivo_bs: valorBs,
      cantidad_ordenes_compra: Math.max(1, Math.round(Number(form.cantidad_ordenes_compra) || 1)),
      estado: form.estado,
    };
    const { error } = await supabase.from("emisiones").update(payload).eq("id", emision.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    await logAudit({
      action: "update", resource_type: "emision", resource_id: emision.id,
      details: { simbolo_cfb: payload.simbolo_cfb, financista_id: payload.financista_id },
    });
    toast.success(`Certificado ${payload.simbolo_cfb} actualizado`);
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar certificado {emision?.simbolo_cfb}</DialogTitle>
          <DialogDescription>
            Corrige los datos que componen el título. El financista es obligatorio.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Símbolo CFB</Label>
            <Input value={form.simbolo_cfb} onChange={e => set("simbolo_cfb", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Estado</Label>
            <Select value={form.estado} onValueChange={v => set("estado", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="activa">Activa</SelectItem>
                <SelectItem value="vencida">Vencida</SelectItem>
                <SelectItem value="redimida">Redimida</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Programa (opcional)</Label>
            <Select value={form.programa_id} onValueChange={onProgramaChange}>
              <SelectTrigger><SelectValue placeholder="Selecciona un programa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_PROGRAMA}>Sin programa (N/A)</SelectItem>
                {programas.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Cedente (obligatorio)</Label>
            <Select value={form.cedente_id} onValueChange={v => set("cedente_id", v)}>
              <SelectTrigger><SelectValue placeholder="Selecciona un cedente" /></SelectTrigger>
              <SelectContent>
                {cedentes.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Financista (obligatorio)</Label>
            <Select value={form.financista_id} onValueChange={v => set("financista_id", v)}>
              <SelectTrigger><SelectValue placeholder="Selecciona un financista" /></SelectTrigger>
              <SelectContent>
                {financistas.map(f => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Fecha de emisión</Label>
            <Input type="date" value={form.fecha_emision} onChange={e => set("fecha_emision", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Fecha de vencimiento</Label>
            <Input type="date" value={form.fecha_vencimiento} onChange={e => set("fecha_vencimiento", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Plazo (días)</Label>
            <Input type="number" value={form.dias_colocados} onChange={e => onDiasChange(Number(e.target.value))} />
          </div>
          <div>
            <Label className="text-xs">Cantidad de órdenes</Label>
            <Input type="number" value={form.cantidad_ordenes_compra} onChange={e => set("cantidad_ordenes_compra", Number(e.target.value))} />
          </div>
          <div>
            <Label className="text-xs">Valor nominal USD</Label>
            <Input type="number" step="0.01" value={form.valor_nominal_usd} onChange={e => set("valor_nominal_usd", Number(e.target.value))} />
          </div>
          <div>
            <Label className="text-xs">Precio (0-1)</Label>
            <Input type="number" step="0.00001" value={form.precio} onChange={e => set("precio", Number(e.target.value))} />
          </div>
          <div>
            <Label className="text-xs">Tasa BCV (Bs/USD)</Label>
            <Input type="number" step="0.0001" value={form.tasa_cambio_bs_usd} onChange={e => set("tasa_cambio_bs_usd", Number(e.target.value))} />
          </div>
          <div className="rounded-md border border-border bg-secondary/30 p-3 text-xs space-y-1">
            <div>Descuento: <span className="tabular-nums">{(descuento * 100).toFixed(3)}%</span></div>
            <div>Rendimiento: <span className="tabular-nums">{(rend * 100).toFixed(2)}%</span></div>
            <div>Monto efectivo: <span className="tabular-nums">{fmtUSD(montoUsd)}</span></div>
            <div>Valor Bs: <span className="tabular-nums">{fmtBs(valorBs)}</span></div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Guardando…" : "Guardar cambios"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
