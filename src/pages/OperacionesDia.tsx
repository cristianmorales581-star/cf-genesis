import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState, Numeric, Pill, StatCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { fmtBs, fmtDate, fmtPct, fmtUSD, todayISO } from "@/lib/format";
import { Download, Search, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

const DERECHO_REGISTRO_RATE_DEFAULT = 0.001;
const DERECHO_REGISTRO_RATE_14D = 0.00078;

function getDerechoRegistroRate(dias: number) {
  return dias === 14 ? DERECHO_REGISTRO_RATE_14D : DERECHO_REGISTRO_RATE_DEFAULT;
}
const calcDrUsd = (monto: number, dias: number) => Number(monto) * getDerechoRegistroRate(dias);
const calcDrBs = (monto: number, dias: number, tasa: number) => calcDrUsd(monto, dias) * Number(tasa);

interface Row {
  id: string; simbolo_cfb: string; valor_nominal_usd: number; precio: number;
  fecha_emision: string; fecha_vencimiento: string; estado: string;
  rendimiento_anualizado: number; monto_efectivo_usd: number;
  tasa_cambio_bs_usd: number; dias_colocados: number;
  programas?: { codigo_pcfb: string; cedentes?: { razon_social: string; rif: string } };
  financistas?: { razon_social: string; rif: string } | null;
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Formato idéntico a la hoja "Resumen" que acompaña al vector */
function downloadCSV(filename: string, rows: Row[]) {
  const lines: string[] = [];
  lines.push(["", "Identificador del Estructurador: Grupo Bursatil Venezolano Casa de Bolsa, C.A."].map(csvEscape).join(","));
  lines.push("");
  lines.push([
    "SIMBOLO CFB", "CEDENTE", "R.I.F.", "FECHA EMISIÓN",
    "PRECIO DE EMISIÓN Bs.", "MONTO SIBE", "INVERSIONISTA", "RIF INVERSIONISTA",
  ].map(csvEscape).join(","));
  for (const r of rows) {
    lines.push([
      r.simbolo_cfb,
      r.programas?.cedentes?.razon_social ?? "",
      r.programas?.cedentes?.rif ?? "",
      r.fecha_emision,
      Number(r.precio),
      Math.round(Number(r.monto_efectivo_usd)),
      r.financistas?.razon_social ?? "GRUPO CASHEA VE, C.A.",
      r.financistas?.rif ?? "J-501934070",
    ].map(csvEscape).join(","));
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


type SortKey = "simbolo_cfb" | "cedente" | "valor_nominal_usd" | "monto_efectivo_usd" | "precio" | "rendimiento_anualizado" | "fecha_vencimiento" | "estado";
interface SortConfig { key: SortKey; direction: "asc" | "desc" }

function sortRows(rows: Row[], { key, direction }: SortConfig): Row[] {
  const d = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "simbolo_cfb": cmp = a.simbolo_cfb.localeCompare(b.simbolo_cfb); break;
      case "cedente": cmp = (a.programas?.cedentes?.razon_social ?? "").localeCompare(b.programas?.cedentes?.razon_social ?? ""); break;
      case "valor_nominal_usd": cmp = Number(a.valor_nominal_usd) - Number(b.valor_nominal_usd); break;
      case "monto_efectivo_usd": cmp = Number(a.monto_efectivo_usd) - Number(b.monto_efectivo_usd); break;
      case "precio": cmp = Number(a.precio) - Number(b.precio); break;
      case "rendimiento_anualizado": cmp = Number(a.rendimiento_anualizado) - Number(b.rendimiento_anualizado); break;
      case "fecha_vencimiento": cmp = new Date(a.fecha_vencimiento).getTime() - new Date(b.fecha_vencimiento).getTime(); break;
      case "estado": cmp = a.estado.localeCompare(b.estado); break;
    }
    return cmp * d;
  });
}

function SortTh({ keyName, label, align, sort, onSort }: {
  keyName: SortKey; label: string; align: "left" | "right" | "center";
  sort: SortConfig; onSort: (k: SortKey) => void;
}) {
  const active = sort.key === keyName;
  const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th className={`${alignClass} px-5 py-3 font-semibold cursor-pointer select-none hover:text-foreground transition-colors`} onClick={() => onSort(keyName)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (sort.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </span>
    </th>
  );
}

export default function OperacionesDia() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [fecha, setFecha] = useState(todayISO());
  const [q, setQ] = useState("");
  const [cedente, setCedente] = useState("__all__");
  const [selected, setSelected] = useState<string[]>([]);
  const [sort, setSort] = useState<SortConfig>({ key: "simbolo_cfb", direction: "asc" });

  async function load(dia: string) {
    setLoading(true);
    const { data } = await supabase
      .from("emisiones")
      .select("*, programas(codigo_pcfb, cedentes(razon_social, rif)), financistas(razon_social, rif)")
      .is("deleted_at", null)
      .eq("fecha_emision", dia)
      .order("simbolo_cfb", { ascending: true });
    setRows((data ?? []) as Row[]);
    setSelected([]);
    setLoading(false);
  }
  useEffect(() => { load(fecha); }, [fecha]);

  function toggleSort(key: SortKey) {
    setSort(prev => prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" });
  }

  const cedentes = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { const n = r.programas?.cedentes?.razon_social; if (n) s.add(n); });
    return [...s].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const list = rows.filter(r => {
      if (cedente !== "__all__" && r.programas?.cedentes?.razon_social !== cedente) return false;
      if (q) {
        const t = q.toLowerCase();
        return r.simbolo_cfb.toLowerCase().includes(t)
          || r.programas?.codigo_pcfb?.toLowerCase().includes(t)
          || r.programas?.cedentes?.razon_social?.toLowerCase().includes(t)
          || r.financistas?.razon_social?.toLowerCase().includes(t);
      }
      return true;
    });
    return sortRows(list, sort);
  }, [rows, q, cedente, sort]);

  const filteredIds = filtered.map(r => r.id);
  const allSelected = filteredIds.length > 0 && filteredIds.every(id => selected.includes(id));

  const totals = useMemo(() => {
    let vn = 0, sibe = 0, drUsd = 0, drBs = 0;
    for (const r of filtered) {
      vn += Number(r.valor_nominal_usd) || 0;
      sibe += Math.round(Number(r.valor_nominal_usd)) || 0;
      drUsd += calcDrUsd(Number(r.monto_efectivo_usd), r.dias_colocados);
      drBs += calcDrBs(Number(r.monto_efectivo_usd), r.dias_colocados, Number(r.tasa_cambio_bs_usd));
    }
    return { vn, sibe, drUsd, drBs, count: filtered.length };
  }, [filtered]);

  function exportCSV(scope: "filtered" | "selected") {
    const subset = scope === "selected" ? filtered.filter(r => selected.includes(r.id)) : filtered;
    if (!subset.length) return;
    downloadCSV(`operaciones_dia_${fecha}_${scope}.csv`, subset);
  }

  const esHoy = fecha === todayISO();

  return (
    <>
      <PageHeader
        title="Operaciones del día"
        subtitle={esHoy ? "Certificados con fecha de emisión de hoy" : `Certificados emitidos el ${fmtDate(fecha)}`}
      >
        <Button variant="outline" onClick={() => load(fecha)} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-1.5" /> Actualizar
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Operaciones" value={String(totals.count)} hint={fmtDate(fecha)} accent />
        <StatCard label="Total VN USD" value={fmtUSD(totals.vn)} hint="Valor nominal" />
        <StatCard label="Monto SIBE" value={fmtNumber(totals.sibe, 0)} hint="Monto nominal redondeado" />
        <StatCard label="Derecho de registro" value={fmtUSD(totals.drUsd)} hint={fmtBs(totals.drBs)} />
      </div>

      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por símbolo, programa, cedente o financista…" className="pl-9" />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">Fecha</Label>
          <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="w-[170px]" />
          {!esHoy && (
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setFecha(todayISO())}>Hoy</Button>
          )}
        </div>
        <Select value={cedente} onValueChange={setCedente}>
          <SelectTrigger className="w-full md:w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos los cedentes</SelectItem>
            {cedentes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => exportCSV("filtered")}>
          <Download className="h-4 w-4 mr-1.5" /> CSV ({filtered.length})
        </Button>
        {selected.length > 0 && (
          <Button variant="outline" onClick={() => exportCSV("selected")}>
            <Download className="h-4 w-4 mr-1.5" /> CSV selección ({selected.length})
          </Button>
        )}
      </div>

      <div className="surface-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Cargando…</div>
        ) : filtered.length === 0 ? (
          <EmptyState title="Sin operaciones" hint="No hay certificados emitidos en la fecha seleccionada." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead className="bg-secondary/40 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={e => setSelected(prev => e.target.checked ? [...new Set([...prev, ...filteredIds])] : prev.filter(id => !filteredIds.includes(id)))}
                      aria-label="Seleccionar todas"
                    />
                  </th>
                  <SortTh keyName="simbolo_cfb" label="Símbolo" align="left" sort={sort} onSort={toggleSort} />
                  <SortTh keyName="cedente" label="Cedente / Financista" align="left" sort={sort} onSort={toggleSort} />
                  <SortTh keyName="valor_nominal_usd" label="VN USD" align="right" sort={sort} onSort={toggleSort} />
                  <SortTh keyName="monto_efectivo_usd" label="Monto SIBE" align="right" sort={sort} onSort={toggleSort} />
                  <th className="text-right px-5 py-3 font-semibold" title="0.078% a 14 días, 0.1% otros plazos">Der. Registro</th>
                  <SortTh keyName="precio" label="Precio" align="right" sort={sort} onSort={toggleSort} />
                  <SortTh keyName="rendimiento_anualizado" label="Rend." align="right" sort={sort} onSort={toggleSort} />
                  <SortTh keyName="fecha_vencimiento" label="Vencimiento" align="left" sort={sort} onSort={toggleSort} />
                  <SortTh keyName="estado" label="Estado" align="center" sort={sort} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const drUsd = calcDrUsd(Number(r.monto_efectivo_usd), r.dias_colocados);
                  const drBs = calcDrBs(Number(r.monto_efectivo_usd), r.dias_colocados, Number(r.tasa_cambio_bs_usd));
                  return (
                    <tr key={r.id} className="border-t border-border hover:bg-secondary/30 transition-smooth">
                      <td className="px-5 py-3">
                        <input
                          type="checkbox"
                          checked={selected.includes(r.id)}
                          onChange={e => setSelected(prev => e.target.checked ? [...prev, r.id] : prev.filter(x => x !== r.id))}
                          aria-label={`Seleccionar ${r.simbolo_cfb}`}
                        />
                      </td>
                      <td className="px-5 py-3">
                        <Link to={`/emisiones/${r.id}`} className="font-mono text-xs font-semibold text-accent hover:underline">{r.simbolo_cfb}</Link>
                        <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{r.programas?.codigo_pcfb}</div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="text-xs font-medium text-foreground">{r.programas?.cedentes?.razon_social}</div>
                        <div className="text-[11px] text-muted-foreground">Financista: {r.financistas?.razon_social ?? "GRUPO CASHEA VE, C.A."}</div>
                      </td>
                      <td className="px-5 py-3 text-right"><Numeric>{fmtUSD(r.valor_nominal_usd)}</Numeric></td>
                      <td className="px-5 py-3 text-right"><Numeric>{fmtUSD(r.monto_efectivo_usd)}</Numeric></td>
                      <td className="px-5 py-3 text-right">
                        <Numeric>{fmtUSD(drUsd)}</Numeric>
                        <div className="text-[10px] text-muted-foreground tabular-nums">{fmtBs(drBs)}</div>
                      </td>
                      <td className="px-5 py-3 text-right"><Numeric>{Number(r.precio).toFixed(5)}</Numeric></td>
                      <td className="px-5 py-3 text-right"><Numeric>{fmtPct(r.rendimiento_anualizado, 2)}</Numeric></td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">
                        {fmtDate(r.fecha_vencimiento)}
                        <div className="text-[10px]">{r.dias_colocados} días</div>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <Pill tone={r.estado === "activa" ? "success" : r.estado === "vencida" ? "warning" : "default"}>{r.estado}</Pill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-secondary/70 border-t-2 border-border font-semibold text-foreground">
                <tr>
                  <td className="px-5 py-3"></td>
                  <td className="px-5 py-3 text-xs uppercase tracking-wide">Total ({totals.count})</td>
                  <td className="px-5 py-3"></td>
                  <td className="px-5 py-3 text-right"><Numeric>{fmtUSD(totals.vn)}</Numeric></td>
                  <td className="px-5 py-3 text-right"><Numeric>{fmtUSD(totals.sibe)}</Numeric></td>
                  <td className="px-5 py-3 text-right">
                    <Numeric>{fmtUSD(totals.drUsd)}</Numeric>
                    <div className="text-[10px] text-muted-foreground tabular-nums">{fmtBs(totals.drBs)}</div>
                  </td>
                  <td className="px-5 py-3"></td>
                  <td className="px-5 py-3"></td>
                  <td className="px-5 py-3"></td>
                  <td className="px-5 py-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
