/* Infiltrados: misiones, equipos votados, sabotajes e interferencias (La Resistencia + Among Us) */
Party.register({
  id: 'infil', name: 'Infiltrados', emoji: '🛸', players: '4-16', min: 3, wide: true,
  desc: 'Misiones por equipos con impostores ocultos: votad equipos, descifrad códigos hablando y cazad a los saboteadores',
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
function every(fn, ms) { const t = setInterval(fn, ms); timers.push(t); return t; }
function show(name, html) { clearTimers(); viewToken++; screen = name; app.innerHTML = html; window.scrollTo(0, 0); }
function on(sel, ev, fn) { const el = typeof sel === 'string' ? $(sel) : sel; if (el) el.addEventListener(ev, fn); }
const send = (id, m) => P.send(id, m), broadcast = m => P.broadcast(m), toHost = m => P.toHost(m);
const pl = id => players.find(p => p.id === id) || room.players.find(p => p.id === id) || { name: '¿?', color: '#888' };
const nm = id => esc(pl(id).name);
const chip = id => `<b style="color:${pl(id).color}">${nm(id)}</b>`;

let actx = null;
function audio() { try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) {} return actx; }
function tone(f, d = 0.15, type = 'sine', vol = 0.12, slide = 0) {
  const a = audio(); if (!a) return;
  try { const o = a.createOscillator(), g = a.createGain(), t = a.currentTime; o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + 0.02); } catch (e) {}
}
const SFX = {
  ok: () => [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, .2, 'triangle', .12), i * 110)),
  fail: () => [330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, .3, 'sawtooth', .07), i * 150)),
  alarm: () => { tone(600, .25, 'square', .07, -250); setTimeout(() => tone(600, .25, 'square', .07, -250), 300); },
  tick: () => tone(800, .05, 'sine', .06),
  win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, .25, 'triangle', .13), i * 120)),
};

/* ---------- reglas ---------- */
const SIZES = n => n <= 3 ? [2, 2, 2, 2, 2] : n === 4 ? [2, 2, 3, 2, 3] : n === 5 ? [2, 3, 2, 3, 3] : n === 6 ? [2, 3, 4, 3, 4] : n === 7 ? [2, 3, 3, 4, 4] : n <= 10 ? [3, 4, 4, 5, 5] : [3, 4, 5, 5, 6];
const IMPS = n => n <= 4 ? 1 : n <= 6 ? 2 : n <= 9 ? 3 : 4;
const NEED2 = (n, r) => n >= 7 && r === 3;
const ROLE = {
  crew: { n: 'Tripulante', e: '🧑‍🚀', team: 'v', d: 'Completa misiones con tu equipo. Hay impostores entre vosotros: vigila quién miente, quién falla y cómo vota cada uno.' },
  det: { n: 'Detective', e: '🔍', team: 'v', d: 'Eres tripulante y sabes quiénes son los impostores. Guía al grupo sin que se note: si al final te descubren, los impostores ganan.' },
  imp: { n: 'Impostor', e: '👾', team: 'w', d: 'Haz fallar 3 misiones sin que te pillen. En las misiones puedes jugar limpio, interferir en secreto o sabotear.' },
};
const OBJ = {
  mis3: { t: 'Participa en 3 misiones o más', e: '🚀' },
  no2: { t: 'Vota NO a 2 equipos o más', e: '✋' },
  cap: { t: 'Que se apruebe un equipo elegido por ti como capitán', e: '👑' },
  op: { t: 'Sé el operador de una misión con el código correcto', e: '⌨️' },
};
let settings = { det: false, obj: true };

/* =====================================================
   ANFITRIÓN
   ===================================================== */
let I = null;
function H(fn, ms) { const t = setTimeout(fn, ms); if (I) I.ht.push(t); return t; }
function clearH() { if (I) { I.ht.forEach(clearTimeout); I.ht = []; } }
const hname = id => (room.players.find(p => p.id === id) || {}).name || '¿?';
const aliveIds = () => I.order.filter(id => !I.out.includes(id) && room.players.some(p => p.id === id));

