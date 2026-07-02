// supabase/functions/_shared/templates.ts
//
// Plantillas HTML pixel-fieles a los PDFs reales que GBV firma con clientes
// y entrega a SUNAVAL/BVC. Diseñadas para impresión A4 mediante CSS @page.
//
// Las 8 plantillas son:
//   1. CFB                — Carta de solicitud de emisión del CFB
//   2. CARTA_SUNAVAL      — Notificación a SUNAVAL del programa
//   3. CARTA_BVC          — Solicitud de inscripción del CFB en BVC
//   4. HOJA_TERMINOS      — Hoja de términos y condiciones
//   5. CDC                — Confirmación de compra
//   6. CDV                — Confirmación de venta
//   7. ODC                — Orden de compra
//   8. ODV                — Orden de venta

// ============================================================
// TIPOS
// ============================================================

export interface TemplateContext {
  // Emisión
  simbolo_cfb: string;
  fecha_emision: string;            // ISO yyyy-mm-dd
  fecha_vencimiento: string;        // ISO yyyy-mm-dd
  fecha_documento: string;          // ISO yyyy-mm-dd (fecha de generación del documento)
  valor_nominal_usd: number;
  cantidad_ordenes_compra: number;
  precio: number;                   // Decimal: 0.93
  descuento: number;                // Decimal: 0.07
  rendimiento_anualizado: number;   // Decimal: 0.6452
  dias_colocados: number;
  monto_efectivo_usd: number;
  valor_efectivo_bs: number;
  tasa_cambio_bs_usd: number;

  // Cedente
  cedente_razon_social: string;
  cedente_rif: string;
  cedente_rep_legal: string | null;
  cedente_cargo: string | null;
  cedente_cedula: string | null;

  // Programa
  programa_pcfb: string;
  programa_plazo_ejecucion: number;        // 180 días, etc.
  programa_contrato_cesion: string | null;

  // Deudor cedido (de programas)
  deudor_razon_social: string;
  deudor_rif: string;
  deudor_rep_legal: string;
  deudor_cargo: string;
  deudor_cedula: string;
  deudor_correo: string | null;
  deudor_telefono: string | null;

  // Financista (puede ser persona natural o jurídica, o el mismo deudor cedido en operaciones masivas)
  financista_razon_social: string;          // Para masivos = "Grupo Cashea Ve, C.A."
  financista_rif: string;
  financista_rep_legal: string | null;
  financista_cedula: string | null;
  financista_es_persona_natural: boolean;

  // Constantes del sistema (de app_config)
  gbv_razon_social: string;
  gbv_rif: string;
  gbv_miembro_bvc: string;
  gbv_presidente: string;
  operador_nombre: string;
  operador_cedula: string;
  operador_telefono: string;
  bvc_atencion: string;
  bvc_gerencia: string;
  bvc_direccion_l1: string;
  bvc_direccion_l2: string;
  bvc_direccion_l3: string;
  asesores_cashea: string;
  circular_sunaval: string;
  circular_sunaval_fecha: string;
  circular_bvc_fecha: string;
  texto_activo_subyacente: string;
}

// ============================================================
// FORMATEADORES (idénticos a los del cliente, replicados acá porque
// las edge functions de Deno no pueden importar del frontend)
// ============================================================

const MES_ABBR = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

