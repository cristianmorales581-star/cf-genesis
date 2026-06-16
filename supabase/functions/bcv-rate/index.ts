// SICEBOP — Tasa BCV USD/Bs
// Source: pydolarvenezuela API (free, public). Fallback: dolarapi.com
// Soporta tasa actual y tasa histórica por fecha (?date=YYYY-MM-DD).
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const dateParam = url.searchParams.get('date'); // ISO YYYY-MM-DD

  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    const today = new Date().toISOString().slice(0, 10);
    if (dateParam < today) {
      const hist = await fetchHistorical(dateParam);
      if (hist) return json(hist);
      // si no se pudo histórico, cae al actual con un flag
    }
  }

  // Tasa actual
  try {
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

/** Devuelve la tasa BCV para una fecha pasada (ISO YYYY-MM-DD) o null si no se encuentra. */
async function fetchHistorical(iso: string): Promise<{ tasa: number; fuente: string; fecha: string } | null> {
  // pydolarve.org history → DD-MM-YYYY. Buscamos un rango pequeño alrededor por si ese día no hubo publicación.
  const [y, m, d] = iso.split('-');
  const target = `${d}-${m}-${y}`;
  const startD = new Date(`${iso}T00:00:00Z`);
  startD.setUTCDate(startD.getUTCDate() - 5);
  const start = `${pad(startD.getUTCDate())}-${pad(startD.getUTCMonth() + 1)}-${startD.getUTCFullYear()}`;

  // Endpoint v2 history
  for (const base of ['https://pydolarve.org/api/v2/dollar/history', 'https://pydolarve.org/api/v1/dollar/history']) {
    try {
      const u = `${base}?page=bcv&monitor=usd&start_date=${start}&end_date=${target}&format_date=default&rounded_price=false`;
      const r = await fetch(u, { headers: { 'Accept': 'application/json' } });
      if (!r.ok) continue;
      const j = await r.json();
      const series: any[] = Array.isArray(j?.history) ? j.history : Array.isArray(j) ? j : Array.isArray(j?.usd) ? j.usd : [];
      if (!series.length) continue;
      // Buscar el más cercano <= fecha
      const norm = series
        .map(it => ({
          price: Number(it?.price ?? it?.promedio ?? it?.value),
          // last_update viene como ISO o "DD-MM-YYYY HH:MM"
          dateIso: parseToIso(it?.last_update ?? it?.date ?? it?.fecha ?? it?.dateTime ?? ''),
        }))
        .filter(it => it.price > 0 && it.dateIso)
        .sort((a, b) => a.dateIso!.localeCompare(b.dateIso!));
      const onOrBefore = norm.filter(it => it.dateIso! <= iso);
      const pick = onOrBefore.length ? onOrBefore[onOrBefore.length - 1] : norm[0];
      if (pick) {
        return { tasa: pick.price, fuente: `BCV histórico (pydolarve) ${pick.dateIso}`, fecha: pick.dateIso! };
      }
    } catch (_) { /* siguiente fuente */ }
  }
  return null;
}

function pad(n: number) { return String(n).padStart(2, '0'); }
function parseToIso(s: string): string | null {
  if (!s) return null;
  // ISO ya: 2024-05-01T... o 2024-05-01
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  // DD-MM-YYYY o DD/MM/YYYY
  const m = /^(\d{2})[-\/](\d{2})[-\/](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
