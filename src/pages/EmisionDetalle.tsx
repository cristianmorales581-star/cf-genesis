import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Numeric, Pill, EmptyState } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowLeft, FileDown, Loader2, Plus } from "lucide-react";
import { fmtBs, fmtDate, fmtPct, fmtUSD, todayISO } from "@/lib/format";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { useAuth } from "@/contexts/AuthContext";
import { htmlToPdfDownload, type PdfDebugSnapshot } from "@/lib/pdfDebug";
import { PdfDebugPanel } from "@/components/PdfDebugPanel";

// deno-lint-ignore no-explicit-any
type Emision = any;

interface Confirmacion {
  id: string; tipo: "CDC" | "CDV"; contraparte_razon_social: string;
  fecha_operacion: string; fecha_valor: string; monto_efectivo_usd: number;
  valor_efectivo_bs: number; created_at: string;
}

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;

export default function EmisionDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isOperador } = useAuth();
  const [e, setE] = useState<Emision | null>(null);
  const [confs, setConfs] = useState<Confirmacion[]>([]);
  const [openConf, setOpenConf] = useState(false);
  const [confForm, setConfForm] = useState({
    tipo: "CDC" as "CDC" | "CDV",
    contraparte_razon_social: "",
    fecha_operacion: todayISO(),
    fecha_valor: todayISO(),
    monto_efectivo_usd: 0,
    valor_efectivo_bs: 0,
  });
  const [busy, setBusy] = useState(false);
  const [genTipo, setGenTipo] = useState<string | null>(null);
  const [pdfDebug, setPdfDebug] = useState<PdfDebugSnapshot | null>(null);

  async function load() {
    if (!id) return;
    const [{ data: em }, { data: cs }] = await Promise.all([
      supabase.from("emisiones").select("*, programas(*, cedentes(*)), financistas(*)").eq("id", id).maybeSingle(),
      supabase.from("confirmaciones").select("*").eq("emision_id", id).order("created_at", { ascending: false }),
    ]);
    setE(em);
    setConfs((cs ?? []) as Confirmacion[]);
    if (em) {
      setConfForm(f => ({
        ...f,
        monto_efectivo_usd: Number(em.monto_efectivo_usd),
        valor_efectivo_bs: Number(em.valor_efectivo_bs),
      }));
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (!e) return (
    <>
      <PageHeader title="Emisión" subtitle="Cargando…" />
      <EmptyState title="Buscando emisión…" />
    </>
  );

  const cedente = e.programas?.cedentes;

  async function generarDoc(tipo: "CFB" | "HOJA_TERMINOS" | "CDC" | "CDV", contraparte?: string) {
    setGenTipo(tipo);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `https://${PROJECT_ID}.functions.supabase.co/generate-document`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ emision_id: e.id, tipo, contraparte }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Error generando documento");
      }
      const html = await res.text();
      await htmlToPdfDownload(html, `${tipo}_${e.simbolo_cfb}.pdf`, { onDebug: setPdfDebug });
      await logAudit({ action: "generate_pdf", resource_type: tipo.toLowerCase(), resource_id: e.id });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setGenTipo(null);
    }
  }

  async function saveConf() {
    if (!confForm.contraparte_razon_social.trim()) { toast.error("Contraparte requerida"); return; }
    setBusy(true);
    const { data, error } = await supabase.from("confirmaciones").insert({
      emision_id: e.id,
      tipo: confForm.tipo,
      contraparte_razon_social: confForm.contraparte_razon_social,
      fecha_operacion: confForm.fecha_operacion,
      fecha_valor: confForm.fecha_valor,
      monto_efectivo_usd: confForm.monto_efectivo_usd,
      valor_efectivo_bs: confForm.valor_efectivo_bs,
    }).select().single();
    if (error) toast.error(error.message);
    else {
      await logAudit({ action: "create", resource_type: "confirmacion", resource_id: data.id, details: { tipo: confForm.tipo } });
      toast.success("Confirmación creada");
      setOpenConf(false);
      load();
    }
    setBusy(false);
  }

  return (
    <>
      <PageHeader title={e.simbolo_cfb} subtitle={`${cedente?.razon_social ?? ""} · ${e.programas?.codigo_pcfb ?? ""}`}>
        <Button variant="outline" size="sm" onClick={() => navigate("/emisiones")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Volver
        </Button>
        <Pill tone={e.estado === "activa" ? "success" : "default"}>{e.estado}</Pill>
      </PageHeader>
      {pdfDebug && <PdfDebugPanel snapshot={pdfDebug} onClose={() => setPdfDebug(null)} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Datos */}
        <div className="lg:col-span-2 space-y-6">
          <section className="surface-card p-6">
            <h3 className="font-display text-sm uppercase tracking-[0.16em] text-muted-foreground mb-4">Términos financieros</h3>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <KV k="Valor Nominal" v={fmtUSD(Number(e.valor_nominal_usd))} />
              <KV k="Precio" v={Number(e.precio).toFixed(5)} mono />
              <KV k="Descuento" v={fmtPct(Number(e.descuento), 4)} />
              <KV k="Rendimiento" v={fmtPct(Number(e.rendimiento_anualizado), 4)} highlight />
              <KV k="Monto Efectivo USD" v={fmtUSD(Number(e.monto_efectivo_usd))} />
              <KV k="Valor Efectivo Bs" v={fmtBs(Number(e.valor_efectivo_bs))} />
              <KV k="Tasa BCV" v={`${Number(e.tasa_cambio_bs_usd).toFixed(4)} Bs/USD`} mono />
              <KV k="Días" v={String(e.dias_colocados)} mono />
              <KV k="Fecha Emisión" v={fmtDate(e.fecha_emision)} />
              <KV k="Fecha Vencimiento" v={fmtDate(e.fecha_vencimiento)} />
              <KV k="Órdenes de compra" v={String(e.cantidad_ordenes_compra)} mono />
              <KV k="Financista" v={e.financistas?.razon_social ?? "—"} />
            </dl>
          </section>

          <section className="surface-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-sm uppercase tracking-[0.16em] text-muted-foreground">Confirmaciones</h3>
              {isOperador && (
                <Dialog open={openConf} onOpenChange={setOpenConf}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-gradient-gold text-accent-foreground hover:opacity-95">
                      <Plus className="h-3.5 w-3.5 mr-1" /> Nueva confirmación
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Nueva confirmación</DialogTitle></DialogHeader>
                    <div className="grid grid-cols-2 gap-3 py-2">
                      <div>
                        <Label>Tipo</Label>
                        <Select value={confForm.tipo} onValueChange={(v: "CDC" | "CDV") => setConfForm({ ...confForm, tipo: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CDC">CDC — Compra</SelectItem>
                            <SelectItem value="CDV">CDV — Venta</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Label>Contraparte</Label>
                        <Input value={confForm.contraparte_razon_social} onChange={ev => setConfForm({ ...confForm, contraparte_razon_social: ev.target.value })} placeholder="Razón social" />
                      </div>
                      <div>
                        <Label>Fecha operación</Label>
                        <Input type="date" value={confForm.fecha_operacion} onChange={ev => setConfForm({ ...confForm, fecha_operacion: ev.target.value })} />
                      </div>
                      <div>
                        <Label>Fecha valor</Label>
                        <Input type="date" value={confForm.fecha_valor} onChange={ev => setConfForm({ ...confForm, fecha_valor: ev.target.value })} />
                      </div>
                      <div>
                        <Label>Monto USD</Label>
                        <Input type="number" step="0.01" value={confForm.monto_efectivo_usd} onChange={ev => setConfForm({ ...confForm, monto_efectivo_usd: parseFloat(ev.target.value || "0") })} />
                      </div>
                      <div>
                        <Label>Valor Bs</Label>
                        <Input type="number" step="0.01" value={confForm.valor_efectivo_bs} onChange={ev => setConfForm({ ...confForm, valor_efectivo_bs: parseFloat(ev.target.value || "0") })} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="ghost" onClick={() => setOpenConf(false)}>Cancelar</Button>
                      <Button onClick={saveConf} disabled={busy} className="bg-gradient-primary">{busy ? "Guardando…" : "Guardar"}</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
            {confs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Sin confirmaciones aún.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  <tr>
                    <th className="text-left py-2">Tipo</th>
                    <th className="text-left py-2">Contraparte</th>
                    <th className="text-left py-2">F. Valor</th>
                    <th className="text-right py-2">USD</th>
                    <th className="text-right py-2">Bs</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {confs.map(c => (
                    <tr key={c.id} className="border-t border-border">
                      <td className="py-2.5"><Pill tone={c.tipo === "CDC" ? "accent" : "success"}>{c.tipo}</Pill></td>
                      <td className="py-2.5">{c.contraparte_razon_social}</td>
                      <td className="py-2.5 text-xs text-muted-foreground">{fmtDate(c.fecha_valor)}</td>
                      <td className="py-2.5 text-right"><Numeric>{fmtUSD(c.monto_efectivo_usd)}</Numeric></td>
                      <td className="py-2.5 text-right"><Numeric>{fmtBs(c.valor_efectivo_bs)}</Numeric></td>
                      <td className="py-2.5 text-right">
                        <Button size="sm" variant="ghost" onClick={() => generarDoc(c.tipo, c.contraparte_razon_social)} disabled={genTipo === c.tipo}>
                          <FileDown className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        {/* Documentos */}
        <aside className="surface-card p-6 h-fit space-y-3">
          <h3 className="font-display text-sm uppercase tracking-[0.16em] text-accent mb-2">Documentos</h3>
          <DocBtn label="Certificado CFB" onClick={() => generarDoc("CFB")} loading={genTipo === "CFB"} />
          <DocBtn label="Hoja de Términos" onClick={() => generarDoc("HOJA_TERMINOS")} loading={genTipo === "HOJA_TERMINOS"} />
          <p className="text-[10px] text-muted-foreground leading-relaxed pt-2 border-t border-border mt-3">
            Los documentos se abren en nueva pestaña con el botón "Imprimir / Guardar como PDF" para exportar.
          </p>
          <div className="pt-3">
            <Link to={`/programas`} className="text-xs text-accent hover:underline">→ Ver programa marco</Link>
          </div>
        </aside>
      </div>
    </>
  );
}

function KV({ k, v, mono, highlight }: { k: string; v: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-0.5">{k}</dt>
      <dd className={`${mono ? "font-mono" : "font-display"} tabular-nums ${highlight ? "text-accent text-base font-semibold" : "text-foreground text-sm"}`}>{v}</dd>
    </div>
  );
}

function DocBtn({ label, onClick, loading }: { label: string; onClick: () => void; loading?: boolean }) {
  return (
    <Button onClick={onClick} disabled={loading} variant="outline" className="w-full justify-between">
      {label}
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
    </Button>
  );
}

