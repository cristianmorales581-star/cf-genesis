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
