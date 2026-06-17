// SICEBOP — Generación masiva de CFBs
// Recibe filas mapeadas (cedente_id + programa_id por fila), inserta emisiones,
// y devuelve los HTMLs imprimibles + datos del vector consolidado.
// El frontend arma el ZIP final (JSZip) y descarga el .xlsx (xlsx lib).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  type TemplateContext,
  renderCFB as renderTemplateCFB,
  renderCartaSunaval as renderTemplateCartaSunaval,
  renderCartaBVC as renderTemplateCartaBVC,
  renderHojaTerminos as renderTemplateHojaTerminos,
  renderODC as renderTemplateODC,
  renderODV as renderTemplateODV,
} from '../_shared/templates.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BatchRow {
  simbolo_cfb: string;
  cedente_id: string;
  programa_id?: string | null;
  financista_id?: string | null;
  fecha_emision?: string;
  cantidad_ordenes: number;
  monto_total_usd: number;          // Valor nominal USD
  vencimiento_primera_orden: string; // ISO
  plazo_dias: number;
  descuento_decimal: number;         // En decimal (0.0149 = 1.49%)
  linea: string;
  inversionista_label?: string;      // Para vector
  inversionista_rif?: string;
  inversionista_rep_legal?: string | null;
  inversionista_cedula?: string | null;
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
  const progIds = [...new Set(body.rows.map(r => r.programa_id).filter(Boolean))];
  const [cedRes, progRes] = await Promise.all([
    supabase.from('cedentes').select('*').in('id', cedIds),
    progIds.length ? supabase.from('programas').select('*').in('id', progIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (cedRes.error || progRes.error) {
    return json({ error: 'Error cargando maestros' }, 500);
  }
  const cedById = new Map(cedRes.data!.map(c => [c.id, c]));
  const progById = new Map(progRes.data!.map(p => [p.id, p]));

  const requestedSymbols = body.rows.map(r => String(r.simbolo_cfb ?? '').trim()).filter(Boolean);
  const duplicateSymbolsInFile = requestedSymbols.filter((s, i) => requestedSymbols.indexOf(s) !== i);
  if (duplicateSymbolsInFile.length) {
    return json({
      success: false,
      error: `Hay símbolos CFB repetidos en la carga: ${[...new Set(duplicateSymbolsInFile)].join(', ')}`,
    });
  }

  const existingSymbolsRes = await supabase
    .from('emisiones')
    .select('simbolo_cfb')
    .in('simbolo_cfb', requestedSymbols);
  if (existingSymbolsRes.error) {
    return json({ success: false, error: 'No se pudo validar si los símbolos CFB ya existen' });
  }
  const existingSymbols = [...new Set((existingSymbolsRes.data ?? []).map(e => e.simbolo_cfb))];
  if (existingSymbols.length) {
    return json({
      success: false,
      error: `Estos símbolos CFB ya fueron emitidos: ${existingSymbols.slice(0, 12).join(', ')}${existingSymbols.length > 12 ? '…' : ''}. Elimina esos certificados de prueba o cambia el símbolo antes de generar.`,
    });
  }

  const created: any[] = [];
  const docs: { filename: string; html: string }[] = [];
  const vector: any[] = [];
  const failedRows: string[] = [];

  // Resolver tasa BCV por fecha de emisión (histórica si la fecha es pasada)
  const uniqueDates = [...new Set(body.rows.map(r => r.fecha_emision || body.fecha_emision))];
  const tasaByDate = new Map<string, number>();
  const today = new Date().toISOString().slice(0, 10);
  await Promise.all(uniqueDates.map(async (d) => {
    if (d >= today) { tasaByDate.set(d, body.tasa_bcv); return; }
    try {
      const u = `${Deno.env.get('SUPABASE_URL')!}/functions/v1/bcv-rate?date=${d}`;
      const r = await fetch(u, { headers: { 'Authorization': auth!, 'apikey': Deno.env.get('SUPABASE_ANON_KEY')! } });
      const j = await r.json();
      const t = Number(j?.tasa);
      tasaByDate.set(d, t > 0 ? t : body.tasa_bcv);
    } catch {
      tasaByDate.set(d, body.tasa_bcv);
    }
  }));

  for (const r of body.rows) {
    const ced = cedById.get(r.cedente_id);
    const prog = r.programa_id ? progById.get(r.programa_id) : null;
    if (!ced) continue;
    const fechaEmisionFila = r.fecha_emision || body.fecha_emision;
    const tasaFila = tasaByDate.get(fechaEmisionFila) ?? body.tasa_bcv;

    // Cálculos zero-coupon
    const precio = round5(1 - r.descuento_decimal);
    const dias = r.plazo_dias;
    const rendimiento = round5(((1 - precio) / precio) * (360 / dias));
    const vnUsd = round2(r.monto_total_usd);
    const montoUsd = round2(vnUsd * precio);
    const valorBs = round2(montoUsd * tasaFila);

    let simbolo = String(r.simbolo_cfb ?? '').trim();

    // Si la fila no trae símbolo, lo autogeneramos con next_simbolo_cfb()
    if (!simbolo) {
      const { data: sym, error: symErr } = await supabase.rpc('next_simbolo_cfb');
      if (symErr || !sym) {
        console.error('No se pudo autogenerar símbolo CFB', symErr);
        failedRows.push(`${prog?.codigo_pcfb ?? r.cedente_id}: no se pudo autogenerar símbolo`);
        continue;
      }
      simbolo = String(sym).trim();
    }

    // Bug 2: fecha de vencimiento real del CFB = fecha_emision + plazo_dias
    const fechaVencimientoCFB = addDaysISO(fechaEmisionFila, r.plazo_dias);
    if (r.vencimiento_primera_orden && fechaVencimientoCFB > r.vencimiento_primera_orden) {
      console.warn(`⚠️ Emisión ${prog?.codigo_pcfb ?? simbolo}: CFB vence ${fechaVencimientoCFB} pero primera orden vence ${r.vencimiento_primera_orden}`);
    }

    const { data: emision, error: insErr } = await supabase
      .from('emisiones')
      .insert({
        simbolo_cfb: simbolo,
        programa_id: r.programa_id ?? null,
        cedente_id: r.cedente_id,
        financista_id: r.financista_id ?? null,
        operador_id: user.id,
        fecha_emision: fechaEmisionFila,
        fecha_vencimiento: fechaVencimientoCFB,
        dias_colocados: r.plazo_dias,
        valor_nominal_usd: vnUsd,
        precio,
        descuento: r.descuento_decimal,
        rendimiento_anualizado: rendimiento,
        monto_efectivo_usd: montoUsd,
        valor_efectivo_bs: valorBs,
        tasa_cambio_bs_usd: tasaFila,
        cantidad_ordenes_compra: r.cantidad_ordenes,
        estado: 'activa',
      })
      .select()
      .single();

    if (insErr || !emision) {
      console.error('Insert error:', insErr);
      failedRows.push(`${simbolo}: ${insErr?.message ?? 'error desconocido'}`);
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
      details: { simbolo, programa: prog?.codigo_pcfb ?? null, vn_usd: vnUsd },
    });

    const ctx = buildTemplateContext(emision, ced, prog, r.inversionista_label, r.inversionista_rif, r.inversionista_rep_legal, r.inversionista_cedula);
    const cedenteSlug = String(ced.razon_social ?? 'CEDENTE')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '')
      .toUpperCase() || 'CEDENTE';
    docs.push(
      { filename: `CFB_${simbolo}_${cedenteSlug}.pdf`, html: renderTemplateCFB(ctx) },
      { filename: `CARTA_SUNAVAL_${simbolo}_${cedenteSlug}.pdf`, html: renderTemplateCartaSunaval(ctx) },
      { filename: `CARTA_BVC_${simbolo}_${cedenteSlug}.pdf`, html: renderTemplateCartaBVC(ctx) },
      { filename: `HOJA_TERMINOS_${simbolo}_${cedenteSlug}.pdf`, html: renderTemplateHojaTerminos(ctx) },
      { filename: `ODC_${simbolo}_${cedenteSlug}.pdf`, html: renderTemplateODC(ctx) },
      { filename: `ODV_${simbolo}_${cedenteSlug}.pdf`, html: renderTemplateODV(ctx) },
    );

    // Fila vector
    vector.push({
      simbolo_cfb: simbolo,
      cedente: ced.razon_social,
      rif_cedente: ced.rif,
      deudor_cedido: 'GRUPO CASHEA VE, C.A.',
      rif_deudor: 'J-501934070',
      cantidad_certificados: 1,
      fecha_emision: fechaEmisionFila,
      fecha_vencimiento: fechaVencimientoCFB,
      dias_colocados: r.plazo_dias,
      rendimiento,
      volumen_ordenes: r.cantidad_ordenes,
      valor_nominal_bs: round2(vnUsd * tasaFila),
      precio_emision: precio,
      tipo_sociedad: 'COMERCIAL',
      moneda: 'VES',
      valor_nominal_usd: vnUsd,
      monto_sibe_usd: Math.round(vnUsd),
      tasa_cambio: tasaFila,
      inversionista: r.inversionista_label ?? 'GRUPO CASHEA VE, C.A.',
      rif_inversionista: r.inversionista_rif ?? 'J-501934070',
    });
  }

  if (!created.length) {
    return json({ success: false, error: failedRows[0] ?? 'No se pudo crear ninguna emisión' });
  }

  return json({
    success: true,
    count: created.length,
    documents: docs,
    vector,
    warnings: failedRows,
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

function buildTemplateContext(e: any, ced: any, prog: any, financistaLabel?: string, financistaRif?: string, financistaRepLegal?: string | null, financistaCedula?: string | null): TemplateContext {
  return {
    simbolo_cfb: e.simbolo_cfb,
    fecha_emision: e.fecha_emision,
    fecha_vencimiento: e.fecha_vencimiento,
    fecha_documento: new Date().toISOString().slice(0, 10),
    valor_nominal_usd: Number(e.valor_nominal_usd),
    cantidad_ordenes_compra: Number(e.cantidad_ordenes_compra),
    precio: Number(e.precio),
    descuento: Number(e.descuento),
    rendimiento_anualizado: Number(e.rendimiento_anualizado),
    dias_colocados: Number(e.dias_colocados),
    monto_efectivo_usd: Number(e.monto_efectivo_usd),
    valor_efectivo_bs: Number(e.valor_efectivo_bs),
    tasa_cambio_bs_usd: Number(e.tasa_cambio_bs_usd),
    cedente_razon_social: ced.razon_social,
    cedente_rif: ced.rif,
    cedente_rep_legal: ced.representante_legal ?? '—',
    cedente_cargo: ced.cargo_representante ?? ced.cargo ?? '—',
    cedente_cedula: ced.cedula_representante ?? ced.cedula ?? '—',
    programa_pcfb: prog?.codigo_pcfb ?? '—',
    programa_plazo_ejecucion: Number(prog?.plazo_ejecucion_dias ?? 180),
    programa_contrato_cesion: prog?.contrato_cesion ?? prog?.codigo_pcfb ?? null,
    deudor_razon_social: prog?.deudor_cedido_razon_social ?? '—',
    deudor_rif: prog?.deudor_cedido_rif ?? '—',
    deudor_rep_legal: prog?.deudor_cedido_rep_legal ?? '—',
    deudor_cargo: prog?.deudor_cedido_cargo ?? '—',
    deudor_cedula: prog?.deudor_cedido_cedula ?? '—',
    deudor_correo: prog?.deudor_cedido_correo ?? null,
    deudor_telefono: prog?.deudor_cedido_telefono ?? null,
    financista_razon_social: financistaLabel ?? 'Grupo Cashea Ve, C.A.',
    financista_rif: financistaRif ?? 'J-501934070',
    financista_rep_legal: financistaRepLegal ?? null,
    financista_cedula: financistaCedula ?? null,
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
