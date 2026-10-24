/* Minijuegos: reflejos, toque loco, ranking, colores, diana, cronómetro, carrera 3D e impostor */
Party.register({
  id: 'mini', name: 'Minijuegos', emoji: '🎮', players: '2-10', wide: true,
  desc: 'Reflejos, diana, «¿Quién es más…?», colores, cronómetro, impostor y carrera de bolas 3D',
  create(P) {
'use strict';
/* ---------- utilidades ---------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const app = $('#app');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

const PREFIX = 'fiestap2p-v1-';
const COLORS = ['#ffcc33','#ff4f8b','#3ddc84','#4d9bff','#b46bff','#ff9a3c','#2ee6d6','#ff6b6b','#c6f432','#f7a8ff'];
const MAX_PLAYERS = 10;

let isHost = P.isHost, myId = P.myId, myName = P.myName, code = P.code;
let players = P.players();
let screen = '';
let timers = [];        // temporizadores de pantalla
let toastT = null;

function clearTimers() { timers.forEach(t => { clearTimeout(t); clearInterval(t); }); timers = []; }
function later(fn, ms) { const t = setTimeout(fn, ms); timers.push(t); return t; }
function every(fn, ms) { const t = setInterval(fn, ms); timers.push(t); return t; }
let viewToken = 0, viewCleanup = null, netHook = null;
function show(name, html) { clearTimers(); if (viewCleanup) { const c = viewCleanup; viewCleanup = null; try { c(); } catch (e) {} } viewToken++; screen = name; app.innerHTML = html; window.scrollTo(0, 0); }
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); }
function on(sel, ev, fn) { const el = typeof sel === 'string' ? $(sel) : sel; if (el) el.addEventListener(ev, fn); }

/* pantalla siempre encendida */

/* ---------- datos de juegos ---------- */
const GAMES = {
  reflex: { name: 'Reflejos', emoji: '⚡', desc: 'Toca en cuanto se ponga verde', rounds: 3,
    make: () => ({ delay: Math.round(1500 + Math.random() * 3500) }),
    timeout: d => d.delay + 4500, order: 'asc',
    valid: v => typeof v === 'number' && v >= 0, key: v => v,
    penalty: v => (v === -1 ? -1 : 0),
    fmt: v => v == null ? 'sin tocar' : v < 0 ? '¡se adelantó!' : v + ' ms' },
  taps: { name: 'Toque loco', emoji: '👆', desc: 'Más toques en 10 segundos', rounds: 2,
    make: () => ({ dur: 10000 }), timeout: () => 16500, order: 'desc',
    valid: v => typeof v === 'number' && v > 0, key: v => v, penalty: () => 0,
    fmt: v => v == null ? '—' : v + ' toques' },
  rank: { name: '¿Quién es más…?', emoji: '🏅', desc: 'Ordenad a todos. Gana quien más coincida con el grupo (3+)', rounds: 5, min: 3, pause: 10000,
    make: makeRank, timeout: d => d.limit + 3700, score: scoreRank },
  stroop: { name: 'Colores', emoji: '🎨', desc: 'Toca el color de la tinta, no la palabra', rounds: 6,
    make: makeStroop, timeout: () => 9000, order: 'asc',
    valid: v => v && v.ok, key: v => v.ms, penalty: () => 0,
    fmt: v => v == null ? 'sin responder' : v.ok ? (v.ms / 1000).toFixed(2) + ' s' : (v.ms == null ? 'tiempo' : 'falló') },
};
GAMES.aim = { name: 'Diana', emoji: '🎯', desc: 'Dale al centro. ¡Cuidado con las bombas!', rounds: 2,
  make: () => ({ seed: ri(1, 2e9), dur: 20000 }), timeout: d => d.dur + 6500, order: 'desc',
  valid: v => typeof v === 'number', key: v => v, penalty: () => 0,
  fmt: v => v == null ? '—' : v + ' puntos' };
GAMES.clock = { name: 'Cronómetro ciego', emoji: '⏱️', desc: 'Para el reloj en el segundo exacto… a ciegas', rounds: 3,
  make: () => ({ target: pick([5, 6, 7, 8, 9, 10]) * 1000 }), timeout: d => d.target + 8500, order: 'asc',
  valid: v => typeof v === 'number', key: v => Math.abs(v), penalty: () => 0,
  fmt: v => v == null ? 'no paró' : (v >= 0 ? '+' : '−') + (Math.abs(v) / 1000).toFixed(2) + ' s' };
const IMP_META = { name: 'Impostor', emoji: '🕵️', desc: 'Todos saben la palabra secreta… menos uno. ¡Descubridlo! (3+ jugadores)' };

const SC = [['ROJO','#ff4d4d'],['AZUL','#4d8bff'],['VERDE','#3ddc84'],['AMARILLO','#ffd23f'],['MORADO','#b46bff'],['ROSA','#ff7ad9']];

const RANK_Q = [
  '¿Quién sobreviviría más tiempo en una isla desierta?',
  '¿Quién sería mejor presidente del Gobierno?',
  '¿Quién tiene más probabilidades de acabar en la cárcel?',
  '¿Quién sobreviviría más en un apocalipsis zombi?',
  '¿Quién se haría famoso antes?',
  '¿Quién se fundiría antes un premio de la lotería?',
  '¿Quién es más probable que llegue tarde a su propia boda?',
  '¿Quién es más probable que se haga millonario?',
  '¿Quién aguantaría más tiempo sin móvil?',
  '¿Quién sería peor compañero de piso?',
  '¿Quién es más probable que se pierda en su propia ciudad?',
  '¿Quién lloraría antes viendo una película?',
  '¿Quién tiene más pinta de agente secreto?',
  '¿Quién moriría primero en una peli de terror?',
  '¿Quién cocina mejor?',
  '¿Quién es más probable que acabe con 10 gatos?',
  '¿Quién ganaría una pelea contra un ganso?',
  '¿Quién contaría antes un secreto?',
  '¿Quién sería mejor profesor?',
  '¿Quién es más probable que se apunte a un reality?',
  '¿Quién liga más?',
  '¿Quién es más cabezota?',
  '¿Quién bailaría antes encima de una mesa?',
  '¿Quién es más probable que se vaya a vivir a otro país?',
  '¿Quién sería mejor padre o madre?',
  '¿Quién tiene el humor más raro?',
  '¿Quién es más probable que se olvide de un cumpleaños?',
  '¿Quién se pondría antes a discutir con un desconocido?',
  '¿Quién es más probable que escriba un libro?',
  '¿Quién sería mejor líder en una emergencia?',
  '¿Quién es más probable que se duerma en el cine?',
  '¿Quién ganaría un concurso de preguntas?',
  '¿Quién sería el villano de una película?',
  '¿Quién es más probable que se tatúe algo de lo que se arrepienta?',
  '¿Quién aguanta más picante?',
  '¿Quién es más probable que se haga viral?',
  '¿Quién sería mejor detective?',
  '¿Quién es más probable que se coma la comida de otro de la nevera?',
  '¿Quién tiene más paciencia?',
  '¿Quién es más probable que deje un trabajo por un impulso?',
  '¿Quién sobreviviría más en la Edad Media?',
  '¿Quién mentiría mejor mirándote a la cara?',
  '¿Quién es más probable que acabe viviendo en el campo?',
  '¿Quién sería el mejor influencer?',
  '¿Quién es más probable que pierda las llaves esta semana?',
  '¿Quién se presentaría a un concurso de la tele y ganaría?',
  '¿Quién sería el último en enterarse de un cotilleo?',
  '¿Quién es más probable que se case en Las Vegas?',
];
let rankDeck = [];
function makeRank() {
  if (!rankDeck.length) rankDeck = shuffle(RANK_Q);
  const people = room.players.map(p => ({ id: p.id, name: p.name, color: p.color }));
  return { q: rankDeck.pop(), people, limit: Math.min(75000, 15000 + 5000 * people.length) };
}
function scoreRank(results, data) {
  const present = id => room.players.some(p => p.id === id);
  const ids = data.people.map(p => p.id).filter(present);
  const n = ids.length;
  const posOf = v => { const arr = v.filter(x => ids.includes(x)); ids.forEach(x => { if (!arr.includes(x)) arr.push(x); }); const m = {}; arr.forEach((x, i) => m[x] = i); return m; };
  const maps = Object.entries(results).filter(([id, v]) => Array.isArray(v) && v.length && present(id)).map(([id, v]) => [id, posOf(v)]);
  const sum = {}; ids.forEach(x => sum[x] = 0);
  maps.forEach(([, m]) => ids.forEach(x => sum[x] += m[x]));
  const cnt = maps.length || 1;
  const consensus = ids.slice().sort((a, b) => sum[a] - sum[b]);
  const cpos = {}; consensus.forEach((x, i) => cpos[x] = i);
  const maxD = Math.max(1, Math.floor(n * n / 2));
  const scored = maps.map(([id, m]) => {
    const d = ids.reduce((s, x) => s + Math.abs(m[x] - cpos[x]), 0);
    return { id, d, pct: Math.round(100 * (1 - d / maxD)) };
  }).sort((a, b) => a.d - b.d);
  const PTS = [3, 2, 1]; let place = 0;
  scored.forEach((s, i) => { if (i > 0 && s.d > scored[i - 1].d) place = i; s.pts = maps.length >= 2 ? (PTS[place] || 0) : 0; });
  const P = id => room.players.find(p => p.id === id);
  const rows = [
    ...scored.map(s => ({ id: s.id, name: P(s.id).name, color: P(s.id).color, disp: s.pct + '% de acuerdo', pts: s.pts, ok: true })),
    ...room.players.filter(p => !scored.some(s => s.id === p.id)).map(p => ({ id: p.id, name: p.name, color: p.color, disp: 'sin responder', pts: 0, ok: false })),
  ];
  const extra = { q: data.q, ranking: consensus.map(x => ({ id: x, name: P(x).name, color: P(x).color, avg: (sum[x] / cnt + 1).toFixed(1) })) };
  return { rows, extra };
}
function makeStroop() {
  const w = ri(0, SC.length - 1); let k; do { k = ri(0, SC.length - 1); } while (k === w);
  const set = new Set([k, w]); while (set.size < 4) set.add(ri(0, SC.length - 1));
  const opts = shuffle([...set]);
  return { w, k, opts, c: opts.indexOf(k) };
}

const WORDS = {
  'Comida': ['Pizza','Paella','Tortilla de patatas','Sushi','Hamburguesa','Churros','Gazpacho','Croquetas','Helado','Tacos','Lasaña','Palomitas','Chocolate','Ensalada','Cocido'],
  'Lugares': ['Playa','Hospital','Aeropuerto','Biblioteca','Gimnasio','Cine','Discoteca','Supermercado','Colegio','Museo','Zoo','Iglesia','Estadio','Camping','Peluquería'],
  'Animales': ['Perro','Gato','Elefante','Jirafa','Pingüino','Tiburón','León','Mono','Caballo','Serpiente','Delfín','Canguro','Búho','Cocodrilo','Oveja'],
  'Profesiones': ['Médico','Bombero','Profesor','Policía','Cocinero','Piloto','Dentista','Fontanero','Astronauta','Peluquero','Abogado','Camarero','Granjero','Payaso','Youtuber'],
  'Objetos': ['Paraguas','Móvil','Cepillo de dientes','Guitarra','Espejo','Llaves','Gafas de sol','Almohada','Reloj','Bicicleta','Mando de la tele','Tijeras','Vela','Mochila','Microondas'],
  'Deportes y ocio': ['Fútbol','Tenis','Natación','Ajedrez','Esquí','Baloncesto','Karaoke','Boxeo','Surf','Golf','Bolos','Escalada','Yoga','Videojuegos','Parchís'],
  'Películas y series': ['Titanic','Harry Potter','Shrek','Star Wars','La casa de papel','Toy Story','El Rey León','Jurassic Park','Frozen','Juego de Tronos','Batman','Los Simpson','Matrix','Buscando a Nemo','Torrente'],
};

/* =====================================================
   CARRERA DE BOLAS 3D
   ===================================================== */
GAMES.race = { name: 'Carrera de bolas', emoji: '🏁', desc: 'Carrera 3D en tiempo real: inclina el móvil para rodar. ¡No te caigas!', rounds: 1, pause: 12000, wide: true,
  make: () => ({ seed: ri(1, 2e9), limit: 120000 }), timeout: d => d.limit + 9000, score: scoreRace };

function fmtTime(ms) { const s = ms / 1000, mm = Math.floor(s / 60); return mm + ':' + (s % 60).toFixed(1).padStart(4, '0'); }
function scoreRace(results) {
  const live = (G && G.live) || {};
  const e = room.players.map(p => {
    const r = results[p.id];
    const v = r && typeof r === 'object' ? r : { t: null, p: live[p.id] ? live[p.id][3] : 0 };
    return { p, t: typeof v.t === 'number' ? v.t : null, prog: Math.max(0, Math.min(1, +v.p || 0)) };
  });
  e.sort((a, b) => (a.t != null && b.t != null) ? a.t - b.t : a.t != null ? -1 : b.t != null ? 1 : b.prog - a.prog);
  const PTS = [5, 3, 2, 1];
  const rows = e.map((x, i) => ({ id: x.p.id, name: x.p.name, color: x.p.color,
    disp: x.t != null ? '🏁 ' + fmtTime(x.t) : 'no llegó (' + Math.round(x.prog * 100) + '%)',
    pts: (x.t != null || x.prog > 0.02) ? (PTS[i] || 0) : 0, ok: true }));
  return { rows, extra: null };
}

function buildTrack(seed) {
  const R = rng(seed);
  const segs = [{ type: 'start', len: 26, turn: 0, w: 7, rails: true }];
  const pool = ['curve', 'curve', 'sharp', 'bumpers', 'bridge', 'scurve', 'boost', 'sliders', 'hills'];
  let heading = 0, lastT = '';
  const sgn = () => heading > 20 ? -1 : heading < -20 ? 1 : (R() < 0.5 ? -1 : 1);
  for (let k = 0; k < 10; k++) {
    let t; do { t = pool[Math.floor(R() * pool.length)]; } while (t === lastT || (k === 0 && t === 'bridge'));
    lastT = t;
    if (t === 'curve') { const a = (45 + R() * 25) * sgn(); heading += a; segs.push({ type: t, len: 38, turn: a, w: 6, rails: R() < 0.5 }); }
    else if (t === 'sharp') { const a = (75 + R() * 15) * sgn(); heading += a; segs.push({ type: t, len: 24, turn: a, w: 5.2, rails: true }); }
    else if (t === 'bumpers') { const a = R() * 30 - 15; heading += a; segs.push({ type: t, len: 46, turn: a, w: 8.5 }); }
    else if (t === 'bridge') { segs.push({ type: t, len: 30, turn: 0, w: 2.8 }); }
    else if (t === 'scurve') { const s = sgn(), a = 40 + R() * 20; segs.push({ type: t, len: 22, turn: a * s, w: 5 }); segs.push({ type: t, len: 22, turn: -a * s, w: 5 }); }
    else if (t === 'boost') { segs.push({ type: t, len: 42, turn: 0, w: 5 }); }
    else if (t === 'sliders') { segs.push({ type: t, len: 44, turn: 0, w: 6.5 }); }
    else if (t === 'hills') { const a = R() * 30 - 15; heading += a; segs.push({ type: t, len: 50, turn: a, w: 6 }); }
  }
  segs.push({ type: 'finish', len: 32, turn: 0, w: 8, rails: true });

  const P = [], T = [], N = [], W = [], RL = [], TY = [], H = [];
  const bumpers = [], sliders = [], boosts = [];
  let x = 0, y = 0, z = 0, h = 0, w = 7, finishIdx = 0;
  segs.forEach(sg => {
    const i0 = P.length;
    if (sg.type === 'finish') finishIdx = i0 + 4;
    for (let j = 0; j < sg.len; j++) {
      h += sg.turn / sg.len;
      const hr = h * Math.PI / 180, dx = Math.sin(hr), dz = -Math.cos(hr);
      w += (sg.w - w) * 0.18;
      let yy = y;
      if (sg.type === 'hills') yy += 1.8 * Math.sin(j / sg.len * Math.PI * 3) * Math.sin(j / sg.len * Math.PI);
      P.push({ x, y: yy, z }); T.push({ x: dx, z: dz }); N.push({ x: -dz, z: dx }); W.push(w); RL.push(!!sg.rails); TY.push(sg.type); H.push(hr);
      x += dx; z += dz; y -= (sg.type === 'start' || sg.type === 'finish') ? 0.02 : 0.08;
    }
    if (sg.type === 'bumpers') for (let j = 10; j < sg.len - 4; j += 7) bumpers.push({ i: i0 + j, lat: (R() * 2 - 1) * (sg.w / 2 - 1.4) });
    if (sg.type === 'sliders') for (let j = 8; j < sg.len - 4; j += 11) sliders.push({ i: i0 + j, amp: sg.w / 2 - 1.2, sp: 1.2 + R() * 1.3, ph: R() * 6.28 });
    if (sg.type === 'boost') for (let j = 6; j < sg.len - 6; j += 14) boosts.push({ i: i0 + j });
  });
  return { P, T, N, W, RL, TY, H, bumpers, sliders, boosts, finishIdx, n: P.length };
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}
function ballTex(color) {
  return canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(0, h * 0.42, w, h * 0.16);
    g.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(16 + i * 32, h * 0.22, 6, 0, 7); g.fill(); }
  });
}
function labelSprite(text, color) {
  const tex = canvasTex(256, 64, (g, w, h) => {
    g.font = '700 34px Rubik,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const tw = Math.min(w - 8, g.measureText(text).width + 28);
    g.fillStyle = 'rgba(20,17,31,.75)'; g.beginPath();
    if (g.roundRect) g.roundRect((w - tw) / 2, 6, tw, h - 12, 20); else g.rect((w - tw) / 2, 6, tw, h - 12);
    g.fill(); g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 1);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(2.6, 0.65, 1); s.renderOrder = 10; return s;
}

function trackMesh(tr) {
  const pos = [], col = [];
  const C = c => new THREE.Color(c);
  const c1 = C('#3b2f6e'), c2 = C('#4a3c8f'), cE = C('#ffcc33'), cS = C('#1d1736'), cW = C('#ffffff'), cK = C('#15121f'), cR = C('#2ee6d6');
  const pt = (i, s, dy = 0) => ({ x: tr.P[i].x + tr.N[i].x * s * tr.W[i] / 2, y: tr.P[i].y + dy, z: tr.P[i].z + tr.N[i].z * s * tr.W[i] / 2 });
  const quad = (a, b, c, d, cc) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    for (let k = 0; k < 6; k++) col.push(cc.r, cc.g, cc.b);
  };
  for (let i = 0; i < tr.n - 1; i++) {
    const j = i + 1;
    if (i >= tr.finishIdx && i < tr.finishIdx + 2) {
      for (let k = 0; k < 8; k++) { const a = -1 + k / 4, b = -1 + (k + 1) / 4; quad(pt(i, a), pt(i, b), pt(j, b), pt(j, a), ((k + i) % 2) ? cW : cK); }
    } else {
      const c = (Math.floor(i / 3) % 2) ? c1 : c2;
      quad(pt(i, -0.94), pt(i, 0.94), pt(j, 0.94), pt(j, -0.94), c);
      quad(pt(i, -1), pt(i, -0.94), pt(j, -0.94), pt(j, -1), cE);
      quad(pt(i, 0.94), pt(i, 1), pt(j, 1), pt(j, 0.94), cE);
    }
    quad(pt(i, -1), pt(j, -1), pt(j, -1, -1.2), pt(i, -1, -1.2), cS);
    quad(pt(i, 1), pt(i, 1, -1.2), pt(j, 1, -1.2), pt(j, 1), cS);
    quad(pt(i, -1, -1.2), pt(j, -1, -1.2), pt(j, 1, -1.2), pt(i, 1, -1.2), cS);
    if (tr.RL[i] && tr.RL[j]) {
      quad(pt(i, -1), pt(j, -1), pt(j, -1, 0.55), pt(i, -1, 0.55), cR);
      quad(pt(i, 1), pt(i, 1, 0.55), pt(j, 1, 0.55), pt(j, 1), cR);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}

let tiltPermAsked = false;
function askTiltPermission() {
  try {
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
      tiltPermAsked = true;
      return DeviceOrientationEvent.requestPermission().catch(() => 'denied');
    }
  } catch (e) {}
  return Promise.resolve('granted');
}

function playRace(m) {
  if (!window.THREE) {
    show('play', `<div class="mid"><div style="font-size:56px">😢</div><div class="title">No se pudo cargar el 3D</div><div class="sub">Revisa la conexión a internet y recarga la página.</div></div>`);
    submit(m.idx, { t: null, p: 0 }); return;
  }
  show('race', `<div class="race" id="race">
    <div id="gl"></div>
    <div class="rhud">
      <div class="rtop"><span id="rtime">0:00.0</span><span id="rpos"></span></div>
      <div class="rprog" id="rprog"><span class="rflag">🏁</span></div>
    </div>
    <div class="rcenter" id="rcd"></div>
    <div class="rflash" id="rflash"></div>
    <div class="rbot"><span id="rhint">Inclina el móvil para rodar</span><button id="rcal" class="rbtn">⟳ Centrar</button></div>
    <div class="joy" id="joy"><i></i></div>
  </div>`);
  const tok = viewToken;
  const tr = buildTrack(m.data.seed), limit = m.data.limit;
  const BR = 0.5, ACC = 20;
  const box = $('#gl'), raceEl = $('#race');

  /* --- escena --- */
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  box.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#120e22');
  scene.fog = new THREE.Fog('#120e22', 28, 85);
  const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 400);
  function resize() { const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  resize(); window.addEventListener('resize', resize);
  scene.add(new THREE.HemisphereLight('#c9c0ff', '#2a2148', 0.95));
  const sun = new THREE.DirectionalLight('#ffffff', 0.75); sun.position.set(6, 12, 4); scene.add(sun);
  scene.add(trackMesh(tr));
  { // estrellas
    const sp = []; for (let i = 0; i < 500; i++) { const a = Math.random() * 6.28, b = Math.random() * 3.14, r = 150 + Math.random() * 60; sp.push(Math.cos(a) * Math.sin(b) * r, Math.cos(b) * r * 0.6, Math.sin(a) * Math.sin(b) * r); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 1.2, fog: false }));
    stars.position.set(tr.P[tr.n >> 1].x, 0, tr.P[tr.n >> 1].z); scene.add(stars);
  }
  const wp = (i, lat, dy = 0) => new THREE.Vector3(tr.P[i].x + tr.N[i].x * lat, tr.P[i].y + dy, tr.P[i].z + tr.N[i].z * lat);
  // obstáculos
  const bumpGeo = new THREE.CylinderGeometry(0.8, 0.8, 1.2, 20), bumpMat = new THREE.MeshStandardMaterial({ color: '#ff4f8b', emissive: '#7a1640', roughness: 0.4 });
  tr.bumpers.forEach(b => { const ms = new THREE.Mesh(bumpGeo, bumpMat); ms.position.copy(wp(b.i, b.lat, 0.6)); scene.add(ms); b.mesh = ms; });
  const slGeo = new THREE.BoxGeometry(1.6, 1, 1.6), slMat = new THREE.MeshStandardMaterial({ color: '#ff9a3c', emissive: '#6a3000', roughness: 0.5 });
  tr.sliders.forEach(s => { const ms = new THREE.Mesh(slGeo, slMat); ms.rotation.y = -tr.H[s.i]; scene.add(ms); s.mesh = ms; });
  const boostTex = canvasTex(64, 96, (g, w, h) => {
    g.fillStyle = '#2ee6d6'; g.fillRect(0, 0, w, h); g.fillStyle = '#0d3b38';
    for (let k = 0; k < 2; k++) { const y0 = 18 + k * 38; g.beginPath(); g.moveTo(w / 2, y0); g.lineTo(w - 8, y0 + 24); g.lineTo(w / 2, y0 + 14); g.lineTo(8, y0 + 24); g.closePath(); g.fill(); }
  });
  const boostMat = new THREE.MeshBasicMaterial({ map: boostTex }), boostGeo = new THREE.PlaneGeometry(2.2, 3.2);
  tr.boosts.forEach(b => { const gr = new THREE.Group(), pl = new THREE.Mesh(boostGeo, boostMat); pl.rotation.x = -Math.PI / 2; gr.add(pl); gr.position.copy(wp(b.i + 1, 0, 0.02)); gr.rotation.y = -tr.H[b.i]; scene.add(gr); });
  { // arco de meta
    const fi = tr.finishIdx, half = tr.W[fi] / 2, pm = new THREE.MeshStandardMaterial({ color: '#ffffff' });
    [-1, 1].forEach(s => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 0.3), pm); p.position.copy(wp(fi, s * (half + 0.2), 2)); scene.add(p); });
    const ck = canvasTex(256, 32, (g, w, h) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#fff' : '#111'; g.fillRect(i * 16, j * 16, 16, 16); } });
    const ban = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.7, 0.8, 0.2), new THREE.MeshBasicMaterial({ map: ck }));
    ban.position.copy(wp(fi, 0, 4)); ban.rotation.y = -tr.H[fi]; scene.add(ban);
  }
  // bolas
  const ballGeo = new THREE.SphereGeometry(BR, 24, 16);
  const me = players.find(p => p.id === myId) || { color: '#ffcc33', name: myName };
  const ball = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ map: ballTex(me.color), roughness: 0.35, metalness: 0.1 }));
  scene.add(ball);
  const ghosts = new Map();
  function ghost(id) {
    if (ghosts.has(id)) return ghosts.get(id);
    const p = players.find(q => q.id === id) || { color: '#999', name: '?' };
    const ms = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ map: ballTex(p.color), roughness: 0.35 }));
    const lb = labelSprite(p.name, p.color);
    scene.add(ms); scene.add(lb);
    const gh = { ms, lb, t: null, p: 0, color: p.color, dot: null };
    ghosts.set(id, gh); addDot(gh, p.color);
    return gh;
  }
  const prog = $('#rprog');
  function addDot(o, color) { const d = document.createElement('i'); d.className = 'rdot'; d.style.background = color; prog.appendChild(d); o.dot = d; }

  /* --- estado de la bola --- */
  const order = Math.max(0, players.findIndex(p => p.id === myId));
  const startLat = ((order % 4) - 1.5) * 1.4;
  const st = { x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, idx: 3, cp: 3, falling: false, fallT: 0, boostT: 0 };
  function placeAt(i, lat) { const p = wp(i, lat); st.x = p.x; st.z = p.z; st.y = p.y + BR; st.vx = st.vz = st.vy = 0; st.idx = i; st.falling = false; }
  placeAt(3, startLat);
  const meDot = {}; addDot(meDot, me.color); meDot.dot.classList.add('me');
  const camDir = { x: tr.T[3].x, z: tr.T[3].z };
  const camPos = new THREE.Vector3(st.x - camDir.x * 6.5, st.y + 3.2, st.z - camDir.z * 6.5);
  let finished = false, timedOut = false, finishMs = 0, lastSend = 0;

  /* --- controles --- */
  let tiltRaw = null, base = null, calib = [], gotTilt = false;
  const onOri = e => {
    if (e.beta == null || e.gamma == null) return;
    gotTilt = true;
    const ang = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (window.orientation || 0);
    let side, fwd;
    if (ang === 90) { side = e.beta; fwd = -e.gamma; }
    else if (ang === -90 || ang === 270) { side = -e.beta; fwd = e.gamma; }
    else { side = e.gamma; fwd = e.beta; }
    tiltRaw = { side, fwd };
  };
  window.addEventListener('deviceorientation', onOri);
  let touch = null;
  const joy = $('#joy');
  raceEl.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    touch = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, z: 0 };
    joy.style.left = e.clientX + 'px'; joy.style.top = e.clientY + 'px'; joy.classList.add('on'); joy.firstChild.style.transform = 'translate(-50%,-50%)';
  });
  raceEl.addEventListener('pointermove', e => {
    if (!touch || e.pointerId !== touch.id) return;
    let dx = e.clientX - touch.ox, dy = e.clientY - touch.oy; const L = Math.hypot(dx, dy), mx = 55;
    if (L > mx) { dx *= mx / L; dy *= mx / L; }
    touch.x = dx / mx; touch.z = -dy / mx;
    joy.firstChild.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  });
  const endTouch = e => { if (touch && e.pointerId === touch.id) { touch = null; joy.classList.remove('on'); } };
  raceEl.addEventListener('pointerup', endTouch); raceEl.addEventListener('pointercancel', endTouch);
  const keys = {};
  const kd = e => { keys[e.key] = true; }, ku = e => { keys[e.key] = false; };
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  on('#rcal', 'click', () => {
    if (!gotTilt && typeof (window.DeviceOrientationEvent || {}).requestPermission === 'function') {
      askTiltPermission().then(r => { flash(r === 'granted' ? 'Sensor activado ✔' : 'Permiso denegado: usa el dedo'); if (r === 'granted') $('#rcal').textContent = '⟳ Centrar'; });
      return;
    }
    if (!gotTilt) { flash('Este móvil no tiene sensor: usa el dedo'); return; }
    if (tiltRaw) { base = { ...tiltRaw }; flash('Centrado ✔'); }
  });
  const clamp = v => Math.max(-1, Math.min(1, v));
  const dz = v => Math.abs(v) < 0.07 ? 0 : v;
  function getInput() {
    if (touch) return { x: touch.x, z: touch.z };
    const kx = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0), kz = (keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0);
    if (kx || kz) return { x: kx, z: kz };
    if (tiltRaw && base) return { x: dz(clamp((tiltRaw.side - base.side) / 18)), z: dz(clamp(-(tiltRaw.fwd - base.fwd) / 18)) };
    return { x: 0, z: 0 };
  }

  const fl = $('#rflash'); let flT = null;
  function flash(t) { fl.textContent = t; fl.classList.add('on'); clearTimeout(flT); flT = setTimeout(() => fl.classList.remove('on'), 1100); }

  netHook = a => {
    a.forEach(([id, x, y, z, p]) => {
      if (id === myId) return;
      const g = ghost(id);
      if (!g.t) { g.ms.position.set(x, y, z); }
      g.t = { x, y, z }; g.p = p;
    });
  };

  /* --- física --- */
  const axis = new THREE.Vector3();
  function step(dt, t) {
    let ix = 0, iz = 0;
    if (t >= 0 && !finished && !timedOut) { const inp = getInput(); ix = inp.x; iz = inp.z; }
    let i = st.idx; const Tn = tr.T[i];
    let ax = (camDir.x * iz - camDir.z * ix) * ACC, az = (camDir.z * iz + camDir.x * ix) * ACC;
    if (!st.falling && t >= 0) { const slope = tr.P[Math.min(i + 1, tr.n - 1)].y - tr.P[i].y; ax += Tn.x * -slope * 14; az += Tn.z * -slope * 14; }
    st.vx += ax * dt; st.vz += az * dt;
    const fr = (finished || timedOut) ? 2.2 : 0.75; st.vx *= 1 - fr * dt; st.vz *= 1 - fr * dt;
    const sp = Math.hypot(st.vx, st.vz), cap = st.boostT > 0 ? 27 : 17;
    if (sp > cap) { st.vx *= cap / sp; st.vz *= cap / sp; }
    st.boostT -= dt;
    st.x += st.vx * dt; st.z += st.vz * dt;
    if (!st.falling) {
      let best = i, bd = 1e9;
      for (let k = Math.max(0, i - 8); k <= Math.min(tr.n - 1, i + 8); k++) { const d = (tr.P[k].x - st.x) ** 2 + (tr.P[k].z - st.z) ** 2; if (d < bd) { bd = d; best = k; } }
      st.idx = i = best;
    }
    const P0 = tr.P[i], Nn = tr.N[i], T0 = tr.T[i], ox = st.x - P0.x, oz = st.z - P0.z;
    const lat = ox * Nn.x + oz * Nn.z, along = ox * T0.x + oz * T0.z, half = tr.W[i] / 2;
    if ((i === 0 && along < 0) || (i === tr.n - 1 && along > 0)) { // muros de inicio y final
      st.x -= T0.x * along; st.z -= T0.z * along; const va = st.vx * T0.x + st.vz * T0.z; st.vx -= T0.x * va * 1.5; st.vz -= T0.z * va * 1.5;
    }
    if (!st.falling) {
      if (tr.RL[i] && Math.abs(lat) > half - BR) {
        const s = Math.sign(lat), over = Math.abs(lat) - (half - BR);
        st.x -= Nn.x * s * over; st.z -= Nn.z * s * over;
        const vl = st.vx * Nn.x + st.vz * Nn.z; if (vl * s > 0) { st.vx -= Nn.x * vl * 1.5; st.vz -= Nn.z * vl * 1.5; }
      } else if (Math.abs(lat) > half + 0.15) {
        st.falling = true; st.vy = 0; st.fallT = 0; buzz(80); flash('¡Te caíste! 💀');
      }
      const nk = Math.min(i + 1, tr.n - 1), f = Math.max(-1, Math.min(1, along));
      st.y = P0.y + (tr.P[nk].y - P0.y) * f + BR;
    }
    if (st.falling) {
      st.vy -= 30 * dt; st.y += st.vy * dt; st.fallT += dt;
      if (st.fallT > 1.1) { placeAt(st.cp, 0); camDir.x = tr.T[st.cp].x; camDir.z = tr.T[st.cp].z; }
      return roll(dt);
    }
    const bounce = (cx, cz, rad, kick) => {
      const dx = st.x - cx, dz2 = st.z - cz, d = Math.hypot(dx, dz2);
      if (d >= rad || d === 0) return;
      const nx = dx / d, nz = dz2 / d; st.x = cx + nx * rad; st.z = cz + nz * rad;
      const vn = st.vx * nx + st.vz * nz;
      if (vn < kick) { st.vx += nx * (kick - vn); st.vz += nz * (kick - vn); }
      buzz(15);
    };
    tr.bumpers.forEach(b => { if (Math.abs(b.i - i) < 4) bounce(b.mesh.position.x, b.mesh.position.z, 0.8 + BR, 9); });
    tr.sliders.forEach(s => { if (Math.abs(s.i - i) < 4) bounce(s.mesh.position.x, s.mesh.position.z, 0.95 + BR, 7); });
    tr.boosts.forEach(b => {
      if (i >= b.i - 1 && i <= b.i + 3 && Math.abs(lat) < 1.3 && st.boostT < 0.4) {
        st.boostT = 1.0; const va = st.vx * T0.x + st.vz * T0.z;
        if (va < 25) { st.vx += T0.x * (25 - va); st.vz += T0.z * (25 - va); }
        buzz(25); flash('¡TURBO! 🚀');
      }
    });
    if (i >= st.cp + 18 && Math.abs(lat) < half - 0.6 && tr.TY[i] !== 'bridge') st.cp = i;
    if (!finished && !timedOut && i >= tr.finishIdx) {
      finished = true; finishMs = Math.round(t);
      submit(m.idx, { t: finishMs, p: 1 });
      buzz([60, 60, 200]);
      $('#rcd').innerHTML = `<div class="big">🏁 ¡META!</div><div class="small">${fmtTime(finishMs)} · esperando al resto…</div>`;
    }
    roll(dt);
  }
  function roll(dt) {
    const d = Math.hypot(st.vx, st.vz) * dt;
    if (d > 1e-5) { axis.set(st.vz, 0, -st.vx).normalize(); ball.rotateOnWorldAxis(axis, d / BR); }
  }

  /* --- bucle --- */
  const start = performance.now() + 4000;
  let last = performance.now(), cdLast = '';
  const cd = $('#rcd'), rtime = $('#rtime'), rpos = $('#rpos'), rhint = $('#rhint');
  function loop() {
    if (tok !== viewToken) return;
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = now - start;
    if (t < 0) {
      const s = String(Math.ceil(-t / 1000));
      if (s !== cdLast) { cdLast = s; cd.innerHTML = `<div class="big">${s === '4' ? '¡Prepárate!' : s}</div><div class="small">Sujeta el móvil en una posición cómoda</div>`; buzz(10); }
      if (t > -1500 && tiltRaw) calib.push({ ...tiltRaw });
    } else if (cdLast !== 'go') {
      cdLast = 'go'; cd.innerHTML = '<div class="big">¡YA!</div>'; buzz(60);
      setTimeout(() => { if (!finished && tok === viewToken) cd.innerHTML = ''; }, 900);
      if (calib.length) base = { side: calib.reduce((a, c) => a + c.side, 0) / calib.length, fwd: calib.reduce((a, c) => a + c.fwd, 0) / calib.length };
      else if (tiltRaw) base = { ...tiltRaw };
      rhint.textContent = gotTilt ? 'Inclina el móvil · o arrastra el dedo' : 'Arrastra el dedo para mover la bola';
      if (!gotTilt && typeof (window.DeviceOrientationEvent || {}).requestPermission === 'function') $('#rcal').textContent = '📱 Activar sensor';
    }
    if (gotTilt && !base && t >= 0 && tiltRaw) base = { ...tiltRaw };
    for (let k = 0; k < 3; k++) step(dt / 3, t);
    if (t > limit && !finished && !timedOut) {
      timedOut = true; submit(m.idx, { t: null, p: Math.min(1, st.idx / tr.finishIdx) });
      cd.innerHTML = '<div class="big">⏰ ¡Tiempo!</div><div class="small">Esperando resultados…</div>';
    }
    // obstáculos móviles
    const ts = Math.max(0, t) / 1000;
    tr.sliders.forEach(s => s.mesh.position.copy(wp(s.i, s.amp * Math.sin(ts * s.sp + s.ph), 0.5)));
    tr.bumpers.forEach(b => b.mesh.rotation.y += dt * 2);
    // bola y cámara
    ball.position.set(st.x, st.y, st.z);
    const Tn = tr.T[st.idx], k = Math.min(1, dt * 2.5);
    camDir.x += (Tn.x - camDir.x) * k; camDir.z += (Tn.z - camDir.z) * k;
    const cl = Math.hypot(camDir.x, camDir.z) || 1; camDir.x /= cl; camDir.z /= cl;
    const camY = st.falling ? tr.P[st.idx].y + BR : st.y;
    const want = new THREE.Vector3(st.x - camDir.x * 6.5, camY + 3.3, st.z - camDir.z * 6.5);
    camPos.lerp(want, Math.min(1, dt * 6));
    camera.position.copy(camPos);
    camera.lookAt(st.x + camDir.x * 4, camY + 0.3, st.z + camDir.z * 4);
    // fantasmas
    const myP = finished ? 1 : Math.min(1, st.idx / tr.finishIdx);
    let rank = 1;
    ghosts.forEach(g => {
      if (g.t) {
        const p0 = g.ms.position.clone();
        g.ms.position.lerp(new THREE.Vector3(g.t.x, g.t.y, g.t.z), Math.min(1, dt * 10));
        const mx = g.ms.position.x - p0.x, mz = g.ms.position.z - p0.z, d = Math.hypot(mx, mz);
        if (d > 1e-4) { axis.set(mz, 0, -mx).normalize(); g.ms.rotateOnWorldAxis(axis, d / BR); }
        g.lb.position.set(g.ms.position.x, g.ms.position.y + 1.15, g.ms.position.z);
      }
      if (g.p > myP) rank++;
      g.dot.style.left = (Math.min(1, g.p) * 100) + '%';
    });
    meDot.dot.style.left = (myP * 100) + '%';
    rpos.textContent = rank + 'º / ' + (ghosts.size + 1);
    rtime.textContent = fmtTime(finished ? finishMs : Math.max(0, Math.min(t, limit)));
    if (now - lastSend > 90 && t > -500) {
      lastSend = now;
      const r2 = v => Math.round(v * 100) / 100;
      toHost({ t: 'pos', v: [r2(st.x), r2(st.y), r2(st.z), Math.round(myP * 1000) / 1000] });
    }
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  if (location.hash === '#debug') window.__race = { st, tr, keys, camDir };

  viewCleanup = () => {
    netHook = null;
    window.removeEventListener('deviceorientation', onOri);
    window.removeEventListener('resize', resize);
    window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
    try { renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss(); } catch (e) {}
  };
}

