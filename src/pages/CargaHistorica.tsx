import { useState, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/ui-bits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, Loader2, CheckCircle2, AlertCircle, Database, Download } from "lucide-react";

function downloadTemplate() {
  const headers = [
    "SIMBOLO CFB",
    "R.I.F.",
    "CEDENTE",
    "FECHA EMISIÓN",
    "FECHA DE VCTO",
    "PLAZO",
    "RENDIMIENTO",
    "VOLUMEN DE ORDENES DE COMPRA",
    "PRECIO DE EMISIÓN (%)",
    "VALOR NOMINAL $",
    "VALOR EFECTIVO $",
    "TDC",
    "VALOR EFECTIVO BS",
  ];
  const example = [
    "CFB-EJEMPLO-2026-001",
    "J-123456789",
    "EJEMPLO C.A.",
    "2026-01-15",
    "2026-01-29",
    14,
    0.36,
    10,
    0.986,
    100000,
    98600,
    36.5,
    3598900,
  ];
  const notas = [
    "Formato requerido:",
    "• Los encabezados deben estar EXACTAMENTE en la fila 4 (deja filas 1-3 vacías o con títulos).",
    "• SIMBOLO CFB: único, no puede repetirse ni existir ya en la base.",
    "• R.I.F.: debe existir en el módulo de Cedentes (ej: J-123456789).",
    "• FECHA EMISIÓN / FECHA DE VCTO: formato yyyy-mm-dd o dd/mm/yyyy.",
    "• PRECIO DE EMISIÓN (%): decimal entre 0 y 1 (ej: 0.986 = 98.6%).",
    "• PLAZO: en días (si falta, se calcula de las fechas).",
    "• RENDIMIENTO: decimal anual (si falta, se calcula del precio y plazo).",
    "• VALOR NOMINAL $ y TDC son obligatorios.",
    "• VALOR EFECTIVO $ y VALOR EFECTIVO BS se recalculan si faltan.",
  ];
  const aoa: any[][] = [
    ["PLANTILLA CARGA HISTÓRICA — SICEBOP"],
    [],
    [],
    headers,
    example,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = headers.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "BITACORA DE EMISIONES");
  const wsNotas = XLSX.utils.aoa_to_sheet(notas.map((n) => [n]));
  wsNotas["!cols"] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, wsNotas, "INSTRUCCIONES");
  XLSX.writeFile(wb, "plantilla_carga_historica.xlsx");
}

interface ParsedRow {
  rowNum: number;
  simbolo: string;
  rif: string;
  cedenteLabel?: string;
  fechaEmision: string;
  fechaVencimiento?: string;
  plazo?: number;
  rendimiento?: number;
  volumenOrdenes?: number;
  precio: number;
  valorNominalUsd: number;
  montoEfectivoUsd?: number;
  tdc: number;
  valorEfectivoBs?: number;
  status: "ok" | "warning" | "error";
  motivo?: string;
  cedente_id?: string;
  programa_id?: string | null;
}

const normRif = (v: any) => String(v ?? "").trim().toUpperCase().replace(/\s+/g, "");