export function fmtFechaCaracas(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return `${d.getDate()} de ${MES_ABBR[d.getMonth()]}. de ${d.getFullYear()}`;
}
export function fmtFechaDDMMYYYY(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}
export function fmtUSD(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2
  }).format(n);
}
export function fmtBs(n: number): string {
  return new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(n);
}
export function fmtPct(n: number, decimals = 2): string {
  return (n * 100).toFixed(decimals) + '%';
}
export function fmtTasa(n: number): string {
  return n.toFixed(4);
}
// ============================================================
// CSS COMPARTIDO
// ============================================================
function baseStyles(): string {
  return `<style>
  @page { size: A4; margin: 18mm 18mm 18mm 18mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Calibri', 'Trebuchet MS', 'Segoe UI', Arial, sans-serif;
    color: #000;
    font-size: 10.5pt;
    line-height: 1.45;
  }
  .page { padding: 0; max-width: 100%; }
  /* Header con logo + fecha */
  .doc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 14px;
  }
  .logo {
    width: 90px; height: 50px;
    background: #fff;
    display: flex; align-items: center; justify-content: center;
    border: 1px dashed #ccc;
    font-family: Arial, sans-serif; font-size: 8pt; color: #999;
    text-align: center;
  }
  .logo img { max-width: 100%; max-height: 100%; }
  .doc-fecha {
    font-weight: bold;
    font-size: 11pt;
    text-align: right;
    padding-top: 6px;
  }
  .cfb-title {
    text-align: center;
    margin: 2px 0 10px;
    font-weight: bold;
  }
  .cfb-title .cfb-cedente {
    font-size: 12pt;
    margin-bottom: 4px;
  }
  .cfb-title .cfb-subtitle {
    font-size: 11pt;
  }
  /* Bloque destinatario */
  .destinatario {
    margin: 14px 0 10px;
    font-size: 10.5pt;
  }
  .destinatario .titulo { font-weight: bold; margin-bottom: 1px; }
  .destinatario .linea { line-height: 1.35; }
  /* Atención */
  .atencion {
    text-align: right;
    font-weight: bold;
    margin: 10px 0 14px;
    font-size: 10.5pt;
  }
  /* Saludo y párrafos */
  .saludo { font-weight: bold; margin: 12px 0 10px; }
  p.parrafo {
    text-align: justify;
    margin: 8px 0;
    text-indent: 0;
  }
  p.parrafo strong { font-weight: bold; }
  /* Listas numeradas */
  ol.declaracion {
    margin: 10px 0 10px 8px;
    padding-left: 14px;
  }
  ol.declaracion li {
    text-align: justify;
    margin: 8px 0;
  }
  /* Tablas etiqueta-valor estilo "carta formal" (sin bordes, dos columnas alineadas) */
  table.kv {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0 12px;
  }
  table.kv td {
    padding: 3px 0;
    vertical-align: top;
    font-size: 10.5pt;
  }
  table.kv td.k {
    width: 42%;
    padding-right: 10px;
  }
  table.kv td.v {
    width: 58%;
  }
  table.kv td.v.right { text-align: right; }
  /* Encabezados de sección dentro del documento */
  .seccion-titulo {
    text-align: center;
    font-weight: bold;
    font-size: 11pt;
    margin: 18px 0 10px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .seccion-titulo-izq {
    font-weight: bold;
    font-size: 10.5pt;
    margin: 14px 0 4px;
    text-transform: uppercase;
  }
  /* Bloque con etiquetas en bold para "Cedente" / "Deudor Cedido" */
  .bloque-detalle { margin: 6px 0 12px; }
  .bloque-detalle .titulo {
    font-weight: bold;
    margin-bottom: 4px;
    font-size: 10.5pt;
  }
  .bloque-detalle table.kv td.k {
    padding-left: 14px;
    width: 38%;
  }
  /* Cierre y firma */
  .cierre { margin: 22px 0 4px; }
  .firma-area {
    margin-top: 56px;
    text-align: center;
    page-break-inside: avoid;
  }
  .espacio-firma { height: 92px; }
  .firma-area .linea-firma {
    border-top: 0;
    width: 220px;
    margin: 0 auto;
  }
  .firma-area .nombre {
    font-weight: bold;
    font-size: 10.5pt;
    margin-top: 2px;
  }
  .firma-area .subtitulo {
    font-size: 9.5pt;
  }
  /* Bloque legal pequeño al pie (Hoja de Términos) */
  p.legal-pie {
    text-align: justify;
    font-size: 8pt;
    line-height: 1.35;
    margin: 6px 0;
    color: #222;
  }
  /* Acciones (ocultas en print) */
  .actions {
    text-align: center;
    margin: 14px 0;
    background: #f4f4f6;
    padding: 10px;
  }
  .actions button {
    padding: 8px 18px;
    background: #0c2a52;
    color: #fff;
    border: 0;
    cursor: pointer;
    font-size: 10pt;
    font-family: inherit;
  }
  @media print {
    .actions { display: none; }
  }
  /* Formularios ODC/ODV */
  table.form {
    width: 100%;
    border-collapse: collapse;
    margin: 6px 0;
    font-size: 8.5pt;
    page-break-inside: avoid;
  }
  table.form td, table.form th {
    border: 1px solid #000;
    padding: 3px 5px;
    vertical-align: middle;
    line-height: 1.3;
  }
  table.form th {
    background: #f0f0f0;
    text-align: left;
    font-weight: bold;
    text-transform: uppercase;
    font-size: 8pt;
  }
  table.form .label-mini {
    font-size: 7pt;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  table.form .checkbox-cell {
    text-align: center;
    font-size: 11pt;
    font-weight: bold;
    width: 26px;
  }
  table.form tr.firma-form-row td {
    height: 80px;
    vertical-align: top;
  }
  table.form td.firma-form-cell {
    min-width: 80px;
  }
  .form-titulo {
    background: #d9d9d9;
    font-weight: bold;
    text-align: center;
    padding: 5px;
    font-size: 10pt;
    text-transform: uppercase;
  }
  .form-titulo-claro {
    background: #f0f0f0;
    font-weight: bold;
    padding: 4px 6px;
    font-size: 9pt;
    text-transform: uppercase;
  }
  </style>`;
}
function logoBlock(): string {
  return ``;
}
function actionsBar(): string {
  return `<div class="actions">
    <button onclick="window.print()">Imprimir / Guardar como PDF</button>
  </div>`;
}