/* ---------- arranque ---------- */

/* =====================================================
   ANFITRIÓN
   ===================================================== */
const room = P.room;
let G = null;     // juego por rondas en curso
let IMP = null;   // impostor en curso


function clone(o) { return JSON.parse(JSON.stringify(o)); }

const send = (id, msg) => P.send(id, msg);
const broadcast = msg => P.broadcast(msg);
const broadcastPlayers = () => P.broadcastPlayers();


function hostHandle(id, m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'res') onRes(id, m);
  else if (m.t === 'vote') onVote(id, m);
  else if (m.t === 'pos') { if (G && G.open && G.key === 'race' && Array.isArray(m.v) && room.players.some(p => p.id === id)) G.live[id] = m.v.slice(0, 4).map(Number); }
}
function dropPlayer(id) {
  if (G && G.open && room.players.every(p => p.id in G.results)) hostEndRound();
  if (IMP && IMP.phase === 'vote' && room.players.every(p => p.id in IMP.votes)) impEnd();
}
/* --- juegos por rondas --- */
function startGame(key) {
  if (G || IMP) return;
  if (key === 'race' && !window.THREE) { toast('Cargando el 3D… pulsa otra vez en un momento'); P.need3D(); return; }
  if (GAMES[key].min && room.players.length < GAMES[key].min) { toast('Este juego necesita al menos ' + GAMES[key].min + ' jugadores'); return; }
  G = { key, idx: 0, total: GAMES[key].rounds, results: {}, open: false, timer: null };
  hostRound();
}
function hostRound() {
  const g = GAMES[G.key];
  G.results = {}; G.data = g.make(); G.open = true;
  broadcast({ t: 'round', game: G.key, idx: G.idx, total: G.total, data: G.data });
  G.timer = setTimeout(hostEndRound, g.timeout(G.data));
  if (G.key === 'race') {
    G.live = {};
    clearInterval(G.relay);
    G.relay = setInterval(() => {
      if (!G || !G.open || G.key !== 'race') return;
      const a = Object.entries(G.live).map(([id, v]) => [id, ...v]);
      if (a.length) broadcast({ t: 'poss', a });
    }, 90);
  }
}
function onRes(id, m) {
  if (!G || !G.open || m.idx !== G.idx || (id in G.results)) return;
  G.results[id] = m.val;
  if (room.players.every(p => p.id in G.results)) hostEndRound();
}
function hostEndRound() {
  if (!G || !G.open) return;
  G.open = false; clearTimeout(G.timer); clearInterval(G.relay);
  const g = GAMES[G.key];
  let rows, extra = null;
  if (g.score) { const r = g.score(G.results, G.data); rows = r.rows; extra = r.extra; }
  else {
    const entries = room.players.map(p => ({ id: p.id, name: p.name, color: p.color, val: G.results[p.id] }));
    const valid = entries.filter(e => e.val != null && g.valid(e.val))
      .sort((a, b) => g.order === 'asc' ? g.key(a.val) - g.key(b.val) : g.key(b.val) - g.key(a.val));
    const rest = entries.filter(e => !valid.includes(e));
    const PTS = [3, 2, 1];
    rows = [
      ...valid.map((e, i) => ({ ...e, pts: PTS[i] || 0, ok: true })),
      ...rest.map(e => ({ ...e, pts: e.val != null ? g.penalty(e.val) : 0, ok: false })),
    ].map(r => ({ id: r.id, name: r.name, color: r.color, disp: g.fmt(r.val), pts: r.pts, ok: r.ok }));
  }
  rows.forEach(r => { const p = room.players.find(p => p.id === r.id); if (p) p.score += r.pts; });
  broadcastPlayers();
  const last = G.idx + 1 >= G.total;
  broadcast({ t: 'roundEnd', game: G.key, idx: G.idx, total: G.total, rows, last, extra });
  G.next = () => {
    if (!G || G.open) return;
    clearTimeout(G.timer); G.next = null;
    if (last) { G = null; broadcast({ t: 'gameEnd' }); }
    else { G.idx++; hostRound(); }
  };
  G.timer = setTimeout(G.next, g.pause || (last ? 3200 : 4000));
}
function hostNext() { if (G && G.next) G.next(); }

