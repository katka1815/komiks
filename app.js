'use strict';
const $ = s => document.querySelector(s);
const el = (tag, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

const PRESETS = [['A4 na výšku', 210, 297], ['A4 na šířku', 297, 210], ['A5 na výšku', 148, 210], ['Čtverec', 200, 200]];
const COLORS = ['#000000', '#666666', '#ffffff', '#d62828', '#f77f00', '#fcbf49', '#2a9d8f', '#1d4ed8', '#7b2cbf', '#8b5a2b'];
const TEXT_SIZES = [4, 6, 9, 14];        // mm
const SIZE_RANGE = { width: [0.1, 10], eraseWidth: [0.1, 40] }; // mm; 0.1 mm ≈ 1 px of the 200 DPI export
const FONT = '-apple-system, "Helvetica Neue", Arial, sans-serif';
const EXPORT_DPI = 200, MAX_PX = 15e6;   // iOS Safari refuses canvases above ~16.7 Mpx
const pagesWord = n => n === 1 ? 'strana' : n >= 2 && n <= 4 ? 'strany' : 'stran';

const st = {
  tool: 'pen', color: '#000000', textSize: 6,
  width: +localStorage.getItem('width') || 0.7, eraseWidth: +localStorage.getItem('eraseWidth') || 5,
  eraseMode: localStorage.getItem('eraseMode') || 'part', pencilOnly: localStorage.getItem('pencilOnly') !== '0',
};
let P = null, cur = 0, undo = [], redo = [], pending = null, scale = 1, act = null, textEdit = null, needReload = false;
const base = $('#base'), live = $('#live'), bctx = base.getContext('2d'), lctx = live.getContext('2d');
const mctx = document.createElement('canvas').getContext('2d'), ta = $('#ta');

// ---------- IndexedDB ----------
const db = new Promise((res, rej) => {
  const r = indexedDB.open('komiks', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('projects', { keyPath: 'id' });
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function tx(mode, fn) {
  const d = await db;
  return new Promise((res, rej) => {
    const t = d.transaction('projects', mode), req = fn(t.objectStore('projects'));
    t.oncomplete = () => res(req.result);
    t.onerror = t.onabort = () => rej(t.error);
  });
}
const dbAll = () => tx('readonly', s => s.getAll());
const dbPut = p => tx('readwrite', s => s.put(p));
const dbDel = id => tx('readwrite', s => s.delete(id));
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

let saveT;
const save = () => { clearTimeout(saveT); saveT = setTimeout(saveNow, 400); };
async function saveNow() {
  clearTimeout(saveT);
  if (!P) return;
  P.updated = Date.now();
  try { await dbPut(P); } catch (e) { toast('Uložení selhalo: ' + e.message); }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

function toast(t) {
  const e = $('#toast'); e.textContent = t; e.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => e.hidden = true, 3500);
}

// ---------- dialogs ----------
function modal(title, html, buttons, init) {
  const d = $('#dlg'), f = document.createElement('form'), row = el('div', 'btns');
  f.method = 'dialog';
  f.innerHTML = html;
  for (const [label, v, cls] of buttons) {
    const b = el('button', cls, label); b.value = v; b.formNoValidate = !v; row.append(b);
  }
  f.append(row);
  d.replaceChildren(el('h2', '', title), f);
  init?.(f);
  d.returnValue = '';
  d.showModal();
  return new Promise(res => d.addEventListener('close', () => res({ v: d.returnValue, f }), { once: true }));
}
const confirmDel = async msg => (await modal(msg, '', [['Zrušit', ''], ['Smazat', 'y', 'danger']])).v === 'y';

// ---------- drawing (all in mm) ----------
// Partial erases live on the object they hit (o.x), so the holes move with it.
// Such an object is drawn alone on a scratch layer, the holes are punched there, then copied over.
const scratch = document.createElement('canvas');
function drawObj(ctx, o) {
  if (!o.x?.length) return drawShape(ctx, o);
  const W = ctx.canvas.width, H = ctx.canvas.height, m = ctx.getTransform(), b = bbox(o);
  const x0 = Math.max(0, Math.floor(m.a * b[0] + m.e)), y0 = Math.max(0, Math.floor(m.d * b[1] + m.f));
  const x1 = Math.min(W, Math.ceil(m.a * b[2] + m.e)), y1 = Math.min(H, Math.ceil(m.d * b[3] + m.f));
  if (x1 <= x0 || y1 <= y0) return;
  if (scratch.width !== W || scratch.height !== H) { scratch.width = W; scratch.height = H; }
  const s = scratch.getContext('2d');
  s.setTransform(1, 0, 0, 1, 0, 0); s.clearRect(x0, y0, x1 - x0, y1 - y0);
  s.setTransform(m);
  drawShape(s, o);
  for (const e of o.x) drawShape(s, e);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(scratch, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  ctx.restore();
}
function bbox(o) {
  if (o.t === 'text') return textBox(o);
  if (o.t === 'fill') {
    if (!o.a) return o.p;
    const [x0, y0, x1, y1] = o.p, hw = (x1 - x0) / 2, hh = (y1 - y0) / 2;
    return boxOf(rotPts([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]], x0 + hw, y0 + hh, o.a));
  }
  const xs = o.p.filter((_, i) => i % 2 === 0), ys = o.p.filter((_, i) => i % 2), r = o.w / 2 + 1;
  return [Math.min(...xs) - r, Math.min(...ys) - r, Math.max(...xs) + r, Math.max(...ys) + r];
}
const boxesMeet = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
function segSegDist(ax, ay, bx, by, cx, cy, dx, dy) {
  const cr = (px, py, qx, qy, rx, ry) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const d1 = cr(ax, ay, bx, by, cx, cy), d2 = cr(ax, ay, bx, by, dx, dy), d3 = cr(cx, cy, dx, dy, ax, ay), d4 = cr(cx, cy, dx, dy, bx, by);
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0; // they cross
  return Math.min(segDist(ax, ay, cx, cy, dx, dy), segDist(bx, by, cx, cy, dx, dy), segDist(cx, cy, ax, ay, bx, by), segDist(dx, dy, ax, ay, bx, by));
}
// does eraser stroke e touch object o? segment against segment, so even a 0.1 mm eraser stays cheap
function touches_(o, e) {
  const r = e.w / 2;
  if (!boxesMeet(bbox(o), bbox({ p: e.p, w: e.w }))) return false;
  const ep = e.p.length === 2 ? [...e.p, ...e.p] : e.p;
  let pts = o.p, lim = r + (o.w || 0) / 2;
  if (o.t === 'text' || o.t === 'fill') {
    const [x0, y0, x1, y1] = bbox(o);
    for (let i = 0; i < ep.length; i += 2) if (ep[i] >= x0 && ep[i] <= x1 && ep[i + 1] >= y0 && ep[i + 1] <= y1) return true;
    pts = [x0, y0, x1, y0, x1, y1, x0, y1, x0, y0]; lim = r;
  } else if (o.t === 'rect') pts = [pts[0], pts[1], pts[2], pts[1], pts[2], pts[3], pts[0], pts[3], pts[0], pts[1]];
  else if (pts.length === 2) pts = [...pts, ...pts];
  for (let i = 0; i < ep.length - 2; i += 2)
    for (let j = 0; j < pts.length - 2; j += 2)
      if (segSegDist(ep[i], ep[i + 1], ep[i + 2], ep[i + 3], pts[j], pts[j + 1], pts[j + 2], pts[j + 3]) <= lim) return true;
  return false;
}

// ---------- partial eraser: split shapes, keep a pixel cut only where the eraser merely grazes ----------
// Points along the path exactly as drawShape draws it: fine steps near the eraser (box eb), coarse elsewhere.
function centerline(o, eb, fine) {
  const p = o.p, out = [p[0], p[1]];
  const near = (ax, ay, bx, by) => boxesMeet([Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)], eb);
  const lin = (ax, ay, bx, by) => {
    const n = near(ax, ay, bx, by) ? Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / fine)) : 1;
    for (let k = 1; k <= n; k++) out.push(ax + (bx - ax) * k / n, ay + (by - ay) * k / n);
  };
  if (o.t === 'rect') { lin(p[0], p[1], p[2], p[1]); lin(p[2], p[1], p[2], p[3]); lin(p[2], p[3], p[0], p[3]); lin(p[0], p[3], p[0], p[1]); return out; }
  if (o.t !== 'pen') { for (let i = 2; i < p.length; i += 2) lin(p[i - 2], p[i - 1], p[i], p[i + 1]); return out; }
  let x = p[0], y = p[1];
  for (let i = 2; i < p.length - 2; i += 2) {
    const cx = p[i], cy = p[i + 1], ex = (p[i] + p[i + 2]) / 2, ey = (p[i + 1] + p[i + 3]) / 2;
    const len = Math.hypot(cx - x, cy - y) + Math.hypot(ex - cx, ey - cy);
    const n = Math.max(1, Math.ceil(len / (near(Math.min(x, cx, ex), Math.min(y, cy, ey), Math.max(x, cx, ex), Math.max(y, cy, ey)) ? fine : 0.3)));
    for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; out.push(u * u * x + 2 * u * t * cx + t * t * ex, u * u * y + 2 * u * t * cy + t * t * ey); }
    x = ex; y = ey;
  }
  if (p.length >= 4) lin(x, y, p[p.length - 2], p[p.length - 1]);
  return out;
}
function pathDist(x, y, p) {
  if (p.length === 2) return Math.hypot(x - p[0], y - p[1]);
  let d = Infinity;
  for (let i = 0; i < p.length - 2; i += 2) d = Math.min(d, segDist(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]));
  return d;
}
function eraseFrom(o, e) {
  if (o.t === 'erase' || !touches_(o, e)) return [o];
  const withCut = () => [{ ...o, x: [...(o.x || []), e] }];
  // text can't be split; an eraser thinner than the line would leave a pinched gap between two round caps
  if (o.t === 'text' || o.t === 'fill' || e.w < o.w) return withCut();
  const r = e.w / 2, h = o.w / 2, eb = bbox({ p: e.p, w: e.w + o.w });
  const s = centerline(o, eb, Math.min(0.3, Math.max(0.02, Math.min(e.w, o.w) / 3))), n = s.length / 2;
  const full = [], touched = [];
  for (let i = 0; i < n; i++) {
    const x = s[2 * i], y = s[2 * i + 1];
    if (x < eb[0] || x > eb[2] || y < eb[1] || y > eb[3]) { full.push(false); touched.push(false); continue; }
    // check the centre and both edges of the line's cross-section
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let nx = s[2 * a + 1] - s[2 * b + 1], ny = s[2 * b] - s[2 * a];
    const l = Math.hypot(nx, ny) || 1; nx *= h / l; ny *= h / l;
    const d = [pathDist(x, y, e.p), pathDist(x + nx, y + ny, e.p), pathDist(x - nx, y - ny, e.p)];
    full.push(d.every(v => v <= r)); touched.push(d.some(v => v <= r));
  }
  // a touched stretch that the eraser cuts through somewhere disappears; a stretch it only grazes stays with a pixel cut
  const gone = new Array(n).fill(false);
  for (let i = 0; i < n;) {
    if (!touched[i]) { i++; continue; }
    let j = i, through = false;
    for (; j < n && touched[j]; j++) if (full[j]) through = true;
    if (through) gone.fill(true, i, j);
    i = j;
  }
  if (!gone.includes(true)) return withCut();
  // pull new ends back by half the line width, so the round caps don't reach into the erased gap
  // (measured along the path, the samples are not evenly spaced)
  const L = [0];
  for (let i = 1; i < n; i++) L.push(L[i - 1] + Math.hypot(s[2 * i] - s[2 * i - 2], s[2 * i + 1] - s[2 * i - 1]));
  const cutEnd = gone.slice();
  for (let i = 0, last = -Infinity; i < n; i++) { if (cutEnd[i]) last = L[i]; else if (L[i] - last <= h) gone[i] = true; }
  for (let i = n - 1, last = Infinity; i >= 0; i--) { if (cutEnd[i]) last = L[i]; else if (last - L[i] <= h) gone[i] = true; }
  const pieces = [];
  let piece = null;
  for (let i = 0; i < n; i++) {
    if (gone[i]) { piece = null; continue; }
    if (!piece) pieces.push(piece = { t: 'poly', c: o.c, w: o.w, p: [], graze: false });
    piece.p.push(s[2 * i], s[2 * i + 1]);
    piece.graze ||= touched[i];
  }
  return pieces.filter(q => q.p.length >= 4).map(({ graze, ...q }) => {
    const x = (o.x || []).filter(c => touches_(q, c));
    if (graze) x.push(e);
    q.p = simplify(q.p);
    return x.length ? { ...q, x } : q;
  });
}
// Douglas-Peucker: drop points within 0.01 mm of the line between kept neighbours (straight runs shrink to 2 points)
function simplify(p) {
  const n = p.length / 2;
  if (n < 3) return p;
  const keep = new Uint8Array(n), stack = [[0, n - 1]];
  keep[0] = keep[n - 1] = 1;
  while (stack.length) {
    const [a, b] = stack.pop();
    let far = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segDist(p[2 * i], p[2 * i + 1], p[2 * a], p[2 * a + 1], p[2 * b], p[2 * b + 1]);
      if (d > far) { far = d; idx = i; }
    }
    if (far > 0.01) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return p.filter((_, i) => keep[i >> 1]);
}
const applyErase = (objs, e) => objs.flatMap(o => eraseFrom(o, e));
// older versions kept partial erases as loose page strokes (v2) or as pixel cuts on whole shapes (v3)
function upgradePage(objs) {
  let out = [];
  for (const o of objs) {
    if (o.t === 'erase') { out = applyErase(out, o); continue; }
    if (!o.x || o.t === 'text') { out.push(o); continue; }
    let parts = [{ ...o, x: undefined }];
    for (const e of o.x) parts = applyErase(parts, e);
    out.push(...parts.map(({ x, ...q }) => x ? { ...q, x } : q));
  }
  return out;
}
// bucket fills are stored as PNG masks (already coloured); decoded images are cached by their data URL
const fillCache = new Map();
function fillEntry(o) {
  let f = fillCache.get(o.m);
  if (!f) {
    f = { img: new Image(), ok: false };
    f.ready = new Promise(res => {
      f.img.onload = () => { f.ok = true; res(); if (P && !act) redraw(); };
      f.img.onerror = res;
    });
    f.img.src = o.m;
    fillCache.set(o.m, f);
  }
  return f;
}
const fillsReady = pages => Promise.all(pages.flat().filter(o => o.t === 'fill').map(o => fillEntry(o).ready));
function fillAlpha(o) { // mask pixels for hit testing, read once per image
  const f = fillEntry(o);
  if (!f.ok) return null;
  if (!f.alpha) {
    const c = document.createElement('canvas'), w = c.width = f.img.naturalWidth, h = c.height = f.img.naturalHeight, x = c.getContext('2d');
    x.drawImage(f.img, 0, 0);
    f.alpha = { d: x.getImageData(0, 0, w, h).data, w, h };
    c.width = c.height = 0;
  }
  return f.alpha;
}
function drawShape(ctx, o) {
  const p = o.p;
  if (o.t === 'fill') {
    const f = fillEntry(o), w = p[2] - p[0], h = p[3] - p[1];
    if (!f.ok) return;
    ctx.save(); ctx.translate(p[0] + w / 2, p[1] + h / 2); if (o.a) ctx.rotate(o.a);
    ctx.drawImage(f.img, -w / 2, -h / 2, w, h);
    ctx.restore();
    return;
  }
  ctx.strokeStyle = ctx.fillStyle = o.c;
  if (o.t === 'text') {
    // draw at 10x and scale down: Safari rasterizes tiny font sizes poorly
    ctx.save(); ctx.translate(p[0], p[1]); if (o.a) ctx.rotate(o.a); ctx.scale(0.1, 0.1);
    ctx.font = `${o.s * 10}px ${FONT}`; ctx.textBaseline = 'top';
    o.text.split('\n').forEach((l, i) => ctx.fillText(l, 0, i * o.s * 12));
    ctx.restore();
    return;
  }
  ctx.lineWidth = o.w; ctx.lineCap = ctx.lineJoin = 'round';
  // eraser strokes punch holes into everything drawn before them
  ctx.globalCompositeOperation = o.t === 'erase' ? 'destination-out' : 'source-over';
  ctx.beginPath();
  if (o.t === 'rect') ctx.rect(p[0], p[1], p[2] - p[0], p[3] - p[1]);
  else if (o.t === 'poly') { ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]); }
  else {
    ctx.moveTo(p[0], p[1]);
    if (p.length === 2) ctx.lineTo(p[0] + 0.001, p[1]); // a tap leaves a dot
    for (let i = 2; i < p.length - 2; i += 2) ctx.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2);
    if (p.length >= 4) ctx.lineTo(p[p.length - 2], p[p.length - 1]);
  }
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}
// export + thumbnails: objects on transparent, then white paper slid underneath (so erased spots end up white)
function paint(ctx, objs, k, W, H) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  for (const o of objs) drawObj(ctx, o);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
}
function renderPage(proj, objs, k) {
  const c = document.createElement('canvas');
  c.width = Math.round(proj.w * k); c.height = Math.round(proj.h * k);
  paint(c.getContext('2d'), objs, k, c.width, c.height);
  return c;
}
// editor view: canvases cover the whole stage, page sits at (ox, oy) with `scale` CSS px per mm.
// Canvases stay transparent; the white #paper div shows through erased spots.
function viewCtx(ctx) {
  const d = devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(d * scale, 0, 0, d * scale, d * ox, d * oy);
}
function redraw() {
  viewCtx(bctx);
  bctx.save(); bctx.beginPath(); bctx.rect(0, 0, P.w, P.h); bctx.clip();
  for (const o of P.pages[cur]) drawObj(bctx, o);
  bctx.restore();
}
function showLive(o) { viewCtx(lctx); if (o) drawObj(lctx, o); drawSel(lctx); }

