import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatCard, EmptyState, Numeric } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { fmtUSD, fmtDate, todayISO, addDaysISO, fmtPct } from "@/lib/format";
import { FilePlus2, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface Emision {
  id: string; simbolo_cfb: string; valor_nominal_usd: number; fecha_emision: string;
  fecha_vencimiento: string; estado: string; descuento: number; rendimiento_anualizado: number;
  programa_id: string;
}

export default function Dashboard() {
  const { isOperador } = useAuth();
  const [emisiones, setEmisiones] = useState<Emision[]>([]);
  const [vencimientos, setVencimientos] = useState<Emision[]>([]);
  const [programasAlerta, setProgramasAlerta] = useState<{ id: string; codigo_pcfb: string; fecha_vencimiento: string; estado: string; cedentes?: { razon_social: string } }[]>([]);
  const [activity, setActivity] = useState<{ id: string; action: string; resource_type: string; user_email: string | null; created_at: string }[]>([]);
  const [totalUsd, setTotalUsd] = useState(0);
  const [byCedente, setByCedente] = useState<{ name: string; total: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const today = todayISO();
      const in30 = addDaysISO(today, 30);
      const in7 = addDaysISO(today, 7);
      await (supabase.rpc as never as (fn: string) => Promise<unknown>)("refresh_programas_estado").catch(() => {});
      const [{ data: live }, { data: vto }, { data: acts }, { data: byCed }, { data: progsAlert }] = await Promise.all([
        supabase.from("emisiones").select("*").eq("estado", "activa").gte("fecha_vencimiento", today).order("fecha_emision", { ascending: false }).limit(8),
        supabase.from("emisiones").select("*").gte("fecha_vencimiento", today).lte("fecha_vencimiento", in30).order("fecha_vencimiento", { ascending: true }).limit(10),
        supabase.from("audit_log").select("id,action,resource_type,user_email,created_at").order("created_at", { ascending: false }).limit(8),
        supabase.from("emisiones").select("valor_nominal_usd, programas!inner(cedentes!inner(razon_social))").eq("estado", "activa").gte("fecha_vencimiento", today),
        supabase.from("programas").select("id, codigo_pcfb, fecha_vencimiento, estado, cedentes(razon_social)")
          .or(`estado.eq.vencida,and(estado.eq.activa,fecha_vencimiento.lte.${in7})`)
          .order("fecha_vencimiento", { ascending: true }).limit(20),
      ]);
      setEmisiones((live ?? []) as Emision[]);
      setVencimientos((vto ?? []) as Emision[]);
      setActivity(acts ?? []);
      setProgramasAlerta((progsAlert ?? []) as typeof programasAlerta);
      const total = (byCed ?? []).reduce((s, r: { valor_nominal_usd: number }) => s + Number(r.valor_nominal_usd), 0);
      setTotalUsd(total);
      const grouped = new Map<string, number>();
      (byCed ?? []).forEach((r) => {
        const ced = r as { valor_nominal_usd: number; programas: { cedentes: { razon_social: string } } };
        const name = ced.programas?.cedentes?.razon_social ?? "—";
        grouped.set(name, (grouped.get(name) ?? 0) + Number(ced.valor_nominal_usd));
      });
      setByCedente([...grouped.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 5));
      setLoading(false);
    })();
  }, []);

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Vista general de emisiones y vencimientos">
        {isOperador && (
          <Link to="/emisiones/nueva">
            <Button className="bg-gradient-primary shadow-elegant hover:opacity-95">
              <FilePlus2 className="h-4 w-4 mr-2" /> Nueva Emisión
            </Button>
          </Link>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Emisiones activas" value={String(emisiones.length)} hint="Vigentes a hoy" accent />
        <StatCard label="Total VN en circulación" value={fmtUSD(totalUsd)} hint="Suma de valor nominal" />
        <StatCard label="Próximos 30 días" value={String(vencimientos.length)} hint="Vencimientos próximos" />
        <StatCard label="Cedentes activos" value={String(byCedente.length)} hint="Con emisiones vigentes" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live emisiones */}
        <div className="lg:col-span-2 rounded-lg border border-border bg-card shadow-sm-elegant overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-primary">Emisiones recientes</h2>
            <Link to="/emisiones" className="text-xs text-accent hover:underline flex items-center gap-1">
              Ver todas <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {loading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Cargando…</div>
          ) : emisiones.length === 0 ? (
            <EmptyState title="Sin emisiones activas" hint="Crea la primera emisión para verla aquí." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-5 py-2.5 font-semibold">Símbolo</th>
                  <th className="text-right px-5 py-2.5 font-semibold">VN USD</th>
                  <th className="text-right px-5 py-2.5 font-semibold">Rend.</th>
                  <th className="text-left px-5 py-2.5 font-semibold">Vencimiento</th>
                </tr>
              </thead>
              <tbody>
                {emisiones.map(e => (
                  <tr key={e.id} className="border-t border-border hover:bg-secondary/30 transition-smooth">
                    <td className="px-5 py-3">
                      <Link to={`/emisiones/${e.id}`} className="font-mono text-xs font-semibold text-primary hover:text-accent">
                        {e.simbolo_cfb}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-right"><Numeric>{fmtUSD(e.valor_nominal_usd)}</Numeric></td>
                    <td className="px-5 py-3 text-right"><Numeric>{fmtPct(e.rendimiento_anualizado)}</Numeric></td>
                    <td className="px-5 py-3 text-muted-foreground">{fmtDate(e.fecha_vencimiento)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Próximos vencimientos */}
        <div className="rounded-lg border border-border bg-card shadow-sm-elegant overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-display text-lg font-semibold text-primary">Vencimientos · 30 días</h2>
          </div>
          {vencimientos.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">Sin vencimientos próximos.</div>
          ) : (
            <ul className="divide-y divide-border">
              {vencimientos.map(v => (
                <li key={v.id} className="px-5 py-3 flex items-center justify-between">
                  <Link to={`/emisiones/${v.id}`} className="font-mono text-xs text-primary hover:text-accent">{v.simbolo_cfb}</Link>
                  <span className="text-xs text-muted-foreground">{fmtDate(v.fecha_vencimiento)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Programas a vencer / vencidos */}
        <div className="lg:col-span-3 rounded-lg border border-warning/40 bg-card shadow-sm-elegant overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-primary">
              Programas vencidos o por vencer (7 días)
            </h2>
            <Link to="/programas" className="text-xs text-accent hover:underline flex items-center gap-1">
              Gestionar <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {programasAlerta.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">Sin programas en alerta.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-5 py-2 font-semibold">Código</th>
                  <th className="text-left px-5 py-2 font-semibold">Cedente</th>
                  <th className="text-left px-5 py-2 font-semibold">Vence</th>
                  <th className="text-center px-5 py-2 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {programasAlerta.map(p => {
                  const days = Math.ceil((new Date(`${p.fecha_vencimiento}T00:00:00`).getTime() - Date.now()) / 86400000);
                  return (
                    <tr key={p.id} className="border-t border-border hover:bg-secondary/20">
                      <td className="px-5 py-2 font-mono text-xs text-primary">{p.codigo_pcfb}</td>
                      <td className="px-5 py-2 text-xs">{p.cedentes?.razon_social ?? "—"}</td>
                      <td className="px-5 py-2 text-xs text-muted-foreground">
                        {fmtDate(p.fecha_vencimiento)} · {days < 0 ? `vencido hace ${Math.abs(days)}d` : `en ${days}d`}
                      </td>
                      <td className="px-5 py-2 text-center">
                        <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${p.estado === "vencida" ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"}`}>
                          {p.estado === "vencida" ? "VENCIDO" : "POR VENCER"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Top cedentes */}
        <div className="rounded-lg border border-border bg-card shadow-sm-elegant overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-display text-lg font-semibold text-primary">Top Cedentes</h2>
          </div>
          {byCedente.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">Sin datos.</div>
          ) : (
            <ul className="divide-y divide-border">
              {byCedente.map(c => (
                <li key={c.name} className="px-5 py-3 flex items-center justify-between gap-3">
                  <span className="text-sm truncate">{c.name}</span>
                  <Numeric>{fmtUSD(c.total)}</Numeric>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Activity */}
        <div className="lg:col-span-2 rounded-lg border border-border bg-card shadow-sm-elegant overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-primary">Actividad reciente</h2>
            <Link to="/auditoria" className="text-xs text-accent hover:underline flex items-center gap-1">
              Auditoría completa <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {activity.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">Sin actividad registrada.</div>
          ) : (
            <ul className="divide-y divide-border">
              {activity.map(a => (
                <li key={a.id} className="px-5 py-3 text-sm flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <span className="font-medium text-primary capitalize">{a.action}</span>{" "}
                    <span className="text-muted-foreground">· {a.resource_type}</span>
                    <div className="text-xs text-muted-foreground truncate">{a.user_email}</div>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(a.created_at).toLocaleString("es-VE")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
