// Komiks – schránka: iPad sem nahraje export, noťas si ho do hodiny stáhne.
// Každý soubor může mít vlastní heslo (ukládá se jen jeho hash), nebo žádné.
const TTL = 3600;                 // s, pak KV soubor samo smaže
const MAX = 25 * 1024 * 1024;     // limit hodnoty v KV
const MAX_FILES = 50;             // uploads are open to anyone, so cap what can pile up
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Heslo',
};

const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const hashPw = async (key, pw) => hex(await crypto.subtle.digest('SHA-256', enc.encode(key + ':' + pw)));
const sameHex = (a, b) => a.length === b.length && crypto.subtle.timingSafeEqual(enc.encode(a), enc.encode(b));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cleanName = s => (s || 'soubor').replace(/[\\/\x00-\x1f"]+/g, '').slice(0, 120) || 'soubor';
const size = b => b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' kB' : (b / 1048576).toFixed(1).replace('.', ',') + ' MB';
const text = (body, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

const page = (title, body, refresh) => new Response(`<!doctype html><html lang="cs"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">${refresh ? '<meta http-equiv="refresh" content="20">' : ''}
<title>${esc(title)}</title><style>
body{font:17px -apple-system,"Segoe UI",Arial,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#222;background:#f4f4f2}
h1{font-size:26px}ul{list-style:none;padding:0}li{background:#fff;border-radius:12px;padding:14px 16px;margin:10px 0;display:flex;gap:12px;align-items:center;box-shadow:0 1px 3px #0002}
a{color:#1d4ed8;font-weight:600;flex:1;word-break:break-all}span{color:#777;font-size:14px;white-space:nowrap}p{color:#555}
input{font:inherit;padding:10px;border:1px solid #ccc;border-radius:8px;width:100%;box-sizing:border-box;margin:8px 0}
button{font:inherit;padding:10px 18px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;cursor:pointer}</style></head>
<body>${body}</body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

function sendFile(value, meta) {
  const ascii = meta.name.normalize('NFD').replace(/[^\x20-\x7e]/g, '') || 'soubor';
  return new Response(value, { headers: {
    'Content-Type': meta.type, 'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(meta.name)}`,
  } });
}
function askPassword(key, meta, wrong) {
  return page('Zamčený soubor', `<h1>Zamčený soubor</h1><p><b>${esc(meta.name)}</b> je chráněný heslem.</p>
${wrong ? '<p style="color:#d62828">Špatné heslo, zkus to znovu.</p>' : ''}
<form method="post" action="/f/${esc(key)}"><input type="password" name="heslo" autofocus required placeholder="Heslo">
<button>Stáhnout</button></form><p><a href="/">← Zpět na seznam</a></p>`);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (req.method === 'POST' && url.pathname === '/upload') {
      const err = (msg, status) => Response.json({ error: msg }, { status, headers: CORS });
      const body = await req.arrayBuffer();
      if (!body.byteLength) return err('Prázdný soubor.', 400);
      if (body.byteLength > MAX) return err('Soubor je větší než 25 MB.', 413);
      if ((await env.KV.list({ limit: MAX_FILES })).keys.length >= MAX_FILES) return err('Schránka je plná, zkus to za chvíli.', 429);
      const key = Date.now().toString(36) + '-' + crypto.randomUUID().slice(0, 8);
      // the app sends the password URI-encoded, headers can't carry diacritics
      let pw = req.headers.get('X-Heslo') || '';
      try { pw = decodeURIComponent(pw); } catch { return err('Heslo se nepodařilo přečíst.', 400); }
      const meta = {
        name: cleanName(url.searchParams.get('name')), type: req.headers.get('Content-Type') || 'application/octet-stream',
        size: body.byteLength, ...(pw && { hash: await hashPw(key, pw) }),
      };
      await env.KV.put(key, body, { expirationTtl: TTL, metadata: meta });
      return Response.json({ ok: true }, { headers: CORS });
    }

    if (url.pathname.startsWith('/f/')) {
      const key = url.pathname.slice(3);
      const { value, metadata: meta } = await env.KV.getWithMetadata(key, 'arrayBuffer');
      if (!value) return text('Soubor už tu není (vydrží jen hodinu).', 404);
      if (!meta.hash) return sendFile(value, meta);
      if (req.method !== 'POST') return askPassword(key, meta, false);
      const pw = (await req.formData()).get('heslo') || '';
      return sameHex(await hashPw(key, pw), meta.hash) ? sendFile(value, meta) : askPassword(key, meta, true);
    }

    if (url.pathname !== '/') return text('Nenalezeno', 404);
    const { keys } = await env.KV.list();
    keys.sort((a, b) => b.name.localeCompare(a.name));
    const now = Date.now() / 1000;
    const rows = keys.filter(k => k.metadata).map(k => `<li><a href="/f/${esc(k.name)}"${k.metadata.hash ? '' : ` download="${esc(k.metadata.name)}"`}>${k.metadata.hash ? '🔒 ' : ''}${esc(k.metadata.name)}</a>
      <span>${size(k.metadata.size)} · zmizí za ${Math.max(1, Math.round((k.expiration - now) / 60))} min</span></li>`).join('');
    return page('Komiks – schránka', `<h1>Komiks – schránka</h1>
${rows ? `<ul>${rows}</ul>` : '<p>Schránka je prázdná. Soubory sem pošleš z appky Komiks přes Export → Do schránky.</p>'}
<p>Kliknutím se soubor stáhne, u souboru se zámkem se nejdřív zadá jeho heslo. Každý soubor tu vydrží hodinu od nahrání, pak se sám smaže. Stránka se každých 20 sekund obnoví, nový soubor se může ukázat až po minutě.</p>`, true);
  },
};
