// Vector consolidado (.xlsx) — formato espejo SIBE
import * as XLSX from "xlsx";

/** Construye el .xlsx del vector consolidado, espejo del formato SIBE. */
export function buildVectorXlsx(rows: any[], _fechaEmision: string): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const vectorDate = (date: string | null | undefined) => (date ? excelSerialDate(date) : "");

  // Hoja 1: Vector
  const headers = [
    "SIMBOLO CFB", "CEDENTE", "R.I.F.", "DEUDOR CEDIDO", "R.I.F.",
    "CANTIDAD DE CERTIFICADOS", "FECHA EMISIÓN", "FECHA DE VCTO", "Dias Colocados",
    "Rendimiento", "VOLUMEN DE ORDENES DE COMPRA", "VALOR NOMINAL Bs.", "PRECIO DE EMISIÓN Bs.",
    "TIPO DE SOCIEDAD", "TIPO DE MONEDA UTILIZADA EN LA OPERACIÓN", "VALOR NOMINAL $",
    "MONTO SIBE", "TASA DE CAMBIO UTILIZADA", "INVERSIONISTA",
  ];
  const data = [
    ["", `Identificador del Estructurador: Grupo Bursatil Venezolano Casa de Bolsa, C.A.`, "", "", "", "T+0"],
    [],
    [],
    headers,
    ...rows.map(r => [
      r.simbolo_cfb, r.cedente, r.rif_cedente, r.deudor_cedido, r.rif_deudor,
      r.cantidad_certificados, vectorDate(r.fecha_emision), vectorDate(r.fecha_vencimiento), r.dias_colocados,
      r.rendimiento, r.volumen_ordenes, r.valor_nominal_bs, r.precio_emision,
      r.tipo_sociedad, r.moneda, r.valor_nominal_usd, r.monto_sibe_usd, r.tasa_cambio, r.inversionista,
    ]),
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(data);
  // Anchos
  ws1["!cols"] = headers.map(h => ({ wch: Math.max(h.length, 14) }));
  applyVectorFormats(ws1, 5, rows.length);
  XLSX.utils.book_append_sheet(wb, ws1, "Vector");

  // Hoja 2: Resumen
  const headers2 = ["SIMBOLO CFB","CEDENTE","R.I.F.","FECHA EMISIÓN","PRECIO DE EMISIÓN Bs.","MONTO SIBE","INVERSIONISTA","RIF INVERSIONISTA"];
  const data2 = [
    ["", `Identificador del Estructurador: Grupo Bursatil Venezolano Casa de Bolsa, C.A.`],
    [],
    [],
    headers2,
    ...rows.map(r => [r.simbolo_cfb, r.cedente, r.rif_cedente, vectorDate(r.fecha_emision), r.precio_emision, r.monto_sibe_usd, r.inversionista, r.rif_inversionista ?? r.rif_deudor]),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(data2);
  ws2["!cols"] = headers2.map(h => ({ wch: Math.max(h.length, 14) }));
  applyResumenFormats(ws2, 5, rows.length);
  XLSX.utils.book_append_sheet(wb, ws2, "Resumen");

  return XLSX.write(wb, { bookType: "xlsx", type: "array" });
}

function excelSerialDate(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000 + 25569;
}

function setCellFormat(ws: XLSX.WorkSheet, address: string, z: string) {
  if (!ws[address]) return;
  ws[address].z = z;
}

function applyVectorFormats(ws: XLSX.WorkSheet, firstDataRow: number, rowCount: number) {
  const fmt = {
    date: "dd/mm/yyyy",
    int: '_ * #,##0_ ;_ * \\-#,##0_ ;_ * "-"??_ ;_ @_ ',
    num2: '_(* #,##0.00_);_(* \\(#,##0.00\\);_(* "-"??_);_(@_)',
    pct2: "0.00%",
    pct4: "0.0000%",
    usd2: '[$$-540A]#,##0.00_ ;\\-[$$-540A]#,##0.00\\ ',
    usd0: '[$$-540A]#,##0_ ;\\-[$$-540A]#,##0\\ ',
    tasa: '_ [$Bs.S-200A]* #,##0.0000_ ;_ [$Bs.S-200A]* \\-#,##0.0000_ ;_ [$Bs.S-200A]* "-"??_ ;_ @_ ',
  };
  for (let r = firstDataRow; r < firstDataRow + rowCount; r++) {
    setCellFormat(ws, `G${r}`, fmt.date);
    setCellFormat(ws, `H${r}`, fmt.date);
    setCellFormat(ws, `I${r}`, fmt.int);
    setCellFormat(ws, `J${r}`, fmt.pct2);
    setCellFormat(ws, `K${r}`, fmt.int);
    setCellFormat(ws, `L${r}`, fmt.num2);
    setCellFormat(ws, `M${r}`, fmt.pct4);
    setCellFormat(ws, `P${r}`, fmt.usd2);
    setCellFormat(ws, `Q${r}`, fmt.usd0);
    setCellFormat(ws, `R${r}`, fmt.tasa);
  }
}

function applyResumenFormats(ws: XLSX.WorkSheet, firstDataRow: number, rowCount: number) {
  for (let r = firstDataRow; r < firstDataRow + rowCount; r++) {
    setCellFormat(ws, `D${r}`, "dd/mm/yyyy");
    setCellFormat(ws, `E${r}`, "0.0000%");
    setCellFormat(ws, `F${r}`, '[$$-540A]#,##0_ ;\\-[$$-540A]#,##0\\ ');
  }
}
