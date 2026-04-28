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

const MES_ABBR = ['Ene','Feb','Mar','Apr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

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
    margin-top: 50px;
    text-align: center;
  }
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
    margin: 8px 0;
    font-size: 9pt;
  }
  table.form td, table.form th {
    border: 1px solid #000;
    padding: 4px 6px;
    vertical-align: middle;
  }
  table.form th {
    background: #f0f0f0;
    text-align: left;
    font-weight: bold;
    text-transform: uppercase;
    font-size: 8.5pt;
  }
  table.form .label-mini {
    font-size: 7.5pt;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  table.form .checkbox-cell {
    text-align: center;
    font-size: 12pt;
    font-weight: bold;
    width: 28px;
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
  return `<div class="logo">
    <img src="data:image/png;base64,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" alt="GBV" />
  </div>`;
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
export function renderCFB(c: TemplateContext): string {
  return `<!doctype html>
<html lang="es-VE"><head><meta charset="utf-8"/>
<title>CFB ${c.simbolo_cfb} — ${c.cedente_razon_social}</title>
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
        <td class="v">${c.deudor_razon_social} en representación de los usuarios de la plataforma Cashea.</td></tr>
  </table>
  <p class="parrafo">
    Los términos anteriores se encuentran en un todo de acuerdo con las condiciones generales del
    Programa de Certificados de Financiamiento Bursatil notificadas a la Superintendencia Nacional de
    Valores.
  </p>
  <div class="firma-area">
    <div style="margin-bottom: 60px;">&nbsp;</div>
    <div class="nombre">${c.cedente_rep_legal ?? '—'}</div>
    <div class="subtitulo">Mandatario de</div>
    <div class="subtitulo"><strong>${c.cedente_razon_social}</strong></div>
    <div style="margin-top: 26px; font-size: 9.5pt;">
      Por <strong>${c.deudor_razon_social}</strong><br/>
      ${c.deudor_rep_legal}
    </div>
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
  <div class="cierre">Atentamente,</div>
  <div class="firma-area">
    <div style="margin-bottom: 60px;">&nbsp;</div>
    <div class="nombre">${c.operador_nombre}</div>
    <div class="subtitulo">Firma Autorizada</div>
    <div class="subtitulo">${c.operador_cedula}</div>
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
  <p class="parrafo">Sin otro particular al que hacer referencia,</p>
  <div class="cierre">Atentamente,</div>
  <div class="firma-area">
    <div style="margin-bottom: 60px;">&nbsp;</div>
    <div class="nombre">${c.operador_nombre}</div>
    <div class="subtitulo">Firma Autorizada</div>
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
export function renderHojaTerminos(c: TemplateContext): string {
  return `<!doctype html>
<html lang="es-VE"><head><meta charset="utf-8"/>
<title>Hoja de Términos ${c.simbolo_cfb} — ${c.cedente_razon_social}</title>
${baseStyles()}
</head><body>
${actionsBar()}
<div class="page">
  <div class="doc-header">
    ${logoBlock()}
    <div class="doc-fecha"><strong>${c.simbolo_cfb}</strong></div>
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
        <td class="v">${c.deudor_razon_social} en representación de<br/>los usuarios de la plataforma Cashea.</td></tr>
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
    <tr><td class="k">Asesores Cashea</td>
        <td class="v">${c.asesores_cashea}</td></tr>
    <tr><td class="k">Forma de Adquisición</td>
        <td class="v">A través de Bolsa de Valores de Caracas</td></tr>
    <tr><td class="k">Cedente</td>
        <td class="v"><strong>${c.cedente_razon_social}</strong> ${fmtUSD(c.valor_nominal_usd)}</td></tr>
  </table>
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
  <p class="legal-pie">
    El Financista declara conocer y aceptar expresamente que ${c.deudor_razon_social} actuará en calidad de agente de cobro y pago de los fondos y
    flujos derivados de la adquisición de los derechos de crédito incorporados en el presente Certificado de Financiamiento Bursátil. En tal carácter,
    ${c.deudor_razon_social} se limitará a realizar las gestiones de cobro, consolidación y transferencia de dichos fondos, sin asumir obligación de
    garantía, responsabilidad crediticia ni riesgo distinto al estrictamente operativo, procediendo al pago de los montos que correspondan al
    Financista en la fecha de vencimiento del Certificado, conforme a los términos y condiciones aquí establecidos.
  </p>
</div>
</body></html>`;
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
  // Fecha del documento típicamente es 1 día después de la emisión (fecha de confirmación)
  const fechaConfirmacion = c.fecha_documento;
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
  const repNombre = esCompra ? c.deudor_rep_legal : (c.cedente_rep_legal ?? c.deudor_rep_legal);
  const repCedula = esCompra ? c.deudor_cedula : (c.cedente_cedula ?? c.deudor_cedula);
  const repCorreo = c.deudor_correo ?? 'jesusrojas@cashea.app';
  const repTelefono = c.deudor_telefono ?? '+58 424-1885202';
  // Numeración: ODC = -2, ODV = -1 (convención observada en los PDFs reales)
  const numeroOrden = esCompra ? `${c.simbolo_cfb}-2` : `${c.simbolo_cfb}-1`;
  // Fecha de solicitud típicamente es 1 día antes de la emisión, vencimiento 1 día después
  const fechaSolicitud = fmtFechaDDMMYYYY(c.fecha_documento);
  // Fecha de vencimiento de la orden (no la del CFB) — típicamente 2 días después de la solicitud
  const fechaVtoOrden = fmtFechaDDMMYYYY(addDaysISO(c.fecha_documento, 2));
  return `<!doctype html>
<html lang="es-VE"><head><meta charset="utf-8"/>
<title>${esCompra ? 'ODC' : 'ODV'} ${c.simbolo_cfb} — ${clienteNombre}</title>
${baseStyles()}
</head><body>
${actionsBar()}
<div class="page">
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
  <table class="form">
    <tr><td colspan="3" class="form-titulo-claro">SOLICITUD DE ÓRDENES DE COMPRA Y/O VENTA DE TÍTULOS VALORES - RENTA FIJA</td></tr>
    <tr><td colspan="3" class="form-titulo-claro">DECLARACIÓN DEL CLIENTE</td></tr>
    <tr><td colspan="3" style="font-size: 7.5pt; text-align: justify; line-height: 1.3;">
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
  <table class="form">
    <tr><td colspan="4" class="form-titulo-claro">Titular / Representante Legal</td><td class="form-titulo-claro">Huella Dactilar</td></tr>
    <tr>
      <td colspan="2" style="height: 50px;">
        <span class="label-mini">Nombre(s) y Apellido(s)</span><br/>
        ${repNombre}
      </td>
      <td colspan="1">
        <span class="label-mini">Cédula de identidad</span><br/>
        ${repCedula}
      </td>
      <td colspan="1">
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