// ============================================================
// 1. CFB — Carta de solicitud de emisión del CFB
// ============================================================
//
// Esta es la carta que el cedente firma dirigida al Presidente de GBV
// solicitando la emisión del CFB. Incluye los términos y referencia
// al programa registrado en SUNAVAL.
function renderSolicitudEmision(c: TemplateContext): string {
  return `<!doctype html>
<html lang="es-VE"><head><meta charset="utf-8"/>
<title>Hoja de Términos ${c.simbolo_cfb} — ${c.cedente_razon_social}</title>
${baseStyles()}
<style>
  @page { size: A4; margin: 6mm 18mm 8mm 18mm; }
  html, body { height: auto; }
  body { font-size: 9pt; line-height: 1.3; }
  .cfb-compact { page-break-after: avoid; }
  .cfb-compact .doc-header { margin-bottom: 2px; }
  .cfb-compact .doc-fecha { font-size: 10pt; padding-top: 0; }
  .cfb-compact .destinatario { margin: 2px 0 4px; font-size: 9pt; }
  .cfb-compact .saludo { margin: 4px 0 4px; }
  .cfb-compact p.parrafo { margin: 4px 0; font-size: 9pt; }
  .cfb-compact table.kv { margin: 3px 0 5px; }
  .cfb-compact table.kv td { padding: 1px 0; font-size: 9pt; }
  .cfb-compact .firma-area { page-break-inside: avoid; page-break-before: avoid; }
</style>
</head><body>
${actionsBar()}
<div class="page cfb-compact">
  <div class="doc-header">
    ${logoBlock()}
    <div class="doc-fecha">Caracas, ${fmtFechaCaracas(c.fecha_documento)}</div>
  </div>
  <div class="destinatario">
    <div class="titulo">Señores:</div>
    <div class="linea"><strong>${c.gbv_razon_social}</strong></div>
    <div class="linea">Atn: ${c.gbv_presidente}</div>
    <div class="linea">Presidente</div>
  </div>
  <div class="saludo">Estimados Señores:</div>
  <p class="parrafo">
    Tenemos el agrado de dirigirnos a ustedes para solicitar la emisión del Certificado de
    Financiamiento Bursátil <strong>${c.simbolo_cfb}</strong>, correspondiente al Programa de Certificados de
    Financiamiento Bursátil <strong>${c.programa_pcfb}</strong>, debidamente notificado a la
    Superintendencia Nacional de Valores de conformidad con la Circular No.
    ${c.circular_sunaval} del ${c.circular_sunaval_fecha}.
  </p>
  <table class="kv">
    <tr><td class="k">Programa de Certificado de<br/>Financiamiento Bursatil</td>
        <td class="v">${c.programa_pcfb}</td></tr>
    <tr><td class="k">Monto Nominal</td>
        <td class="v">${fmtUSD(c.valor_nominal_usd)}</td></tr>
    <tr><td class="k">Fecha de emisión</td>
        <td class="v">${fmtFechaDDMMYYYY(c.fecha_emision)}</td></tr>
    <tr><td class="k">Fecha de vencimiento</td>
        <td class="v">${fmtFechaDDMMYYYY(c.fecha_vencimiento)}</td></tr>
    <tr><td class="k">Plazo</td>
        <td class="v">${c.dias_colocados} Días</td></tr>
    <tr><td class="k">Modalidad</td>
        <td class="v">A descuento</td></tr>
    <tr><td class="k">Rendimiento anualizado</td>
        <td class="v">${fmtPct(c.rendimiento_anualizado, 2)} anualizado</td></tr>
    <tr><td class="k">Precio de colocación</td>
        <td class="v">${fmtPct(c.precio, 2)}</td></tr>
    <tr><td class="k">Base</td>
        <td class="v">ACT/360</td></tr>
    <tr><td class="k">Agente Estructurador</td>
        <td class="v">${c.gbv_razon_social}</td></tr>
    <tr><td class="k">Contrato de cesión</td>
        <td class="v">Contrato Marco de Cesión de Derechos de Crédito No. ${c.programa_contrato_cesion ?? c.programa_pcfb}</td></tr>
    <tr><td class="k">Estructura del Certificado de<br/>Financiamiento Bursatil (CFB)</td>
        <td class="v">${c.cantidad_ordenes_compra} ${c.texto_activo_subyacente}</td></tr>
    <tr><td class="k">Forma de adquisición</td>
        <td class="v">A través de Bolsa de Valores de Caracas</td></tr>
    <tr><td class="k">Cedente</td>
        <td class="v">${c.cedente_razon_social}</td></tr>
    <tr><td class="k">Deudor Cedido</td>
        <td class="v">${(c.deudor_razon_social && c.deudor_razon_social !== '—') ? c.deudor_razon_social : 'Grupo Cashea Ve, C.A.'} en representación de los usuarios de la plataforma Cashea.</td></tr>
  </table>
  <p class="parrafo">
    Los términos anteriores se encuentran en un todo de acuerdo con las condiciones generales del
    Programa de Certificados de Financiamiento Bursatil notificadas a la Superintendencia Nacional de
    Valores.
  </p>
  <div class="firma-area" style="margin-top: 8px;">
    <div class="espacio-firma" style="height: 125px;">&nbsp;</div>
    <div class="nombre">${c.cedente_rep_legal ?? '—'}</div>
    <div class="subtitulo">Por ${(c.deudor_razon_social && c.deudor_razon_social !== '—') ? c.deudor_razon_social : 'Grupo Cashea Ve, C.A.'}</div>
    <div class="subtitulo">Mandatario de</div>
    <div class="subtitulo"><strong>${c.cedente_razon_social}</strong></div>
  </div>
</div>
</body></html>`;
}
// ============================================================
// 2. CARTA SUNAVAL — Notificación a SUNAVAL del programa
// ============================================================
export function renderCartaSunaval(c: TemplateContext): string {
  return `<!doctype html>
<html lang="es-VE"><head><meta charset="utf-8"/>
<title>Carta SUNAVAL ${c.simbolo_cfb} — ${c.cedente_razon_social}</title>
${baseStyles()}
<style>
  @page { size: A4; margin: 6mm 18mm 8mm 18mm; }
  body { font-size: 9.5pt; line-height: 1.28; }
  .doc-header { margin-bottom: 6px; }
  .destinatario { margin: 6px 0 6px; font-size: 9.5pt; }
  .saludo { margin: 6px 0 6px; }
  p.parrafo { margin: 4px 0; }
  .bloque-detalle { page-break-inside: avoid; margin: 4px 0 6px; }
  .bloque-detalle .titulo { margin-bottom: 2px; font-size: 9.5pt; }
  .seccion-titulo { page-break-after: avoid; margin: 8px 0 4px; font-size: 10.5pt; }
  table.kv { page-break-inside: avoid; margin: 3px 0 4px; }
  table.kv td { padding: 1.5px 0; font-size: 9.5pt; }
  .cierre { page-break-after: avoid; margin: 10px 0 2px; }
  .firma-area { page-break-inside: avoid; page-break-before: avoid; margin-top: 22px; }
  .espacio-firma { height: 56px; }
</style>
</head><body>
${actionsBar()}
<div class="page">
  <div class="doc-header">
    ${logoBlock()}
    <div class="doc-fecha">Caracas, ${fmtFechaCaracas(c.fecha_documento)}</div>
  </div>
  <div class="destinatario">
    <div class="titulo">Señores:</div>
    <div class="linea"><strong>Superintendencia Nacional de Valores</strong></div>
  </div>
  <div class="saludo">Estimados Señores:</div>
  <p class="parrafo">
    Por medio de la presente, y en conformidad con lo dispuesto en la Circular ${c.circular_sunaval} con
    fecha del ${c.circular_sunaval_fecha}, deseamos informarle sobre nuestra intención de emitir un programa
    de Certificados de Financiamiento Bursátil, con la finalidad de registrar los mismos en la Bolsa de
    Valores de Caracas para su negociación.
  </p>
  <div class="seccion-titulo">FICHA DE IDENTIFICACIÓN DIGITAL</div>
  <div class="bloque-detalle">
    <div class="titulo">Cedente</div>
    <table class="kv">
      <tr><td class="k">Denominación Social</td><td class="v">${c.cedente_razon_social}</td></tr>
      <tr><td class="k">RIF</td><td class="v">${c.cedente_rif}</td></tr>
      <tr><td class="k">Representante Legal</td><td class="v">${c.cedente_rep_legal ?? '—'}</td></tr>
      <tr><td class="k">Cargo</td><td class="v">${c.cedente_cargo ?? 'Mandatario'}</td></tr>
      <tr><td class="k">Cédula</td><td class="v">${c.cedente_cedula ?? '—'}</td></tr>
    </table>
  </div>
  <div class="bloque-detalle">
    <div class="titulo">Deudor Cedido</div>
    <table class="kv">
      <tr><td class="k">Denominación Social</td><td class="v">${c.deudor_razon_social}</td></tr>
      <tr><td class="k">RIF</td><td class="v">${c.deudor_rif}</td></tr>
      <tr><td class="k">Representante Legal</td><td class="v">${c.deudor_rep_legal}</td></tr>
      <tr><td class="k">Cargo</td><td class="v">${c.deudor_cargo}</td></tr>
      <tr><td class="k">Cédula</td><td class="v">${c.deudor_cedula}</td></tr>
    </table>
  </div>
  <div class="seccion-titulo">CARACTERÍSTICAS GENERALES</div>
  <table class="kv">
    <tr><td class="k">Programa de CFB</td>
        <td class="v"><strong>${c.programa_pcfb}</strong></td></tr>
    <tr><td class="k">Monto total nominal del activo<br/>subyacente</td>
        <td class="v">${fmtUSD(c.valor_nominal_usd)}</td></tr>
    <tr><td class="k">Contrato de Cesión de Derechos de<br/>Crédito</td>
        <td class="v">Contrato Marco de Cesión de Derechos de Crédito No. ${c.programa_contrato_cesion ?? c.programa_pcfb}</td></tr>
    <tr><td class="k">Valor Nominal CFB</td>
        <td class="v">${fmtUSD(c.valor_nominal_usd)}</td></tr>
    <tr><td class="k">Fecha de emisión</td>
        <td class="v">${fmtFechaDDMMYYYY(c.fecha_emision)}</td></tr>
    <tr><td class="k">Fecha de vencimiento</td>
        <td class="v">${fmtFechaDDMMYYYY(c.fecha_vencimiento)}</td></tr>
    <tr><td class="k">Cant. Operaciones</td>
        <td class="v">${c.cantidad_ordenes_compra}</td></tr>
    <tr><td class="k">Activo Subyacente</td>
        <td class="v">${c.texto_activo_subyacente}</td></tr>
    <tr><td class="k">Financista</td>
        <td class="v">${c.financista_razon_social}</td></tr>
    <tr><td class="k">Plazo de ejecución (programa)</td>
        <td class="v">${c.programa_plazo_ejecucion} días</td></tr>
  </table>
  <p class="parrafo">
    Agradecemos de antemano su atención, en caso de requerir más detalles o tener alguna pregunta,
    no dude en ponerse en contacto con nosotros.
  </p>
  <p class="parrafo">
    Quedamos a su disposición para cualquier aclaración adicional que pueda necesitar.
  </p>
  <div data-no-break>
    <div class="cierre">Atentamente,</div>
    <div class="firma-area">
      <div class="espacio-firma">&nbsp;</div>
      <div class="nombre">${c.operador_nombre}</div>
      <div class="subtitulo">Firma Autorizada</div>
      <div class="subtitulo">${c.operador_cedula}</div>
    </div>
  </div>
</div>
</body></html>`;
}
// ============================================================
// 3. CARTA BVC — Solicitud de inscripción del CFB en BVC
// ============================================================
export function renderCartaBVC(c: TemplateContext): string {
  return `<!doctype html>
<html lang="es-VE"><head><meta charset="utf-8"/>
<title>Carta BVC ${c.simbolo_cfb} — ${c.cedente_razon_social}</title>
${baseStyles()}
</head><body>
${actionsBar()}
<div class="page">
  <div class="doc-header">
    ${logoBlock()}
    <div class="doc-fecha">Caracas, ${fmtFechaCaracas(c.fecha_documento)}</div>
  </div>
  <div class="destinatario">
    <div class="titulo">Señores:</div>
    <div class="linea"><strong>BOLSA DE VALORES DE CARACAS</strong></div>
    <div class="linea">${c.bvc_direccion_l1}</div>
    <div class="linea">${c.bvc_direccion_l2}</div>
    <div class="linea">${c.bvc_direccion_l3}</div>
    <div class="linea">Presente. -</div>
  </div>
  <div class="atencion">
    Atención: ${c.bvc_atencion}<br/>
    ${c.bvc_gerencia}
  </div>
  <p class="parrafo">
    Quien suscribe <strong>${c.operador_nombre}</strong>, venezolano, mayor de edad,
    domiciliado en Caracas y titular de la Cedula de Identidad N° ${c.operador_cedula}, en nombre de
    mi representada <strong>${c.gbv_razon_social}</strong> RIF N°: ${c.gbv_rif},
    Miembro Nro. ${c.gbv_miembro_bvc} de la Bolsa de Valores de Caracas, C.A., solicito por medio de la presente,
    la inscripción del Certificado de Financiamiento Bursátil, emitido por la empresa
    <strong>${c.cedente_razon_social}</strong>, RIF N°: ${c.cedente_rif}, por la cantidad de
    <strong>${fmtUSD(c.valor_nominal_usd)}</strong> y cuya hoja de términos se
    anexa a la presente, siguiendo lo establecido en la circular de fecha ${c.circular_bvc_fecha},
    emitida por la Bolsa de Valores de Caracas.
  </p>
  <p class="parrafo">
    De igual forma, por medio de la presente declaro <strong>BAJO FE DE JURAMENTO</strong> lo siguiente:
  </p>
  <ol class="declaracion">
    <li>
      Que los datos aquí suministrados, así como los establecidos en la hoja de términos del
      referido Certificado de Financiamiento Bursátil, cumplen con lo establecido en la
      <strong>CIRCULAR RELATIVA A LOS LINEAMIENTOS DEL SEGMENTO DE NEGOCIACION
      DENOMINADO "MERCADO DE OTROS BIENES" EN LAS BOLSAS DE VALORES</strong>, dictado por
      la Superintendencia Nacional de Valores, identificada ${c.circular_sunaval}, de fecha
      ${c.circular_sunaval_fecha}.
    </li>
    <li>
      Que la Bolsa de Valores de Caracas, C.A., queda exonerada de responsabilidad ante
      cualquier incumplimiento a lo previsto en la referida circular emitida por la
      Superintendencia Nacional de Valores y demás obligaciones derivadas de la negociación
      en bolsa de los Certificados de Financiamiento Bursátil.
    </li>
  </ol>
  <div data-no-break>
    <p class="parrafo">Sin otro particular al que hacer referencia,</p>
    <div class="cierre">Atentamente,</div>
    <div class="firma-area">
      <div class="espacio-firma">&nbsp;</div>
      <div class="nombre">${c.operador_nombre}</div>
      <div class="subtitulo">Firma Autorizada</div>
    </div>
  </div>
</div>
</body></html>`;
}
// ============================================================
// 4. HOJA DE TÉRMINOS — Hoja de términos y condiciones del CFB
// ============================================================
//
// Diferencia clave con el sistema actual: incluye 3 párrafos legales
// regulatorios al final (artículo 7 de la Circular SUNAVAL, exoneraciones
// de IGTF, agencia de cobro de Cashea Ve).
export function renderCFB(c: TemplateContext): string {
  return `<!doctype html>
<html lang="es-VE"><head><meta charset="utf-8"/>
<title>CFB ${c.simbolo_cfb} — ${c.cedente_razon_social}</title>
${baseStyles()}
<style>
  @page { size: A4; margin: 8mm 18mm 6mm 18mm; }
  .page.cfb-doc { padding-top: 0; padding-bottom: 0; page-break-after: avoid; }
  .cfb-doc .doc-header { margin-bottom: 4px; }
  .cfb-doc .cfb-title { margin: 4px 0 8px; }
  .cfb-doc .firma-cedente { margin: 78px 0 8px !important; }
  .cfb-doc p.legal-pie { margin: 4px 0; font-size: 7.5pt; line-height: 1.25; }
  .cfb-doc p.legal-pie:last-child { margin-bottom: 0; }
</style>
</head><body>
${actionsBar()}
<div class="page cfb-doc">
  <div class="doc-header">
    ${logoBlock()}
    <div class="doc-fecha"><strong>${c.simbolo_cfb}</strong></div>
  </div>
  <div class="cfb-title">
    <div class="cfb-cedente">${c.cedente_razon_social}</div>
    <div class="cfb-subtitle">Certificado de Financiamiento Bursátil ${fmtUSD(c.valor_nominal_usd)}</div>
  </div>
  <p class="parrafo" style="text-align: justify;">
    Autorizado por la Superintendencia Nacional de Valores, el ${c.circular_sunaval_fecha}, mediante CIRCULAR
    ${c.circular_sunaval} sobre lineamientos del segmento:
  </p>
  <p class="parrafo" style="font-style: italic; text-align: center; margin: 6px 0 14px;">
    Expresado en dólares de Los Estados Unidos de América.
  </p>
  <table class="kv">
    <tr><td class="k">Programa de CFB</td>
        <td class="v">${c.programa_pcfb}</td></tr>
    <tr><td class="k">Cedente</td>
        <td class="v">${c.cedente_razon_social}</td></tr>
    <tr><td class="k">Deudor Cedido</td>
        <td class="v">${(c.deudor_razon_social && c.deudor_razon_social !== '—') ? c.deudor_razon_social : 'Grupo Cashea Ve, C.A.'} en representación de<br/>los usuarios de la plataforma Cashea.</td></tr>
    <tr><td class="k">Modalidad</td>
        <td class="v">A descuento</td></tr>
    <tr><td class="k">Estructurador</td>
        <td class="v">${c.gbv_razon_social}</td></tr>
    <tr><td class="k">Contrato de cesión</td>
        <td class="v">Contrato Marco de Cesión de Derechos de Crédito No. ${c.programa_contrato_cesion ?? c.programa_pcfb}</td></tr>
    <tr><td class="k">Estructura del Certificado<br/>de Financiamiento Bursatil<br/>(CFB)</td>
        <td class="v">${c.cantidad_ordenes_compra} ${c.texto_activo_subyacente}</td></tr>
    <tr><td class="k">Fecha de emisión</td>
        <td class="v">${fmtFechaDDMMYYYY(c.fecha_emision)}</td></tr>
    <tr><td class="k">Fecha de vencimiento</td>
        <td class="v">${fmtFechaDDMMYYYY(c.fecha_vencimiento)}</td></tr>
    <tr><td class="k">Plazo</td>
        <td class="v">${c.dias_colocados} Días</td></tr>
    <tr><td class="k">Rendimiento anualizado</td>
        <td class="v">${fmtPct(c.rendimiento_anualizado, 2)} anualizado</td></tr>
    <tr><td class="k">Precio</td>
        <td class="v">${fmtPct(c.precio, 2)}</td></tr>
    <tr><td class="k">Base</td>
        <td class="v">ACT/360</td></tr>
    <tr><td class="k">Forma de Adquisición</td>
        <td class="v">A través de Bolsa de Valores de Caracas</td></tr>
    <tr><td class="k">Cedente</td>
        <td class="v"><strong>${c.cedente_razon_social}</strong></td></tr>
  </table>
  <p class="parrafo firma-cedente" style="text-align: center; font-weight: bold;">
    ${c.cedente_razon_social}<br/><span style="font-weight: normal;">Cedente</span>
  </p>
  <p class="legal-pie">
    El Financista declara conocer y aceptar expresamente que ${c.deudor_razon_social} actuará en calidad de agente de cobro y pago de los fondos y
    flujos derivados de la adquisición de los derechos de crédito incorporados en el presente Certificado de Financiamiento Bursátil. En tal carácter,
    ${c.deudor_razon_social} se limitará a realizar las gestiones de cobro, consolidación y transferencia de dichos fondos, sin asumir obligación de
    garantía, responsabilidad crediticia ni riesgo distinto al estrictamente operativo, procediendo al pago de los montos que correspondan al
    Financista en la fecha de vencimiento del Certificado, conforme a los términos y condiciones aquí establecidos.
  </p>
  <p class="legal-pie">
    De conformidad con lo establecido en el Artículo 7 de la CIRCULAR ${c.circular_sunaval}, se informa al financistas que las inversiones efectuadas en
    el Mercado de Valores están sujetas a las fluctuaciones propias del mercado, por lo que no se garantiza rendimiento alguno en el futuro.
    Asimismo, los recursos invertidos en cualquier operación realizada a través del mercado de valores no cuentan con garantía, aval o respaldo por
    parte del Fondo de Garantía de Depósitos y Protección Bancaria (Fogade) ni de cualquier otro organismo, sea público o privado. En
    consecuencia, el inversionista asume el riesgo inherente a dichas operaciones, incluyendo la posibilidad de pérdida parcial o total del capital
    invertido.
  </p>
  <p class="legal-pie">
    Los Certificados de Financiamiento Bursátil que sean objeto de negociación a través de las bolsas de valores, en la moneda de curso legal en
    Venezuela, gozan de la exención prevista en el Artículo 8, Numeral 6 de la Ley de Reforma Parcial del Decreto con Rango Valor y Fuerza de Ley
    de Impuesto a las Grandes Transacciones Financieras publicada en la Gaceta Oficial de la República Bolivariana de Venezuela número 6687
    Extraordinario del 25 de febrero de 2022. Los Certificados de Financiamiento Bursátil que sean objeto de negociación a través de las bolsas de
    valores en una moneda distinta a la moneda de curso legal en Venezuela, gozan de la exoneración prevista en el artículo 1 del Decreto
    Presidencial No. 4924, publicado en la Gaceta Oficial de la República Bolivariana de Venezuela No. 42823 en fecha 21 de febrero de 2024
    relativo a exoneraciones del pago del impuesto a las grandes transacciones financieras.
  </p>
</div>
</body></html>`;
}