/* --- impostor --- */
function startImp() {
  if (G || IMP) return;
  if (room.players.length < 3) { toast('El Impostor necesita al menos 3 jugadores'); return; }
  const cat = pick(Object.keys(WORDS)), word = pick(WORDS[cat]);
  const imp = pick(room.players).id, starter = pick(room.players).name;
  IMP = { cat, word, imp, votes: {}, phase: 'talk' };
  room.players.forEach(p => send(p.id, { t: 'imp', cat, word: p.id === imp ? null : word, impostor: p.id === imp, starter }));
}
function impToVote() { if (!IMP || IMP.phase !== 'talk') return; IMP.phase = 'vote'; broadcast({ t: 'impVote' }); }
function onVote(id, m) {
  if (!IMP || IMP.phase !== 'vote' || (id in IMP.votes)) return;
  if (!room.players.find(p => p.id === m.target)) return;
  IMP.votes[id] = m.target;
  broadcast({ t: 'impVotes', n: Object.keys(IMP.votes).length, of: room.players.length });
  if (room.players.every(p => p.id in IMP.votes)) impEnd();
}
function impEnd() {
  if (!IMP || IMP.phase !== 'vote') return;
  IMP.phase = 'end';
  const count = {};
  Object.values(IMP.votes).forEach(t => count[t] = (count[t] || 0) + 1);
  const max = Math.max(0, ...Object.values(count));
  const tops = Object.keys(count).filter(k => count[k] === max);
  const caught = max > 0 && tops.length === 1 && tops[0] === IMP.imp;
  room.players.forEach(p => {
    if (caught && p.id !== IMP.imp) p.score += 2;
    if (!caught && p.id === IMP.imp) p.score += 3;
  });
  const impP = room.players.find(p => p.id === IMP.imp);
  const tally = room.players.map(p => ({ name: p.name, color: p.color, n: count[p.id] || 0, imp: p.id === IMP.imp }))
    .sort((a, b) => b.n - a.n);
  broadcastPlayers();
  broadcast({ t: 'impEnd', cat: IMP.cat, word: IMP.word, impName: impP ? impP.name : '(se fue)', caught, tally });
  IMP = null;
}

