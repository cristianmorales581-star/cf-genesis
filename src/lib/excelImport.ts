// SICEBOP — Lector universal de Excel para carga masiva de
// CEDENTES, FINANCISTAS y PROGRAMAS.
//
// Acepta hojas con encabezados parecidos a los del modelo SICEBOP:
//   CEDENTES (mezcla cedente + programa por fila):
//     Denominación Social | LINEA | RIF | Representante Legal | Cargo | Cédula |
//     PCFB | Plazo de ejecución Programa | Descuento | Plazo Cuotas |
//     Fecha de inicio | Vencimiento | Nombre comercial | Contrato
//   FINANCISTAS:
//     TIPO | Denominación Social | RIF | Representante Legal | Cargo | Cédula |
//     PCFB | Plazo de ejecución Programa | Descuento | Plazo Cuotas |
//     correo | celular | Fecha de inicio | Vencimiento | Nombre comercial

import * as XLSX from "xlsx";

export type ImportKind = "cedentes" | "financistas" | "programas";

export interface CedenteRow {
  razon_social: string;
  rif: string;
  representante_legal?: string;
  cargo?: string;
  cedula?: string;
  nombre_comercial?: string;
  // Datos del programa embebido en la misma fila (opcional):
  programa?: ProgramaRow;
}

export interface ProgramaRow {
  codigo_pcfb: string;
  linea?: string;
  plazo_ejecucion_dias: number;
  descuento_base: number;       // fracción 0..1 (ej 0.03)
  plazo_cuotas_dias: number;
  fecha_inicio: string;          // ISO yyyy-mm-dd
  fecha_vencimiento: string;     // ISO yyyy-mm-dd
  contrato_cesion?: string;
  // Vínculo lógico (se resuelve al insertar):
  cedente_rif?: string;
  cedente_razon_social?: string;
}

export interface FinancistaRow {
  tipo: "natural" | "juridica";
  razon_social: string;
  rif?: string;
  representante_legal?: string;
  cargo?: string;
  cedula?: string;
  correo?: string;
  celular?: string;
}

export interface ParsedSheet {
  cedentes: CedenteRow[];
  programas: ProgramaRow[];
  financistas: FinancistaRow[];
  warnings: string[];
  detected: { sheet: string; kind: ImportKind | "mixto" }[];
}

