/* Asesinato en la mansión: deducción con pistas repartidas, investigación y un asesino que inculpa */
Party.register({
  id: 'mansion', name: 'Asesinato en la mansión', emoji: '🕵️', players: '3-12', min: 3, wide: true,
  desc: 'Un caso nuevo cada partida: pistas secretas, coartadas y un asesino entre vosotros. ¿Quién, con qué y dónde?',
  create(P) {
'use strict';

/* ---------- utilidades ---------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const app = $('#app');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
const toast = P.toast;
const isHost = P.isHost, myId = P.myId;
let players = P.players();
const room = P.room;
let screen = '', timers = [], viewToken = 0;
function clearTimers() { timers.forEach(t => { clearTimeout(t); clearInterval(t); }); timers = []; }
function every(fn, ms) { const t = setInterval(fn, ms); timers.push(t); return t; }
function show(name, html) { clearTimers(); viewToken++; screen = name; app.innerHTML = html; window.scrollTo(0, 0); }
function on(sel, ev, fn) { const el = typeof sel === 'string' ? $(sel) : sel; if (el) el.addEventListener(ev, fn); }
const send = (id, m) => P.send(id, m), broadcast = m => P.broadcast(m), toHost = m => P.toHost(m);
const pl = id => players.find(p => p.id === id) || room.players.find(p => p.id === id) || { name: '¿?', color: '#888' };
const nm = id => esc(pl(id).name);

let actx = null;
function audio() { try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) {} return actx; }
function tone(f, d = 0.2, type = 'sine', vol = 0.1, slide = 0) {
  const a = audio(); if (!a) return;
  try { const o = a.createOscillator(), g = a.createGain(), t = a.currentTime; o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + 0.02); } catch (e) {}
}
const SFX = {
  clue: () => { tone(660, .12, 'triangle', .1); setTimeout(() => tone(990, .18, 'triangle', .1), 100); },
  thunder: () => tone(70, 1.2, 'sawtooth', .12, -30),
  reveal: () => [262, 311, 392, 523].forEach((f, i) => setTimeout(() => tone(f, .35, 'triangle', .12), i * 200)),
  win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, .25, 'triangle', .13), i * 120)),
};

/* ---------- datos del caso ---------- */
const CHARS = [
  { n: 'Condesa Valdés', e: '👑', m: 'Heredera en disputa' }, { n: 'Mayordomo Ramírez', e: '🤵', m: '30 años de servicio… y ni un aumento' },
  { n: 'Doctora Ibáñez', e: '🩺', m: 'Firmaba sus recetas' }, { n: 'Chef Moreau', e: '👨‍🍳', m: 'Lo despidieron esa misma tarde' },
  { n: 'Sobrina Lucía', e: '🎀', m: 'Heredaría todo si él moría' }, { n: 'Jardinero Tomás', e: '🌹', m: 'Le debían tres meses de sueldo' },
  { n: 'Abogado Ferrer', e: '💼', m: 'Guardaba el testamento' }, { n: 'Cantante Estrella', e: '🎤', m: 'Antigua amante despechada' },
  { n: 'Capitán Ortega', e: '⚓', m: 'Socio en un negocio turbio' }, { n: 'Pintora Iris', e: '🎨', m: 'Le acusaba de robarle un cuadro' },
  { n: 'Profesor Salas', e: '📚', m: 'Investigaba sus secretos' }, { n: 'Ama de llaves Petra', e: '🗝️', m: 'Tiene todas las llaves de la casa' },
];
const VICTIMS = ['Don Aurelio Montenegro', 'Lady Beatriz Ashcombe', 'el magnate Julián Ferrán', 'Doña Rosalía del Valle', 'el barón Octavio Rivas', 'la millonaria Clotilde Sanz'];
const EVENTS = ['su 70 cumpleaños', 'la lectura de su testamento', 'una cena de gala', 'la presentación de su colección de arte', 'su fiesta de jubilación'];
const MANSIONS = ['Villa Cuervo', 'Mansión Bellavista', 'Castillo de Peñagris', 'la Casona del Acantilado', 'Palacio Altamira'];
const WEAPONS = [['🕯️', 'Candelabro'], ['🧪', 'Veneno'], ['🔪', 'Cuchillo de plata'], ['🪢', 'Cordón de cortina'], ['🔫', 'Pistola de duelo'], ['🗿', 'Estatuilla de bronce'], ['✉️', 'Abrecartas'], ['🔥', 'Atizador'], ['🍷', 'Copa envenenada']];
const ROOMS = [['📚', 'Biblioteca'], ['🍳', 'Cocina'], ['🌿', 'Invernadero'], ['💃', 'Salón de baile'], ['🍾', 'Bodega'], ['🖋️', 'Estudio'], ['⛪', 'Capilla'], ['🕰️', 'Torre del reloj'], ['🎱', 'Sala de billar']];
const CATS = {
  calzado: { e: '👣', n: 'Calzado', vals: ['botas embarradas', 'zapatos de charol', 'zapatillas de seda'], ev: v => `Junto al cuerpo había huellas de <b>${v}</b>.` },
  mano: { e: '✋', n: 'Mano', vals: ['zurdo', 'diestro'], ev: v => `Por la herida, el asesino es <b>${v}</b>.` },
  olor: { e: '👃', n: 'Olor', vals: ['rosas', 'tabaco de pipa', 'lejía'], ev: v => `En la escena olía a <b>${v}</b>.` },
  prenda: { e: '🧵', n: 'Prenda', vals: ['guantes de cuero', 'bufanda de lana', 'sombrero de copa'], ev: v => `Se encontró una fibra de <b>${v}</b>.` },
};
const CAT_K = Object.keys(CATS);

/* ---------- generador del caso (anfitrión) ---------- */
function genTraits(n, culprit) {
  let best = null, bestScore = -1;
  for (let k = 0; k < 400; k++) {
    const tr = Array.from({ length: n }, () => Object.fromEntries(CAT_K.map(c => [c, Math.floor(Math.random() * CATS[c].vals.length)])));
    const key = t => CAT_K.map(c => t[c]).join('');
    if (tr.some((t, i) => i !== culprit && key(t) === key(tr[culprit]))) continue;
    // cuántos sospechosos comparten cada rasgo del culpable (más = más difícil con una sola pista)
    const shared = CAT_K.map(c => tr.filter((t, i) => i !== culprit && t[c] === tr[culprit][c]).length);
    const score = shared.filter(s => s >= 1).length * 10 - Math.abs(shared.reduce((a, b) => a + b, 0) - n);
    if (score > bestScore) { best = tr; bestScore = score; }
    if (n <= 3 || shared.every(s => s >= 1)) { if (score >= 40 || n <= 4) return tr; }
  }
  if (best) return best;
  for (;;) { const tr = Array.from({ length: n }, () => Object.fromEntries(CAT_K.map(c => [c, Math.floor(Math.random() * CATS[c].vals.length)]))); const key = t => CAT_K.map(c => t[c]).join(''); if (!tr.some((t, i) => i !== culprit && key(t) === key(tr[culprit]))) return tr; }
}
function genCase(ids) {
  const n = ids.length, chars = shuffle(CHARS.map((c, i) => i)).slice(0, n);
  const ci = Math.floor(Math.random() * n), culprit = ids[ci];
  const traits = genTraits(n, ci);
  const weapons = shuffle(WEAPONS.map((w, i) => i)).slice(0, 6), rooms = shuffle(ROOMS.map((r, i) => i)).slice(0, 6);
  const weapon = pick(weapons), roomI = pick(rooms);
  const cast = ids.map((id, i) => ({ id, c: chars[i], tr: traits[i] }));
  return { culprit, weapon, room: roomI, weapons, rooms, cast, victim: pick(VICTIMS), event: pick(EVENTS), mansion: pick(MANSIONS) };
}
function planClues(cs, rounds) {
  const inno = shuffle(cs.cast.map(c => c.id).filter(id => id !== cs.culprit)), k = inno.length;
  const ctr = cs.cast.find(c => c.id === cs.culprit).tr;
  const plan = Array.from({ length: rounds }, () => ({}));
  const give = (r, id, clue) => { (plan[r][id] = plan[r][id] || []).push(clue); };
  let rr = 0;
  const cats = shuffle(CAT_K);
  const evRound = rounds === 2 ? [0, 0, 1, 1] : rounds === 3 ? [0, 0, 1, 2] : [0, 1, 2, 3];
  cats.forEach((c, i) => {
    const r = Math.min(rounds - 1, evRound[i]);
    const copies = Math.min(k, k >= 4 ? 2 : k >= 2 ? 2 : 1);
    for (let j = 0; j < copies; j++) { give(r, inno[rr % k], { kind: 'ev', cat: c, val: ctr[c] }); rr++; }
  });
  const elims = shuffle([...cs.weapons.filter(w => w !== cs.weapon).map(w => ({ kind: 'nw', w })), ...cs.rooms.filter(x => x !== cs.room).map(x => ({ kind: 'nr', r: x }))]);
  elims.forEach((e, i) => { const r = Math.min(rounds - 1, Math.floor(i * rounds / elims.length)); give(r, inno[rr % k], e); rr++; });
  // el asesino recibe pistas verdaderas de descarte para disimular
  for (let r = 0; r < rounds; r++) give(r, cs.culprit, elims[(r * 3 + 1) % elims.length]);
  return plan;
}
function clueText(cl) {
  if (cl.kind === 'ev' || cl.kind === 'fake') return `${CATS[cl.cat].e} ${CATS[cl.cat].ev(CATS[cl.cat].vals[cl.val])}`;
  if (cl.kind === 'nw') return `${WEAPONS[cl.w][0]} El arma <b>no</b> fue: ${WEAPONS[cl.w][1]}.`;
  if (cl.kind === 'nr') return `${ROOMS[cl.r][0]} El crimen <b>no</b> fue en: ${ROOMS[cl.r][1]}.`;
  return '';
}

/* =====================================================
   ANFITRIÓN
   ===================================================== */
let settings = { rounds: 3, disc: 180 };
let C = null;
function H(fn, ms) { const t = setTimeout(fn, ms); if (C) C.ht.push(t); return t; }
function clearH() { if (C) { C.ht.forEach(clearTimeout); C.ht = []; } }
function hostBegin() {
  const ids = room.players.map(p => p.id);
  if (ids.length < 3) { toast('Hacen falta al menos 3 jugadores'); return; }
  const cs = genCase(ids);
  C = { cs, plan: planClues(cs, settings.rounds), round: 0, phase: 'intro', ready: {}, done: {}, manipUses: 2, fakes: [], invs: [], votes: {}, ht: [] };
  broadcast({ t: 'case', victim: cs.victim, event: cs.event, mansion: cs.mansion, cast: cs.cast, weapons: cs.weapons, rooms: cs.rooms, rounds: settings.rounds });
  ids.forEach(id => send(id, { t: 'card', murderer: id === cs.culprit, truth: id === cs.culprit ? { weapon: cs.weapon, room: cs.room } : null }));
}
function hostReady(id) {
  if (!C || C.phase !== 'intro') return;
  C.ready[id] = 1;
  broadcast({ t: 'readyc', n: Object.keys(C.ready).length, of: room.players.length });
  if (room.players.every(p => C.ready[p.id])) H(() => startClues(0), 800);
}
function startClues(r) {
  if (!C) return;
  clearH();
  C.round = r; C.phase = 'clues'; C.done = {}; C.manipThis = null;
  const ms = 75000;
  room.players.forEach(p => {
    const list = (C.plan[r][p.id] || []).map(cl => ({ ...cl, text: clueText(cl) }));
    const murderer = p.id === C.cs.culprit;
    send(p.id, { t: 'clues', round: r, rounds: settings.rounds, clues: list, ms, manip: murderer && C.manipUses > 0 ? { uses: C.manipUses } : null });
  });
  H(endClues, ms);
}
function hostInv(id, m) {
  if (!C || C.phase !== 'clues' || C.done[id] && C.done[id].inv) return;
  const cs = C.cs;
  let text, yes;
  if (m.kind === 'room' && cs.rooms.includes(m.idx)) { yes = m.idx === cs.room; text = yes ? `${ROOMS[m.idx][0]} En <b>${ROOMS[m.idx][1]}</b> hay manchas de sangre recientes. ¡Aquí pasó algo!` : `${ROOMS[m.idx][0]} <b>${ROOMS[m.idx][1]}</b> está limpia. Aquí no fue.`; }
  else if (m.kind === 'weapon' && cs.weapons.includes(m.idx)) { yes = m.idx === cs.weapon; text = yes ? `${WEAPONS[m.idx][0]} ¡El <b>${WEAPONS[m.idx][1]}</b> tiene restos sospechosos!` : `${WEAPONS[m.idx][0]} El <b>${WEAPONS[m.idx][1]}</b> está limpio. No fue el arma.`; }
  else return;
  C.done[id] = { ...(C.done[id] || {}), inv: true };
  C.invs.push({ id, round: C.round, kind: m.kind, idx: m.idx, yes });
  send(id, { t: 'inv', text, yes, kind: m.kind, idx: m.idx });
  checkClues();
}
function hostManip(id, m) {
  if (!C || C.phase !== 'clues' || id !== C.cs.culprit || C.manipThis !== null) return;
  if (m.skip || C.manipUses <= 0) { C.manipThis = false; C.done[id] = { ...(C.done[id] || {}), manip: true }; return checkClues(); }
  const scape = C.cs.cast.find(c => c.id === m.scape), target = C.cs.cast.find(c => c.id === m.target);
  if (!scape || !target || m.scape === id || m.target === id || m.target === m.scape) return;
  const ctr = C.cs.cast.find(c => c.id === id).tr;
  const cats = CAT_K.filter(c => scape.tr[c] !== ctr[c]);
  if (!cats.length) { C.manipThis = false; C.done[id] = { ...(C.done[id] || {}), manip: true }; return checkClues(); }
  const cat = pick(cats);
  C.manipUses--; C.manipThis = { scape: m.scape, target: m.target, cat, val: scape.tr[cat] };
  C.fakes.push({ ...C.manipThis, round: C.round });
  C.done[id] = { ...(C.done[id] || {}), manip: true };
  checkClues();
}
function hostDone(id) {
  if (!C || C.phase !== 'clues') return;
  C.done[id] = { ...(C.done[id] || {}), ok: true };
  checkClues();
}
function checkClues() {
  const all = room.players.every(p => C.done[p.id] && C.done[p.id].ok);
  broadcast({ t: 'donec', n: room.players.filter(p => C.done[p.id] && C.done[p.id].ok).length, of: room.players.length });
  if (all) H(endClues, 500);
}
function endClues() {
  if (!C || C.phase !== 'clues') return;
  clearH();
  C.phase = 'debate';
  if (C.manipThis) {
    const f = C.manipThis;
    send(f.target, { t: 'clue+', clue: { kind: 'fake', cat: f.cat, val: f.val, text: clueText({ kind: 'fake', cat: f.cat, val: f.val }) } });
  }
  broadcast({ t: 'debate', round: C.round, rounds: settings.rounds, ms: settings.disc * 1000 });
  if (settings.disc) H(nextStep, settings.disc * 1000);
}
function nextStep() {
  if (!C || C.phase !== 'debate') return;
  clearH();
  if (C.round + 1 < settings.rounds) startClues(C.round + 1); else startAccuse();
}
function startAccuse() {
  C.phase = 'accuse'; C.votes = {};
  broadcast({ t: 'accuse', ms: 90000 });
  H(reveal, 90000);
}
function hostAccuse(id, m) {
  if (!C || C.phase !== 'accuse' || (id in C.votes)) return;
  C.votes[id] = { who: m.who, w: m.w, r: m.r };
  broadcast({ t: 'donec', n: Object.keys(C.votes).length, of: room.players.length });
  if (room.players.every(p => p.id in C.votes)) H(reveal, 600);
}
function reveal() {
  if (!C || C.phase === 'reveal') return;
  clearH();
  C.phase = 'reveal';
  const cs = C.cs, cnt = {};
  Object.entries(C.votes).forEach(([v, x]) => { if (v !== cs.culprit && x.who) cnt[x.who] = (cnt[x.who] || 0) + 1; });
  const max = Math.max(0, ...Object.values(cnt)), tops = Object.keys(cnt).filter(k => cnt[k] === max);
  const caught = max > 0 && tops.length === 1 && tops[0] === cs.culprit;
  const pts = {};
  room.players.forEach(p => {
    if (!cs.cast.some(c => c.id === p.id)) return;
    let s = 0;
    if (p.id === cs.culprit) { if (!caught) s += 5; s += Object.entries(C.votes).filter(([v, x]) => v !== cs.culprit && x.who !== cs.culprit).length; }
    else { const x = C.votes[p.id] || {}; if (x.who === cs.culprit) s += 3; if (x.w === cs.weapon) s += 1; if (x.r === cs.room) s += 1; }
    pts[p.id] = s; p.score += s;
  });
  P.broadcastPlayers();
  broadcast({ t: 'reveal', truth: { culprit: cs.culprit, weapon: cs.weapon, room: cs.room }, caught, votes: C.votes, pts, fakes: C.fakes, cast: cs.cast, invs: C.invs });
}
function hostLeave(id) {
  if (!C) return;
  if (C.phase === 'intro') hostReady(id);
  if (C.phase === 'clues') { C.done[id] = { ok: true }; checkClues(); }
  if (C.phase === 'accuse' && room.players.every(p => p.id in C.votes)) H(reveal, 500);
}
function hostHandle(id, m) {
  if (!m) return;
  if (m.t === 'ready') hostReady(id);
  else if (m.t === 'inv') hostInv(id, m);
  else if (m.t === 'manip') hostManip(id, m);
  else if (m.t === 'done') hostDone(id);
  else if (m.t === 'accuse') hostAccuse(id, m);
}

/* =====================================================
   VISTAS
   ===================================================== */
let curRound = 0;
const currentRound = () => curRound;
const K = { cast: [], weapons: [], rooms: [], card: null, clues: [], invs: [], notes: { s: {}, w: {}, r: {} }, story: null, rounds: 3 };
const bg = () => '<div class="mansion-bg"></div>';
const charOf = id => K.cast.find(c => c.id === id);
const charName = id => { const c = charOf(id); return c ? `${CHARS[c.c].e} ${CHARS[c.c].n}` : '¿?'; };
const traitIcons = tr => CAT_K.map(c => `<span class="trt" title="${CATS[c].n}">${CATS[c].e} ${CATS[c].vals[tr[c]]}</span>`).join('');
function timerHTML() { return '<div class="ltimer" id="lt"></div>'; }
function runTimer(ms) { const end = Date.now() + ms; const upd = () => { const e = $('#lt'); if (!e) return; const s = Math.max(0, Math.ceil((end - Date.now()) / 1000)); e.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }; upd(); every(upd, 250); }

function notebookHTML(tab = 'p') {
  const tabs = [['p', '🔎 Pistas'], ['s', '📁 Sospechosos'], ['a', '🗡️ Armas y salas']];
  let body = '';
  if (tab === 'p') body = (K.clues.length || K.invs.length) ? `<ul class="clist">${K.clues.map(c => `<li class="cl ${c.kind}">${c.text}<small>Ronda ${c.round + 1}</small></li>`).join('')}
      ${K.invs.map(v => `<li class="cl inv ${v.yes ? 'yes' : ''}">🔍 ${v.text}<small>Tu investigación · ronda ${v.round + 1}</small></li>`).join('')}</ul>` : '<div class="note">Aún no tienes pistas.</div>';
  else if (tab === 's') body = `<div class="mute" style="font-size:12px;margin-bottom:6px">Toca para tachar. Las pruebas de la escena coinciden con los rasgos del asesino.</div>
      ${K.cast.map(c => `<button class="suspect${K.notes.s[c.id] ? ' x' : ''}" data-s="${esc(c.id)}"><div class="sh"><span class="se">${CHARS[c.c].e}</span><div><b>${CHARS[c.c].n}</b><small>${nm(c.id)}${c.id === myId ? ' (tú)' : ''} · ${CHARS[c.c].m}</small></div></div><div class="trts">${traitIcons(c.tr)}</div></button>`).join('')}`;
  else body = `<div class="lbl" style="margin-top:0">Armas</div><div class="wgrid">${K.weapons.map(w => `<button class="wr${K.notes.w[w] ? ' x' : ''}" data-w="${w}">${WEAPONS[w][0]} ${WEAPONS[w][1]}</button>`).join('')}</div>
      <div class="lbl">Salas</div><div class="wgrid">${K.rooms.map(r => `<button class="wr${K.notes.r[r] ? ' x' : ''}" data-r="${r}">${ROOMS[r][0]} ${ROOMS[r][1]}</button>`).join('')}</div>`;
  return `<div class="tabs nb">${tabs.map(([k, l]) => `<button class="tab${k === tab ? ' sel' : ''}" data-tab="${k}">${l}</button>`).join('')}</div><div class="nbbody">${body}</div>`;
}
function bindNotebook(el, tab) {
  el.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { el.innerHTML = notebookHTML(b.dataset.tab); bindNotebook(el, b.dataset.tab); }));
  el.querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', () => { K.notes.s[b.dataset.s] = !K.notes.s[b.dataset.s]; b.classList.toggle('x'); }));
  el.querySelectorAll('[data-w]').forEach(b => b.addEventListener('click', () => { K.notes.w[b.dataset.w] = !K.notes.w[b.dataset.w]; b.classList.toggle('x'); }));
  el.querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => { K.notes.r[b.dataset.r] = !K.notes.r[b.dataset.r]; b.classList.toggle('x'); }));
}
function secretChip() {
  if (!K.card) return '';
  return `<button class="peek" id="peek">🎭 Mi papel</button><div class="peekcard" id="peekcard">${K.card.murderer
    ? `<div style="font-size:40px">🔪</div><b style="font-size:20px;color:#ff6b7a">Eres el ASESINO</b><div class="mute" style="font-weight:700;margin-top:6px">Lo hiciste con ${WEAPONS[K.card.truth.weapon][0]} ${WEAPONS[K.card.truth.weapon][1]} en ${ROOMS[K.card.truth.room][0]} ${ROOMS[K.card.truth.room][1]}</div>`
    : `<div style="font-size:40px">😇</div><b style="font-size:20px;color:var(--ok)">Eres inocente</b><div class="mute" style="font-weight:700;margin-top:6px">Descubre quién, con qué y dónde</div>`}
    <div class="mute" style="font-size:12px;margin-top:8px">Mantén pulsado para verlo</div></div>`;
}
function bindPeek() {
  const b = $('#peek'), c = $('#peekcard'); if (!b || !c) return;
  const onn = e => { e.preventDefault(); c.classList.add('on'); }, off = () => c.classList.remove('on');
  b.addEventListener('pointerdown', onn); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
}

