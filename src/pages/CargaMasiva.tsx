import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, Trash2, RefreshCw } from "lucide-react";
import {
  parseExcelFile,
  parsePastedValues,
  dedupeCedentes,
  dedupeFinancistas,
  dedupeProgramas,
  type ParsedSheet,
  type CedenteRow,
  type FinancistaRow,
  type ProgramaRow,
} from "@/lib/excelImport";
import { logAudit } from "@/lib/audit";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";

interface ImportSummary {
  cedentes: { creados: number; actualizados: number; errores: string[] };
  financistas: { creados: number; actualizados: number; errores: string[] };
  programas: { creados: number; actualizados: number; errores: string[] };
}

type MatchStatus = "nuevo" | "actualiza" | "ok" | "error" | "pendiente";

interface ValidationRow {
  status: MatchStatus;
  label: string;
}

interface ValidationState {
  cedentes: ValidationRow[];
  programas: ValidationRow[];
  financistas: ValidationRow[];
}

function normalizeProgramLine(line?: string | null) {
  const trimmed = (line ?? "").trim();
  return trimmed.length ? trimmed : null;
}

function programStatus(fechaVencimiento: string) {
  const today = new Date().toISOString().slice(0, 10);
  return fechaVencimiento && fechaVencimiento < today
    ? { estado: "vencida", activo: false }
    : { estado: "activa", activo: true };
}

function isISODate(value?: string | null) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "");
}

function addDaysISO(date: string, days: number) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function normalizeProgramDates(p: ProgramaRow) {
  const plazo = Number.isFinite(p.plazo_ejecucion_dias) && p.plazo_ejecucion_dias > 0 ? p.plazo_ejecucion_dias : 180;
  const fechaInicio = isISODate(p.fecha_inicio) ? p.fecha_inicio : new Date().toISOString().slice(0, 10);
  const fechaVencimiento = isISODate(p.fecha_vencimiento) && p.fecha_vencimiento > fechaInicio
    ? p.fecha_vencimiento
    : addDaysISO(fechaInicio, plazo);
  return { plazo, fechaInicio, fechaVencimiento };
}

function normalizeRif(rif?: string | null) {
  return (rif ?? "").toUpperCase().replace(/[-\s]/g, "").trim();
}

function rifVariants(rif?: string | null) {
  const clean = normalizeRif(rif);
  if (!clean) return [];
  const withDash = /^[VEJPG]\d+$/i.test(clean) ? `${clean[0]}-${clean.slice(1)}` : clean;
  return [...new Set([clean, withDash, rif?.toUpperCase().trim()].filter(Boolean) as string[])];
}

async function findCedenteIdByRif(rif?: string | null) {
  const variants = rifVariants(rif);
  if (!variants.length) return undefined;
  const { data, error } = await supabase.from("cedentes").select("id").in("rif", variants).limit(1).maybeSingle();
  if (error) throw error;
  return data?.id as string | undefined;
}

async function ensureBaseDiscount(programaId: string, descuento: number) {
  const { data, error } = await supabase
    .from("programa_descuentos")
    .select("id, descuento, es_default")
    .eq("programa_id", programaId);
  if (error) throw error;

  const discounts = data ?? [];
  const base = discounts.find(d => Number(d.descuento) === Number(descuento));
  const hasDefault = discounts.some(d => d.es_default);

  if (!base) {
    const { error: insertError } = await supabase.from("programa_descuentos").insert({
      programa_id: programaId,
      descuento,
      etiqueta: "Base",
      es_default: !hasDefault,
      activo: true,
    });
    if (insertError) throw insertError;
    return;
  }

  if (!hasDefault) {
    const { error: updateError } = await supabase
      .from("programa_descuentos")
      .update({ es_default: true, activo: true })
      .eq("id", base.id);
    if (updateError) throw updateError;
  }
}

