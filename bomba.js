/* Desactivar la bomba: cooperativo. Un artificiero ve la bomba, los demás tienen el manual. */
Party.register({
  id: 'bomba', name: 'Desactivar la bomba', emoji: '💣', players: '2-10', min: 2, wide: true,
  desc: 'Cooperativo contrarreloj: uno ve la bomba, los demás tienen partes del manual. ¡Solo podéis hablar!',
  create(P) {
'use strict';

/* ---------- utilidades ---------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const app = $('#app');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
const toast = P.toast;
const isHost = P.isHost, myId = P.myId;
let players = P.players();
const room = P.room;
let screen = '', timers = [], viewToken = 0;
function clearTimers() { timers.forEach(t => { clearTimeout(t); clearInterval(t); }); timers = []; }
function later(fn, ms) { const t = setTimeout(fn, ms); timers.push(t); return t; }
function every(fn, ms) { const t = setInterval(fn, ms); timers.push(t); return t; }
function show(name, html) { clearTimers(); viewToken++; screen = name; app.innerHTML = html; window.scrollTo(0, 0); }
function on(sel, ev, fn) { const el = typeof sel === 'string' ? $(sel) : sel; if (el) el.addEventListener(ev, fn); }
const send = (id, m) => P.send(id, m), broadcast = m => P.broadcast(m), toHost = m => P.toHost(m);
const pl = id => players.find(p => p.id === id) || { name: '¿?', color: '#888' };
const chip = id => `<b style="color:${pl(id).color}">${esc(pl(id).name)}</b>`;

let actx = null;
function audio() { try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) {} return actx; }
function tone(f, d = 0.12, type = 'sine', vol = 0.12, slide = 0) {
  const a = audio(); if (!a) return;
  try { const o = a.createOscillator(), g = a.createGain(), t = a.currentTime; o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + 0.02); } catch (e) {}
}
const SFX = {
  beep: () => tone(1500, .05, 'square', .04),
  strike: () => { tone(140, .4, 'sawtooth', .14, -60); },
  solve: () => { tone(880, .1, 'triangle', .1); setTimeout(() => tone(1320, .15, 'triangle', .1), 90); },
  boom: () => { tone(90, 1.4, 'sawtooth', .2, -60); setTimeout(() => tone(60, 1.2, 'square', .15, -30), 120); },
  win: () => [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => tone(f, .2, 'triangle', .13), i * 110)),
  cut: () => tone(2400, .05, 'square', .05, -1800),
  pad: f => tone(f, .25, 'sine', .14),
};

/* =====================================================
   DATOS Y REGLAS (idénticos para todos los móviles)
   ===================================================== */
const WIRE_C = { rojo: '#ff4d4d', azul: '#4d8bff', amarillo: '#ffd23f', blanco: '#f4f4f4', negro: '#1a1a1a' };
const WIRE_N = Object.keys(WIRE_C);
const BTN_C = { rojo: '#e0384d', azul: '#3d7bff', amarillo: '#f2c230', blanco: '#eeeeee' };
const BTN_L = ['ABORTAR', 'DETONAR', 'MANTENER', 'PULSAR'];
const STRIP_C = { azul: '#4d8bff', amarillo: '#ffd23f', blanco: '#ffffff', rojo: '#ff4d4d' };
const INDS = ['FRQ', 'CAR', 'SND', 'BOB', 'NSA', 'TRN', 'MSA'];
const SYM_COLS = [
  ['★', '☾', 'Ω', 'ψ', '¶', '☯', '∆'],
  ['✿', '★', '∆', '☂', '♞', '€', 'Ω'],
  ['©', '¿', '☂', 'Ж', 'λ', '☾', '✿'],
  ['Ξ', '¶', '♫', 'λ', '€', '¿', '☼'],
  ['∞', '☼', '♫', '✈', 'Ж', 'ψ', '§'],
  ['Φ', '∞', '✈', '♞', '§', 'Ξ', 'π'],
];
const SIMON = ['rojo', 'azul', 'verde', 'amarillo'];
const SIMON_C = { rojo: '#ff4d4d', azul: '#4d8bff', verde: '#3ddc84', amarillo: '#ffd23f' };
const SIMON_F = { rojo: 330, azul: 440, verde: 554, amarillo: 659 };
// tabla: [con vocal en la serie][fallos][color que destella] = color a pulsar
const SIMON_MAP = {
  vocal: [
    { rojo: 'azul', azul: 'rojo', verde: 'amarillo', amarillo: 'verde' },
    { rojo: 'amarillo', azul: 'verde', verde: 'azul', amarillo: 'rojo' },
    { rojo: 'verde', azul: 'rojo', verde: 'amarillo', amarillo: 'azul' },
  ],
  sin: [
    { rojo: 'azul', azul: 'amarillo', verde: 'verde', amarillo: 'rojo' },
    { rojo: 'rojo', azul: 'azul', verde: 'amarillo', amarillo: 'verde' },
    { rojo: 'amarillo', azul: 'verde', verde: 'azul', amarillo: 'rojo' },
  ],
};
const WORDS = ['PERRO', 'GATOS', 'LIBRO', 'PLAZA', 'NOCHE', 'FUEGO', 'TIGRE', 'VERDE', 'RELOJ', 'CAMPO', 'PIANO', 'MUNDO', 'SILLA', 'LLAVE', 'FRESA', 'NUBES',
  'TECHO', 'BARCO', 'LIMON', 'HUEVO', 'MONTE', 'RATON', 'QUESO', 'PLATO', 'TORRE', 'BRAZO', 'CARTA', 'DULCE', 'JUEGO', 'SALSA', 'PAPEL', 'ARBOL', 'CIELO', 'ROBOT'];
const TITLES = { cables: '✂️ Cables', boton: '🔴 El botón', simbolos: '🔣 Símbolos', simon: '🟦 Simón dice', clave: '🔤 Contraseña' };

const lastDigit = b => +b.serial.slice(-1);
const hasVowel = b => /[AEIOU]/.test(b.serial);
const lit = (b, l) => b.inds.some(i => i.l === l && i.on);

function solveWires(w, b) {
  const n = w.length, cnt = c => w.filter(x => x === c).length, last = c => w.lastIndexOf(c);
  if (n === 3) { if (cnt('rojo') === 1) return w.indexOf('rojo'); if (w[0] === 'azul') return 2; return 1; }
  if (n === 4) {
    if (cnt('amarillo') > cnt('azul')) return last('amarillo');
    if (lastDigit(b) % 2 === 0) return 0;
    const k = w.indexOf('negro'); if (k >= 0) return k === n - 1 ? 0 : k + 1;
    return 2;
  }
  if (n === 5) {
    if (!cnt('blanco')) return 3;
    if (b.bat >= 2) { const r = w.indexOf('rojo'); return r >= 0 ? r : 1; }
    if (w[n - 1] === 'negro') return 0;
    return 4;
  }
  const triple = WIRE_N.filter(c => cnt(c) >= 3);
  if (triple.length) return last(triple[0]);
  if (lit(b, 'FRQ')) return 1;
  return 3;
}
function solveButton(m, b) {
  if (m.color === 'rojo' && m.label === 'MANTENER') return 'tap';
  if (b.bat > 1 && m.label === 'DETONAR') return 'tap';
  if (m.color === 'azul' && m.label === 'ABORTAR') return 'hold';
  if (lit(b, 'CAR')) return 'hold';
  if (m.color === 'blanco') return 'hold';
  return 'tap';
}
const holdDigit = strip => strip === 'azul' ? '4' : strip === 'amarillo' ? '5' : '1';

/* =====================================================
   ANFITRIÓN
   ===================================================== */
let settings = { level: 1, def: null };
let R = null;   // ronda activa
function genSerial() {
  const L = 'ABCDEFGHIJKLMNPQRSTUVWXZ', D = '0123456789';
  let s = ''; for (let i = 0; i < 5; i++) s += Math.random() < 0.55 ? L[ri(0, L.length - 1)] : D[ri(0, 9)];
  return s + D[ri(0, 9)];
}
function genModule(type, b) {
  if (type === 'cables') {
    let w;
    do {
      const n = ri(3, 6); w = Array.from({ length: n }, () => pick(WIRE_N));
    } while (w.length === 6 && WIRE_N.filter(c => w.filter(x => x === c).length >= 3).length > 1);
    return { type, wires: w, sol: solveWires(w, b) };
  }
  if (type === 'boton') {
    const m = { type, color: pick(Object.keys(BTN_C)), label: pick(BTN_L), strip: pick(Object.keys(STRIP_C)) };
    m.sol = solveButton(m, b); return m;
  }
  if (type === 'simbolos') {
    for (;;) {
      const ci = ri(0, SYM_COLS.length - 1), col = SYM_COLS[ci];
      const four = shuffle(col.map((_, i) => i)).slice(0, 4).sort((a, c) => a - c).map(i => col[i]);
      const others = SYM_COLS.filter((c, j) => j !== ci && four.every(s => c.includes(s)));
      if (others.length) continue;
      return { type, keys: shuffle(four), order: four };
    }
  }
  if (type === 'simon') { const n = ri(3, 5); return { type, seq: Array.from({ length: n }, () => pick(SIMON)) }; }
  if (type === 'clave') {
    for (;;) {
      const word = pick(WORDS), AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const cols = [...word].map(ch => { const s = new Set([ch]); while (s.size < 6) s.add(AZ[ri(0, 25)]); return shuffle([...s]); });
      if (WORDS.some(w => w !== word && [...w].every((ch, i) => cols[i].includes(ch)))) continue;
      return { type, cols, word, start: cols.map(() => ri(0, 5)) };
    }
  }
}
function genBomb(level) {
  const b = { serial: genSerial(), bat: ri(0, 4), inds: shuffle(INDS).slice(0, ri(1, 2)).map(l => ({ l, on: Math.random() < 0.55 })) };
  const n = Math.min(6, level + 2);
  const base = shuffle(['cables', 'boton', 'simbolos', 'simon', 'clave']);
  const types = [];
  for (let i = 0; i < n; i++) types.push(i < 5 ? base[i] : pick(['cables', 'simbolos', 'clave']));
  if (level === 1 && !types.includes('cables')) types[0] = 'cables';
  b.mods = types.map(t => genModule(t, b));
  return b;
}
const LEVEL_MS = lv => (lv <= 1 ? 240 : lv === 2 ? 270 : lv === 3 ? 300 : lv === 4 ? 330 : 360) * 1000;
function hostStart() {
  if (R && !R.over) return;
  if (room.players.length < 2) { toast('Hacen falta al menos 2 jugadores'); return; }
  const ids = room.players.map(p => p.id);
  const def = ids.includes(settings.def) ? settings.def : ids[0];
  const level = settings.level;
  const bomb = genBomb(level), ms = LEVEL_MS(level);
  const experts = ids.filter(id => id !== def);
  const types = [...new Set(bomb.mods.map(m => m.type))];
  const pages = {}; experts.forEach(id => pages[id] = []);
  shuffle(types).forEach((t, i) => pages[experts[i % experts.length]].push(t));
  experts.forEach((id, j) => { if (!pages[id].length) pages[id].push(types[j % types.length]); });
  R = { def, level, bomb, deadline: Date.now() + 4000 + ms, startAt: Date.now() + 4000, strikes: 0, solved: [], over: false };
  broadcast({ t: 'start', def, level, ms, nmods: bomb.mods.length, cd: 4000 });
  send(def, { t: 'bomb', bomb });
  experts.forEach(id => send(id, { t: 'manual', pages: pages[id] }));
  R.tick = setInterval(hostTick, 250);
}
function hostTick() {
  if (!R || R.over) return;
  const left = Math.max(0, R.deadline - Date.now());
  broadcast({ t: 'st', left: Math.min(left, R.deadline - R.startAt), strikes: R.strikes, solved: R.solved, go: Date.now() >= R.startAt });
  if (left <= 0) hostFinish(false, 'time');
}
function hostHandle(id, m) {
  if (!R || R.over || id !== R.def || Date.now() < R.startAt) return;
  if (m.t === 'strike') {
    R.strikes++; R.deadline -= 15000;
    broadcast({ t: 'strk', mod: m.mod, strikes: R.strikes });
    if (R.strikes >= 3) hostFinish(false, 'strikes');
  } else if (m.t === 'solve') {
    if (!R.solved.includes(m.mod) && m.mod >= 0 && m.mod < R.bomb.mods.length) R.solved.push(m.mod);
    broadcast({ t: 'slv', mod: m.mod, solved: R.solved });
    if (R.solved.length === R.bomb.mods.length) hostFinish(true, 'ok');
  }
}
function hostFinish(win, reason) {
  if (!R || R.over) return;
  R.over = true; clearInterval(R.tick);
  const left = Math.max(0, R.deadline - Date.now());
  const pts = win ? 2 + R.level : 0;
  if (win) room.players.forEach(p => { p.score += pts + (p.id === R.def ? 1 : 0); });
  const ids = room.players.map(p => p.id);
  settings.def = ids[(ids.indexOf(R.def) + 1) % ids.length];
  const playedLevel = R.level;
  if (win) settings.level = Math.min(8, settings.level + 1);
  P.broadcastPlayers();
  broadcast({ t: 'res', win, reason, level: playedLevel, left, strikes: R.strikes, def: R.def, pts, solved: R.solved.length, total: R.bomb.mods.length, bomb: R.bomb });
  broadcast({ t: 'set', settings });
}
function hostLeave(id) {
  if (R && !R.over && id === R.def) { hostFinish(false, 'left'); }
  if (settings.def === id) settings.def = null;
}
function sync() { broadcast({ t: 'set', settings }); }

/* =====================================================
   VISTAS
   ===================================================== */
const st = { left: 0, at: 0, strikes: 0, solved: [], go: false };
function curLeft() { return Math.max(0, st.left - (st.go ? (performance.now() - st.at) : 0)); }
function clock(ms) { const s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function strikesHTML(n) { return [0, 1, 2].map(i => `<span class="bx${i < n ? ' on' : ''}">✖</span>`).join(''); }
function topbar() {
  return `<div class="btop"><div class="lcd" id="lcd">--:--</div><div class="bstr" id="bstr">${strikesHTML(st.strikes)}</div></div>`;
}
function runClock() {
  let lastSec = -1;
  every(() => {
    const ms = curLeft(), e = $('#lcd'); if (!e) return;
    e.textContent = clock(ms); e.classList.toggle('low', ms < 30000);
    const s = Math.ceil(ms / 1000);
    if (st.go && s !== lastSec) { lastSec = s; if (screen === 'defuse' || (screen === 'manual' && (s <= 30 || s % 5 === 0))) SFX.beep(); }
  }, 100);
}

/* --- preparación --- */
function renderSetup(note) {
  const ids = players.map(p => p.id);
  const def = ids.includes(settings.def) ? settings.def : ids[0];
  show('setup', `<div class="bomb-bg"></div>
    <div class="hubtop"><h1>💣 Desactivar <span>la bomba</span></h1><div class="codechip"><b>${esc(P.code)}</b></div></div>
    ${note || ''}
    <div class="card" style="text-align:center">
      <div class="mute" style="font-weight:700;text-transform:uppercase;letter-spacing:2px;font-size:12px">Nivel</div>
      <div style="font-size:54px;font-weight:900;color:var(--acc);line-height:1.1">${settings.level}</div>
      <div class="mute" style="font-weight:700">${Math.min(6, settings.level + 2)} módulos · ${clock(LEVEL_MS(settings.level))} · 3 fallos</div>
    </div>
    <div class="card"><h3 style="margin-bottom:8px">🧑‍🔧 Artificiero${isHost ? ' (toca para cambiar)' : ''}</h3>
      <div class="pgrid">${players.map(p => `<button class="pbtn${p.id === def ? ' sel' : ''}" data-id="${esc(p.id)}"${isHost ? '' : ' disabled style="opacity:1"'}><span class="dot" style="background:${p.color}"></span><span class="nm">${esc(p.name)}${p.id === myId ? ' (tú)' : ''}</span>${p.id === def ? '💣' : '📖'}</button>`).join('')}</div>
      <div class="mute" style="font-size:13px;margin-top:8px">💣 ve la bomba · 📖 los demás reciben partes del manual</div></div>
    ${isHost ? `<button class="btn go" id="go">💣 ¡Armar la bomba!</button>
      ${settings.level > 1 ? '<button class="btn sec small" id="lv1">Volver al nivel 1</button>' : ''}
      ${P.homeButton()}` : '<div class="card" style="text-align:center"><b>Esperando al anfitrión…</b></div>'}
    <div class="card"><h3 style="margin-bottom:8px">Cómo se juega</h3><ul class="rules">
      <li>El <b>artificiero</b> ve la bomba, pero no sabe cómo desactivarla.</li>
      <li>Los <b>expertos</b> tienen el manual repartido: cada uno ve <b>solo algunas páginas</b>.</li>
      <li><b>¡No enseñéis las pantallas!</b> Solo vale hablar: el artificiero describe y los expertos le guían.</li>
      <li>Algunas reglas dependen del <b>número de serie, las pilas y las luces</b> de la bomba: ¡preguntadlos!</li>
      <li>Cada error es un <b>fallo</b> (−15 s). Con <b>3 fallos</b> o sin tiempo… 💥</li>
    </ul></div>`);
  if (isHost) {
    $$('.pbtn').forEach(b => b.addEventListener('click', () => { settings.def = b.dataset.id; sync(); }));
    on('#go', 'click', () => { audio(); hostStart(); });
    on('#lv1', 'click', () => { settings.level = 1; sync(); });
    P.bindHome();
  }
}

/* --- cuenta atrás común --- */
let role = null, mods = [], bomb = null, manualPages = [];
function renderStart(m) {
  role = m.def === myId ? 'def' : 'exp';
  bomb = null; manualPages = [];
  st.left = m.ms; st.at = performance.now(); st.strikes = 0; st.solved = []; st.go = false;
  show('cd', `<div class="bomb-bg"></div><div class="mid">
    <div style="font-size:70px">${role === 'def' ? '💣' : '📖'}</div>
    <div class="title">${role === 'def' ? 'Eres el artificiero' : 'Eres experto en explosivos'}</div>
    <div class="sub">${role === 'def' ? 'Describe lo que ves. ¡No enseñes la pantalla!' : `Guía a ${chip(m.def)} con tu parte del manual`}</div>
    <div class="title" id="cdn" style="font-size:64px;color:var(--acc)">4</div>
    <div class="sub">Nivel ${m.level} · ${m.nmods} módulos</div></div>`);
  const end = performance.now() + m.cd;
  every(() => { const e = $('#cdn'); if (!e) return; const s = Math.ceil((end - performance.now()) / 1000); e.textContent = s > 0 ? s : '¡YA!'; if (s <= 0) { if (role === 'def' && bomb) renderDefuse(); else if (role === 'exp' && manualPages.length) renderManual(); } }, 200);
}

/* --- artificiero --- */
function report(i, ok) {
  const mod = mods[i]; if (!mod || mod.done) return;
  if (ok) { mod.done = true; toHost({ t: 'solve', mod: i }); SFX.solve(); buzz(40); const el = $(`#mod${i}`); if (el) el.classList.add('done'); }
  else { toHost({ t: 'strike', mod: i }); SFX.strike(); buzz([150, 60, 150]); const el = $(`#mod${i}`); if (el) { el.classList.remove('bad'); void el.offsetWidth; el.classList.add('bad'); } }
}
function bombInfoHTML(b) {
  return `<div class="binfo">
    <div class="serial"><small>Nº de serie</small><b>${b.serial}</b></div>
    <div class="bat"><small>Pilas</small><b>${b.bat ? '🔋'.repeat(b.bat) : '—'}</b></div>
    <div class="inds"><small>Luces</small>${b.inds.map(i => `<span class="ind${i.on ? ' on' : ''}"><i></i>${i.l}</span>`).join('')}</div></div>`;
}
function renderDefuse() {
  const b = bomb;
  mods = b.mods.map((m, i) => ({ ...m, done: st.solved.includes(i), i }));
  show('defuse', `<div class="bomb-bg"></div>${topbar()}${bombInfoHTML(b)}
    <div id="mods">${mods.map((m, i) => `<div class="mod${m.done ? ' done' : ''}" id="mod${i}"><div class="mhead"><span>${i + 1} · ${TITLES[m.type]}</span><i class="led"></i></div><div class="mbody" id="mb${i}"></div></div>`).join('')}</div>`);
  runClock();
  mods.forEach((m, i) => {
    const el = $(`#mb${i}`);
    if (m.type === 'cables') modWires(m, el);
    else if (m.type === 'boton') modButton(m, el);
    else if (m.type === 'simbolos') modSymbols(m, el);
    else if (m.type === 'simon') modSimon(m, el);
    else if (m.type === 'clave') modPass(m, el);
  });
}
function modWires(m, el) {
  el.innerHTML = `<div class="wires">${m.wires.map((c, k) => `<button class="wire" data-k="${k}"><span class="wl" style="background:${WIRE_C[c]}"></span><span class="wr" style="background:${WIRE_C[c]}"></span></button>`).join('')}</div>`;
  el.querySelectorAll('.wire').forEach(w => w.addEventListener('click', () => {
    if (m.done || w.classList.contains('cut')) return;
    w.classList.add('cut'); SFX.cut();
    report(m.i, +w.dataset.k === m.sol);
  }));
}
function modButton(m, el) {
  el.innerHTML = `<div class="bwrap"><button class="bigbtn" style="background:${BTN_C[m.color]};color:${m.color === 'blanco' || m.color === 'amarillo' ? '#222' : '#fff'}">${m.label}</button>
    <div class="strip" id="strip${m.i}"></div></div><div class="mute" style="text-align:center;font-size:12px;margin-top:6px">Pulsa y suelta, o mantén pulsado</div>`;
  const btn = el.querySelector('.bigbtn'), strip = el.querySelector('.strip');
  let t0 = 0, held = false, stripT = null;
  btn.addEventListener('pointerdown', e => {
    e.preventDefault(); if (m.done) return;
    t0 = performance.now(); held = true; btn.classList.add('down');
    stripT = setTimeout(() => { if (held) { strip.style.background = STRIP_C[m.strip]; strip.classList.add('on'); } }, 500);
  });
  const up = () => {
    if (!held) return; held = false; clearTimeout(stripT); btn.classList.remove('down');
    const dur = performance.now() - t0; strip.classList.remove('on'); strip.style.background = '';
    if (m.done) return;
    if (dur < 500) report(m.i, m.sol === 'tap');
    else {
      if (m.sol !== 'hold') return report(m.i, false);
      report(m.i, clock(curLeft()).includes(holdDigit(m.strip)));
    }
  };
  btn.addEventListener('pointerup', up); btn.addEventListener('pointerleave', up); btn.addEventListener('pointercancel', up);
}
function modSymbols(m, el) {
  let step = 0;
  el.innerHTML = `<div class="keys">${m.keys.map(s => `<button class="key" data-s="${esc(s)}"><i></i><span>${s}</span></button>`).join('')}</div>`;
  el.querySelectorAll('.key').forEach(k => k.addEventListener('click', () => {
    if (m.done || k.classList.contains('ok')) return;
    if (k.dataset.s === m.order[step]) { k.classList.add('ok'); step++; SFX.beep(); if (step === 4) report(m.i, true); }
    else report(m.i, false);
  }));
}
function modSimon(m, el) {
  let stage = 1, pos = 0, lastTap = 0;
  el.innerHTML = `<div class="simon">${SIMON.map(c => `<button class="spad" data-c="${c}" style="--c:${SIMON_C[c]}"></button>`).join('')}</div><div class="mute" style="text-align:center;font-size:12px;margin-top:6px" id="sst${m.i}">Fase 1 de ${m.seq.length}</div>`;
  const pads = {}; el.querySelectorAll('.spad').forEach(p => pads[p.dataset.c] = p);
  const flash = (c, ms = 320) => { const p = pads[c]; p.classList.add('lit'); setTimeout(() => p.classList.remove('lit'), ms); };
  let ph = 0, nextAt = performance.now() + 900;
  every(() => {
    if (m.done || !st.go) return;
    const now = performance.now();
    if (now - lastTap < 2500 || now < nextAt) return;
    if (ph < stage) { flash(m.seq[ph]); ph++; nextAt = now + 600; }
    else { ph = 0; nextAt = now + 1800; }
  }, 50);
  el.querySelectorAll('.spad').forEach(p => p.addEventListener('pointerdown', e => {
    e.preventDefault(); if (m.done || !st.go) return;
    const c = p.dataset.c; flash(c, 180); SFX.pad(SIMON_F[c]); lastTap = performance.now();
    const map = SIMON_MAP[hasVowel(bomb) ? 'vocal' : 'sin'][Math.min(2, st.strikes)];
    if (c === map[m.seq[pos]]) {
      pos++;
      if (pos === stage) {
        pos = 0; stage++; ph = 0; nextAt = performance.now() + 1200; lastTap = 0;
        if (stage > m.seq.length) { report(m.i, true); $(`#sst${m.i}`).textContent = '¡Completado!'; }
        else $(`#sst${m.i}`).textContent = `Fase ${stage} de ${m.seq.length}`;
      }
    } else { pos = 0; report(m.i, false); }
  }));
}
function modPass(m, el) {
  const idx = m.start.slice();
  const draw = () => {
    el.innerHTML = `<div class="pass">${m.cols.map((c, k) => `<div class="pcol"><button data-k="${k}" data-d="-1">▲</button><b>${c[idx[k]]}</b><button data-k="${k}" data-d="1">▼</button></div>`).join('')}</div>
      <button class="btn small" id="psub${m.i}" style="margin-top:8px">Enviar</button>`;
    el.querySelectorAll('.pcol button').forEach(b => b.addEventListener('click', () => { if (m.done) return; const k = +b.dataset.k; idx[k] = (idx[k] + +b.dataset.d + 6) % 6; SFX.beep(); draw(); }));
    on(`#psub${m.i}`, 'click', () => { if (m.done) return; report(m.i, m.cols.map((c, k) => c[idx[k]]).join('') === m.word); });
  };
  draw();
}

/* --- expertos: manual --- */
function pageHTML(t) {
  if (t === 'cables') return `<h3>✂️ Cables</h3><p>Corta <b>un solo cable</b>. Cuéntalos de arriba abajo y aplica la <b>primera</b> regla que se cumpla.</p>
    <h4>3 cables</h4><ol><li>Si hay exactamente <b>un cable rojo</b> → corta el rojo.</li><li>Si el <b>primero es azul</b> → corta el tercero.</li><li>Si no → corta el <b>segundo</b>.</li></ol>
    <h4>4 cables</h4><ol><li>Si hay <b>más amarillos que azules</b> → corta el último amarillo.</li><li>Si el número de serie <b>termina en cifra par</b> → corta el primero.</li><li>Si hay algún <b>cable negro</b> → corta el que va justo después del primer negro (si el negro es el último, corta el primero).</li><li>Si no → corta el <b>tercero</b>.</li></ol>
    <h4>5 cables</h4><ol><li>Si <b>no hay ningún blanco</b> → corta el cuarto.</li><li>Si la bomba tiene <b>2 o más pilas</b> → corta el primer cable rojo (si no hay rojos, el segundo).</li><li>Si el <b>último es negro</b> → corta el primero.</li><li>Si no → corta el <b>quinto</b>.</li></ol>
    <h4>6 cables</h4><ol><li>Si hay <b>3 o más cables del mismo color</b> → corta el último de ese color.</li><li>Si hay una <b>luz FRQ encendida</b> → corta el segundo.</li><li>Si no → corta el <b>cuarto</b>.</li></ol>`;
  if (t === 'boton') return `<h3>🔴 El botón</h3><p>Aplica la <b>primera</b> regla que se cumpla:</p>
    <ol><li>Botón <b>rojo</b> que dice «MANTENER» → <b>pulsa y suelta</b>.</li><li>Más de <b>1 pila</b> y dice «DETONAR» → <b>pulsa y suelta</b>.</li><li>Botón <b>azul</b> que dice «ABORTAR» → <b>mantén pulsado</b>.</li><li>Hay una <b>luz CAR encendida</b> → <b>mantén pulsado</b>.</li><li>Botón <b>blanco</b> → <b>mantén pulsado</b>.</li><li>En cualquier otro caso → <b>pulsa y suelta</b>.</li></ol>
    <h4>Si hay que mantenerlo</h4><p>Al mantenerlo se enciende una <b>franja de color</b>. Suelta cuando el reloj tenga, en cualquier posición, el número:</p>
    <table class="mtab"><tr><td>Franja azul</td><td><b>4</b></td></tr><tr><td>Franja amarilla</td><td><b>5</b></td></tr><tr><td>Cualquier otra</td><td><b>1</b></td></tr></table>`;
  if (t === 'simbolos') return `<h3>🔣 Símbolos</h3><p>La bomba tiene 4 botones con símbolos. Solo <b>una</b> de estas columnas contiene los 4. Pulsa los botones en el <b>orden en que aparecen</b> en esa columna, de arriba abajo.</p>
    <div class="symcols">${SYM_COLS.map((c, i) => `<div><small>${i + 1}</small>${c.map(s => `<span>${s}</span>`).join('')}</div>`).join('')}</div>`;
  if (t === 'simon') {
    const tab = (mp, i) => `<tr><td>${i} fallo${i === 1 ? '' : 's'}</td>${SIMON.map(c => `<td><span class="sw" style="background:${SIMON_C[mp[c]]}"></span></td>`).join('')}</tr>`;
    const head = `<tr><th>Destella →</th>${SIMON.map(c => `<th><span class="sw" style="background:${SIMON_C[c]}"></span></th>`).join('')}</tr>`;
    return `<h3>🟦 Simón dice</h3><p>Los botones destellan en secuencia. Por cada color que destella, hay que pulsar <b>otro color</b> según esta tabla. Cada fase añade un destello: hay que repetir la secuencia entera traducida. La tabla depende de los <b>fallos que lleve la bomba</b> en ese momento.</p>
      <h4>Si el número de serie tiene una VOCAL</h4><table class="mtab">${head}${SIMON_MAP.vocal.map(tab).join('')}</table>
      <h4>Si NO tiene vocales</h4><table class="mtab">${head}${SIMON_MAP.sin.map(tab).join('')}</table>
      <p class="mute">Colores en orden: rojo, azul, verde, amarillo.</p>`;
  }
  if (t === 'clave') return `<h3>🔤 Contraseña</h3><p>La bomba tiene 5 ruedas de letras. Solo <b>una</b> de estas palabras se puede formar con ellas. Pide al artificiero las letras de cada rueda hasta descubrirla y que pulse <b>Enviar</b>.</p>
    <div class="words">${WORDS.map(w => `<span>${w}</span>`).join('')}</div>`;
  return '';
}
function renderManual() {
  let cur = 0;
  const draw = () => {
    show('manual', `<div class="bomb-bg"></div>${topbar()}
      <div class="note" style="font-size:14px">📞 Pide al artificiero el <b>nº de serie</b>, las <b>pilas</b> y las <b>luces</b> si alguna regla los necesita. Módulos resueltos: <b id="msolv">${st.solved.length}</b></div>
      <div class="tabs">${manualPages.map((t, i) => `<button class="tab${i === cur ? ' sel' : ''}" data-i="${i}">${TITLES[t]}</button>`).join('')}</div>
      <div class="manual">${pageHTML(manualPages[cur])}</div>
      <div class="mute" style="font-size:12px;text-align:center;margin-top:10px">Solo ves ${manualPages.length === 1 ? 'esta página' : 'estas páginas'}. Los demás expertos tienen otras.</div>`);
    runClock();
    $$('.tab').forEach(b => b.addEventListener('click', () => { cur = +b.dataset.i; draw(); }));
  };
  draw();
}

/* --- resultado --- */
function renderResult(m) {
  const reasonTxt = m.reason === 'time' ? 'Se acabó el tiempo' : m.reason === 'strikes' ? 'Tres fallos' : m.reason === 'left' ? 'El artificiero se ha ido' : '';
  show('bres', `<div class="bomb-bg${m.win ? '' : ' boom'}"></div><div class="mid" style="flex:none;margin-top:20px">
    <div style="font-size:84px" class="${m.win ? '' : 'shake'}">${m.win ? '✅' : '💥'}</div>
    <div class="title">${m.win ? '¡Bomba desactivada!' : 'BOOM'}</div>
    <div class="sub">${m.win ? `Con ${clock(m.left)} de margen y ${m.strikes} fallo${m.strikes === 1 ? '' : 's'}` : `${reasonTxt} · ${m.solved}/${m.total} módulos resueltos`}</div>
    ${m.win ? `<div class="note ok" style="text-align:center">🏆 +${m.pts} puntos para todos (+1 extra para ${chip(m.def)}, el artificiero)</div>` : ''}
  </div>
  <div class="card"><h3 style="margin-bottom:6px">Las soluciones eran…</h3><ul class="plist log" style="list-style:none">${m.bomb.mods.map((md, i) => `<li>${i + 1} · ${TITLES[md.type]}: ${solText(md)}</li>`).join('')}</ul>
    <div class="mute" style="font-size:12px;margin-top:6px">Serie ${m.bomb.serial} · ${m.bomb.bat} pila${m.bomb.bat === 1 ? '' : 's'} · ${m.bomb.inds.map(i => i.l + (i.on ? ' encendida' : ' apagada')).join(', ')}</div></div>
  ${isHost ? `<button class="btn go" id="next">${m.win ? '➡️ Siguiente nivel' : '🔁 Reintentar'}</button>${P.homeButton()}` : '<div class="sub">Esperando al anfitrión…</div>'}`);
  if (m.win) { SFX.win(); buzz([50, 50, 50, 50, 150]); } else { SFX.boom(); buzz([400, 100, 400]); }
  on('#next', 'click', () => broadcast({ t: 'setup' }));
  P.bindHome();
}
function solText(md) {
  if (md.type === 'cables') return `cortar el ${['1º', '2º', '3º', '4º', '5º', '6º'][md.sol]} cable (${md.wires[md.sol]})`;
  if (md.type === 'boton') return md.sol === 'tap' ? 'pulsar y soltar' : `mantener y soltar con un ${holdDigit(md.strip)} (franja ${md.strip})`;
  if (md.type === 'simbolos') return md.order.join(' → ');
  if (md.type === 'simon') return `secuencia ${md.seq.join(', ')}`;
  if (md.type === 'clave') return md.word;
  return '';
}

function onMsg(m) {
  switch (m.t) {
    case 'set': settings = m.settings; if (screen === 'setup') renderSetup(); break;
    case 'setup': R = null; renderSetup(); break;
    case 'start': renderStart(m); break;
    case 'bomb': bomb = m.bomb; break;
    case 'manual': manualPages = m.pages; break;
    case 'st':
      st.left = m.left; st.at = performance.now(); st.go = m.go;
      if (m.strikes !== st.strikes) { st.strikes = m.strikes; const e = $('#bstr'); if (e) e.innerHTML = strikesHTML(st.strikes); }
      st.solved = m.solved; { const e = $('#msolv'); if (e) e.textContent = m.solved.length; }
      break;
    case 'strk':
      st.strikes = m.strikes; { const e = $('#bstr'); if (e) e.innerHTML = strikesHTML(st.strikes); }
      if (role === 'exp') { SFX.strike(); buzz(120); const e = $('#lcd'); if (e) { e.classList.remove('flash'); void e.offsetWidth; e.classList.add('flash'); } }
      break;
    case 'slv': st.solved = m.solved; { const e = $('#msolv'); if (e) e.textContent = m.solved.length; } if (role === 'exp') SFX.solve(); break;
    case 'res': renderResult(m); break;
  }
}

if (location.hash === '#debug') window.__B = () => ({ R, bomb, mods, st, solveWires, solveButton, holdDigit, SIMON_MAP, hasVowel });
return {
  open() { if (isHost) sync(); renderSetup(); },
  onMsg,
  onHost: (id, m) => hostHandle(id, m),
  onPlayers(list) { players = list; if (screen === 'setup') renderSetup(); },
  onLeave: hostLeave,
  destroy() { clearTimers(); viewToken++; if (R) { clearInterval(R.tick); R.over = true; R = null; } },
};
  }
});
