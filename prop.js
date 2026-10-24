/* Prop Hunt 3D: escóndete convertido en objeto */
Party.register({
  id: 'prop', name: 'Prop Hunt 3D', emoji: '📦', players: '3-10', min: 2, wide: true,
  desc: 'Escondite en 3D: los escondidos se convierten en cajas, plantas o lámparas… y los buscadores tienen que adivinar cuál no es de verdad',
  create(P) {
'use strict';

/* ---------- utilidades ---------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const app = $('#app');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = v => Math.round(v * 100) / 100;
const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
const toast = P.toast;
const isHost = P.isHost, myId = P.myId;
let players = P.players();
const room = P.room;
let screen = '', timers = [], viewToken = 0, viewCleanup = null, gameHook = null;
function clearTimers() { timers.forEach(t => { clearTimeout(t); clearInterval(t); }); timers = []; }
function show(name, html) {
  clearTimers();
  if (viewCleanup) { const c = viewCleanup; viewCleanup = null; try { c(); } catch (e) {} }
  gameHook = null; viewToken++; screen = name; app.innerHTML = html; window.scrollTo(0, 0);
}
function on(sel, ev, fn) { const el = typeof sel === 'string' ? $(sel) : sel; if (el) el.addEventListener(ev, fn); }
const send = (id, m) => P.send(id, m), broadcast = m => P.broadcast(m), toHost = m => P.toHost(m);
const pl = id => players.find(p => p.id === id) || room.players.find(p => p.id === id) || { name: '¿?', color: '#888' };
const nm = id => esc(pl(id).name);
const chip = id => `<b style="color:${pl(id).color}">${nm(id)}</b>`;
const fmtClock = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

let actx = null;
function audio() { try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) {} return actx; }
function tone(f, d = 0.15, type = 'sine', vol = 0.12, slide = 0) {
  const a = audio(); if (!a) return;
  try { const o = a.createOscillator(), g = a.createGain(), t = a.currentTime; o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + 0.02); } catch (e) {}
}
const SFX = {
  shot: () => tone(900, .12, 'square', .07, -700),
  miss: () => tone(160, .35, 'sawtooth', .1, -60),
  hit: () => [660, 880, 1100].forEach((f, i) => setTimeout(() => tone(f, .12, 'triangle', .12), i * 70)),
  taunt: () => [784, 988, 784].forEach((f, i) => setTimeout(() => tone(f, .1, 'sine', .1), i * 110)),
  tick: () => tone(700, .05, 'sine', .06),
  go: () => tone(990, .3, 'triangle', .14),
  win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, .22, 'triangle', .13), i * 110)),
};

/* ---------- mapa (casa con habitaciones) ---------- */
const MAP = { W: 40, D: 28 };
const WALLS = [
  [-6, -8.5, 0.5, 11, 2.4], [-6, 7.5, 0.5, 13, 2.4],
  [8, -10, 0.5, 8, 2.4], [8, 2, 0.5, 8, 2.4], [8, 12, 0.5, 4, 2.4],
  [-15, 2, 10, 0.5, 2.4], [16, -4, 8, 0.5, 2.4],
];
const SPAWN_S = { x: 1, z: 0 };
const TYPES = [
  { k: 'caja', n: 'Caja', r: 0.6 }, { k: 'cajag', n: 'Caja grande', r: 0.85 }, { k: 'barril', n: 'Barril', r: 0.5 },
  { k: 'planta', n: 'Planta', r: 0.45 }, { k: 'silla', n: 'Silla', r: 0.45 }, { k: 'lampara', n: 'Lámpara', r: 0.35 },
  { k: 'papelera', n: 'Papelera', r: 0.35 }, { k: 'sofa', n: 'Sillón', r: 0.75 },
];
function inWall(x, z, m = 0) {
  if (Math.abs(x) > MAP.W / 2 - m || Math.abs(z) > MAP.D / 2 - m) return true;
  for (const w of WALLS) if (Math.abs(x - w[0]) < w[2] / 2 + m && Math.abs(z - w[1]) < w[3] / 2 + m) return true;
  return false;
}
function genProps(seed) {
  const R = rng(seed), out = [];
  let guard = 0;
  while (out.length < 62 && guard++ < 4000) {
    const x = (R() - 0.5) * (MAP.W - 2), z = (R() - 0.5) * (MAP.D - 2);
    const t = Math.floor(R() * TYPES.length);
    if (inWall(x, z, TYPES[t].r + 0.4)) continue;
    if (Math.hypot(x - SPAWN_S.x, z - SPAWN_S.z) < 3.5) continue;
    if (out.some(p => Math.hypot(p.x - x, p.z - z) < TYPES[p.t].r + TYPES[t].r + 0.7)) continue;
    out.push({ x: r2(x), z: r2(z), t, ry: Math.round(R() * 24) * Math.PI / 12 });
  }
  return out;
}
function collide(p, r, props) {
  p.x = clamp(p.x, -MAP.W / 2 + r, MAP.W / 2 - r); p.z = clamp(p.z, -MAP.D / 2 + r, MAP.D / 2 - r);
  for (const w of WALLS) {
    const hx = w[2] / 2, hz = w[3] / 2, cx = clamp(p.x, w[0] - hx, w[0] + hx), cz = clamp(p.z, w[1] - hz, w[1] + hz);
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
    else { const ex = [w[0] + hx - p.x, p.x - (w[0] - hx), w[1] + hz - p.z, p.z - (w[1] - hz)], i = ex.indexOf(Math.min(...ex)); if (i === 0) p.x = w[0] + hx + r; else if (i === 1) p.x = w[0] - hx - r; else if (i === 2) p.z = w[1] + hz + r; else p.z = w[1] - hz - r; }
  }
  if (props) for (const q of props) {
    const rr = r + TYPES[q.t].r * 0.9, dx = p.x - q.x, dz = p.z - q.z, d = Math.hypot(dx, dz);
    if (d < rr && d > 1e-6) { p.x = q.x + dx / d * rr; p.z = q.z + dz / d * rr; }
  }
}
function hiderSpawn(R) {
  for (let k = 0; k < 200; k++) {
    const x = (R() - 0.5) * (MAP.W - 4), z = (R() - 0.5) * (MAP.D - 4);
    if (!inWall(x, z, 1) && Math.hypot(x - SPAWN_S.x, z - SPAWN_S.z) > 6) return { x, z };
  }
  return { x: -15, z: -10 };
}
const SHOT_R = 7, SHOT_A = 0.5;
function aimTarget(sx, sz, ry, cands) {
  let best = null, bd = 1e9;
  const fx = Math.sin(ry), fz = Math.cos(ry);
  for (const c of cands) {
    const dx = c.x - sx, dz = c.z - sz, d = Math.hypot(dx, dz);
    if (d > SHOT_R || d < 0.2) continue;
    const ang = Math.acos(clamp((dx * fx + dz * fz) / d, -1, 1));
    if (ang > SHOT_A) continue;
    const score = d + ang * 4;
    if (score < bd) { bd = score; best = c; }
  }
  return best;
}

/* =====================================================
   ANFITRIÓN
   ===================================================== */
let settings = { rounds: 3, dur: 3, infect: true };
let G = null;
function H(fn, ms) { const t = setTimeout(fn, ms); if (G) G.ht.push(t); return t; }
function hostBegin() {
  if (room.players.length < 2) { toast('Hacen falta al menos 2 jugadores'); return; }
  G = { round: 0, sought: {}, ht: [], stats: {} };
  room.players.forEach(p => { G.sought[p.id] = 0; G.stats[p.id] = { surv: 0, catch: 0, taunt: 0 }; });
  hostRound();
}
function hostRound() {
  clearInterval(G.tick); G.ht.forEach(clearTimeout); G.ht = [];
  G.round++;
  const ids = room.players.map(p => p.id), n = ids.length;
  const nS = n <= 4 ? 1 : n <= 7 ? 2 : 3;
  const seekers = shuffle(ids).sort((a, b) => (G.sought[a] || 0) - (G.sought[b] || 0)).slice(0, nS);
  seekers.forEach(id => G.sought[id] = (G.sought[id] || 0) + 1);
  const seed = Math.floor(Math.random() * 2e9), R = rng(seed + 7), now = Date.now();
  G.props = genProps(seed);
  G.seed = seed; G.hideMs = 25000; G.dur = settings.dur * 60000;
  G.t0 = now + 3000; G.seekAt = G.t0 + G.hideMs; G.endAt = G.seekAt + G.dur; G.nextTaunt = G.seekAt + 30000; G.over = false; G.events = [];
  G.ps = {};
  const spawns = {};
  ids.forEach((id, i) => {
    const sk = seekers.includes(id);
    const sp = sk ? { x: SPAWN_S.x + (i % 3 - 1) * 1.2, z: SPAWN_S.z + Math.floor(i / 3) * 1.2 } : hiderSpawn(R);
    G.ps[id] = { x: sp.x, z: sp.z, ry: 0, mv: 0, seeker: sk, orig: sk, prop: Math.floor(Math.random() * TYPES.length), stunUntil: 0, lastShot: 0, lastTaunt: 0, tauntUntil: 0, caughtAt: 0 };
    spawns[id] = [r2(sp.x), r2(sp.z), G.ps[id].prop];
  });
  broadcast({ t: 'start', seed, round: G.round, rounds: settings.rounds, seekers, spawns, cd: 3000, hide: G.hideMs, dur: G.dur, infect: settings.infect });
  G.tick = setInterval(hostTick, 66);
}
function hostTick() {
  if (!G || G.over) return;
  const now = Date.now(), ids = Object.keys(G.ps);
  if (now >= G.seekAt && now >= G.nextTaunt) {
    G.nextTaunt = now + 30000;
    const who = ids.filter(id => !G.ps[id].seeker);
    who.forEach(id => G.ps[id].tauntUntil = now + 2500);
    if (who.length) broadcast({ t: 'ev', k: 'taunt', who, forced: 1 });
  }
  const hiders = ids.filter(id => !G.ps[id].seeker);
  if (now >= G.seekAt && !hiders.length) return hostEndRound('caught');
  if (now >= G.endAt) return hostEndRound('time');
  const p = ids.map(id => {
    const s = G.ps[id]; let f = 0;
    if (s.seeker) f |= 1; if (s.orig) f |= 2; if (now < s.stunUntil) f |= 4; if (now < s.tauntUntil) f |= 8;
    return [id, r2(s.x), r2(s.z), r2(s.ry), f, s.prop, s.mv];
  });
  const phase = now < G.t0 ? 'cd' : now < G.seekAt ? 'hide' : 'seek';
  broadcast({ t: 's', p, phase, left: phase === 'hide' ? G.seekAt - now : Math.max(0, G.endAt - now), hiders: hiders.length });
}
function hostHandle(id, m) {
  if (!G || G.over || !G.ps[id]) return;
  const s = G.ps[id], now = Date.now();
  if (m.t === 'm') {
    if (s.seeker && now < G.seekAt) return;
    s.x = clamp(+m.x || 0, -20, 20); s.z = clamp(+m.z || 0, -14, 14); s.ry = +m.ry || 0; s.mv = m.mv ? 1 : 0;
  } else if (m.t === 'prop') {
    if (s.seeker) return;
    s.prop = ((+m.prop || 0) % TYPES.length + TYPES.length) % TYPES.length;
  } else if (m.t === 'taunt') {
    if (s.seeker || now < G.seekAt || now - s.lastTaunt < 10000) return;
    s.lastTaunt = now; s.tauntUntil = now + 2500; G.stats[id].taunt++;
    broadcast({ t: 'ev', k: 'taunt', who: [id] });
  } else if (m.t === 'shoot') {
    if (!s.seeker || now < G.seekAt || now < s.stunUntil || now - s.lastShot < 700) return;
    s.lastShot = now;
    const ry = +m.ry || s.ry;
    const cands = [
      ...Object.keys(G.ps).filter(h => !G.ps[h].seeker).map(h => ({ x: G.ps[h].x, z: G.ps[h].z, hider: h })),
      ...G.props.map((q, i) => ({ x: q.x, z: q.z, prop: i })),
    ];
    const tg = aimTarget(s.x, s.z, ry, cands);
    const x1 = tg ? tg.x : s.x + Math.sin(ry) * SHOT_R, z1 = tg ? tg.z : s.z + Math.cos(ry) * SHOT_R;
    if (tg && tg.hider) {
      const h = G.ps[tg.hider];
      G.stats[id].catch++;
      if (settings.infect) { h.seeker = true; h.stunUntil = now + 2000; } else { h.seeker = true; h.out = true; }
      h.caughtAt = now;
      broadcast({ t: 'ev', k: 'caught', who: tg.hider, by: id, x0: r2(s.x), z0: r2(s.z), x1: r2(x1), z1: r2(z1) });
    } else if (tg) {
      s.stunUntil = now + 3000;
      broadcast({ t: 'ev', k: 'wrong', by: id, prop: tg.prop, x0: r2(s.x), z0: r2(s.z), x1: r2(x1), z1: r2(z1) });
    } else broadcast({ t: 'ev', k: 'shot', by: id, x0: r2(s.x), z0: r2(s.z), x1: r2(x1), z1: r2(z1) });
  }
}
function hostEndRound(reason) {
  if (!G || G.over) return;
  G.over = true; clearInterval(G.tick);
  const surv = Object.keys(G.ps).filter(id => !G.ps[id].seeker);
  const res = room.players.filter(p => G.ps[p.id]).map(p => {
    const st = G.stats[p.id], s = G.ps[p.id];
    const survived = surv.includes(p.id);
    if (survived) st.surv++;
    const pts = (survived ? 4 : 0) + (G.roundCatch ? 0 : 0);
    return { id: p.id, orig: s.orig, survived, caughtAt: s.caughtAt };
  });
  // puntos de la ronda: supervivientes +4, cada captura +2, cada ruido voluntario +1
  room.players.forEach(p => {
    const st = G.stats[p.id]; if (!st) return;
    const prev = st.given || { surv: 0, catch: 0, taunt: 0 };
    const add = (st.surv - prev.surv) * 4 + (st.catch - prev.catch) * 2 + (st.taunt - prev.taunt) * 1;
    p.score += add; st.given = { surv: st.surv, catch: st.catch, taunt: st.taunt }; st.lastAdd = add;
  });
  P.broadcastPlayers();
  const last = G.round >= settings.rounds;
  broadcast({ t: 'rend', reason, surv, res, round: G.round, rounds: settings.rounds, last,
    stats: room.players.filter(p => G.stats[p.id]).map(p => ({ id: p.id, ...G.stats[p.id], add: G.stats[p.id].lastAdd || 0 })) });
  if (!last) H(hostRound, 9000);
}
function hostLeave(id) { if (G && G.ps && G.ps[id]) delete G.ps[id]; }

/* =====================================================
   VISTAS
   ===================================================== */
function renderSetup() {
  show('setup', `<div class="night-bg" style="background:radial-gradient(800px 500px at 50% -100px,#4a3a1d 0%,#121016 70%)"></div>
    <div class="hubtop"><h1>📦 Prop <span>Hunt</span></h1><div class="codechip"><b>${esc(P.code)}</b></div></div>
    <div class="card"><h3 style="margin-bottom:6px">${players.length} jugadores</h3>
      <div style="font-weight:700">🔦 ${players.length <= 4 ? 1 : players.length <= 7 ? 2 : 3} buscador${players.length <= 4 ? '' : 'es'} por ronda · 📦 el resto se esconde</div></div>
    ${isHost ? `<div class="card"><div class="row">
      <div><label class="lbl" style="margin-top:0">Rondas</label><select id="rounds">${[1, 2, 3, 4, 5].map(v => `<option value="${v}"${settings.rounds === v ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
      <div><label class="lbl" style="margin-top:0">Duración de búsqueda</label><select id="dur">${[2, 3, 4, 5].map(v => `<option value="${v}"${settings.dur === v ? ' selected' : ''}>${v} min</option>`).join('')}</select></div></div>
      <label class="roletog" style="display:block;margin-top:10px"><label><input type="checkbox" id="infect"${settings.infect ? ' checked' : ''}>🧟 Los pillados se convierten en buscadores</label></label></div>
      <button class="btn go" id="go">📦 Empezar</button>${P.homeButton()}` : '<div class="card" style="text-align:center"><b>Esperando al anfitrión…</b></div>'}
    <div class="card"><h3 style="margin-bottom:8px">Cómo se juega</h3><ul class="rules">
      <li><b>📦 Escondidos:</b> sois un objeto. Usa <b>🔄 Objeto</b> para cambiar (caja, barril, planta, silla, lámpara…) y colócate donde no desentones. ¡Moverse delata!</li>
      <li>Tenéis <b>25 segundos</b> para esconderos mientras los buscadores no ven nada.</li>
      <li><b>🔦 Buscadores:</b> el objeto que tienes delante se marca con un aro. <b>🎯 Disparar</b>: si es un escondido, lo pillas; si es un objeto de verdad, quedas aturdido 3 s.</li>
      <li>Cada 30 s todos los escondidos hacen <b>🎵 un ruido</b> obligatorio. Hacer ruido a propósito da <b>+1 punto</b>.</li>
      <li>Puntos: sobrevivir a la ronda <b>+4</b>, cada pillada <b>+2</b>.</li>
    </ul></div>`);
  if (isHost) {
    on('#rounds', 'change', e => { settings.rounds = +e.target.value; sync(); });
    on('#dur', 'change', e => { settings.dur = +e.target.value; sync(); });
    on('#infect', 'change', e => { settings.infect = e.target.checked; sync(); });
    on('#go', 'click', () => { audio(); if (!window.THREE) { toast('Cargando el 3D… pulsa otra vez en un momento'); P.need3D(); return; } hostBegin(); });
    P.bindHome();
  }
}
function sync() { broadcast({ t: 'set', settings }); }

/* ---------- 3D ---------- */
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t; }
function labelSprite(text, color) {
  const tex = canvasTex(256, 64, (g, w, h) => { g.font = '700 32px Rubik,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; const tw = Math.min(w - 8, g.measureText(text).width + 26); g.fillStyle = 'rgba(15,12,28,.75)'; g.beginPath(); if (g.roundRect) g.roundRect((w - tw) / 2, 8, tw, h - 16, 18); else g.rect((w - tw) / 2, 8, tw, h - 16); g.fill(); g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 1); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })); s.scale.set(2.6, 0.65, 1); s.renderOrder = 10; return s;
}
function iconSprite(emoji, size = 1.2) {
  const tex = canvasTex(128, 128, (g, w, h) => { g.font = '96px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(emoji, w / 2, h / 2 + 6); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })); s.scale.set(size, size, 1); s.renderOrder = 11; return s;
}
const MATS = {};
function mat(c) { return MATS[c] || (MATS[c] = new THREE.MeshLambertMaterial({ color: c })); }
function propMesh(t) {
  const g = new THREE.Group(), k = TYPES[t].k;
  const add = (geo, c, y, x = 0, z = 0) => { const m = new THREE.Mesh(geo, mat(c)); m.position.set(x, y, z); g.add(m); return m; };
  if (k === 'caja') { add(new THREE.BoxGeometry(1, 1, 1), '#b07a3c', 0.5); add(new THREE.BoxGeometry(1.02, 0.12, 1.02), '#8a5a28', 0.5); }
  else if (k === 'cajag') { add(new THREE.BoxGeometry(1.5, 1.3, 1.5), '#c08a4a', 0.65); add(new THREE.BoxGeometry(1.52, 0.14, 1.52), '#8a5a28', 0.9); }
  else if (k === 'barril') { add(new THREE.CylinderGeometry(0.48, 0.48, 1.2, 16), '#7a4a2a', 0.6); add(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 16), '#444', 0.3); add(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 16), '#444', 0.9); }
  else if (k === 'planta') { add(new THREE.CylinderGeometry(0.35, 0.28, 0.5, 12), '#c0603a', 0.25); add(new THREE.SphereGeometry(0.5, 12, 10), '#3a9a4a', 0.95); add(new THREE.SphereGeometry(0.32, 10, 8), '#4ab05a', 1.35, 0.15, 0.1); }
  else if (k === 'silla') { add(new THREE.BoxGeometry(0.8, 0.12, 0.8), '#6a4aa0', 0.55); add(new THREE.BoxGeometry(0.8, 0.8, 0.12), '#6a4aa0', 0.95, 0, -0.34); [[-.32, -.32], [.32, -.32], [-.32, .32], [.32, .32]].forEach(([x, z]) => add(new THREE.BoxGeometry(0.1, 0.55, 0.1), '#3a2a5a', 0.27, x, z)); }
  else if (k === 'lampara') { add(new THREE.CylinderGeometry(0.3, 0.35, 0.08, 14), '#333', 0.04); add(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 8), '#555', 0.85); add(new THREE.ConeGeometry(0.42, 0.5, 14, 1, true), '#ffe0a0', 1.7); }
  else if (k === 'papelera') { add(new THREE.CylinderGeometry(0.34, 0.26, 0.75, 14), '#5a6a7a', 0.38); }
  else if (k === 'sofa') { add(new THREE.BoxGeometry(1.5, 0.5, 0.9), '#a03a4a', 0.35); add(new THREE.BoxGeometry(1.5, 0.6, 0.25), '#a03a4a', 0.8, 0, -0.33); add(new THREE.BoxGeometry(0.22, 0.4, 0.9), '#8a2a3a', 0.75, -0.7); add(new THREE.BoxGeometry(0.22, 0.4, 0.9), '#8a2a3a', 0.75, 0.7); }
  return g;
}
function seekerMesh(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.48, 0.9, 14), mat('#2a3a6a')); body.position.y = 0.55; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 12), mat('#f0c8a0')); head.position.y = 1.28; g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.16, 14), mat(color)); cap.position.y = 1.55; g.add(cap);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.25), mat(color)); visor.position.set(0, 1.5, 0.3); g.add(visor);
  [-0.13, 0.13].forEach(x => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat('#111')); e.position.set(x, 1.32, 0.32); g.add(e); });
  const torch = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.45, 8), mat('#ffcc33')); torch.rotation.x = Math.PI / 2; torch.position.set(0.35, 0.9, 0.35); g.add(torch);
  return g;
}

function playRound(m) {
  if (!window.THREE) {
    show('wait', `<div class="mid"><div class="spin"></div><div class="title">Cargando el 3D…</div></div>`);
    const tk = viewToken; P.need3D().then(ok => { if (tk === viewToken && ok) playRound(m); });
    return;
  }
  const iSeek0 = m.seekers.includes(myId);
  show('game', `<div class="arena3d" id="game">
    <div id="gl"></div><div class="vign" id="vign"></div>
    <div class="hud-top"><div class="sb"><span class="r" id="hl" style="background:#7a5a2a">📦 ${Object.keys(m.spawns).length - m.seekers.length}</span><span class="tm" id="tm">0:25</span><span class="b" style="background:#2a3a6a">🔦 ${m.seekers.length}</span></div>
      <div class="round">Ronda ${m.round}/${m.rounds}</div></div>
    <canvas class="mm" id="mm" style="top:calc(max(10px,env(safe-area-inset-top)) + 70px)"></canvas>
    <div class="feed" id="feed"></div>
    <div class="acenter" id="cd"></div>
    <div class="status" id="status"></div>
    <div class="ahint" id="hint">Arrastra para moverte</div>
    <button class="dash" id="act"><span id="actl"></span></button>
    <button class="smokebtn" id="act2" style="display:none"><span id="act2l"></span></button>
    <div class="blind" id="blind"><div><div style="font-size:60px">🙈</div><div class="title">Cuenta hasta 25…</div><div class="sub">Los escondidos se están escondiendo</div><div class="title" id="blindt" style="color:var(--acc);font-size:54px"></div></div></div>
    <div class="joy" id="joy"><i></i></div>
  </div>`);
  const tok = viewToken;
  const props = genProps(m.seed);
  /* escena */
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
  $('#gl').appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#15121c'); scene.fog = new THREE.Fog('#15121c', 22, 48);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 150);
  let camBack = 7, camH = 13;
  function resize() { const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); const portrait = w < h; camBack = portrait ? 8 : 6; camH = portrait ? 14 : 10; }
  resize(); window.addEventListener('resize', resize);
  scene.add(new THREE.HemisphereLight('#fff2dd', '#3a2a20', 0.9));
  const sun = new THREE.DirectionalLight('#ffffff', 0.55); sun.position.set(-6, 14, 8); scene.add(sun);
  const floorTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#7a5434'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) { g.fillStyle = (y / 32) % 2 ? '#835b39' : '#6f4c2f'; g.fillRect(0, y, w, 30); for (let x = ((y / 32) % 2) * 60; x < w; x += 120) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, y, 2, 30); } }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(5, 3.5);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(MAP.W, MAP.D), new THREE.MeshLambertMaterial({ map: floorTex })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const wallM = [mat('#d8c8a8'), mat('#d8c8a8'), mat('#f4ead8'), mat('#d8c8a8'), mat('#d8c8a8'), mat('#d8c8a8')];
  const addWall = (x, z, w, d, h) => { const m2 = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallM); m2.position.set(x, h / 2, z); scene.add(m2); };
  WALLS.forEach(w => addWall(w[0], w[1], w[2], w[3], w[4]));
  addWall(0, -MAP.D / 2 - 0.25, MAP.W + 1, 0.5, 1.4); addWall(0, MAP.D / 2 + 0.25, MAP.W + 1, 0.5, 1.4);
  addWall(-MAP.W / 2 - 0.25, 0, 0.5, MAP.D, 1.4); addWall(MAP.W / 2 + 0.25, 0, 0.5, MAP.D, 1.4);
  const rug = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32), new THREE.MeshBasicMaterial({ color: '#2a3a6a', transparent: true, opacity: 0.6 })); rug.rotation.x = -Math.PI / 2; rug.position.set(SPAWN_S.x, 0.02, SPAWN_S.z); scene.add(rug);
  props.forEach(q => { const g = propMesh(q.t); g.position.set(q.x, 0, q.z); g.rotation.y = q.ry; scene.add(g); q.mesh = g; });
  // aro de puntería
  const aim = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 28), new THREE.MeshBasicMaterial({ color: '#ff4d5e', transparent: true, opacity: 0.85, depthWrite: false }));
  aim.rotation.x = -Math.PI / 2; aim.position.y = 0.05; aim.visible = false; scene.add(aim);

  /* jugadores */
  const chars = new Map();
  function makeAvatar(id) {
    const c = chars.get(id);
    if (c.g) scene.remove(c.g);
    const g = new THREE.Group();
    if (c.seeker) { g.add(seekerMesh(pl(id).color)); }
    else { const pm = propMesh(c.prop); g.add(pm); c.pm = pm; }
    const showLabel = c.seeker || id === myId || !iAmSeeker();
    if (showLabel) { const lb = labelSprite(pl(id).name + (id === myId ? ' (tú)' : ''), id === myId ? '#ffcc33' : c.seeker ? '#ff9aa4' : '#ffffff'); lb.position.y = 2.6; g.add(lb); }
    if (id === myId) { const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 28), new THREE.MeshBasicMaterial({ color: '#ffcc33', transparent: true, opacity: 0.7, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring); }
    const note = iconSprite('🎵', 1.1); note.position.y = 2.2; note.visible = false; g.add(note); c.note = note;
    const stars = iconSprite('💫', 0.9); stars.position.y = 2.1; stars.visible = false; g.add(stars); c.stars = stars;
    g.position.set(c.x, 0, c.z); g.rotation.y = c.ry;
    scene.add(g); c.g = g; c.built = c.seeker + ':' + c.prop;
  }
  Object.entries(m.spawns).forEach(([id, s]) => chars.set(id, { x: s[0], z: s[1], ry: 0, prop: s[2], seeker: m.seekers.includes(id), f: 0, t: null, mv: 0 }));
  const meC = () => chars.get(myId);
  const iAmSeeker = () => !!(meC() && meC().seeker);
  chars.forEach((c, id) => makeAvatar(id));
  const st = { x: meC() ? meC().x : 0, z: meC() ? meC().z : 0, ry: 0, vx: 0, vz: 0, prop: meC() ? meC().prop : 0 };
  const camPos = new THREE.Vector3(st.x, camH, st.z + camBack);
  let phase = 'cd', left = m.hide, hidersLeft = 0, myFlags = iSeek0 ? 3 : 0, lastShotLocal = 0, lastTauntLocal = -1e9;

  /* controles */
  const gameEl = $('#game'), joy = $('#joy'), act = $('#act'), act2 = $('#act2');
  let touch = null;
  gameEl.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    e.preventDefault(); audio(); if (touch) return;
    touch = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
    joy.style.left = e.clientX + 'px'; joy.style.top = e.clientY + 'px'; joy.classList.add('on'); joy.firstChild.style.transform = 'translate(-50%,-50%)';
    $('#hint').style.display = 'none';
  });
  gameEl.addEventListener('pointermove', e => {
    if (!touch || e.pointerId !== touch.id) return;
    let dx = e.clientX - touch.ox, dy = e.clientY - touch.oy; const L = Math.hypot(dx, dy), mx = 55;
    if (L > mx) { dx *= mx / L; dy *= mx / L; }
    touch.x = dx / mx; touch.y = -dy / mx;
    joy.firstChild.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  });
  const endTouch = e => { if (touch && e.pointerId === touch.id) { touch = null; joy.classList.remove('on'); } };
  gameEl.addEventListener('pointerup', endTouch); gameEl.addEventListener('pointercancel', endTouch);
  const keys = {};
  const kd = e => { keys[e.key.toLowerCase()] = true; if (e.key === ' ') primary(); if (e.key.toLowerCase() === 'e') secondary(); }, ku = e => { keys[e.key.toLowerCase()] = false; };
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  function input() {
    if (touch) return { x: touch.x, y: touch.y };
    let x = (keys.arrowright || keys.d ? 1 : 0) - (keys.arrowleft || keys.a ? 1 : 0), y = (keys.arrowup || keys.w ? 1 : 0) - (keys.arrowdown || keys.s ? 1 : 0);
    const L = Math.hypot(x, y); if (L > 1) { x /= L; y /= L; } return { x, y };
  }
  function primary() {
    const now = performance.now();
    if (iAmSeeker()) {
      if (phase !== 'seek' || (myFlags & 4) || now - lastShotLocal < 750) return;
      lastShotLocal = now; toHost({ t: 'shoot', ry: r2(st.ry) }); SFX.shot(); buzz(20);
    } else {
      st.prop = (st.prop + 1) % TYPES.length; toHost({ t: 'prop', prop: st.prop }); buzz(10);
      const c = meC(); if (c) { c.prop = st.prop; makeAvatar(myId); }
      say(`🔄 Ahora eres: <b>${TYPES[st.prop].n}</b>`, false, 1200);
    }
  }
  function secondary() {
    const now = performance.now();
    if (iAmSeeker() || phase !== 'seek' || now - lastTauntLocal < 10000) return;
    lastTauntLocal = now; toHost({ t: 'taunt' }); buzz(15);
  }
  act.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); audio(); primary(); });
  act2.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); audio(); secondary(); });
  function setButtons() {
    if (iAmSeeker()) { $('#actl').innerHTML = '<b>🎯</b>Disparar'; act2.style.display = 'none'; }
    else { $('#actl').innerHTML = '<b>🔄</b>Objeto'; act2.style.display = 'block'; $('#act2l').innerHTML = '<b>🎵</b>Ruido'; }
  }
  setButtons();

  /* HUD */
  const feed = $('#feed'), statusEl = $('#status'), cdEl = $('#cd'), vign = $('#vign'), blind = $('#blind');
  function say(html, big, ms = 2600) { const d = document.createElement('div'); d.innerHTML = html; if (big) d.className = 'big'; feed.appendChild(d); while (feed.children.length > 3) feed.firstChild.remove(); setTimeout(() => d.remove(), ms); }
  const fx = [];
  function laser(x0, z0, x1, z1, col) {
    const len = Math.hypot(x1 - x0, z1 - z0) || 0.1;
    const m2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, len), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9 }));
    m2.position.set((x0 + x1) / 2, 0.9, (z0 + z1) / 2); m2.rotation.y = Math.atan2(x1 - x0, z1 - z0); scene.add(m2);
    fx.push({ m: m2, t0: performance.now(), dur: 350 });
  }
  gameHook = msg => {
    if (msg.t === 's') {
      const prevPhase = phase;
      phase = msg.phase; left = msg.left; hidersLeft = msg.hiders;
      msg.p.forEach(([id, x, z, ry, f, prop, mv]) => {
        let c = chars.get(id);
        if (!c) { chars.set(id, { x, z, ry, prop, seeker: !!(f & 1), f, t: null, mv }); makeAvatar(id); c = chars.get(id); }
        c.f = f; c.mv = mv;
        const nowSeeker = !!(f & 1);
        if (id !== myId) { c.t = { x, z }; c.ry = ry; c.prop = prop; }
        if (nowSeeker !== c.seeker || (id !== myId && !c.seeker && c.built !== c.seeker + ':' + prop)) {
          const becameSeeker = nowSeeker && !c.seeker;
          c.seeker = nowSeeker; if (id !== myId) c.prop = prop;
          makeAvatar(id);
          if (id === myId && becameSeeker) { setButtons(); chars.forEach((cc, i2) => { if (!cc.seeker) makeAvatar(i2); }); }
        }
        if (id === myId) myFlags = f;
      });
      if (prevPhase !== 'seek' && phase === 'seek') { SFX.go(); say(iAmSeeker() ? '🔦 ¡A buscar!' : '🔦 ¡Los buscadores salen!', true); buzz(80); }
    } else if (msg.t === 'ev') {
      if (msg.k === 'taunt') {
        msg.who.forEach(id => { const c = chars.get(id); if (c && c.note) c.note.visible = true; });
        SFX.taunt();
        if (msg.forced) say(iAmSeeker() ? '🎵 ¡Los escondidos han hecho ruido! Mira bien…' : '🎵 ¡Ruido obligatorio! Te has delatado un momento');
        else if (msg.who.includes(myId)) say('🎵 ¡Ruido! +1 punto');
        else if (iAmSeeker()) say('🎵 ¡Se ha oído algo!');
      } else if (msg.k === 'caught') {
        laser(msg.x0, msg.z0, msg.x1, msg.z1, '#3ddc84'); SFX.hit();
        if (msg.who === myId) { say(`😱 ¡${chip(msg.by)} te ha pillado!${m.infect ? ' Ahora eres buscador' : ''}`, true, 3500); buzz([150, 60, 150]); vign.classList.add('on'); setTimeout(() => vign.classList.remove('on'), 600); }
        else if (msg.by === myId) { say(`🎯 ¡Has pillado a ${chip(msg.who)}! +2`, true); buzz(60); }
        else say(`🎯 ${chip(msg.by)} ha pillado a ${chip(msg.who)}`);
      } else if (msg.k === 'wrong') {
        laser(msg.x0, msg.z0, msg.x1, msg.z1, '#ff4d5e');
        const q = props[msg.prop]; if (q && q.mesh) { q.mesh.position.y = 0.25; setTimeout(() => { if (q.mesh) q.mesh.position.y = 0; }, 200); }
        if (msg.by === myId) { say('😵 ¡Era un objeto de verdad! Aturdido 3 s'); SFX.miss(); buzz([100, 50, 100]); }
      } else if (msg.k === 'shot') { laser(msg.x0, msg.z0, msg.x1, msg.z1, '#ffcc33'); }
    }
  };

  /* minimapa */
  const mm = $('#mm'), mctx = mm.getContext('2d');
  const MS = 2.4, mmW = MAP.W * MS, mmH = MAP.D * MS, mdpr = Math.min(2, window.devicePixelRatio || 1);
  mm.width = mmW * mdpr; mm.height = mmH * mdpr; mm.style.width = mmW + 'px'; mm.style.height = mmH + 'px'; mctx.setTransform(mdpr, 0, 0, mdpr, 0, 0);
  const toMM = (x, z) => [mmW / 2 + x * MS, mmH / 2 + z * MS];
  function drawMM() {
    mctx.clearRect(0, 0, mmW, mmH);
    mctx.fillStyle = 'rgba(220,200,170,.8)';
    WALLS.forEach(w => { const [a, b] = toMM(w[0] - w[2] / 2, w[1] - w[3] / 2); mctx.fillRect(a, b, w[2] * MS, w[3] * MS); });
    const seek = iAmSeeker();
    chars.forEach((c, id) => {
      if (seek && !c.seeker && !(c.f & 8)) return;
      const [x, y] = toMM(c.g.position.x, c.g.position.z);
      mctx.fillStyle = c.seeker ? '#ff6b7a' : '#ffcc33'; mctx.beginPath(); mctx.arc(x, y, id === myId ? 3.5 : 2.6, 0, 7); mctx.fill();
      if (id === myId) { mctx.strokeStyle = '#fff'; mctx.lineWidth = 1.5; mctx.stroke(); }
    });
  }

  /* bucle */
  let last = performance.now(), lastSend = 0, cdLast = '', t0 = performance.now(), blindLast = '';
  const SP_H = 5.4, SP_S = 6.6;
  function loop() {
    if (tok !== viewToken) return;
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    const time = (now - t0) / 1000;
    const seek = iAmSeeker(), stunned = !!(myFlags & 4);
    const blindNow = seek && phase === 'hide' && !!(myFlags & 2);
    blind.classList.toggle('on', blindNow && (meC() && (meC().f & 2)));
    if (blindNow) { const s = String(Math.ceil(left / 1000)); if (s !== blindLast) { blindLast = s; $('#blindt').textContent = s; SFX.tick(); } }
    if (phase === 'cd') { if (cdLast !== 'cd') { cdLast = 'cd'; cdEl.innerHTML = `<div class="big">${seek ? '🔦' : '📦'}</div><div class="small">${seek ? 'Eres BUSCADOR' : 'Eres un OBJETO: ¡escóndete!'}</div>`; } }
    else if (cdLast === 'cd') { cdLast = phase; cdEl.innerHTML = ''; }
    const canMove = phase !== 'cd' && !stunned && !(seek && phase === 'hide');
    const inp = canMove ? input() : { x: 0, y: 0 };
    const mvx = inp.x, mvz = -inp.y, spd = seek ? SP_S : SP_H;
    const k = Math.min(1, dt * 14); st.vx += (mvx * spd - st.vx) * k; st.vz += (mvz * spd - st.vz) * k;
    st.x += st.vx * dt; st.z += st.vz * dt;
    collide(st, seek ? 0.45 : TYPES[st.prop].r * 0.8, props);
    const moving = Math.hypot(mvx, mvz) > 0.15;
    if (moving) { const tgt = Math.atan2(mvx, mvz); let d = tgt - st.ry; d = Math.atan2(Math.sin(d), Math.cos(d)); st.ry += d * Math.min(1, dt * 12); }
    const me = meC();
    if (me && me.g) { me.g.position.set(st.x, 0, st.z); me.g.rotation.y = st.ry; me.x = st.x; me.z = st.z; }
    if (now - lastSend > 66) { lastSend = now; toHost({ t: 'm', x: r2(st.x), z: r2(st.z), ry: r2(st.ry), mv: moving ? 1 : 0 }); }
    chars.forEach((c, id) => {
      if (!c.g) return;
      if (id !== myId && c.t) {
        const kk = Math.min(1, dt * 14);
        c.g.position.x += (c.t.x - c.g.position.x) * kk; c.g.position.z += (c.t.z - c.g.position.z) * kk;
        let d = c.ry - c.g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); c.g.rotation.y += d * kk;
      }
      if (c.note) c.note.visible = !!(c.f & 8);
      if (c.stars) c.stars.visible = !!(c.f & 4);
      if (c.seeker && c.g.children[0]) c.g.children[0].position.y = c.mv ? Math.abs(Math.sin(time * 12)) * 0.12 : 0;
    });
    // puntería
    if (seek && phase === 'seek') {
      const cands = [...props.map(q => ({ x: q.x, z: q.z })), ...[...chars.entries()].filter(([id, c]) => !c.seeker).map(([id, c]) => ({ x: c.g.position.x, z: c.g.position.z }))];
      const tg = aimTarget(st.x, st.z, st.ry, cands);
      aim.visible = !!tg; if (tg) aim.position.set(tg.x, 0.05, tg.z);
    } else aim.visible = false;
    for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i], kf = (now - f.t0) / f.dur; f.m.material.opacity = 0.9 * (1 - kf); if (kf >= 1) { scene.remove(f.m); fx.splice(i, 1); } }
    // HUD
    $('#tm').textContent = fmtClock(left);
    $('#hl').textContent = '📦 ' + hidersLeft;
    let stTxt = '', bad = false;
    if (stunned && seek) { stTxt = '😵 Aturdido…'; bad = true; }
    else if (!seek && phase === 'hide') stTxt = '📦 ¡Escóndete! Cambia de objeto con 🔄';
    else if (!seek && phase === 'seek' && moving) { stTxt = '👀 Moverte te delata'; bad = true; }
    else if (!seek && phase === 'seek') stTxt = `Eres: ${TYPES[st.prop].n}`;
    statusEl.textContent = stTxt; statusEl.classList.toggle('on', !!stTxt); statusEl.classList.toggle('bad', bad);
    act.style.setProperty('--cd', seek ? Math.min(1, (now - lastShotLocal) / 750) : 1);
    act2.style.setProperty('--cd', Math.min(1, (now - lastTauntLocal) / 10000));
    // cámara
    const want = new THREE.Vector3(st.x, camH, st.z + camBack);
    camPos.lerp(want, Math.min(1, dt * 8)); camera.position.copy(camPos); camera.lookAt(camPos.x, 0, camPos.z - camBack + 0.5);
    drawMM();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  if (location.hash === '#debug') window.__P = { st, chars, props, get phase() { return phase; }, primary, secondary, get flags() { return myFlags; } };
  viewCleanup = () => { window.removeEventListener('resize', resize); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); try { renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss(); } catch (e) {} };
}

function renderRoundEnd(m) {
  const hidersWin = m.surv.length > 0;
  const rows = m.stats.slice().sort((a, b) => b.add - a.add);
  show('rend', `<div class="night-bg" style="background:radial-gradient(800px 500px at 50% -100px,#4a3a1d 0%,#121016 70%)"></div>
    <div class="mid" style="flex:none;margin-top:16px"><div style="font-size:64px">${hidersWin ? '📦' : '🔦'}</div>
    <div class="title">${hidersWin ? '¡Los escondidos aguantan!' : '¡Todos pillados!'}</div>
    <div class="sub">Ronda ${m.round} de ${m.rounds} · ${hidersWin ? `Sobreviven: ${m.surv.map(chip).join(', ')}` : 'Los buscadores ganan la ronda'}</div></div>
    <div class="card"><table class="stats"><tr><th>Jugador</th><th title="Rondas sobrevividas">📦</th><th title="Pilladas">🎯</th><th title="Ruidos">🎵</th><th>Ronda</th></tr>
      ${rows.map(s => `<tr><td><span class="nm"><span class="hat" style="background:${pl(s.id).color}"></span>${nm(s.id)}</span></td><td>${s.surv}</td><td>${s.catch}</td><td>${s.taunt}</td><td style="color:var(--ok)">+${s.add}</td></tr>`).join('')}</table></div>
    ${m.last ? `<div class="sub">¡Fin de la partida!</div>${isHost ? '<button class="btn go" id="again">🔁 Otra partida</button>' : ''}${P.homeButton()}` : '<div class="sub">Siguiente ronda en unos segundos… cambian los buscadores</div>'}`);
  if (hidersWin === !m.res.find(r => r.id === myId)?.orig) { SFX.win(); buzz([50, 50, 150]); }
  on('#again', 'click', () => broadcast({ t: 'setup' }));
  P.bindHome();
}

function onMsg(m) {
  switch (m.t) {
    case 'set': settings = m.settings; if (screen === 'setup') renderSetup(); break;
    case 'setup': if (G) { clearInterval(G.tick); G.ht.forEach(clearTimeout); } G = null; renderSetup(); break;
    case 'start': playRound(m); break;
    case 's': case 'ev': if (gameHook) gameHook(m); break;
    case 'rend': renderRoundEnd(m); break;
  }
}

if (location.hash === '#debug') window.__G = () => G;
return {
  open() { if (isHost) { sync(); setTimeout(() => P.need3D(), 200); } renderSetup(); },
  onMsg,
  onHost: (id, m) => hostHandle(id, m),
  onPlayers(list) { players = list; if (screen === 'setup') renderSetup(); },
  onLeave: hostLeave,
  destroy() { clearTimers(); if (viewCleanup) { const c = viewCleanup; viewCleanup = null; try { c(); } catch (e) {} } viewToken++; gameHook = null; if (G) { clearInterval(G.tick); G.ht.forEach(clearTimeout); G.over = true; G = null; } },
};
  }
});
