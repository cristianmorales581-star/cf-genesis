import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState, Numeric, Pill } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { fmtBs, fmtDate, fmtPct, fmtUSD } from "@/lib/format";
import { FilePlus2, Search, Trash2, Download, FilterX, SlidersHorizontal } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";

const DERECHO_REGISTRO_RATE_DEFAULT = 0.001; // 0.1%
const DERECHO_REGISTRO_RATE_14D = 0.00078;   // 0.078%

function getDerechoRegistroRate(dias: number) {
  return dias === 14 ? DERECHO_REGISTRO_RATE_14D : DERECHO_REGISTRO_RATE_DEFAULT;
}

const calcDerechoRegistroUsd = (montoEfectivoUsd: number, dias: number) => {
  const rate = getDerechoRegistroRate(dias);
  return Math.round(Number(montoEfectivoUsd) * rate * 100) / 100;
};
const calcDerechoRegistroBs = (montoEfectivoUsd: number, dias: number, tasa: number) =>
  Math.round(calcDerechoRegistroUsd(montoEfectivoUsd, dias) * Number(tasa) * 100) / 100;

interface Row {
  id: string; simbolo_cfb: string; valor_nominal_usd: number; precio: number;
  fecha_emision: string; fecha_vencimiento: string; estado: string;
  rendimiento_anualizado: number; monto_efectivo_usd: number;
  tasa_cambio_bs_usd: number; dias_colocados: number;
  programas?: { codigo_pcfb: string; cedentes?: { razon_social: string } };
  financistas?: { razon_social: string } | null;
}

function daysRemaining(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(`${iso}T00:00:00`);
  return Math.ceil((end.getTime() - today.getTime()) / 86400000);
}

type EstadoFilter = "todos" | "activa" | "vencida" | "redimida";