const stage = $('#stage');
let fitScale = 1, ox = 0, oy = 0;
function applyView() {
  Object.assign($('#paper').style, { left: ox + 'px', top: oy + 'px', width: P.w * scale + 'px', height: P.h * scale + 'px' });
  redraw(); styleText(); sizeDot?.();
  if (!act) showLive(null);
}
function fit() {
  if (!P) return;
  const W = stage.clientWidth, H = stage.clientHeight, d = devicePixelRatio || 1;
  if (W <= 0 || H <= 0) return;
  for (const c of [base, live]) { c.width = Math.round(W * d); c.height = Math.round(H * d); }
  fitScale = scale = Math.min((W - 24) / P.w, (H - 24) / P.h);
  ox = (W - P.w * scale) / 2; oy = (H - P.h * scale) / 2;
  applyView();
}
new ResizeObserver(fit).observe(stage);

// finger gestures: only two fingers zoom + pan; one finger or a resting palm never moves the page
const touches = new Map();
function gestureMove(e) {
  const before = [...touches.values()];
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const after = [...touches.values()];
  if (act && !act.touch) return; // never shift the page under a Pencil stroke
  if (after.length >= 2) {
    const c = ps => [(ps[0].x + ps[1].x) / 2, (ps[0].y + ps[1].y) / 2], dist = ps => Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) || 1;
    const [c0, c1] = [c(before), c(after)], r = stage.getBoundingClientRect();
    const s1 = Math.min(fitScale * 8, Math.max(fitScale, scale * dist(after) / dist(before)));
    // keep the page point under the fingers' midpoint under it after zooming
    ox = c1[0] - r.left - (c0[0] - r.left - ox) / scale * s1;
    oy = c1[1] - r.top - (c0[1] - r.top - oy) / scale * s1;
    scale = s1;
  } else return;
  const W = stage.clientWidth, H = stage.clientHeight;
  ox = Math.min(W / 2, Math.max(W / 2 - P.w * scale, ox));
  oy = Math.min(H / 2, Math.max(H / 2 - P.h * scale, oy));
  applyView();
}
function cancelAct() {
  if (pending) { P.pages = pending.pages; cur = pending.cur; pending = null; }
  act = null; sel = null; showLive(null); redraw();
}

