import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader, EmptyState, Numeric } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { fmtUSD } from "@/lib/format";
import { Checkbox } from "@/components/ui/checkbox";
import { Download } from "lucide-react";
import { toast } from "sonner";

// Parámetros de cálculo de honorarios (escalonado por VN USD acumulado mensual)
export const HONORARIOS_TRAMO_1_BASE = 10_000_000;
export const HONORARIOS_TRAMO_2_BASE = 10_000_000;
export const HONORARIOS_TASA_1 = 0.0009; // 0.09%
export const HONORARIOS_TASA_2 = 0.0005; // 0.05%
export const HONORARIOS_TASA_3 = 0.0002; // 0.02%
export const CM_RATE = 0.05;             // 5% de honorarios globales

export function calcHonorarios(totalVnUsd: number) {
  const t1 = Math.min(totalVnUsd, HONORARIOS_TRAMO_1_BASE);
  const t2 = Math.min(Math.max(totalVnUsd - HONORARIOS_TRAMO_1_BASE, 0), HONORARIOS_TRAMO_2_BASE);
  const t3 = Math.max(totalVnUsd - HONORARIOS_TRAMO_1_BASE - HONORARIOS_TRAMO_2_BASE, 0);
  const fee1 = t1 * HONORARIOS_TASA_1;
  const fee2 = t2 * HONORARIOS_TASA_2;
  const fee3 = t3 * HONORARIOS_TASA_3;
  const total = fee1 + fee2 + fee3;
  return {
    base1: t1, base2: t2, base3: t3,
    fee1, fee2, fee3,
    total,
    cm: total * CM_RATE,
  };
}

interface Row {
  id: string;
  valor_nominal_usd: number;
  fecha_emision: string;
  programas?: { cedentes?: { razon_social: string } };
}

interface MonthAgg {
  month: string;        // YYYY-MM
  label: string;        // "Enero 2026"
  count: number;
  totalVn: number;
  fee: ReturnType<typeof calcHonorarios>;
}

