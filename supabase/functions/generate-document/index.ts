// SICEBOP — Generar PDF de documento (CFB, Hoja de Términos, CDC, CDV)
// Renderiza HTML server-side y devuelve un PDF generado vía API gratuita.
// Estrategia: HTML legal en español con estilos inline, convertido a PDF
// mediante el servicio html-pdf-node. Para mantener la edge function ligera,
// devolvemos el HTML imprimible y dejamos que el cliente use window.print() o
// que un servicio externo lo convierta. Aquí usamos `https://api.html-css-to-image.com`
// no aplica (requiere key); por lo tanto devolvemos HTML estructurado que el
// cliente puede descargar como PDF usando jsPDF/html2canvas o imprimir.
//
// Implementación: la edge function compone el HTML final (fechas formateadas,
// montos, texto legal) y el cliente se encarga del render a PDF mediante
// `window.print()` con CSS @page.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  type TemplateContext,
  renderCFB as renderTemplateCFB,
  renderCartaSunaval as renderTemplateCartaSunaval,
  renderCartaBVC as renderTemplateCartaBVC,
  renderHojaTerminos as renderTemplateHojaTerminos,
  renderCDC as renderTemplateCDC,
  renderCDV as renderTemplateCDV,
  renderODC as renderTemplateODC,
  renderODV as renderTemplateODV,
} from '../_shared/templates.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Body {
  emision_id: string;
  tipo: 'CFB' | 'HOJA_TERMINOS' | 'CDC' | 'CDV' | 'CARTA_SUNAVAL' | 'CARTA_BVC' | 'ODC' | 'ODV';
  contraparte?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'No autenticado' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')! ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!,
    { global: { headers: { Authorization: auth } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'No autenticado' }, 401);

  let body: Body;
  try { body = await req.json(); } catch { return json({ error: 'Body inválido' }, 400); }
  if (!body?.emision_id || !body?.tipo) return json({ error: 'Faltan parámetros' }, 400);

  // Cargar emisión + relaciones
  const { data: e, error: eErr } = await supabase
    .from('emisiones')
    .select(`*,
      programas(*, cedentes(*)),
      cedentes(*),
      financistas(*)
    `)
    .eq('id', body.emision_id)
    .single();

  if (eErr || !e) return json({ error: eErr?.message ?? 'Emisión no encontrada' }, 404);

  const ctx = buildTemplateContext(e, body.contraparte);
  const renderers: Record<Body['tipo'], (c: TemplateContext) => string> = {
    CFB: renderTemplateCFB,
    HOJA_TERMINOS: renderTemplateHojaTerminos,
    CDC: renderTemplateCDC,
    CDV: renderTemplateCDV,
    CARTA_SUNAVAL: renderTemplateCartaSunaval,
    CARTA_BVC: renderTemplateCartaBVC,
    ODC: renderTemplateODC,
    ODV: renderTemplateODV,
  };
  const html = renderers[body.tipo](ctx);
  return new Response(html, {
    headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  });
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// ---------- Plantillas ----------
function fmtCaracas(d: string) {
  const date = new Date(d + 'T12:00:00');
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${date.getDate()} de ${meses[date.getMonth()]}. de ${date.getFullYear()}`;
}
function fmtUSD(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
}
function fmtBs(n: number) {
  return new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' Bs.';
}
function fmtPct(n: number, d = 4) { return (n * 100).toFixed(d) + ' %'; }

function buildTemplateContext(e: any, contraparte?: string): TemplateContext {
  const ced = e.cedentes ?? e.programas?.cedentes ?? {};
  const prog = e.programas ?? {};
  const fin = e.financistas ?? {};
  return {
    simbolo_cfb: e.simbolo_cfb,
    fecha_emision: e.fecha_emision,
    fecha_vencimiento: e.fecha_vencimiento,
    fecha_documento: e.fecha_emision,
    valor_nominal_usd: Number(e.valor_nominal_usd),
    cantidad_ordenes_compra: Number(e.cantidad_ordenes_compra),
    precio: Number(e.precio),
    descuento: Number(e.descuento),
    rendimiento_anualizado: Number(e.rendimiento_anualizado),
    dias_colocados: Number(e.dias_colocados),
    monto_efectivo_usd: Number(e.monto_efectivo_usd),
    valor_efectivo_bs: Number(e.valor_efectivo_bs),
    tasa_cambio_bs_usd: Number(e.tasa_cambio_bs_usd),
    cedente_razon_social: ced.razon_social ?? '—',
    cedente_rif: ced.rif ?? '—',
    cedente_rep_legal: ced.representante_legal ?? 'Jesus Augusto Rojas Hernandez',
    cedente_cargo: ced.cargo_representante ?? ced.cargo ?? 'Mandatario',
    cedente_cedula: ced.cedula_representante ?? ced.cedula ?? 'V-26.741.091',
    programa_pcfb: prog.codigo_pcfb ?? '—',
    programa_plazo_ejecucion: Number(prog.plazo_ejecucion_dias ?? 180),
    programa_contrato_cesion: prog.contrato_cesion ?? prog.codigo_pcfb ?? null,
    deudor_razon_social: prog.deudor_cedido_razon_social ?? 'Grupo Cashea Ve, C.A.',
    deudor_rif: prog.deudor_cedido_rif ?? 'J-501934070',
    deudor_rep_legal: prog.deudor_cedido_rep_legal ?? 'Jesus Augusto Rojas Hernandez',
    deudor_cargo: prog.deudor_cedido_cargo ?? 'Apoderado',
    deudor_cedula: prog.deudor_cedido_cedula ?? 'V-26.741.091',
    deudor_correo: prog.deudor_cedido_correo ?? null,
    deudor_telefono: prog.deudor_cedido_telefono ?? null,
    financista_razon_social: contraparte || fin.razon_social || 'Grupo Cashea Ve, C.A.',
    financista_rif: fin.rif ?? 'J-501934070',
    financista_es_persona_natural: false,
    gbv_razon_social: 'Grupo Bursatil Venezolano Casa de Bolsa, C.A.',
    gbv_rif: 'J-502409831',
    gbv_miembro_bvc: '3',
    gbv_presidente: 'Luis Alfredo Cercós Ruiz',
    operador_nombre: 'Cristian Alexander Morales Di Stefano',
    operador_cedula: 'V-26.818.100',
    operador_telefono: '+584141510211',
    bvc_atencion: 'Enrique Rosal / Néstor Fernández',
    bvc_gerencia: 'Gerencia de Mercados.',
    bvc_direccion_l1: 'Av. Sorocaima entre Av. Venezuela Av. Tamanaco,',
    bvc_direccion_l2: 'Edif. Atrium, PB, Urb, El Rosal - Municipio Chacao,',
    bvc_direccion_l3: 'Estado Miranda, Caracas, Venezuela.',
    asesores_cashea: 'Latin Assets Group, C.A. - LAGroup',
    circular_sunaval: 'DSNV/GCI/Nº 000014',
    circular_sunaval_fecha: '16 de agosto de 2023',
    circular_bvc_fecha: '01 de septiembre de 2023',
    texto_activo_subyacente: 'Ordenes de compra vigentes contenidas en el "Reporte de cuentas por cobrar" anexo al contrato suscrito.',
  };
}

// deno-lint-ignore no-explicit-any
function renderTemplate(tipo: string, e: any, contraparte?: string) {
  const cedente = e.programas?.cedentes;
  const programa = e.programas;
  const today = new Date().toISOString().slice(0, 10);
  const titulo = ({
    CFB: 'CERTIFICADO DE FINANCIAMIENTO BURSÁTIL',
    HOJA_TERMINOS: 'HOJA DE TÉRMINOS Y CONDICIONES',
    CDC: 'CONFIRMACIÓN DE COMPRA',
    CDV: 'CONFIRMACIÓN DE VENTA',
  } as Record<string,string>)[tipo] ?? tipo;

  return `<!doctype html>
<html lang="es-VE"><head>
<meta charset="utf-8"/>
<title>${titulo} — ${e.simbolo_cfb}</title>
<style>
  @page { size: A4; margin: 18mm 16mm 22mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Source Serif 4', Georgia, serif; color: #15151a; margin: 0; font-size: 11pt; line-height: 1.55; }
  .hdr { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0c2a52; padding-bottom: 12px; margin-bottom: 18px; }
  .brand { font-family: 'Montserrat', sans-serif; }
  .brand h1 { margin: 0; font-size: 16pt; color: #0c2a52; letter-spacing: 1px; }
  .brand p { margin: 2px 0 0; font-size: 8pt; color: #555; text-transform: uppercase; letter-spacing: 2px; }
  .meta { text-align: right; font-family: 'Montserrat', sans-serif; font-size: 8pt; color: #555; text-transform: uppercase; letter-spacing: 1.5px; }
  .meta strong { display: block; color: #0c2a52; font-size: 10pt; letter-spacing: 1px; margin-bottom: 4px; }
  h2.titulo { font-family: 'Montserrat', sans-serif; text-align: center; font-size: 13pt; color: #0c2a52; letter-spacing: 2px; margin: 18px 0 4px; }
  .sub { text-align: center; font-size: 9pt; color: #555; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 18px; }
  table.kv { width: 100%; border-collapse: collapse; margin: 10px 0 16px; }
  table.kv td { padding: 6px 8px; border-bottom: 1px solid #ddd; font-size: 10pt; vertical-align: top; }
  table.kv td.k { width: 38%; font-family: 'Montserrat', sans-serif; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 1px; color: #555; }
  table.kv td.v { font-family: 'JetBrains Mono', monospace; font-weight: 500; color: #0c2a52; }
  p.legal { text-align: justify; margin: 10px 0; }
  .firma { margin-top: 50px; display: flex; justify-content: space-between; gap: 40px; }
  .firma .box { flex: 1; border-top: 1px solid #333; padding-top: 6px; text-align: center; font-size: 9pt; }
  .ftr { position: fixed; bottom: 8mm; left: 16mm; right: 16mm; border-top: 1px solid #ccc; padding-top: 6px; font-family: 'Montserrat', sans-serif; font-size: 7.5pt; color: #777; display: flex; justify-content: space-between; text-transform: uppercase; letter-spacing: 1px; }
  .actions { text-align: center; margin: 24px 0; }
  .actions button { font-family: 'Montserrat', sans-serif; padding: 10px 24px; background: #0c2a52; color: #fff; border: 0; cursor: pointer; letter-spacing: 1px; font-size: 10pt; }
  @media print { .actions { display: none; } }
</style>
</head>
<body>
  <div class="actions"><button onclick="window.print()">Imprimir / Guardar como PDF</button></div>

  <div class="hdr">
    <div class="brand">
      <h1>GRUPO BURSÁTIL VENEZOLANO</h1>
      <p>Casa de Bolsa · SUNAVAL · Bolsa de Valores de Caracas</p>
    </div>
    <div class="meta">
      <strong>${e.simbolo_cfb}</strong>
      Caracas, ${fmtCaracas(today)}
    </div>
  </div>

  <h2 class="titulo">${titulo}</h2>
  <p class="sub">Programa ${programa.codigo_pcfb} · Línea ${programa.linea ?? '—'}</p>

  ${tipo === 'CFB' ? cfbBody(e, cedente) : ''}
  ${tipo === 'HOJA_TERMINOS' ? hojaBody(e, cedente, programa) : ''}
  ${tipo === 'CDC' || tipo === 'CDV' ? confirmBody(e, cedente, tipo, contraparte ?? '') : ''}

  <div class="firma">
    <div class="box">Por el Cedente<br/><small>${cedente?.representante_legal ?? '—'}<br/>${cedente?.cargo ?? ''}</small></div>
    <div class="box">Por Grupo Bursátil Venezolano<br/><small>Operador autorizado</small></div>
  </div>

  <div class="ftr">
    <span>SICEBOP · ${e.simbolo_cfb}</span>
    <span>Documento generado el ${fmtCaracas(today)}</span>
  </div>
</body></html>`;
}

// deno-lint-ignore no-explicit-any
function cfbBody(e: any, cedente: any) {
  return `
  <p class="legal">
    Por el presente <strong>Certificado de Financiamiento Bursátil (CFB)</strong>, identificado con el símbolo
    <strong>${e.simbolo_cfb}</strong>, emitido bajo el programa <strong>${e.programas.codigo_pcfb}</strong>, se hace constar
    que <strong>${cedente?.razon_social ?? '—'}</strong>, RIF <strong>${cedente?.rif ?? '—'}</strong>, en su condición de
    Cedente, ha cedido derechos de cobro por un valor nominal de <strong>${fmtUSD(Number(e.valor_nominal_usd))}</strong>
    (${fmtBs(Number(e.valor_efectivo_bs))} a la tasa BCV de ${Number(e.tasa_cambio_bs_usd).toFixed(4)} Bs/USD).
  </p>
  <table class="kv">
    <tr><td class="k">Símbolo CFB</td><td class="v">${e.simbolo_cfb}</td></tr>
    <tr><td class="k">Cedente</td><td class="v">${cedente?.razon_social ?? '—'}</td></tr>
    <tr><td class="k">Valor Nominal (USD)</td><td class="v">${fmtUSD(Number(e.valor_nominal_usd))}</td></tr>
    <tr><td class="k">Precio</td><td class="v">${Number(e.precio).toFixed(5)}</td></tr>
    <tr><td class="k">Descuento aplicado</td><td class="v">${fmtPct(Number(e.descuento), 4)}</td></tr>
    <tr><td class="k">Monto Efectivo (USD)</td><td class="v">${fmtUSD(Number(e.monto_efectivo_usd))}</td></tr>
    <tr><td class="k">Tasa BCV (Bs/USD)</td><td class="v">${Number(e.tasa_cambio_bs_usd).toFixed(4)}</td></tr>
    <tr><td class="k">Valor Efectivo (Bs)</td><td class="v">${fmtBs(Number(e.valor_efectivo_bs))}</td></tr>
    <tr><td class="k">Fecha de Emisión</td><td class="v">${fmtCaracas(e.fecha_emision)}</td></tr>
    <tr><td class="k">Fecha de Vencimiento</td><td class="v">${fmtCaracas(e.fecha_vencimiento)}</td></tr>
    <tr><td class="k">Días colocados</td><td class="v">${e.dias_colocados}</td></tr>
    <tr><td class="k">Rendimiento Anualizado</td><td class="v">${fmtPct(Number(e.rendimiento_anualizado), 4)}</td></tr>
  </table>
  <p class="legal">
    El presente certificado es un instrumento de financiamiento bursátil cero-cupón, regulado por la Superintendencia
    Nacional de Valores (SUNAVAL) y negociado a través de la Bolsa de Valores de Caracas. Su redención al vencimiento
    se hará por el valor nominal aquí establecido, conforme a las normas vigentes.
  </p>`;
}

// deno-lint-ignore no-explicit-any
function hojaBody(e: any, cedente: any, p: any) {
  return `
  <table class="kv">
    <tr><td class="k">Emisor / Cedente</td><td class="v">${cedente?.razon_social ?? '—'} (RIF ${cedente?.rif ?? '—'})</td></tr>
    <tr><td class="k">Programa</td><td class="v">${p.codigo_pcfb}</td></tr>
    <tr><td class="k">Símbolo del CFB</td><td class="v">${e.simbolo_cfb}</td></tr>
    <tr><td class="k">Tipo de instrumento</td><td class="v">Certificado de Financiamiento Bursátil (cero cupón)</td></tr>
    <tr><td class="k">Moneda de denominación</td><td class="v">USD (liquidación en Bs. al BCV)</td></tr>
    <tr><td class="k">Valor Nominal</td><td class="v">${fmtUSD(Number(e.valor_nominal_usd))}</td></tr>
    <tr><td class="k">Precio de colocación</td><td class="v">${Number(e.precio).toFixed(5)}</td></tr>
    <tr><td class="k">Descuento</td><td class="v">${fmtPct(Number(e.descuento), 4)}</td></tr>
    <tr><td class="k">Rendimiento anualizado</td><td class="v">${fmtPct(Number(e.rendimiento_anualizado), 4)}</td></tr>
    <tr><td class="k">Plazo</td><td class="v">${e.dias_colocados} días</td></tr>
    <tr><td class="k">Fecha de Emisión</td><td class="v">${fmtCaracas(e.fecha_emision)}</td></tr>
    <tr><td class="k">Fecha de Vencimiento</td><td class="v">${fmtCaracas(e.fecha_vencimiento)}</td></tr>
    <tr><td class="k">Tasa de cambio (BCV)</td><td class="v">${Number(e.tasa_cambio_bs_usd).toFixed(4)} Bs/USD</td></tr>
    <tr><td class="k">Monto Efectivo</td><td class="v">${fmtUSD(Number(e.monto_efectivo_usd))} (${fmtBs(Number(e.valor_efectivo_bs))})</td></tr>
    <tr><td class="k">Régimen regulatorio</td><td class="v">SUNAVAL · Bolsa de Valores de Caracas</td></tr>
  </table>
  <p class="legal">
    Esta Hoja de Términos resume las condiciones financieras de la emisión identificada con el símbolo
    <strong>${e.simbolo_cfb}</strong>. La presente operación se rige por el Contrato Marco de Cesión
    ${p.contrato_cesion ? '<strong>N° ' + p.contrato_cesion + '</strong>' : ''} suscrito entre el Cedente y Grupo Bursátil
    Venezolano, así como por las normas dictadas por SUNAVAL.
  </p>`;
}

// deno-lint-ignore no-explicit-any
function confirmBody(e: any, cedente: any, tipo: string, contraparte: string) {
  const accion = tipo === 'CDC' ? 'COMPRADO' : 'VENDIDO';
  return `
  <p class="legal">
    Por la presente confirmación, se hace constar que <strong>${contraparte || '________________'}</strong> ha
    <strong>${accion}</strong> a través de Grupo Bursátil Venezolano el siguiente Certificado de Financiamiento Bursátil
    emitido por <strong>${cedente?.razon_social ?? '—'}</strong>:
  </p>
  <table class="kv">
    <tr><td class="k">Contraparte</td><td class="v">${contraparte || '—'}</td></tr>
    <tr><td class="k">Símbolo</td><td class="v">${e.simbolo_cfb}</td></tr>
    <tr><td class="k">Valor Nominal</td><td class="v">${fmtUSD(Number(e.valor_nominal_usd))}</td></tr>
    <tr><td class="k">Precio</td><td class="v">${Number(e.precio).toFixed(5)}</td></tr>
    <tr><td class="k">Monto Efectivo (USD)</td><td class="v">${fmtUSD(Number(e.monto_efectivo_usd))}</td></tr>
    <tr><td class="k">Valor Efectivo (Bs)</td><td class="v">${fmtBs(Number(e.valor_efectivo_bs))}</td></tr>
    <tr><td class="k">Tasa BCV</td><td class="v">${Number(e.tasa_cambio_bs_usd).toFixed(4)} Bs/USD</td></tr>
    <tr><td class="k">Fecha de Operación</td><td class="v">${fmtCaracas(e.fecha_emision)}</td></tr>
    <tr><td class="k">Fecha Valor</td><td class="v">${fmtCaracas(e.fecha_emision)}</td></tr>
    <tr><td class="k">Fecha de Vencimiento</td><td class="v">${fmtCaracas(e.fecha_vencimiento)}</td></tr>
    <tr><td class="k">Rendimiento</td><td class="v">${fmtPct(Number(e.rendimiento_anualizado), 4)}</td></tr>
  </table>
  <p class="legal">
    La presente confirmación se emite a efectos contables y de liquidación bursátil, conforme a las normas
    vigentes de SUNAVAL y la Bolsa de Valores de Caracas.
  </p>`;
}
