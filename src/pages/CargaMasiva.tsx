import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, Trash2, RefreshCw } from "lucide-react";
import {
  parseExcelFile,
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

export default function CargaMasiva() {
  const { isOperador } = useAuth();
  const [parsed, setParsed] = useState<ParsedSheet | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [validating, setValidating] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [validation, setValidation] = useState<ValidationState | null>(null);
  const [tab, setTab] = useState("cedentes");

  if (!isOperador) return <Navigate to="/" replace />;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setSummary(null);
    try {
      const result = await parseExcelFile(f);
      result.cedentes = dedupeCedentes(result.cedentes);
      result.financistas = dedupeFinancistas(result.financistas);
      result.programas = dedupeProgramas(result.programas);
      setParsed(result);
      setValidation(null);
      const total = result.cedentes.length + result.financistas.length + result.programas.length;
      if (total === 0) toast.error("No se detectaron registros válidos");
      else {
        toast.success(`Detectados: ${result.cedentes.length} cedentes · ${result.programas.length} programas · ${result.financistas.length} financistas`);
        void validateMatches(result);
      }
    } catch (err: any) {
      toast.error("Error al leer Excel: " + (err.message ?? String(err)));
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
      const { data } = await supabase.from("cedentes").select("id").eq("rif", c.rif).maybeSingle();
      next.cedentes.push(data ? { status: "actualiza", label: "Match por RIF · actualizará" } : { status: "nuevo", label: "Sin match · creará" });
    }

    const cedentesEnCarga = new Set(source.cedentes.map(c => c.rif?.toUpperCase()).filter(Boolean));
    for (const p of source.programas) {
      if (!p.codigo_pcfb) {
        next.programas.push({ status: "error", label: "Falta PCFB" });
        continue;
      }
      if (!p.cedente_rif) {
        next.programas.push({ status: "error", label: "Falta RIF de cedente" });
        continue;
      }
      let cedenteId: string | undefined;
      const { data: cedente } = await supabase.from("cedentes").select("id").eq("rif", p.cedente_rif).maybeSingle();
      if (cedente) cedenteId = cedente.id;
      if (!cedenteId && cedentesEnCarga.has(p.cedente_rif.toUpperCase())) {
        next.programas.push({ status: "ok", label: "Cedente en carga · programa nuevo" });
        continue;
      }
      if (!cedenteId) {
        next.programas.push({ status: "error", label: "Cedente no encontrado" });
        continue;
      }
      const query = supabase.from("programas").select("id").eq("codigo_pcfb", p.codigo_pcfb).eq("cedente_id", cedenteId);
      const { data: existing } = p.linea ? await query.eq("linea", p.linea).maybeSingle() : await query.is("linea", null).maybeSingle();
      next.programas.push(existing ? { status: "actualiza", label: "Match por PCFB + cedente + línea" } : { status: "nuevo", label: "Sin match · creará" });
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

    // 1) CEDENTES — upsert por RIF
    const cedenteMap = new Map<string, string>(); // rif → id
    for (const c of parsed.cedentes) {
      try {
        const { data: existing } = await supabase
          .from("cedentes").select("id").eq("rif", c.rif).maybeSingle();
        if (existing) {
          const { error } = await supabase.from("cedentes").update({
            razon_social: c.razon_social,
            representante_legal: c.representante_legal ?? null,
            cargo: c.cargo ?? null,
            cedula: c.cedula ?? null,
            nombre_comercial: c.nombre_comercial ?? null,
          }).eq("id", existing.id);
          if (error) throw error;
          cedenteMap.set(c.rif.toUpperCase(), existing.id);
          result.cedentes.actualizados++;
        } else {
          const { data, error } = await supabase.from("cedentes").insert({
            razon_social: c.razon_social, rif: c.rif,
            representante_legal: c.representante_legal ?? null,
            cargo: c.cargo ?? null,
            cedula: c.cedula ?? null,
            nombre_comercial: c.nombre_comercial ?? null,
          }).select("id").single();
          if (error) throw error;
          cedenteMap.set(c.rif.toUpperCase(), data.id);
          result.cedentes.creados++;
        }
      } catch (e: any) {
        result.cedentes.errores.push(`${c.razon_social}: ${e.message ?? e}`);
      }
    }

    // 2) PROGRAMAS — upsert por (codigo_pcfb + linea)
    for (const p of parsed.programas) {
      try {
        let cedenteId: string | undefined;
        if (p.cedente_rif) cedenteId = cedenteMap.get(p.cedente_rif.toUpperCase());
        if (!cedenteId && p.cedente_rif) {
          const { data } = await supabase.from("cedentes").select("id").eq("rif", p.cedente_rif).maybeSingle();
          if (data) cedenteId = data.id;
        }
        if (!cedenteId) {
          result.programas.errores.push(`${p.codigo_pcfb}: cedente con RIF ${p.cedente_rif} no encontrado`);
          continue;
        }
        const { data: existing } = await supabase.from("programas")
          .select("id").eq("codigo_pcfb", p.codigo_pcfb).eq("cedente_id", cedenteId)
          .eq("linea", p.linea ?? "").maybeSingle();
        const payload = {
          codigo_pcfb: p.codigo_pcfb,
          cedente_id: cedenteId,
          linea: p.linea ?? null,
          plazo_ejecucion_dias: p.plazo_ejecucion_dias,
          descuento_base: p.descuento_base,
          plazo_cuotas_dias: p.plazo_cuotas_dias,
          fecha_inicio: p.fecha_inicio,
          fecha_vencimiento: p.fecha_vencimiento,
          contrato_cesion: p.contrato_cesion ?? null,
        };
        if (existing) {
          const { error } = await supabase.from("programas").update(payload).eq("id", existing.id);
          if (error) throw error;
          result.programas.actualizados++;
        } else {
          const { error } = await supabase.from("programas").insert(payload);
          if (error) throw error;
          result.programas.creados++;
        }
      } catch (e: any) {
        result.programas.errores.push(`${p.codigo_pcfb}: ${e.message ?? e}`);
      }
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
    if (totErr === 0) toast.success("Importación completada sin errores");
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

function PreviewProgramas({ rows }: { rows: ProgramaRow[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground py-6 text-center">Sin programas detectados</p>;
  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="w-full text-xs">
        <thead className="bg-secondary/60 text-muted-foreground uppercase tracking-wider">
          <tr>
            <th className="text-left px-3 py-2">PCFB</th>
            <th className="text-left px-3 py-2">Cedente (RIF)</th>
            <th className="text-left px-3 py-2">Línea</th>
            <th className="text-right px-3 py-2">Plazo Ejec.</th>
            <th className="text-right px-3 py-2">Descuento</th>
            <th className="text-right px-3 py-2">Cuotas</th>
            <th className="text-left px-3 py-2">Vigencia</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={i} className="border-t border-border hover:bg-secondary/30">
              <td className="px-3 py-2 font-mono text-primary font-medium">{p.codigo_pcfb}</td>
              <td className="px-3 py-2 font-mono">{p.cedente_rif}</td>
              <td className="px-3 py-2">{p.linea ?? "—"}</td>
              <td className="px-3 py-2 text-right">{p.plazo_ejecucion_dias}d</td>
              <td className="px-3 py-2 text-right font-mono">{(p.descuento_base * 100).toFixed(2)}%</td>
              <td className="px-3 py-2 text-right">{p.plazo_cuotas_dias}d</td>
              <td className="px-3 py-2 text-muted-foreground">{p.fecha_inicio} → {p.fecha_vencimiento}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreviewFinancistas({ rows }: { rows: FinancistaRow[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground py-6 text-center">Sin financistas detectados</p>;
  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="w-full text-xs">
        <thead className="bg-secondary/60 text-muted-foreground uppercase tracking-wider">
          <tr>
            <th className="text-left px-3 py-2">Tipo</th>
            <th className="text-left px-3 py-2">Razón Social</th>
            <th className="text-left px-3 py-2">RIF/Cédula</th>
            <th className="text-left px-3 py-2">Correo</th>
            <th className="text-left px-3 py-2">Celular</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f, i) => (
            <tr key={i} className="border-t border-border hover:bg-secondary/30">
              <td className="px-3 py-2">
                <span className="pill bg-secondary text-secondary-foreground">{f.tipo}</span>
              </td>
              <td className="px-3 py-2 font-medium text-primary">{f.razon_social}</td>
              <td className="px-3 py-2 font-mono">{f.rif ?? f.cedula ?? "—"}</td>
              <td className="px-3 py-2 text-muted-foreground">{f.correo ?? "—"}</td>
              <td className="px-3 py-2 text-muted-foreground">{f.celular ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