export default function CargaMasiva() {
  const { isOperador } = useAuth();
  const [parsed, setParsed] = useState<ParsedSheet | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [validating, setValidating] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [validation, setValidation] = useState<ValidationState | null>(null);
  const [tab, setTab] = useState("cedentes");
  const [pastedValues, setPastedValues] = useState("");

  if (!isOperador) return <Navigate to="/" replace />;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      await loadParsed(await parseExcelFile(f), f.name);
    } catch (err: any) {
      toast.error("Error al leer Excel: " + (err.message ?? String(err)));
    }
  }

  async function loadParsed(result: ParsedSheet, sourceName: string) {
    result.cedentes = dedupeCedentes(result.cedentes);
    result.financistas = dedupeFinancistas(result.financistas);
    result.programas = dedupeProgramas(result.programas);
    setFileName(sourceName);
    setParsed(result);
    setValidation(null);
    setSummary(null);
    const total = result.cedentes.length + result.financistas.length + result.programas.length;
    if (total === 0) toast.error("No se detectaron registros válidos");
    else {
      toast.success(`Detectados: ${result.cedentes.length} cedentes · ${result.programas.length} programas · ${result.financistas.length} financistas`);
      void validateMatches(result);
    }
  }

  function onPasteImport() {
    if (!pastedValues.trim()) {
      toast.error("Pega primero el rango copiado desde Excel");
      return;
    }
    try {
      void loadParsed(parsePastedValues(pastedValues), "Valores pegados");
    } catch (err: any) {
      toast.error("Error al leer valores pegados: " + (err.message ?? String(err)));
    }
  }

  function replaceRows<K extends keyof Pick<ParsedSheet, "cedentes" | "programas" | "financistas">>(kind: K, rows: ParsedSheet[K]) {
    setParsed(prev => prev ? { ...prev, [kind]: rows } : prev);
    setValidation(null);
    setSummary(null);
  }

  async function validateMatches(source = parsed) {
    if (!source) return;
    setValidating(true);
    const next: ValidationState = { cedentes: [], programas: [], financistas: [] };

    for (const c of source.cedentes) {
      if (!c.rif) {
        next.cedentes.push({ status: "error", label: "Falta RIF" });
        continue;
      }
      const { data } = await supabase.from("cedentes").select("id").in("rif", rifVariants(c.rif)).limit(1).maybeSingle();
      next.cedentes.push(data ? { status: "actualiza", label: "Match por RIF · actualizará" } : { status: "nuevo", label: "Sin match · creará" });
    }

    const cedentesEnCarga = new Set(source.cedentes.map(c => normalizeRif(c.rif)).filter(Boolean));
    for (const p of source.programas) {
      if (!p.codigo_pcfb) {
        next.programas.push({ status: "error", label: "Falta PCFB" });
        continue;
      }
      if (!p.cedente_rif) {
        next.programas.push({ status: "error", label: "Falta RIF de cedente" });
        continue;
      }
      const cedenteId = await findCedenteIdByRif(p.cedente_rif);
      if (!cedenteId && cedentesEnCarga.has(normalizeRif(p.cedente_rif))) {
        next.programas.push({ status: "ok", label: "Cedente en carga · programa nuevo" });
        continue;
      }
      if (!cedenteId) {
        next.programas.push({ status: "error", label: "Cedente no encontrado" });
        continue;
      }
      const { data: existing } = await supabase.from("programas").select("id").eq("codigo_pcfb", p.codigo_pcfb).maybeSingle();
      next.programas.push(existing ? { status: "actualiza", label: "Match por PCFB · actualizará" } : { status: "nuevo", label: "Sin match · creará" });
    }

    for (const f of source.financistas) {
      if (!f.razon_social) {
        next.financistas.push({ status: "error", label: "Falta razón social" });
        continue;
      }
      const { data } = f.rif
        ? await supabase.from("financistas").select("id").eq("rif", f.rif).maybeSingle()
        : await supabase.from("financistas").select("id").eq("razon_social", f.razon_social).maybeSingle();
      next.financistas.push(data ? { status: "actualiza", label: f.rif ? "Match por RIF" : "Match por razón social" } : { status: "nuevo", label: "Sin match · creará" });
    }

    setValidation(next);
    setValidating(false);
  }

  async function importAll() {
    if (!parsed) return;
    setBusy(true);
    const result: ImportSummary = {
      cedentes: { creados: 0, actualizados: 0, errores: [] },
      financistas: { creados: 0, actualizados: 0, errores: [] },
      programas: { creados: 0, actualizados: 0, errores: [] },
    };

    // 1) CEDENTES — upsert por RIF normalizado
    const cedenteMap = new Map<string, string>(); // rif → id
    for (const c of parsed.cedentes) {
      try {
        const rif = normalizeRif(c.rif);
        if (!rif) throw new Error("Falta RIF");
        const { data: existing } = await supabase
          .from("cedentes").select("id").in("rif", rifVariants(rif)).limit(1).maybeSingle();
        if (existing) {
          const { error } = await supabase.from("cedentes").update({
            razon_social: c.razon_social,
            representante_legal: c.representante_legal ?? null,
            cargo: c.cargo ?? null,
            cedula: c.cedula ?? null,
            nombre_comercial: c.nombre_comercial ?? null,
          }).eq("id", existing.id);
          if (error) throw error;
          cedenteMap.set(rif, existing.id);
          result.cedentes.actualizados++;
        } else {
          const { data, error } = await supabase.from("cedentes").insert({
            razon_social: c.razon_social, rif,
            representante_legal: c.representante_legal ?? null,
            cargo: c.cargo ?? null,
            cedula: c.cedula ?? null,
            nombre_comercial: c.nombre_comercial ?? null,
          }).select("id").single();
          if (error) throw error;
          cedenteMap.set(rif, data.id);
          result.cedentes.creados++;
        }
      } catch (e: any) {
        result.cedentes.errores.push(`${c.razon_social}: ${e.message ?? e}`);
      }
    }

    // 2) PROGRAMAS — upsert directo por PCFB (la clave única real de la BD)
    const savedProgramIds: string[] = [];
    for (const p of parsed.programas) {
      try {
        const codigoPcfb = p.codigo_pcfb.trim();
        if (!codigoPcfb) throw new Error("Falta PCFB");
        const cedenteRif = normalizeRif(p.cedente_rif);
        let cedenteId: string | undefined;
        if (cedenteRif) cedenteId = cedenteMap.get(cedenteRif);
        if (!cedenteId && cedenteRif) cedenteId = await findCedenteIdByRif(cedenteRif);
        if (!cedenteId) {
          result.programas.errores.push(`${p.codigo_pcfb}: cedente con RIF ${p.cedente_rif} no encontrado`);
          continue;
        }
        const { data: existing } = await supabase.from("programas")
          .select("id")
          .eq("codigo_pcfb", codigoPcfb)
          .maybeSingle();
        const { plazo, fechaInicio, fechaVencimiento } = normalizeProgramDates(p);
        const payload = {
          codigo_pcfb: codigoPcfb,
          cedente_id: cedenteId,
          linea: normalizeProgramLine(p.linea),
          plazo_ejecucion_dias: plazo,
          descuento_base: p.descuento_base,
          plazo_cuotas_dias: p.plazo_cuotas_dias,
          fecha_inicio: fechaInicio,
          fecha_vencimiento: fechaVencimiento,
          contrato_cesion: p.contrato_cesion ?? null,
          ...programStatus(fechaVencimiento),
        };
        const { data, error } = await supabase
          .from("programas")
          .upsert(payload, { onConflict: "codigo_pcfb" })
          .select("id")
          .single();
        if (error) throw error;
        const programaId = data.id;
        if (existing) result.programas.actualizados++;
        else result.programas.creados++;
        savedProgramIds.push(programaId);
        await ensureBaseDiscount(programaId, p.descuento_base);
      } catch (e: any) {
        result.programas.errores.push(`${p.codigo_pcfb}: ${e.message ?? e}`);
      }
    }

    if (savedProgramIds.length > 0) {
      const { data: verified, error: verifyError } = await supabase
        .from("programas")
        .select("id")
        .in("id", [...new Set(savedProgramIds)]);
      if (verifyError) result.programas.errores.push(`Verificación de programas falló: ${verifyError.message}`);
      else if ((verified ?? []).length === 0) result.programas.errores.push("La carga procesó programas, pero la app no pudo leerlos después de guardarlos.");
    }

    // 3) FINANCISTAS — upsert por RIF (o razón social si no hay RIF)
    for (const f of parsed.financistas) {
      try {
        let existing: { id: string } | null = null;
        if (f.rif) {
          const { data } = await supabase.from("financistas").select("id").eq("rif", f.rif).maybeSingle();
          existing = data;
        } else {
          const { data } = await supabase.from("financistas").select("id").eq("razon_social", f.razon_social).maybeSingle();
          existing = data;
        }
        const payload = {
          tipo: f.tipo, razon_social: f.razon_social,
          rif: f.rif ?? null,
          representante_legal: f.representante_legal ?? null,
          cargo: f.cargo ?? null, cedula: f.cedula ?? null,
          correo: f.correo ?? null, celular: f.celular ?? null,
        };
        if (existing) {
          const { error } = await supabase.from("financistas").update(payload).eq("id", existing.id);
          if (error) throw error;
          result.financistas.actualizados++;
        } else {
          const { error } = await supabase.from("financistas").insert(payload);
          if (error) throw error;
          result.financistas.creados++;
        }
      } catch (e: any) {
        result.financistas.errores.push(`${f.razon_social}: ${e.message ?? e}`);
      }
    }

    await logAudit({
      action: "import_excel", resource_type: "carga_masiva",
      details: {
        archivo: fileName,
        cedentes: result.cedentes, programas: result.programas, financistas: result.financistas,
      },
    });

    setSummary(result);
    setBusy(false);
    const totErr = result.cedentes.errores.length + result.programas.errores.length + result.financistas.errores.length;
    if (totErr === 0 && parsed.programas.length === 0) toast.warning("Importación procesada, pero no se detectó ningún programa en el archivo");
    else if (totErr === 0) toast.success("Importación completada sin errores");
    else toast.warning(`Importación con ${totErr} errores — revisa el resumen`);
  }

  return (
    <>
      <PageHeader title="Carga Masiva" subtitle="Importar cedentes, programas y financistas desde Excel">
        <label htmlFor="excel-file">
          <input
            id="excel-file" type="file" accept=".xlsx,.xlsm,.xls" className="hidden"
            onChange={onFile} disabled={busy}
          />
          <Button asChild className="bg-gradient-primary shadow-elegant hover:opacity-95 cursor-pointer">
            <span><Upload className="h-4 w-4 mr-1.5" /> Subir Excel</span>
          </Button>
        </label>
      </PageHeader>

      {!parsed && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="bg-gradient-to-br from-card to-secondary/30 border-dashed border-2">
            <CardContent className="p-12 text-center">
              <FileSpreadsheet className="h-14 w-14 mx-auto text-primary/40 mb-4" />
              <h3 className="font-display text-lg font-semibold text-primary mb-2">
                Sube tu archivo Excel SICEBOP
              </h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Detectamos automáticamente las hojas <span className="font-medium">CEDENTES</span> y{" "}
                <span className="font-medium">FINANCISTAS</span>. Los programas se crean a partir de las
                columnas PCFB / Plazo / Descuento de cada cedente.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-primary">Pegar rango desde Excel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={pastedValues}
                onChange={e => setPastedValues(e.target.value)}
                placeholder="Pega aquí encabezados y filas copiados desde Excel"
                className="min-h-44 font-mono text-xs"
              />
              <Button onClick={onPasteImport} variant="outline" className="w-full">
                <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Cargar valores pegados
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {parsed && (
        <div className="space-y-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="font-display text-primary">Previsualización · {fileName}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Hojas detectadas: {parsed.detected.map(d => `${d.sheet} (${d.kind})`).join(" · ") || "—"}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button variant="outline" onClick={() => validateMatches()} disabled={busy || validating}>
                  {validating ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
                  Validar matches
                </Button>
                <Button onClick={importAll} disabled={busy || validating} className="bg-gradient-primary">
                  {busy ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Importando…</> : <><CheckCircle2 className="h-4 w-4 mr-1.5" /> Confirmar e importar</>}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList>
                  <TabsTrigger value="cedentes">Cedentes ({parsed.cedentes.length})</TabsTrigger>
                  <TabsTrigger value="programas">Programas ({parsed.programas.length})</TabsTrigger>
                  <TabsTrigger value="financistas">Financistas ({parsed.financistas.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="cedentes" className="mt-4">
                  <PreviewCedentes rows={parsed.cedentes} matches={validation?.cedentes} onChange={(rows) => replaceRows("cedentes", rows)} />
                </TabsContent>
                <TabsContent value="programas" className="mt-4">
                  <PreviewProgramas rows={parsed.programas} matches={validation?.programas} onChange={(rows) => replaceRows("programas", rows)} />
                </TabsContent>
                <TabsContent value="financistas" className="mt-4">
                  <PreviewFinancistas rows={parsed.financistas} matches={validation?.financistas} onChange={(rows) => replaceRows("financistas", rows)} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {summary && (
            <Card className="border-success/40">
              <CardHeader>
                <CardTitle className="font-display text-primary flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-success" /> Resultado de importación
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SummaryBox title="Cedentes" data={summary.cedentes} />
                <SummaryBox title="Programas" data={summary.programas} />
                <SummaryBox title="Financistas" data={summary.financistas} />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

function SummaryBox({ title, data }: { title: string; data: { creados: number; actualizados: number; errores: string[] } }) {
  return (
    <div className="rounded-lg border border-border p-4 bg-secondary/30">
      <h4 className="font-display font-semibold text-primary mb-3">{title}</h4>
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Creados</span><span className="font-mono font-semibold text-success">{data.creados}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Actualizados</span><span className="font-mono font-semibold">{data.actualizados}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Errores</span><span className="font-mono font-semibold text-destructive">{data.errores.length}</span></div>
      </div>
      {data.errores.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border text-xs text-destructive max-h-32 overflow-y-auto">
          {data.errores.map((e, i) => (
            <div key={i} className="flex gap-1 mb-1"><AlertCircle className="h-3 w-3 mt-0.5 shrink-0" /><span>{e}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}

function MatchBadge({ match }: { match?: ValidationRow }) {
  const cls = match?.status === "error" ? "border-destructive/40 text-destructive" : match?.status === "actualiza" ? "border-primary/30 text-primary" : "border-border text-muted-foreground";
  return <span className={`inline-flex rounded-md border px-2 py-1 text-[11px] font-medium ${cls}`}>{match?.label ?? "Pendiente"}</span>;
}

function PreviewCedentes({ rows, matches, onChange }: { rows: CedenteRow[]; matches?: ValidationRow[]; onChange: (rows: CedenteRow[]) => void }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground py-6 text-center">Sin cedentes detectados</p>;
  const update = (i: number, patch: Partial<CedenteRow>) => onChange(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="w-full text-xs">
        <thead className="bg-secondary/60 text-muted-foreground uppercase tracking-wider">
          <tr>
            <th className="text-left px-3 py-2">Validación</th>
            <th className="text-left px-3 py-2">Razón Social</th>
            <th className="text-left px-3 py-2">RIF</th>
            <th className="text-left px-3 py-2">Representante</th>
            <th className="text-left px-3 py-2">Nombre comercial</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => (
            <tr key={i} className="border-t border-border hover:bg-secondary/30">
              <td className="px-3 py-2"><MatchBadge match={matches?.[i]} /></td>
              <td className="px-3 py-2 min-w-56"><Input value={c.razon_social} onChange={e => update(i, { razon_social: e.target.value })} className="h-8 text-xs" /></td>
              <td className="px-3 py-2 min-w-32"><Input value={c.rif} onChange={e => update(i, { rif: e.target.value })} className="h-8 font-mono text-xs" /></td>
              <td className="px-3 py-2 min-w-48"><Input value={c.representante_legal ?? ""} onChange={e => update(i, { representante_legal: e.target.value })} className="h-8 text-xs" /></td>
              <td className="px-3 py-2 min-w-48"><Input value={c.nombre_comercial ?? ""} onChange={e => update(i, { nombre_comercial: e.target.value })} className="h-8 text-xs" /></td>
              <td className="px-3 py-2"><Button variant="ghost" size="icon" onClick={() => remove(i)} aria-label="Eliminar fila"><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreviewProgramas({ rows, matches, onChange }: { rows: ProgramaRow[]; matches?: ValidationRow[]; onChange: (rows: ProgramaRow[]) => void }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground py-6 text-center">Sin programas detectados</p>;
  const update = (i: number, patch: Partial<ProgramaRow>) => onChange(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="w-full text-xs">
        <thead className="bg-secondary/60 text-muted-foreground uppercase tracking-wider">
          <tr>
            <th className="text-left px-3 py-2">Validación</th>
            <th className="text-left px-3 py-2">PCFB</th>
            <th className="text-left px-3 py-2">Cedente (RIF)</th>
            <th className="text-left px-3 py-2">Línea</th>
            <th className="text-right px-3 py-2">Plazo Ejec.</th>
            <th className="text-right px-3 py-2">Descuento</th>
            <th className="text-right px-3 py-2">Cuotas</th>
            <th className="text-left px-3 py-2">Vigencia</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={i} className="border-t border-border hover:bg-secondary/30">
              <td className="px-3 py-2"><MatchBadge match={matches?.[i]} /></td>
              <td className="px-3 py-2 min-w-32"><Input value={p.codigo_pcfb} onChange={e => update(i, { codigo_pcfb: e.target.value })} className="h-8 font-mono text-xs" /></td>
              <td className="px-3 py-2 min-w-32"><Input value={p.cedente_rif ?? ""} onChange={e => update(i, { cedente_rif: e.target.value })} className="h-8 font-mono text-xs" /></td>
              <td className="px-3 py-2 min-w-28"><Input value={p.linea ?? ""} onChange={e => update(i, { linea: e.target.value })} className="h-8 text-xs" /></td>
              <td className="px-3 py-2 min-w-24"><Input type="number" value={p.plazo_ejecucion_dias} onChange={e => update(i, { plazo_ejecucion_dias: Number(e.target.value) })} className="h-8 text-xs text-right" /></td>
              <td className="px-3 py-2 min-w-24"><Input type="number" step="0.01" value={(p.descuento_base * 100).toFixed(2)} onChange={e => update(i, { descuento_base: Number(e.target.value) / 100 })} className="h-8 text-xs text-right" /></td>
              <td className="px-3 py-2 min-w-24"><Input type="number" value={p.plazo_cuotas_dias} onChange={e => update(i, { plazo_cuotas_dias: Number(e.target.value) })} className="h-8 text-xs text-right" /></td>
              <td className="px-3 py-2 min-w-72"><div className="flex gap-2"><Input type="date" value={p.fecha_inicio} onChange={e => update(i, { fecha_inicio: e.target.value })} className="h-8 text-xs" /><Input type="date" value={p.fecha_vencimiento} onChange={e => update(i, { fecha_vencimiento: e.target.value })} className="h-8 text-xs" /></div></td>
              <td className="px-3 py-2"><Button variant="ghost" size="icon" onClick={() => remove(i)} aria-label="Eliminar fila"><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreviewFinancistas({ rows, matches, onChange }: { rows: FinancistaRow[]; matches?: ValidationRow[]; onChange: (rows: FinancistaRow[]) => void }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground py-6 text-center">Sin financistas detectados</p>;
  const update = (i: number, patch: Partial<FinancistaRow>) => onChange(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="w-full text-xs">
        <thead className="bg-secondary/60 text-muted-foreground uppercase tracking-wider">
          <tr>
            <th className="text-left px-3 py-2">Validación</th>
            <th className="text-left px-3 py-2">Tipo</th>
            <th className="text-left px-3 py-2">Razón Social</th>
            <th className="text-left px-3 py-2">RIF/Cédula</th>
            <th className="text-left px-3 py-2">Correo</th>
            <th className="text-left px-3 py-2">Celular</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f, i) => (
            <tr key={i} className="border-t border-border hover:bg-secondary/30">
              <td className="px-3 py-2"><MatchBadge match={matches?.[i]} /></td>
              <td className="px-3 py-2">
                <select value={f.tipo} onChange={e => update(i, { tipo: e.target.value as FinancistaRow["tipo"] })} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
                  <option value="juridica">juridica</option>
                  <option value="natural">natural</option>
                </select>
              </td>
              <td className="px-3 py-2 min-w-56"><Input value={f.razon_social} onChange={e => update(i, { razon_social: e.target.value })} className="h-8 text-xs" /></td>
              <td className="px-3 py-2 min-w-32"><Input value={f.rif ?? ""} onChange={e => update(i, { rif: e.target.value })} className="h-8 font-mono text-xs" /></td>
              <td className="px-3 py-2 min-w-48"><Input value={f.correo ?? ""} onChange={e => update(i, { correo: e.target.value })} className="h-8 text-xs" /></td>
              <td className="px-3 py-2 min-w-32"><Input value={f.celular ?? ""} onChange={e => update(i, { celular: e.target.value })} className="h-8 text-xs" /></td>
              <td className="px-3 py-2"><Button variant="ghost" size="icon" onClick={() => remove(i)} aria-label="Eliminar fila"><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
