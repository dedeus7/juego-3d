/* Imperios: órdenes secretas simultáneas, apoyos, pactos y traiciones (estilo Diplomacy) */
Party.register({
  id: 'imperios', name: 'Imperios', emoji: '🏰', players: '2-8', min: 2, wide: true,
  desc: 'Estrategia con órdenes secretas a la vez: negocia pactos en persona, apoya a tus aliados… o traiciónalos',
  create(P) {
'use strict';

/* ---------- utilidades ---------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const app = $('#app');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
const chip = id => `<b style="color:${pl(id).color}">${nm(id)}</b>`;

let actx = null;
function audio() { try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) {} return actx; }
function tone(f, d = 0.2, type = 'sine', vol = 0.1, slide = 0) {
  const a = audio(); if (!a) return;
  try { const o = a.createOscillator(), g = a.createGain(), t = a.currentTime; o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + 0.02); } catch (e) {}
}
const SFX = {
  horn: () => { tone(220, .5, 'sawtooth', .07); setTimeout(() => tone(330, .6, 'sawtooth', .07), 350); },
  drum: () => [0, 180, 360].forEach(d => setTimeout(() => tone(90, .2, 'square', .1, -30), d)),
  tick: () => tone(800, .05, 'sine', .05),
  win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, .25, 'triangle', .13), i * 120)),
};

/* ---------- mapa ---------- */
const T = {
  A: { n: 'Norgard', x: 15, y: 10 }, B: { n: 'Eskar', x: 50, y: 8, s: 1 }, C: { n: 'Brynn', x: 85, y: 10 },
  D: { n: 'Valtria', x: 8, y: 32 }, E: { n: 'Mirelia', x: 32, y: 28 }, F: { n: 'Corvia', x: 66, y: 29 }, G: { n: 'Thale', x: 92, y: 32 },
  H: { n: 'Oros', x: 20, y: 52 }, I: { n: 'Centralia', x: 50, y: 50, s: 1 }, J: { n: 'Draven', x: 80, y: 52 },
  K: { n: 'Salto', x: 8, y: 74 }, L: { n: 'Umbra', x: 34, y: 71, s: 1 }, M: { n: 'Kestrel', x: 66, y: 71, s: 1 }, N: { n: 'Pyra', x: 92, y: 74 },
  O: { n: 'Lumen', x: 20, y: 94 }, P: { n: 'Basalto', x: 50, y: 92, s: 1 }, Q: { n: 'Ferro', x: 80, y: 94 },
  R: { n: 'Sur', x: 8, y: 116 }, S: { n: 'Arenas', x: 34, y: 114 }, T: { n: 'Ámbar', x: 66, y: 114 }, U: { n: 'Coral', x: 92, y: 116 },
  V: { n: 'Hondo', x: 50, y: 134, s: 1 },
};
const EDGES = 'AB AD AE BC BE BF CF CG DE DH DK EF EH EI FG FI FJ GJ GN HI HK HL IJ IL IM JM JN KL KO KR LM LO LP MN MP MQ NQ NU OP OR OS PQ PS PT QT QU RS ST SV TU TV'.split(' ');
const ADJ = {}; Object.keys(T).forEach(k => ADJ[k] = []);
EDGES.forEach(e => { ADJ[e[0]].push(e[1]); ADJ[e[1]].push(e[0]); });
const HOMES = ['A', 'U', 'C', 'R', 'G', 'K', 'N', 'D'];
HOMES.forEach(h => T[h].s = 1);
// salidas repartidas según el número de jugadores (las capitales no usadas quedan como ciudades neutrales)
const HOME_SETS = { 2: ['A', 'U'], 3: ['B', 'R', 'U'], 4: ['A', 'K', 'P', 'U'], 5: ['A', 'I', 'K', 'P', 'U'], 6: ['A', 'C', 'I', 'P', 'R', 'U'], 7: ['B', 'D', 'G', 'I', 'P', 'R', 'U'], 8: ['B', 'D', 'G', 'I', 'P', 'R', 'U', 'V'] };
const STARS = Object.keys(T).filter(k => T[k].s);
const WIN = 8;
const adj = (a, b) => ADJ[a].includes(b);

/* ---------- motor de resolución (puro) ---------- */
function validOrder(units, t, o) {
  if (!o || !units[t]) return { k: 'h' };
  if (o.k === 'm' && adj(t, o.to)) return { k: 'm', to: o.to };
  if (o.k === 's' && units[o.s] && o.s !== t && adj(t, o.d) && (o.d === o.s || adj(o.s, o.d)) && o.d !== t) return { k: 's', s: o.s, d: o.d };
  return { k: 'h' };
}
function resolve(units, rawOrders) {
  const U = Object.keys(units), ord = {};
  U.forEach(t => ord[t] = validOrder(units, t, rawOrders[t]));
  const isMove = t => ord[t].k === 'm';
  const dest = t => isMove(t) ? ord[t].to : t;
  const sup = {};
  U.forEach(t => {
    const o = ord[t]; if (o.k !== 's') return;
    const matches = dest(o.s) === o.d;
    const cut = U.some(a => isMove(a) && ord[a].to === t && units[a] !== units[t] && a !== o.d);
    sup[t] = matches && !cut ? 'ok' : (cut ? 'cut' : 'void');
  });
  const supporters = (s, d) => U.filter(x => sup[x] === 'ok' && ord[x].s === s && ord[x].d === d);
  const moveStr = t => 1 + supporters(t, ord[t].to).filter(x => !(units[ord[t].to] && units[x] === units[ord[t].to])).length;
  const holdStr = t => 1 + supporters(t, t).length;
  const moves = U.filter(isMove), st = {};
  moves.forEach(m => st[m] = '?');
  let changed = true, guard = 0;
  while (changed && guard++ < 60) {
    changed = false;
    for (const m of moves) {
      if (st[m] !== '?') continue;
      const X = ord[m].to, sm = moveStr(m);
      if (moves.some(o => o !== m && ord[o].to === X && moveStr(o) >= sm)) { st[m] = 'x'; changed = true; continue; }
      if (!units[X]) { st[m] = 'ok'; changed = true; continue; }
      if (isMove(X)) {
        if (ord[X].to === m) {
          if (units[X] === units[m]) { st[m] = 'x'; changed = true; continue; }
          st[m] = sm > moveStr(X) ? 'ok' : 'x'; changed = true; continue;
        }
        if (st[X] === 'ok') { st[m] = 'ok'; changed = true; continue; }
        if (st[X] === 'x') { st[m] = units[X] !== units[m] && sm > 1 ? 'ok' : 'x'; changed = true; continue; }
        continue;
      }
      if (units[X] === units[m]) { st[m] = 'x'; changed = true; continue; }
      st[m] = sm > holdStr(X) ? 'ok' : 'x'; changed = true;
    }
  }
  moves.forEach(m => { if (st[m] === '?') st[m] = 'ok'; });
  const dislodged = U.filter(t => (!isMove(t) || st[t] === 'x') && moves.some(m => st[m] === 'ok' && ord[m].to === t));
  const next = {};
  U.forEach(t => { if (dislodged.includes(t)) return; if (isMove(t) && st[t] === 'ok') return; next[t] = units[t]; });
  moves.forEach(m => { if (st[m] === 'ok') next[ord[m].to] = units[m]; });
  return { ord, st, sup, dislodged, next, strength: Object.fromEntries(moves.map(m => [m, moveStr(m)])), hold: Object.fromEntries(U.filter(t => !isMove(t)).map(t => [t, holdStr(t)])) };
}

/* =====================================================
   ANFITRIÓN
   ===================================================== */
let settings = { rounds: 10, neg: 120 };
let E = null;
function H(fn, ms) { const t = setTimeout(fn, ms); if (E) E.ht.push(t); return t; }
function clearH() { if (E) { E.ht.forEach(clearTimeout); E.ht = []; } }
function starsOf(owner, id) { return STARS.filter(t => owner[t] === id).length; }
function hostBegin() {
  const ids = shuffle(room.players.map(p => p.id));
  if (ids.length < 2) { toast('Hacen falta al menos 2 jugadores'); return; }
  const owner = {}, units = {}, home = {};
  const set = HOME_SETS[ids.length] || HOMES;
  ids.forEach((id, i) => { const h = set[i]; home[id] = h; owner[h] = id; units[h] = id; });
  ids.forEach(id => { const h = home[id]; const s2 = ADJ[h].filter(x => !owner[x] && !T[x].s).sort((a, b) => ADJ[b].length - ADJ[a].length)[0] || ADJ[h].find(x => !owner[x]); if (s2) { owner[s2] = id; units[s2] = id; } });
  E = { ids, owner, units, home, round: 1, phase: 'neg', orders: {}, sent: {}, ht: [], history: [] };
  broadcast({ t: 'init', ids, home, rounds: settings.rounds });
  startNeg();
}
function stateMsg(extra) { return { t: 'state', round: E.round, rounds: settings.rounds, phase: E.phase, owner: E.owner, units: E.units, stars: Object.fromEntries(E.ids.map(id => [id, starsOf(E.owner, id)])), ...extra }; }
function startNeg() {
  clearH(); E.phase = 'neg';
  broadcast(stateMsg({ ms: settings.neg * 1000 }));
  if (settings.neg) H(startOrders, settings.neg * 1000);
}
function startOrders() {
  if (!E || E.phase !== 'neg') return;
  clearH(); E.phase = 'orders'; E.orders = {}; E.sent = {}; E.minAt = Date.now() + 5000;
  broadcast(stateMsg({ ms: 75000 }));
  H(resolveRound, 75000);
}
function hostOrders(id, m) {
  if (!E || E.phase !== 'orders' || !E.ids.includes(id)) return;
  const mine = {};
  Object.entries(m.orders || {}).forEach(([t, o]) => { if (E.units[t] === id) mine[t] = o; });
  Object.keys(E.orders).forEach(t => { if (E.units[t] === id) delete E.orders[t]; });
  Object.assign(E.orders, mine);
  if (m.final) E.sent[id] = 1;
  const alive = E.ids.filter(x => Object.values(E.units).includes(x) && room.players.some(p => p.id === x));
  broadcast({ t: 'sentc', n: alive.filter(x => E.sent[x]).length, of: alive.length });
  if (alive.every(x => E.sent[x])) H(resolveRound, Math.max(600, E.minAt - Date.now()));
}
function resolveRound() {
  if (!E || E.phase !== 'orders') return;
  clearH(); E.phase = 'res';
  const before = { ...E.units }, ownerBefore = { ...E.owner };
  const r = resolve(E.units, E.orders);
  const events = [];
  Object.keys(before).forEach(t => {
    const o = r.ord[t];
    if (o.k === 'm') {
      const d = o.to;
      if (r.st[t] === 'ok') {
        if (before[d] && before[d] !== before[t] && r.dislodged.includes(d)) events.push({ e: '⚔️', txt: `${chip(before[t])} conquista <b>${T[d].n}</b> y destruye la tropa de ${chip(before[d])} (${r.strength[t]} contra ${r.hold[d] || 1})` });
        else if (ownerBefore[d] !== before[t]) events.push({ e: T[d].s ? '⭐' : '🚩', txt: `${chip(before[t])} ocupa <b>${T[d].n}</b>${T[d].s ? ' (ciudad)' : ''}` });
      } else {
        if (before[d] && before[d] !== before[t] && !(r.ord[d].k === 'm' && r.st[d] === 'ok')) events.push({ e: '🛡️', txt: `${chip(before[d])} resiste en <b>${T[d].n}</b> el ataque de ${chip(before[t])}` });
        else events.push({ e: '💥', txt: `${chip(before[t])} rebota al intentar entrar en <b>${T[d].n}</b>` });
      }
    }
    if (o.k === 's' && r.sup[t] === 'cut') events.push({ e: '✂️', txt: `Cortan el apoyo de ${chip(before[t])} desde <b>${T[t].n}</b>` });
  });
  r.dislodged.forEach(t => { if (!events.some(ev => ev.txt.includes(`destruye la tropa`) && ev.txt.includes(T[t].n))) events.push({ e: '☠️', txt: `La tropa de ${chip(before[t])} en <b>${T[t].n}</b> es destruida` }); });
  E.units = r.next;
  Object.entries(E.units).forEach(([t, id]) => E.owner[t] = id);
  // reclutamiento / licenciamiento: tropas = ciudades + 1
  E.ids.forEach(id => {
    const stars = starsOf(E.owner, id), mineU = Object.keys(E.units).filter(t => E.units[t] === id);
    const owns = Object.values(E.owner).includes(id);
    const target = owns ? stars + 1 : 0;
    if (mineU.length < target) {
      const spots = shuffle(STARS.filter(t => E.owner[t] === id && !E.units[t])).sort((a, b) => (b === E.home[id]) - (a === E.home[id]));
      const add = Math.min(target - mineU.length, spots.length);
      for (let i = 0; i < add; i++) { E.units[spots[i]] = id; events.push({ e: '🏗️', txt: `${chip(id)} recluta una tropa en <b>${T[spots[i]].n}</b>` }); }
    } else if (mineU.length > target) {
      const drop = shuffle(mineU).sort((a, b) => (T[a].s ? 1 : 0) - (T[b].s ? 1 : 0)).slice(0, mineU.length - target);
      drop.forEach(t => { delete E.units[t]; events.push({ e: '🏳️', txt: `${chip(id)} no puede mantener la tropa de <b>${T[t].n}</b>` }); });
    }
  });
  const orders = Object.entries(r.ord).map(([t, o]) => ({ t, owner: before[t], ...o, ok: o.k === 'm' ? r.st[t] === 'ok' : o.k === 's' ? r.sup[t] === 'ok' : true }));
  E.history.push({ round: E.round, events: events.length });
  const stars = Object.fromEntries(E.ids.map(id => [id, starsOf(E.owner, id)]));
  const leader = E.ids.find(id => stars[id] >= WIN);
  broadcast({ t: 'res', round: E.round, orders, events, before, owner: E.owner, units: E.units, stars });
  if (leader || E.round >= settings.rounds || E.ids.filter(id => Object.values(E.units).includes(id)).length <= 1) H(hostEnd, 9000);
  else H(() => { E.round++; startNeg(); }, 9000);
}
function hostEnd() {
  clearH(); E.phase = 'end';
  const stars = Object.fromEntries(E.ids.map(id => [id, starsOf(E.owner, id)]));
  const units = id => Object.values(E.units).filter(x => x === id).length;
  const terr = id => Object.values(E.owner).filter(x => x === id).length;
  const rank = E.ids.slice().sort((a, b) => stars[b] - stars[a] || units(b) - units(a) || terr(b) - terr(a));
  const PTS = [6, 3, 1];
  const pts = {};
  rank.forEach((id, i) => { pts[id] = rank.length >= 3 || i === 0 ? (PTS[i] || 0) : 0; const p = room.players.find(q => q.id === id); if (p) p.score += pts[id]; });
  P.broadcastPlayers();
  broadcast({ t: 'end', rank, stars, units: Object.fromEntries(E.ids.map(id => [id, units(id)])), terr: Object.fromEntries(E.ids.map(id => [id, terr(id)])), pts, owner: E.owner, unitsMap: E.units });
}
function hostLeave(id) {
  if (!E || E.phase === 'end') return;
  Object.keys(E.units).forEach(t => { if (E.units[t] === id) delete E.units[t]; });
  if (E.phase === 'orders') hostOrders(id, { orders: {}, final: true });
}
function hostHandle(id, m) {
  if (!m) return;
  if (m.t === 'orders') hostOrders(id, m);
}

/* =====================================================
   VISTAS
   ===================================================== */
const V = { owner: {}, units: {}, stars: {}, round: 1, rounds: 10, phase: '', orders: {}, sel: null, mode: null, supUnit: null, last: null };
const colorOf = id => id ? pl(id).color : null;
function mapSVG(opts = {}) {
  const units = opts.units || V.units, owner = opts.owner || V.owner;
  const edges = EDGES.map(e => `<line x1="${T[e[0]].x}" y1="${T[e[0]].y}" x2="${T[e[1]].x}" y2="${T[e[1]].y}" class="edge"/>`).join('');
  const hl = opts.hl || [];
  const nodes = Object.entries(T).map(([k, t]) => {
    const own = owner[k], col = colorOf(own);
    return `<g class="tn${hl.includes(k) ? ' hl' : ''}${V.sel === k ? ' sel' : ''}" data-t="${k}">
      <circle cx="${t.x}" cy="${t.y}" r="6.2" class="tc" style="${col ? `fill:${col}33;stroke:${col}` : ''}"/>
      ${t.s ? `<text x="${t.x + 4.6}" y="${t.y - 3.6}" class="star">★</text>` : ''}
      <text x="${t.x}" y="${t.y + 9.6}" class="tl">${t.n}</text></g>`;
  }).join('');
  const us = Object.entries(units).map(([k, id]) => `<g class="un" data-t="${k}"><circle cx="${T[k].x}" cy="${T[k].y}" r="3.6" style="fill:${colorOf(id)}"/><text x="${T[k].x}" y="${T[k].y + 1.3}" class="ui">${esc(pl(id).name.slice(0, 1).toUpperCase())}</text></g>`).join('');
  const arrows = (opts.arrows || []).map(a => {
    const A = T[a.from], B = T[a.to];
    if (!A || !B) return '';
    const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const x1 = A.x + ux * 4, y1 = A.y + uy * 4, x2 = B.x - ux * 5, y2 = B.y - uy * 5;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="arr ${a.cls || ''}" style="stroke:${a.col}" marker-end="url(#ah)"/>${a.fail ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 + 1.5}" class="xf">✖</text>` : ''}`;
  }).join('');
  return `<svg class="imap" viewBox="-2 0 104 147" id="imap"><defs><marker id="ah" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke"/></marker></defs>${edges}${nodes}${arrows}${us}</svg>`;
}
function ordersToArrows(list) {
  return list.map(o => o.k === 'm' ? { from: o.t, to: o.to, col: colorOf(o.owner), fail: o.ok === false }
    : o.k === 's' ? { from: o.t, to: o.d, col: colorOf(o.owner), cls: 'sup', fail: o.ok === false } : null).filter(Boolean);
}
function standings() {
  const ids = Object.keys(V.stars).sort((a, b) => V.stars[b] - V.stars[a]);
  return `<div class="standings">${ids.map(id => `<div class="stg"><span class="dot" style="background:${colorOf(id)}"></span><span class="nm">${nm(id)}${id === myId ? ' (tú)' : ''}</span><b>★ ${V.stars[id]}</b><small>⚔ ${Object.values(V.units).filter(x => x === id).length}</small></div>`).join('')}</div>`;
}
function timerHTML() { return '<span class="ltimer" id="lt" style="display:inline;margin:0;font-size:22px"></span>'; }
function runTimer(ms) { if (!ms) return; const end = Date.now() + ms; const upd = () => { const e = $('#lt'); if (!e) return; const s = Math.max(0, Math.ceil((end - Date.now()) / 1000)); e.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }; upd(); every(upd, 250); }
const orderTxt = (t, o) => !o || o.k === 'h' ? `🛡️ Defiende ${T[t].n}` : o.k === 'm' ? `➡️ ${T[t].n} → ${T[o.to].n}` : `🤝 ${T[t].n} apoya a ${T[o.s].n}${o.d === o.s ? ' (defensa)' : ' → ' + T[o.d].n}`;

function renderSetup() {
  show('setup', `<div class="imp-bg"></div>
    <div class="hubtop"><h1>🏰 Imp<span>erios</span></h1><div class="codechip"><b>${esc(P.code)}</b></div></div>
    <div class="card"><h3 style="margin-bottom:6px">${players.length} imperios</h3><div class="mute" style="font-weight:700">Gana quien consiga ${WIN} ciudades ★ o el que más tenga al final.</div></div>
    ${isHost ? `<div class="card"><div class="row">
      <div><label class="lbl" style="margin-top:0">Rondas</label><select id="rounds">${[6, 8, 10, 12].map(v => `<option value="${v}"${settings.rounds === v ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
      <div><label class="lbl" style="margin-top:0">Negociación</label><select id="neg">${[[60, '1 min'], [120, '2 min'], [180, '3 min'], [0, 'Sin límite']].map(([v, l]) => `<option value="${v}"${settings.neg === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div></div></div>
      <button class="btn go" id="go">🏰 Empezar la conquista</button>${P.homeButton()}` : '<div class="card" style="text-align:center"><b>Esperando al anfitrión…</b></div>'}
    <div class="card"><h3 style="margin-bottom:8px">Cómo se juega</h3><ul class="rules">
      <li>Empiezas con tu <b>capital ★</b> y <b>2 tropas</b>. Puedes mantener tantas tropas como <b>ciudades ★ + 1</b>.</li>
      <li>Cada ronda: <b>🗣️ negociad</b> en persona, luego <b>todos dais órdenes en secreto</b> y se resuelven a la vez.</li>
      <li>Cada tropa puede <b>🛡️ defender</b>, <b>➡️ avanzar</b> a un territorio vecino o <b>🤝 apoyar</b> a otra tropa (tuya o de otro) para que entre o resista en un territorio vecino al tuyo.</li>
      <li>Fuerza = <b>1 + apoyos</b>. Gana el más fuerte; los empates rebotan. Si atacan a una tropa que apoya, <b>su apoyo se corta</b>.</li>
      <li>La tropa expulsada se destruye. Ocupar un territorio lo hace tuyo.</li>
      <li>Puntos: 1º <b>+6</b>, 2º <b>+3</b>, 3º <b>+1</b>.</li>
    </ul></div>`);
  if (isHost) {
    on('#rounds', 'change', e => { settings.rounds = +e.target.value; sync(); });
    on('#neg', 'change', e => { settings.neg = +e.target.value; sync(); });
    on('#go', 'click', () => { audio(); hostBegin(); });
    P.bindHome();
  }
}
function sync() { broadcast({ t: 'set', settings }); }

function renderGame(m) {
  Object.assign(V, { owner: m.owner, units: m.units, stars: m.stars, round: m.round, rounds: m.rounds, phase: m.phase });
  if (m.phase === 'neg') renderNeg(m); else if (m.phase === 'orders') { V.orders = {}; V.sel = null; V.mode = null; renderOrders(m); }
}
function header(title, ms) {
  return `<div class="imp-bg"></div><div class="ihead"><div><b>Ronda ${V.round}/${V.rounds}</b><span>${title}</span></div>${ms ? timerHTML() : ''}</div>`;
}
function renderNeg(m) {
  const mine = Object.values(V.units).filter(x => x === myId).length;
  show('neg', `${header('🗣️ Negociación', m.ms)}
    ${mapSVG()}
    ${standings()}
    <div class="note">🗣️ <b>Negociad en persona:</b> pactos, fronteras, amenazas… Nadie está obligado a cumplir lo que promete.${mine ? '' : '<br>💀 Te has quedado sin tropas: puedes seguir negociando… o vengándote de palabra.'}</div>
    ${isHost ? '<button class="btn" id="toord">📜 Pasar a las órdenes</button>' : ''}`);
  runTimer(m.ms);
  on('#toord', 'click', () => startOrders());
  if (V.round === 1) SFX.horn();
}
function myUnits() { return Object.keys(V.units).filter(t => V.units[t] === myId); }
function renderOrders(m) {
  show('orders', `${header('📜 Órdenes secretas', m.ms || 0)}
    <div id="mapwrap">${mapSVG()}</div>
    <div class="opanel" id="opanel"></div>
    <div class="sub" id="scount"></div>`);
  if (m.ms) runTimer(m.ms);
  drawOrders();
  SFX.drum();
}
function sendOrders(final) { toHost({ t: 'orders', orders: V.orders, final: !!final }); }
function drawOrders() {
  const mine = myUnits();
  const arrows = Object.entries(V.orders).map(([t, o]) => o.k === 'm' ? { from: t, to: o.to, col: colorOf(myId) } : o.k === 's' ? { from: t, to: o.d, col: colorOf(myId), cls: 'sup' } : null).filter(Boolean);
  let hl = [], help = '';
  if (V.sel && V.mode === 'm') { hl = ADJ[V.sel]; help = `Toca adónde avanza la tropa de <b>${T[V.sel].n}</b>`; }
  else if (V.sel && V.mode === 's1') { hl = Object.keys(V.units).filter(t => t !== V.sel && (adj(V.sel, t) || ADJ[t].some(x => adj(V.sel, x) && x !== V.sel))); help = `¿A qué tropa apoya <b>${T[V.sel].n}</b>? Toca una tropa (tuya o de otro)`; }
  else if (V.sel && V.mode === 's2') { hl = [V.supUnit, ...ADJ[V.supUnit]].filter(x => x !== V.sel && adj(V.sel, x)); help = `¿Para qué? Toca <b>${T[V.supUnit].n}</b> para apoyar su defensa, o el territorio al que debería entrar`; }
  else if (V.sel) help = `Tropa de <b>${T[V.sel].n}</b>: elige una orden`;
  else help = mine.length ? 'Toca una de tus tropas en el mapa (o en la lista) para darle una orden' : '💀 No tienes tropas. Espera a la resolución.';
  $('#mapwrap').innerHTML = mapSVG({ arrows, hl });
  $('#opanel').innerHTML = `<div class="ohelp">${help}</div>
    ${V.sel && !V.mode ? `<div class="obtns"><button class="btn sec small" data-o="h">🛡️ Defender</button><button class="btn small" data-o="m">➡️ Avanzar</button><button class="btn sec small" data-o="s">🤝 Apoyar</button></div>` : ''}
    ${V.mode ? '<button class="btn sec small" id="cancel">Cancelar</button>' : ''}
    <div class="olist">${mine.map(t => `<button class="oit${V.sel === t ? ' sel' : ''}" data-u="${t}">${orderTxt(t, V.orders[t])}</button>`).join('')}</div>
    ${mine.length ? '<button class="btn go" id="osend">✔ Confirmar órdenes</button>' : ''}`;
  $$('#imap .tn, #imap .un').forEach(g => g.addEventListener('click', () => tapT(g.dataset.t)));
  $$('[data-u]').forEach(b => b.addEventListener('click', () => { V.sel = b.dataset.u; V.mode = null; drawOrders(); }));
  $$('[data-o]').forEach(b => b.addEventListener('click', () => {
    const o = b.dataset.o;
    if (o === 'h') { V.orders[V.sel] = { k: 'h' }; V.sel = null; sendOrders(false); }
    else V.mode = o === 'm' ? 'm' : 's1';
    drawOrders();
  }));
  on('#cancel', 'click', () => { V.mode = null; drawOrders(); });
  on('#osend', 'click', () => { sendOrders(true); const b = $('#osend'); b.textContent = '✔ Enviadas (puedes cambiarlas hasta el final)'; buzz(30); });
}
function tapT(t) {
  if (V.phase !== 'orders') return;
  if (V.mode === 'm' && V.sel) { if (adj(V.sel, t)) { V.orders[V.sel] = { k: 'm', to: t }; V.sel = null; V.mode = null; sendOrders(false); } }
  else if (V.mode === 's1' && V.sel) { if (V.units[t] && t !== V.sel) { V.supUnit = t; V.mode = 's2'; } }
  else if (V.mode === 's2' && V.sel) { if (adj(V.sel, t) && (t === V.supUnit || adj(V.supUnit, t)) && t !== V.sel) { V.orders[V.sel] = { k: 's', s: V.supUnit, d: t }; V.sel = null; V.mode = null; sendOrders(false); } }
  else if (V.units[t] === myId) { V.sel = t; V.mode = null; }
  drawOrders();
}
function renderRes(m) {
  V.last = m;
  const arrows = ordersToArrows(m.orders);
  show('res', `${header('⚔️ Resolución', 0)}
    <div id="mapwrap">${mapSVG({ units: m.before, owner: V.owner, arrows })}</div>
    <div class="phase-sub" style="margin:6px 0">Todas las órdenes reveladas. ✖ = fallida o cortada</div>
    <div class="card"><ul class="plist log evs" style="list-style:none">${m.events.length ? m.events.map(e => `<li>${e.e} ${e.txt}</li>`).join('') : '<li>🕊️ Ronda tranquila: nadie se ha movido.</li>'}</ul></div>
    ${standings()}`);
  SFX.drum();
  setTimeout(() => {
    if (screen !== 'res') return;
    Object.assign(V, { owner: m.owner, units: m.units, stars: m.stars });
    const w = $('#mapwrap'); if (w) w.innerHTML = mapSVG({ arrows: arrows.map(a => ({ ...a, cls: (a.cls || '') + ' faded' })) });
    const s = $('.standings'); if (s) s.outerHTML = standings();
  }, 3500);
}
function renderEnd(m) {
  const MED = ['🥇', '🥈', '🥉'];
  Object.assign(V, { owner: m.owner, units: m.unitsMap, stars: m.stars });
  show('iend', `<div class="imp-bg"></div>
    <div class="mid" style="flex:none;margin-top:10px"><div style="font-size:60px">👑</div>
      <div class="title">¡${nm(m.rank[0])} domina el continente!</div>
      <div class="sub">${m.stars[m.rank[0]] >= WIN ? `Ha conseguido ${m.stars[m.rank[0]]} ciudades` : 'Más ciudades al acabar las rondas'}</div></div>
    ${mapSVG()}
    <div class="card"><table class="stats"><tr><th>Imperio</th><th>★</th><th>⚔</th><th>🚩</th><th>Pts</th></tr>
      ${m.rank.map((id, i) => `<tr><td><span class="nm">${MED[i] || ''} <span class="hat" style="background:${colorOf(id)}"></span>${nm(id)}</span></td><td>${m.stars[id]}</td><td>${m.units[id]}</td><td>${m.terr[id]}</td><td style="color:var(--ok)">${m.pts[id] ? '+' + m.pts[id] : '0'}</td></tr>`).join('')}</table>
      <div class="mute" style="font-size:12px;margin-top:6px">★ ciudades · ⚔ tropas · 🚩 territorios</div></div>
    ${isHost ? '<button class="btn go" id="again">🔁 Otra partida</button>' : '<div class="sub">Esperando al anfitrión…</div>'}${P.homeButton()}`);
  if (m.rank[0] === myId) { SFX.win(); buzz([50, 50, 50, 50, 150]); }
  on('#again', 'click', () => broadcast({ t: 'setup' })); P.bindHome();
}

function onMsg(m) {
  switch (m.t) {
    case 'set': settings = m.settings; if (screen === 'setup') renderSetup(); break;
    case 'setup': if (E) clearH(); E = null; renderSetup(); break;
    case 'init': break;
    case 'state': renderGame(m); break;
    case 'sentc': { const e = $('#scount'); if (e) e.textContent = `${m.n} / ${m.of} imperios han confirmado`; break; }
    case 'res': renderRes(m); break;
    case 'end': renderEnd(m); break;
  }
}

if (location.hash === '#debug') { window.__E = () => E; window.__IMP = { resolve, T, ADJ, STARS }; }
return {
  open() { if (isHost) sync(); renderSetup(); },
  onMsg,
  onHost: (id, m) => hostHandle(id, m),
  onPlayers(list) { players = list; if (screen === 'setup') renderSetup(); },
  onLeave: hostLeave,
  destroy() { clearTimers(); viewToken++; clearH(); E = null; },
};
  }
});