function backToLobby() { if (G || IMP) return; broadcast({ t: 'lobby' }); }

/* =====================================================
   INVITADO
   ===================================================== */
const toHost = msg => P.toHost(msg);
function submit(idx, val) { toHost({ t: 'res', idx, val }); }

/* =====================================================
   VISTAS (todos)
   ===================================================== */
function onMsg(m) {
  switch (m.t) {
    case 'lobby': renderLobby(); break;
    case 'round': renderRound(m); break;
    case 'roundEnd': renderRoundEnd(m); break;
    case 'gameEnd': renderGameEnd(); break;
    case 'imp': renderImp(m); break;
    case 'impVote': renderImpVote(); break;
    case 'impVotes': { const el = $('#vc'); if (el) el.textContent = m.n + ' / ' + m.of + ' votos'; break; }
    case 'impEnd': renderImpEnd(m); break;
    case 'poss': if (netHook) netHook(m.a); break;
  }
}
function updateLive() { const el = $('#live'); if (el) el.innerHTML = playerListHTML(); }

function playerListHTML(sorted) {
  const list = sorted ? players.slice().sort((a, b) => b.score - a.score) : players;
  return `<ul class="plist">${list.map(p => `<li><span class="dot" style="background:${p.color}"></span>
    <span class="nm">${esc(p.name)}${p.id === myId ? '<span class="tag">TÚ</span>' : ''}${p.id === 'host' ? '<span class="tag">👑</span>' : ''}</span>
    <span class="pts">${p.score}</span></li>`).join('')}</ul>`;
}

