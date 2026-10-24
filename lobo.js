/* Hombres Lobo con narrador automático */
Party.register({
  id: 'lobo', name: 'Hombres Lobo', emoji: '🐺', players: '5-16', min: 4, wide: true,
  desc: 'Deducción social con narrador automático: lobos, vidente, bruja, cazador, cupido y protector',
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
function later(fn, ms) { const t = setTimeout(fn, ms); timers.push(t); return t; }
function every(fn, ms) { const t = setInterval(fn, ms); timers.push(t); return t; }
function show(name, html) { clearTimers(); viewToken++; screen = name; app.innerHTML = html; window.scrollTo(0, 0); }
function on(sel, ev, fn) { const el = typeof sel === 'string' ? $(sel) : sel; if (el) el.addEventListener(ev, fn); }
const send = (id, m) => P.send(id, m), broadcast = m => P.broadcast(m), toHost = m => P.toHost(m);

/* sonido */
let actx = null;
function audio() { try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) {} return actx; }
function tone(f, d = 0.2, type = 'sine', vol = 0.12, slide = 0) {
  const a = audio(); if (!a) return;
  try { const o = a.createOscillator(), g = a.createGain(), t = a.currentTime; o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t + d); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + 0.02); } catch (e) {}
}
const SFX = {
  night: () => [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, .5, 'sine', .1), i * 260)),
  dawn: () => [262, 330, 392, 523].forEach((f, i) => setTimeout(() => tone(f, .35, 'triangle', .1), i * 180)),
  death: () => tone(180, .8, 'sawtooth', .07, -90),
  howl: () => tone(420, .9, 'sine', .08, 380),
  tick: () => tone(700, .06, 'sine', .06),
  win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, .25, 'triangle', .13), i * 120)),
};
/* voz del narrador (solo en el móvil del anfitrión) */
function speak(text) {
  if (!isHost || !settings.voice || !('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text); u.lang = 'es-ES'; u.rate = 0.95; u.pitch = 0.9;
    const v = speechSynthesis.getVoices().find(v => /^es/i.test(v.lang)); if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch (e) {}
}

/* ---------- roles ---------- */
const ROLES = {
  lobo: { n: 'Hombre Lobo', e: '🐺', team: 'w', d: 'Cada noche, con los demás lobos, elegís en secreto a quién devorar. De día, disimula y señala a otros.' },
  aldeano: { n: 'Aldeano', e: '🧑‍🌾', team: 'v', d: 'No tienes poderes, pero tu olfato y tu voto son la mejor arma del pueblo para encontrar a los lobos.' },
  vidente: { n: 'Vidente', e: '🔮', team: 'v', d: 'Cada noche descubres el rol de un jugador. Si los lobos sospechan de ti, irán a por ti.' },
  bruja: { n: 'Bruja', e: '🧪', team: 'v', d: 'Tienes dos pociones para toda la partida: una de vida, que salva a la víctima de los lobos, y una de muerte.' },
  cazador: { n: 'Cazador', e: '🏹', team: 'v', d: 'Si mueres, disparas tu último cartucho y te llevas a quien elijas contigo.' },
  cupido: { n: 'Cupido', e: '💘', team: 'v', d: 'La primera noche enamoras a dos jugadores. Si uno muere, el otro muere de pena.' },
  protector: { n: 'Protector', e: '🛡️', team: 'v', d: 'Cada noche proteges a alguien de los lobos (puedes ser tú). No puedes repetir con la misma persona dos noches seguidas.' },
};
const SPECIALS = ['vidente', 'bruja', 'cazador', 'cupido', 'protector'];
const TEAMN = { v: 'Pueblo', w: 'Lobos' };
const autoWolves = n => n <= 6 ? 1 : n <= 10 ? 2 : n <= 14 ? 3 : 4;
let settings = { roles: { vidente: true, bruja: true, cazador: true, cupido: false, protector: false }, wolves: 0, disc: 180, reveal: true, voice: true };

const pl = id => players.find(p => p.id === id) || room.players.find(p => p.id === id) || { name: '¿?', color: '#888' };
const nm = id => esc(pl(id).name);
const chip = id => `<b style="color:${pl(id).color}">${nm(id)}</b>`;
function rolePlan(n) {
  let w = settings.wolves || autoWolves(n);
  w = Math.max(1, Math.min(w, Math.max(1, Math.floor((n - 1) / 2))));
  const sp = SPECIALS.filter(r => settings.roles[r]).slice(0, Math.max(0, n - w));
  const plan = { lobo: w }; sp.forEach(r => plan[r] = 1);
  const vill = n - w - sp.length; if (vill > 0) plan.aldeano = vill;
  return plan;
}
const planText = plan => Object.entries(plan).map(([r, c]) => `${ROLES[r].e} ${c > 1 ? c + '× ' : ''}${ROLES[r].n}`).join(' · ');

/* =====================================================
   ANFITRIÓN
   ===================================================== */
let L = null;
function H(fn, ms) { const t = setTimeout(fn, ms); if (L) L.htimers.push(t); return t; }
function clearH() { if (L) { L.htimers.forEach(clearTimeout); L.htimers = []; } }
const rolesOf = r => L.alive.filter(id => L.roles[id] === r);
const aliveRole = r => L.alive.find(id => L.roles[id] === r);
const hname = id => (room.players.find(p => p.id === id) || {}).name || '¿?';

function hostBegin() {
  const ids = shuffle(room.players.map(p => p.id)), n = ids.length;
  if (n < 4) { toast('Hacen falta al menos 4 jugadores'); return; }
  const plan = rolePlan(n), deck = [];
  Object.entries(plan).forEach(([r, c]) => { for (let i = 0; i < c; i++) deck.push(r); });
  const roles = {}; shuffle(deck).forEach((r, i) => roles[ids[i]] = r);
  L = { roles, plan, alive: ids.slice(), night: 0, day: 0, lovers: [], potions: { heal: true, poison: true }, guardLast: null,
    log: [], phase: 'reveal', ready: {}, acts: {}, wolfVotes: {}, hunterQueue: [], guesses: {}, votes: {}, htimers: [] };
  const wolves = ids.filter(id => roles[id] === 'lobo');
  room.players.forEach(p => send(p.id, { t: 'role', role: roles[p.id], wolves: roles[p.id] === 'lobo' ? wolves : null, plan }));
  speak('Mirad vuestro rol en secreto. Cuando estéis listos, pulsad el botón.');
}
function hostReady(id) {
  if (!L || L.phase !== 'reveal') return;
  L.ready[id] = 1;
  const n = Object.keys(L.ready).length;
  broadcast({ t: 'readyc', n, of: room.players.length });
  if (room.players.every(p => L.ready[p.id])) H(startNight, 1200);
}
function taskFor(id, step) {
  if (!L.alive.includes(id)) return { kind: 'dead' };
  const r = L.roles[id], others = L.alive.filter(x => x !== id);
  if (step === 'B') return { kind: 'sleep' };
  if (r === 'lobo') return { kind: 'wolf', cands: L.alive.filter(x => L.roles[x] !== 'lobo'), mates: rolesOf('lobo') };
  if (r === 'vidente') return { kind: 'seer', cands: others };
  if (r === 'protector') return { kind: 'guard', cands: L.alive.slice(), last: L.guardLast };
  if (r === 'cupido' && L.night === 1) return { kind: 'cupid', cands: L.alive.slice() };
  return { kind: 'dummy', cands: others };
}
function startNight() {
  if (!L || L.phase === 'end') return;
  clearH();
  L.night++; L.phase = 'nightA'; L.acts = {}; L.wolfVotes = {}; L.victim = null;
  const ms = 40000;
  L.minUntil = Date.now() + 9000;
  L.need = [];
  if (rolesOf('lobo').length) L.need.push('wolf');
  if (aliveRole('vidente')) L.need.push('seer');
  if (aliveRole('protector')) L.need.push('guard');
  if (aliveRole('cupido') && L.night === 1) L.need.push('cupid');
  room.players.forEach(p => send(p.id, { t: 'night', n: L.night, step: 'A', task: taskFor(p.id, 'A'), ms }));
  speak(L.night === 1 ? 'Cae la primera noche sobre el pueblo. Todos usáis el móvil en secreto. Que nadie mire la pantalla de nadie.' : 'Cae la noche. Usad el móvil en secreto.');
  H(endNightA, ms);
}
function nightCheck(endFn) {
  const done = L.need.every(k => L.acts[k] !== undefined);
  if (!done) return;
  const wait = Math.max(0, L.minUntil - Date.now());
  H(endFn, wait + 300);
}
function hostAct(id, m) {
  if (!L || !L.alive.includes(id)) return;
  const r = L.roles[id];
  if (L.phase === 'nightA') {
    if (r === 'lobo' && m.kind === 'wolf') {
      if (!L.alive.includes(m.target) || L.roles[m.target] === 'lobo') return;
      L.wolfVotes[id] = m.target;
      const wolves = rolesOf('lobo');
      wolves.forEach(w => send(w, { t: 'wolfv', votes: L.wolfVotes }));
      const vals = wolves.map(w => L.wolfVotes[w]);
      if (vals.every(v => v && v === vals[0])) { L.acts.wolf = vals[0]; nightCheck(endNightA); }
      else delete L.acts.wolf;
    } else if (r === 'vidente' && m.kind === 'seer' && L.acts.seer === undefined) {
      if (!L.alive.includes(m.target) || m.target === id) return;
      L.acts.seer = m.target;
      send(id, { t: 'seen', target: m.target, role: L.roles[m.target] });
      L.log.push(`🔮 Noche ${L.night}: la vidente (${hname(id)}) investigó a ${hname(m.target)} → ${ROLES[L.roles[m.target]].n}`);
      nightCheck(endNightA);
    } else if (r === 'protector' && m.kind === 'guard' && L.acts.guard === undefined) {
      if (!L.alive.includes(m.target) || m.target === L.guardLast) return;
      L.acts.guard = m.target; nightCheck(endNightA);
    } else if (r === 'cupido' && m.kind === 'cupid' && L.night === 1 && L.acts.cupid === undefined) {
      const t = (m.targets || []).filter(x => L.alive.includes(x));
      if (t.length !== 2 || t[0] === t[1]) return;
      L.acts.cupid = t; nightCheck(endNightA);
    } else if (m.kind === 'dummy') {
      if (!L.guesses[id]) L.guesses[id] = [];
      if (L.alive.includes(m.target)) L.guesses[id].push(m.target);
    }
  } else if (L.phase === 'nightB' && r === 'bruja' && m.kind === 'witch' && L.acts.witch === undefined) {
    L.acts.witch = { heal: !!m.heal && L.potions.heal && !!L.victim, poison: (m.poison && L.potions.poison && L.alive.includes(m.poison) && m.poison !== id) ? m.poison : null };
    nightCheck(endNightB);
  }
}
function endNightA() {
  if (!L || L.phase !== 'nightA') return;
  clearH();
  // víctima de los lobos: unanimidad o, si no, la más votada (empate al azar)
  let victim = L.acts.wolf || null;
  if (!victim) {
    const cnt = {}; Object.values(L.wolfVotes).forEach(t => { if (L.alive.includes(t)) cnt[t] = (cnt[t] || 0) + 1; });
    const max = Math.max(0, ...Object.values(cnt));
    if (max > 0) victim = pick(Object.keys(cnt).filter(k => cnt[k] === max));
  }
  L.victim = victim;
  if (victim) L.log.push(`🐺 Noche ${L.night}: los lobos atacaron a ${hname(victim)}`);
  if (L.acts.cupid) { L.lovers = L.acts.cupid; L.log.push(`💘 Cupido enamoró a ${hname(L.lovers[0])} y ${hname(L.lovers[1])}`); }
  if (L.acts.guard) L.log.push(`🛡️ El protector cuidó de ${hname(L.acts.guard)}`);
  const witch = aliveRole('bruja');
  if (witch && (L.potions.heal || L.potions.poison)) {
    L.phase = 'nightB'; L.need = ['witch']; L.minUntil = Date.now() + 7000;
    const ms = 25000;
    room.players.forEach(p => {
      const task = p.id === witch
        ? { kind: 'witch', victim, heal: L.potions.heal && !!victim, poison: L.potions.poison, cands: L.alive.filter(x => x !== p.id) }
        : taskFor(p.id, 'B');
      send(p.id, { t: 'night', n: L.night, step: 'B', task, ms });
    });
    H(endNightB, ms);
  } else resolveNight();
}
function endNightB() { if (!L || L.phase !== 'nightB') return; clearH(); resolveNight(); }
function kill(ids, why) {
  const out = [], q = ids.map(id => ({ id, why }));
  while (q.length) {
    const d = q.shift();
    if (!L.alive.includes(d.id)) continue;
    L.alive = L.alive.filter(x => x !== d.id);
    out.push(d);
    send(d.id, { t: 'ghost', roles: L.roles, lovers: L.lovers });
    if (L.roles[d.id] === 'cazador') L.hunterQueue.push(d.id);
    if (L.lovers.includes(d.id)) { const o = L.lovers.find(x => x !== d.id); if (L.alive.includes(o)) q.push({ id: o, why: 'love' }); }
  }
  return out;
}
const pub = list => list.map(d => ({ id: d.id, why: d.why, role: settings.reveal ? L.roles[d.id] : null }));
function resolveNight() {
  L.phase = 'dawn';
  let v = L.victim; const deaths = [];
  const w = L.acts.witch || {};
  if (v && L.acts.guard === v) { L.log.push(`🛡️ …pero el protector lo salvó`); v = null; }
  if (w.heal && L.potions.heal) { L.potions.heal = false; if (v) { L.log.push(`🧪 …pero la bruja lo salvó con la poción de vida`); v = null; } }
  if (v) deaths.push(v);
  if (w.poison && L.potions.poison) { L.potions.poison = false; L.log.push(`🧪 La bruja envenenó a ${hname(w.poison)}`); if (!deaths.includes(w.poison)) deaths.push(w.poison); }
  L.guardLast = L.acts.guard || null;
  const dead = kill(deaths, 'night');
  if (L.night === 1 && L.lovers.length === 2) L.lovers.forEach((id, i) => send(id, { t: 'lovers', with: L.lovers[1 - i] }));
  broadcast({ t: 'dawn', n: L.night, deaths: pub(dead), alive: L.alive });
  if (!dead.length) speak('Amanece. Milagro: esta noche no ha muerto nadie.');
  else speak('Amanece. Esta noche ha muerto ' + dead.map(d => hname(d.id)).join(' y ') + '.');
  H(() => afterDeaths(startDay), 6500);
}
function checkWin() {
  const a = L.alive, wolves = a.filter(id => L.roles[id] === 'lobo').length, others = a.length - wolves;
  if (L.lovers.length === 2 && a.length === 2 && L.lovers.every(id => a.includes(id)) && ROLES[L.roles[L.lovers[0]]].team !== ROLES[L.roles[L.lovers[1]]].team) return 'lovers';
  if (wolves === 0) return 'village';
  if (wolves >= others) return 'wolves';
  return null;
}
function afterDeaths(cont) {
  if (!L || L.phase === 'end') return;
  const win = checkWin();
  if (win) return hostEnd(win);
  if (L.hunterQueue.length) return hunterPhase(cont);
  cont();
}
function hunterPhase(cont) {
  const id = L.hunterQueue.shift();
  L.phase = 'hunter'; L.hunter = id; L.hcont = cont;
  broadcast({ t: 'hunter', who: id, cands: L.alive.slice(), ms: 25000 });
  speak(hname(id) + ' era el cazador. Antes de morir, dispara su último cartucho.');
  H(() => hunterShot(id, null), 25000);
}
function hunterShot(id, target) {
  if (!L || L.phase !== 'hunter' || L.hunter !== id) return;
  clearH(); L.phase = 'shot';
  const dead = target && L.alive.includes(target) ? kill([target], 'hunter') : [];
  if (dead.length) L.log.push(`🏹 El cazador (${hname(id)}) disparó a ${hname(target)}`);
  broadcast({ t: 'shot', by: id, deaths: pub(dead), alive: L.alive });
  H(() => afterDeaths(L.hcont), dead.length ? 5500 : 2500);
}
function startDay() {
  if (!L || L.phase === 'end') return;
  clearH();
  L.day++; L.phase = 'day';
  broadcast({ t: 'day', n: L.day, ms: settings.disc * 1000, alive: L.alive });
  speak('Es de día. El pueblo debate quién puede ser un lobo.');
  if (settings.disc) H(startVote, settings.disc * 1000);
}
function startVote() {
  if (!L || L.phase !== 'day') return;
  clearH();
  L.phase = 'vote'; L.votes = {};
  broadcast({ t: 'vote', ms: 45000, alive: L.alive });
  speak('Hora de votar. Elegid a quién expulsar del pueblo.');
  H(resolveVote, 45000);
}
function hostVote(id, target) {
  if (!L || L.phase !== 'vote' || !L.alive.includes(id) || (id in L.votes)) return;
  if (target !== 'skip' && !L.alive.includes(target)) return;
  L.votes[id] = target;
  broadcast({ t: 'vt', n: Object.keys(L.votes).length, of: L.alive.length });
  if (L.alive.every(x => x in L.votes)) H(resolveVote, 800);
}
function resolveVote() {
  if (!L || L.phase !== 'vote') return;
  clearH(); L.phase = 'voted';
  const cnt = {}, by = {};
  Object.entries(L.votes).forEach(([v, t]) => { cnt[t] = (cnt[t] || 0) + 1; (by[t] = by[t] || []).push(v); });
  const max = Math.max(0, ...Object.values(cnt)), tops = Object.keys(cnt).filter(k => cnt[k] === max);
  const target = max > 0 && tops.length === 1 && tops[0] !== 'skip' ? tops[0] : null;
  const tally = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).map(t => ({ id: t, by: by[t] }));
  const dead = target ? kill([target], 'vote') : [];
  L.log.push(target ? `🗳️ Día ${L.day}: el pueblo expulsó a ${hname(target)} (${ROLES[L.roles[target]].n})` : `🗳️ Día ${L.day}: no hubo acuerdo, nadie fue expulsado`);
  broadcast({ t: 'voted', target, deaths: pub(dead), tally, alive: L.alive });
  speak(target ? 'El pueblo ha decidido expulsar a ' + hname(target) + '.' : 'No hay acuerdo. Nadie es expulsado hoy.');
  H(() => afterDeaths(startNight), 7000);
}
function hostEnd(winner) {
  clearH(); L.phase = 'end';
  const winners = room.players.filter(p => L.roles[p.id] && (
    winner === 'lovers' ? L.lovers.includes(p.id) : winner === 'wolves' ? L.roles[p.id] === 'lobo' : ROLES[L.roles[p.id]].team === 'v'));
  winners.forEach(p => p.score += winner === 'lovers' ? 7 : 5);
  // olfato: aciertos de los aldeanos al señalar lobos de noche
  const nose = Object.entries(L.guesses).map(([id, g]) => ({ id, ok: g.filter(t => L.roles[t] === 'lobo').length })).filter(x => x.ok > 0).sort((a, b) => b.ok - a.ok)[0] || null;
  P.broadcastPlayers();
  broadcast({ t: 'end', winner, roles: L.roles, lovers: L.lovers, alive: L.alive, log: L.log, winners: winners.map(p => p.id), nose });
  speak(winner === 'wolves' ? 'Los lobos han devorado al pueblo. Ganan los hombres lobo.' : winner === 'lovers' ? 'Solo quedan los enamorados. El amor gana.' : 'No queda ningún lobo. ¡Gana el pueblo!');
}
function hostLeave(id) {
  if (!L || L.phase === 'end') return;
  if (L.alive.includes(id)) {
    L.alive = L.alive.filter(x => x !== id);
    L.log.push(`🚪 ${hname(id)} abandonó la partida`);
    if (L.phase === 'nightA') { if (L.roles[id] === 'lobo') { delete L.wolfVotes[id]; } L.need = L.need.filter(k => !(k === 'seer' && !aliveRole('vidente')) && !(k === 'guard' && !aliveRole('protector')) && !(k === 'cupid' && !aliveRole('cupido')) && !(k === 'wolf' && !rolesOf('lobo').length)); nightCheck(endNightA); }
    if (L.phase === 'nightB' && L.roles[id] === 'bruja') endNightB();
    if (L.phase === 'vote' && L.alive.every(x => x in L.votes)) H(resolveVote, 500);
    if (L.phase === 'hunter' && L.hunter === id) hunterShot(id, null);
    const win = checkWin(); if (win && ['day', 'vote', 'nightA', 'nightB'].includes(L.phase)) hostEnd(win);
  }
}
function hostHandle(id, m) {
  if (!m) return;
  if (m.t === 'ready') hostReady(id);
  else if (m.t === 'act') hostAct(id, m);
  else if (m.t === 'vote') hostVote(id, m.target);
  else if (m.t === 'shoot') { if (L && L.phase === 'hunter' && L.hunter === id) hunterShot(id, m.target); }
  else if (m.t === 'settings' && id === 'host') { /* local */ }
}

/* =====================================================
   VISTAS
   ===================================================== */
const me = { role: null, wolves: null, plan: null, lover: null, seen: [], ghost: null, alive: true, aliveList: [] };
function bg(night) { return `<div class="night-bg" style="${night ? '' : 'background:radial-gradient(800px 500px at 50% -100px,#5a3d1d 0%,#14111f 70%)'}"></div>`; }
function roleBadge(r) { const R = ROLES[r]; return `<span class="team-${R.team}">${R.e} ${R.n}</span>`; }
function peekHTML() {
  if (!me.role) return '';
  const R = ROLES[me.role];
  const extra = [];
  if (me.wolves) extra.push(`🐺 Lobos: ${me.wolves.map(chip).join(', ')}`);
  if (me.lover) extra.push(`💘 Enamorado/a de ${chip(me.lover)}`);
  if (me.seen.length) extra.push('🔮 ' + me.seen.map(s => `${chip(s.target)}: ${ROLES[s.role].e} ${ROLES[s.role].n}`).join(' · '));
  return `<button class="peek" id="peek">👁 Mi rol</button>
    <div class="peekcard" id="peekcard"><div style="font-size:46px">${R.e}</div><div style="font-size:22px;font-weight:900">${R.n}</div>
    <div class="team-${R.team}" style="font-weight:900;font-size:12px;letter-spacing:2px;text-transform:uppercase">${TEAMN[R.team]}</div>
    ${extra.map(x => `<div class="mute" style="margin-top:8px;font-weight:700">${x}</div>`).join('')}
    <div class="mute" style="font-size:12px;margin-top:8px">Mantén pulsado para verlo</div></div>`;
}
function bindPeek() {
  const b = $('#peek'), c = $('#peekcard'); if (!b || !c) return;
  const onn = e => { e.preventDefault(); c.classList.add('on'); }, off = () => c.classList.remove('on');
  b.addEventListener('pointerdown', onn); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
}
function ghostHTML() {
  if (me.alive || !me.ghost) return '';
  return `<div class="ghost"><h3>👻 Estás muerto: ves todos los roles (¡no digas nada!)</h3><div class="gl">
    ${players.filter(p => me.ghost.roles[p.id]).map(p => `<span>${ROLES[me.ghost.roles[p.id]].e} ${esc(p.name)}${me.aliveList.includes(p.id) ? '' : ' ✝'}</span>`).join('')}</div></div>`;
}
function timerHTML() { return '<div class="ltimer" id="lt"></div>'; }
function runTimer(ms, onEnd) {
  const end = Date.now() + ms;
  const el = () => $('#lt');
  const upd = () => { const e = el(); if (!e) return; const s = Math.max(0, Math.ceil((end - Date.now()) / 1000)); e.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); if (s <= 0 && onEnd) { onEnd(); onEnd = null; } };
  upd(); every(upd, 250);
}
function pgrid(cands, opts = {}) {
  return `<div class="pgrid">${cands.map(id => `<button class="pbtn" data-id="${esc(id)}"${opts.disabled && opts.disabled.includes(id) ? ' disabled' : ''}>
    <span class="dot" style="background:${pl(id).color}"></span><span class="nm">${nm(id)}${id === myId ? ' (tú)' : ''}</span><span class="marks"></span></button>`).join('')}
    ${opts.skip ? `<button class="pbtn" data-id="skip" style="grid-column:1/-1;justify-content:center;color:var(--mute)">${opts.skip}</button>` : ''}</div>`;
}