// ---------- hit testing ----------
function segDist(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l)) : 0;
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}
const rotPts = (pts, cx, cy, a) => pts.map(([u, v]) => [cx + u * Math.cos(a) - v * Math.sin(a), cy + u * Math.sin(a) + v * Math.cos(a)]);
const boxOf = pts => [Math.min(...pts.map(q => q[0])), Math.min(...pts.map(q => q[1])), Math.max(...pts.map(q => q[0])), Math.max(...pts.map(q => q[1]))];
function textBox(o) { // axis-aligned box, also around rotated text
  mctx.font = `${o.s * 10}px ${FONT}`;
  const lines = o.text.split('\n'), w = Math.max(...lines.map(l => mctx.measureText(l).width)) / 10, h = lines.length * o.s * 1.2;
  if (!o.a) return [o.p[0], o.p[1], o.p[0] + w, o.p[1] + h];
  return boxOf(rotPts([[0, 0], [w, 0], [w, h], [0, h]], o.p[0], o.p[1], o.a));
}
function hit(o, x, y, tol) {
  const p = o.p;
  if (o.t === 'fill') {
    if (o.a) [[x, y]] = rotPts([[x - (p[0] + p[2]) / 2, y - (p[1] + p[3]) / 2]], (p[0] + p[2]) / 2, (p[1] + p[3]) / 2, -o.a);
    if (x < p[0] || x > p[2] || y < p[1] || y > p[3]) return false;
    const a = fillAlpha(o);
    return !a || a.d[(Math.min(a.h - 1, Math.floor((y - p[1]) / (p[3] - p[1]) * a.h)) * a.w + Math.min(a.w - 1, Math.floor((x - p[0]) / (p[2] - p[0]) * a.w))) * 4 + 3] > 0;
  }
  if (o.t === 'text') { const b = textBox(o); return x >= b[0] - tol && x <= b[2] + tol && y >= b[1] - tol && y <= b[3] + tol; }
  const pts = o.t === 'rect' ? [p[0], p[1], p[2], p[1], p[2], p[3], p[0], p[3], p[0], p[1]] : p, r = tol + o.w / 2;
  if (pts.length === 2) return Math.hypot(x - pts[0], y - pts[1]) <= r;
  for (let i = 0; i < pts.length - 2; i += 2) if (segDist(x, y, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]) <= r) return true;
  return false;
}
function topHit(x, y, only) {
  const a = P.pages[cur], tol = 10 / scale;
  for (let i = a.length - 1; i >= 0; i--) if (a[i].t !== 'erase' && (!only || a[i].t === only) && hit(a[i], x, y, tol)) return i;
  return -1;
}
function snapLine(x0, y0, x, y) {
  const a = Math.abs(Math.atan2(y - y0, x - x0)) * 180 / Math.PI; // 0..180
  if (a < 5 || a > 175) return [x, y0];
  if (Math.abs(a - 90) < 5) return [x0, y];
  return [x, y];
}

