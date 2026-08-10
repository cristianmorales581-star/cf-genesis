import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import {
  buildRasRows, buildRasXlsx, rasFilename, rasMonthLabel,
  RAS_UMBRAL_USD, RAS_HEADERS, type RasEmision,
} from "@/lib/rasXlsx";

interface Emision {
  id: string;
  fecha_emision: string;
  monto_efectivo_usd: number;
  valor_efectivo_bs: number;
  cedentes?: { razon_social: string; rif: string } | null;
  programas?: { cedentes?: { razon_social: string; rif: string } | null } | null;
  financistas?: { razon_social: string; rif: string | null } | null;
}

const nf = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ReporteRas() {
  const [emisiones, setEmisiones] = useState<Emision[]>([]);
  const [month, setMonth] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("emisiones")
        .select(
          "id, fecha_emision, monto_efectivo_usd, valor_efectivo_bs, cedentes(razon_social, rif), programas(cedentes(razon_social, rif)), financistas(razon_social, rif)"
        )
        .is("deleted_at", null)
        .order("fecha_emision", { ascending: false });
      if (error) toast.error("No se pudieron cargar las emisiones");
      const list = (data ?? []) as unknown as Emision[];
      setEmisiones(list);
      if (list.length) setMonth(list[0].fecha_emision.slice(0, 7));
      setLoading(false);
    })();
  }, []);

  const months = useMemo(() => {
    const s = new Set<string>();
    emisiones.forEach(e => s.add(e.fecha_emision.slice(0, 7)));
    return [...s].sort().reverse();
  }, [emisiones]);

  const rows = useMemo(() => {
    const delMes: RasEmision[] = emisiones
      .filter(e => e.fecha_emision.slice(0, 7) === month)
      .map(e => ({
        fecha_emision: e.fecha_emision,
        monto_efectivo_usd: Number(e.monto_efectivo_usd),
        valor_efectivo_bs: Number(e.valor_efectivo_bs),
        cedente: e.cedentes ?? e.programas?.cedentes ?? null,
        financista: e.financistas ?? null,
      }));
    return buildRasRows(delMes);
  }, [emisiones, month]);

  const excluidas = useMemo(
    () => emisiones.filter(e => e.fecha_emision.slice(0, 7) === month && Number(e.monto_efectivo_usd) < RAS_UMBRAL_USD).length,
    [emisiones, month]
  );

  function download() {
    if (!rows.length) { toast.error("No hay operaciones para el mes seleccionado"); return; }
    const buf = buildRasXlsx(rows);
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = rasFilename(month);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Reporte RAS ${rasMonthLabel(month)} descargado`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reporte RAS"
        subtitle="Reporte regulatorio de operaciones ≥ 50.000,00 USD — venta (cedente) y compra (financista) por cada certificado"
      />

      <div className="rounded-lg border border-border bg-card p-4 flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label className="text-xs">Mes del reporte</Label>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Selecciona un mes" /></SelectTrigger>
            <SelectContent>
              {months.map(m => (
                <SelectItem key={m} value={m}>{rasMonthLabel(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-sm text-muted-foreground">
          <div><span className="font-medium text-foreground">{rows.length}</span> operaciones ({rows.length / 2} certificados)</div>
          {excluidas > 0 && <div className="text-xs">{excluidas} certificado(s) excluido(s) por ser menores a 50.000,00 USD</div>}
        </div>
        <Button onClick={download} disabled={!rows.length} className="ml-auto gap-2">
          <Download className="h-4 w-4" /> Descargar reporte (.xlsx)
        </Button>
      </div>

      {loading ? null : rows.length === 0 ? (
        <EmptyState
          title="Sin operaciones reportables"
          hint="No hay certificados iguales o mayores a 50.000,00 USD en el mes seleccionado."
        />
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {RAS_HEADERS.map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-1.5 whitespace-nowrap">{r.nombre}</td>
                  <td className="px-3 py-1.5">{r.tipo}</td>
                  <td className="px-3 py-1.5 tabular-nums">{r.identificacion}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{r.fecha.split("-").reverse().join("-")}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap text-xs">{r.concepto}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{nf.format(r.monto_bs)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{nf.format(r.monto_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
