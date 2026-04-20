// SICEBOP — Tasa BCV USD/Bs
// Source: pydolarvenezuela API (free, public). Fallback: dolarapi.com
import { corsHeaders } from '@supabase/supabase-js/cors'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Primary: pydolarve.org BCV monitor
    const r1 = await fetch('https://pydolarve.org/api/v1/dollar?page=bcv&monitor=usd', {
      headers: { 'Accept': 'application/json' },
    });
    if (r1.ok) {
      const j = await r1.json();
      const price = Number(j?.price);
      if (price && price > 0) {
        return json({ tasa: price, fuente: 'BCV (pydolarve)', fecha: j?.last_update ?? new Date().toISOString() });
      }
    }
  } catch (_) { /* fallthrough */ }

  try {
    const r2 = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
    if (r2.ok) {
      const j = await r2.json();
      const price = Number(j?.promedio);
      if (price && price > 0) {
        return json({ tasa: price, fuente: 'BCV (dolarapi)', fecha: j?.fechaActualizacion ?? new Date().toISOString() });
      }
    }
  } catch (_) { /* fallthrough */ }

  return json({ error: 'No se pudo obtener la tasa BCV' }, 502);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
