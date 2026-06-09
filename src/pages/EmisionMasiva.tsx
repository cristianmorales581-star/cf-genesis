// SICEBOP — Emisión Masiva: carga CSV → mapeo → generación de CFBs + Vector
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, Download, Loader2, Wand2, Trash2 } from "lucide-react";

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="surface-card p-5 mb-6">
      {title && <h3 className="font-display text-sm uppercase tracking-[0.16em] text-muted-foreground mb-4">{title}</h3>}
      {children}
    </section>
  );
}
import { fmtUSD, fmtPct, todayISO } from "@/lib/format";
import { parseCSVText, inferCedenteName, type ParsedRow } from "@/lib/csvParser";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { htmlToPdfBlob, type PdfDebugSnapshot } from "@/lib/pdfDebug";
import { PdfDebugPanel } from "@/components/PdfDebugPanel";

/** Normaliza RIF: quita guiones, espacios, uppercase. Clave única verdadera. */
function normRif(r: string | null | undefined): string {
  return (r ?? "").replace(/[-\s]/g, "").toUpperCase().trim();
}

interface Cedente { id: string; razon_social: string; rif: string; }
interface Descuento { id: string; descuento: number; etiqueta: string | null; es_default: boolean; activo: boolean; }
interface Programa { id: string; codigo_pcfb: string; cedente_id: string; linea: string | null; descuento_base: number; programa_descuentos?: Descuento[]; }
interface Financista { id: string; razon_social: string; rif: string | null; representante_legal?: string | null; cedula?: string | null; }

type RowMapping = ParsedRow & {
  cedente_id?: string;
  programa_id?: string;
  financista_id?: string;
  fecha_emision?: string;
  include: boolean;
};

