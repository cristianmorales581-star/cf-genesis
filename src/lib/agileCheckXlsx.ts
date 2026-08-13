// Reporte AgileCheck — hoja "Transacciones".
// Cada certificado genera 2 filas: Venta (cedente, tipo 6) y Compra (financista, tipo 7).
import * as XLSX from "xlsx";

export const AC_METODO = 3;          // Transferencia local
export const AC_SEXO = 2;            // Persona jurídica
export const AC_SUCURSAL = 482;      // GRUPO BURSÁTIL VENEZOLANO, C.A.
export const AC_TIPO_PRODUCTO = 967; // Certificados de Financiamiento Bursátil
export const AC_NUM_PRODUCTO = 1;
export const AC_NUM_TRANSACCION = 1212;
export const AC_TIPO_VENTA = 6;
export const AC_TIPO_COMPRA = 7;

export const AC_HEADERS = [
  "Monto", "Fecha", "Método", "Número de cliente", "Apellidos", "Nombres",
  "Sexo", "Sucursal", "Tipo de producto", "Número de producto",
  "Número de transacción", "tipo", "tasa", "montoOriginal", "balance",
];

export interface AcParty {
  razon_social: string;
  codigo_cliente?: string | null;
}

export interface AcEmision {
  fecha_emision: string;
  monto_efectivo_usd: number;
  valor_efectivo_bs: number;
  cedente?: AcParty | null;
  financista?: AcParty | null;
}

export interface AcRow {
  monto: number;
  fecha: string;
  metodo: number;
  cliente: string;
  apellidos: string;
  nombres: string;
  sexo: number;
  sucursal: number;
  tipo_producto: number;
  num_producto: number;
  num_transaccion: number;
  tipo: number;
  tasa: number;
  monto_original: number;
}

function round4(n: number) { return Math.round(n * 10000) / 10000; }

export function buildAgileCheckRows(emisiones: AcEmision[]): AcRow[] {
  const ordenadas = [...emisiones].sort((a, b) =>
    a.fecha_emision < b.fecha_emision ? 1 : a.fecha_emision > b.fecha_emision ? -1 : 0
  );

  const mk = (p: AcParty | null | undefined, e: AcEmision, tipo: number): AcRow => {
    const usd = Number(e.monto_efectivo_usd) || 0;
    const bs = Number(e.valor_efectivo_bs) || 0;
    return {
      monto: round4(usd),
      fecha: e.fecha_emision,
      metodo: AC_METODO,
      cliente: p?.codigo_cliente ?? "",
      apellidos: p?.razon_social ?? "",
      nombres: p?.razon_social ?? "",
      sexo: AC_SEXO,
      sucursal: AC_SUCURSAL,
      tipo_producto: AC_TIPO_PRODUCTO,
      num_producto: AC_NUM_PRODUCTO,
      num_transaccion: AC_NUM_TRANSACCION,
      tipo,
      tasa: usd ? round4(bs / usd) : 0,
      monto_original: round4(bs),
    };
  };

  return [
    ...ordenadas.map(e => mk(e.cedente, e, AC_TIPO_VENTA)),
    ...ordenadas.map(e => mk(e.financista, e, AC_TIPO_COMPRA)),
  ];
}

function excelSerialDate(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1) / 86400000 + 25569;
}

export function buildAgileCheckXlsx(rows: AcRow[]): ArrayBuffer {
  const aoa: unknown[][] = [
    AC_HEADERS,
    ...rows.map(r => [
      r.monto, excelSerialDate(r.fecha), r.metodo, r.cliente, r.apellidos, r.nombres,
      r.sexo, r.sucursal, r.tipo_producto, r.num_producto, r.num_transaccion,
      r.tipo, r.tasa, r.monto_original, null,
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 17 }, { wch: 34 }, { wch: 34 },
    { wch: 6 }, { wch: 9 }, { wch: 16 }, { wch: 18 }, { wch: 20 },
    { wch: 6 }, { wch: 12 }, { wch: 20 }, { wch: 10 },
  ];
  for (let i = 0; i < rows.length; i++) {
    const r = i + 2;
    const b = ws[`B${r}`];
    if (b) { b.t = "n"; b.z = "dd/mm/yyyy"; }
    for (const c of ["A", "M", "N"]) {
      const cell = ws[`${c}${r}`];
      if (cell) cell.z = "#,##0.0000";
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Transacciones");
  return XLSX.write(wb, { bookType: "xlsx", type: "array", cellStyles: true });
}

const MESES = ["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"];

export function acMonthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${MESES[Number(m) - 1] ?? m} ${y}`;
}

export function acFilename(month: string): string {
  const [y, m] = month.split("-");
  return `CARGA_AGILECHECK_${MESES[Number(m) - 1] ?? m}_${y}.xlsx`;
}