function renderLobby() {
  const gameCards = Object.entries(GAMES).filter(([, g]) => g.wide).map(([k, g]) =>
    `<button class="game wide hero" data-g="${k}"><div class="e">${g.emoji}</div><div><b>${g.name}</b><small>${g.desc}</small></div></button>`).join('') +
    Object.entries(GAMES).filter(([, g]) => !g.wide).map(([k, g]) =>
    `<button class="game" data-g="${k}"><div class="e">${g.emoji}</div><b>${g.name}</b><small>${g.desc}</small></button>`).join('') +
    `<button class="game wide" data-g="imp"><div class="e">${IMP_META.emoji}</div><div><b>${IMP_META.name}</b><small>${IMP_META.desc}</small></div></button>`;
  show('lobby', `
    <div class="hubtop"><h1>🎮 Mini<span>juegos</span></h1><div class="codechip"><b>${esc(code)}</b></div></div>
    <div class="card">
      <div class="top"><h3>Jugadores (${players.length})</h3><span class="mute" style="font-size:13px;font-weight:700">PUNTOS</span></div>
      <div id="live">${playerListHTML(true)}</div>
    </div>
    ${isHost ? `
      <h3 style="margin:8px 4px 10px">Elige un juego</h3>
      <div class="games">${gameCards}</div>
      <div style="margin-top:14px">${P.homeButton()}</div>
    ` : `
      <div class="card center"><div class="spin" style="width:32px;height:32px;border-width:4px;margin-bottom:10px"></div>
      <b>Esperando a que el anfitrión elija juego…</b></div>
    `}`);
  if (isHost) {
    $$('.game').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.g;
      if (k === 'imp') startImp(); else startGame(k);
    }));
    P.bindHome();
  }
}