function hostBegin() {
  const ids = shuffle(room.players.map(p => p.id)), n = ids.length;
  if (n < 3) { toast('Hacen falta al menos 3 jugadores'); return; }
  const nImp = IMPS(n), imps = ids.slice(0, nImp);
  const roles = {}; ids.forEach(id => roles[id] = imps.includes(id) ? 'imp' : 'crew');
  let det = null;
  if (settings.det && n - nImp >= 2) { det = ids[nImp]; roles[det] = 'det'; }
  const order = shuffle(ids);
  I = { roles, imps, det, order, n, sizes: SIZES(n), capIdx: 0, round: 0, track: [], rejects: 0, phase: 'reveal', ready: {}, sel: [], team: [],
    votes: {}, out: [], meetUsed: {}, log: [], ht: [], objs: {}, st: { mis: {}, no: {}, capOk: {}, opOk: {} } };
  if (settings.obj) { const keys = Object.keys(OBJ); ids.forEach(id => I.objs[id] = pick(keys)); }
  ids.forEach(id => send(id, { t: 'role', role: roles[id], imps: roles[id] === 'crew' ? null : imps, obj: I.objs[id] || null, sizes: I.sizes, n, nImp, det: !!det }));
}
function hostReady(id) {
  if (!I || I.phase !== 'reveal') return;
  I.ready[id] = 1;
  broadcast({ t: 'readyc', n: Object.keys(I.ready).length, of: room.players.length });
  if (room.players.every(p => I.ready[p.id])) H(startTeam, 1000);
}
function pub() { return { track: I.track, rejects: I.rejects, round: I.round, sizes: I.sizes, out: I.out, roles: I.out.reduce((o, id) => (o[id] = I.roles[id], o), {}), meetUsed: Object.keys(I.meetUsed), need2: NEED2(I.n, I.round) }; }
function startTeam() {
  if (!I || I.phase === 'end') return;
  clearH();
  const alive = aliveIds();
  let cap = I.order[I.capIdx % I.order.length], guard = 0;
  while ((!alive.includes(cap)) && guard++ < 30) { I.capIdx++; cap = I.order[I.capIdx % I.order.length]; }
  I.cap = cap; I.phase = 'team'; I.sel = [];
  I.size = Math.min(I.sizes[I.round], alive.length);
  broadcast({ t: 'team', cap, size: I.size, alive, ...pub() });
}
function hostSel(id, target) {
  if (!I || I.phase !== 'team' || id !== I.cap || !aliveIds().includes(target)) return;
  const k = I.sel.indexOf(target);
  if (k >= 0) I.sel.splice(k, 1); else if (I.sel.length < I.size) I.sel.push(target);
  broadcast({ t: 'sel', sel: I.sel });
}
function hostConfirm(id) {
  if (!I || I.phase !== 'team' || id !== I.cap || I.sel.length !== I.size) return;
  I.team = I.sel.slice(); I.phase = 'vote'; I.votes = {};
  broadcast({ t: 'vote', team: I.team, cap: I.cap, ms: 30000, alive: aliveIds() });
  H(resolveTeamVote, 30000);
}
function hostVote(id, yes) {
  if (!I || I.phase !== 'vote' || !aliveIds().includes(id) || (id in I.votes)) return;
  I.votes[id] = !!yes;
  broadcast({ t: 'vc', n: Object.keys(I.votes).length, of: aliveIds().length });
  if (aliveIds().every(x => x in I.votes)) H(resolveTeamVote, 600);
}
function resolveTeamVote() {
  if (!I || I.phase !== 'vote') return;
  clearH();
  const alive = aliveIds();
  alive.forEach(id => { if (!(id in I.votes)) I.votes[id] = false; });
  const yes = alive.filter(id => I.votes[id]).length, approved = yes > alive.length / 2;
  alive.forEach(id => { if (!I.votes[id]) I.st.no[id] = (I.st.no[id] || 0) + 1; });
  I.phase = 'votes';
  const entry = { round: I.round + 1, cap: I.cap, team: I.team.slice(), votes: { ...I.votes }, approved };
  if (!approved) { I.rejects++; I.log.push(entry); }
  else { I.rejects = 0; I.cur = entry; I.st.capOk[I.cap] = 1; }
  broadcast({ t: 'votes', votes: I.votes, approved, rejects: I.rejects, team: I.team, cap: I.cap });
  I.capIdx++;
  if (!approved && I.rejects >= 5) return H(() => hostEnd('imps', 'rejects'), 4500);
  H(approved ? startPrep : startTeam, 4500);
}
function startPrep() {
  if (!I) return;
  clearH();
  I.phase = 'prep'; I.choice = {};
  const ms = 9000;
  I.team.forEach(id => I.st.mis[id] = (I.st.mis[id] || 0) + 1);
  room.players.forEach(p => {
    const onTeam = I.team.includes(p.id), imp = I.roles[p.id] === 'imp';
    send(p.id, { t: 'prep', team: I.team, ms, onTeam, choose: onTeam && imp, mates: onTeam && imp ? I.team.filter(x => x !== p.id) : null, need2: NEED2(I.n, I.round) });
  });
  H(startTask, ms);
}
function hostChoice(id, m) {
  if (!I || I.phase !== 'prep' || !I.team.includes(id) || I.roles[id] !== 'imp') return;
  const kind = ['clean', 'int', 'sab'].includes(m.kind) ? m.kind : 'clean';
  I.choice[id] = { kind, target: kind === 'int' && I.team.includes(m.target) && m.target !== id ? m.target : null };
  if (kind === 'int' && !I.choice[id].target) I.choice[id].kind = 'clean';
}
function startTask() {
  if (!I || I.phase !== 'prep') return;
  clearH();
  I.phase = 'task';
  const code = Array.from({ length: 4 }, () => ri(0, 9));
  const team = shuffle(I.team), k = team.length, info = {};
  team.forEach(id => info[id] = []);
  const pos = shuffle([0, 1, 2, 3]);
  pos.forEach((p, i) => info[team[i % k]].push(p));
  team.forEach((id, i) => {                      // solapamientos para poder contrastar
    const extra = shuffle([0, 1, 2, 3].filter(p => !info[id].includes(p)));
    const want = k <= 2 ? 1 : k <= 4 ? 1 : 0;
    for (let j = 0; j < want && j < extra.length; j++) info[id].push(extra[j]);
    if (!info[id].length) info[id].push(extra[0]);
  });
  const interfered = {};
  Object.entries(I.choice).forEach(([imp, c]) => { if (c.kind === 'int' && c.target) interfered[c.target] = imp; });
  const operator = pick(I.team);
  I.task = { code, info, operator, interfered, entered: null };
  const ms = 75000;
  room.players.forEach(p => {
    const mine = info[p.id];
    const shown = mine ? mine.sort((a, b) => a - b).map(q => ({ pos: q, d: interfered[p.id] ? (code[q] + ri(1, 9)) % 10 : code[q] })) : null;
    send(p.id, { t: 'task', team: I.team, operator, info: shown, ms });
  });
  H(() => resolveMission(), ms);
}
function hostCode(id, code) {
  if (!I || I.phase !== 'task' || id !== I.task.operator || I.task.entered) return;
  I.task.entered = String(code || '').replace(/\D/g, '').slice(0, 4);
  H(resolveMission, 400);
}
function resolveMission() {
  if (!I || I.phase !== 'task') return;
  clearH();
  I.phase = 'mres';
  const t = I.task, codeStr = t.code.join(''), codeOk = t.entered === codeStr;
  const sabs = Object.values(I.choice).filter(c => c.kind === 'sab').length;
  const need = NEED2(I.n, I.round) ? 2 : 1;
  const ok = codeOk && sabs < need;
  I.track.push(ok ? 1 : 0);
  if (codeOk) I.st.opOk[t.operator] = 1;
  Object.assign(I.cur, { code: codeStr, entered: t.entered, operator: t.operator, choice: I.choice, ok, sabs, codeOk });
  I.log.push(I.cur);
  I.round++;
  broadcast({ t: 'mres', ok, sabs, codeOk, code: codeStr, entered: t.entered, operator: t.operator, team: I.team, need, ...pub() });
  const wins = I.track.filter(x => x).length, fails = I.track.length - wins;
  if (wins >= 3) return H(() => crewWins('missions'), 6000);
  if (fails >= 3) return H(() => hostEnd('imps', 'missions'), 6000);
  H(startTeam, 6500);
}
function crewWins(reason) {
  if (I.det && room.players.some(p => p.id === I.det) && I.imps.some(id => room.players.some(p => p.id === id))) {
    I.phase = 'guess'; I.guesses = {}; I.winReason = reason;
    const ms = 45000;
    room.players.forEach(p => send(p.id, { t: 'guess', ms, chooser: I.roles[p.id] === 'imp', cands: room.players.map(q => q.id).filter(id => I.roles[id] !== 'imp') }));
    H(resolveGuess, ms);
  } else hostEnd('crew', reason);
}
function hostGuess(id, target) {
  if (!I || I.phase !== 'guess' || I.roles[id] !== 'imp') return;
  I.guesses[id] = target;
  if (I.imps.filter(x => room.players.some(p => p.id === x)).every(x => x in I.guesses)) H(resolveGuess, 500);
}
function resolveGuess() {
  if (!I || I.phase !== 'guess') return;
  clearH();
  const cnt = {}; Object.values(I.guesses).forEach(t => cnt[t] = (cnt[t] || 0) + 1);
  const max = Math.max(0, ...Object.values(cnt)), tops = Object.keys(cnt).filter(k => cnt[k] === max);
  const g = max ? pick(tops) : null;
  I.guessed = g;
  if (g && g === I.det) hostEnd('imps', 'detective'); else hostEnd('crew', I.winReason);
}
/* reunión de emergencia */
function hostMeet(id) {
  if (!I || I.phase !== 'team' || I.meetUsed[id] || !aliveIds().includes(id)) return;
  clearH();
  I.meetUsed[id] = 1; I.phase = 'meet'; I.mcaller = id;
  broadcast({ t: 'meet', caller: id, ms: 60000, alive: aliveIds() });
  H(startMeetVote, 60000);
}
function startMeetVote() {
  if (!I || I.phase !== 'meet') return;
  clearH();
  I.phase = 'mvote'; I.mvotes = {};
  broadcast({ t: 'mvote', ms: 40000, alive: aliveIds() });
  H(resolveMeet, 40000);
}
function hostMV(id, target) {
  if (!I || I.phase !== 'mvote' || !aliveIds().includes(id) || (id in I.mvotes)) return;
  if (target !== 'skip' && !aliveIds().includes(target)) return;
  I.mvotes[id] = target;
  broadcast({ t: 'vc', n: Object.keys(I.mvotes).length, of: aliveIds().length });
  if (aliveIds().every(x => x in I.mvotes)) H(resolveMeet, 600);
}
function resolveMeet() {
  if (!I || I.phase !== 'mvote') return;
  clearH();
  const alive = aliveIds(), cnt = {}, by = {};
  Object.entries(I.mvotes).forEach(([v, t]) => { cnt[t] = (cnt[t] || 0) + 1; (by[t] = by[t] || []).push(v); });
  const max = Math.max(0, ...Object.values(cnt)), tops = Object.keys(cnt).filter(k => cnt[k] === max);
  const target = (max > alive.length / 2 && tops.length === 1 && tops[0] !== 'skip') ? tops[0] : null;
  if (target) I.out.push(target);
  I.log.push({ meet: true, caller: I.mcaller, target, role: target ? I.roles[target] : null, votes: { ...I.mvotes } });
  I.phase = 'mres2';
  broadcast({ t: 'mres2', target, role: target ? I.roles[target] : null, tally: Object.keys(cnt).map(t => ({ id: t, by: by[t] })).sort((a, b) => b.by.length - a.by.length), ...pub() });
  const impsLeft = aliveIds().filter(id => I.roles[id] === 'imp').length;
  const crewLeft = aliveIds().length - impsLeft;
  if (impsLeft === 0) return H(() => hostEnd('crew', 'expelled'), 6000);
  if (impsLeft >= crewLeft) return H(() => hostEnd('imps', 'outnumber'), 6000);
  H(startTeam, 6500);
}
function hostEnd(winner, reason) {
  clearH();
  I.phase = 'end';
  const won = id => winner === 'imps' ? I.roles[id] === 'imp' : I.roles[id] !== 'imp';
  const objDone = {};
  Object.entries(I.objs).forEach(([id, o]) => {
    objDone[id] = o === 'mis3' ? (I.st.mis[id] || 0) >= 3 : o === 'no2' ? (I.st.no[id] || 0) >= 2 : o === 'cap' ? !!I.st.capOk[id] : !!I.st.opOk[id];
  });
  room.players.forEach(p => { if (!I.roles[p.id]) return; if (won(p.id)) p.score += 5; if (objDone[p.id]) p.score += 2; });
  P.broadcastPlayers();
  broadcast({ t: 'end', winner, reason, roles: I.roles, det: I.det, guessed: I.guessed || null, log: I.log, track: I.track, objs: I.objs, objDone });
}
function hostLeave(id) {
  if (!I || I.phase === 'end') return;
  if (!I.out.includes(id)) I.out.push(id);
  if (I.phase === 'team' && I.cap === id) { I.capIdx++; startTeam(); }
  else if (I.phase === 'team') { I.sel = I.sel.filter(x => x !== id); broadcast({ t: 'sel', sel: I.sel }); }
  if (I.phase === 'vote' && aliveIds().every(x => x in I.votes)) resolveTeamVote();
  if ((I.phase === 'prep' || I.phase === 'task') && I.team.includes(id)) { if (I.task && I.task.operator === id) I.task.operator = null; }
  if (I.phase === 'mvote' && aliveIds().every(x => x in I.mvotes)) resolveMeet();
}
function hostHandle(id, m) {
  if (!m) return;
  switch (m.t) {
    case 'ready': hostReady(id); break;
    case 'sel': hostSel(id, m.id); break;
    case 'confirm': hostConfirm(id); break;
    case 'vote': hostVote(id, m.yes); break;
    case 'choice': hostChoice(id, m); break;
    case 'code': hostCode(id, m.code); break;
    case 'meet': hostMeet(id); break;
    case 'mv': hostMV(id, m.target); break;
    case 'guess': hostGuess(id, m.target); break;
  }
}