/* --- preparación --- */
function renderSetup() {
  const n = players.length, plan = rolePlan(Math.max(4, n));
  show('setup', `${bg(true)}
    <div class="hubtop"><h1>🐺 Hombres <span>Lobo</span></h1><div class="codechip"><b>${esc(P.code)}</b></div></div>
    <div class="card"><h3 style="margin-bottom:6px">Roles en juego (${n} jugadores)</h3>
      <div style="font-weight:700;line-height:1.6">${planText(plan)}</div>
      ${n < 5 ? '<div class="mute" style="margin-top:6px;font-size:14px">Se recomienda jugar con 5 o más.</div>' : ''}</div>
    ${isHost ? `
    <div class="card">
      <label class="lbl" style="margin-top:0">Roles especiales</label>
      <div class="roletog">${SPECIALS.map(r => `<label><input type="checkbox" data-r="${r}"${settings.roles[r] ? ' checked' : ''}>${ROLES[r].e} ${ROLES[r].n}</label>`).join('')}</div>
      <label class="lbl">Número de lobos</label>
      <div class="stepper"><button id="wm">−</button><b id="wv">${settings.wolves || 'Auto'}</b><button id="wp">+</button><span class="mute" style="font-weight:700;font-size:14px">${settings.wolves ? '' : '(' + autoWolves(n) + ' para ' + n + ')'}</span></div>
      <div class="row" style="margin-top:6px">
        <div><label class="lbl">Tiempo de debate</label><select id="disc">${[[90, '1:30'], [180, '3 min'], [300, '5 min'], [0, 'Sin límite']].map(([v, l]) => `<option value="${v}"${settings.disc === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        <div><label class="lbl">Al morir…</label><select id="rev"><option value="1"${settings.reveal ? ' selected' : ''}>Se revela el rol</option><option value="0"${settings.reveal ? '' : ' selected'}>Rol oculto</option></select></div>
      </div>
      <label class="roletog" style="display:block;margin-top:12px"><label><input type="checkbox" id="voice"${settings.voice ? ' checked' : ''}>🔊 Voz del narrador en este móvil</label></label>
    </div>
    <button class="btn go" id="go">🌙 Empezar partida</button>
    ${P.homeButton()}` : `<div class="card" style="text-align:center"><b>Esperando a que el anfitrión empiece…</b></div>`}
    <div class="card"><h3 style="margin-bottom:8px">Cómo se juega</h3><ul class="rules">
      <li>Cada uno recibe un <b>rol secreto</b>. Los lobos se conocen entre ellos.</li>
      <li><b>De noche</b> todos usáis el móvil a la vez y en secreto: los roles hacen su acción y el resto responde una pregunta señuelo, así nadie se delata.</li>
      <li><b>Al amanecer</b> el narrador anuncia los muertos. <b>De día</b> debatís en persona y votáis a quién expulsar.</li>
      <li>Gana el <b>pueblo</b> si elimina a todos los lobos. Ganan los <b>lobos</b> si llegan a ser tantos como el resto.</li>
      <li>Los muertos ven todos los roles… <b>¡pero no pueden hablar!</b> Usa <b>👁 Mi rol</b> para recordar el tuyo.</li>
    </ul></div>`);
  if (isHost) {
    $$('[data-r]').forEach(c => c.addEventListener('change', () => { settings.roles[c.dataset.r] = c.checked; sync(); }));
    on('#wm', 'click', () => { settings.wolves = Math.max(0, (settings.wolves || autoWolves(n)) - 1); if (settings.wolves === 0) settings.wolves = 0; sync(); });
    on('#wp', 'click', () => { settings.wolves = Math.min(5, (settings.wolves || autoWolves(n)) + 1); sync(); });
    on('#disc', 'change', e => { settings.disc = +e.target.value; sync(); });
    on('#rev', 'change', e => { settings.reveal = e.target.value === '1'; sync(); });
    on('#voice', 'change', e => { settings.voice = e.target.checked; if (settings.voice) speak('Voz del narrador activada.'); });
    on('#go', 'click', () => { audio(); hostBegin(); });
    P.bindHome();
  }
}
function sync() { broadcast({ t: 'set', settings }); }

/* --- reparto --- */
function renderRole(m) {
  me.role = m.role; me.wolves = m.wolves; me.plan = m.plan; me.lover = null; me.seen = []; me.ghost = null; me.alive = true; me.aliveList = players.map(p => p.id);
  const R = ROLES[m.role];
  show('reveal', `${bg(true)}
    <div class="phase">Tu rol secreto</div>
    <div class="phase-sub">En juego: ${planText(m.plan)}</div>
    <div class="rolecard" id="rc"><div style="font-size:64px">🂠</div><div class="rn" style="font-size:24px">Toca para ver tu rol</div><div class="rd">Que nadie mire tu pantalla</div></div>
    <button class="btn" id="ready">Estoy listo</button>
    <div class="sub" id="rcount"></div>
    ${isHost ? '<button class="btn sec small" id="force">Empezar la noche ya</button>' : ''}`);
  let open = false;
  const rc = $('#rc');
  rc.addEventListener('click', () => {
    open = !open;
    if (open) {
      rc.className = 'rolecard open';
      rc.style.borderColor = R.team === 'w' ? '#ff5a6e' : '#3ddc84';
      rc.innerHTML = `<div class="re">${R.e}</div><div class="rn">${R.n}</div><div class="rt team-${R.team}">Equipo ${TEAMN[R.team]}</div><div class="rd">${R.d}</div>
        ${m.wolves ? `<div class="note w" style="margin-top:12px">🐺 La manada: ${m.wolves.map(chip).join(', ')}</div>` : ''}
        <div class="mute" style="font-size:12px;margin-top:10px">Toca para ocultar</div>`;
      buzz(30); if (R.team === 'w') SFX.howl();
    } else { rc.className = 'rolecard'; rc.style.borderColor = ''; rc.innerHTML = '<div style="font-size:64px">🂠</div><div class="rn" style="font-size:24px">Toca para ver tu rol</div><div class="rd">Que nadie mire tu pantalla</div>'; }
  });
  on('#ready', 'click', () => { toHost({ t: 'ready' }); $('#ready').disabled = true; $('#ready').textContent = '✔ Listo'; });
  on('#force', 'click', () => { if (L && L.phase === 'reveal') { clearH(); startNight(); } });
}

/* --- noche --- */
function renderNight(m) {
  const t = m.task;
  me.lastNight = m.n;
  let body = '', title = '', sub = '';
  if (t.kind === 'dead') { title = 'La noche transcurre…'; sub = 'Los vivos actúan en secreto.'; }
  else if (t.kind === 'sleep') { title = '😴 La noche continúa…'; sub = 'Sigue con el móvil tapado y espera.'; }
  else if (t.kind === 'wolf') { title = '🐺 Elegid a vuestra víctima'; sub = 'Poneos de acuerdo en silencio: veis lo que marca cada lobo.'; body = pgrid(t.cands); }
  else if (t.kind === 'seer') { title = '🔮 ¿A quién quieres investigar?'; sub = 'Descubrirás su rol.'; body = pgrid(t.cands); }
  else if (t.kind === 'guard') { title = '🛡️ ¿A quién proteges esta noche?'; sub = t.last ? `No puedes repetir con ${nm(t.last)}.` : 'Puedes protegerte a ti mismo.'; body = pgrid(t.cands, { disabled: t.last ? [t.last] : [] }); }
  else if (t.kind === 'cupid') { title = '💘 Elige a dos enamorados'; sub = 'Si uno muere, el otro morirá de pena.'; body = pgrid(t.cands) + '<button class="btn" id="cupok" disabled style="margin-top:12px">Unir a los dos</button>'; }
  else if (t.kind === 'witch') {
    title = '🧪 Tus pociones';
    sub = t.victim ? `Esta noche los lobos han atacado a ${chip(t.victim)}.` : 'Esta noche los lobos no han atacado a nadie.';
    body = `${t.heal ? `<button class="btn" id="heal">💚 Usar poción de vida y salvar a ${nm(t.victim)}</button>` : `<div class="note">💚 ${t.victim ? 'Ya usaste la poción de vida.' : 'No hay nadie a quien salvar.'}</div>`}
      ${t.poison ? `<div class="lbl">☠️ Poción de muerte (opcional)</div>${pgrid(t.cands)}` : '<div class="note">☠️ Ya usaste la poción de muerte.</div>'}
      <button class="btn sec" id="wdone" style="margin-top:12px">Confirmar</button>`;
  }
  else { title = '🌙 Pregunta de la noche'; sub = '¿Quién crees que es un lobo? (Solo para despistar: tu respuesta no hace nada)'; body = pgrid(t.cands); }
  show('night', `${bg(true)}
    <div class="moon">🌙</div><div class="phase">Noche ${m.n}</div>
    ${timerHTML()}
    <div class="phase" style="font-size:22px">${title}</div><div class="phase-sub">${sub}</div>
    <div id="nb">${body}</div><div id="nmsg"></div>
    ${ghostHTML()}${peekHTML()}`);
  bindPeek();
  runTimer(m.ms);
  if (m.step === 'A' && m.n === 1) SFX.night();
  const msg = h => { const e = $('#nmsg'); if (e) e.innerHTML = h; };
  const grid = () => $$('#nb .pbtn');
  if (t.kind === 'wolf') {
    grid().forEach(b => b.addEventListener('click', () => { toHost({ t: 'act', kind: 'wolf', target: b.dataset.id }); buzz(15); }));
    me.wolfMarks = votes => grid().forEach(b => {
      const who = Object.entries(votes).filter(([, tg]) => tg === b.dataset.id).map(([w]) => w);
      b.classList.toggle('wsel', who.length > 0);
      b.querySelector('.marks').innerHTML = who.map(w => `<i>${esc(pl(w).name.slice(0, 6))}</i>`).join('');
    });
  } else if (t.kind === 'seer' || t.kind === 'guard' || t.kind === 'dummy') {
    grid().forEach(b => b.addEventListener('click', () => {
      if (b.disabled) return;
      grid().forEach(x => { x.disabled = true; }); b.classList.add('sel'); b.disabled = false;
      toHost({ t: 'act', kind: t.kind, target: b.dataset.id }); buzz(15);
      if (t.kind === 'guard') msg(`<div class="note ok">🛡️ Proteges a ${chip(b.dataset.id)} esta noche.</div>`);
      if (t.kind === 'dummy') msg('<div class="note">✔ Anotado. Mantén el móvil tapado hasta que amanezca.</div>');
      if (t.kind === 'seer') msg('<div class="note">🔮 Consultando la bola de cristal…</div>');
    }));
  } else if (t.kind === 'cupid') {
    const sel = [];
    grid().forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.id, i = sel.indexOf(id);
      if (i >= 0) sel.splice(i, 1); else { if (sel.length >= 2) sel.shift(); sel.push(id); }
      grid().forEach(x => x.classList.toggle('sel', sel.includes(x.dataset.id)));
      $('#cupok').disabled = sel.length !== 2;
    }));
    on('#cupok', 'click', () => { toHost({ t: 'act', kind: 'cupid', targets: sel.slice() }); grid().forEach(x => x.disabled = true); $('#cupok').disabled = true; msg(`<div class="note l">💘 ${chip(sel[0])} y ${chip(sel[1])} están ahora enamorados.</div>`); buzz(30); });
  } else if (t.kind === 'witch') {
    let heal = false, poison = null;
    on('#heal', 'click', () => { heal = !heal; $('#heal').textContent = heal ? `✔ Salvarás a ${pl(t.victim).name}` : `💚 Usar poción de vida y salvar a ${pl(t.victim).name}`; });
    grid().forEach(b => b.addEventListener('click', () => { poison = poison === b.dataset.id ? null : b.dataset.id; grid().forEach(x => x.classList.toggle('wsel', x.dataset.id === poison)); }));
    on('#wdone', 'click', () => {
      toHost({ t: 'act', kind: 'witch', heal, poison }); buzz(20);
      $('#nb').innerHTML = `<div class="note">${heal ? `💚 Has salvado a ${chip(t.victim)}.` : '💚 No usas la poción de vida.'}<br>${poison ? `☠️ Has envenenado a ${chip(poison)}.` : '☠️ No envenenas a nadie.'}</div>`;
    });
  }
}

/* --- día --- */
function deathList(deaths) {
  return deaths.map((d, i) => `<div class="death" style="animation-delay:${i * 250}ms"><span class="de">${d.why === 'love' ? '💔' : d.why === 'hunter' ? '🏹' : d.why === 'vote' ? '⚖️' : '💀'}</span>
    <div><b>${chip(d.id)}</b>${d.id === myId ? ' <span class="tag">TÚ</span>' : ''}<div class="mute" style="font-weight:700">${d.why === 'love' ? 'ha muerto de pena' : d.why === 'hunter' ? 'ha recibido el disparo' : ''}${d.role ? ` · era ${roleBadge(d.role)}` : ''}</div></div></div>`).join('');
}
function markDeaths(deaths, alive) {
  me.aliveList = alive;
  if (deaths.some(d => d.id === myId)) { me.alive = false; buzz([200, 80, 200]); }
}
function renderDawn(m) {
  markDeaths(m.deaths, m.alive);
  show('dawn', `${bg(false)}
    <div class="moon">☀️</div><div class="phase">Amanece</div>
    <div class="phase-sub">Día ${m.n}</div>
    <div class="deaths">${m.deaths.length ? deathList(m.deaths) : '<div class="note ok" style="text-align:center;font-size:18px">🍀 Esta noche no ha muerto nadie</div>'}</div>
    ${me.lover && m.n === 1 ? `<div class="note l">💘 Cupido te ha flechado: estás enamorado/a de ${chip(me.lover)}. Si muere, mueres tú también.</div>` : ''}
    ${!me.alive && m.deaths.some(d => d.id === myId) ? '<div class="note w">👻 Has muerto. A partir de ahora no puedes hablar, pero puedes mirar.</div>' : ''}
    ${ghostHTML()}${peekHTML()}`);
  bindPeek(); SFX.dawn(); if (m.deaths.length) setTimeout(SFX.death, 900);
}
function renderHunter(m) {
  const mine = m.who === myId;
  show('hunter', `${bg(false)}
    <div class="moon">🏹</div><div class="phase">¡El cazador!</div>
    ${timerHTML()}
    <div class="phase-sub">${mine ? 'Has muerto, pero te queda un disparo. ¿A quién te llevas contigo?' : `${chip(m.who)} era el cazador y está apuntando…`}</div>
    ${mine ? pgrid(m.cands) : ''}${ghostHTML()}${peekHTML()}`);
  bindPeek(); runTimer(m.ms);
  if (mine) $$('.pbtn').forEach(b => b.addEventListener('click', () => { toHost({ t: 'shoot', target: b.dataset.id }); $$('.pbtn').forEach(x => x.disabled = true); b.classList.add('wsel'); buzz(40); }));
}
function renderShot(m) {
  markDeaths(m.deaths, m.alive);
  show('shot', `${bg(false)}
    <div class="moon">💥</div><div class="phase">${m.deaths.length ? '¡Disparo!' : 'El cazador no disparó'}</div>
    <div class="deaths">${deathList(m.deaths)}</div>${ghostHTML()}${peekHTML()}`);
  bindPeek(); if (m.deaths.length) SFX.death();
}
function seerNote() { return me.role === 'vidente' && me.seen.length ? `<div class="note">🔮 Lo que sabes: ${me.seen.map(s => `${chip(s.target)} → ${roleBadge(s.role)}`).join(' · ')}</div>` : ''; }
function renderDay(m) {
  me.aliveList = m.alive;
  show('day', `${bg(false)}
    <div class="moon">☀️</div><div class="phase">Día ${m.n}: ¡debatid!</div>
    ${m.ms ? timerHTML() : '<div class="phase-sub">Sin límite de tiempo</div>'}
    <div class="phase-sub">¿Quién es el lobo? Hablad en persona.${me.alive ? '' : ' (Tú estás muerto: solo puedes escuchar)'}</div>
    <div class="card"><h3 style="margin-bottom:6px">Siguen vivos (${m.alive.length})</h3><ul class="plist">${m.alive.map(id => `<li><span class="dot" style="background:${pl(id).color}"></span><span class="nm">${nm(id)}${id === myId ? '<span class="tag">TÚ</span>' : ''}</span></li>`).join('')}</ul></div>
    ${seerNote()}
    ${isHost ? '<button class="btn" id="tovote">🗳️ Pasar a la votación</button>' : ''}
    ${ghostHTML()}${peekHTML()}`);
  bindPeek();
  if (m.ms) runTimer(m.ms);
  on('#tovote', 'click', () => startVote());
}
function renderVote(m) {
  me.aliveList = m.alive;
  const can = me.alive;
  show('vote', `${bg(false)}
    <div class="moon">🗳️</div><div class="phase">Votación</div>
    ${timerHTML()}
    <div class="phase-sub">${can ? '¿A quién expulsa el pueblo?' : 'Los vivos están votando…'}</div>
    ${can ? pgrid(m.alive.filter(id => id !== myId), { skip: 'No votar a nadie' }) : ''}
    <div class="sub" id="vcount" style="margin-top:10px">0 / ${m.alive.length} votos</div>
    ${seerNote()}${ghostHTML()}${peekHTML()}`);
  bindPeek(); runTimer(m.ms);
  if (can) $$('.pbtn').forEach(b => b.addEventListener('click', () => {
    if (b.disabled) return;
    $$('.pbtn').forEach(x => x.disabled = true); b.disabled = false; b.classList.add('sel');
    toHost({ t: 'vote', target: b.dataset.id }); buzz(20);
  }));
}
function renderVoted(m) {
  markDeaths(m.deaths, m.alive);
  show('voted', `${bg(false)}
    <div class="moon">⚖️</div><div class="phase">${m.target ? 'El pueblo ha decidido' : 'Sin acuerdo'}</div>
    <div class="deaths">${m.target ? deathList(m.deaths) : '<div class="note" style="text-align:center">Empate o nadie votado: hoy no se expulsa a nadie</div>'}</div>
    <div class="card"><h3 style="margin-bottom:4px">Votos</h3><ul class="plist tally">${m.tally.map(t => `<li><span>${t.id === 'skip' ? 'Nadie' : chip(t.id)} · ${t.by.length}</span><small>${t.by.map(nm).join(', ')}</small></li>`).join('')}</ul></div>
    ${ghostHTML()}${peekHTML()}`);
  bindPeek(); if (m.target) SFX.death();
}
function renderEnd(m) {
  me.ghost = null;
  const W = { wolves: ['🐺', '¡Ganan los Hombres Lobo!', 'team-w'], village: ['🏡', '¡Gana el pueblo!', 'team-v'], lovers: ['💘', '¡Ganan los enamorados!', 'team-l'] }[m.winner];
  const iWon = m.winners.includes(myId);
  const order = players.slice().sort((a, b) => (ROLES[m.roles[a.id]] || {}).team === 'w' ? -1 : 1);
  show('lend', `${bg(m.winner === 'wolves')}
    <div class="moon">${W[0]}</div><div class="phase ${W[2]}">${W[1]}</div>
    <div class="phase-sub">${iWon ? `🏆 ¡Has ganado! +${m.winner === 'lovers' ? 7 : 5} puntos` : 'Esta vez no ha podido ser'}</div>
    <div class="card"><h3 style="margin-bottom:6px">Los roles eran…</h3><ul class="plist">${order.filter(p => m.roles[p.id]).map(p => `<li>
      <span style="font-size:20px">${ROLES[m.roles[p.id]].e}</span><span class="nm" style="${m.alive.includes(p.id) ? '' : 'opacity:.55;text-decoration:line-through'}">${esc(p.name)}${p.id === myId ? '<span class="tag">TÚ</span>' : ''}${m.lovers.includes(p.id) ? ' 💘' : ''}</span>
      <span class="team-${ROLES[m.roles[p.id]].team}" style="font-size:13px;font-weight:900">${ROLES[m.roles[p.id]].n}</span></li>`).join('')}</ul>
      ${m.nose ? `<div class="mute" style="font-size:13px;margin-top:8px">👃 Mejor olfato nocturno: <b>${nm(m.nose.id)}</b> señaló a un lobo ${m.nose.ok} ${m.nose.ok === 1 ? 'vez' : 'veces'}</div>` : ''}</div>
    <div class="card"><h3 style="margin-bottom:6px">📜 Lo que pasó</h3><ul class="plist log" style="list-style:none">${m.log.map(l => `<li>${esc(l)}</li>`).join('')}</ul></div>
    ${isHost ? '<button class="btn go" id="again">🔁 Otra partida</button>' : '<div class="sub">Esperando al anfitrión…</div>'}
    ${P.homeButton()}`);
  on('#again', 'click', () => { broadcast({ t: 'setup' }); });
  P.bindHome();
  if (iWon) { SFX.win(); buzz([50, 50, 50, 50, 150]); }
}

function onMsg(m) {
  switch (m.t) {
    case 'set': settings = m.settings; if (screen === 'setup') renderSetup(); break;
    case 'setup': L = null; renderSetup(); break;
    case 'role': renderRole(m); break;
    case 'readyc': { const e = $('#rcount'); if (e) e.textContent = `${m.n} / ${m.of} listos`; break; }
    case 'night': renderNight(m); break;
    case 'wolfv': if (me.wolfMarks && screen === 'night') me.wolfMarks(m.votes); break;
    case 'seen': me.seen.push({ target: m.target, role: m.role }); { const e = $('#nmsg'); if (e) e.innerHTML = `<div class="note ${ROLES[m.role].team === 'w' ? 'w' : 'ok'}" style="font-size:18px;text-align:center">🔮 ${chip(m.target)} es…<br><span style="font-size:26px">${roleBadge(m.role)}</span></div>`; buzz(40); } break;
    case 'lovers': me.lover = m.with; break;
    case 'ghost': me.ghost = { roles: m.roles, lovers: m.lovers }; break;
    case 'dawn': renderDawn(m); break;
    case 'hunter': renderHunter(m); break;
    case 'shot': renderShot(m); break;
    case 'day': renderDay(m); break;
    case 'vote': renderVote(m); break;
    case 'vt': { const e = $('#vcount'); if (e) e.textContent = `${m.n} / ${m.of} votos`; break; }
    case 'voted': renderVoted(m); break;
    case 'end': renderEnd(m); break;
  }
}

if (location.hash === '#debug') window.__L = () => L;
return {
  open() { if (isHost) sync(); renderSetup(); },
  onMsg,
  onHost: (id, m) => hostHandle(id, m),
  onPlayers(list) { players = list; if (screen === 'setup') renderSetup(); },
  onLeave: hostLeave,
  destroy() { clearTimers(); viewToken++; clearH(); L = null; try { speechSynthesis.cancel(); } catch (e) {} },
};
  }
});
