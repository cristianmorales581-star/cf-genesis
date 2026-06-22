import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Numeric } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import {
  addDaysISO, calcMontos, diffDays, fmtBs, fmtPct, fmtUSD,
  rendimientoAnualizado, round5, todayISO,
} from "@/lib/format";
import { Loader2, RefreshCw, ArrowRight } from "lucide-react";
import { z } from "zod";

interface Descuento { id: string; descuento: number; etiqueta: string | null; es_default: boolean; activo: boolean; }
interface Programa {
  id: string; codigo_pcfb: string; descuento_base: number;
  plazo_ejecucion_dias: number; plazo_cuotas_dias: number;
  fecha_inicio: string; fecha_vencimiento: string; activo: boolean;
  estado?: string;
  cedentes?: { razon_social: string; rif: string };
  programa_descuentos?: Descuento[];
}

interface Financista {
  id: string; razon_social: string; tipo: "natural" | "juridica"; activo: boolean;
}

const schema = z.object({
  programa_id: z.string().uuid("Selecciona un programa"),
  financista_id: z.string().uuid().nullable().optional(),
  fecha_emision: z.string().min(1),
  dias_colocados: z.number().int().positive().max(720),
  valor_nominal_usd: z.number().positive("Debe ser > 0").max(100_000_000),
  descuento_pct: z.number().min(0).max(20),
  tasa_cambio_bs_usd: z.number().positive("Tasa BCV requerida"),
  cantidad_ordenes_compra: z.number().int().positive().max(99),
});

