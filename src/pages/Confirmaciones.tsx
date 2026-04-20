import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState, Numeric, Pill } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { fmtBs, fmtUSD, todayISO } from "@/lib/format";

// CSV expected columns:
// simbolo_cfb,tipo,contraparte_razon_social,fecha_operacion,fecha_valor,monto_efectivo_usd,valor_efectivo_bs

interface ParsedRow {
  simbolo_cfb: string;
  tipo: "CDC" | "CDV";
  contraparte_razon_social: string;
  fecha_operacion: string;
  fecha_valor: string;
  monto_efectivo_usd: number;
  valor_efectivo_bs: number;
  emision_id?: string;
  error?: string;
}

export default function Confirmaciones() {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);

  async function onFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const text = await f.text();
    const parsed = parseCSV(text);
    if (parsed.length === 0) { toast.error("CSV vacío o formato inválido"); return; }
    // Resolve emision_id by simbolo_cfb
    const simbolos = [...new Set(parsed.map(r => r.simbolo_cfb))];
    const { data: emisiones } = await supabase.from("emisiones").select("id, simbolo_cfb").in("simbolo_cfb", simbolos);
    const map = new Map((emisiones ?? []).map(e => [e.simbolo_cfb, e.id]));
    const validated = parsed.map(r => {
      const emision_id = map.get(r.simbolo_cfb);
      let error;
      if (!emision_id) error = "Símbolo no existe";
      else if (!["CDC", "CDV"].includes(r.tipo)) error = "Tipo inválido (CDC/CDV)";
      else if (!r.contraparte_razon_social) error = "Contraparte requerida";
      else if (!(r.monto_efectivo_usd > 0)) error = "Monto USD inválido";
      return { ...r, emision_id, error };
    });
    setRows(validated);
  }

  async function commit() {
    const valid = rows.filter(r => !r.error && r.emision_id);
    if (valid.length === 0) { toast.error("No hay filas válidas"); return; }
    setBusy(true);
    const payload = valid.map(r => ({
      emision_id: r.emision_id!,
      tipo: r.tipo,
      contraparte_razon_social: r.contraparte_razon_social,
      fecha_operacion: r.fecha_operacion,
      fecha_valor: r.fecha_valor,
      monto_efectivo_usd: r.monto_efectivo_usd,
      valor_efectivo_bs: r.valor_efectivo_bs,
    }));
    const { error } = await supabase.from("confirmaciones").insert(payload);
    if (error) toast.error(error.message);
    else {
      await logAudit({ action: "upload", resource_type: "confirmaciones_bulk", details: { count: valid.length } });
      toast.success(`${valid.length} confirmaciones creadas`);
      setRows([]); setFileName("");
    }
    setBusy(false);
  }

  function downloadTemplate() {
    const sample = `simbolo_cfb,tipo,contraparte_razon_social,fecha_operacion,fecha_valor,monto_efectivo_usd,valor_efectivo_bs
CFB-CASHEA-2025-C-0001,CDC,Inversionista Demo C.A.,${todayISO()},${todayISO()},96000.00,3456000.00
CFB-CASHEA-2025-C-0001,CDV,Banco Demo C.A.,${todayISO()},${todayISO()},96500.00,3474000.00`;
    const blob = new Blob([sample], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "plantilla-confirmaciones.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const validCount = rows.filter(r => !r.error).length;

  return (
    <>
      <PageHeader title="Confirmaciones" subtitle="Carga masiva del vector SIBE y generación de CDC/CDV">
        <Button variant="outline" onClick={downloadTemplate}>Descargar plantilla CSV</Button>
      </PageHeader>

      <div className="surface-card p-6 mb-6">
        <Label className="block mb-3">Archivo CSV (vector SIBE)</Label>
        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
          <Input type="file" accept=".csv,text/csv" onChange={onFile} className="md:max-w-md" />
          {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
          <div className="md:ml-auto flex gap-2">
            {rows.length > 0 && (
              <>
                <Pill tone="success">{validCount} válidas</Pill>
                {rows.length - validCount > 0 && <Pill tone="danger">{rows.length - validCount} con error</Pill>}
                <Button onClick={commit} disabled={busy || validCount === 0} className="bg-gradient-gold text-accent-foreground">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Upload className="h-4 w-4 mr-1.5" />}
                  Confirmar {validCount}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState title="Sin archivo cargado" hint="Carga un CSV para previsualizar y confirmar." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="text-center px-3 py-3"></th>
                <th className="text-left px-5 py-3">Símbolo</th>
                <th className="text-left px-5 py-3">Tipo</th>
                <th className="text-left px-5 py-3">Contraparte</th>
                <th className="text-left px-5 py-3">F. Valor</th>
                <th className="text-right px-5 py-3">USD</th>
                <th className="text-right px-5 py-3">Bs</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={`border-t border-border ${r.error ? "bg-destructive/5" : ""}`}>
                  <td className="px-3 py-2.5 text-center">
                    {r.error ? <AlertTriangle className="h-4 w-4 text-destructive inline" /> : <CheckCircle2 className="h-4 w-4 text-success inline" />}
                  </td>
                  <td className="px-5 py-2.5 font-mono text-xs">{r.simbolo_cfb}</td>
                  <td className="px-5 py-2.5"><Pill tone={r.tipo === "CDC" ? "accent" : "success"}>{r.tipo}</Pill></td>
                  <td className="px-5 py-2.5">
                    {r.contraparte_razon_social}
                    {r.error && <div className="text-[11px] text-destructive mt-0.5">{r.error}</div>}
                  </td>
                  <td className="px-5 py-2.5 text-xs text-muted-foreground">{r.fecha_valor}</td>
                  <td className="px-5 py-2.5 text-right"><Numeric>{fmtUSD(r.monto_efectivo_usd)}</Numeric></td>
                  <td className="px-5 py-2.5 text-right"><Numeric>{fmtBs(r.valor_efectivo_bs)}</Numeric></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
  const idx = (k: string) => headers.indexOf(k);
  const out: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.trim());
    if (cols.length === 0 || !cols[0]) continue;
    out.push({
      simbolo_cfb: cols[idx("simbolo_cfb")] ?? "",
      tipo: (cols[idx("tipo")] as "CDC" | "CDV") ?? "CDC",
      contraparte_razon_social: cols[idx("contraparte_razon_social")] ?? "",
      fecha_operacion: cols[idx("fecha_operacion")] ?? todayISO(),
      fecha_valor: cols[idx("fecha_valor")] ?? todayISO(),
      monto_efectivo_usd: parseFloat(cols[idx("monto_efectivo_usd")] ?? "0"),
      valor_efectivo_bs: parseFloat(cols[idx("valor_efectivo_bs")] ?? "0"),
    });
  }
  return out;
}
