// Komiks – schránka: iPad sem nahraje export, noťas si ho do hodiny stáhne.
const TTL = 3600;                 // s, pak KV soubor samo smaže
const MAX = 25 * 1024 * 1024;     // limit hodnoty v KV
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

const enc = new TextEncoder();
async function sameSecret(a, b) {
  const [x, y] = await Promise.all([a, b].map(s => crypto.subtle.digest('SHA-256', enc.encode(s))));
  return crypto.subtle.timingSafeEqual(x, y);
}
function basicPassword(req) {
  const h = req.headers.get('Authorization') || '';
  if (!h.startsWith('Basic ')) return '';
  try { const s = atob(h.slice(6)); return s.slice(s.indexOf(':') + 1); } catch { return ''; }
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cleanName = s => (s || 'soubor').replace(/[\/\x00-\x1f"]+/g, '').slice(0, 120) || 'soubor';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (req.method === 'POST' && url.pathname === '/upload') {
      const auth = req.headers.get('Authorization') || '';
      if (!env.HESLO || !(await sameSecret(auth, 'Bearer ' + env.HESLO)))
        return Response.json({ error: 'Špatné heslo.' }, { status: 401, headers: CORS });
      const body = await req.arrayBuffer();
      if (!body.byteLength) return Response.json({ error: 'Prázdný soubor.' }, { status: 400, headers: CORS });
      if (body.byteLength > MAX) return Response.json({ error: 'Soubor je větší než 25 MB.' }, { status: 413, headers: CORS });
      const key = Date.now().toString(36) + '-' + crypto.randomUUID().slice(0, 8);
      const meta = { name: cleanName(url.searchParams.get('name')), type: req.headers.get('Content-Type') || 'application/octet-stream', size: body.byteLength };
      await env.KV.put(key, body, { expirationTtl: TTL, metadata: meta });
      return Response.json({ ok: true, url: url.origin + '/' }, { headers: CORS });
    }

    // everything below is for the laptop: browser asks for the password itself
    if (!env.HESLO || !(await sameSecret(basicPassword(req), env.HESLO)))
      return new Response('Zadej heslo ke schránce.', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Komiks", charset="UTF-8"', 'Content-Type': 'text/plain; charset=utf-8' } });

    if (url.pathname.startsWith('/f/')) {
      const { value, metadata } = await env.KV.getWithMetadata(url.pathname.slice(3), 'arrayBuffer');
      if (!value) return new Response('Soubor už tu není (vydrží jen hodinu).', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      const ascii = metadata.name.normalize('NFD').replace(/[^\x20-\x7e]/g, '') || 'soubor';
      return new Response(value, { headers: {
        'Content-Type': metadata.type, 'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(metadata.name)}`,
      } });
    }

    if (url.pathname !== '/') return new Response('Nenalezeno', { status: 404 });
    const { keys } = await env.KV.list();
    keys.sort((a, b) => b.name.localeCompare(a.name));
    const now = Date.now() / 1000;
    const rows = keys.filter(k => k.metadata).map(k => `<li><a href="/f/${esc(k.name)}" download="${esc(k.metadata.name)}">${esc(k.metadata.name)}</a>
      <span>${(k.metadata.size / 1048576).toFixed(1).replace('.', ',')} MB · zmizí za ${Math.max(1, Math.round((k.expiration - now) / 60))} min</span></li>`).join('');
    return new Response(`<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="20"><title>Komiks – schránka</title><style>
body{font:17px -apple-system,"Segoe UI",Arial,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#222;background:#f4f4f2}
h1{font-size:26px}ul{list-style:none;padding:0}li{background:#fff;border-radius:12px;padding:14px 16px;margin:10px 0;display:flex;gap:12px;align-items:center;box-shadow:0 1px 3px #0002}
a{color:#1d4ed8;font-weight:600;flex:1;word-break:break-all}span{color:#777;font-size:14px;white-space:nowrap}p{color:#555}</style></head><body>
<h1>Komiks – schránka</h1>
${rows ? `<ul>${rows}</ul>` : '<p>Schránka je prázdná. Soubory sem pošleš z appky Komiks přes Export → Do schránky.</p>'}
<p>Kliknutím se soubor stáhne. Každý soubor tu vydrží hodinu od nahrání, pak se sám smaže. Stránka se každých 20 sekund obnoví, nový soubor se může ukázat až po minutě.</p>
</body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  },
};