// ---------- history: snapshots share immutable objects, so they are cheap ----------
const snap = () => ({ pages: P.pages.map(p => p.slice()), cur });
const begin = () => { pending = snap(); };
function end(changed) {
  if (changed) { undo.push(pending); if (undo.length > 200) undo.shift(); redo = []; save(); }
  pending = null; redraw(); updateUI();
}
const commit = fn => { begin(); fn(); end(true); };
function restore(s) { sel = null; P.pages = s.pages; cur = s.cur; save(); redraw(); updateUI(); showLive(null); }
$('#undo').onclick = () => { finishText(true); if (act || !undo.length) return; redo.push(snap()); restore(undo.pop()); };
$('#redo').onclick = () => { finishText(true); if (act || !redo.length) return; undo.push(snap()); restore(redo.pop()); };

// ---------- bucket fill ----------
const FILL_K = 6;  // px per mm of fill masks (~150 DPI); the edge tucks under the lines anyway
const FILL_TUCK = 2; // px the fill grows under the surrounding lines, so no white seam shows
function bucket(x, y) {
  const W = Math.ceil(P.w * FILL_K), H = Math.ceil(P.h * FILL_K), sx = Math.floor(x * FILL_K), sy = Math.floor(y * FILL_K);
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return;
  // walls = everything drawn except other fills, so a fill can be recoloured
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d'); ctx.setTransform(FILL_K, 0, 0, FILL_K, 0, 0);
  for (const o of P.pages[cur]) if (o.t !== 'fill') drawObj(ctx, o);
  const src = ctx.getImageData(0, 0, W, H).data;
  c.width = c.height = 0; scratch.width = scratch.height = 0;
  const wall = i => src[i * 4 + 3] > 100;
  const start = sy * W + sx;
  if (wall(start)) return toast('Ťukni dovnitř ohraničeného místa, ne na čáru.');
  const seen = new Uint8Array(W * H), stack = new Int32Array(W * H);
  let top = 0, x0 = sx, x1 = sx, y0 = sy, y1 = sy;
  const push = i => { seen[i] = 1; stack[top++] = i; };
  push(start);
  while (top) {
    const i = stack[--top], px = i % W, py = (i - px) / W;
    if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
    if (px > 0 && !seen[i - 1] && !wall(i - 1)) push(i - 1);
    if (px < W - 1 && !seen[i + 1] && !wall(i + 1)) push(i + 1);
    if (py > 0 && !seen[i - W] && !wall(i - W)) push(i - W);
    if (py < H - 1 && !seen[i + W] && !wall(i + W)) push(i + W);
  }
  x0 = Math.max(0, x0 - FILL_TUCK); y0 = Math.max(0, y0 - FILL_TUCK); x1 = Math.min(W - 1, x1 + FILL_TUCK); y1 = Math.min(H - 1, y1 + FILL_TUCK);
  for (let t = 1; t <= FILL_TUCK; t++) // grow into the neighbouring line pixels
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const i = py * W + px;
      if (!seen[i] && ((px > 0 && seen[i - 1] === t) || (px < W - 1 && seen[i + 1] === t) || (py > 0 && seen[i - W] === t) || (py < H - 1 && seen[i + W] === t))) seen[i] = t + 1;
    }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, m = document.createElement('canvas'); m.width = w; m.height = h;
  const mc = m.getContext('2d'), img = mc.createImageData(w, h), col = parseInt(st.color.slice(1), 16);
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) if (seen[(py + y0) * W + px + x0]) {
    const j = (py * w + px) * 4;
    img.data[j] = col >> 16; img.data[j + 1] = (col >> 8) & 255; img.data[j + 2] = col & 255; img.data[j + 3] = 255;
  }
  mc.putImageData(img, 0, 0);
  const o = { t: 'fill', c: st.color, p: [x0 / FILL_K, y0 / FILL_K, (x1 + 1) / FILL_K, (y1 + 1) / FILL_K], m: m.toDataURL('image/png') };
  m.width = m.height = 0;
  // fills sit under all lines and text, newest fill on top of older fills
  commit(() => { const a = P.pages[cur]; a.splice(a.findLastIndex(q => q.t === 'fill') + 1, 0, o); });
}

// Very gentle smoothing against Pencil jitter. The stroke is split where it turns back (180° ± 10°,
// e.g. hatching to colour an area) so those tips stay sharp and in place; only the runs between are smoothed.
const CORNER = 168 * Math.PI / 180; // 180° ± 10°, with a little slack for measuring on discrete points
function smooth(p, sigma) {
  const n = p.length / 2;
  if (n < 3) return p;
  const L = [0];
  for (let i = 1; i < n; i++) L.push(L[i - 1] + Math.hypot(p[2 * i] - p[2 * i - 2], p[2 * i + 1] - p[2 * i - 1]));
  // turning angle measured between the stroke 2 sigma before and 2 sigma after each point
  const d = 2 * sigma, cuts = [0];
  let b = 0, f = 0, run = -1;
  // the tip of a turn-back run is its point farthest from where the run started
  const tipOf = (s0, e0) => { let k = s0, far = -1; for (let j = s0; j <= e0; j++) { const dd = Math.hypot(p[2 * j] - p[2 * s0], p[2 * j + 1] - p[2 * s0 + 1]); if (dd > far) { far = dd; k = j; } } return k; };
  for (let i = 1; i < n - 1; i++) {
    while (L[i] - L[b] > d) b++;
    if (f < i) f = i;
    while (f < n - 1 && L[f] - L[i] < d) f++;
    const ax = p[2 * i] - p[2 * b], ay = p[2 * i + 1] - p[2 * b + 1], bx = p[2 * f] - p[2 * i], by = p[2 * f + 1] - p[2 * i + 1];
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    const t = la && lb ? Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)))) : 0;
    if (t >= CORNER) { if (run < 0) run = i; }
    else if (run >= 0) { cuts.push(tipOf(run, i - 1)); run = -1; }
  }
  if (run >= 0) cuts.push(tipOf(run, n - 2));
  cuts.push(n - 1);
  const out = [p[0], p[1]];
  for (let k = 0; k < cuts.length - 1; k++) out.push(...smoothRun(p.slice(2 * cuts[k], 2 * cuts[k + 1] + 2), sigma).slice(2));
  return out;
}
// Gaussian average along one run over ~1 screen px; the window shrinks towards the ends, so the ends stay put
function smoothRun(p, sigma) {
  const n = p.length / 2;
  if (n < 3) return p;
  const L = [0];
  for (let i = 1; i < n; i++) L.push(L[i - 1] + Math.hypot(p[2 * i] - p[2 * i - 2], p[2 * i + 1] - p[2 * i - 1]));
  const out = [p[0], p[1]];
  for (let i = 1; i < n - 1; i++) {
    const r = Math.min(3 * sigma, L[i], L[n - 1] - L[i]);
    let sx = 0, sy = 0, sw = 0;
    for (let j = i; j >= 0 && L[i] - L[j] <= r; j--) { const w = Math.exp(-((L[i] - L[j]) ** 2) / (2 * sigma * sigma)); sx += w * p[2 * j]; sy += w * p[2 * j + 1]; sw += w; }
    for (let j = i + 1; j < n && L[j] - L[i] <= r; j++) { const w = Math.exp(-((L[j] - L[i]) ** 2) / (2 * sigma * sigma)); sx += w * p[2 * j]; sy += w * p[2 * j + 1]; sw += w; }
    out.push(sx / sw, sy / sw);
  }
  out.push(p[2 * n - 2], p[2 * n - 1]);
  return out;
}

