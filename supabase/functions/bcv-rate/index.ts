// SICEBOP — Tasa BCV USD/Bs
// Fuente histórica: https://ve.dolarapi.com/v1/historicos/dolares/oficial (serie completa)
// Fuente actual:    https://ve.dolarapi.com/v1/dolares/oficial
// Soporta ?date=YYYY-MM-DD para obtener la tasa histórica de esa fecha
// (o la última publicación previa si ese día no hubo cotización).
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  let bodyDate: string | null = null;
  if (req.method !== 'GET') {
    try {
      const body = await req.clone().json();
      bodyDate = typeof body?.date === 'string' ? body.date : null;
    } catch (_) { /* body opcional */ }
  }
  const dateParam = url.searchParams.get('date') ?? bodyDate; // ISO YYYY-MM-DD
  const today = new Date().toISOString().slice(0, 10);

  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && dateParam < today) {
    const hist = await fetchHistorical(dateParam);
    if (hist) return json(hist);
    // si falla histórico, cae al actual
  }

  // Tasa actual
  try {
    const r = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
      headers: { 'Accept': 'application/json' },
    });
    if (r.ok) {
      const j = await r.json();
      const price = Number(j?.promedio);
      if (price && price > 0) {
        return json({
          tasa: price,
          fuente: 'BCV (dolarapi)',
          fecha: j?.fechaActualizacion ?? new Date().toISOString(),
        });
      }
    }
  } catch (_) { /* fallthrough */ }

  // Fallback: pydolarve
  try {
    const r = await fetch('https://pydolarve.org/api/v1/dollar?page=bcv&monitor=usd');
    if (r.ok) {
      const j = await r.json();
      const price = Number(j?.price);
      if (price && price > 0) {
        return json({ tasa: price, fuente: 'BCV (pydolarve)', fecha: j?.last_update ?? new Date().toISOString() });
      }
    }
  } catch (_) { /* noop */ }

  return json({ error: 'No se pudo obtener la tasa BCV' }, 502);
});

/**
 * Busca en la serie histórica de ve.dolarapi la cotización oficial cuya
 * `fecha` sea igual o la más cercana anterior al ISO solicitado.
 */
async function fetchHistorical(iso: string): Promise<{ tasa: number; fuente: string; fecha: string } | null> {
  try {
    const r = await fetch('https://ve.dolarapi.com/v1/historicos/dolares/oficial', {
      headers: { 'Accept': 'application/json' },
    });
    if (!r.ok) return null;
    const serie: Array<{ promedio: number; fecha: string }> = await r.json();
    if (!Array.isArray(serie) || !serie.length) return null;

    // Filtrar fechas válidas <= iso, quedarnos con la más reciente
    const onOrBefore = serie
      .filter(it => it && typeof it.fecha === 'string' && it.fecha <= iso && Number(it.promedio) > 0)
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    const pick = onOrBefore.length ? onOrBefore[onOrBefore.length - 1] : null;
    if (!pick) return null;

    return {
      tasa: Number(pick.promedio),
      fuente: `BCV histórico (dolarapi) ${pick.fecha}`,
      fecha: pick.fecha,
    };
  } catch (_) {
    return null;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
