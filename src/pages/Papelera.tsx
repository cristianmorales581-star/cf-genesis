import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState, Numeric } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { fmtDate, fmtUSD } from "@/lib/format";
import { RotateCcw, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";

interface Row {
  id: string;
  simbolo_cfb: string;
  valor_nominal_usd: number;
  fecha_emision: string;
  fecha_vencimiento: string;
  estado: string;
  deleted_at: string;
  deleted_by: string | null;
  programas?: { codigo_pcfb: string; cedentes?: { razon_social: string } } | null;
  financistas?: { razon_social: string } | null;
}

export default function Papelera() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("emisiones")
      .select("id, simbolo_cfb, valor_nominal_usd, fecha_emision, fecha_vencimiento, estado, deleted_at, deleted_by, programas(codigo_pcfb, cedentes(razon_social)), financistas(razon_social)")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    setRows((data ?? []) as unknown as Row[]);
  }
  useEffect(() => { load(); }, []);

  if (!isAdmin) return <Navigate to="/" replace />;

  async function restore(r: Row) {
    if (!window.confirm(`¿Restaurar el certificado ${r.simbolo_cfb}?`)) return;
    setBusy(true);
    const { error } = await supabase.from("emisiones").update({ deleted_at: null, deleted_by: null }).eq("id", r.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    await logAudit({ action: "update", resource_type: "emision", resource_id: r.id, details: { restored_from_trash: true, simbolo_cfb: r.simbolo_cfb } });
    setRows(prev => prev.filter(x => x.id !== r.id));
    toast.success(`Certificado ${r.simbolo_cfb} restaurado`);
  }

  async function hardDelete(r: Row) {
    if (!window.confirm(`¿Eliminar DEFINITIVAMENTE ${r.simbolo_cfb}? Esta acción no se puede revertir.`)) return;
    setBusy(true);
    const { error } = await supabase.from("emisiones").delete().eq("id", r.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    await logAudit({ action: "delete", resource_type: "emision", resource_id: r.id, details: { simbolo_cfb: r.simbolo_cfb, hard: true } });
    setRows(prev => prev.filter(x => x.id !== r.id));
    toast.success(`Certificado ${r.simbolo_cfb} eliminado definitivamente`);
  }

  return (
    <div>
      <PageHeader title="Papelera" subtitle="Certificados enviados a la papelera. Puedes restaurarlos o eliminarlos definitivamente.">
        <Link to="/emisiones"><Button variant="outline">Volver a Emisiones</Button></Link>
      </PageHeader>

      {rows.length === 0 ? (
        <EmptyState title="La papelera está vacía" hint="Los certificados eliminados aparecerán acá y podrán restaurarse." />
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">Símbolo</th>
                <th className="text-left px-5 py-3 font-semibold">Programa</th>
                <th className="text-left px-5 py-3 font-semibold">Cedente</th>
                <th className="text-left px-5 py-3 font-semibold">Financista</th>
                <th className="text-right px-5 py-3 font-semibold">V.N. USD</th>
                <th className="text-left px-5 py-3 font-semibold">Fecha Emisión</th>
                <th className="text-left px-5 py-3 font-semibold">Eliminado</th>
                <th className="text-right px-5 py-3 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-5 py-3 font-mono text-xs">{r.simbolo_cfb}</td>
                  <td className="px-5 py-3">{r.programas?.codigo_pcfb ?? "—"}</td>
                  <td className="px-5 py-3">{r.programas?.cedentes?.razon_social ?? "—"}</td>
                  <td className="px-5 py-3">{r.financistas?.razon_social ?? "GRUPO CASHEA VE, C.A."}</td>
                  <td className="px-5 py-3 text-right"><Numeric>{fmtUSD(r.valor_nominal_usd)}</Numeric></td>
                  <td className="px-5 py-3">{fmtDate(r.fecha_emision)}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{new Date(r.deleted_at).toLocaleString()}</td>
                  <td className="px-5 py-3 text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={() => restore(r)} disabled={busy}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restaurar
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => hardDelete(r)} disabled={busy}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Eliminar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
