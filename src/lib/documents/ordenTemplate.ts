// src/lib/documents/ordenTemplate.ts
// Plantilla única (1 página A4) para Órdenes de Compra (ODC) y Venta (ODV) de renta fija.
// GBV Casa de Bolsa, C.A.

export type TipoOperacion = "COMPRA" | "VENTA";
export type TipoPersona = "NATURAL" | "JURIDICA";
export type TipoMercado = "PRIMARIO" | "SECUNDARIO";
export type Moneda = "BS" | "USD";

export interface OrdenData {
  tipoOperacion: TipoOperacion;
  fechaSolicitud: string | Date;
  fechaVencimiento: string | Date;
  numeroOrden: string;

  tipoPersona: TipoPersona;
  clienteNombre: string;
  clienteRif: string;
  clienteEmail?: string | null;
  clienteTelFijo?: string | null;
  clienteTelMovil?: string | null;

  representanteNombre?: string | null;
  representanteCedula?: string | null;

  tipoInstrumento: string; // p. ej. "Certificado de Financiamiento Bursátil"
  codigoTitulo: string; // p. ej. "C5990A"
  tipoMercado: TipoMercado;
  moneda: Moneda;

  valorNominal: number;
  precio: number; // en porcentaje: 97 => 97.00%
  contravalor: number;

  cuentaAsociadaBanco?: string | null;
  cuentaAsociadaNumero?: string | null;
  cuentaDolaresBanco?: string | null;
  cuentaDolaresNumero?: string | null;

  origenFondos: string; // p. ej. "Actividad Comercial"
  destinoFondos: string; // p. ej. "Inversión"

  operadorNombre: string;
  operadorTelefono: string;
}

/* ---------- formato ---------- */

const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const orNA = (v?: string | null): string => (v && v.trim() ? v : "n/a");