/* =====================================================
   VISTAS
   ===================================================== */
const me = { role: null, imps: null, obj: null, sizes: [], pub: null };
const isOut = () => me.pub && me.pub.out.includes(myId);
function trackHTML(p) {
  if (!p) return '';
  const cells = p.sizes.map((s, i) => {
    const r = p.track[i];
    const cls = r === 1 ? 'ok' : r === 0 ? 'ko' : i === p.round ? 'cur' : '';
    return `<div class="tm ${cls}"><b>${r === 1 ? '✔' : r === 0 ? '✖' : s}</b>${i === 3 && p.need2 && r === undefined ? '<small>2✖</small>' : ''}</div>`;
  }).join('');
  return `<div class="track">${cells}</div><div class="rej">Rechazos seguidos: ${[0, 1, 2, 3, 4].map(i => `<i class="${i < p.rejects ? 'on' : ''}"></i>`).join('')}</div>`;
}
function peekHTML() {
  if (!me.role) return '';
  const R = ROLE[me.role];
  return `<button class="peek" id="peek">👁 Mi rol</button>
    <div class="peekcard" id="peekcard"><div style="font-size:46px">${R.e}</div><div style="font-size:22px;font-weight:900">${R.n}</div>
    ${me.imps ? `<div class="mute" style="margin-top:8px;font-weight:700">👾 Impostores: ${me.imps.map(chip).join(', ')}</div>` : ''}
    ${me.obj ? `<div class="mute" style="margin-top:8px;font-weight:700">🎯 Objetivo: ${OBJ[me.obj].t}</div>` : ''}
    <div class="mute" style="font-size:12px;margin-top:8px">Mantén pulsado para verlo</div></div>`;
}
function bindPeek() {
  const b = $('#peek'), c = $('#peekcard'); if (!b || !c) return;
  const onn = e => { e.preventDefault(); c.classList.add('on'); }, off = () => c.classList.remove('on');
  b.addEventListener('pointerdown', onn); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
}
function timerHTML() { return '<div class="ltimer" id="lt"></div>'; }
function runTimer(ms) {
  const end = Date.now() + ms;
  const upd = () => { const e = $('#lt'); if (!e) return; const s = Math.max(0, Math.ceil((end - Date.now()) / 1000)); e.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  upd(); every(upd, 250);
}
function pgrid(ids, opts = {}) {
  return `<div class="pgrid">${ids.map(id => `<button class="pbtn${opts.sel && opts.sel.includes(id) ? ' sel' : ''}" data-id="${esc(id)}"${opts.ro ? ' disabled style="opacity:1"' : ''}>
    <span class="dot" style="background:${pl(id).color}"></span><span class="nm">${nm(id)}${id === myId ? ' (tú)' : ''}</span>${opts.badge ? opts.badge(id) : ''}</button>`).join('')}
    ${opts.skip ? `<button class="pbtn" data-id="skip" style="grid-column:1/-1;justify-content:center;color:var(--mute)">${opts.skip}</button>` : ''}</div>`;
}
const bg = () => '<div class="infil-bg"></div>';

function renderSetup() {
  const n = players.length;
  show('setup', `${bg()}
    <div class="hubtop"><h1>🛸 Infil<span>trados</span></h1><div class="codechip"><b>${esc(P.code)}</b></div></div>
    <div class="card"><h3 style="margin-bottom:6px">Con ${n} jugadores</h3>
      <div style="font-weight:700;line-height:1.6">👾 ${IMPS(Math.max(3, n))} impostor${IMPS(Math.max(3, n)) > 1 ? 'es' : ''}${settings.det && n - IMPS(n) >= 2 ? ' · 🔍 1 detective' : ''} · 🧑‍🚀 el resto tripulantes</div>
      <div class="mute" style="font-weight:700;margin-top:4px">Tamaño de los equipos: ${SIZES(Math.max(3, n)).join(' · ')}${n >= 7 ? ' (la 4ª misión necesita 2 sabotajes)' : ''}</div></div>
    ${isHost ? `<div class="card"><div class="roletog">
      <label><input type="checkbox" id="det"${settings.det ? ' checked' : ''}>🔍 Detective</label>
      <label><input type="checkbox" id="obj"${settings.obj ? ' checked' : ''}>🎯 Objetivos personales</label></div></div>
      <button class="btn go" id="go">🛸 Empezar partida</button>${P.homeButton()}` : '<div class="card" style="text-align:center"><b>Esperando al anfitrión…</b></div>'}
    <div class="card"><h3 style="margin-bottom:8px">Cómo se juega</h3><ul class="rules">
      <li>Hay <b>5 misiones</b>. Ganan los tripulantes si salen bien 3; los impostores, si fallan 3 o se rechazan <b>5 equipos seguidos</b>.</li>
      <li>El <b>capitán</b> (va rotando) elige equipo y <b>todos votan</b> sí o no. Los votos se ven.</li>
      <li>En la misión, cada miembro ve <b>algunas cifras de un código</b> y el <b>operador</b> lo introduce. ¡Habladlo en voz alta!</li>
      <li>Los impostores del equipo eligen en secreto: <b>jugar limpio</b>, <b>📡 interferir</b> (a un compañero le salen cifras falsas, sin dejar rastro) o <b>🔪 sabotear</b> (falla seguro, pero se ve en el recuento).</li>
      <li>Cada jugador puede convocar <b>una reunión de emergencia</b> para expulsar a alguien.</li>
      ${settings.det ? '<li>El <b>🔍 detective</b> conoce a los impostores. Si el pueblo gana, los impostores pueden adivinar quién es y robar la victoria.</li>' : ''}
      ${settings.obj ? '<li>Cada uno tiene un <b>🎯 objetivo personal</b> secreto que da +2 puntos.</li>' : ''}
    </ul></div>`);
  if (isHost) {
    on('#det', 'change', e => { settings.det = e.target.checked; sync(); });
    on('#obj', 'change', e => { settings.obj = e.target.checked; sync(); });
    on('#go', 'click', () => { audio(); hostBegin(); });
    P.bindHome();
  }
}
function sync() { broadcast({ t: 'set', settings }); }

function renderRole(m) {
  me.role = m.role; me.imps = m.imps; me.obj = m.obj; me.sizes = m.sizes; me.pub = null;
  const R = ROLE[m.role];
  show('reveal', `${bg()}
    <div class="phase">Tu rol secreto</div>
    <div class="phase-sub">${m.nImp} impostor${m.nImp > 1 ? 'es' : ''} entre ${m.n} jugadores${m.det ? ' · hay un detective' : ''}</div>
    <div class="rolecard" id="rc"><div style="font-size:64px">🛸</div><div class="rn" style="font-size:24px">Toca para ver tu rol</div><div class="rd">Que nadie mire tu pantalla</div></div>
    <button class="btn" id="ready">Estoy listo</button><div class="sub" id="rcount"></div>`);
  let open = false;
  const rc = $('#rc');
  rc.addEventListener('click', () => {
    open = !open;
    if (open) {
      rc.className = 'rolecard open'; rc.style.borderColor = R.team === 'w' ? '#ff5a6e' : '#3ddc84';
      rc.innerHTML = `<div class="re">${R.e}</div><div class="rn">${R.n}</div><div class="rd">${R.d}</div>
        ${m.imps ? `<div class="note w" style="margin-top:12px">👾 ${m.role === 'imp' ? 'Tus compinches' : 'Los impostores son'}: ${m.imps.map(chip).join(', ')}</div>` : ''}
        ${m.obj ? `<div class="note" style="margin-top:8px">🎯 Objetivo personal (+2): ${OBJ[m.obj].t}</div>` : ''}
        <div class="mute" style="font-size:12px;margin-top:10px">Toca para ocultar</div>`;
      buzz(30);
    } else { rc.className = 'rolecard'; rc.style.borderColor = ''; rc.innerHTML = '<div style="font-size:64px">🛸</div><div class="rn" style="font-size:24px">Toca para ver tu rol</div><div class="rd">Que nadie mire tu pantalla</div>'; }
  });
  on('#ready', 'click', () => { toHost({ t: 'ready' }); $('#ready').disabled = true; $('#ready').textContent = '✔ Listo'; });
}
function renderTeam(m) {
  me.pub = m; me.cap = m.cap; me.size = m.size; me.alive = m.alive;
  const mine = m.cap === myId;
  show('team', `${bg()}${trackHTML(m)}
    <div class="phase" style="font-size:24px">Misión ${m.round + 1}</div>
    <div class="phase-sub">${mine ? `👑 Eres el capitán: elige a <b>${m.size}</b> para el equipo` : `👑 ${chip(m.cap)} está eligiendo un equipo de ${m.size}…`}</div>
    <div id="tsel">${pgrid(m.alive, { ro: !mine, badge: id => m.out.includes(id) ? '' : '' })}</div>
    ${mine ? `<button class="btn" id="conf" disabled>Proponer equipo</button>` : ''}
    ${m.out.length ? `<div class="mute" style="font-size:13px;margin-top:8px">Expulsados: ${m.out.map(id => `${nm(id)} (${ROLE[m.roles[id]].n})`).join(', ')}</div>` : ''}
    ${!isOut() && !m.meetUsed.includes(myId) ? '<button class="btn sec small" id="meet" style="margin-top:12px">🚨 Reunión de emergencia</button>' : ''}
    ${peekHTML()}`);
  bindPeek();
  if (mine) {
    $$('#tsel .pbtn').forEach(b => b.addEventListener('click', () => toHost({ t: 'sel', id: b.dataset.id })));
    on('#conf', 'click', () => toHost({ t: 'confirm' }));
  }
  on('#meet', 'click', () => {
    if (confirm_meet()) toHost({ t: 'meet' });
  });
}
let meetArmed = false;
function confirm_meet() {
  const b = $('#meet'); if (!b) return false;
  if (!meetArmed) { meetArmed = true; b.textContent = '🚨 Pulsa otra vez para confirmar (solo 1 por partida)'; setTimeout(() => { meetArmed = false; const x = $('#meet'); if (x) x.textContent = '🚨 Reunión de emergencia'; }, 3000); return false; }
  meetArmed = false; return true;
}
function renderSel(sel) {
  $$('#tsel .pbtn').forEach(b => b.classList.toggle('sel', sel.includes(b.dataset.id)));
  const c = $('#conf'); if (c) { c.disabled = sel.length !== me.size; c.textContent = sel.length === me.size ? 'Proponer equipo' : `Elige ${me.size - sel.length} más`; }
}
function renderVote(m) {
  const can = m.alive.includes(myId);
  show('vote', `${bg()}${trackHTML(me.pub)}
    <div class="phase" style="font-size:24px">¿Aprobáis este equipo?</div>
    <div class="phase-sub">Propuesto por 👑 ${chip(m.cap)}</div>${timerHTML()}
    ${pgrid(m.team, { ro: true })}
    ${can ? `<div class="row2" style="display:flex;gap:10px;margin-top:14px"><button class="btn" id="yes" style="background:var(--ok);box-shadow:0 5px 0 #1f8a50">👍 Sí</button><button class="btn" id="no" style="background:#ff5a6e;color:#fff;box-shadow:0 5px 0 #9a2030">👎 No</button></div>` : '<div class="note">Estás expulsado: no votas.</div>'}
    <div class="sub" id="vcount" style="margin-top:8px">0 / ${m.alive.length} votos</div>${peekHTML()}`);
  bindPeek(); runTimer(m.ms);
  const vote = y => { toHost({ t: 'vote', yes: y }); $('#yes').disabled = $('#no').disabled = true; (y ? $('#yes') : $('#no')).textContent += ' ✔'; buzz(20); };
  on('#yes', 'click', () => vote(true)); on('#no', 'click', () => vote(false));
}
function renderVotes(m) {
  const ids = Object.keys(m.votes);
  show('votes', `${bg()}${trackHTML(me.pub && { ...me.pub, rejects: m.rejects })}
    <div class="moon">${m.approved ? '✅' : '❌'}</div>
    <div class="phase">${m.approved ? 'Equipo aprobado' : 'Equipo rechazado'}</div>
    <div class="phase-sub">${m.approved ? `${m.team.map(chip).join(', ')} van a la misión` : `Rechazos seguidos: ${m.rejects} de 5`}</div>
    <div class="card"><div class="vgrid">${ids.map(id => `<div class="vchip ${m.votes[id] ? 'y' : 'n'}"><span class="dot" style="background:${pl(id).color}"></span>${nm(id)}<b>${m.votes[id] ? '👍' : '👎'}</b></div>`).join('')}</div></div>
    ${peekHTML()}`);
  bindPeek(); if (m.approved) SFX.ok(); else SFX.fail();
}
function renderPrep(m) {
  let body;
  if (m.choose) {
    body = `<div class="note w">👾 Eres impostor y vas en la misión. ¿Qué haces?${m.need2 ? '<br><small>Esta misión necesita 2 sabotajes para fallar.</small>' : ''}</div>
      <div class="chs">
        <button class="ch" data-k="clean">🤝 <b>Jugar limpio</b><small>Ganas confianza</small></button>
        <button class="ch" data-k="int">📡 <b>Interferencia</b><small>Un compañero verá cifras falsas. No deja rastro</small></button>
        <button class="ch" data-k="sab">🔪 <b>Sabotaje directo</b><small>Falla seguro, pero aparece en el recuento</small></button>
      </div><div id="intsel" style="display:none"><div class="lbl">¿A quién interfieres?</div>${pgrid(m.mates)}</div><div id="chmsg"></div>`;
  } else if (m.onTeam) body = '<div class="note">🛰️ Preparando la misión… revisa en silencio tu equipo.</div>';
  else body = `<div class="note">🛰️ El equipo se prepara: ${m.team.map(chip).join(', ')}</div>`;
  show('prep', `${bg()}<div class="moon">🛰️</div><div class="phase">Preparando misión</div>${timerHTML()}${body}${peekHTML()}`);
  bindPeek(); runTimer(m.ms);
  if (m.choose) {
    let kind = null;
    $$('.ch').forEach(b => b.addEventListener('click', () => {
      kind = b.dataset.k; $$('.ch').forEach(x => x.classList.toggle('sel', x === b));
      $('#intsel').style.display = kind === 'int' ? 'block' : 'none';
      if (kind !== 'int') { toHost({ t: 'choice', kind }); $('#chmsg').innerHTML = `<div class="note">✔ ${kind === 'clean' ? 'Jugarás limpio' : 'Sabotearás la misión'}</div>`; }
      else $('#chmsg').innerHTML = '';
      buzz(15);
    }));
    $$('#intsel .pbtn').forEach(b => b.addEventListener('click', () => {
      $$('#intsel .pbtn').forEach(x => x.classList.toggle('sel', x === b));
      toHost({ t: 'choice', kind: 'int', target: b.dataset.id });
      $('#chmsg').innerHTML = `<div class="note">✔ ${chip(b.dataset.id)} verá cifras falsas</div>`;
    }));
  }
}
function renderTask(m) {
  const onTeam = m.team.includes(myId), op = m.operator === myId;
  let body = '';
  if (onTeam) {
    body = `<div class="digits">${[0, 1, 2, 3].map(p => { const d = m.info.find(x => x.pos === p); return `<div class="dg${d ? '' : ' unk'}"><small>${p + 1}ª</small><b>${d ? d.d : '?'}</b></div>`; }).join('')}</div>
      <div class="phase-sub">Esto es lo que ves tú. Decídselo en voz alta al resto${op ? '' : ` y que ${chip(m.operator)} meta el código`}.</div>`;
    if (op) body += `<div class="note">⌨️ <b>Eres el operador:</b> introduce el código de 4 cifras.</div>
      <div class="codein2" id="cin">____</div>
      <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '⌫', 0, '✔'].map(k => `<button data-k="${k}">${k}</button>`).join('')}</div>`;
  } else body = `<div class="note">🛰️ El equipo ${m.team.map(chip).join(', ')} está en la misión. Operador: ${chip(m.operator)}</div>`;
  show('task', `${bg()}<div class="phase">🔐 Código de acceso</div>${timerHTML()}${body}${peekHTML()}`);
  bindPeek(); runTimer(m.ms);
  if (op) {
    let code = '';
    const draw = () => { $('#cin').textContent = (code + '____').slice(0, 4); };
    $$('.keypad button').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.k;
      if (k === '⌫') code = code.slice(0, -1);
      else if (k === '✔') { if (code.length === 4) { toHost({ t: 'code', code }); $$('.keypad button').forEach(x => x.disabled = true); $('#cin').classList.add('sent'); buzz(30); } return; }
      else if (code.length < 4) code += k;
      SFX.tick(); draw();
    }));
  }
}
function renderMres(m) {
  me.pub = m;
  show('mres', `${bg()}${trackHTML(m)}
    <div class="moon">${m.ok ? '✅' : '💥'}</div>
    <div class="phase">${m.ok ? '¡Misión cumplida!' : 'Misión fallida'}</div>
    <div class="card" style="text-align:center">
      <div style="font-size:20px;font-weight:900">🔪 ${m.sabs} sabotaje${m.sabs === 1 ? '' : 's'}${m.need === 2 ? ' <small class="mute">(hacían falta 2)</small>' : ''}</div>
      <div class="mute" style="font-weight:700;margin-top:6px">Código correcto: <b>${m.code}</b> · ${chip(m.operator || '')} metió: <b style="color:${m.codeOk ? 'var(--ok)' : '#ff6b7a'}">${m.entered || 'nada'}</b></div>
      <div class="mute" style="font-size:13px;margin-top:6px">${!m.ok && m.sabs === 0 ? '¿Un error… o alguien mintió? 🤔' : ''}</div>
    </div>${peekHTML()}`);
  bindPeek(); if (m.ok) SFX.ok(); else SFX.fail();
}
function renderMeet(m) {
  show('meet', `${bg()}<div class="moon">🚨</div><div class="phase">¡Reunión de emergencia!</div>
    <div class="phase-sub">Convocada por ${chip(m.caller)}. Debatid quién es impostor.</div>${timerHTML()}
    ${isHost ? '<button class="btn" id="tomv">🗳️ Pasar a votar</button>' : ''}${peekHTML()}`);
  bindPeek(); runTimer(m.ms); SFX.alarm(); buzz([100, 60, 100]);
  on('#tomv', 'click', () => startMeetVote());
}
function renderMVote(m) {
  const can = m.alive.includes(myId);
  show('mvote', `${bg()}<div class="moon">🗳️</div><div class="phase">¿A quién expulsáis?</div>
    <div class="phase-sub">Hace falta <b>más de la mitad</b> de los votos.</div>${timerHTML()}
    ${can ? pgrid(m.alive.filter(id => id !== myId), { skip: 'No expulsar a nadie' }) : '<div class="note">Estás expulsado: no votas.</div>'}
    <div class="sub" id="vcount" style="margin-top:8px">0 / ${m.alive.length} votos</div>${peekHTML()}`);
  bindPeek(); runTimer(m.ms);
  if (can) $$('.pbtn').forEach(b => b.addEventListener('click', () => { $$('.pbtn').forEach(x => x.disabled = true); b.disabled = false; b.classList.add('sel'); toHost({ t: 'mv', target: b.dataset.id }); buzz(20); }));
}
function renderMres2(m) {
  me.pub = m;
  show('mres2', `${bg()}<div class="moon">${m.target ? (m.role === 'imp' ? '👾' : '😬') : '🤷'}</div>
    <div class="phase">${m.target ? `${chip(m.target)} ha sido expulsado` : 'Nadie es expulsado'}</div>
    <div class="phase-sub">${m.target ? `Era ${ROLE[m.role].e} <b>${ROLE[m.role].n}</b>` : 'No hubo mayoría suficiente'}</div>
    <div class="card"><ul class="plist tally">${m.tally.map(t => `<li><span>${t.id === 'skip' ? 'Nadie' : chip(t.id)} · ${t.by.length}</span><small>${t.by.map(nm).join(', ')}</small></li>`).join('')}</ul></div>${peekHTML()}`);
  bindPeek(); if (m.target) { if (m.role === 'imp') SFX.ok(); else SFX.fail(); }
}
function renderGuess(m) {
  show('guess', `${bg()}<div class="moon">🔍</div><div class="phase">¡Última oportunidad!</div>
    <div class="phase-sub">${m.chooser ? 'Los tripulantes han completado 3 misiones… pero si adivináis quién es el <b>detective</b>, ganáis vosotros.' : 'Los impostores intentan adivinar quién es el detective…'}</div>${timerHTML()}
    ${m.chooser ? pgrid(m.cands) : ''}${peekHTML()}`);
  bindPeek(); runTimer(m.ms);
  if (m.chooser) $$('.pbtn').forEach(b => b.addEventListener('click', () => { $$('.pbtn').forEach(x => x.classList.toggle('sel', x === b)); toHost({ t: 'guess', target: b.dataset.id }); }));
}
function renderEnd(m) {
  const crew = m.winner === 'crew';
  const why = { missions: crew ? '3 misiones cumplidas' : '3 misiones fallidas', rejects: '5 equipos rechazados seguidos', expelled: 'todos los impostores expulsados', outnumber: 'los impostores ya son mayoría', detective: 'descubrieron al detective' }[m.reason] || '';
  const iWon = m.roles[myId] && (crew ? m.roles[myId] !== 'imp' : m.roles[myId] === 'imp');
  const choiceTxt = c => !c ? '' : Object.entries(c).map(([id, x]) => x.kind === 'sab' ? `🔪 ${esc(pl(id).name)} saboteó` : x.kind === 'int' ? `📡 ${esc(pl(id).name)} interfirió a ${esc(pl(x.target).name)}` : `🤝 ${esc(pl(id).name)} jugó limpio`).join(' · ');
  const replay = m.log.map(e => e.meet
    ? `<li>🚨 Reunión de ${nm(e.caller)} → ${e.target ? `expulsado ${nm(e.target)} (${ROLE[e.role].n})` : 'nadie expulsado'}</li>`
    : `<li><b>Misión ${e.round}</b> · 👑 ${nm(e.cap)} propuso ${e.team.map(nm).join(', ')} → ${e.approved ? 'aprobado' : 'rechazado'}
        <div class="mute" style="font-size:12px">👍 ${Object.keys(e.votes).filter(i => e.votes[i]).map(nm).join(', ') || '—'} · 👎 ${Object.keys(e.votes).filter(i => !e.votes[i]).map(nm).join(', ') || '—'}</div>
        ${e.approved && e.code ? `<div style="font-size:13px">${e.ok ? '✅' : '💥'} Código ${e.code}, ${nm(e.operator)} metió ${e.entered || 'nada'} ${choiceTxt(e.choice) ? '· ' + choiceTxt(e.choice) : ''}</div>` : ''}</li>`).join('');
  show('iend', `${bg()}<div class="moon">${crew ? '🧑‍🚀' : '👾'}</div>
    <div class="phase ${crew ? 'team-v' : 'team-w'}">${crew ? '¡Ganan los tripulantes!' : '¡Ganan los impostores!'}</div>
    <div class="phase-sub">${why}${m.guessed ? ` · los impostores señalaron a ${nm(m.guessed)}${m.guessed === m.det ? ' ¡y acertaron!' : ' y fallaron'}` : ''}</div>
    <div class="phase-sub">${iWon ? '🏆 ¡Has ganado! +5 puntos' : 'Esta vez no ha podido ser'}${m.objDone[myId] ? ' · 🎯 objetivo cumplido +2' : ''}</div>
    <div class="card"><h3 style="margin-bottom:6px">Roles</h3><ul class="plist">${players.filter(p => m.roles[p.id]).sort((a, b) => (m.roles[a.id] === 'imp' ? -1 : 1)).map(p => `<li>
      <span style="font-size:20px">${ROLE[m.roles[p.id]].e}</span><span class="nm">${esc(p.name)}${p.id === myId ? '<span class="tag">TÚ</span>' : ''}</span>
      ${m.objs[p.id] ? `<span style="font-size:12px" title="${OBJ[m.objs[p.id]].t}">${OBJ[m.objs[p.id]].e}${m.objDone[p.id] ? '✔' : '✖'}</span>` : ''}
      <span class="team-${ROLE[m.roles[p.id]].team}" style="font-size:13px;font-weight:900">${ROLE[m.roles[p.id]].n}</span></li>`).join('')}</ul></div>
    <div class="card"><h3 style="margin-bottom:6px">🎬 Repetición</h3><ul class="plist log" style="list-style:none">${replay}</ul></div>
    ${isHost ? '<button class="btn go" id="again">🔁 Otra partida</button>' : '<div class="sub">Esperando al anfitrión…</div>'}${P.homeButton()}`);
  on('#again', 'click', () => broadcast({ t: 'setup' })); P.bindHome();
  if (iWon) { SFX.win(); buzz([50, 50, 50, 50, 150]); }
}