export default function EmisionMasiva() {
  const [cedentes, setCedentes] = useState<Cedente[]>([]);
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [financistas, setFinancistas] = useState<Financista[]>([]);
  const [rows, setRows] = useState<RowMapping[]>([]);
  const [fechaEmision, setFechaEmision] = useState(todayISO());
  const [tasaBcv, setTasaBcv] = useState<number>(0);
  const [loadingBcv, setLoadingBcv] = useState(false);
  const [generating, setGenerating] = useState<"vector" | "zip" | null>(null);
  const [filename, setFilename] = useState<string>("");
  const [pastedCsv, setPastedCsv] = useState("");
  const [pdfDebug, setPdfDebug] = useState<PdfDebugSnapshot | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try { await supabase.rpc("refresh_programas_estado"); } catch { /* no bloquea la carga */ }
      const [c, p, f] = await Promise.all([
        supabase.from("cedentes").select("id, razon_social, rif").eq("activo", true).order("razon_social"),
        supabase.from("programas").select("id, codigo_pcfb, cedente_id, linea, descuento_base, programa_descuentos(id, descuento, etiqueta, es_default, activo)")
          .eq("activo", true).eq("estado", "activa").order("codigo_pcfb"),
        supabase.from("financistas").select("id, razon_social, rif, representante_legal, cedula").eq("activo", true).order("razon_social"),
      ]);
      setCedentes((c.data ?? []) as Cedente[]);
      setProgramas((p.data ?? []) as Programa[]);
      setFinancistas((f.data ?? []) as Financista[]);
      fetchBcv();
    })();
  }, []);

  async function fetchBcv() {
    setLoadingBcv(true);
    try {
      const { data } = await supabase.functions.invoke("bcv-rate");
      if (data?.tasa) setTasaBcv(Number(data.tasa));
    } catch { /* ignore */ }
    setLoadingBcv(false);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      loadCsvText(String(reader.result ?? ""), f.name);
    };
    reader.readAsText(f, "latin1");
  }

  function loadCsvText(text: string, sourceName: string) {
    setFilename(sourceName);
    const { rows: parsed, detectedFormat, warnings } = parseCSVText(text);
    if (warnings.length) {
      toast({ title: `${warnings.length} advertencias`, description: warnings.slice(0, 3).join(" · ") });
    }
    const defaultFinancista = financistas.find(f => /grupo\s+cashea\s+ve/i.test(f.razon_social)) ?? financistas[0];
    const mapped: RowMapping[] = parsed.map(r => {
      const rifCsv = normRif(r.rif_csv);
      const matchedCedente = rifCsv ? cedentes.find(c => normRif(c.rif) === rifCsv) : undefined;
      if (!matchedCedente) {
        return { ...r, cedente_id: undefined, programa_id: undefined, financista_id: defaultFinancista?.id, include: false };
      }
      let matchedPrograma = programas.find(p => p.cedente_id === matchedCedente.id && p.codigo_pcfb === r.programa_o_inversionista);
      if (!matchedPrograma) matchedPrograma = programas.find(p => p.cedente_id === matchedCedente.id);
      return {
        ...r,
        descuento_decimal: matchedPrograma ? Number(matchedPrograma.descuento_base) : r.descuento_decimal,
        cedente_id: matchedCedente.id,
        programa_id: matchedPrograma?.id,
        financista_id: defaultFinancista?.id,
        include: matchedCedente != null,
      };
    });
    setRows(mapped);
    toast({ title: `${parsed.length} filas leídas`, description: `Formato: ${detectedFormat}` });
  }

  function onPasteCsvImport() {
    if (!pastedCsv.trim()) {
      toast({ title: "Pega primero el CSV", variant: "destructive" });
      return;
    }
    loadCsvText(pastedCsv, "CSV pegado");
  }

  function removeRow(i: number) {
    setRows(prev => prev.filter((_, idx) => idx !== i));
  }

  function updateRow(i: number, patch: Partial<RowMapping>) {
    setRows(prev => {
      const copy = [...prev];
      copy[i] = { ...copy[i], ...patch };
      return copy;
    });
  }

  /** Réplica del macro NextTicker(): prefijo (no-dígitos) + número(+1, preservando padding) + sufijo (no-dígitos). */
  function nextTicker(ticker: string): string {
    const m = String(ticker ?? "").trim().match(/^(\D*?)(\d+)(\D*)$/);
    if (!m) return ticker;
    const [, prefix, numStr, suffix] = m;
    const next = String(Number(numStr) + 1).padStart(numStr.length, "0");
    return `${prefix}${next}${suffix}`;
  }

  /** Rellena el símbolo de las filas siguientes auto-incrementando desde la primera fila incluida. */
  function fillSymbolsFromFirst() {
    setRows(prev => {
      if (!prev.length) return prev;
      const seed = String(prev[0].simbolo_cfb ?? "").trim();
      if (!seed || !/^\D*\d+\D*$/.test(seed)) {
        toast({ title: "Símbolo inválido", description: "La primera fila debe tener el formato prefijo+número+sufijo (ej. C1234A).", variant: "destructive" });
        return prev;
      }
      const copy = [...prev];
      let current = seed;
      copy[0] = { ...copy[0], simbolo_cfb: seed };
      for (let i = 1; i < copy.length; i++) {
        current = nextTicker(current);
        copy[i] = { ...copy[i], simbolo_cfb: current };
      }
      toast({ title: "Símbolos auto-rellenados", description: `${copy.length} filas desde ${seed}.` });
      return copy;
    });
  }

  function updatePrograma(i: number, programaId: string) {
    const programa = programas.find(p => p.id === programaId);
    const def = programa?.programa_descuentos?.find(d => d.es_default && d.activo)
      ?? programa?.programa_descuentos?.find(d => d.activo);
    updateRow(i, {
      programa_id: programaId,
      descuento_decimal: def ? Number(def.descuento) : (programa ? Number(programa.descuento_base) : rows[i].descuento_decimal),
    });
  }

  const stats = useMemo(() => {
    const inc = rows.filter(r => r.include);
    return {
      total: rows.length,
      included: inc.length,
      mapped: rows.filter(r => r.cedente_id).length,
      totalUsd: inc.reduce((s, r) => s + r.monto_total_usd, 0),
    };
  }, [rows]);

  function generateVectorOnly() {
    if (!stats.included) { toast({ title: "Nada que generar", variant: "destructive" }); return; }
    if (!tasaBcv || tasaBcv <= 0) { toast({ title: "Tasa BCV requerida", variant: "destructive" }); return; }

    setGenerating("vector");
    try {
      const vectorXlsx = buildVectorXlsx(buildLocalVectorRows(rows.filter(r => r.include), cedentes, financistas, fechaEmision, tasaBcv), fechaEmision);
      downloadBlob(new Blob([vectorXlsx], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `VECTOR_${fechaEmision}_CONSOLIDADO.xlsx`);
      toast({ title: "Vector consolidado generado", description: `Descargado · ${fmtUSD(stats.totalUsd)}` });
    } catch (e: any) {
      toast({ title: "Error generando vector", description: e.message, variant: "destructive" });
    }
    setGenerating(null);
  }

  async function generate() {
    if (!stats.included) { toast({ title: "Nada que generar", variant: "destructive" }); return; }
    if (!tasaBcv || tasaBcv <= 0) { toast({ title: "Tasa BCV requerida", variant: "destructive" }); return; }

    setGenerating("zip");
    try {
      const payload = {
        fecha_emision: fechaEmision,
        tasa_bcv: tasaBcv,
        rows: rows.filter(r => r.include).map(r => {
          const fin = financistas.find(f => f.id === r.financista_id);
          return {
            simbolo_cfb: r.simbolo_cfb,
            cedente_id: r.cedente_id!,
            programa_id: r.programa_id ?? null,
            financista_id: r.financista_id ?? null,
            cantidad_ordenes: r.cantidad_ordenes,
            monto_total_usd: r.monto_total_usd,
            fecha_emision: r.fecha_emision || fechaEmision,
            vencimiento_primera_orden: r.vencimiento_primera_orden,
            plazo_dias: r.plazo_dias,
            descuento_decimal: r.descuento_decimal,
            linea: r.linea,
            inversionista_label: fin?.razon_social || "GRUPO CASHEA VE, C.A.",
            inversionista_rif: fin?.rif || "J-501934070",
            inversionista_rep_legal: fin?.representante_legal || null,
            inversionista_cedula: fin?.cedula || null,
          };
        }),
      };
      const { data, error } = await supabase.functions.invoke("generate-batch", { body: payload });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Generación falló");

      setPdfDebug(null);
      // Armar ZIP con PDFs + vector .xlsx
      const zip = new JSZip();
      const docFolder = zip.folder("documentos")!;
      let debugCaptured = false;
      for (const d of data.documents as { filename: string; html: string }[]) {
        const pdf = await htmlToPdfBlob(d.html, d.filename.replace(/\.pdf$/i, ""), {
          onDebug: debugCaptured ? undefined : (snapshot) => {
            debugCaptured = true;
            setPdfDebug(snapshot);
          },
        });
        docFolder.file(d.filename.replace(/\.html$/i, ".pdf"), pdf);
      }
      // Vector consolidado .xlsx (formato espejo del modelo SIBE)
      const vectorXlsx = buildVectorXlsx(data.vector, fechaEmision);
      zip.file(`VECTOR_${fechaEmision}_CONSOLIDADO.xlsx`, vectorXlsx);

      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, `LOTE_CFB_${fechaEmision}.zip`);

      toast({ title: `${data.count} certificados generados`, description: `Lote descargado · ${fmtUSD(data.metadata.total_usd)}` });
      setRows([]); setFilename("");
    } catch (e: any) {
      toast({ title: "Error generando lote", description: e.message, variant: "destructive" });
    }
    setGenerating(null);
  }

  return (
    <>
      <PageHeader title="Emisión Masiva" subtitle="Carga un CSV (Express, Masivo o Paquetizado) y genera todos los CFBs + el vector consolidado del día" />
      {pdfDebug && <PdfDebugPanel snapshot={pdfDebug} onClose={() => setPdfDebug(null)} />}

      {/* Step 1: Configuración */}
      <Card title="1. Parámetros del lote">
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <Label>Fecha de Emisión</Label>
            <Input type="date" value={fechaEmision} onChange={(e) => setFechaEmision(e.target.value)} />
          </div>
          <div>
            <Label>Tasa BCV (Bs/USD)</Label>
            <div className="flex gap-2">
              <Input type="number" step="0.0001" value={tasaBcv || ""} onChange={(e) => setTasaBcv(parseFloat(e.target.value) || 0)} placeholder="477.6259" />
              <Button variant="outline" size="icon" onClick={fetchBcv} disabled={loadingBcv} title="Recargar BCV">
                {loadingBcv ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div>
            <Label>Archivo CSV</Label>
            <div className="flex gap-2">
              <Input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
              <Button variant="outline" className="w-full justify-start" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" /> {filename || "Seleccionar CSV"}
              </Button>
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <Label>Pegar CSV directamente</Label>
          <Textarea
            value={pastedCsv}
            onChange={(e) => setPastedCsv(e.target.value)}
            placeholder="Pega aquí el CSV completo o el rango con encabezados"
            className="min-h-32 font-mono text-xs"
          />
          <Button variant="outline" onClick={onPasteCsvImport}>
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Cargar CSV pegado
          </Button>
        </div>
      </Card>

      {/* Step 2: Previsualización + mapeo */}
      {rows.length > 0 && (
        <>
          <Card title="2. Mapeo y previsualización">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <Stat label="Filas leídas" value={String(stats.total)} />
              <Stat label="Auto-mapeadas" value={`${stats.mapped} / ${stats.total}`} />
              <Stat label="A generar" value={String(stats.included)} tone="ok" />
              <Stat label="Total USD" value={fmtUSD(stats.totalUsd)} tone="ok" />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <p className="text-[11px] text-muted-foreground max-w-2xl">
                Edita el símbolo CFB de la primera fila (ej. <span className="font-mono">C1234A</span>) y usa <b>Auto-rellenar símbolos</b> para incrementarlo en el resto, igual que el macro <span className="font-mono">NextTicker()</span>.
              </p>
              <Button size="sm" variant="outline" onClick={fillSymbolsFromFirst}>
                <Wand2 className="h-3.5 w-3.5 mr-1.5" /> Auto-rellenar símbolos
              </Button>
            </div>


            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-[11.5px]">
                <thead className="bg-muted/40 text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="px-2 py-2 text-left">Inc.</th>
                    <th className="px-2 py-2 text-left">Símbolo CFB</th>
                    <th className="px-2 py-2 text-left">CSV - Cedente</th>
                    <th className="px-2 py-2 text-left">Cedente BD</th>
                    <th className="px-2 py-2 text-left">Programa BD</th>
                    <th className="px-2 py-2 text-left">Financista</th>
                    <th className="px-2 py-2 text-left">Línea</th>
                    <th className="px-2 py-2 text-left">Fecha emisión</th>
                    <th className="px-2 py-2 text-right">VN USD</th>
                    <th className="px-2 py-2 text-right">Plazo</th>
                    <th className="px-2 py-2 text-right">Desc.</th>
                    <th className="px-2 py-2 text-left">Vcto</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r, i) => {
                    const ok = Boolean(r.cedente_id);
                    const progsForCed = programas.filter(p => p.cedente_id === r.cedente_id);
                    return (
                      <tr key={i} className={!ok ? "bg-destructive/5" : ""}>
                        <td className="px-2 py-1.5">
                          <input type="checkbox" checked={r.include} onChange={(e) => updateRow(i, { include: e.target.checked })} disabled={!ok} />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            value={r.simbolo_cfb ?? ""}
                            onChange={(e) => updateRow(i, { simbolo_cfb: e.target.value.toUpperCase() })}
                            placeholder="C1234A"
                            className="h-7 text-[11px] font-mono w-[110px]"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="font-medium">{inferCedenteName(r)}</div>
                          <div className="text-[10px] text-muted-foreground">{r.rif_csv} · {r.tipo}</div>
                          {!r.cedente_id && (
                            <div className="text-[10px] text-destructive mt-1">
                              ⚠️ RIF no encontrado en la base — agregar cedente antes de procesar
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <Select value={r.cedente_id ?? ""} onValueChange={(v) => updateRow(i, { cedente_id: v, programa_id: undefined })}>
                            <SelectTrigger className="h-7 text-[11px] w-full min-w-[180px]"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              {cedentes.map(c => <SelectItem key={c.id} value={c.id}>{c.razon_social}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1.5">
                          <Select value={r.programa_id ?? ""} onValueChange={(v) => updatePrograma(i, v)} disabled={!r.cedente_id}>
                            <SelectTrigger className="h-7 text-[11px] w-full min-w-[170px]"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              {progsForCed.map(p => <SelectItem key={p.id} value={p.id}>{p.codigo_pcfb}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {r.cedente_id && !r.programa_id && (
                            <div className="text-[10px] text-muted-foreground mt-1">Sin programa · se procesará sin id</div>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <Select value={r.financista_id ?? ""} onValueChange={(v) => updateRow(i, { financista_id: v })}>
                            <SelectTrigger className="h-7 text-[11px] w-full min-w-[190px]"><SelectValue placeholder="Grupo Cashea VE, C.A." /></SelectTrigger>
                            <SelectContent>
                              {financistas.map(f => <SelectItem key={f.id} value={f.id}>{f.razon_social}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground">{r.linea}</td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="date"
                            value={r.fecha_emision || fechaEmision}
                            onChange={(e) => updateRow(i, { fecha_emision: e.target.value || undefined })}
                            className="h-7 w-32 text-[11px]"
                            aria-label="Fecha de emisión individual"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono">{fmtUSD(r.monto_total_usd)}</td>
                        <td className="px-2 py-1.5 text-right">{r.plazo_dias}d</td>
                        <td className="px-2 py-1.5 text-right">
                          {(() => {
                            const prog = programas.find(p => p.id === r.programa_id);
                            const descs = (prog?.programa_descuentos ?? []).filter(d => d.activo);
                            if (descs.length > 1) {
                              return (
                                <Select
                                  value={String(r.descuento_decimal)}
                                  onValueChange={(v) => updateRow(i, { descuento_decimal: parseFloat(v) })}
                                >
                                  <SelectTrigger className="h-7 w-28 text-[11px]"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {descs.sort((a, b) => a.descuento - b.descuento).map(d => (
                                      <SelectItem key={d.id} value={String(d.descuento)}>
                                        {(d.descuento * 100).toFixed(2)}%{d.etiqueta ? ` ${d.etiqueta}` : ""}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              );
                            }
                            return (
                              <Input
                                type="number" min="0" max="20" step="0.01"
                                value={Number.isFinite(r.descuento_decimal) ? (r.descuento_decimal * 100).toFixed(2) : ""}
                                onChange={(e) => updateRow(i, { descuento_decimal: (parseFloat(e.target.value) || 0) / 100 })}
                                className="h-7 w-20 text-right text-[11px] font-mono"
                                aria-label="Descuento porcentual"
                              />
                            );
                          })()}
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground">{r.vencimiento_primera_orden}</td>
                        <td className="px-2 py-1.5 text-right">
                          <Button variant="ghost" size="icon" onClick={() => removeRow(i)} aria-label="Eliminar fila">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="3. Generar lote">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="text-sm text-muted-foreground">
                Se crearán <strong className="text-foreground">{stats.included}</strong> emisiones, {stats.included * 6} documentos PDF y un archivo Vector consolidado .xlsx.
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button onClick={generateVectorOnly} disabled={generating !== null || stats.included === 0} variant="outline">
                  {generating === "vector" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
                  Generar vector
                </Button>
                <Button onClick={generate} disabled={generating !== null || stats.included === 0} className="bg-gradient-gold text-accent-foreground hover:opacity-95">
                  {generating === "zip" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                  Generar ZIP
                </Button>
              </div>
            </div>
          </Card>
        </>
      )}

      {rows.length === 0 && (
        <Card>
          <div className="flex flex-col items-center text-center py-12 text-muted-foreground">
            <FileSpreadsheet className="h-10 w-10 mb-3 text-muted-foreground/50" />
            <p className="text-sm">Carga un CSV de la Bolsa para comenzar.</p>
            <p className="text-[11px] mt-1">Soporta CSV Express, Masivo y Paquetizado (latin1).</p>
          </div>
        </Card>
      )}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold ${tone === "ok" ? "text-accent" : "text-foreground"}`}>{value}</div>
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildLocalVectorRows(rows: RowMapping[], cedentes: Cedente[], financistas: Financista[], fechaEmision: string, tasaBcv: number) {
  return rows.map(r => {
    const cedente = cedentes.find(c => c.id === r.cedente_id);
    const financista = financistas.find(f => f.id === r.financista_id);
    const rowFechaEmision = r.fecha_emision || fechaEmision;
    const precio = Math.round((1 - r.descuento_decimal) * 100000) / 100000;
    const vnUsd = Math.round(r.monto_total_usd * 100) / 100;
    const montoUsd = Math.round(vnUsd * precio * 100) / 100;
    return {
      simbolo_cfb: r.simbolo_cfb,
      cedente: cedente?.razon_social ?? inferCedenteName(r),
      rif_cedente: cedente?.rif ?? r.rif_csv,
      deudor_cedido: "GRUPO CASHEA VE, C.A.",
      rif_deudor: "J-501934070",
      cantidad_certificados: 1,
      fecha_emision: rowFechaEmision,
      fecha_vencimiento: addDaysISO(rowFechaEmision, r.plazo_dias),
      dias_colocados: r.plazo_dias,
      rendimiento: Math.round(((1 - precio) / precio) * (360 / r.plazo_dias) * 100000) / 100000,
      volumen_ordenes: r.cantidad_ordenes,
      valor_nominal_bs: Math.round(vnUsd * tasaBcv * 100) / 100,
      precio_emision: precio,
      tipo_sociedad: "COMERCIAL",
      moneda: "VES",
      valor_nominal_usd: vnUsd,
      monto_sibe_usd: Math.round(vnUsd),
      tasa_cambio: tasaBcv,
      inversionista: financista?.razon_social ?? "GRUPO CASHEA VE, C.A.",
      rif_inversionista: financista?.rif ?? "J-501934070",
    };
  });
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Construye el .xlsx del vector consolidado, espejo del formato SIBE. */
function buildVectorXlsx(rows: any[], _fechaEmision: string): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const vectorDate = (date: string | null | undefined) => (date ? excelSerialDate(date) : "");

  // Hoja 1: Vector
  const headers = [
    "SIMBOLO CFB", "CEDENTE", "R.I.F.", "DEUDOR CEDIDO", "R.I.F.",
    "CANTIDAD DE CERTIFICADOS", "FECHA EMISIÓN", "FECHA DE VCTO", "Dias Colocados",
    "Rendimiento", "VOLUMEN DE ORDENES DE COMPRA", "VALOR NOMINAL Bs.", "PRECIO DE EMISIÓN Bs.",
    "TIPO DE SOCIEDAD", "TIPO DE MONEDA UTILIZADA EN LA OPERACIÓN", "VALOR NOMINAL $",
    "MONTO SIBE", "TASA DE CAMBIO UTILIZADA", "INVERSIONISTA",
  ];
  const data = [
    ["", `Identificador del Estructurador: Grupo Bursatil Venezolano Casa de Bolsa, C.A.`, "", "", "", "T+0"],
    [],
    [],
    headers,
    ...rows.map(r => [
      r.simbolo_cfb, r.cedente, r.rif_cedente, r.deudor_cedido, r.rif_deudor,
      r.cantidad_certificados, vectorDate(r.fecha_emision), vectorDate(r.fecha_vencimiento), r.dias_colocados,
      r.rendimiento, r.volumen_ordenes, r.valor_nominal_bs, r.precio_emision,
      r.tipo_sociedad, r.moneda, r.valor_nominal_usd, r.monto_sibe_usd, r.tasa_cambio, r.inversionista,
    ]),
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(data);
  // Anchos
  ws1["!cols"] = headers.map(h => ({ wch: Math.max(h.length, 14) }));
  applyVectorFormats(ws1, 5, rows.length);
  XLSX.utils.book_append_sheet(wb, ws1, "Vector");

  // Hoja 2: Resumen
  const headers2 = ["SIMBOLO CFB","CEDENTE","R.I.F.","FECHA EMISIÓN","PRECIO DE EMISIÓN Bs.","MONTO SIBE","INVERSIONISTA","RIF INVERSIONISTA"];
  const data2 = [
    ["", `Identificador del Estructurador: Grupo Bursatil Venezolano Casa de Bolsa, C.A.`],
    [],
    [],
    headers2,
    ...rows.map(r => [r.simbolo_cfb, r.cedente, r.rif_cedente, vectorDate(r.fecha_emision), r.precio_emision, r.monto_sibe_usd, r.inversionista, r.rif_inversionista ?? r.rif_deudor]),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(data2);
  ws2["!cols"] = headers2.map(h => ({ wch: Math.max(h.length, 14) }));
  applyResumenFormats(ws2, 5, rows.length);
  XLSX.utils.book_append_sheet(wb, ws2, "Resumen");

  return XLSX.write(wb, { bookType: "xlsx", type: "array" });
}

function excelSerialDate(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000 + 25569;
}

function setCellFormat(ws: XLSX.WorkSheet, address: string, z: string) {
  if (!ws[address]) return;
  ws[address].z = z;
}

function applyVectorFormats(ws: XLSX.WorkSheet, firstDataRow: number, rowCount: number) {
  const fmt = {
    date: "dd/mm/yyyy",
    int: '_ * #,##0_ ;_ * \\-#,##0_ ;_ * "-"??_ ;_ @_ ',
    num2: '_(* #,##0.00_);_(* \\(#,##0.00\\);_(* "-"??_);_(@_)',
    pct2: "0.00%",
    pct4: "0.0000%",
    usd2: '[$$-540A]#,##0.00_ ;\\-[$$-540A]#,##0.00\\ ',
    usd0: '[$$-540A]#,##0_ ;\\-[$$-540A]#,##0\\ ',
    tasa: '_ [$Bs.S-200A]* #,##0.0000_ ;_ [$Bs.S-200A]* \\-#,##0.0000_ ;_ [$Bs.S-200A]* "-"??_ ;_ @_ ',
  };
  for (let r = firstDataRow; r < firstDataRow + rowCount; r++) {
    setCellFormat(ws, `G${r}`, fmt.date);
    setCellFormat(ws, `H${r}`, fmt.date);
    setCellFormat(ws, `I${r}`, fmt.int);
    setCellFormat(ws, `J${r}`, fmt.pct2);
    setCellFormat(ws, `K${r}`, fmt.int);
    setCellFormat(ws, `L${r}`, fmt.num2);
    setCellFormat(ws, `M${r}`, fmt.pct4);
    setCellFormat(ws, `P${r}`, fmt.usd2);
    setCellFormat(ws, `Q${r}`, fmt.usd0);
    setCellFormat(ws, `R${r}`, fmt.tasa);
  }
}

function applyResumenFormats(ws: XLSX.WorkSheet, firstDataRow: number, rowCount: number) {
  for (let r = firstDataRow; r < firstDataRow + rowCount; r++) {
    setCellFormat(ws, `D${r}`, "dd/mm/yyyy");
    setCellFormat(ws, `E${r}`, "0.0000%");
    setCellFormat(ws, `F${r}`, '[$$-540A]#,##0_ ;\\-[$$-540A]#,##0\\ ');
  }
}