// ---------- helpers ----------
const norm = (s: string) =>
  (s ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

function findCol(headers: string[], aliases: string[]): number {
  const H = headers.map(norm);
  for (const a of aliases) {
    const target = norm(a);
    const i = H.findIndex(h => h === target || h.includes(target));
    if (i >= 0) return i;
  }
  return -1;
}

function toISODate(v: any): string {
  if (!v) return "";
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  if (typeof v === "number") {
    // Serial Excel
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  // dd/mm/yyyy o dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const yy = y.length === 2 ? "20" + y : y;
    return `${yy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // yyyy-mm-dd
  const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m2) return `${m2[1]}-${m2[2].padStart(2, "0")}-${m2[3].padStart(2, "0")}`;
  return "";
}

export function parseAccountingNumber(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const raw = String(v).trim();
  const negative = /^-/.test(raw) || /^\(.+\)$/.test(raw);
  const s = raw.replace(/[^\d.,-]/g, "").replace(/^-/, "");
  if (!s) return 0;
  const parsed = s.includes(".") ? parseFloat(s.replace(/,/g, "")) : parseFloat(s.replace(/,/g, ""));
  return negative ? -parsed : parsed;
}

export function parsePastedValues(text: string): ParsedSheet {
  const delimiter = text.includes("\t") ? "\t" : ";";
  const rows = text
    .replace(/\r/g, "")
    .split("\n")
    .map(line => line.trimEnd())
    .filter(Boolean)
    .map(line => line.split(delimiter).map(cell => cell.trim()));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Pegado");
  return parseWorkbook(wb);
}

function cleanRif(s: string): string {
  return (s ?? "").toString().toUpperCase().replace(/\s+/g, "").trim();
}

function detectKind(headers: string[]): ImportKind | "mixto" | null {
  const H = headers.map(norm).join("|");
  const hasTipo = /\btipo\b/.test(H);
  const hasCorreo = /correo|email/.test(H);
  const hasPcfb = /\bpcfb\b|programa.*cfb|codigo.*programa/.test(H);
  const hasDenom = /denominacion social|razon social/.test(H);
  if (hasDenom && (hasTipo || hasCorreo)) return "financistas";
  if (hasDenom && hasPcfb) return "mixto"; // cedentes + programa por fila
  if (hasPcfb) return "programas";
  if (hasDenom) return "cedentes";
  return null;
}

// ---------- parser ----------
export async function parseExcelFile(file: File): Promise<ParsedSheet> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  return parseWorkbook(wb);
}

export function parseWorkbook(wb: XLSX.WorkBook): ParsedSheet {
  const out: ParsedSheet = {
    cedentes: [], programas: [], financistas: [],
    warnings: [], detected: [],
  };

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: false, blankrows: false });
    if (aoa.length < 2) continue;

    // Encontrar fila de encabezados: la que tenga >=4 textos
    let headerRow = 0;
    for (let i = 0; i < Math.min(aoa.length, 5); i++) {
      const nonEmpty = aoa[i].filter(v => String(v ?? "").trim()).length;
      if (nonEmpty >= 4) { headerRow = i; break; }
    }
    const headers: string[] = aoa[headerRow].map((h: any) => String(h ?? ""));
    const kind = detectKind(headers);
    if (!kind) continue;
    out.detected.push({ sheet: sheetName, kind });

    const cols = {
      tipo: findCol(headers, ["TIPO"]),
      denom: findCol(headers, ["Denominación Social", "Razón Social", "Razon Social"]),
      linea: findCol(headers, ["LINEA", "LÍNEA"]),
      rif: findCol(headers, ["RIF"]),
      repLegal: findCol(headers, ["Representante Legal", "Representante"]),
      cargo: findCol(headers, ["Cargo"]),
      cedula: findCol(headers, ["Cédula", "Cedula"]),
      pcfb: findCol(headers, ["PCFB", "Programa de CFB", "Código PCFB", "Codigo PCFB"]),
      plazoEjec: findCol(headers, ["Plazo de ejecución Programa", "Plazo de ejecucion Programa", "Plazo Programa", "Plazo de ejecución"]),
      desc: findCol(headers, ["Descuento"]),
      plazoCuotas: findCol(headers, ["Plazo Cuotas", "Plazo de Cuotas"]),
      correo: findCol(headers, ["correo", "email", "e-mail"]),
      celular: findCol(headers, ["celular", "telefono", "teléfono"]),
      fechaInicio: findCol(headers, ["Fecha de inicio", "Inicio"]),
      fechaVenc: findCol(headers, ["Vencimiento", "Fecha de vencimiento"]),
      nombreCom: findCol(headers, ["Nombre comercial"]),
      contrato: findCol(headers, ["Contrato", "Contrato de cesión", "Contrato de cesion"]),
    };

    const get = (row: any[], i: number) => (i >= 0 ? String(row[i] ?? "").trim() : "");

    for (let i = headerRow + 1; i < aoa.length; i++) {
      const row = aoa[i];
      if (!row || row.every(v => !String(v ?? "").trim())) continue;
      const denom = get(row, cols.denom);
      if (!denom) continue;

      if (kind === "financistas") {
        const tipoRaw = norm(get(row, cols.tipo));
        const tipo: "natural" | "juridica" = /natur/.test(tipoRaw) ? "natural" : "juridica";
        out.financistas.push({
          tipo,
          razon_social: denom,
          rif: cleanRif(get(row, cols.rif)) || undefined,
          representante_legal: get(row, cols.repLegal) || undefined,
          cargo: get(row, cols.cargo) || undefined,
          cedula: get(row, cols.cedula) || undefined,
          correo: get(row, cols.correo) || undefined,
          celular: get(row, cols.celular) || undefined,
        });
        continue;
      }

      // cedentes / mixto / programas
      const rif = cleanRif(get(row, cols.rif));
      const cedente: CedenteRow = {
        razon_social: denom,
        rif,
        representante_legal: get(row, cols.repLegal) || undefined,
        cargo: get(row, cols.cargo) || undefined,
        cedula: get(row, cols.cedula) || undefined,
        nombre_comercial: get(row, cols.nombreCom) || undefined,
      };

      const pcfb = get(row, cols.pcfb);
      let programa: ProgramaRow | undefined;
      if (pcfb && pcfb.toUpperCase() !== "N/A") {
        const desc = parseAccountingNumber(row[cols.desc]);
        // Si viene "3" lo interpretamos como 3% → 0.03; si viene 0.03 lo dejamos.
        const descuento = desc > 1 ? desc / 100 : desc;
        programa = {
          codigo_pcfb: pcfb,
          linea: get(row, cols.linea) || undefined,
          plazo_ejecucion_dias: Math.round(parseAccountingNumber(row[cols.plazoEjec])) || 180,
          descuento_base: descuento,
          plazo_cuotas_dias: Math.round(parseAccountingNumber(row[cols.plazoCuotas])) || 14,
          fecha_inicio: toISODate(row[cols.fechaInicio]),
          fecha_vencimiento: toISODate(row[cols.fechaVenc]),
          contrato_cesion: get(row, cols.contrato) || undefined,
          cedente_rif: rif || undefined,
          cedente_razon_social: denom,
        };
        cedente.programa = programa;
        out.programas.push(programa);
      }

      if (kind !== "programas") out.cedentes.push(cedente);
    }
  }

  if (!out.cedentes.length && !out.financistas.length && !out.programas.length) {
    out.warnings.push("No se reconoció ninguna hoja con encabezados válidos.");
  }
  return out;
}

// Deduplicar cedentes por RIF (manteniendo el primero con datos más completos)
export function dedupeCedentes(rows: CedenteRow[]): CedenteRow[] {
  const map = new Map<string, CedenteRow>();
  for (const r of rows) {
    const k = (r.rif || r.razon_social).toUpperCase();
    if (!map.has(k)) map.set(k, r);
  }
  return Array.from(map.values());
}

export function dedupeFinancistas(rows: FinancistaRow[]): FinancistaRow[] {
  const map = new Map<string, FinancistaRow>();
  for (const r of rows) {
    const k = (r.rif || r.cedula || r.razon_social).toUpperCase();
    if (!map.has(k)) map.set(k, r);
  }
  return Array.from(map.values());
}

// Deduplicar programas por (codigo_pcfb + linea)
export function dedupeProgramas(rows: ProgramaRow[]): ProgramaRow[] {
  const map = new Map<string, ProgramaRow>();
  for (const r of rows) {
    const k = `${r.codigo_pcfb}|${r.linea ?? ""}`.toUpperCase();
    if (!map.has(k)) map.set(k, r);
  }
  return Array.from(map.values());
}