// ---------- selection: lasso or tap, then move / scale / rotate ----------
let sel = null; // { idx: indices on the current page, f: frame { cx, cy, w, h, a } }
function clearSel() { if (sel) { sel = null; if (!act) showLive(null); } }
function selFrame(idx) {
  const b = boxOf(idx.flatMap(i => { const q = bbox(P.pages[cur][i]); return [[q[0], q[1]], [q[2], q[3]]]; }));
  return { cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2, w: b[2] - b[0], h: b[3] - b[1], a: 0 };
}
const frameCorners = f => rotPts([[-f.w / 2, -f.h / 2], [f.w / 2, -f.h / 2], [f.w / 2, f.h / 2], [-f.w / 2, f.h / 2]], f.cx, f.cy, f.a);
const rotHandle = f => rotPts([[0, -f.h / 2 - 28 / scale]], f.cx, f.cy, f.a)[0];
function drawSel(ctx) {
  if (!sel) return;
  const f = sel.f, cs = frameCorners(f), top = rotPts([[0, -f.h / 2]], f.cx, f.cy, f.a)[0], rh = rotHandle(f), u = 1 / scale;
  ctx.lineWidth = 1.5 * u; ctx.strokeStyle = '#1d4ed8'; ctx.setLineDash([6 * u, 4 * u]);
  ctx.beginPath(); cs.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(...top); ctx.lineTo(...rh); ctx.stroke();
  ctx.fillStyle = '#fff';
  for (const [x, y] of cs) { ctx.fillRect(x - 6 * u, y - 6 * u, 12 * u, 12 * u); ctx.strokeRect(x - 6 * u, y - 6 * u, 12 * u, 12 * u); }
  ctx.beginPath(); ctx.arc(rh[0], rh[1], 8 * u, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
}
function selHandle(x, y) {
  if (!sel) return null;
  const f = sel.f, r = 22 / scale, near = q => Math.hypot(x - q[0], y - q[1]) <= r;
  if (near(rotHandle(f))) return { mode: 'rotate' };
  const cs = frameCorners(f);
  for (let k = 0; k < 4; k++) if (near(cs[k])) return { mode: 'scale', corner: cs[k], anchor: cs[(k + 2) % 4] };
  const [[u, v]] = rotPts([[x - f.cx, y - f.cy]], 0, 0, -f.a);
  return Math.abs(u) <= f.w / 2 + r / 2 && Math.abs(v) <= f.h / 2 + r / 2 ? { mode: 'move' } : null;
}
// apply a similarity transform (point map fn, uniform scale sc, rotation th) to one object; lines and text scale with it
function transformObj(o, fn, sc, th) {
  const tp = p => { const q = []; for (let i = 0; i < p.length; i += 2) q.push(...fn(p[i], p[i + 1])); return q; };
  let n;
  if (o.t === 'text') n = { ...o, p: fn(o.p[0], o.p[1]), s: o.s * sc, a: (o.a || 0) + th };
  else if (o.t === 'fill') {
    const [cx, cy] = fn((o.p[0] + o.p[2]) / 2, (o.p[1] + o.p[3]) / 2), hw = (o.p[2] - o.p[0]) * sc / 2, hh = (o.p[3] - o.p[1]) * sc / 2;
    n = { ...o, p: [cx - hw, cy - hh, cx + hw, cy + hh], a: (o.a || 0) + th };
  } else if (o.t === 'rect') {
    const q = o.p, c = [q[0], q[1], q[2], q[1], q[2], q[3], q[0], q[3], q[0], q[1]];
    if (th) n = { t: 'poly', c: o.c, w: o.w * sc, p: tp(c) }; // a turned rectangle is no longer axis-aligned
    else { const t = tp(q); n = { ...o, w: o.w * sc, p: [Math.min(t[0], t[2]), Math.min(t[1], t[3]), Math.max(t[0], t[2]), Math.max(t[1], t[3])] }; }
  } else n = { ...o, w: o.w * sc, p: tp(o.p) };
  if (o.x) n.x = o.x.map(e => ({ ...e, w: e.w * sc, p: tp(e.p) }));
  return n;
}
function insidePoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function lassoSelect(poly) {
  const a = P.pages[cur], idx = [];
  a.forEach((o, i) => {
    if (o.t === 'erase') return;
    const b = bbox(o);
    const pts = o.t === 'pen' || o.t === 'poly' || o.t === 'line' ? o.p
      : [b[0], b[1], b[2], b[1], b[2], b[3], b[0], b[3], (b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    let inn = 0;
    for (let k = 0; k < pts.length; k += 2) if (insidePoly(pts[k], pts[k + 1], poly)) inn++;
    if (inn * 2 >= pts.length / 2) idx.push(i); // at least half of the object's points
  });
  return idx;
}
function selectMove(x, y) {
  const a = act;
  if (a.mode === 'lasso') {
    a.lasso.push(x, y);
    viewCtx(lctx); lctx.lineWidth = 1.5 / scale; lctx.strokeStyle = '#1d4ed8'; lctx.setLineDash([6 / scale, 4 / scale]);
    lctx.beginPath(); for (let i = 0; i < a.lasso.length; i += 2) i ? lctx.lineTo(a.lasso[i], a.lasso[i + 1]) : lctx.moveTo(a.lasso[0], a.lasso[1]);
    lctx.stroke(); lctx.setLineDash([]);
    return;
  }
  const f0 = a.f0;
  let fn, sc = 1, th = 0, f;
  if (a.mode === 'move') {
    const dx = x - a.x0, dy = y - a.y0;
    fn = (px, py) => [px + dx, py + dy]; f = { ...f0, cx: f0.cx + dx, cy: f0.cy + dy };
  } else if (a.mode === 'scale') {
    const [ax, ay] = a.anchor;
    sc = Math.max(0.05, Math.hypot(x - ax, y - ay) / (Math.hypot(a.corner[0] - ax, a.corner[1] - ay) || 1));
    fn = (px, py) => [ax + (px - ax) * sc, ay + (py - ay) * sc];
    const [cx, cy] = fn(f0.cx, f0.cy); f = { ...f0, cx, cy, w: f0.w * sc, h: f0.h * sc };
  } else {
    th = Math.atan2(y - f0.cy, x - f0.cx) - Math.atan2(a.y0 - f0.cy, a.x0 - f0.cx);
    const c = Math.cos(th), s = Math.sin(th);
    fn = (px, py) => [f0.cx + (px - f0.cx) * c - (py - f0.cy) * s, f0.cy + (px - f0.cx) * s + (py - f0.cy) * c];
    f = { ...f0, a: f0.a + th };
  }
  a.changed = true;
  sel.idx.forEach((i, k) => { P.pages[cur][i] = transformObj(a.orig[k], fn, sc, th); });
  sel.f = f;
  redraw(); showLive(null);
}

// ---------- pointer input ----------
const pos = (e, r) => [(e.clientX - r.left - ox) / scale, (e.clientY - r.top - oy) / scale];
function erase(x, y) {
  const a = P.pages[cur], b = a.filter(o => o.t === 'erase' || !hit(o, x, y, 8 / scale));
  if (b.length !== a.length) { P.pages[cur] = b; act.changed = true; redraw(); }
}
live.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (st.pencilOnly || touches.size > 1) { if (act?.touch) cancelAct(); return; }
  }
  if (textEdit) { finishText(true); return; }
  if (act) return;
  live.setPointerCapture(e.pointerId);
  const r = live.getBoundingClientRect(), [x, y] = pos(e, r), t = st.tool;
  act = { id: e.pointerId, touch: e.pointerType === 'touch', t, r, x0: x, y0: y, sm: 1.2 / scale };
  if (t === 'pen') act.o = { t, c: st.color, w: st.width, p: [x, y] };
  else if (t === 'line' || t === 'rect') act.o = { t, c: st.color, w: st.width, p: [x, y, x, y] };
  else if (t === 'select') {
    let h = selHandle(x, y);
    if (!h) {
      const i = topHit(x, y);
      if (i >= 0) { sel = { idx: [i], f: selFrame([i]) }; h = { mode: 'move' }; } // tap on a shape: select it and drag right away
    }
    if (h) { Object.assign(act, h); begin(); act.orig = sel.idx.map(i => P.pages[cur][i]); act.f0 = { ...sel.f }; }
    else { sel = null; act.mode = 'lasso'; act.lasso = [x, y]; }
  }
  else if (t === 'erase' && st.eraseMode === 'part') act.o = { t: 'erase', c: '#000', w: st.eraseWidth, p: [x, y] };
  else if (t === 'erase') { begin(); erase(x, y); }
  move(e);
});
function move(e) {
  const evs = e.getCoalescedEvents?.() || [];
  for (const ev of evs.length ? evs : [e]) {
    const [x, y] = pos(ev, act.r);
    if (act.t === 'pen' || act.o?.t === 'erase') {
      const p = act.o.p;
      if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) >= 0.5 / scale) p.push(x, y); // half a screen px
    } else if (act.t === 'erase') erase(x, y);
  }
  const [x, y] = pos(e, act.r);
  if (act.t === 'line') act.o.p = [act.x0, act.y0, ...snapLine(act.x0, act.y0, x, y)];
  else if (act.t === 'rect') act.o.p = [act.x0, act.y0, x, y];
  else if (act.t === 'select') return selectMove(x, y);
  if (act.o?.t === 'erase') {
    // erase straight on the base canvas for instant feedback, show the eraser size as a ring
    drawObj(bctx, act.o);
    viewCtx(lctx); lctx.lineWidth = 1 / scale; lctx.strokeStyle = '#888';
    lctx.beginPath(); lctx.arc(x, y, act.o.w / 2, 0, 2 * Math.PI); lctx.stroke();
  } else showLive(act.t === 'pen' ? { ...act.o, p: smooth(act.o.p, act.sm) } : act.o);
}
live.addEventListener('pointermove', e => {
  if (touches.has(e.pointerId) && !(act && act.id === e.pointerId)) return gestureMove(e);
  if (act && e.pointerId === act.id) move(e);
});
function up(e) {
  if (touches.delete(e.pointerId) && !touches.size && scale <= fitScale * 1.02) fit();
  if (!act || e.pointerId !== act.id) return;
  const a = act; act = null; showLive(null);
  const p = a.o?.p;
  if (a.o?.t === 'erase') commit(() => { P.pages[cur] = applyErase(P.pages[cur], a.o); });
  else if (a.t === 'pen') commit(() => P.pages[cur].push({ ...a.o, p: smooth(a.o.p, a.sm) }));
  else if (a.t === 'line' && Math.hypot(p[2] - p[0], p[3] - p[1]) > 0.5) commit(() => P.pages[cur].push(a.o));
  else if (a.t === 'rect' && Math.abs(p[2] - p[0]) > 0.5 && Math.abs(p[3] - p[1]) > 0.5)
    commit(() => P.pages[cur].push({ ...a.o, p: [Math.min(p[0], p[2]), Math.min(p[1], p[3]), Math.max(p[0], p[2]), Math.max(p[1], p[3])] }));
  else if (a.t === 'select' && a.mode === 'lasso') {
    const idx = a.lasso.length >= 6 ? lassoSelect(a.lasso) : [];
    sel = idx.length ? { idx, f: selFrame(idx) } : null;
    showLive(null);
  }
  else if (a.t === 'select' || a.t === 'erase') { end(!!a.changed); showLive(null); }
  else if (a.t === 'text' && e.type === 'pointerup') openText(a.x0, a.y0);
  else if (a.t === 'fill' && e.type === 'pointerup') bucket(a.x0, a.y0);
}
live.addEventListener('pointerup', up);
live.addEventListener('pointercancel', up);
live.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
live.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('touchmove', e => {
  if (!$('#editor').hidden && !e.target.closest('dialog, textarea, input')) e.preventDefault();
}, { passive: false });