const fmtFecha = (v: string | Date): string => {
  if (v instanceof Date) {
    const d = String(v.getDate()).padStart(2, "0");
    const m = String(v.getMonth() + 1).padStart(2, "0");
    return `${d}/${m}/${v.getFullYear()}`;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : v; // ya viene dd/mm/aaaa
};

const fmtNum = (n: number): string =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtMonto = (n: number, moneda: Moneda): string =>
  moneda === "USD" ? `$${fmtNum(n)}` : `Bs ${fmtNum(n)}`;

const x = (cond: boolean): string => (cond ? "X" : "");

/* ---------- estilos (aislados bajo .gbv-orden para no chocar con Tailwind) ---------- */

export const ORDEN_CSS = `
.gbv-orden{width:200mm;height:286mm;margin:5mm auto;padding:7.5mm 8mm;background:#fff;color:#000;overflow:hidden;
  font-family:"Aptos Narrow",Carlito,Calibri,Arial,sans-serif;font-size:9pt;box-sizing:border-box}
.gbv-orden *{box-sizing:border-box;margin:0;padding:0}
.gbv-orden table{width:100%;border-collapse:collapse;table-layout:fixed}
.gbv-orden td{border:0.9px solid #000;vertical-align:top;padding:3px 6px 4px;word-wrap:break-word}
.gbv-orden td.h{background:#e8e8e8;font-weight:700;font-size:8.6pt;padding:3px 5px;text-decoration:underline}
.gbv-orden .lb{display:block;font-size:6.3pt;color:#555;text-transform:uppercase;letter-spacing:.15px;line-height:1.15}
.gbv-orden .v{display:block;font-size:9.6pt;line-height:1.4;min-height:12px;padding-top:1px}
.gbv-orden .b{font-weight:700}
.gbv-orden .c{text-align:center}
.gbv-orden .gap{height:8px}
.gbv-orden .title{background:#d9d9d9;font-weight:700;font-size:11pt;text-align:center;vertical-align:middle;letter-spacing:.2px}
.gbv-orden .chk{display:inline-block;width:10px;height:10px;border:1px solid #000;color:#000;font-family:Arial,sans-serif;font-size:9pt;line-height:8.5px;
  text-align:center;font-weight:900;vertical-align:-1px;margin-right:3px}
.gbv-orden .opt{font-size:8.6pt;margin-right:10px;white-space:nowrap}
.gbv-orden .opts{white-space:nowrap}
.gbv-orden .decl{font-size:7.9pt;line-height:1.28;text-align:justify;padding:4px 6px}
.gbv-orden .decl p{margin-bottom:1px}
.gbv-orden .foot{font-size:7.2pt;padding:2px 1px 0}
.gbv-orden .sign td{height:78px}
.gbv-orden .stamp td{height:86px}
`;

/* ---------- plantilla ---------- */

export function buildOrdenBody(d: OrdenData): string {
  const repNombre = orNA(d.representanteNombre);
  const repCedula = orNA(d.representanteCedula);

  return `
<div class="gbv-orden">
<table>
 <colgroup><col style="width:52%"><col style="width:16%"><col style="width:16%"><col style="width:16%"></colgroup>
 <tr>
  <td class="title" rowspan="2">SOLICITUD DE ÓRDENES DE COMPRA Y/O VENTA<br>DE TÍTULOS VALORES - RENTA FIJA</td>
  <td><span class="lb">Fecha de solicitud</span><span class="v">${esc(fmtFecha(d.fechaSolicitud))}</span></td>
  <td><span class="lb">Fecha de vencimiento</span><span class="v">${esc(fmtFecha(d.fechaVencimiento))}</span></td>
  <td><span class="lb">N° de orden</span><span class="v b">${esc(d.numeroOrden)}</span></td>
 </tr>
 <tr>
  <td colspan="3" style="vertical-align:middle">
   <span class="opt"><span class="chk">${x(d.tipoPersona === "NATURAL")}</span>Persona Natural</span>
   <span class="opt"><span class="chk">${x(d.tipoPersona === "JURIDICA")}</span>Persona Jurídica</span>
  </td>
 </tr>
</table>
<div class="gap"></div>

<table>
 <colgroup><col style="width:30%"><col style="width:28%"><col style="width:21%"><col style="width:21%"></colgroup>
 <tr><td class="h" colspan="4">DATOS DE CLIENTE</td></tr>
 <tr>
  <td colspan="3"><span class="lb">Nombre(s) y apellido(s) / Razón social</span><span class="v">${esc(d.clienteNombre)}</span></td>
  <td><span class="lb">Cédula de identidad / R.I.F</span><span class="v">${esc(d.clienteRif)}</span></td>
 </tr>
 <tr>
  <td colspan="2"><span class="lb">Correo electrónico</span><span class="v">${esc(orNA(d.clienteEmail))}</span></td>
  <td><span class="lb">Teléfono fijo</span><span class="v">${esc(orNA(d.clienteTelFijo))}</span></td>
  <td><span class="lb">Teléfono móvil</span><span class="v">${esc(orNA(d.clienteTelMovil))}</span></td>
 </tr>
 <tr><td class="h" colspan="4">EN CASO DE PERSONA JURÍDICA ESPECIFIQUE LOS DATOS DEL REPRESENTANTE LEGAL Y/O FIRMA</td></tr>
 <tr>
  <td colspan="3"><span class="lb">Nombre(s) y apellido(s)</span><span class="v">${esc(repNombre)}</span></td>
  <td><span class="lb">Cédula de identidad</span><span class="v">${esc(repCedula)}</span></td>
 </tr>
</table>
<div class="gap"></div>

<table>
 <colgroup><col style="width:19%"><col style="width:17%"><col style="width:23%"><col style="width:21%"><col style="width:21%"></colgroup>
 <tr><td class="h" colspan="5">DATOS DEL TÍTULO VALOR Y DE LA OPERACIÓN</td></tr>
 <tr>
  <td colspan="3"><span class="lb">Tipo de instrumento</span><span class="v">${esc(d.tipoInstrumento)}</span></td>
  <td colspan="2"><span class="lb">Nombre del título valor / Código ISIN</span><span class="v b">${esc(d.codigoTitulo)}</span></td>
 </tr>
 <tr>
  <td><span class="lb">Tipo de operación</span><span class="v b">${esc(d.tipoOperacion)}</span></td>
  <td colspan="2"><span class="lb">Tipo de mercado</span><span class="v opts">
   <span class="opt"><span class="chk">${x(d.tipoMercado === "PRIMARIO")}</span>Mercado Primario</span>
   <span class="opt"><span class="chk">${x(d.tipoMercado === "SECUNDARIO")}</span>Mercado Secundario</span></span></td>
  <td colspan="2"><span class="lb">Moneda</span><span class="v opts">
   <span class="opt"><span class="chk">${x(d.moneda === "BS")}</span>Bolívares (Bs)</span>
   <span class="opt"><span class="chk">${x(d.moneda === "USD")}</span>Dólares ($)</span></span></td>
 </tr>
 <tr>
  <td colspan="3"><span class="lb">Valor nominal</span><span class="v">${esc(fmtMonto(d.valorNominal, d.moneda))}</span></td>
  <td><span class="lb">Precio (%)</span><span class="v">${esc(fmtNum(d.precio))}%</span></td>
  <td><span class="lb">Contravalor</span><span class="v b">${esc(fmtMonto(d.contravalor, d.moneda))}</span></td>
 </tr>
</table>
<div class="gap"></div>

<table>
 <colgroup><col style="width:30%"><col style="width:20%"><col style="width:30%"><col style="width:20%"></colgroup>
 <tr><td class="h" colspan="2">CUENTA ASOCIADA *</td><td class="h" colspan="2">CUENTA EN DÓLARES / BANCA NACIONAL</td></tr>
 <tr>
  <td><span class="lb">Nombre del banco</span><span class="v">${esc(orNA(d.cuentaAsociadaBanco))}</span></td>
  <td><span class="lb">N° de cuenta</span><span class="v">${esc(orNA(d.cuentaAsociadaNumero))}</span></td>
  <td><span class="lb">Nombre del banco</span><span class="v">${esc(orNA(d.cuentaDolaresBanco))}</span></td>
  <td><span class="lb">N° de cuenta</span><span class="v">${esc(orNA(d.cuentaDolaresNumero))}</span></td>
 </tr>
</table>
<div class="foot">(*) Por favor, señalar los datos de la cuenta bancaria en la que se realizará la liquidación del CFB.</div>
<div class="gap"></div>

<table>
 <colgroup><col style="width:50%"><col style="width:50%"></colgroup>
 <tr><td class="h" colspan="2">DECLARACIÓN DEL CLIENTE</td></tr>
 <tr><td class="decl" colspan="2">
  <p><b>El Cliente declara que:</b></p>
  <p>1.- Certifico que la información y datos suministrados en la presente son verdaderos y autorizo a la Bolsa de Valores de Caracas y Superintendencia Nacional de Valores (SUNAVAL) y demás autoridades competentes a verificar o validar su autenticidad.</p>
  <p>2.- Autorizo la forma expresa a <b>GRUPO BURSÁTIL VENEZOLANO, CASA DE BOLSA C.A.</b>, para que suministre a las autoridades competentes la información que estas requieran sobre las operaciones de compra y venta de divisas y/o títulos valores a que se refiere esta solicitud.</p>
  <p>3.- Los recursos financieros utilizados para la presente solicitud de compra y venta de divisas y/o de títulos valores, no tienen relación alguna con dinero, bienes, haberes, valores o títulos producto de actividad ilícitas, a las que se refiere la Ley Orgánica Contra la Delincuencia Organizada y Financiamiento al Terrorismo, la Ley Orgánica de Drogas y la Resolución 110 de las "Normas relativas a la Administración y Fiscalización de los Riesgos relacionados con los delitos de Legitimación de Capitales y Financiamiento al Terrorismo aplicables a las Instituciones reguladas por la Superintendencia Nacional de Valores". Ahora bien, en el supuesto de existir actividades que pudiesen considerarse como sospechosas, asumo la plena responsabilidad del caso, en el entendido que <b>GRUPO BURSÁTIL VENEZOLANO, CASA DE BOLSA C.A.</b> y/o la Superintendencia Nacional de Valores realizarán las diligencias pertinentes de conformidad con las disposiciones legales y vigentes.</p>
  <p>4.- No está incurso en investigaciones, ni ha transgredido la Normativa Vigente.</p>
  <p>5.- Es el único responsable de su decisión de la presente solicitud de Compra/Venta de Títulos Valores.</p>
  <p>6.- Acepta pagar cualquier monto adecuado por el cobro de comisiones, tarifas, recargos u otra contraprestación derivada a los servicios de compra, custodia, cobranzas y ulterior pago de los rendimientos y/o capitales de los títulos valores objeto de esta solicitud, según lo establecido en el contrato correspondiente.</p>
  <p>7.- Así mismo declaro que:</p>
 </td></tr>
 <tr>
  <td><span class="lb">El origen de los fondos son</span><span class="v b c">${esc(d.origenFondos)}</span></td>
  <td><span class="lb">Y el destino de los fondos son</span><span class="v b c">${esc(d.destinoFondos)}</span></td>
 </tr>
</table>
<div class="gap"></div>

<table>
 <colgroup><col style="width:34%"><col style="width:18%"><col style="width:28%"><col style="width:20%"></colgroup>
 <tr><td class="h" colspan="3">TITULAR / REPRESENTANTE LEGAL</td><td class="h">HUELLA DACTILAR</td></tr>
 <tr class="sign">
  <td><span class="lb">Nombre(s) y apellido(s)</span><span class="v">${esc(repNombre)}</span></td>
  <td><span class="lb">Cédula de identidad</span><span class="v">${esc(repCedula)}</span></td>
  <td><span class="lb">Firma</span></td>
  <td></td>
 </tr>
</table>
<div class="gap"></div>

<table>
 <colgroup><col style="width:34%"><col style="width:26%"><col style="width:40%"></colgroup>
 <tr><td class="h" colspan="3">ÚNICAMENTE PARA SER LLENADO POR EL OPERADOR GRUPO BURSÁTIL VENEZOLANO, CASA DE BOLSA C.A.</td></tr>
 <tr class="stamp">
  <td><span class="lb">Nombre(s) y apellido(s) operador</span><span class="v">${esc(d.operadorNombre)}</span></td>
  <td><span class="lb">N° de teléfono</span><span class="v">${esc(d.operadorTelefono)}</span></td>
  <td><span class="lb">Sello de la oficina</span></td>
 </tr>
</table>
</div>`;
}

/** Documento HTML completo (para vista previa en iframe o impresión con window.print). */
export function buildOrdenHTML(d: OrdenData): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>${esc(d.tipoOperacion === "COMPRA" ? "ODC" : "ODV")} ${esc(d.numeroOrden)}</title>
<link href="https://fonts.googleapis.com/css2?family=Carlito:wght@400;700&display=swap" rel="stylesheet">
<style>@page{size:A4;margin:0}html,body{margin:0;padding:0}${ORDEN_CSS}</style>
</head><body>${buildOrdenBody(d)}</body></html>`;
}