function excelDateToIso(v: any): string | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return undefined;
    const iso = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    return iso;
  }
  const s = String(v).trim();
  // Acepta separadores /, -, . y también " 0:00:00" al final
  const clean = s.split(/\s+/)[0];
  const parts = clean.split(/[\/\-.]/);
  if (parts.length === 3) {
    let [a, b, c] = parts;
    // yyyy-mm-dd
    if (a.length === 4) return `${a}-${b.padStart(2, "0")}-${c.padStart(2, "0")}`;
    // dd-mm-yy(yy) — expandir año de 2 dígitos
    if (c.length === 2) c = (Number(c) > 50 ? "19" : "20") + c;
    if (c.length !== 4) return undefined;
    return `${c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

const toNum = (v: any): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? undefined : n;
};

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffDays(a: string, b: string): number {
  const da = new Date(a + "T12:00:00Z").getTime();
  const db = new Date(b + "T12:00:00Z").getTime();
  return Math.round((db - da) / 86400000);
}

export default function CargaHistorica() {
  const { user, isAdmin } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [sheetName, setSheetName] = useState("BITACORA DE EMISIONES");
  const [headerRow, setHeaderRow] = useState(4); // 1-indexed
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [cedentes, setCedentes] = useState<Array<{ id: string; rif: string; razon_social: string }>>([]);
  const [programas, setProgramas] = useState<Array<{ id: string; codigo_pcfb: string; cedente_id: string; fecha_inicio?: string; fecha_vencimiento?: string }>>([]);
  const [existingSimbolos, setExistingSimbolos] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const [c, p, e] = await Promise.all([
        supabase.from("cedentes").select("id, rif, razon_social"),
        supabase.from("programas").select("id, codigo_pcfb, cedente_id, fecha_inicio, fecha_vencimiento"),
        supabase.from("emisiones").select("simbolo_cfb"),
      ]);
      setCedentes(c.data ?? []);
      setProgramas((p.data as any) ?? []);
      setExistingSimbolos(new Set((e.data ?? []).map((r) => r.simbolo_cfb)));
    })();
  }, []);

  if (!isAdmin) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Solo administradores pueden cargar histórico.
      </div>
    );
  }

  const cedByRif = useMemo(() => {
    const m = new Map<string, { id: string; razon_social: string }>();
    cedentes.forEach((c) => m.set(normRif(c.rif), { id: c.id, razon_social: c.razon_social }));
    return m;
  }, [cedentes]);

  const progsByCedente = useMemo(() => {
    const m = new Map<string, typeof programas>();
    programas.forEach((p) => {
      const arr = m.get(p.cedente_id) ?? [];
      arr.push(p);
      m.set(p.cedente_id, arr);
    });
    return m;
  }, [programas]);

  function pickProgramaForCedente(cedente_id: string, fechaEmision: string): string | null {
    const list = progsByCedente.get(cedente_id) ?? [];
    if (list.length === 0) return null;
    if (list.length === 1) return list[0].id;
    const inRange = list.find(
      (p) => (!p.fecha_inicio || p.fecha_inicio <= fechaEmision) && (!p.fecha_vencimiento || p.fecha_vencimiento >= fechaEmision)
    );
    return (inRange ?? list[0]).id;
  }

  async function handleFile(f: File) {
    setFile(f);
    setLoading(true);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      const targetSheet = wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0];
      if (targetSheet !== sheetName) {
        setSheetName(targetSheet);
        toast.info(`Hoja "${sheetName}" no encontrada. Uso "${targetSheet}".`);
      }
      const ws = wb.Sheets[targetSheet];
      const all: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
      const headerIdx = headerRow - 1;
      const header = (all[headerIdx] ?? []).map((h: any) => String(h ?? "").trim().toUpperCase());
      const dataRows = all.slice(headerIdx + 1);

      const col = (...names: string[]) => {
        for (const n of names) {
          const idx = header.indexOf(n.toUpperCase());
          if (idx >= 0) return idx;
        }
        return -1;
      };
      const cSim = col("SIMBOLO CFB", "SÍMBOLO CFB", "SIMBOLO");
      const cRif = col("R.I.F.", "RIF");
      const cCed = col("CEDENTE");
      const cFEm = col("FECHA EMISIÓN", "FECHA EMISION");
      const cFVc = col("FECHA DE VCTO", "FECHA VENCIMIENTO", "FECHA VCTO");
      const cPla = col("PLAZO", "DIAS", "DÍAS");
      const cRen = col("RENDIMIENTO");
      const cVol = col("VOLUMEN DE ORDENES DE COMPRA", "VOLUMEN", "ORDENES");
      const cPre = col("PRECIO DE EMISIÓN (%)", "PRECIO DE EMISION (%)", "PRECIO");
      const cVN = col("VALOR NOMINAL $", "VALOR NOMINAL", "VN");
      const cEf = col("VALOR EFECTIVO $", "VALOR EFECTIVO");
      const cTDC = col("TDC", "TASA DE CAMBIO", "TASA BCV");
      const cBs = col("VALOR EFECTIVO BS", "VEF BS");

      if (cSim < 0 || cRif < 0 || cFEm < 0 || cPre < 0 || cVN < 0 || cTDC < 0) {
        toast.error("Faltan columnas mínimas: SIMBOLO CFB, R.I.F., FECHA EMISIÓN, PRECIO, VALOR NOMINAL, TDC.");
        setRows([]);
        return;
      }

      const parsed: ParsedRow[] = [];
      const seenSym = new Set<string>();
      dataRows.forEach((r, i) => {
        const simbolo = String(r[cSim] ?? "").trim();
        if (!simbolo) return; // skip blank
        const rif = normRif(r[cRif]);
        const fechaEmision = excelDateToIso(r[cFEm]);
        const fechaVenc = cFVc >= 0 ? excelDateToIso(r[cFVc]) : undefined;
        const precio = toNum(r[cPre]) ?? 0;
        const vn = toNum(r[cVN]) ?? 0;
        const tdc = toNum(r[cTDC]) ?? 0;
        let plazo = cPla >= 0 ? toNum(r[cPla]) : undefined;
        if ((!plazo || plazo <= 0) && fechaEmision && fechaVenc) plazo = diffDays(fechaEmision, fechaVenc);
        let rendimiento = cRen >= 0 ? toNum(r[cRen]) : undefined;
        if (rendimiento === undefined && precio > 0 && plazo && plazo > 0) {
          rendimiento = ((1 - precio) / precio) * (360 / plazo);
        }
        let montoEfectivo = cEf >= 0 ? toNum(r[cEf]) : undefined;
        if (montoEfectivo === undefined) montoEfectivo = vn * precio;
        let valorEfBs = cBs >= 0 ? toNum(r[cBs]) : undefined;
        if (valorEfBs === undefined) valorEfBs = montoEfectivo * tdc;
        const fechaVencFinal = fechaVenc || (fechaEmision && plazo ? addDaysISO(fechaEmision, plazo) : undefined);
        const volumen = cVol >= 0 ? toNum(r[cVol]) : undefined;

        const row: ParsedRow = {
          rowNum: headerIdx + 2 + i,
          simbolo,
          rif,
          cedenteLabel: cCed >= 0 ? String(r[cCed] ?? "") : undefined,
          fechaEmision: fechaEmision ?? "",
          fechaVencimiento: fechaVencFinal,
          plazo,
          rendimiento,
          volumenOrdenes: volumen,
          precio,
          valorNominalUsd: vn,
          montoEfectivoUsd: montoEfectivo,
          tdc,
          valorEfectivoBs: valorEfBs,
          status: "ok",
        };

        // Validations
        const errs: string[] = [];
        if (!fechaEmision) errs.push("Falta fecha emisión");
        if (!precio || precio <= 0 || precio >= 1) errs.push("Precio inválido");
        if (!vn || vn <= 0) errs.push("VN inválido");
        if (!tdc || tdc <= 0) errs.push("TDC inválida");
        if (!plazo || plazo <= 0) errs.push("Plazo inválido");
        const ced = cedByRif.get(rif);
        if (!ced) errs.push(`RIF no registrado: ${rif}`);
        else {
          row.cedente_id = ced.id;
          row.programa_id = pickProgramaForCedente(ced.id, fechaEmision ?? "");
          // programa_id puede quedar null para histórico — la columna es nullable.
        }
        if (existingSimbolos.has(simbolo)) errs.push("Símbolo ya existe en BD");
        if (seenSym.has(simbolo)) errs.push("Símbolo duplicado en archivo");
        seenSym.add(simbolo);

        if (errs.length) {
          row.status = "error";
          row.motivo = errs.join("; ");
        }
        parsed.push(row);
      });
      setRows(parsed);
      toast.success(`Procesadas ${parsed.length} filas`);
    } catch (e: any) {
      toast.error(`Error leyendo archivo: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  const okRows = rows.filter((r) => r.status === "ok");
  const errRows = rows.filter((r) => r.status === "error");

  function revalidateRow(r: ParsedRow, seenOtherSyms: Set<string>): ParsedRow {
    const errs: string[] = [];
    const simbolo = (r.simbolo ?? "").trim();
    const rif = normRif(r.rif);
    const precio = Number(r.precio) || 0;
    const vn = Number(r.valorNominalUsd) || 0;
    const tdc = Number(r.tdc) || 0;
    let plazo = r.plazo ? Number(r.plazo) : undefined;
    if ((!plazo || plazo <= 0) && r.fechaEmision && r.fechaVencimiento) {
      plazo = diffDays(r.fechaEmision, r.fechaVencimiento);
    }
    let rendimiento = r.rendimiento;
    if ((rendimiento === undefined || isNaN(rendimiento as number)) && precio > 0 && plazo && plazo > 0) {
      rendimiento = ((1 - precio) / precio) * (360 / plazo);
    }
    const montoEfectivo = vn * precio;
    const valorEfBs = montoEfectivo * tdc;
    const fechaVencFinal =
      r.fechaVencimiento || (r.fechaEmision && plazo ? addDaysISO(r.fechaEmision, plazo) : undefined);

    if (!simbolo) errs.push("Falta símbolo");
    if (!r.fechaEmision) errs.push("Falta fecha emisión");
    if (!precio || precio <= 0 || precio >= 1) errs.push("Precio inválido");
    if (!vn || vn <= 0) errs.push("VN inválido");
    if (!tdc || tdc <= 0) errs.push("TDC inválida");
    if (!plazo || plazo <= 0) errs.push("Plazo inválido");

    let cedente_id: string | undefined;
    let programa_id: string | null = null;
    const ced = cedByRif.get(rif);
    if (!ced) errs.push(`RIF no registrado: ${rif}`);
    else {
      cedente_id = ced.id;
      programa_id = pickProgramaForCedente(ced.id, r.fechaEmision ?? "");
    }
    if (existingSimbolos.has(simbolo)) errs.push("Símbolo ya existe en BD");
    if (seenOtherSyms.has(simbolo)) errs.push("Símbolo duplicado en archivo");

    return {
      ...r,
      simbolo,
      rif,
      precio,
      valorNominalUsd: vn,
      tdc,
      plazo,
      rendimiento,
      montoEfectivoUsd: montoEfectivo,
      valorEfectivoBs: valorEfBs,
      fechaVencimiento: fechaVencFinal,
      cedente_id,
      programa_id,
      status: errs.length ? "error" : "ok",
      motivo: errs.length ? errs.join("; ") : undefined,
    };
  }

  function updateRow(rowNum: number, patch: Partial<ParsedRow>) {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.rowNum === rowNum);
      if (idx < 0) return prev;
      const merged = { ...prev[idx], ...patch };
      const others = new Set(
        prev.filter((_, i) => i !== idx).map((r) => (r.simbolo ?? "").trim()).filter(Boolean),
      );
      const next = prev.slice();
      next[idx] = revalidateRow(merged, others);
      return next;
    });
  }

  async function insertAll() {
    if (!okRows.length) return;
    setInserting(true);
    let inserted = 0;
    const failures: string[] = [];
    const CHUNK = 200;
    for (let i = 0; i < okRows.length; i += CHUNK) {
      const slice = okRows.slice(i, i + CHUNK);
      const payload = slice.map((r) => ({
        simbolo_cfb: r.simbolo,
        cedente_id: r.cedente_id!,
        programa_id: r.programa_id,
        financista_id: null,
        operador_id: user?.id ?? null,
        fecha_emision: r.fechaEmision,
        fecha_vencimiento: r.fechaVencimiento!,
        dias_colocados: r.plazo!,
        valor_nominal_usd: Number(r.valorNominalUsd.toFixed(2)),
        precio: Number(r.precio.toFixed(5)),
        descuento: Number((1 - r.precio).toFixed(5)),
        rendimiento_anualizado: Number((r.rendimiento ?? 0).toFixed(5)),
        monto_efectivo_usd: Number((r.montoEfectivoUsd ?? r.valorNominalUsd * r.precio).toFixed(2)),
        valor_efectivo_bs: Number((r.valorEfectivoBs ?? 0).toFixed(2)),
        tasa_cambio_bs_usd: Number(r.tdc.toFixed(4)),
        cantidad_ordenes_compra: Math.max(1, Math.round(r.volumenOrdenes ?? 1)),
        estado: "activa" as const,
      }));
      const { error, count } = await supabase.from("emisiones").insert(payload, { count: "exact" });
      if (error) {
        failures.push(`Lote ${i}-${i + slice.length}: ${error.message}`);
      } else {
        inserted += count ?? slice.length;
      }
    }
    setInserting(false);
    if (failures.length) {
      toast.error(`Insertadas ${inserted}. Fallos: ${failures.length}`);
      console.error(failures);
    } else {
      toast.success(`Insertadas ${inserted} emisiones históricas`);
    }
    // refresh existing symbols
    const e = await supabase.from("emisiones").select("simbolo_cfb");
    setExistingSimbolos(new Set((e.data ?? []).map((r) => r.simbolo_cfb)));
    // mark inserted rows as done
    setRows((prev) =>
      prev.map((r) =>
        r.status === "ok" ? { ...r, status: "warning" as const, motivo: "Insertado" } : r
      )
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Carga Histórica"
        subtitle="Importa la bitácora antigua de CFB directamente a la base sin generar documentos."
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" /> 1. Subir archivo
          </CardTitle>
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="h-4 w-4 mr-2" /> Descargar plantilla
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Hoja</label>
              <Input value={sheetName} onChange={(e) => setSheetName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Fila de encabezados (1-indexado)</label>
              <Input type="number" value={headerRow} onChange={(e) => setHeaderRow(Number(e.target.value) || 1)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Archivo .xlsx</label>
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>
          </div>
          {loading && (
            <div className="flex items-center text-sm text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Procesando...
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Se buscan columnas: SIMBOLO CFB, R.I.F., FECHA EMISIÓN, FECHA DE VCTO, Plazo, Rendimiento, Volumen de Órdenes,
            PRECIO DE EMISIÓN (%), VALOR NOMINAL $, VALOR EFECTIVO $, TDC, VALOR EFECTIVO BS. Los faltantes se recalculan.
          </p>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4" /> 2. Validación
            </CardTitle>
            <div className="flex gap-3 items-center text-sm">
              <Badge variant="default" className="bg-emerald-600">{okRows.length} listos</Badge>
              <Badge variant="destructive">{errRows.length} con error</Badge>
              <Button
                onClick={insertAll}
                disabled={!okRows.length || inserting}
                size="sm"
              >
                {inserting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Insertando…</> : <><CheckCircle2 className="h-4 w-4 mr-2" />Insertar {okRows.length} filas</>}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[520px] overflow-auto border rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr className="text-left">
                    <th className="px-2 py-1">#</th>
                    <th className="px-2 py-1">Estado</th>
                    <th className="px-2 py-1">Símbolo</th>
                    <th className="px-2 py-1">RIF</th>
                    <th className="px-2 py-1">Cedente (archivo)</th>
                    <th className="px-2 py-1">F. Emisión</th>
                    <th className="px-2 py-1">F. Vcto</th>
                    <th className="px-2 py-1 text-right">Plazo</th>
                    <th className="px-2 py-1 text-right">Precio</th>
                    <th className="px-2 py-1 text-right">VN $</th>
                    <th className="px-2 py-1 text-right">Efect. $</th>
                    <th className="px-2 py-1 text-right">TDC</th>
                    <th className="px-2 py-1">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 500).map((r) => (
                    <tr key={r.rowNum} className={r.status === "error" ? "bg-red-50" : ""}>
                      <td className="px-2 py-1 text-muted-foreground">{r.rowNum}</td>
                      <td className="px-2 py-1">
                        {r.status === "ok" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                        )}
                      </td>
                      <td className="px-2 py-1 font-mono">{r.simbolo}</td>
                      <td className="px-2 py-1 font-mono">{r.rif}</td>
                      <td className="px-2 py-1">{r.cedenteLabel}</td>
                      <td className="px-2 py-1">{r.fechaEmision}</td>
                      <td className="px-2 py-1">{r.fechaVencimiento}</td>
                      <td className="px-2 py-1 text-right">{r.plazo}</td>
                      <td className="px-2 py-1 text-right">{r.precio?.toFixed(4)}</td>
                      <td className="px-2 py-1 text-right">{r.valorNominalUsd?.toLocaleString()}</td>
                      <td className="px-2 py-1 text-right">{r.montoEfectivoUsd?.toLocaleString(undefined,{maximumFractionDigits:2})}</td>
                      <td className="px-2 py-1 text-right">{r.tdc}</td>
                      <td className="px-2 py-1 text-red-700">{r.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 500 && (
                <div className="px-2 py-1 text-xs text-muted-foreground">
                  Mostrando 500 de {rows.length}. La inserción procesa todas.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
