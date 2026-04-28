// SICEBOP — Generación masiva de CFBs
// Recibe filas mapeadas (cedente_id + programa_id por fila), inserta emisiones,
// y devuelve los HTMLs imprimibles + datos del vector consolidado.
// El frontend arma el ZIP final (JSZip) y descarga el .xlsx (xlsx lib).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BatchRow {
  simbolo_cfb: string;
  cedente_id: string;
  programa_id: string;
  financista_id?: string | null;
  cantidad_ordenes: number;
  monto_total_usd: number;          // Valor nominal USD
  vencimiento_primera_orden: string; // ISO
  plazo_dias: number;
  descuento_decimal: number;         // En decimal (0.0149 = 1.49%)
  linea: string;
  inversionista_label?: string;      // Para vector
  inversionista_rif?: string;
}

interface Body {
  fecha_emision: string;            // ISO
  tasa_bcv: number;
  rows: BatchRow[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'No autenticado' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'No autenticado' }, 401);

  let body: Body;
  try { body = await req.json(); } catch { return json({ error: 'Body inválido' }, 400); }
  if (!body?.rows?.length || !body?.fecha_emision || !body?.tasa_bcv) {
    return json({ error: 'Faltan parámetros' }, 400);
  }

  // Cargar cedentes y programas referenciados (para PDFs y vector)
  const cedIds = [...new Set(body.rows.map(r => r.cedente_id))];
  const progIds = [...new Set(body.rows.map(r => r.programa_id))];
  const [cedRes, progRes] = await Promise.all([
    supabase.from('cedentes').select('*').in('id', cedIds),
    supabase.from('programas').select('*').in('id', progIds),
  ]);
  if (cedRes.error || progRes.error) {
    return json({ error: 'Error cargando maestros' }, 500);
  }
  const cedById = new Map(cedRes.data!.map(c => [c.id, c]));
  const progById = new Map(progRes.data!.map(p => [p.id, p]));

  const created: any[] = [];
  const docs: { filename: string; html: string }[] = [];
  const vector: any[] = [];

  for (const r of body.rows) {
    const ced = cedById.get(r.cedente_id);
    const prog = progById.get(r.programa_id);
    if (!ced || !prog) continue;

    // Cálculos zero-coupon
    const precio = round5(1 - r.descuento_decimal);
    const dias = r.plazo_dias;
    const rendimiento = ((1 - precio) / precio) * (360 / dias);
    const vnUsd = round2(r.monto_total_usd);
    const montoUsd = round2(vnUsd * precio);
    const valorBs = round2(montoUsd * body.tasa_bcv);

    // Bug 2: fecha de vencimiento real del CFB = fecha_emision + plazo_dias
    const fechaVencimientoCFB = addDaysISO(body.fecha_emision, r.plazo_dias);
    if (r.vencimiento_primera_orden && fechaVencimientoCFB > r.vencimiento_primera_orden) {
      console.warn(`⚠️ Emisión ${prog.codigo_pcfb}: CFB vence ${fechaVencimientoCFB} pero primera orden vence ${r.vencimiento_primera_orden}`);
    }

    const simbolo = String(r.simbolo_cfb ?? '').trim();
    if (!simbolo) {
      console.error('Fila omitida: símbolo CFB faltante', { programa_id: r.programa_id, cedente_id: r.cedente_id });
      continue;
    }

    const { data: emision, error: insErr } = await supabase
      .from('emisiones')
      .insert({
        simbolo_cfb: simbolo,
        programa_id: r.programa_id,
        financista_id: r.financista_id ?? null,
        operador_id: user.id,
        fecha_emision: body.fecha_emision,
        fecha_vencimiento: fechaVencimientoCFB,
        dias_colocados: r.plazo_dias,
        valor_nominal_usd: vnUsd,
        precio,
        descuento: r.descuento_decimal,
        rendimiento_anualizado: rendimiento,
        monto_efectivo_usd: montoUsd,
        valor_efectivo_bs: valorBs,
        tasa_cambio_bs_usd: body.tasa_bcv,
        cantidad_ordenes_compra: r.cantidad_ordenes,
        estado: 'activa',
      })
      .select()
      .single();

    if (insErr || !emision) {
      console.error('Insert error:', insErr);
      continue;
    }
    created.push(emision);

    // Auditoría
    await supabase.from('audit_log').insert({
      user_id: user.id,
      user_email: user.email,
      action: 'batch_issue',
      resource_type: 'emision',
      resource_id: emision.id,
      details: { simbolo, programa: prog.codigo_pcfb, vn_usd: vnUsd },
    });

    // HTML del CFB
    docs.push({
      filename: `CFB_${simbolo}.html`,
      html: renderCFB(emision, ced, prog),
    });
    docs.push({
      filename: `HOJA_TERMINOS_${simbolo}.html`,
      html: renderHoja(emision, ced, prog),
    });
    docs.push({ filename: `CDC_${simbolo}.html`, html: renderConfirmacion(emision, ced, 'CDC', r.inversionista_label ?? 'GRUPO CASHEA VE, C.A.') });
    docs.push({ filename: `CDV_${simbolo}.html`, html: renderConfirmacion(emision, ced, 'CDV', r.inversionista_label ?? 'GRUPO CASHEA VE, C.A.') });
    docs.push({ filename: `CARTA_BVC_${simbolo}.html`, html: renderCartaBVC(emision, ced, prog) });
    docs.push({ filename: `CARTA_SUNAVAL_${simbolo}.html`, html: renderCartaSunaval(emision, ced, prog, r.inversionista_label ?? 'GRUPO CASHEA VE, C.A.') });

    // Fila vector
    vector.push({
      simbolo_cfb: simbolo,
      cedente: ced.razon_social,
      rif_cedente: ced.rif,
      deudor_cedido: 'GRUPO CASHEA VE, C.A.',
      rif_deudor: 'J-501934070',
      cantidad_certificados: 1,
      fecha_emision: body.fecha_emision,
      fecha_vencimiento: fechaVencimientoCFB,
      dias_colocados: r.plazo_dias,
      rendimiento,
      volumen_ordenes: r.cantidad_ordenes,
      valor_nominal_bs: round2(vnUsd * body.tasa_bcv),
      precio_emision: precio,
      tipo_sociedad: 'COMERCIAL',
      moneda: 'VES',
      valor_nominal_usd: vnUsd,
      monto_sibe_usd: Math.round(montoUsd),
      tasa_cambio: body.tasa_bcv,
      inversionista: r.inversionista_label ?? 'Grupo Cashea Ve, C.A.',
    });
  }

  return json({
    success: true,
    count: created.length,
    documents: docs,
    vector,
    metadata: {
      fecha_emision: body.fecha_emision,
      tasa_bcv: body.tasa_bcv,
      total_usd: vector.reduce((s, v) => s + v.monto_sibe_usd, 0),
    },
  });
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round5 = (n: number) => Math.round(n * 100000) / 100000;

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmtCaracas(d: string) {
  const date = new Date(d + 'T12:00:00');
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${date.getDate()} de ${meses[date.getMonth()]}. de ${date.getFullYear()}`;
}
function fmtShort(d: string) {
  const date = new Date(d + 'T12:00:00');
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}
function fmtUSD(n: number) { return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2}).format(n); }
function fmtBs(n: number) { return new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n); }
function fmtPct(n: number, d = 2) { return (n * 100).toFixed(d) + '%'; }

function baseStyles() {
  return `<style>
  @page { size: A4; margin: 16mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; font-size: 11pt; line-height: 1.35; }
  .logo { font-weight: 700; color: #123c69; font-size: 13pt; margin-bottom: 16px; }
  .symbol { font-size: 18pt; font-weight: 700; margin-bottom: 12px; }
  h1 { font-size: 14pt; margin: 6px 0 8px; font-weight: 700; }
  h2 { font-size: 11pt; margin: 18px 0 8px; font-weight: 700; }
  table.kv { width: 100%; border-collapse: collapse; margin: 8px 0 14px; }
  table.kv td { padding: 4px 6px; border: 1px solid #cfcfcf; font-size: 10pt; vertical-align: top; }
  table.kv td.k { width: 42%; font-weight: 700; }
  table.kv td.v { font-weight: 400; }
  p.legal { text-align: justify; margin: 10px 0; }
  .sign { margin-top: 28px; }
  .muted { color: #333; font-size: 9pt; font-style: italic; }
  .actions { text-align: center; margin: 24px 0; }
  .actions button { padding: 10px 24px; background: #123c69; color: #fff; border: 0; cursor: pointer; font-size: 10pt; }
  @media print { .actions { display: none; } }
  </style>`;
}

function renderCFB(e: any, ced: any, prog: any) {
  const today = new Date().toISOString().slice(0, 10);
  return `<!doctype html><html lang="es-VE"><head><meta charset="utf-8"/><title>CFB ${e.simbolo_cfb}</title>${baseStyles()}</head><body>
  <div class="actions"><button onclick="window.print()">Imprimir / Guardar como PDF</button></div>
  ${header(e.simbolo_cfb, today, prog)}
  <h2 class="titulo">CERTIFICADO DE FINANCIAMIENTO BURSÁTIL</h2>
  <p class="legal">Por el presente <strong>Certificado de Financiamiento Bursátil (CFB)</strong>, identificado con el símbolo <strong>${e.simbolo_cfb}</strong>, emitido bajo el programa <strong>${prog.codigo_pcfb}</strong>, se hace constar que <strong>${ced.razon_social}</strong>, RIF <strong>${ced.rif}</strong>, en su condición de Cedente, ha cedido derechos de cobro por un valor nominal de <strong>${fmtUSD(Number(e.valor_nominal_usd))}</strong> (${fmtBs(Number(e.valor_efectivo_bs))} a la tasa BCV de ${Number(e.tasa_cambio_bs_usd).toFixed(4)} Bs/USD).</p>
  <table class="kv">
    <tr><td class="k">Símbolo CFB</td><td class="v">${e.simbolo_cfb}</td></tr>
    <tr><td class="k">Cedente</td><td class="v">${ced.razon_social}</td></tr>
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
  <p class="legal">El presente certificado es un instrumento de financiamiento bursátil cero-cupón, regulado por la Superintendencia Nacional de Valores (SUNAVAL) y negociado a través de la Bolsa de Valores de Caracas. Su redención al vencimiento se hará por el valor nominal aquí establecido, conforme a las normas vigentes.</p>
  ${footer(e.simbolo_cfb, today, ced)}
  </body></html>`;
}

function renderHoja(e: any, ced: any, prog: any) {
  const today = new Date().toISOString().slice(0, 10);
  return `<!doctype html><html lang="es-VE"><head><meta charset="utf-8"/><title>Hoja Términos ${e.simbolo_cfb}</title>${baseStyles()}</head><body>
  <div class="actions"><button onclick="window.print()">Imprimir / Guardar como PDF</button></div>
  ${header(e.simbolo_cfb, today, prog)}
  <h2 class="titulo">HOJA DE TÉRMINOS Y CONDICIONES</h2>
  <table class="kv">
    <tr><td class="k">Emisor / Cedente</td><td class="v">${ced.razon_social} (RIF ${ced.rif})</td></tr>
    <tr><td class="k">Programa</td><td class="v">${prog.codigo_pcfb}</td></tr>
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
  <p class="legal">Esta Hoja de Términos resume las condiciones financieras de la emisión identificada con el símbolo <strong>${e.simbolo_cfb}</strong>. La presente operación se rige por el Contrato Marco de Cesión ${prog.contrato_cesion ? '<strong>N° ' + prog.contrato_cesion + '</strong>' : ''} suscrito entre el Cedente y Grupo Bursátil Venezolano, así como por las normas dictadas por SUNAVAL.</p>
  ${footer(e.simbolo_cfb, today, ced)}
  </body></html>`;
}
