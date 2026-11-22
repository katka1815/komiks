'use strict';
const $ = s => document.querySelector(s);
const el = (tag, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

const PRESETS = [['A4 na výšku', 210, 297], ['A4 na šířku', 297, 210], ['A5 na výšku', 148, 210], ['Čtverec', 200, 200]];
const COLORS = ['#000000', '#666666', '#ffffff', '#d62828', '#f77f00', '#fcbf49', '#2a9d8f', '#1d4ed8', '#7b2cbf', '#8b5a2b'];
const WIDTHS = [0.35, 0.7, 1.4, 2.8];   // mm
const TEXT_SIZES = [4, 6, 9, 14];        // mm
const ERASE_WIDTHS = [2, 5, 10, 20];     // mm
const FONT = '-apple-system, "Helvetica Neue", Arial, sans-serif';
const EXPORT_DPI = 200, MAX_PX = 15e6;   // iOS Safari refuses canvases above ~16.7 Mpx
const pagesWord = n => n === 1 ? 'strana' : n >= 2 && n <= 4 ? 'strany' : 'stran';

const st = {
  tool: 'pen', color: '#000000', width: 0.7, textSize: 6, eraseWidth: 5,
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
function drawObj(ctx, o) {
  const p = o.p;
  ctx.strokeStyle = ctx.fillStyle = o.c;
  if (o.t === 'text') {
    // draw at 10x and scale down: Safari rasterizes tiny font sizes poorly
    ctx.save(); ctx.translate(p[0], p[1]); ctx.scale(0.1, 0.1);
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
function showLive(o) { viewCtx(lctx); if (o) drawObj(lctx, o); }

const stage = $('#stage');
let fitScale = 1, ox = 0, oy = 0;
function applyView() {
  Object.assign($('#paper').style, { left: ox + 'px', top: oy + 'px', width: P.w * scale + 'px', height: P.h * scale + 'px' });
  redraw(); styleText();
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

// finger gestures: two fingers zoom + pan; with "Jen Pencil" one finger pans too
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
  } else { ox += after[0].x - before[0].x; oy += after[0].y - before[0].y; }
  const W = stage.clientWidth, H = stage.clientHeight;
  ox = Math.min(W / 2, Math.max(W / 2 - P.w * scale, ox));
  oy = Math.min(H / 2, Math.max(H / 2 - P.h * scale, oy));
  applyView();
}
function cancelAct() {
  if (pending) { P.pages = pending.pages; cur = pending.cur; pending = null; }
  act = null; showLive(null); redraw();
}

// ---------- hit testing ----------
function segDist(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l)) : 0;
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}
function textBox(o) {
  mctx.font = `${o.s * 10}px ${FONT}`;
  const lines = o.text.split('\n'), w = Math.max(...lines.map(l => mctx.measureText(l).width)) / 10;
  return [o.p[0], o.p[1], o.p[0] + w, o.p[1] + lines.length * o.s * 1.2];
}
function hit(o, x, y, tol) {
  const p = o.p;
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
const moved = (o, dx, dy) => ({ ...o, p: o.p.map((v, i) => v + (i % 2 ? dy : dx)) });
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
function restore(s) { P.pages = s.pages; cur = s.cur; save(); redraw(); updateUI(); }
$('#undo').onclick = () => { finishText(true); if (act || !undo.length) return; redo.push(snap()); restore(undo.pop()); };
$('#redo').onclick = () => { finishText(true); if (act || !redo.length) return; undo.push(snap()); restore(redo.pop()); };

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
  act = { id: e.pointerId, touch: e.pointerType === 'touch', t, r, x0: x, y0: y };
  if (t === 'pen') act.o = { t, c: st.color, w: st.width, p: [x, y] };
  else if (t === 'line' || t === 'rect') act.o = { t, c: st.color, w: st.width, p: [x, y, x, y] };
  else if (t === 'move') {
    const i = topHit(x, y);
    if (i < 0) { act = null; return; }
    begin(); act.i = i; act.orig = P.pages[cur][i];
  }
  // shortcut: a partial erase is its own stroke, so an object moved later keeps its holes in place; split shapes if that bothers
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
      if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) >= 0.15) p.push(x, y);
    } else if (act.t === 'erase') erase(x, y);
  }
  const [x, y] = pos(e, act.r);
  if (act.t === 'line') act.o.p = [act.x0, act.y0, ...snapLine(act.x0, act.y0, x, y)];
  else if (act.t === 'rect') act.o.p = [act.x0, act.y0, x, y];
  else if (act.t === 'move') {
    act.changed = x !== act.x0 || y !== act.y0;
    P.pages[cur][act.i] = moved(act.orig, x - act.x0, y - act.y0);
    redraw();
  }
  if (act.o?.t === 'erase') {
    // erase straight on the base canvas for instant feedback, show the eraser size as a ring
    drawObj(bctx, act.o);
    viewCtx(lctx); lctx.lineWidth = 1 / scale; lctx.strokeStyle = '#888';
    lctx.beginPath(); lctx.arc(x, y, act.o.w / 2, 0, 2 * Math.PI); lctx.stroke();
  } else showLive(act.o);
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
  if (a.t === 'pen' || a.o?.t === 'erase') commit(() => P.pages[cur].push(a.o));
  else if (a.t === 'line' && Math.hypot(p[2] - p[0], p[3] - p[1]) > 0.5) commit(() => P.pages[cur].push(a.o));
  else if (a.t === 'rect' && Math.abs(p[2] - p[0]) > 0.5 && Math.abs(p[3] - p[1]) > 0.5)
    commit(() => P.pages[cur].push({ ...a.o, p: [Math.min(p[0], p[2]), Math.min(p[1], p[3]), Math.max(p[0], p[2]), Math.max(p[1], p[3])] }));
  else if (a.t === 'move' || a.t === 'erase') end(!!a.changed);
  else if (a.t === 'text' && e.type === 'pointerup') openText(a.x0, a.y0);
}
live.addEventListener('pointerup', up);
live.addEventListener('pointercancel', up);
live.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
live.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('touchmove', e => {
  if (!$('#editor').hidden && !e.target.closest('dialog, textarea')) e.preventDefault();
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
  const text = ta.value.replace(/\s+$/, ''), o = { t: 'text', c: st.color, s: st.textSize, p: [te.x, te.y], text }, g = te.orig;
  if (te.i < 0) { if (text) commit(() => P.pages[cur].push(o)); }
  else if (!text) commit(() => P.pages[cur].splice(te.i, 1));
  else if (text !== g.text || o.c !== g.c || o.s !== g.s) commit(() => { P.pages[cur][te.i] = o; });
}
$('#tok').onclick = () => finishText(true);
$('#tcancel').onclick = () => finishText(false);

// ---------- toolbar ----------
for (const b of document.querySelectorAll('#tools button')) b.onclick = () => {
  finishText(true);
  st.tool = b.dataset.tool;
  for (const x of document.querySelectorAll('#tools button')) x.classList.toggle('on', x === b);
  buildSizes();
};
function buildSizes() {
  const t = st.tool, box = $('#sizes'), items = [];
  box.hidden = t === 'move';
  if (t === 'erase') for (const [m, label] of [['part', 'Část'], ['whole', 'Celé tahy']]) {
    const b = el('button', 'mode' + (st.eraseMode === m ? ' on' : ''), label);
    b.onclick = () => { st.eraseMode = m; localStorage.setItem('eraseMode', m); buildSizes(); };
    items.push(b);
  }
  if (t !== 'erase' || st.eraseMode === 'part') {
    const key = t === 'text' ? 'textSize' : t === 'erase' ? 'eraseWidth' : 'width';
    const list = t === 'text' ? TEXT_SIZES : t === 'erase' ? ERASE_WIDTHS : WIDTHS;
    const what = t === 'text' ? 'Písmo ' : t === 'erase' ? 'Tloušťka gumy ' : 'Tloušťka ';
    list.forEach((v, i) => {
      const b = el('button', v === st[key] ? 'on' : '');
      b.setAttribute('aria-label', what + String(v).replace('.', ',') + ' mm');
      if (t === 'text') { const s = el('span', '', 'A'); s.style.fontSize = 11 + i * 5 + 'px'; b.append(s); }
      else { const d = el('span', 'dot'); d.style.width = d.style.height = [4, 7, 11, 18][i] + 'px'; b.append(d); }
      b.onclick = () => { st[key] = v; buildSizes(); styleText(); };
      items.push(b);
    });
  }
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
const go = i => { finishText(true); cur = i; redraw(); updateUI(); };
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
  const p = { id: newId(), name: f.elements.title.value.trim() || 'Nový komiks', w, h, pages: [[]], updated: Date.now() };
  if (await store(p)) openProject(p);
};

// backup import: the file comes from outside, so check every field we later draw
function validProject(d) {
  const num = v => typeof v === 'number' && isFinite(v);
  const okObj = o => o && ['pen', 'line', 'rect', 'text', 'erase'].includes(o.t) && typeof o.c === 'string' && Array.isArray(o.p) &&
    o.p.length >= 2 && o.p.length % 2 === 0 && o.p.every(num) && (o.t === 'text' ? typeof o.text === 'string' && num(o.s) && o.s > 0 : num(o.w) && o.w > 0);
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
    finally { c.width = c.height = 0; } // free canvas memory right away, Safari kills the tab otherwise
  }
  return new File([w.finish()], name, { type: 'application/pdf' });
}
async function makeFile(kind) {
  const n = safeName(P.name), pg = `${n}_strana-${cur + 1}`;
  if (kind === 'pdf-all') return pdfFile(P.pages.map((_, i) => i), `${n}.pdf`);
  if (kind === 'pdf-page') return pdfFile([cur], `${pg}.pdf`);
  if (kind === 'json') return new File([JSON.stringify({ app: 'komiks', v: 1, name: P.name, w: P.w, h: P.h, pages: P.pages })], `${n}.json`, { type: 'application/json' });
  expMsg(`Stránka ${cur + 1}…`);
  const c = renderPage(P, P.pages[cur], exportK());
  try {
    const b = await toBlob(c, kind === 'png' ? 'image/png' : 'image/jpeg', 0.92);
    return new File([b], `${pg}.${kind}`, { type: b.type });
  } finally { c.width = c.height = 0; }
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
let busy = false;
$('#exp').addEventListener('click', async e => {
  const b = e.target.closest('button[data-how]');
  if (!b || busy) return;
  busy = true; $('#exp').classList.add('busy'); $('#expshare').hidden = true; expMsg('Připravuji…');
  try {
    const file = await makeFile(b.closest('[data-kind]').dataset.kind);
    if (b.dataset.how === 'share' && navigator.canShare?.({ files: [file] })) await share(file);
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