function hud(m) {
  const g = GAMES[m.game];
  return `<div class="hud"><span><b>${g.emoji} ${g.name}</b></span><span>Ronda ${m.idx + 1}/${m.total}</span></div>`;
}

function renderRound(m) {
  if (m.game === 'reflex') return playReflex(m);
  if (m.game === 'taps') return playTaps(m);
  if (m.game === 'rank') return playRank(m);
  if (m.game === 'aim') return playAim(m);
  if (m.game === 'clock') return playClock(m);
  if (m.game === 'race') {
    if (window.THREE) return playRace(m);
    show('play', `<div class="mid"><div class="spin"></div><div class="title">Cargando el 3D…</div></div>`);
    const tk = viewToken;
    P.need3D().then(() => { if (tk === viewToken) playRace(m); });
    return;
  }
  if (m.game === 'stroop') {
    const d = m.data;
    return playQuiz(m, `<div class="stroop" style="color:${SC[d.k][1]}">${SC[d.w][0]}</div><div class="mute" style="font-weight:700;margin-top:8px">Toca el <b style="color:#fff">COLOR</b> de la tinta</div>`,
      d.opts.map(i => SC[i][0]), d.c, 6000, true);
  }
}

function playReflex(m) {
  show('play', hud(m) + `<div class="pad red" id="pad"><div class="big">Espera…</div><div class="small">Toca cuando se ponga VERDE</div></div>`);
  const pad = $('#pad');
  let state = 'wait', t0 = 0, done = false;
  later(() => {
    if (done) return;
    state = 'go'; t0 = performance.now();
    pad.className = 'pad green'; pad.innerHTML = '<div class="big">¡YA!</div>'; buzz(25);
  }, m.data.delay);
  pad.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (done) return; done = true;
    if (state === 'wait') {
      submit(m.idx, -1);
      pad.className = 'pad bad'; pad.innerHTML = '<div class="big">¡Falso!</div><div class="small">Te has adelantado (−1)</div>'; buzz([80, 50, 80]);
    } else {
      const ms = Math.round(performance.now() - t0);
      submit(m.idx, ms);
      pad.className = 'pad done'; pad.innerHTML = `<div class="big">${ms} ms</div><div class="small">Esperando al resto…</div>`;
    }
  });
}

function playTaps(m) {
  show('play', hud(m) + `<div class="pad tap" id="pad"><div class="big" id="cnt">3</div><div class="small" id="sub">Prepárate…</div></div>`);
  const pad = $('#pad'), cnt = $('#cnt'), sub = $('#sub');
  const dur = m.data.dur, start = performance.now();
  let n = 0, live = false, ended = false, last = '';
  every(() => {
    const el = performance.now() - start;
    if (el < 3000) { const s = String(3 - Math.floor(el / 1000)); if (s !== last) { last = s; cnt.textContent = s; buzz(15); } }
    else if (el < 3000 + dur) {
      if (!live) { live = true; pad.classList.add('live'); cnt.textContent = '0'; buzz(40); }
      sub.textContent = '¡TOCA! ' + Math.ceil((3000 + dur - el) / 1000) + ' s';
    } else if (!ended) {
      ended = true; live = false; pad.classList.remove('live');
      submit(m.idx, n); buzz([40, 40, 40]);
      cnt.textContent = n; sub.textContent = '¡Tiempo! Esperando al resto…';
    }
  }, 50);
  pad.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (!live) return;
    n++; cnt.textContent = n;
  });
}

function playQuiz(m, promptHTML, opts, correct, limit, small) {
  show('play', hud(m) + `<div class="prep"><div class="small">Ronda ${m.idx + 1} de ${m.total}</div><div class="big">¡Atento!</div></div>`);
  later(() => {
    const t0 = performance.now(); let done = false;
    app.innerHTML = hud(m) + `<div class="bar"><i id="bar"></i></div><div class="q">${promptHTML}</div>
      <div class="opts">${opts.map((o, i) => `<button class="opt${small ? ' sm' : ''}" data-i="${i}">${esc(o)}</button>`).join('')}</div>
      <div class="msg" id="msg"></div>`;
    const bar = $('#bar');
    every(() => {
      const p = 1 - (performance.now() - t0) / limit;
      bar.style.width = Math.max(0, p * 100) + '%';
      if (p <= 0 && !done) { done = true; submit(m.idx, { ok: false, ms: null }); $('#msg').textContent = '⏰ ¡Tiempo!'; mark(); }
    }, 50);
    function mark() { const b = app.querySelector(`.opt[data-i="${correct}"]`); if (b) b.classList.add('ok'); }
    $$('.opt').forEach(b => b.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (done) return; done = true;
      const i = +b.dataset.i, ok = i === correct, ms = Math.round(performance.now() - t0);
      if (!ok) b.classList.add('no'); mark();
      $('#msg').textContent = ok ? `✅ ¡Bien! ${(ms / 1000).toFixed(2)} s` : '❌ Fallo…';
      buzz(ok ? 20 : [60, 40, 60]);
      submit(m.idx, { ok, ms });
    }));
  }, 1200);
}

