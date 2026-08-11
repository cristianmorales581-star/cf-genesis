import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatCard, EmptyState, Numeric, Pill } from "@/components/ui-bits";
import { fmtUSD, fmtDate, fmtPct, todayISO, diffDays } from "@/lib/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Briefcase, Download } from "lucide-react";

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '""';
  return `"${String(v).replace(/"/g, '""')}"`;
}
function csvNum(n: number | null | undefined, decimals = 4): string {
  const v = Number(n);
  if (!isFinite(v)) return "";
  return v.toFixed(decimals);
}


interface EmisionRow {
  id: string;
  simbolo_cfb: string;
  valor_nominal_usd: number;
  precio: number;
  fecha_emision: string;
  fecha_vencimiento: string;
  rendimiento_anualizado: number;
  estado: string;
  financista_id: string | null;
  financistas: { id: string; razon_social: string } | null;
  programas: { cedentes: { razon_social: string } | null } | null;
}

/**
 * Precio dinámico zero-coupon a descuento.
 * Invierte la fórmula de rendimiento anualizado:
 *   r = ((1 - p) / p) * (360 / dias)  =>  p = 360 / (360 + r * dias)
 * dias = días restantes hasta vencimiento (mínimo 0 => precio = 1).
 */
function precioActual(rendimientoAnual: number, diasRestantes: number): number {
  if (diasRestantes <= 0) return 1;
  if (rendimientoAnual <= 0) return 1;
  return 360 / (360 + rendimientoAnual * diasRestantes);
}