const MES_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export default function Honorarios() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [cedente, setCedente] = useState("__all__");
  const [year, setYear] = useState("__all__");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("emisiones")
        .select("id, valor_nominal_usd, fecha_emision, programas(cedentes(razon_social))")
        .order("fecha_emision", { ascending: false });
      setRows((data ?? []) as Row[]);
    })();
  }, []);

  const cedentes = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { const n = r.programas?.cedentes?.razon_social; if (n) s.add(n); });
    return [...s].sort();
  }, [rows]);

  const years = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => s.add(r.fecha_emision.slice(0,4)));
    return [...s].sort().reverse();
  }, [rows]);

  const filtered = useMemo(() => rows.filter(r => {
    if (cedente !== "__all__" && r.programas?.cedentes?.razon_social !== cedente) return false;
    if (year !== "__all__" && r.fecha_emision.slice(0,4) !== year) return false;
    return true;
  }), [rows, cedente, year]);

  const visibleMonths = useMemo(() => new Set(months.map(m => m.month)), [months]);

  const months: MonthAgg[] = useMemo(() => {
    const map = new Map<string, { count: number; totalVn: number }>();
    for (const r of filtered) {
      const m = r.fecha_emision.slice(0,7);
      const prev = map.get(m) ?? { count: 0, totalVn: 0 };
      prev.count += 1;
      prev.totalVn += Number(r.valor_nominal_usd);
      map.set(m, prev);
    }
    return [...map.entries()]
      .map(([month, v]) => {
        const [y, mo] = month.split("-");
        return {
          month,
          label: `${MES_ES[Number(mo)-1]} ${y}`,
          count: v.count,
          totalVn: v.totalVn,
          fee: calcHonorarios(v.totalVn),
        };
      })
      .sort((a,b) => b.month.localeCompare(a.month));
  }, [filtered]);

  const totals = useMemo(() => {
    const t = months.reduce((acc, m) => ({
      count: acc.count + m.count,
      totalVn: acc.totalVn + m.totalVn,
      fee1: acc.fee1 + m.fee.fee1,
      fee2: acc.fee2 + m.fee.fee2,
      fee3: acc.fee3 + m.fee.fee3,
      total: acc.total + m.fee.total,
      cm: acc.cm + m.fee.cm,
    }), { count: 0, totalVn: 0, fee1: 0, fee2: 0, fee3: 0, total: 0, cm: 0 });
    return t;
  }, [months]);

  function exportCSV() {
    if (!months.length) { toast.error("No hay datos para exportar"); return; }
    const header = [
      "Mes", "Emisiones", "VN USD Total",
      "Base Tramo 1", "Honorarios Tramo 1 (0.09%)",
      "Base Tramo 2", "Honorarios Tramo 2 (0.05%)",
      "Base Tramo 3", "Honorarios Tramo 3 (0.02%)",
      "Honorarios Total",
      ...(isAdmin ? ["CM (5%)"] : []),
    ];
    const lines = [header.join(",")];
    for (const m of months) {
      lines.push([
        m.label, m.count, m.totalVn.toFixed(2),
        m.fee.base1.toFixed(2), m.fee.fee1.toFixed(2),
        m.fee.base2.toFixed(2), m.fee.fee2.toFixed(2),
        m.fee.base3.toFixed(2), m.fee.fee3.toFixed(2),
        m.fee.total.toFixed(2),
        ...(isAdmin ? [m.fee.cm.toFixed(2)] : []),
      ].map(csvEscape).join(","));
    }
    lines.push([
      "TOTAL", totals.count, totals.totalVn.toFixed(2),
      "", totals.fee1.toFixed(2),
      "", totals.fee2.toFixed(2),
      "", totals.fee3.toFixed(2),
      totals.total.toFixed(2),
      ...(isAdmin ? [totals.cm.toFixed(2)] : []),
    ].map(csvEscape).join(","));
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `honorarios_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        title="Honorarios"
        subtitle="Cálculo escalonado mensual sobre el Valor Nominal USD colocado"
      >
        <Button variant="outline" onClick={exportCSV}>
          <Download className="h-4 w-4 mr-1.5" /> Exportar CSV
        </Button>
      </PageHeader>

      <div className="surface-card p-4 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Año</Label>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Cedente</Label>
          <Select value={cedente} onValueChange={setCedente}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {cedentes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="text-xs text-muted-foreground sm:col-span-1 flex items-end">
          Tramos: 0–10M → 0.09% · 10M–20M → 0.05% · resto → 0.02%
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        {months.length === 0 ? (
          <EmptyState title="Sin datos" hint="Ajusta los filtros." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1000px]">
              <thead className="bg-secondary/40 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Mes</th>
                  <th className="text-right px-5 py-3 font-semibold"># Emis.</th>
                  <th className="text-right px-5 py-3 font-semibold">VN USD</th>
                  <th className="text-right px-5 py-3 font-semibold" title="Primeros 10M @ 0.09%">Tramo 1</th>
                  <th className="text-right px-5 py-3 font-semibold" title="Siguientes 10M @ 0.05%">Tramo 2</th>
                  <th className="text-right px-5 py-3 font-semibold" title="Resto @ 0.02%">Tramo 3</th>
                  <th className="text-right px-5 py-3 font-semibold">Honorarios</th>
                  {isAdmin && (
                    <th className="text-right px-5 py-3 font-semibold" title="5% de honorarios globales">CM</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {months.map(m => (
                  <tr key={m.month} className="border-t border-border hover:bg-secondary/30 transition-smooth">
                    <td className="px-5 py-3 font-medium">{m.label}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{m.count}</td>
                    <td className="px-5 py-3 text-right"><Numeric>{fmtUSD(m.totalVn)}</Numeric></td>
                    <td className="px-5 py-3 text-right">
                      <Numeric>{fmtUSD(m.fee.fee1)}</Numeric>
                      <div className="text-[10px] text-muted-foreground tabular-nums">sobre {fmtUSD(m.fee.base1)}</div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Numeric>{fmtUSD(m.fee.fee2)}</Numeric>
                      <div className="text-[10px] text-muted-foreground tabular-nums">sobre {fmtUSD(m.fee.base2)}</div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Numeric>{fmtUSD(m.fee.fee3)}</Numeric>
                      <div className="text-[10px] text-muted-foreground tabular-nums">sobre {fmtUSD(m.fee.base3)}</div>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold"><Numeric>{fmtUSD(m.fee.total)}</Numeric></td>
                    {isAdmin && (
                      <td className="px-5 py-3 text-right text-accent font-semibold"><Numeric>{fmtUSD(m.fee.cm)}</Numeric></td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-secondary/40 text-xs font-semibold">
                <tr>
                  <td className="px-5 py-3">TOTAL</td>
                  <td className="px-5 py-3 text-right tabular-nums">{totals.count}</td>
                  <td className="px-5 py-3 text-right"><Numeric>{fmtUSD(totals.totalVn)}</Numeric></td>
                  <td className="px-5 py-3 text-right"><Numeric>{fmtUSD(totals.fee1)}</Numeric></td>
                  <td className="px-5 py-3 text-right"><Numeric>{fmtUSD(totals.fee2)}</Numeric></td>
                  <td className="px-5 py-3 text-right"><Numeric>{fmtUSD(totals.fee3)}</Numeric></td>
                    <td className="px-5 py-3 text-right"><Numeric>{fmtUSD(totals.total)}</Numeric></td>
                    {isAdmin && (
                      <td className="px-5 py-3 text-right text-accent"><Numeric>{fmtUSD(totals.cm)}</Numeric></td>
                    )}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