export function renderHojaTerminos(c: TemplateContext): string {
  return renderSolicitudEmision(c);
}
// ============================================================
// 5. CDC — Confirmación de Compra
// ============================================================
//
// Carta dirigida al financista (comprador) confirmando la compra del CFB.
export function renderCDC(c: TemplateContext): string {
  // CDC: el comprador es el financista, el vendedor es el cedente
  return renderConfirmacion(c, 'CDC');
}
// ============================================================
// 6. CDV — Confirmación de Venta
// ============================================================
export function renderCDV(c: TemplateContext): string {
  // CDV: misma estructura, el destinatario es el cedente (vendedor)
  return renderConfirmacion(c, 'CDV');
}
// Render compartido para CDC/CDV
function renderConfirmacion(c: TemplateContext, tipo: 'CDC' | 'CDV'): string {
  const esCompra = tipo === 'CDC';
  const accion = esCompra ? 'COMPRA' : 'VENTA';
  // En CDC el destinatario es el comprador (financista). En CDV el destinatario es el vendedor (cedente).
  const destinatario = esCompra ? c.financista_razon_social : c.cedente_razon_social;
  // Vendedor es siempre el cedente, comprador es siempre el financista
  const vendedor = c.cedente_razon_social;
  const comprador = c.financista_razon_social;
  const fechaConfirmacion = addDaysISO(c.fecha_emision, 1);
  return `<!doctype html>
<html lang="es-VE"><head><meta charset="utf-8"/>
<title>${tipo} ${c.simbolo_cfb} — ${destinatario}</title>
${baseStyles()}
</head><body>
${actionsBar()}
<div class="page">
  <div class="doc-header">
    ${logoBlock()}
    <div class="doc-fecha">Caracas, ${fmtFechaCaracas(fechaConfirmacion)}</div>
  </div>
  <div class="destinatario">
    <div class="titulo">Señores:</div>
    <div class="linea"><strong>${destinatario}</strong></div>
    <div class="linea">Ciudad. -</div>
  </div>
  <div class="saludo">Estimados Señores:</div>
  <p class="parrafo">
    El objeto de la presente es confirmar la operación de <strong>${accion} de Títulos Renta Fija</strong>
    entre Grupo Bursatil Venezolano Casa de Bolsa y ustedes, bajo los términos y
    condiciones que a continuación se detallan:
  </p>
  <div class="seccion-titulo-izq">DETALLE DE LA TRANSACCIÓN:</div>
  <table class="kv">
    <tr><td class="k">Vendedor</td><td class="v">${vendedor}</td></tr>
    <tr><td class="k">Comprador</td><td class="v">${comprador}</td></tr>
    <tr><td class="k">Título</td><td class="v"><strong>${c.simbolo_cfb}</strong></td></tr>
    <tr><td class="k">Fecha de operación</td><td class="v">${fmtFechaDDMMYYYY(c.fecha_emision)}</td></tr>
    <tr><td class="k">Fecha Valor</td><td class="v">${fmtFechaDDMMYYYY(c.fecha_emision)}</td></tr>
    <tr><td class="k">Valor Nominal</td><td class="v">${fmtUSD(c.valor_nominal_usd)}</td></tr>
    <tr><td class="k">Precio</td><td class="v">${fmtPct(c.precio, 2)}</td></tr>
    <tr><td class="k">Base</td><td class="v">ACT/360</td></tr>
    <tr><td class="k">Plazo efectivo</td><td class="v">${c.dias_colocados}</td></tr>
    <tr><td class="k">Monto Efectivo</td><td class="v">${fmtUSD(c.monto_efectivo_usd)}</td></tr>
    <tr><td class="k">Tipo de cambio (Bs/USD)</td><td class="v">${fmtTasa(c.tasa_cambio_bs_usd)}</td></tr>
    <tr><td class="k">Valor Efectivo Bs</td><td class="v">${fmtBs(c.valor_efectivo_bs)}</td></tr>
  </table>
  <div class="seccion-titulo-izq">DETALLE DEL TITULO:</div>
  <table class="kv">
    <tr><td class="k">Tipo</td><td class="v">Certificado de Financiamiento Bursátil</td></tr>
    <tr><td class="k">Cedente</td><td class="v">${c.cedente_razon_social}</td></tr>
    <tr><td class="k">Valor Nominal CFB</td><td class="v">${fmtUSD(c.valor_nominal_usd)}</td></tr>
    <tr><td class="k">Titulo Valor</td><td class="v"><strong>${c.simbolo_cfb}</strong></td></tr>
    <tr><td class="k">Tipo</td><td class="v">Cero Cupón</td></tr>
    <tr><td class="k">Modalidad</td><td class="v">A descuento</td></tr>
    <tr><td class="k">Fecha de emisión</td><td class="v">${fmtFechaDDMMYYYY(c.fecha_emision)}</td></tr>
    <tr><td class="k">Fecha de vencimiento</td><td class="v">${fmtFechaDDMMYYYY(c.fecha_vencimiento)}</td></tr>
    <tr><td class="k">Plazo</td><td class="v">${c.dias_colocados}</td></tr>
    ${esCompra ? `<tr><td class="k">Rendimiento anualizado</td><td class="v">${fmtPct(c.rendimiento_anualizado, 2)}</td></tr>` : ''}
    <tr><td class="k">Base</td><td class="v">ACT/360</td></tr>
    <tr><td class="k">Precio</td><td class="v">${fmtPct(c.precio, 2)}</td></tr>
  </table>
  <div class="cierre">Atentamente,</div>
  <p class="parrafo" style="margin-top: 14px;">
    <strong>${c.gbv_razon_social.replace('Grupo Bursatil Venezolano', 'Grupo Bursátil Venezolano')}</strong>
  </p>
  <p class="parrafo" style="font-style: italic; font-size: 9.5pt; margin-top: 18px;">
    Forma emitida por proceso automatizado. No requiere Firma Autógrafa por parte de GBV. Esta
    confirmación no requiere firma.
  </p>
</div>
</body></html>`;
}
// ============================================================
// 7. ODC — Orden de Compra
// 8. ODV — Orden de Venta
// ============================================================
//
// Formularios de solicitud de orden de compra/venta. El cliente es:
//   - ODC: el comprador (financista)
//   - ODV: el vendedor (cedente)
export function renderODC(c: TemplateContext): string {
  return renderOrden(c, 'COMPRA');
}
export function renderODV(c: TemplateContext): string {
  return renderOrden(c, 'VENTA');
}
function renderOrden(c: TemplateContext, tipo: 'COMPRA' | 'VENTA'): string {
  const esCompra = tipo === 'COMPRA';
  // En ODC el cliente es el financista (comprador). En ODV el cliente es el cedente (vendedor).
  const clienteNombre = esCompra ? c.financista_razon_social : c.cedente_razon_social;
  const clienteRif = esCompra ? c.financista_rif : c.cedente_rif;
  // Siempre usar el representante legal registrado para el cedente/financista,
  // nunca el del deudor cedido (Cashea), porque los firmantes son los de cada compañía.
  const repNombre = esCompra ? (c.financista_rep_legal ?? '—') : (c.cedente_rep_legal ?? '—');
  const repCedula = esCompra ? (c.financista_cedula ?? '—') : (c.cedente_cedula ?? '—');
  const repCorreo = c.deudor_correo ?? 'jesusrojas@cashea.app';
  const repTelefono = c.deudor_telefono ?? '+58 424-1885202';
  // Numeración: ODC = -2, ODV = -1 (convención observada en los PDFs reales)
  const numeroOrden = esCompra ? `${c.simbolo_cfb}-2` : `${c.simbolo_cfb}-1`;
  const fechaSolicitud = fmtFechaDDMMYYYY(addDaysISO(c.fecha_emision, -1));
  const fechaVtoOrden = fmtFechaDDMMYYYY(addDaysISO(c.fecha_emision, 1));
  return `<!doctype html>
<html lang="es-VE"><head><meta charset="utf-8"/>
<title>${esCompra ? 'ODC' : 'ODV'} ${c.simbolo_cfb} — ${clienteNombre}</title>
${baseStyles()}
<style>
  @page { size: A4; margin: 5mm 12mm 6mm 12mm; }
  html, body { height: auto; }
  body { font-size: 9pt; line-height: 1.28; }
  .orden-doc table.form { margin: 3px 0; font-size: 9pt; page-break-inside: avoid; page-break-after: auto; }
  .orden-doc table.form tr { page-break-inside: avoid; }
  .orden-doc table.form td, .orden-doc table.form th {
    padding: 4px 5px 5px;
    vertical-align: top;
    line-height: 1.25;
  }
  .orden-doc table.form th { padding: 3px 5px; font-size: 8.5pt; }
  .orden-doc .label-mini { display: block; margin-bottom: 1px; }
  .orden-doc .checkbox-cell { padding: 2px 4px; }
  .orden-doc table.form tr.firma-form-row td { height: 65px; }
  .orden-doc .form-titulo { padding: 4px; font-size: 9.5pt; }
  .orden-doc .form-titulo-claro { padding: 3px 6px; font-size: 9pt; }
  .orden-doc .declaracion-cell { font-size: 7.5pt !important; line-height: 1.28 !important; }
</style>

</head><body>
${actionsBar()}
<div class="page orden-doc">

  <table class="form">
    <tr>
      <td colspan="3" class="form-titulo">
        SOLICITUD DE ÓRDENES DE COMPRA Y/O VENTA DE RENTA FIJA
      </td>
      <td><span class="label-mini">Fecha de Solicitud:</span><br/>${fechaSolicitud}</td>
    </tr>
    <tr>
      <td colspan="3" rowspan="2" style="border: 0;">&nbsp;</td>
      <td><span class="label-mini">Fecha de Vencimiento:</span><br/>${fechaVtoOrden}</td>
    </tr>
    <tr>
      <td><span class="label-mini">N° de Orden:</span><br/><strong>${numeroOrden}</strong></td>
    </tr>
    <tr>
      <td colspan="3" style="text-align: right;">Persona Natural</td>
      <td>Persona Jurídica <span style="float: right; font-weight: bold; font-size: 12pt;">x</span></td>
    </tr>
  </table>
  <table class="form">
    <tr><td colspan="4" class="form-titulo-claro">DATOS DE CLIENTE</td></tr>
    <tr>
      <td colspan="4">
        <span class="label-mini">Nombre(s) y Apellido(s) / Razón Social</span><br/>
        ${clienteNombre}
      </td>
    </tr>
    <tr>
      <td>
        <span class="label-mini">Cédula de Identidad / R.I.F</span><br/>
        ${clienteRif}
      </td>
      <td>
        <span class="label-mini">Correo electrónico</span><br/>
        ${repCorreo}
      </td>
      <td>
        <span class="label-mini">Teléfono Fijo</span><br/>
        ${repTelefono}
      </td>
      <td>
        <span class="label-mini">Teléfono Movil</span><br/>
        ${repTelefono}
      </td>
    </tr>
    <tr><td colspan="4" class="form-titulo-claro">EN CASO DE PERSONA JURÍDICA ESPECIFIQUE LOS DATOS DEL REPRESENTANTE LEGAL Y/O FIRMA</td></tr>
    <tr>
      <td colspan="3">
        <span class="label-mini">Nombre(s) y Apellido(s)</span><br/>
        ${repNombre}
      </td>
      <td>
        <span class="label-mini">Cédula de Identidad</span><br/>
        ${repCedula}
      </td>
    </tr>
  </table>
  <table class="form">
    <tr><td colspan="4" class="form-titulo-claro">DATOS DEL TÍTULO VALOR</td></tr>
    <tr>
      <td colspan="2">
        <span class="label-mini">Tipo de Instrumento</span><br/>
        Certificado de Financiamiento Bursátil
      </td>
      <td colspan="2">
        <span class="label-mini">Nombre del Título Valor / Codigo ISIN</span><br/>
        <strong>${c.simbolo_cfb}</strong>
      </td>
    </tr>
  </table>
  <table class="form">
    <tr><td colspan="6" class="form-titulo-claro">DATOS DE OPERACIÓN</td></tr>
    <tr>
      <th colspan="2">Tipo de Operación</th>
      <th colspan="2">Tipo de Mercado</th>
      <th colspan="2">Moneda</th>
    </tr>
    <tr>
      <td colspan="2"><strong>${tipo}</strong></td>
      <td>MERCADO PRIMARIO</td>
      <td>MERCADO SECUNDARIO</td>
      <td>BOLÍVARES (Bs)</td>
      <td>DÓLARES ($)</td>
    </tr>
    <tr>
      <td colspan="2">&nbsp;</td>
      <td class="checkbox-cell">x</td>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
      <td class="checkbox-cell">x</td>
    </tr>
    <tr>
      <td colspan="2">&nbsp;</td>
      <td colspan="2">
        <span class="label-mini">Valor Nominal</span><br/>
        ${fmtUSD(c.valor_nominal_usd)}
      </td>
      <td>
        <span class="label-mini">Precio (%)</span><br/>
        ${fmtPct(c.precio, 2)}
      </td>
      <td>
        <span class="label-mini">${esCompra ? 'Contravalor' : 'Contravalor'}</span><br/>
        ${fmtUSD(c.monto_efectivo_usd)}
      </td>
    </tr>
  </table>
  <table class="form">
    <tr><td colspan="2" class="form-titulo-claro">CUENTA ASOCIADA *</td></tr>
    <tr>
      <td><span class="label-mini">Nombre del Banco</span><br/>n/a</td>
      <td><span class="label-mini">N° de cuenta</span><br/>n/a</td>
    </tr>
  </table>
  <table class="form">
    <tr><td colspan="2" class="form-titulo-claro">CUENTA EN DÓLARES / BANCA NACIONAL</td></tr>
    <tr>
      <td><span class="label-mini">Nombre del Banco</span><br/>n/a</td>
      <td><span class="label-mini">N° de Cuenta</span><br/>n/a</td>
    </tr>
  </table>
  <p style="font-size: 8.5pt; margin: 8px 0 6px;">
    (*) Por favor, señalar los datos de la cuenta bancaria en la que se realizará la liquidación del CFB.
  </p>
  <div data-no-break>
  <table class="form">
    <tr><td colspan="3" class="form-titulo-claro">SOLICITUD DE ÓRDENES DE COMPRA Y/O VENTA DE TÍTULOS VALORES - RENTA FIJA</td></tr>
    <tr><td colspan="3" class="form-titulo-claro">DECLARACIÓN DEL CLIENTE</td></tr>
    <tr><td colspan="3" class="declaracion-cell" style="font-size: 7.5pt; text-align: justify; line-height: 1.3;">
      <strong>El Cliente declara que:</strong><br/>
      1.- Certifico que la información y datos suministrados en la presente son verdaderos y autorizo a la Bolsa de Valores de Caracas y Superintendencia Nacional de Valores (SUNAVAL) y demás autoridades competentes a verificar o validar su autenticidad.<br/>
      2.- Autorizo la forma expresa a <strong>GRUPO BURSÁTIL VENEZOLANO, CASA DE BOLSA C.A.</strong>, para que suministre a las autoridades competentes la información que estas requieran sobre las operaciones de compra y venta de divisas y/o títulos valores a que se refiere esta solicitud.<br/>
      3.- Los recursos financieros utilizados para la presente solicitud de compra y venta de divisas y/o de títulos valores, no tienen relación alguna con dinero, bienes, haberes, valores o títulos producto de actividad ilícitas, a las que se refiere la Ley Orgánica Contra la Delincuencia Organizada y Financiamiento al Terrorismo, la Ley Orgánica de Drogas y la Resolución 110 de las "Normas relativas a la Administración y Fiscalización de los Riesgos relacionados con los delitos de Legitimación de Capitales y Financiamiento al Terrorismo aplicables a las Instituciones reguladas por la Superintendencia Nacional de Valores".<br/>
      Ahora bien, en el supuesto de existir actividades que pudiesen considerarse como sospechosas, asumo la plena responsabilidad del caso, en el entendido que <strong>GRUPO BURSÁTIL VENEZOLANO, CASA DE BOLSA C.A.</strong> y/o la Superintendencia Nacional de Valores realizarán las diligencias pertinentes de conformidad con las disposiciones legales y vigentes.<br/>
      4.- No está incurso en investigaciones, ni ha transgredido la Normativa Vigente.<br/>
      5.- Es el único responsable de su decisión de la presente solicitud de Compra/Venta de Títulos Valores.<br/>
      6.- Acepta pagar cualquier monto adecuado por el cobro de comisiones, tarifas, recargos u otra contraprestación derivada a los servicios de compra, custodia, cobranzas y ulterior pago de los rendimientos y/o capitales de los títulos valores objeto de esta solicitud, según lo establecido en el contrato correspondiente.<br/>
      7.- Así mismo declaro que:
    </td></tr>
    <tr>
      <th>El Origen de los Fondos son:</th>
      <th colspan="2">Y el Destino de los Fondos son:</th>
    </tr>
    <tr>
      <td style="text-align: center;"><strong>Actividad Comercial</strong></td>
      <td colspan="2" style="text-align: center;"><strong>Inversión</strong></td>
    </tr>
  </table>
  </div>
  <table class="form">
    <tr><td colspan="4" class="form-titulo-claro">Titular / Representante Legal</td><td class="form-titulo-claro">Huella Dactilar</td></tr>
    <tr class="firma-form-row">
      <td colspan="2">
        <span class="label-mini">Nombre(s) y Apellido(s)</span><br/>
        ${repNombre}
      </td>
      <td colspan="1">
        <span class="label-mini">Cédula de identidad</span><br/>
        ${repCedula}
      </td>
      <td colspan="1" class="firma-form-cell">
        <span class="label-mini">Firma</span>
      </td>
      <td>&nbsp;</td>
    </tr>
  </table>
  <table class="form">
    <tr><td colspan="2" class="form-titulo-claro">ÚNICAMENTE PARA SER LLENADO POR EL OPERADOR GRUPO BURSÁTIL VENEZOLANO, CASA DE BOLSA C.A.</td></tr>
    <tr>
      <td>
        ${c.operador_nombre}<br/>
        <span class="label-mini">Nombre(s) y Apellido(s) Operador</span><br/><br/>
        ${c.operador_telefono}<br/>
        <span class="label-mini">N° de Teléfono</span>
      </td>
      <td style="height: 80px;">
        <span class="label-mini">Sello de la Oficina</span>
      </td>
    </tr>
  </table>
</div>
</body></html>`;
}
// Helper local (Deno no tiene addDaysISO importable desde el frontend)
function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}