const INITIAL_FILTERS = {
  q: "",
  estado: "todos" as EstadoFilter,
  cedente: "__all__",
  financista: "__all__",
  fechaEmDesde: "",
  fechaEmHasta: "",
  fechaVcDesde: "",
  fechaVcHasta: "",
  rendMin: "",
  rendMax: "",
  vnMin: "",
  vnMax: "",
};

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCSV(filename: string, rows: Row[]) {
  const header = [
    "Simbolo CFB", "Programa", "Cedente", "Financista",
    "Valor Nominal USD", "Monto Efectivo USD", "Precio",
    "Rendimiento Anualizado", "Fecha Emisión", "Fecha Vencimiento", "Estado",
    "Tasa BCV Emisión", "Derecho de Registro USD", "Derecho de Registro Bs",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const drUsd = calcDerechoRegistroUsd(Number(r.monto_efectivo_usd), r.dias_colocados);
    const drBs = calcDerechoRegistroBs(Number(r.monto_efectivo_usd), r.dias_colocados, Number(r.tasa_cambio_bs_usd));
    lines.push([
      r.simbolo_cfb,
      r.programas?.codigo_pcfb ?? "",
      r.programas?.cedentes?.razon_social ?? "",
      r.financistas?.razon_social ?? "GRUPO CASHEA VE, C.A.",
      Number(r.valor_nominal_usd).toFixed(2),
      Number(r.monto_efectivo_usd).toFixed(2),
      Number(r.precio).toFixed(5),
      Number(r.rendimiento_anualizado).toFixed(4),
      r.fecha_emision,
      r.fecha_vencimiento,
      r.estado,
      Number(r.tasa_cambio_bs_usd).toFixed(4),
      drUsd.toFixed(2),
      drBs.toFixed(2),
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

export default function Emisiones() {
  const { isOperador, isAdmin } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [f, setF] = useState(INITIAL_FILTERS);

  function setFilter<K extends keyof typeof INITIAL_FILTERS>(k: K, v: (typeof INITIAL_FILTERS)[K]) {
    setF(prev => ({ ...prev, [k]: v }));
  }

  async function load() {
    const { data } = await supabase
      .from("emisiones")
      .select("*, programas(codigo_pcfb, cedentes(razon_social)), financistas(razon_social)")
      .order("fecha_emision", { ascending: false });
    setRows((data ?? []) as Row[]);
  }
  useEffect(() => { load(); }, []);

  async function deleteEmission(row: Row) {
    if (!window.confirm(`¿Eliminar definitivamente el certificado ${row.simbolo_cfb}?`)) return;
    const { error } = await supabase.from("emisiones").delete().eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    await logAudit({ action: "delete", resource_type: "emision", resource_id: row.id, details: { simbolo_cfb: row.simbolo_cfb } });
    setRows(prev => prev.filter(r => r.id !== row.id));
    toast.success(`Certificado ${row.simbolo_cfb} eliminado`);
  }

  async function deleteSelected() {
    const selectedRows = rows.filter(r => selected.includes(r.id));
    if (!selectedRows.length) return;
    if (!window.confirm(`¿Eliminar definitivamente ${selectedRows.length} certificado(s) seleccionado(s)?`)) return;
    setDeleting(true);
    const { error } = await supabase.from("emisiones").delete().in("id", selected);
    if (error) { toast.error(error.message); setDeleting(false); return; }
    await logAudit({
      action: "bulk_delete", resource_type: "emision",
      details: { count: selectedRows.length, simbolos_cfb: selectedRows.map(r => r.simbolo_cfb) },
    });
    setRows(prev => prev.filter(r => !selected.includes(r.id)));
    setSelected([]);
    setDeleting(false);
    toast.success(`${selectedRows.length} certificado(s) eliminado(s)`);
  }

  const cedentes = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { const n = r.programas?.cedentes?.razon_social; if (n) s.add(n); });
    return [...s].sort();
  }, [rows]);

  const financistas = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { const n = r.financistas?.razon_social ?? "GRUPO CASHEA VE, C.A."; s.add(n); });
    return [...s].sort();
  }, [rows]);

  const filtered = useMemo(() => rows.filter(r => {
    if (f.estado !== "todos" && r.estado !== f.estado) return false;
    if (f.cedente !== "__all__" && r.programas?.cedentes?.razon_social !== f.cedente) return false;
    if (f.financista !== "__all__") {
      const name = r.financistas?.razon_social ?? "GRUPO CASHEA VE, C.A.";
      if (name !== f.financista) return false;
    }
    if (f.fechaEmDesde && r.fecha_emision < f.fechaEmDesde) return false;
    if (f.fechaEmHasta && r.fecha_emision > f.fechaEmHasta) return false;
    if (f.fechaVcDesde && r.fecha_vencimiento < f.fechaVcDesde) return false;
    if (f.fechaVcHasta && r.fecha_vencimiento > f.fechaVcHasta) return false;
    const rend = Number(r.rendimiento_anualizado);
    if (f.rendMin !== "" && rend < Number(f.rendMin) / 100) return false;
    if (f.rendMax !== "" && rend > Number(f.rendMax) / 100) return false;
    const vn = Number(r.valor_nominal_usd);
    if (f.vnMin !== "" && vn < Number(f.vnMin)) return false;
    if (f.vnMax !== "" && vn > Number(f.vnMax)) return false;
    if (f.q) {
      const t = f.q.toLowerCase();
      return r.simbolo_cfb.toLowerCase().includes(t)
        || r.programas?.codigo_pcfb?.toLowerCase().includes(t)
        || r.programas?.cedentes?.razon_social?.toLowerCase().includes(t)
        || r.financistas?.razon_social?.toLowerCase().includes(t);
    }
    return true;
  }), [rows, f]);

  const filteredIds = filtered.map(r => r.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selected.includes(id));

  function toggleAllFiltered(checked: boolean) {
    setSelected(prev => checked ? [...new Set([...prev, ...filteredIds])] : prev.filter(id => !filteredIds.includes(id)));
  }
  function toggleSelected(id: string, checked: boolean) {
    setSelected(prev => checked ? [...prev, id] : prev.filter(x => x !== id));
  }

  function exportCSV(scope: "filtered" | "selected") {
    const subset = scope === "selected"
      ? filtered.filter(r => selected.includes(r.id))
      : filtered;
    if (!subset.length) { toast.error("No hay filas para exportar"); return; }
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCSV(`emisiones_${scope}_${stamp}.csv`, subset);
    toast.success(`Exportadas ${subset.length} emisiones`);
  }

  const activeFilterCount = [
    f.estado !== "todos", f.cedente !== "__all__", f.financista !== "__all__",
    !!f.fechaEmDesde, !!f.fechaEmHasta, !!f.fechaVcDesde, !!f.fechaVcHasta,
    f.rendMin !== "", f.rendMax !== "", f.vnMin !== "", f.vnMax !== "",
  ].filter(Boolean).length;

  return (
    <>
      <PageHeader title="Emisiones" subtitle="Listado completo de Certificados de Financiamiento Bursátil">
        {isOperador && (
          <Link to="/emisiones/nueva">
            <Button className="bg-gradient-gold text-accent-foreground hover:opacity-95">
              <FilePlus2 className="h-4 w-4 mr-1.5" /> Nueva Emisión
            </Button>
          </Link>
        )}
      </PageHeader>

      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={f.q} onChange={e => setFilter("q", e.target.value)} placeholder="Buscar por símbolo, programa, cedente o financista…" className="pl-9" />
        </div>
        <Button variant="outline" onClick={() => setShowFilters(s => !s)}>
          <SlidersHorizontal className="h-4 w-4 mr-1.5" />
          Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </Button>
        <Button variant="outline" onClick={() => exportCSV("filtered")}>
          <Download className="h-4 w-4 mr-1.5" /> CSV ({filtered.length})
        </Button>
        {selected.length > 0 && (
          <Button variant="outline" onClick={() => exportCSV("selected")}>
            <Download className="h-4 w-4 mr-1.5" /> CSV selección ({selected.length})
          </Button>
        )}
        {isAdmin && selected.length > 0 && (
          <Button variant="destructive" onClick={deleteSelected} disabled={deleting}>
            <Trash2 className="h-4 w-4 mr-1.5" /> Borrar {selected.length}
          </Button>
        )}
      </div>

      {showFilters && (
        <div className="surface-card p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Estado</Label>
            <Select value={f.estado} onValueChange={(v) => setFilter("estado", v as EstadoFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="activa">Activa</SelectItem>
                <SelectItem value="vencida">Vencida</SelectItem>
                <SelectItem value="redimida">Redimida</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Cedente</Label>
            <Select value={f.cedente} onValueChange={(v) => setFilter("cedente", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {cedentes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Financista</Label>
            <Select value={f.financista} onValueChange={(v) => setFilter("financista", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {financistas.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="ghost" size="sm" onClick={() => setF(INITIAL_FILTERS)} className="text-xs">
              <FilterX className="h-3.5 w-3.5 mr-1" /> Limpiar filtros
            </Button>
          </div>

          <div>
            <Label className="text-xs">Emisión desde</Label>
            <Input type="date" value={f.fechaEmDesde} onChange={e => setFilter("fechaEmDesde", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Emisión hasta</Label>
            <Input type="date" value={f.fechaEmHasta} onChange={e => setFilter("fechaEmHasta", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Vencimiento desde</Label>
            <Input type="date" value={f.fechaVcDesde} onChange={e => setFilter("fechaVcDesde", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Vencimiento hasta</Label>
            <Input type="date" value={f.fechaVcHasta} onChange={e => setFilter("fechaVcHasta", e.target.value)} />
          </div>

          <div>
            <Label className="text-xs">Rendimiento mín. (%)</Label>
            <Input type="number" step="0.01" value={f.rendMin} onChange={e => setFilter("rendMin", e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label className="text-xs">Rendimiento máx. (%)</Label>
            <Input type="number" step="0.01" value={f.rendMax} onChange={e => setFilter("rendMax", e.target.value)} placeholder="100" />
          </div>
          <div>
            <Label className="text-xs">VN USD mín.</Label>
            <Input type="number" step="1" value={f.vnMin} onChange={e => setFilter("vnMin", e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label className="text-xs">VN USD máx.</Label>
            <Input type="number" step="1" value={f.vnMax} onChange={e => setFilter("vnMax", e.target.value)} placeholder="∞" />
          </div>
        </div>
      )}

      <div className="surface-card overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState title="Sin emisiones" hint="Ajusta los filtros o crea una nueva emisión." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead className="bg-secondary/40 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold w-10">
                    <input type="checkbox" checked={allFilteredSelected} onChange={e => toggleAllFiltered(e.target.checked)} aria-label="Seleccionar emisiones filtradas" />
                  </th>
                  <th className="text-left px-5 py-3 font-semibold">Símbolo</th>
                  <th className="text-left px-5 py-3 font-semibold">Cedente / Financista</th>
                  <th className="text-right px-5 py-3 font-semibold">VN USD</th>
                  <th className="text-right px-5 py-3 font-semibold">Monto SIBE</th>
                  <th className="text-right px-5 py-3 font-semibold" title="0.078% a 14 días, 0.1% otros plazos. Sobre monto efectivo (Bs fijado a la tasa BCV del día de emisión)">Der. Registro</th>
                  <th className="text-right px-5 py-3 font-semibold">Precio</th>
                  <th className="text-right px-5 py-3 font-semibold">Rend.</th>
                  <th className="text-left px-5 py-3 font-semibold">Vigencia</th>
                  <th className="text-center px-5 py-3 font-semibold">Estado</th>
                  {isAdmin && <th className="text-right px-5 py-3 font-semibold"></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const remaining = daysRemaining(r.fecha_vencimiento);
                  const drUsd = calcDerechoRegistroUsd(Number(r.monto_efectivo_usd));
                  const drBs = calcDerechoRegistroBs(Number(r.monto_efectivo_usd), Number(r.tasa_cambio_bs_usd));
                  return <tr key={r.id} className="border-t border-border hover:bg-secondary/30 transition-smooth">
                    <td className="px-5 py-3">
                      <input type="checkbox" checked={selected.includes(r.id)} onChange={e => toggleSelected(r.id, e.target.checked)} aria-label={`Seleccionar ${r.simbolo_cfb}`} />
                    </td>
                    <td className="px-5 py-3">
                      <Link to={`/emisiones/${r.id}`} className="font-mono text-xs font-semibold text-accent hover:underline">
                        {r.simbolo_cfb}
                      </Link>
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
                      <div>{fmtDate(r.fecha_emision)} → {fmtDate(r.fecha_vencimiento)}</div>
                      <div className={remaining < 0 ? "text-warning" : "text-accent"}>{remaining < 0 ? `${Math.abs(remaining)} días vencida` : `${remaining} días restantes`}</div>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <Pill tone={r.estado === "activa" ? "success" : r.estado === "vencida" ? "warning" : "default"}>{r.estado}</Pill>
                    </td>
                    {isAdmin && (
                      <td className="px-5 py-3 text-right">
                        <Button variant="ghost" size="icon" onClick={() => deleteEmission(r)} aria-label={`Eliminar ${r.simbolo_cfb}`}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    )}
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