function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function aimTargets(seed, dur) {
  const R = rng(seed), list = []; let t = 300;
  while (t < dur - 500) {
    const p = t / dur, ang = R() * Math.PI * 2, sp = p > 0.3 ? 0.12 + 0.22 * p : 0;
    list.push({ t, x: 0.15 + R() * 0.7, y: 0.15 + R() * 0.7, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      r: 0.13 - 0.06 * p, life: 1800 - 750 * p, bomb: p > 0.2 && R() < 0.2, hit: false });
    t += 760 - 380 * p;
  }
  return list;
}
const refl = (v, lo, hi) => { const L = hi - lo; let u = ((v - lo) % (2 * L) + 2 * L) % (2 * L); return lo + (u > L ? 2 * L - u : u); };

function playAim(m) {
  const dur = m.data.dur, targets = aimTargets(m.data.seed, dur);
  show('play', hud(m) + `<div class="aimbar"><span>Puntos <b id="sc">0</b></span><span id="tm">${(dur / 1000).toFixed(1)} s</span></div>
    <div class="arena" id="arena"><canvas id="cv"></canvas></div>
    <div class="sub" style="margin-top:8px;font-size:13px">Centro 10 · medio 6 · borde 3 · fallo −1 · bomba −8</div>`);
  const tok = viewToken, arena = $('#arena'), cv = $('#cv'), ctx = cv.getContext('2d');
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  let W = 0, H = 0, M = 0;
  function size() { const b = arena.getBoundingClientRect(); W = b.width; H = b.height; M = Math.min(W, H); cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  size(); window.addEventListener('resize', size, { once: true });
  const start = performance.now() + 3000;
  let score = 0, ended = false, pops = [];
  const sc = $('#sc'), tm = $('#tm');
  function state(tg, now) {
    const age = now - start - tg.t;
    if (tg.hit || age < 0 || age > tg.life) return null;
    const s = Math.min(1, age / 150, (tg.life - age) / 250);
    const x = refl(tg.x + tg.vx * age / 1000, 0.1, 0.9) * W, y = refl(tg.y + tg.vy * age / 1000, 0.1, 0.9) * H;
    return { x, y, rad: Math.max(0, tg.r * M * s) };
  }
  function drawTarget(tg, st) {
    const { x, y, rad } = st;
    if (tg.bomb) {
      ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fillStyle = '#16121f'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#ff5a5a'; ctx.stroke();
      ctx.font = `${rad * 1.1}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('💣', x, y + rad * 0.06);
      return;
    }
    [[1, '#e0384d'], [0.66, '#ffffff'], [0.33, '#e0384d'], [0.12, '#ffcc33']].forEach(([k, c]) => { ctx.beginPath(); ctx.arc(x, y, rad * k, 0, 7); ctx.fillStyle = c; ctx.fill(); });
  }
  function frame() {
    if (tok !== viewToken) return;
    const now = performance.now();
    ctx.clearRect(0, 0, W, H);
    if (now < start) {
      ctx.fillStyle = '#fff'; ctx.font = '900 96px Rubik,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.ceil((start - now) / 1000)), W / 2, H / 2);
    } else if (now < start + dur) {
      targets.forEach(tg => { const st = state(tg, now); if (st) drawTarget(tg, st); });
      tm.textContent = ((start + dur - now) / 1000).toFixed(1) + ' s';
    } else if (!ended) {
      ended = true; tm.textContent = '0.0 s'; submit(m.idx, score); buzz([40, 40, 40]);
    }
    if (ended) {
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '900 44px Rubik,sans-serif'; ctx.fillText('¡Tiempo!', W / 2, H / 2 - 30);
      ctx.font = '700 26px Rubik,sans-serif'; ctx.fillText(score + ' puntos', W / 2, H / 2 + 20);
      ctx.font = '700 15px Rubik,sans-serif'; ctx.fillStyle = '#9d96bd'; ctx.fillText('Esperando al resto…', W / 2, H / 2 + 56);
    }
    pops = pops.filter(p => now - p.t0 < 700);
    pops.forEach(p => { const k = (now - p.t0) / 700; ctx.globalAlpha = 1 - k; ctx.fillStyle = p.c; ctx.font = '900 26px Rubik,sans-serif'; ctx.textAlign = 'center'; ctx.fillText(p.txt, p.x, p.y - 40 * k); ctx.globalAlpha = 1; });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  cv.addEventListener('pointerdown', e => {
    e.preventDefault();
    const now = performance.now();
    if (now < start || ended) return;
    const b = cv.getBoundingClientRect(), px = e.clientX - b.left, py = e.clientY - b.top;
    let hit = null, pts = -1;
    for (let i = targets.length - 1; i >= 0; i--) {
      const st = state(targets[i], now); if (!st) continue;
      const d = Math.hypot(px - st.x, py - st.y);
      if (d <= st.rad + 6) { hit = targets[i]; pts = hit.bomb ? -8 : d < st.rad * 0.33 ? 10 : d < st.rad * 0.66 ? 6 : 3; break; }
    }
    if (hit) hit.hit = true;
    score += pts; sc.textContent = score;
    pops.push({ x: px, y: py, t0: now, txt: pts === 10 ? '¡DIANA! +10' : (pts > 0 ? '+' : '') + pts, c: pts === 10 ? '#ffcc33' : pts > 0 ? '#3ddc84' : '#ff5a5a' });
    buzz(pts < -1 ? [80, 40, 80] : pts > 0 ? 12 : 0);
  });
}

function playClock(m) {
  const target = m.data.target, T = (target / 1000).toFixed(2);
  show('play', hud(m) + `<div class="pad done" id="pad" style="background:var(--panel2)">
    <div class="small" style="margin:0 0 10px">Para el cronómetro en</div>
    <div class="big" style="color:var(--acc)">${T} s</div>
    <div class="clock" id="clk">0.00</div>
    <div class="small" id="sub">Prepárate…</div></div>`);
  const pad = $('#pad'), clk = $('#clk'), sub = $('#sub');
  const start = performance.now() + 2000, hideAt = 2500;
  let stopped = false, last = '';
  every(() => {
    if (stopped) return;
    const now = performance.now();
    if (now < start) { const s = String(Math.ceil((start - now) / 1000)); if (s !== last) { last = s; sub.textContent = 'Empieza en ' + s + '…'; } return; }
    const el = now - start;
    sub.textContent = '¡Toca para parar!';
    clk.textContent = el < hideAt ? (el / 1000).toFixed(2) : '?.??';
    clk.classList.toggle('hid', el >= hideAt);
    if (el > target + 6000) { stopped = true; clk.textContent = '—'; sub.textContent = 'Demasiado tarde'; }
  }, 30);
  pad.addEventListener('pointerdown', e => {
    e.preventDefault();
    const now = performance.now();
    if (stopped || now < start) return;
    stopped = true;
    const el = Math.round(now - start), diff = el - target;
    submit(m.idx, diff); buzz(25);
    clk.classList.remove('hid');
    clk.textContent = (el / 1000).toFixed(2);
    const a = Math.abs(diff);
    sub.innerHTML = (a < 50 ? '🤯 ¡Perfecto!' : a < 200 ? '🔥 ¡Muy cerca!' : a < 600 ? '👍 No está mal' : '😅 Uf…') +
      `<br>${diff >= 0 ? '+' : '−'}${(a / 1000).toFixed(2)} s · Esperando al resto…`;
  });
}

function playRank(m) {
  const d = m.data, people = d.people, n = people.length;
  const byId = {}; people.forEach(p => byId[p.id] = p);
  show('play', hud(m) + `<div class="prep"><div class="small">Ronda ${m.idx + 1} de ${m.total}</div><div class="big" style="font-size:34px;line-height:1.15">${esc(d.q)}</div></div>`);
  later(() => {
    const t0 = performance.now(); let order = [], done = false, fresh = false;
    app.innerHTML = hud(m) + `<div class="bar"><i id="bar"></i></div>
      <div class="rq">${esc(d.q)}</div>
      <div id="rk"></div>`;
    const rk = $('#rk'), bar = $('#bar');
    const chip = (p, i) => `<button class="chip${i != null && i === order.length - 1 && fresh ? ' new' : ''}" data-id="${esc(p.id)}">${i != null ? `<span class="num">${i + 1}</span>` : ''}<span class="dot" style="background:${p.color}"></span><span class="nm">${esc(p.name)}${p.id === myId ? ' (tú)' : ''}</span></button>`;
    function draw() {
      if (done) {
        rk.innerHTML = `<div class="rlbl">Tu ranking</div><div class="rlist">${order.map((id, i) => chip(byId[id], i)).join('')}</div>
          <div class="msg">✅ Enviado. Esperando al resto…</div>`;
        return;
      }
      const pool = people.filter(p => !order.includes(p.id));
      rk.innerHTML = `
        <div class="rlbl">⬆ MÁS</div>
        <div class="rlist">${Array.from({ length: n }, (_, i) => order[i] ? chip(byId[order[i]], i) : `<div class="slot"><span class="num">${i + 1}</span></div>`).join('')}</div>
        <div class="rlbl">⬇ MENOS</div>
        ${pool.length ? `<div class="sub" style="margin-top:14px">Toca en orden, del que más al que menos</div><div class="pool">${pool.map(p => chip(p)).join('')}</div>`
          : `<button class="btn" id="ok" style="margin-top:14px">Confirmar ranking</button>`}
        ${order.length ? '<div class="sub" style="font-size:13px">Toca uno de arriba para quitarlo</div>' : ''}`;
    }
    function send() { if (done) return; done = true; submit(m.idx, order.slice()); buzz(25); draw(); }
    rk.addEventListener('click', e => {
      if (done) return;
      if (e.target.closest('#ok')) { send(); return; }
      const c = e.target.closest('.chip'); if (!c) return;
      const id = c.dataset.id;
      if (order.includes(id)) { order = order.filter(x => x !== id); fresh = false; } else { order.push(id); fresh = true; }
      buzz(8); draw();
    });
    draw();
    every(() => {
      const p = 1 - (performance.now() - t0) / d.limit;
      bar.style.width = Math.max(0, p * 100) + '%';
      if (p <= 0 && !done) { if (order.length) send(); else { done = true; rk.innerHTML = '<div class="msg">⏰ Se acabó el tiempo</div>'; } }
    }, 100);
  }, 2500);
}

function renderRoundEnd(m) {
  const g = GAMES[m.game];
  const mine = m.rows.find(r => r.id === myId);
  const head = mine && mine.pts > 0 ? (mine.pts === 3 ? '🥇 ¡Primero!' : mine.pts === 2 ? '🥈 ¡Segundo!' : '🥉 ¡Tercero!') : mine && mine.pts < 0 ? '😬 Penalización' : 'Resultados';
  let rank = 0;
  const MED = ['🥇', '🥈', '🥉'];
  const rankCard = m.extra ? `
    <div class="card"><div class="rq" style="margin:0 0 8px">${esc(m.extra.q)}</div>
    <div class="sub" style="text-align:left;margin-bottom:2px">Según el grupo:</div>
    <ul class="plist results">${m.extra.ranking.map((r, i) => `<li style="animation-delay:${i * 120}ms">
      <span class="rk">${MED[i] || i + 1}</span><span class="dot" style="background:${r.color}"></span>
      <span class="nm">${esc(r.name)}${r.id === myId ? '<span class="tag">TÚ</span>' : ''}</span>
      <span class="val">media ${r.avg}º</span></li>`).join('')}</ul></div>` : '';
  show('roundEnd', `
    <div class="hud"><span><b>${g.emoji} ${g.name}</b></span><span>Ronda ${m.idx + 1}/${m.total}</span></div>
    ${rankCard}
    <div class="title"${m.extra ? ' style="font-size:22px"' : ''}>${head}</div>
    <div class="card"><ul class="plist results">${m.rows.map((r, i) => `<li style="animation-delay:${i * 70}ms">
      <span class="rk">${r.ok ? ++rank : '–'}</span><span class="dot" style="background:${r.color}"></span>
      <span class="nm">${esc(r.name)}${r.id === myId ? '<span class="tag">TÚ</span>' : ''}<br><span class="val">${esc(r.disp)}</span></span>
      <span class="plus ${r.pts > 0 ? 'p' : r.pts < 0 ? 'n' : 'z'}">${r.pts > 0 ? '+' + r.pts : r.pts}</span></li>`).join('')}</ul></div>
    ${isHost ? `<button class="btn sec" id="next">${m.last ? 'Ver clasificación ▶' : 'Siguiente ronda ▶'}</button>` : `<div class="sub">${m.last ? 'Última ronda…' : 'Siguiente ronda en un momento…'}</div>`}`);
  on('#next', 'click', hostNext);
}

function renderGameEnd() {
  const s = players.slice().sort((a, b) => b.score - a.score);
  const pod = [s[1], s[0], s[2]];
  const H = [90, 130, 64], M = ['🥈', '🥇', '🥉'];
  show('gameEnd', `
    <div class="title" style="margin-top:20px">🏆 Clasificación</div>
    <div class="sub">Puntos acumulados</div>
    <div class="podium">${pod.map((p, i) => p ? `<div><div class="n">${esc(p.name)}</div><div class="s">${p.score} pts</div>
      <div class="col" style="height:${H[i]}px;background:${p.color}">${M[i]}</div></div>` : '<div></div>').join('')}</div>
    <div class="card">${playerListHTML(true)}</div>
    ${isHost ? '<button class="btn" id="lobby">🎮 Otro minijuego</button>' + P.homeButton() : '<div class="sub">El anfitrión elegirá el siguiente juego</div>'}`);
  on('#lobby', 'click', backToLobby); P.bindHome();
  buzz([30, 30, 30, 30, 80]);
}

/* --- impostor (vistas) --- */
function renderImp(m) {
  show('imp', `
    <div class="hud"><span><b>🕵️ Impostor</b></span><span>Categoría: <b>${esc(m.cat)}</b></span></div>
    <div class="secret" id="sec"><div style="font-size:44px">🙈</div><div class="w" style="font-size:26px">Toca para ver tu palabra</div><div class="hint">Que nadie mire tu pantalla</div></div>
    <div class="card"><ul class="rules">
      <li>Por turnos, cada uno dice <b>una palabra</b> relacionada con la secreta.</li>
      <li>Empieza <b>${esc(m.starter)}</b> y seguís en círculo. Haced 2 o 3 vueltas.</li>
      <li>El impostor no sabe la palabra: debe disimular. Si le pilláis, <b>+2</b> para el resto; si se libra, <b>+3</b> para él.</li>
    </ul></div>
    ${isHost ? '<button class="btn pink" id="tovote">Pasar a la votación</button>' : '<div class="sub">Cuando acabéis, el anfitrión abrirá la votación</div>'}`);
  let openS = false;
  const sec = $('#sec');
  sec.addEventListener('click', () => {
    openS = !openS;
    if (openS) {
      sec.className = 'secret open' + (m.impostor ? ' imp' : '');
      sec.innerHTML = m.impostor
        ? `<div class="k">Tu papel</div><div class="w">🕵️ Eres el IMPOSTOR</div><div class="hint">Categoría: ${esc(m.cat)} · ¡Disimula!</div><div class="hint" style="margin-top:10px;font-size:13px">Toca para ocultar</div>`
        : `<div class="k">Palabra secreta</div><div class="w">${esc(m.word)}</div><div class="hint">Hay un impostor entre vosotros</div><div class="hint" style="margin-top:10px;font-size:13px">Toca para ocultar</div>`;
      buzz(20);
    } else {
      sec.className = 'secret';
      sec.innerHTML = '<div style="font-size:44px">🙈</div><div class="w" style="font-size:26px">Toca para ver tu palabra</div><div class="hint">Que nadie mire tu pantalla</div>';
    }
  });
  on('#tovote', 'click', impToVote);
}
function renderImpVote() {
  const others = players.filter(p => p.id !== myId);
  show('impVote', `
    <div class="hud"><span><b>🕵️ Impostor</b></span><span id="vc">0 / ${players.length} votos</span></div>
    <div class="title">¿Quién es el impostor?</div>
    <div class="sub">Toca a quien quieras votar</div>
    <div id="vl">${others.map(p => `<button class="vote" data-id="${esc(p.id)}"><span class="dot" style="background:${p.color}"></span>${esc(p.name)}</button>`).join('')}</div>
    ${isHost ? '<button class="btn sec small" id="close" style="margin-top:14px">Cerrar votación ya</button>' : ''}`);
  $$('.vote').forEach(b => b.addEventListener('click', () => {
    if (b.disabled) return;
    $$('.vote').forEach(x => x.disabled = true);
    b.classList.add('sel'); b.disabled = false;
    toHost({ t: 'vote', target: b.dataset.id });
    buzz(20);
    toast('Voto enviado');
  }));
  on('#close', 'click', impEnd);
}
function renderImpEnd(m) {
  show('impEnd', `
    <div class="hud"><span><b>🕵️ Impostor</b></span><span>${esc(m.cat)}</span></div>
    <div class="mid" style="flex:none;margin:16px 0">
      <div style="font-size:60px">${m.caught ? '🚨' : '😈'}</div>
      <div class="title">${m.caught ? '¡Impostor pillado!' : '¡El impostor se ha librado!'}</div>
      <div class="sub">Era <b style="color:var(--acc2)">${esc(m.impName)}</b> · La palabra era <b style="color:var(--acc)">${esc(m.word)}</b></div>
    </div>
    <div class="card"><h3 style="margin-bottom:6px">Votos</h3><ul class="plist">${m.tally.map(t => `<li><span class="dot" style="background:${t.color}"></span>
      <span class="nm">${esc(t.name)}${t.imp ? '<span class="tag">🕵️ IMPOSTOR</span>' : ''}</span><span class="pts">${t.n}</span></li>`).join('')}</ul></div>
    <div class="card"><h3 style="margin-bottom:6px">Puntos</h3>${playerListHTML(true)}</div>
    ${isHost ? '<button class="btn" id="lobby">🎮 Otro minijuego</button>' + P.homeButton() : '<div class="sub">Esperando al anfitrión…</div>'}`);
  on('#lobby', 'click', backToLobby); P.bindHome();
}


return {
  open() { renderLobby(); },
  onMsg,
  onHost: (id, m) => hostHandle(id, m),
  onPlayers(list) { players = list; if (screen === 'lobby') renderLobby(); else updateLive(); },
  onLeave: dropPlayer,
  destroy() {
    clearTimers();
    if (viewCleanup) { const c = viewCleanup; viewCleanup = null; try { c(); } catch (e) {} }
    viewToken++;
    if (G) { clearTimeout(G.timer); clearInterval(G.relay); G = null; }
    IMP = null;
  },
};
  }
});