// ---------- text ----------
function openText(x, y) {
  const i = topHit(x, y, 'text');
  if (i >= 0) {
    const o = P.pages[cur][i];
    textEdit = { x: o.p[0], y: o.p[1], i, orig: o };
    ta.value = o.text; setColor(o.c); st.textSize = o.s; buildSizes();
  } else {
    textEdit = { x, y, i: -1 };
    ta.value = '';
  }
  $('#textbox').hidden = false;
  styleText();
  ta.focus();
}
function styleText() {
  if (!textEdit) return;
  const tb = $('#textbox'), fs = st.textSize * scale;
  tb.style.left = textEdit.x * scale + 'px'; tb.style.top = textEdit.y * scale + 'px';
  ta.style.fontSize = fs + 'px'; ta.style.color = st.color;
  ta.style.width = Math.max(textBox({ s: st.textSize, p: [0, 0], text: ta.value }) [2] * scale + fs, 3 * fs) + 'px';
  ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px';
}
ta.addEventListener('input', styleText);
function finishText(ok) {
  const te = textEdit;
  if (!te) return;
  textEdit = null; $('#textbox').hidden = true; ta.blur();
  if (!ok) return;
  const text = ta.value.replace(/\s+$/, ''), g = te.orig, o = { t: 'text', c: st.color, s: st.textSize, p: [te.x, te.y], text, ...(g?.a && { a: g.a }) };
  if (te.i < 0) { if (text) commit(() => P.pages[cur].push(o)); }
  else if (!text) commit(() => P.pages[cur].splice(te.i, 1));
  else if (text !== g.text || o.c !== g.c || o.s !== g.s) commit(() => { P.pages[cur][te.i] = o; });
}
$('#tok').onclick = () => finishText(true);
$('#tcancel').onclick = () => finishText(false);