export default function Portafolio() {
  const [rows, setRows] = useState<EmisionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [financistaId, setFinancistaId] = useState<string>("all");
  // Tick para recalcular precios periódicamente (cada minuto)
  const [, setTick] = useState(0);

  useEffect(() => {
    (async () => {
      const today = todayISO();
      const { data } = await supabase
        .from("emisiones")
        .select("id, simbolo_cfb, valor_nominal_usd, precio, fecha_emision, fecha_vencimiento, rendimiento_anualizado, estado, financista_id, financistas(id, razon_social), programas(cedentes(razon_social))")
        .eq("estado", "activa")
        .is("deleted_at", null)
        .gte("fecha_vencimiento", today)
        .order("fecha_vencimiento", { ascending: true });
      setRows((data ?? []) as unknown as EmisionRow[]);
      setLoading(false);
    })();
    const t = setInterval(() => setTick(x => x + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const financistas = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach(r => { if (r.financistas) map.set(r.financistas.id, r.financistas.razon_social); });
    return [...map.entries()].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [rows]);

  const filtered = useMemo(
    () => financistaId === "all" ? rows : rows.filter(r => r.financista_id === financistaId),
    [rows, financistaId]
  );

  const today = todayISO();
  const enriched = useMemo(() => filtered.map(r => {
    const diasRest = Math.max(0, diffDays(today, r.fecha_vencimiento));
    const pActual = precioActual(Number(r.rendimiento_anualizado), diasRest);
    const vn = Number(r.valor_nominal_usd);
    const pEmi = Number(r.precio);
    const valorAdq = vn * pEmi;
    const valorMkt = vn * pActual;
    return { ...r, diasRest, pActual, valorAdq, valorMkt, pnl: valorMkt - valorAdq };
  }), [filtered, today]);

  const totals = useMemo(() => enriched.reduce((acc, r) => ({
    vn: acc.vn + Number(r.valor_nominal_usd),
    adq: acc.adq + r.valorAdq,
    mkt: acc.mkt + r.valorMkt,
  }), { vn: 0, adq: 0, mkt: 0 }), [enriched]);

  return (
    <>
      <PageHeader title="Portafolio" subtitle="Títulos vigentes en cartera con valoración dinámica a precio de mercado">
        <div className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-accent" />
          <Select value={financistaId} onValueChange={setFinancistaId}>
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Financista" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los financistas</SelectItem>
              {financistas.map(f => (
                <SelectItem key={f.id} value={f.id}>{f.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Títulos vigentes" value={String(enriched.length)} hint="En cartera" accent />
        <StatCard label="Valor nominal" value={fmtUSD(totals.vn)} hint="Suma VN USD" />
        <StatCard label="Valor adquisición" value={fmtUSD(totals.adq)} hint="VN × precio emisión" />
        <StatCard label="Valor de mercado" value={fmtUSD(totals.mkt)} hint="VN × precio actual" />
      </div>

      <div className="rounded-lg border border-border bg-card shadow-sm-elegant overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-primary">Posiciones</h2>
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Precio recalculado en vivo · base 360
          </span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Cargando portafolio…</div>
        ) : enriched.length === 0 ? (
          <EmptyState title="Sin títulos en cartera" hint="No hay emisiones vigentes para el filtro seleccionado." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Símbolo</th>
                  <th className="text-left px-4 py-3 font-semibold">Cedente</th>
                  <th className="text-left px-4 py-3 font-semibold">Financista</th>
                  <th className="text-right px-4 py-3 font-semibold">VN USD</th>
                  <th className="text-right px-4 py-3 font-semibold">Rend.</th>
                  <th className="text-left px-4 py-3 font-semibold">Vence</th>
                  <th className="text-right px-4 py-3 font-semibold">Plazo rest.</th>
                  <th className="text-right px-4 py-3 font-semibold">P. emisión</th>
                  <th className="text-right px-4 py-3 font-semibold">P. actual</th>
                  <th className="text-right px-4 py-3 font-semibold">Valor adq.</th>
                  <th className="text-right px-4 py-3 font-semibold">Valor mercado</th>
                  <th className="text-right px-4 py-3 font-semibold">Δ</th>
                </tr>
              </thead>
              <tbody>
                {enriched.map(r => (
                  <tr key={r.id} className="border-t border-border hover:bg-secondary/30 transition-smooth">
                    <td className="px-4 py-3">
                      <Link to={`/emisiones/${r.id}`} className="font-mono text-xs font-semibold text-primary hover:text-accent">
                        {r.simbolo_cfb}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs">{r.programas?.cedentes?.razon_social ?? "—"}</td>
                    <td className="px-4 py-3 text-xs">{r.financistas?.razon_social ?? "—"}</td>
                    <td className="px-4 py-3 text-right"><Numeric>{fmtUSD(Number(r.valor_nominal_usd))}</Numeric></td>
                    <td className="px-4 py-3 text-right"><Numeric>{fmtPct(Number(r.rendimiento_anualizado), 2)}</Numeric></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(r.fecha_vencimiento)}</td>
                    <td className="px-4 py-3 text-right"><Numeric>{r.diasRest} d</Numeric></td>
                    <td className="px-4 py-3 text-right"><Numeric>{fmtPct(Number(r.precio))}</Numeric></td>
                    <td className="px-4 py-3 text-right"><Numeric><span className="text-accent">{fmtPct(r.pActual)}</span></Numeric></td>
                    <td className="px-4 py-3 text-right"><Numeric>{fmtUSD(r.valorAdq)}</Numeric></td>
                    <td className="px-4 py-3 text-right"><Numeric>{fmtUSD(r.valorMkt)}</Numeric></td>
                    <td className="px-4 py-3 text-right">
                      <Pill tone={r.pnl >= 0 ? "success" : "danger"}>
                        {r.pnl >= 0 ? "+" : ""}{fmtUSD(r.pnl)}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-secondary/30 font-semibold">
                  <td className="px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground" colSpan={3}>Totales</td>
                  <td className="px-4 py-3 text-right"><Numeric>{fmtUSD(totals.vn)}</Numeric></td>
                  <td colSpan={5}></td>
                  <td className="px-4 py-3 text-right"><Numeric>{fmtUSD(totals.adq)}</Numeric></td>
                  <td className="px-4 py-3 text-right"><Numeric>{fmtUSD(totals.mkt)}</Numeric></td>
                  <td className="px-4 py-3 text-right">
                    <Pill tone={totals.mkt - totals.adq >= 0 ? "success" : "danger"}>
                      {totals.mkt - totals.adq >= 0 ? "+" : ""}{fmtUSD(totals.mkt - totals.adq)}
                    </Pill>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