export default function NuevaEmision() {
  const navigate = useNavigate();
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [financistas, setFinancistas] = useState<Financista[]>([]);
  const [bcvLoading, setBcvLoading] = useState(false);
  const [bcvFuente, setBcvFuente] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [simboloPreview, setSimboloPreview] = useState<string>("");

  const [form, setForm] = useState({
    programa_id: "",
    financista_id: "" as string | "",
    fecha_emision: todayISO(),
    dias_colocados: 30,
    valor_nominal_usd: 100000,
    descuento_pct: 4,
    tasa_cambio_bs_usd: 0,
    cantidad_ordenes_compra: 1,
  });

  useEffect(() => {
    (async () => {
      try { await supabase.rpc("refresh_programas_estado"); } catch { /* no bloquea la carga */ }
      const [{ data: progs }, { data: fins }] = await Promise.all([
        supabase.from("programas")
          .select("*, cedentes(razon_social, rif), programa_descuentos(id, descuento, etiqueta, es_default, activo)")
          .eq("activo", true).eq("estado", "activa").order("codigo_pcfb"),
        supabase.from("financistas").select("id, razon_social, tipo, activo").eq("activo", true).order("razon_social"),
      ]);
      setProgramas((progs ?? []) as Programa[]);
      setFinancistas((fins ?? []) as Financista[]);
    })();
    fetchBCV();
  }, []);

  const programa = useMemo(() => programas.find(p => p.id === form.programa_id), [programas, form.programa_id]);
  const descuentosDisponibles = useMemo(
    () => (programa?.programa_descuentos ?? []).filter(d => d.activo).sort((a, b) => a.descuento - b.descuento),
    [programa]
  );

  // Preselect default descuento when programa changes
  useEffect(() => {
    if (programa) {
      const def = (programa.programa_descuentos ?? []).find(d => d.es_default && d.activo)
        ?? (programa.programa_descuentos ?? []).find(d => d.activo);
      const descPct = def ? Number(def.descuento) * 100 : Number(programa.descuento_base) * 100;
      setForm(f => ({
        ...f,
        descuento_pct: descPct,
        dias_colocados: programa.plazo_cuotas_dias,
      }));
      fetchBCV(programa.fecha_inicio);
      supabase.rpc("next_simbolo_for_programa", { _programa_id: programa.id })
        .then(({ data }) => setSimboloPreview(data ?? ""));
    } else {
      setSimboloPreview("");
    }
  }, [programa]);

  // Live calculations
  const fechaVencimiento = form.fecha_emision && form.dias_colocados > 0
    ? addDaysISO(form.fecha_emision, form.dias_colocados) : "";
  const descuento = form.descuento_pct / 100;
  const precio = round5(1 - descuento);
  const dias = fechaVencimiento ? diffDays(form.fecha_emision, fechaVencimiento) : 0;
  const rend = rendimientoAnualizado(precio, dias || form.dias_colocados);
  const { montoUsd, valorBs } = calcMontos(form.valor_nominal_usd, precio, form.tasa_cambio_bs_usd);

  async function fetchBCV(referenceDate?: string) {
    setBcvLoading(true);
    try {
      const fechaReferencia = referenceDate ?? programa?.fecha_inicio;
      const { data, error } = await supabase.functions.invoke(
        "bcv-rate",
        fechaReferencia ? { body: { date: fechaReferencia } } : undefined,
      );
      if (error) throw error;
      const tasa = Number(data?.tasa);
      if (!tasa || tasa <= 0) throw new Error("Tasa inválida");
      setForm(f => ({ ...f, tasa_cambio_bs_usd: tasa }));
      setBcvFuente(data?.fuente ?? "BCV");
      toast.success(`Tasa BCV: ${tasa.toFixed(4)} Bs/USD`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error obteniendo tasa BCV";
      toast.error(msg + ". Ingresa la tasa manualmente.");
    } finally {
      setBcvLoading(false);
    }
  }

  async function save() {
    const parsed = schema.safeParse({
      ...form,
      financista_id: form.financista_id || null,
    });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    if (!fechaVencimiento) { toast.error("Fecha de vencimiento inválida"); return; }
    if (programa && fechaVencimiento > programa.fecha_vencimiento) {
      toast.error(`El vencimiento excede la vigencia del programa (${programa.fecha_vencimiento})`);
      return;
    }
    setBusy(true);
    // Generate symbol now (atomic)
    const { data: simbolo } = await supabase.rpc("next_simbolo_for_programa", { _programa_id: form.programa_id });
    if (!simbolo) { toast.error("No se pudo generar el símbolo"); setBusy(false); return; }

    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      programa_id: form.programa_id,
      financista_id: form.financista_id || null,
      operador_id: user?.id ?? null,
      simbolo_cfb: simbolo,
      fecha_emision: form.fecha_emision,
      fecha_vencimiento: fechaVencimiento,
      dias_colocados: dias || form.dias_colocados,
      valor_nominal_usd: form.valor_nominal_usd,
      descuento,
      precio,
      rendimiento_anualizado: rend,
      tasa_cambio_bs_usd: form.tasa_cambio_bs_usd,
      monto_efectivo_usd: montoUsd,
      valor_efectivo_bs: valorBs,
      cantidad_ordenes_compra: form.cantidad_ordenes_compra,
      estado: "activa",
    };
    const { data, error } = await supabase.from("emisiones").insert(payload).select().single();
    if (error) { toast.error(error.message); setBusy(false); return; }
    await logAudit({ action: "issue", resource_type: "emision", resource_id: data.id, details: { simbolo, vn_usd: form.valor_nominal_usd } });
    toast.success(`Emisión ${simbolo} creada`);
    navigate(`/emisiones/${data.id}`);
  }

  return (
    <>
      <PageHeader title="Nueva Emisión" subtitle="Registro de un Certificado de Financiamiento Bursátil">
        <Button variant="outline" onClick={() => navigate("/emisiones")}>Cancelar</Button>
        <Button onClick={save} disabled={busy} className="bg-gradient-gold text-accent-foreground hover:opacity-95">
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
          Emitir CFB <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — form */}
        <div className="lg:col-span-2 surface-card p-6 space-y-6">
          <div>
            <h3 className="font-display text-sm uppercase tracking-[0.16em] text-muted-foreground mb-3">Programa</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Programa marco *</Label>
                <Select value={form.programa_id} onValueChange={v => setForm({ ...form, programa_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar programa activo" /></SelectTrigger>
                  <SelectContent>
                    {programas.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.codigo_pcfb} — {p.cedentes?.razon_social ?? "—"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {programa && (
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Vigencia: {programa.fecha_inicio} → {programa.fecha_vencimiento} ·
                    Descuento base: {fmtPct(Number(programa.descuento_base), 2)}
                  </p>
                )}
              </div>

              <div>
                <Label>Financista (opcional)</Label>
                <Select value={form.financista_id} onValueChange={v => setForm({ ...form, financista_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Sin financista" /></SelectTrigger>
                  <SelectContent>
                    {financistas.map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.razon_social} ({f.tipo})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Símbolo (auto)</Label>
                <Input value={simboloPreview || "—"} readOnly disabled className="font-mono bg-muted/50" />
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-display text-sm uppercase tracking-[0.16em] text-muted-foreground mb-3">Términos financieros</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Fecha de emisión *</Label>
                <Input type="date" value={form.fecha_emision} onChange={e => setForm({ ...form, fecha_emision: e.target.value })} />
              </div>
              <div>
                <Label>Días colocados *</Label>
                <Input type="number" min={1} max={720} value={form.dias_colocados}
                  onChange={e => setForm({ ...form, dias_colocados: parseInt(e.target.value || "0") })} />
              </div>
              <div>
                <Label>Valor Nominal (USD) *</Label>
                <Input type="number" min={0} step="0.01" value={form.valor_nominal_usd}
                  onChange={e => setForm({ ...form, valor_nominal_usd: parseFloat(e.target.value || "0") })} />
              </div>
              <div>
                <Label>Descuento (%) *</Label>
                {descuentosDisponibles.length > 1 ? (
                  <Select
                    value={String(form.descuento_pct)}
                    onValueChange={(v) => setForm({ ...form, descuento_pct: parseFloat(v) })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {descuentosDisponibles.map(d => {
                        const pct = Number(d.descuento) * 100;
                        return (
                          <SelectItem key={d.id} value={String(pct)}>
                            {pct.toFixed(4)}%{d.etiqueta ? ` · ${d.etiqueta}` : ""}{d.es_default ? " (default)" : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input type="number" min={0} max={20} step="0.01" value={form.descuento_pct}
                    onChange={e => setForm({ ...form, descuento_pct: parseFloat(e.target.value || "0") })} />
                )}
              </div>
              <div>
                <Label>Cantidad órdenes de compra</Label>
                <Input type="number" min={1} max={99} value={form.cantidad_ordenes_compra}
                  onChange={e => setForm({ ...form, cantidad_ordenes_compra: parseInt(e.target.value || "1") })} />
              </div>
              <div>
                <Label>Fecha de vencimiento (calc.)</Label>
                <Input value={fechaVencimiento || "—"} readOnly disabled className="bg-muted/50" />
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-display text-sm uppercase tracking-[0.16em] text-muted-foreground mb-3 flex items-center justify-between">
              Tasa BCV
              <Button size="sm" variant="ghost" onClick={fetchBCV} disabled={bcvLoading} className="h-7 text-xs">
                {bcvLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                Actualizar BCV
              </Button>
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tasa Bs/USD *</Label>
                <Input type="number" min={0} step="0.0001" value={form.tasa_cambio_bs_usd || ""}
                  onChange={e => setForm({ ...form, tasa_cambio_bs_usd: parseFloat(e.target.value || "0") })} />
                {bcvFuente && <p className="text-[11px] text-muted-foreground mt-1">Fuente: {bcvFuente}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Right — live preview */}
        <aside className="surface-card p-6 h-fit sticky top-6 glow-ring">
          <h3 className="font-display text-sm uppercase tracking-[0.16em] text-accent mb-4">Cálculo en vivo</h3>
          <dl className="space-y-3">
            <Row k="Descuento" v={fmtPct(descuento, 4)} />
            <Row k="Precio" v={precio.toFixed(5)} mono />
            <Row k="Días" v={String(dias || form.dias_colocados)} mono />
            <Row k="Rendimiento anual" v={fmtPct(rend, 4)} highlight />
            <div className="border-t border-border pt-3 mt-2"></div>
            <Row k="Monto efectivo USD" v={fmtUSD(montoUsd)} mono />
            <Row k="Valor efectivo Bs" v={fmtBs(valorBs)} mono />
          </dl>
          <p className="text-[10px] text-muted-foreground mt-5 leading-relaxed">
            Fórmula: rendimiento = (1 - precio) / precio × 360 / días.<br/>
            USD se redondea a 2 decimales antes de convertir a Bs.
          </p>
        </aside>
      </div>
    </>
  );
}

function Row({ k, v, mono, highlight }: { k: string; v: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{k}</dt>
      <dd className={`${mono ? "font-mono" : "font-display"} tabular-nums ${highlight ? "text-accent text-base font-semibold" : "text-foreground text-sm"}`}>
        {v}
      </dd>
    </div>
  );
}