function renderSetup() {
  show('setup', `${bg()}
    <div class="hubtop"><h1>🕵️ La <span>mansión</span></h1><div class="codechip"><b>${esc(P.code)}</b></div></div>
    <div class="card"><h3 style="margin-bottom:6px">${players.length} invitados en la mansión</h3><div class="mute" style="font-weight:700">🔪 Uno de vosotros es el asesino. Cada partida es un caso distinto.</div></div>
    ${isHost ? `<div class="card"><div class="row">
      <div><label class="lbl" style="margin-top:0">Rondas de pistas</label><select id="rounds">${[2, 3, 4].map(v => `<option value="${v}"${settings.rounds === v ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
      <div><label class="lbl" style="margin-top:0">Debate por ronda</label><select id="disc">${[[120, '2 min'], [180, '3 min'], [300, '5 min'], [0, 'Sin límite']].map(([v, l]) => `<option value="${v}"${settings.disc === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div></div></div>
      <button class="btn go" id="go">🕯️ Abrir el caso</button>${P.homeButton()}` : '<div class="card" style="text-align:center"><b>Esperando al anfitrión…</b></div>'}
    <div class="card"><h3 style="margin-bottom:8px">Cómo se juega</h3><ul class="rules">
      <li>Cada uno es un <b>personaje</b> con rasgos visibles para todos: calzado, mano, olor y una prenda.</li>
      <li>Uno es el <b>🔪 asesino</b>. Los demás tenéis que descubrir <b>quién, con qué arma y en qué sala</b>.</li>
      <li>Cada ronda recibes <b>pistas secretas</b>: pruebas de la escena (coinciden con los rasgos del asesino) y armas o salas descartadas. Además puedes <b>investigar</b> una sala o un arma.</li>
      <li>En el <b>debate</b> compartid lo que sabéis… o mentid. El asesino puede <b>inculpar</b> a otro con una pista falsa, pero varias pistas se repiten entre jugadores: ¡contrastadlas!</li>
      <li>Al final, <b>acusación secreta</b>: culpable +3, arma +1, sala +1. Si el asesino no es el más votado, gana +5.</li>
    </ul></div>`);
  if (isHost) {
    on('#rounds', 'change', e => { settings.rounds = +e.target.value; sync(); });
    on('#disc', 'change', e => { settings.disc = +e.target.value; sync(); });
    on('#go', 'click', () => { audio(); hostBegin(); });
    P.bindHome();
  }
}
function sync() { broadcast({ t: 'set', settings }); }

function renderIntro() {
  const me = charOf(myId), s = K.story;
  show('intro', `${bg()}
    <div class="story"><div style="font-size:46px">🌩️</div>
      <p><b>${esc(s.victim)}</b> celebraba ${esc(s.event)} en <b>${esc(s.mansion)}</b>. A medianoche, un trueno apagó las luces… y cuando volvieron, yacía sin vida.</p>
      <p>La tormenta ha cortado el camino. <b>Nadie ha salido de la casa: el asesino está entre los invitados.</b></p></div>
    ${me ? `<div class="card"><div class="sh"><span class="se" style="font-size:44px">${CHARS[me.c].e}</span><div><div class="mute" style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px">Tu personaje</div><b style="font-size:22px">${CHARS[me.c].n}</b><small class="mute" style="display:block">${CHARS[me.c].m}</small></div></div><div class="trts" style="margin-top:8px">${traitIcons(me.tr)}</div></div>` : ''}
    <div class="rolecard" id="rc" style="min-height:150px"><div style="font-size:44px">✉️</div><div class="rn" style="font-size:20px">Toca para abrir tu sobre secreto</div></div>
    <button class="btn" id="ready">Estoy listo</button><div class="sub" id="rcount"></div>`);
  let open = false;
  const rc = $('#rc');
  rc.addEventListener('click', () => {
    open = !open;
    if (open) {
      rc.classList.add('open');
      rc.innerHTML = K.card.murderer
        ? `<div class="re">🔪</div><div class="rn" style="color:#ff6b7a">Eres el ASESINO</div><div class="rd">Lo hiciste con <b>${WEAPONS[K.card.truth.weapon][0]} ${WEAPONS[K.card.truth.weapon][1]}</b> en <b>${ROOMS[K.card.truth.room][0]} ${ROOMS[K.card.truth.room][1]}</b>.<br>Las pruebas de la escena coinciden con <b>tus rasgos</b>: miente, desvía la atención y usa 🎭 inculpar.</div>`
        : `<div class="re">😇</div><div class="rn" style="color:var(--ok)">Eres inocente</div><div class="rd">Junta pistas con los demás para descubrir <b>quién, con qué y dónde</b>. Ojo: alguien mentirá.</div>`;
      buzz(30);
    } else { rc.classList.remove('open'); rc.innerHTML = '<div style="font-size:44px">✉️</div><div class="rn" style="font-size:20px">Toca para abrir tu sobre secreto</div>'; }
  });
  on('#ready', 'click', () => { toHost({ t: 'ready' }); $('#ready').disabled = true; $('#ready').textContent = '✔ Listo'; });
  SFX.thunder();
}
function renderClues(m) {
  curRound = m.round;
  m.clues.forEach(c => K.clues.push({ ...c, round: m.round }));
  const invMade = K.invs.some(v => v.round === m.round);
  show('clues', `${bg()}
    <div class="phase">Ronda ${m.round + 1} de ${m.rounds}</div>${timerHTML()}
    <div class="lbl">📜 Tus pistas nuevas</div>
    ${m.clues.length ? `<ul class="clist">${m.clues.map(c => `<li class="cl ${c.kind}">${c.text}</li>`).join('')}</ul>` : '<div class="note">Esta ronda no te ha llegado ninguna pista nueva.</div>'}
    <div class="card" id="invbox"><h3 style="margin-bottom:6px">🔍 Investiga una cosa</h3>
      <div class="tabs"><button class="tab sel" data-it="room">Salas</button><button class="tab" data-it="weapon">Armas</button></div>
      <div id="invgrid"></div><div id="invres"></div></div>
    ${m.manip ? `<div class="card manip" id="manip"><h3 style="margin-bottom:6px">🎭 Inculpar (te quedan ${m.manip.uses})</h3>
      <div class="mute" style="font-size:13px;margin-bottom:8px">Elige a quién inculpar y a quién engañar: al engañado le llegará una pista falsa que señala al inculpado.</div>
      <div class="lbl" style="margin-top:0">Inculpar a…</div><div class="pgrid" id="msc">${K.cast.filter(c => c.id !== myId).map(c => `<button class="pbtn" data-id="${esc(c.id)}"><span class="nm">${CHARS[c.c].e} ${nm(c.id)}</span></button>`).join('')}</div>
      <div class="lbl">Engañar a…</div><div class="pgrid" id="mtg">${K.cast.filter(c => c.id !== myId).map(c => `<button class="pbtn" data-id="${esc(c.id)}"><span class="nm">${CHARS[c.c].e} ${nm(c.id)}</span></button>`).join('')}</div>
      <div class="row2" style="display:flex;gap:8px;margin-top:10px"><button class="btn sec small" id="mskip">No hacer nada</button><button class="btn small" id="mgo" disabled>Inculpar</button></div><div id="mmsg"></div></div>` : ''}
    <button class="btn go" id="done">✔ Listo para el debate</button><div class="sub" id="dcount"></div>
    <div class="card" id="nb"></div>${secretChip()}`);
  runTimer(m.ms); bindPeek(); SFX.clue();
  const nb = $('#nb'); nb.innerHTML = notebookHTML('s'); bindNotebook(nb, 's');
  let it = 'room';
  const drawInv = () => {
    const list = it === 'room' ? K.rooms.map(r => [r, ROOMS[r]]) : K.weapons.map(w => [w, WEAPONS[w]]);
    $('#invgrid').innerHTML = `<div class="wgrid">${list.map(([i, x]) => `<button class="wr" data-i="${i}"${invMade ? ' disabled' : ''}>${x[0]} ${x[1]}</button>`).join('')}</div>`;
    $$('#invgrid .wr').forEach(b => b.addEventListener('click', () => { toHost({ t: 'inv', kind: it, idx: +b.dataset.i }); $$('#invgrid .wr').forEach(x => x.disabled = true); b.classList.add('sel'); }));
  };
  $$('[data-it]').forEach(b => b.addEventListener('click', () => { it = b.dataset.it; $$('[data-it]').forEach(x => x.classList.toggle('sel', x === b)); drawInv(); }));
  drawInv();
  if (invMade) $('#invres').innerHTML = `<div class="note">Ya has investigado esta ronda.</div>`;
  if (m.manip) {
    let sc = null, tg = null;
    const upd = () => { $('#mgo').disabled = !(sc && tg && sc !== tg); };
    $$('#msc .pbtn').forEach(b => b.addEventListener('click', () => { sc = b.dataset.id; $$('#msc .pbtn').forEach(x => x.classList.toggle('wsel', x === b)); upd(); }));
    $$('#mtg .pbtn').forEach(b => b.addEventListener('click', () => { tg = b.dataset.id; $$('#mtg .pbtn').forEach(x => x.classList.toggle('sel', x === b)); upd(); }));
    on('#mgo', 'click', () => { toHost({ t: 'manip', scape: sc, target: tg }); $('#manip').innerHTML = `<div class="note w">🎭 Hecho: ${nm(tg)} recibirá una pista que señala a ${nm(sc)}.</div>`; buzz(20); });
    on('#mskip', 'click', () => { toHost({ t: 'manip', skip: true }); $('#manip').innerHTML = '<div class="note">🎭 Esta ronda no inculpas a nadie.</div>'; });
  }
  on('#done', 'click', () => { toHost({ t: 'done' }); $('#done').disabled = true; $('#done').textContent = '✔ Esperando al resto…'; });
}
function renderDebate(m) {
  show('debate', `${bg()}
    <div class="phase">🗣️ Debate · ronda ${m.round + 1}</div>${m.ms ? timerHTML() : '<div class="phase-sub">Sin límite de tiempo</div>'}
    <div class="phase-sub">Compartid (o no) vuestras pistas. ¿Cuadra todo lo que se dice?</div>
    ${isHost ? `<button class="btn" id="next">${m.round + 1 < m.rounds ? '➡️ Siguiente ronda de pistas' : '⚖️ Pasar a la acusación'}</button>` : ''}
    <div class="card" id="nb"></div>${secretChip()}`);
  if (m.ms) runTimer(m.ms);
  bindPeek();
  const nb = $('#nb'); nb.innerHTML = notebookHTML('p'); bindNotebook(nb, 'p');
  on('#next', 'click', () => nextStep());
}
function renderAccuse(m) {
  let who = null, w = null, r = null;
  show('accuse', `${bg()}
    <div class="phase">⚖️ Acusación final</div>${timerHTML()}
    <div class="phase-sub">En secreto: ¿quién fue, con qué y dónde?</div>
    <div class="lbl">🔪 Culpable</div><div class="pgrid" id="aw">${K.cast.map(c => `<button class="pbtn" data-id="${esc(c.id)}"><span class="nm">${CHARS[c.c].e} ${nm(c.id)}${c.id === myId ? ' (tú)' : ''}</span></button>`).join('')}</div>
    <div class="lbl">🗡️ Arma</div><div class="wgrid" id="ww">${K.weapons.map(x => `<button class="wr${K.notes.w[x] ? ' x' : ''}" data-v="${x}">${WEAPONS[x][0]} ${WEAPONS[x][1]}</button>`).join('')}</div>
    <div class="lbl">🚪 Sala</div><div class="wgrid" id="wr">${K.rooms.map(x => `<button class="wr${K.notes.r[x] ? ' x' : ''}" data-v="${x}">${ROOMS[x][0]} ${ROOMS[x][1]}</button>`).join('')}</div>
    <button class="btn go" id="send" disabled style="margin-top:14px">Acusar</button><div class="sub" id="dcount"></div>
    <div class="card" id="nb"></div>${secretChip()}`);
  runTimer(m.ms); bindPeek();
  const nb = $('#nb'); nb.innerHTML = notebookHTML('p'); bindNotebook(nb, 'p');
  const upd = () => { $('#send').disabled = !(who && w !== null && r !== null); };
  $$('#aw .pbtn').forEach(b => b.addEventListener('click', () => { who = b.dataset.id; $$('#aw .pbtn').forEach(x => x.classList.toggle('wsel', x === b)); upd(); }));
  $$('#ww .wr').forEach(b => b.addEventListener('click', () => { w = +b.dataset.v; $$('#ww .wr').forEach(x => x.classList.toggle('sel', x === b)); upd(); }));
  $$('#wr .wr').forEach(b => b.addEventListener('click', () => { r = +b.dataset.v; $$('#wr .wr').forEach(x => x.classList.toggle('sel', x === b)); upd(); }));
  on('#send', 'click', () => { toHost({ t: 'accuse', who, w, r }); $('#send').disabled = true; $('#send').textContent = '✔ Acusación enviada'; $$('#aw .pbtn, .wr').forEach(x => x.disabled = true); buzz(30); });
}
function renderReveal(m) {
  const t = m.truth, cc = charOf(t.culprit);
  const myPts = m.pts[myId] || 0;
  const vrows = Object.entries(m.votes).map(([v, x]) => `<li><span>${nm(v)} → ${x.who ? `${charName(x.who)}` : '—'}</span><small>${x.w !== undefined && x.w !== null ? WEAPONS[x.w][0] : ''} ${x.r !== undefined && x.r !== null ? ROOMS[x.r][0] : ''} · ${m.pts[v] ? '+' + m.pts[v] : '0'}</small></li>`).join('');
  show('reveal', `${bg()}
    <div class="story" style="text-align:center"><div style="font-size:54px">${m.caught ? '🚔' : '🎭'}</div>
      <div class="phase" style="margin:4px 0">${m.caught ? '¡Atrapado!' : '¡El asesino se sale con la suya!'}</div>
      <p style="font-size:17px">Fue <b>${cc ? CHARS[cc.c].e + ' ' + CHARS[cc.c].n : ''}</b> (${nm(t.culprit)}), con <b>${WEAPONS[t.weapon][0]} ${WEAPONS[t.weapon][1]}</b>, en <b>${ROOMS[t.room][0]} ${ROOMS[t.room][1]}</b>.</p></div>
    <div class="note ${myPts ? 'ok' : ''}" style="text-align:center;font-size:17px">${myPts ? `🏆 Has ganado ${myPts} punto${myPts === 1 ? '' : 's'}` : 'Esta vez no sumas puntos'}</div>
    <div class="card"><h3 style="margin-bottom:6px">🔎 Las pruebas reales</h3><div class="trts">${cc ? traitIcons(cc.tr) : ''}</div>
      ${m.fakes.length ? `<div class="note w" style="margin-top:10px">🎭 Pistas falsas del asesino:<br>${m.fakes.map(f => `· Ronda ${f.round + 1}: ${nm(f.target)} recibió «${CATS[f.cat].e} ${CATS[f.cat].vals[f.val]}» para inculpar a ${nm(f.scape)}`).join('<br>')}</div>` : '<div class="mute" style="font-size:13px;margin-top:8px">El asesino no plantó pistas falsas.</div>'}</div>
    <div class="card"><h3 style="margin-bottom:4px">⚖️ Acusaciones</h3><ul class="plist tally">${vrows}</ul></div>
    ${isHost ? '<button class="btn go" id="again">🕯️ Otro caso</button>' : '<div class="sub">Esperando al anfitrión…</div>'}${P.homeButton()}`);
  SFX.reveal(); if (myPts) setTimeout(SFX.win, 900);
  on('#again', 'click', () => broadcast({ t: 'setup' })); P.bindHome();
}

function onMsg(m) {
  switch (m.t) {
    case 'set': settings = m.settings; if (screen === 'setup') renderSetup(); break;
    case 'setup': C = null; renderSetup(); break;
    case 'case': Object.assign(K, { cast: m.cast, weapons: m.weapons, rooms: m.rooms, story: { victim: m.victim, event: m.event, mansion: m.mansion }, rounds: m.rounds, clues: [], invs: [], notes: { s: {}, w: {}, r: {} }, card: null }); break;
    case 'card': K.card = m; renderIntro(); break;
    case 'readyc': case 'donec': { const e = $('#rcount') || $('#dcount'); if (e) e.textContent = `${m.n} / ${m.of} listos`; break; }
    case 'clues': renderClues(m); break;
    case 'inv': { K.invs.push({ ...m, round: currentRound() }); const e = $('#invres'); if (e) e.innerHTML = `<div class="note ${m.yes ? 'w' : 'ok'}">🔍 ${m.text}</div>`; buzz(30); break; }
    case 'clue+': { K.clues.push({ ...m.clue, round: currentRound() }); toast('📜 ¡Te ha llegado una pista nueva!'); SFX.clue(); buzz([40, 40, 40]); const nb = $('#nb'); if (nb && screen === 'debate') { nb.innerHTML = notebookHTML('p'); bindNotebook(nb, 'p'); } break; }
    case 'debate': renderDebate(m); break;
    case 'accuse': renderAccuse(m); break;
    case 'reveal': renderReveal(m); break;
  }
}

if (location.hash === '#debug') window.__C = () => C;
if (location.hash === '#debug') window.__MX = { genCase, planClues, CATS, CAT_K };
return {
  open() { if (isHost) sync(); renderSetup(); },
  onMsg,
  onHost: (id, m) => hostHandle(id, m),
  onPlayers(list) { players = list; if (screen === 'setup') renderSetup(); },
  onLeave: hostLeave,
  destroy() { clearTimers(); viewToken++; clearH(); C = null; },
};
  }
});