function onMsg(m) {
  switch (m.t) {
    case 'set': settings = m.settings; if (screen === 'setup') renderSetup(); break;
    case 'setup': I = null; renderSetup(); break;
    case 'role': renderRole(m); break;
    case 'readyc': { const e = $('#rcount'); if (e) e.textContent = `${m.n} / ${m.of} listos`; break; }
    case 'team': renderTeam(m); break;
    case 'sel': renderSel(m.sel); break;
    case 'vote': renderVote(m); break;
    case 'vc': { const e = $('#vcount'); if (e) e.textContent = `${m.n} / ${m.of} votos`; break; }
    case 'votes': renderVotes(m); break;
    case 'prep': renderPrep(m); break;
    case 'task': renderTask(m); break;
    case 'mres': renderMres(m); break;
    case 'meet': renderMeet(m); break;
    case 'mvote': renderMVote(m); break;
    case 'mres2': renderMres2(m); break;
    case 'guess': renderGuess(m); break;
    case 'end': renderEnd(m); break;
  }
}

if (location.hash === '#debug') window.__I = () => I;
return {
  open() { if (isHost) sync(); renderSetup(); },
  onMsg,
  onHost: (id, m) => hostHandle(id, m),
  onPlayers(list) { players = list; if (screen === 'setup') renderSetup(); },
  onLeave: hostLeave,
  destroy() { clearTimers(); viewToken++; clearH(); I = null; },
};
  }
});