// ---------- toolbar ----------
for (const b of document.querySelectorAll('#tools button')) b.onclick = () => {
  finishText(true); clearSel();
  st.tool = b.dataset.tool;
  for (const x of document.querySelectorAll('#tools button')) x.classList.toggle('on', x === b);
  buildSizes();
};
// continuous size picker, logarithmic so the thin end gets most of the slider
let sizeDot = null;
function sizeSlider(key) {
  const [lo, hi] = SIZE_RANGE[key], k = Math.log(hi / lo);
  const wrap = el('div', 'slider'), dotBox = el('div', 'dotbox'), dot = el('span', 'dot'), label = el('div', 'val');
  const range = el('input'), minus = el('button', '', '−'), plus = el('button', '', '+'), row = el('div', 'pm');
  range.type = 'range'; range.min = 0; range.max = 1000;
  range.setAttribute('aria-label', key === 'width' ? 'Tloušťka čáry' : 'Tloušťka gumy');
  minus.setAttribute('aria-label', 'Tenčí'); plus.setAttribute('aria-label', 'Silnější');
  const show = () => { const px = st[key] * scale; dot.style.width = dot.style.height = Math.min(40, Math.max(2, px)) + 'px'; };
  const set = (v, fromRange) => {
    v = Math.min(hi, Math.max(lo, v));
    st[key] = v; localStorage.setItem(key, v);
    if (!fromRange) range.value = Math.round(Math.log(v / lo) / k * 1000);
    label.textContent = (v < 1 ? v.toFixed(2) : v.toFixed(1)).replace('.', ',') + ' mm';
    show();
  };
  range.addEventListener('input', () => set(lo * Math.exp(range.value / 1000 * k), true));
  minus.onclick = () => set(st[key] / 1.15);
  plus.onclick = () => set(st[key] * 1.15);
  dotBox.append(dot); row.append(minus, plus);
  wrap.append(dotBox, label, range, row);
  set(st[key]);
  sizeDot = show;
  return wrap;
}
function buildSizes() {
  sizeDot = null;
  const t = st.tool, box = $('#sizes'), items = [];
  box.hidden = t === 'select' || t === 'fill';
  if (t === 'erase') for (const [m, label] of [['part', 'Část'], ['whole', 'Celé tahy']]) {
    const b = el('button', 'mode' + (st.eraseMode === m ? ' on' : ''), label);
    b.onclick = () => { st.eraseMode = m; localStorage.setItem('eraseMode', m); buildSizes(); };
    items.push(b);
  }
  if (t === 'text') TEXT_SIZES.forEach((v, i) => {
    const b = el('button', v === st.textSize ? 'on' : '');
    b.setAttribute('aria-label', 'Písmo ' + v + ' mm');
    const a = el('span', '', 'A'); a.style.fontSize = 11 + i * 5 + 'px'; b.append(a);
    b.onclick = () => { st.textSize = v; buildSizes(); styleText(); };
    items.push(b);
  });
  else if (t !== 'erase' || st.eraseMode === 'part') items.push(sizeSlider(t === 'erase' ? 'eraseWidth' : 'width'));
  box.replaceChildren(...items);
}
const colorBox = $('#colors'), custom = el('label', 'sw custom'), picker = el('input');
picker.type = 'color'; picker.setAttribute('aria-label', 'Vlastní barva'); custom.append(picker);
for (const c of COLORS) {
  const b = el('button', 'sw'); b.style.background = c; b.dataset.c = c;
  b.setAttribute('aria-label', 'Barva ' + c); b.onclick = () => setColor(c); colorBox.append(b);
}
colorBox.append(custom);
picker.addEventListener('input', () => setColor(picker.value));
function setColor(c) {
  st.color = c;
  let found = false;
  for (const b of colorBox.querySelectorAll('button')) { const on = b.dataset.c === c; b.classList.toggle('on', on); found ||= on; }
  custom.classList.toggle('on', !found);
  if (!found) custom.style.background = c;
  styleText();
}
function setPencil(v) {
  st.pencilOnly = v; localStorage.setItem('pencilOnly', v ? '1' : '0');
  const b = $('#pencil'); b.textContent = v ? '✏︎ Jen Pencil' : '✏︎ Pencil i prst'; b.classList.toggle('on', v); b.setAttribute('aria-pressed', v);
}
$('#pencil').onclick = () => setPencil(!st.pencilOnly);

// ---------- pages ----------
function updateUI() {
  $('#pageno').textContent = `${cur + 1} / ${P.pages.length}`;
  $('#prev').disabled = cur === 0;
  $('#next').disabled = cur === P.pages.length - 1;
  $('#delpage').disabled = P.pages.length === 1;
  $('#undo').disabled = !undo.length;
  $('#redo').disabled = !redo.length;
}
const go = i => { finishText(true); clearSel(); cur = i; redraw(); updateUI(); };
$('#prev').onclick = () => go(cur - 1);
$('#next').onclick = () => go(cur + 1);
$('#addpage').onclick = () => { finishText(true); commit(() => { P.pages.splice(cur + 1, 0, []); cur++; }); };
$('#duppage').onclick = () => { finishText(true); commit(() => { P.pages.splice(cur + 1, 0, P.pages[cur].slice()); cur++; }); };
$('#delpage').onclick = async () => {
  finishText(true);
  if (P.pages.length > 1 && await confirmDel(`Smazat stránku ${cur + 1}?`))
    commit(() => { P.pages.splice(cur, 1); cur = Math.min(cur, P.pages.length - 1); });
};

// ---------- projects ----------
function openProject(p) {
  P = p; cur = 0; undo = []; redo = [];
  if (p.v !== 4) { p.pages = p.pages.map(upgradePage); p.v = 4; save(); }
  $('#home').hidden = true; $('#editor').hidden = false;
  $('#title').textContent = p.name;
  buildSizes(); updateUI(); fit();
}
async function showHome() {
  finishText(true);
  await saveNow();
  P = null;
  if (needReload) return location.reload();
  $('#editor').hidden = true; $('#home').hidden = false;
  let list = [];
  try { list = await dbAll(); } catch (e) { toast('Projekty nejde načíst: ' + e.message); }
  list.sort((a, b) => b.updated - a.updated);
  $('#empty').hidden = list.length > 0;
  await fillsReady(list.map(p => p.pages[0]));
  $('#projects').replaceChildren(...list.map(card));
}
$('#back').onclick = showHome;

function card(p) {
  const c = el('div', 'card'), box = el('div', 'thumbbox'), acts = el('div', 'acts'), n = p.pages.length;
  const th = renderPage(p, p.pages[0], 180 * (devicePixelRatio || 1) / Math.max(p.w, p.h));
  th.style.width = p.w / Math.max(p.w, p.h) * 180 + 'px';
  box.append(th); box.onclick = () => openProject(p);
  const btn = (label, fn, cls) => { const b = el('button', cls, label); b.onclick = fn; acts.append(b); };
  btn('Otevřít', () => openProject(p), 'primary');
  btn('Přejmenovat', async () => {
    const { v, f } = await modal('Přejmenovat projekt', '<label>Název <input name="title" required maxlength="80"></label>',
      [['Zrušit', ''], ['Uložit', 'ok', 'primary']], f => { f.elements.title.value = p.name; });
    if (v !== 'ok') return;
    p.name = f.elements.title.value.trim() || p.name;
    await store(p); showHome();
  });
  btn('Duplikovat', async () => { await store({ ...p, id: newId(), name: p.name + ' (kopie)', updated: Date.now() }); showHome(); });
  btn('Smazat', async () => {
    if (!await confirmDel(`Smazat projekt „${p.name}“?`)) return;
    try { await dbDel(p.id); } catch (e) { toast('Smazání selhalo: ' + e.message); }
    showHome();
  }, 'danger');
  c.append(box, el('div', 'name', p.name), el('div', 'meta', `${n} ${pagesWord(n)} · ${p.w} × ${p.h} mm`), acts);
  return c;
}
async function store(p) { try { await dbPut(p); return true; } catch (e) { toast('Uložení selhalo: ' + e.message); return false; } }

$('#new').onclick = async () => {
  const html = `<label>Název <input name="title" required maxlength="80"></label><fieldset>` +
    PRESETS.map(([l, w, h], i) => `<label class="opt"><input type="radio" name="size" value="${i}"${i ? '' : ' checked'}> ${l} <small>${w} × ${h} mm</small></label>`).join('') +
    `<label class="opt"><input type="radio" name="size" value="c"> Vlastní rozměr</label>
    <div class="custom"><label>Šířka (mm) <input name="w" type="number" min="20" max="1000" step="any" value="210"></label>
    <label>Výška (mm) <input name="h" type="number" min="20" max="1000" step="any" value="297"></label></div></fieldset>`;
  const { v, f } = await modal('Nový projekt', html, [['Zrušit', ''], ['Vytvořit', 'ok', 'primary']], f => { f.elements.title.value = 'Nový komiks'; });
  if (v !== 'ok') return;
  const s = f.elements.size.value, [w, h] = s === 'c' ? [+f.elements.w.value, +f.elements.h.value] : PRESETS[s].slice(1);
  const p = { id: newId(), name: f.elements.title.value.trim() || 'Nový komiks', w, h, pages: [[]], v: 4, updated: Date.now() };
  if (await store(p)) openProject(p);
};

