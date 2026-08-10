// Reporte RAS (regulatorio) — formato fijo de 7 columnas.
// Cada certificado genera 2 operaciones: VENTA (cedente) y COMPRA (financista).
import * as XLSX from "xlsx";

export const RAS_UMBRAL_USD = 50000;

export const RAS_CONCEPTO_VENTA = "VENTA DE CERTIFICADOS DE FINANCIAMIENTO BURSATIL";
export const RAS_CONCEPTO_COMPRA = "COMPRA DE CERTIFICADOS DE FINANCIAMIENTO BURSATIL";

export const RAS_HEADERS = [
  "Nombre o Razon Social",
  "Tipo",
  "N° de Identificación",
  "Fecha",
  "Concepto de la Operación",
  "Monto Bs",
  "Monto Divisas",
];

export interface RasParty {
  razon_social: string;
  rif?: string | null;
}

export interface RasEmision {
  fecha_emision: string;          // ISO yyyy-mm-dd
  monto_efectivo_usd: number;
  valor_efectivo_bs: number;
  cedente?: RasParty | null;
  financista?: RasParty | null;
}

export interface RasRow {
  nombre: string;
  tipo: string;            // J / V / G / E
  identificacion: number | string;
  fecha: string;           // ISO
  concepto: string;
  monto_bs: number;
  monto_usd: number;
}

/** "J-50193407-0" → { tipo: "J", numero: 501934070 } */
export function splitRif(rif?: string | null): { tipo: string; numero: number | string } {
  const raw = (rif ?? "").toUpperCase().replace(/\s+/g, "");
  const m = raw.match(/^([JVGEP])?[-.]?([\d.-]+)$/);
  const tipo = m?.[1] ?? "J";
  const digits = (m?.[2] ?? raw).replace(/\D/g, "");
  if (!digits) return { tipo, numero: "" };
  return { tipo, numero: Number(digits) };
}

/** Convierte las emisiones en las filas del RAS (ventas primero, luego compras). */
export function buildRasRows(emisiones: RasEmision[]): RasRow[] {
  const elegibles = emisiones
    .filter(e => Number(e.monto_efectivo_usd) >= RAS_UMBRAL_USD)
    .sort((a, b) => (a.fecha_emision < b.fecha_emision ? 1 : a.fecha_emision > b.fecha_emision ? -1 : 0));

  const mk = (p: RasParty | null | undefined, e: RasEmision, concepto: string): RasRow => {
    const { tipo, numero } = splitRif(p?.rif);
    return {
      nombre: p?.razon_social ?? "",
      tipo,
      identificacion: numero,
      fecha: e.fecha_emision,
      concepto,
      monto_bs: Number(e.valor_efectivo_bs) || 0,
      monto_usd: Number(e.monto_efectivo_usd) || 0,
    };
  };

  return [
    ...elegibles.map(e => mk(e.cedente, e, RAS_CONCEPTO_VENTA)),
    ...elegibles.map(e => mk(e.financista, e, RAS_CONCEPTO_COMPRA)),
  ];
}

function excelSerialDate(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const ms = Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  return ms / 86400000 + 25569;
}

/** Genera el archivo .xlsx del RAS con el formato exigido por el ente regulador. */
export function buildRasXlsx(rows: RasRow[]): ArrayBuffer {
  const aoa: unknown[][] = [
    RAS_HEADERS,
    ...rows.map(r => [
      r.nombre, r.tipo, r.identificacion,
      excelSerialDate(r.fecha), r.concepto,
      r.monto_bs, r.monto_usd,
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 43.6 }, { wch: 4.9 }, { wch: 13.3 }, { wch: 14 },
    { wch: 50.9 }, { wch: 23.7 }, { wch: 18 },
  ];
  const money = "#,##0.00;[Red]#,##0.00";
  for (let i = 0; i < rows.length; i++) {
    const r = i + 2; // 1-based, fila 1 = encabezado
    const dCell = ws[`D${r}`];
    if (dCell) { dCell.t = "n"; dCell.z = "dd\\-mm\\-yy;@"; }
    const fCell = ws[`F${r}`];
    if (fCell) fCell.z = money;
    const gCell = ws[`G${r}`];
    if (gCell) gCell.z = money;
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "RAS");
  return XLSX.write(wb, { bookType: "xlsx", type: "array", cellStyles: true });
}

const MESES = ["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"];

/** GRUPO_BURSATIL_VENEZOLANO-OTROS_BIENES_FACTORING_-_JUNIO_2026.xlsx */
export function rasFilename(month: string): string {
  const [y, m] = month.split("-");
  return `GRUPO_BURSATIL_VENEZOLANO-OTROS_BIENES_FACTORING_-_${MESES[Number(m) - 1] ?? m}_${y}.xlsx`;
}

export function rasMonthLabel(month: string): string {
  const [y, m] = month.split("-");
  const nombre = MESES[Number(m) - 1] ?? m;
  return `${nombre.charAt(0)}${nombre.slice(1).toLowerCase()} ${y}`;
}
