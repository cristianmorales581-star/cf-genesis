import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Loader2, RotateCcw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Numeric, StatCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtDate, fmtUSD } from "@/lib/format";
import { consolidateCedentes, emissionCedente, type IssuedRow } from "@/lib/cedenteConsolidation";

const CHART_COLORS = [
  "hsl(188 70% 52%)", "hsl(152 56% 48%)", "hsl(35 90% 58%)", "hsl(262 60% 62%)",
  "hsl(0 70% 60%)", "hsl(210 80% 60%)", "hsl(90 55% 50%)", "hsl(320 60% 60%)",
];
const MAX_CHART_CEDENTES = 8;
const fmtCompactUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(n);

export default function ConsolidadoCedentes() {
  const [rows, setRows] = useState<IssuedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [mode, setMode] = useState<"month" | "week">("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cedenteId, setCedenteId] = useState("__all__");
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError("");
      try {
        const collected: IssuedRow[] = [];
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await supabase.from("emisiones")
            .select("fecha_emision, valor_nominal_usd, cedentes(id, razon_social, rif), programas(cedentes(id, razon_social, rif))")
            .is("deleted_at", null).order("fecha_emision", { ascending: false }).order("id").range(offset, offset + 999);
          if (error) throw error;
          collected.push(...(data ?? []));
          if (!data || data.length < 1000) break;
        }
        if (!cancelled) setRows(collected);
      } catch (err) { if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo cargar el consolidado"); }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [revision]);
  const cedentes = useMemo(() => {
    const catalog = new Map<string, { id: string; razon_social: string }>();
    for (const row of rows) { const cedente = emissionCedente(row); if (cedente) catalog.set(cedente.id, cedente); }
    return [...catalog.values()].sort((a, b) => a.razon_social.localeCompare(b.razon_social));
  }, [rows]);
  const invalidRange = Boolean(from && to && from > to);
  const filtered = useMemo(() => invalidRange ? [] : rows.filter(r => (!from || r.fecha_emision >= from) && (!to || r.fecha_emision <= to) && (cedenteId === "__all__" || emissionCedente(r)?.id === cedenteId)), [rows, from, to, cedenteId, invalidRange]);
  const consolidated = useMemo(() => consolidateCedentes(filtered, mode), [filtered, mode]);
  const nominal = filtered.reduce((sum, row) => sum + Number(row.valor_nominal_usd), 0);
  const chart = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of consolidated) totals.set(row.cedente, (totals.get(row.cedente) ?? 0) + row.nominal);
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const top = ranked.slice(0, MAX_CHART_CEDENTES).map(([name]) => name);
    const series = ranked.length > MAX_CHART_CEDENTES ? [...top, "Otros"] : top;
    const periods = new Map<string, Record<string, number | string>>();
    for (const row of consolidated) {
      const bucket = series.includes(row.cedente) ? row.cedente : "Otros";
      const point = periods.get(row.start) ?? { periodo: row.start };
      point[bucket] = (Number(point[bucket]) || 0) + row.nominal;
      periods.set(row.start, point);
    }
    const data = [...periods.values()].sort((a, b) => String(a.periodo).localeCompare(String(b.periodo)));
    return { data, series };
  }, [consolidated]);
  return <>
    <PageHeader title="Consolidado por cedente" />
    <div className="flex flex-wrap items-end gap-4 mb-6">
      <div className="w-full sm:w-80 min-w-0"><Label htmlFor="consolidado-cedente">Cedente</Label>
        <Select value={cedenteId} onValueChange={setCedenteId}><SelectTrigger id="consolidado-cedente" className="mt-2"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="__all__">Todos los cedentes</SelectItem>{cedentes.map(c => <SelectItem key={c.id} value={c.id}>{c.razon_social}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label htmlFor="consolidado-from">Desde</Label><Input id="consolidado-from" type="date" value={from} onChange={e => setFrom(e.target.value)} className="mt-2 w-44" /></div>
      <div><Label htmlFor="consolidado-to">Hasta</Label><Input id="consolidado-to" type="date" value={to} onChange={e => setTo(e.target.value)} className="mt-2 w-44" /></div>
      <Button variant="ghost" size="icon" aria-label="Limpiar filtros" title="Limpiar filtros" onClick={() => { setFrom(""); setTo(""); setCedenteId("__all__"); }}><RotateCcw className="h-4 w-4" /></Button>
    </div>
    {invalidRange && <p role="alert" className="text-sm text-destructive mb-4">La fecha inicial debe ser anterior o igual a la fecha final.</p>}
    {error ? <div role="alert" className="text-destructive py-8">No se pudo cargar el consolidado. <Button variant="outline" onClick={() => setRevision(r => r + 1)}>Reintentar</Button></div>
      : loading ? <div role="status" className="flex items-center justify-center gap-3 py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Cargando consolidado…</div>
      : <>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr] gap-4 mb-6"><div className="surface-card p-5 min-w-0 sm:col-span-2 lg:col-span-1"><p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold">Monto nominal emitido USD</p><p className="mt-2 font-display text-xl font-semibold tabular-nums break-all">{fmtUSD(nominal)}</p></div><StatCard label="CFB emitidos" value={String(filtered.length)} /><StatCard label="Cedentes" value={String(new Set(consolidated.map(r => r.cedenteId)).size)} /></div>
        <Tabs value={mode} onValueChange={value => { if (value === "month" || value === "week") setMode(value); }} className="mb-4"><TabsList aria-label="Periodo del consolidado"><TabsTrigger value="month">Por mes</TabsTrigger><TabsTrigger value="week">Por semana</TabsTrigger></TabsList></Tabs>
        <div className="overflow-x-auto border-y border-border"><table className="w-full min-w-[760px] text-sm" aria-label={mode === "month" ? "Consolidado mensual por cedente" : "Consolidado semanal por cedente"}>
          <thead className="bg-secondary/40 text-xs text-muted-foreground"><tr><th className="text-left px-4 py-3">{mode === "month" ? "Mes" : "Semana (lunes a domingo)"}</th><th className="text-left px-4 py-3">Cedente</th><th className="text-left px-4 py-3">RIF</th><th className="text-right px-4 py-3">CFB</th><th className="text-right px-4 py-3 whitespace-nowrap">Monto nominal emitido USD</th></tr></thead>
          <tbody>{consolidated.map(row => <tr key={row.key} className="border-t border-border hover:bg-secondary/30"><td className="px-4 py-3 whitespace-nowrap capitalize">{mode === "month" ? format(parseISO(row.start), "MMMM yyyy", { locale: es }) : `${fmtDate(row.start)} – ${fmtDate(row.end)}`}</td><td className="px-4 py-3 font-medium">{row.cedente}</td><td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{row.rif}</td><td className="px-4 py-3 text-right tabular-nums">{row.count}</td><td className="px-4 py-3 text-right whitespace-nowrap"><Numeric>{fmtUSD(row.nominal)}</Numeric></td></tr>)}{!consolidated.length && <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">Sin emisiones en este período</td></tr>}</tbody>
          <tfoot className="bg-secondary/40 font-semibold border-t border-border"><tr><td colSpan={3} className="px-4 py-3">Total</td><td className="px-4 py-3 text-right tabular-nums">{filtered.length}</td><td className="px-4 py-3 text-right whitespace-nowrap"><Numeric>{fmtUSD(nominal)}</Numeric></td></tr></tfoot>
        </table></div>
      </>}
  </>;
}