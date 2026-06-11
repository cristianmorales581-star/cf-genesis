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

function buildTemplateContext(e: any, contraparte?: string): TemplateContext {
  const ced = e.cedentes ?? e.programas?.cedentes ?? {};
  const prog = e.programas ?? {};
  const fin = e.financistas ?? {};
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
    cedente_razon_social: ced.razon_social ?? '—',
    cedente_rif: ced.rif ?? '—',
    cedente_rep_legal: ced.representante_legal ?? '—',
    cedente_cargo: ced.cargo_representante ?? ced.cargo ?? '—',
    cedente_cedula: ced.cedula_representante ?? ced.cedula ?? '—',
    programa_pcfb: prog.codigo_pcfb ?? '—',
    programa_plazo_ejecucion: Number(prog.plazo_ejecucion_dias ?? 180),
    programa_contrato_cesion: prog.contrato_cesion ?? prog.codigo_pcfb ?? null,
    deudor_razon_social: prog.deudor_cedido_razon_social ?? '—',
    deudor_rif: prog.deudor_cedido_rif ?? '—',
    deudor_rep_legal: prog.deudor_cedido_rep_legal ?? '—',
    deudor_cargo: prog.deudor_cedido_cargo ?? '—',
    deudor_cedula: prog.deudor_cedido_cedula ?? '—',
    deudor_correo: prog.deudor_cedido_correo ?? null,
    deudor_telefono: prog.deudor_cedido_telefono ?? null,
    financista_razon_social: contraparte || fin.razon_social || 'Grupo Cashea Ve, C.A.',
    financista_rif: fin.rif ?? 'J-501934070',
    financista_rep_legal: fin.representante_legal ?? null,
    financista_cedula: fin.cedula ?? null,
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