// backup import: the file comes from outside, so check every field we later draw
function validProject(d) {
  const num = v => typeof v === 'number' && isFinite(v);
  const okErase = e => e && e.t === 'erase' && Array.isArray(e.p) && e.p.length >= 2 && e.p.length % 2 === 0 && e.p.every(num) && num(e.w) && e.w > 0;
  const okObj = o => o && ['pen', 'line', 'rect', 'poly', 'text', 'erase', 'fill'].includes(o.t) && typeof o.c === 'string' && Array.isArray(o.p) &&
    o.p.length >= 2 && o.p.length % 2 === 0 && o.p.every(num) && (o.t === 'text' ? typeof o.text === 'string' && num(o.s) && o.s > 0
      : o.t === 'fill' ? o.p.length === 4 && typeof o.m === 'string' && o.m.startsWith('data:image/png;base64,') : num(o.w) && o.w > 0) &&
    (o.a === undefined || num(o.a)) &&
    (o.x === undefined || Array.isArray(o.x) && o.x.every(okErase));
  return d && typeof d.name === 'string' && num(d.w) && num(d.h) && d.w > 0 && d.h > 0 &&
    Array.isArray(d.pages) && d.pages.length > 0 && d.pages.every(pg => Array.isArray(pg) && pg.every(okObj));
}
$('#import').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  let d;
  try { d = JSON.parse(await file.text()); } catch { return toast('Soubor není platná záloha (JSON).'); }
  if (!validProject(d)) return toast('Soubor není záloha z Komiksu.');
  if (await store({ id: newId(), name: d.name, w: d.w, h: d.h, pages: d.pages, updated: Date.now() })) { toast(`Projekt „${d.name}“ je obnovený.`); showHome(); }
});

// ---------- export ----------
const expMsg = t => { $('#expmsg').textContent = t; };
const safeName = s => s.trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-') || 'komiks';
const toBlob = (c, type, q) => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('obrázek se nepodařilo vytvořit')), type, q));
function exportK() {
  const k = EXPORT_DPI / 25.4;
  return P.w * k * P.h * k > MAX_PX ? Math.sqrt(MAX_PX / (P.w * P.h)) : k;
}
async function pdfFile(idx, name) {
  const w = pdfWriter(), k = exportK();
  for (const [n, i] of idx.entries()) {
    expMsg(`Stránka ${n + 1}/${idx.length}…`);
    const c = renderPage(P, P.pages[i], k);
    try { w.addPage(await toBlob(c, 'image/jpeg', 0.92), c.width, c.height, P.w, P.h); }
    finally { c.width = c.height = scratch.width = scratch.height = 0; } // free canvas memory right away, Safari kills the tab otherwise
  }
  return new File([w.finish()], name, { type: 'application/pdf' });
}
async function makeFile(kind) {
  await fillsReady(P.pages);
  const n = safeName(P.name), pg = `${n}_strana-${cur + 1}`;
  if (kind === 'pdf-all') return pdfFile(P.pages.map((_, i) => i), `${n}.pdf`);
  if (kind === 'pdf-page') return pdfFile([cur], `${pg}.pdf`);
  if (kind === 'json') return new File([JSON.stringify({ app: 'komiks', v: 1, name: P.name, w: P.w, h: P.h, pages: P.pages })], `${n}.json`, { type: 'application/json' });
  expMsg(`Stránka ${cur + 1}…`);
  const c = renderPage(P, P.pages[cur], exportK());
  try {
    const b = await toBlob(c, kind === 'png' ? 'image/png' : 'image/jpeg', 0.92);
    return new File([b], `${pg}.${kind}`, { type: b.type });
  } finally { c.width = c.height = scratch.width = scratch.height = 0; }
}
function download(file) {
  const a = el('a'); a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
async function share(file) {
  try { await navigator.share({ files: [file], title: file.name }); expMsg(`Odesláno: ${file.name}`); }
  catch (e) {
    if (e.name === 'AbortError') return expMsg('');
    // iOS allows share only right after a tap; when preparing took too long, ask for one more tap
    if (e.name !== 'NotAllowedError') throw e;
    expMsg(`Soubor ${file.name} je připravený.`);
    const b = $('#expshare'); b.hidden = false;
    b.onclick = () => { b.hidden = true; share(file).catch(err => expMsg('Sdílení selhalo: ' + err.message)); };
  }
}
// inbox Worker (schranka/): the laptop downloads the file from there within an hour
const SCHRANKA = 'https://komiks-schranka.kackaodkazyapoznamky.workers.dev';
async function upload(file) {
  const { v, f } = await modal('Poslat do schránky',
    `<p>${file.name.replace(/[&<>]/g, '')}</p><label>Heslo k souboru (nepovinné) <input name="pw" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Bez hesla"></label>`,
    [['Zrušit', ''], ['Poslat', 'ok', 'primary']]);
  if (v !== 'ok') return expMsg('');
  const pw = f.elements.pw.value.trim();
  expMsg(`Nahrávám ${file.name}…`);
  let r;
  try {
    r = await fetch(SCHRANKA + '/upload?name=' + encodeURIComponent(file.name), {
      method: 'POST', body: file,
      headers: { 'Content-Type': file.type, ...(pw && { 'X-Heslo': encodeURIComponent(pw) }) },
    });
  } catch { throw new Error('schránka není dostupná, jsi připojená k internetu?'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'schránka odpověděla chybou ' + r.status);
  expMsg(`Nahráno ${pw ? 's heslem' : 'bez hesla'}: ${file.name}. Na noťasu otevři ${SCHRANKA.replace('https://', '')}, soubor tam vydrží hodinu.`);
}
let busy = false;
$('#exp').addEventListener('click', async e => {
  const b = e.target.closest('button[data-how]');
  if (!b || busy) return;
  busy = true; $('#exp').classList.add('busy'); $('#expshare').hidden = true; expMsg('Připravuji…');
  try {
    const file = await makeFile(b.closest('[data-kind]').dataset.kind);
    if (b.dataset.how === 'box') await upload(file);
    else if (b.dataset.how === 'share' && navigator.canShare?.({ files: [file] })) await share(file);
    else {
      download(file);
      expMsg(b.dataset.how === 'share' ? `Sdílení tu není k dispozici, soubor ${file.name} se stahuje.` : `Stahuje se ${file.name}`);
    }
  } catch (err) { console.error(err); expMsg('Export selhal: ' + err.message); }
  finally { busy = false; $('#exp').classList.remove('busy'); }
});
$('#export').onclick = () => { finishText(true); saveNow(); expMsg(''); $('#expshare').hidden = true; $('#exp').showModal(); };
$('#expclose').onclick = () => { if (!busy) $('#exp').close(); };
$('#exp').addEventListener('cancel', e => { if (busy) e.preventDefault(); });

// ---------- start ----------
navigator.storage?.persist?.().catch(() => {});
if ('serviceWorker' in navigator) {
  const hadSW = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
  // a new version took over: reload on the project list, never in the middle of drawing
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!hadSW) return; if (P) needReload = true; else location.reload(); });
}
document.querySelector('[data-tool="pen"]').classList.add('on');
setColor(st.color); setPencil(st.pencilOnly); buildSizes(); showHome();
