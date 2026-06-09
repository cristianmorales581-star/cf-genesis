import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState, Numeric, Pill } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtDate, fmtPct, fmtUSD } from "@/lib/format";
import { FilePlus2, Search, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";

interface Row {
  id: string; simbolo_cfb: string; valor_nominal_usd: number; precio: number;
  fecha_emision: string; fecha_vencimiento: string; estado: string;
  rendimiento_anualizado: number; monto_efectivo_usd: number;
  programas?: { codigo_pcfb: string; cedentes?: { razon_social: string } };
  financistas?: { razon_social: string } | null;
}

function daysRemaining(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(`${iso}T00:00:00`);
  return Math.ceil((end.getTime() - today.getTime()) / 86400000);
}

export default function Emisiones() {
  const { isOperador, isAdmin } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<"todos" | "activa" | "vencida" | "redimida">("todos");

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
    if (error) {
      toast.error(error.message);
      return;
    }
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
    if (error) {
      toast.error(error.message);
      setDeleting(false);
      return;
    }
    await logAudit({
      action: "bulk_delete",
      resource_type: "emision",
      details: { count: selectedRows.length, simbolos_cfb: selectedRows.map(r => r.simbolo_cfb) },
    });
    setRows(prev => prev.filter(r => !selected.includes(r.id)));
    setSelected([]);
    setDeleting(false);
    toast.success(`${selectedRows.length} certificado(s) eliminado(s)`);
  }

  const filtered = rows.filter(r => {
    if (estado !== "todos" && r.estado !== estado) return false;
    if (q) {
      const t = q.toLowerCase();
      return r.simbolo_cfb.toLowerCase().includes(t)
        || r.programas?.codigo_pcfb?.toLowerCase().includes(t)
        || r.programas?.cedentes?.razon_social?.toLowerCase().includes(t)
        || r.financistas?.razon_social?.toLowerCase().includes(t);
    }
    return true;
  });
  const filteredIds = filtered.map(r => r.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selected.includes(id));

  function toggleAllFiltered(checked: boolean) {
    setSelected(prev => checked ? [...new Set([...prev, ...filteredIds])] : prev.filter(id => !filteredIds.includes(id)));
  }

  function toggleSelected(id: string, checked: boolean) {
    setSelected(prev => checked ? [...prev, id] : prev.filter(x => x !== id));
  }

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
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por símbolo, programa, cedente o financista…" className="pl-9" />
        </div>
        {isAdmin && selected.length > 0 && (
          <Button variant="destructive" onClick={deleteSelected} disabled={deleting}>
            <Trash2 className="h-4 w-4 mr-1.5" /> Borrar {selected.length} seleccionado(s)
          </Button>
        )}
        <div className="flex gap-1.5">
          {(["todos", "activa", "vencida", "redimida"] as const).map(e => (
            <Button key={e} size="sm" variant={estado === e ? "default" : "outline"} onClick={() => setEstado(e)} className="capitalize text-xs">
              {e}
            </Button>
          ))}
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState title="Sin emisiones" hint="Crea la primera emisión para verla aquí." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                {isAdmin && (
                  <th className="text-left px-5 py-3 font-semibold w-10">
                    <input type="checkbox" checked={allFilteredSelected} onChange={e => toggleAllFiltered(e.target.checked)} aria-label="Seleccionar emisiones filtradas" />
                  </th>
                )}
                <th className="text-left px-5 py-3 font-semibold">Símbolo</th>
                <th className="text-left px-5 py-3 font-semibold">Cedente / Financista</th>
                <th className="text-right px-5 py-3 font-semibold">VN USD</th>
                <th className="text-right px-5 py-3 font-semibold">Monto SIBE</th>
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
                return <tr key={r.id} className="border-t border-border hover:bg-secondary/30 transition-smooth">
                  {isAdmin && (
                    <td className="px-5 py-3">
                      <input type="checkbox" checked={selected.includes(r.id)} onChange={e => toggleSelected(r.id, e.target.checked)} aria-label={`Seleccionar ${r.simbolo_cfb}`} />
                    </td>
                  )}
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
        )}
      </div>
    </>
  );
}
