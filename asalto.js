/* Rojos vs Azules: Asalto al Núcleo (con traidor), Guerra de pintura y Atracadores vs Guardias */
Party.register({
  id: 'asalto', name: 'Rojos vs Azules', emoji: '⚔️', players: '2-10', wide: true,
  desc: 'Juegos 3D por equipos: 💎 Asalto al Núcleo (con traidor), 🎨 Guerra de pintura y 💰 Atracadores',
  create(P) {
'use strict';
/* ---------- utilidades ---------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const app = $('#app');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
const r2 = v => Math.round(v * 100) / 100;
const fmtClock = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

const TEAM = [
  { name: 'Rojo', pl: 'Rojos', emoji: '🔴', color: '#ff4d5e', dark: '#6e1522', light: '#ff9aa4' },
  { name: 'Azul', pl: 'Azules', emoji: '🔵', color: '#3d8bff', dark: '#11336e', light: '#9cc3ff' },
];
const HATS = ['#ffcc33', '#3ddc84', '#ffffff', '#b46bff', '#ff9a3c', '#2ee6d6', '#f7a8ff', '#c6f432', '#1d1d1d', '#ff7ad9'];

let isHost = P.isHost, myId = P.myId, myName = P.myName, code = P.code;
let players = P.players(), settings = { dur: 4, win: 3, traitor: 0, mode: 'core' };
let screen = '', timers = [], toastT = null, viewToken = 0, viewCleanup = null, gameHook = null;

function clearTimers() { timers.forEach(t => { clearTimeout(t); clearInterval(t); }); timers = []; }
function later(fn, ms) { const t = setTimeout(fn, ms); timers.push(t); return t; }
function show(name, html) {
  clearTimers();
  if (viewCleanup) { const c = viewCleanup; viewCleanup = null; try { c(); } catch (e) {} }
  gameHook = null; viewToken++; screen = name; app.innerHTML = html; window.scrollTo(0, 0);
}
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); }
function on(sel, ev, fn) { const el = typeof sel === 'string' ? $(sel) : sel; if (el) el.addEventListener(ev, fn); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }


/* sonido sintetizado */
let actx = null;
function audio() { try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) {} return actx; }
function tone(f, d = 0.12, type = 'sine', vol = 0.15, slide = 0) {
  const a = actx; if (!a) return;
  try {
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + 0.02);
  } catch (e) {}
}
const SFX = {
  steal: () => { tone(520, .1, 'square', .08); setTimeout(() => tone(780, .15, 'square', .08), 90); },
  alarm: () => { tone(300, .25, 'sawtooth', .07, -120); setTimeout(() => tone(300, .25, 'sawtooth', .07, -120), 260); },
  score: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, .18, 'triangle', .14), i * 110)),
  lose: () => [400, 330, 260].forEach((f, i) => setTimeout(() => tone(f, .22, 'triangle', .12), i * 140)),
  hit: () => tone(160, .18, 'square', .12, -80),
  dash: () => tone(300, .12, 'sine', .08, 500),
  pu: () => { tone(880, .08, 'sine', .1); setTimeout(() => tone(1320, .12, 'sine', .1), 70); },
  block: () => tone(1200, .1, 'triangle', .1, -400),
  tick: () => tone(660, .07, 'sine', .08),
  go: () => tone(990, .3, 'triangle', .14),
};

/* ---------- mapa ---------- */
const MAP = { W: 64, D: 40, baseX: 27, baseR: 3.4 };
const HALF = [
  [-20, -8.5, 1.6, 7, 2.2], [-20, 8.5, 1.6, 7, 2.2],
  [-13, 0, 5, 1.6, 1.6],
  [-11, -12, 3, 3, 2], [-10, 13, 4, 2.4, 2],
  [-5, -6, 1.6, 5, 2], [-4, 9, 4, 1.6, 1.6],
  [-26, -14, 4, 1.6, 1.6], [-26, 14, 4, 1.6, 1.6],
];
const BOXES = [...HALF, ...HALF.map(b => [-b[0], -b[1], b[2], b[3], b[4]]), [0, 0, 3, 3, 1.2]];
const PUS = [
  { x: -8, z: -15, k: 'speed' }, { x: 8, z: 15, k: 'speed' },
  { x: 0, z: -9, k: 'shield' }, { x: 0, z: 9, k: 'shield' },
  { x: -16, z: 5, k: 'speed' }, { x: 16, z: -5, k: 'speed' },
];
const baseOf = team => ({ x: team === 0 ? -MAP.baseX : MAP.baseX, z: 0 });
function collide(p, r) {
  p.x = clamp(p.x, -MAP.W / 2 + r, MAP.W / 2 - r);
  p.z = clamp(p.z, -MAP.D / 2 + r, MAP.D / 2 - r);
  for (const b of BOXES) {
    const hx = b[2] / 2, hz = b[3] / 2;
    const cx = clamp(p.x, b[0] - hx, b[0] + hx), cz = clamp(p.z, b[1] - hz, b[1] + hz);
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
    else {
      const ex = [b[0] + hx - p.x, p.x - (b[0] - hx), b[1] + hz - p.z, p.z - (b[1] - hz)];
      const m = Math.min(...ex), i = ex.indexOf(m);
      if (i === 0) p.x = b[0] + hx + r; else if (i === 1) p.x = b[0] - hx - r; else if (i === 2) p.z = b[1] + hz + r; else p.z = b[1] - hz - r;
    }
  }
}
const GW = 64, GD = 40;
const cellOf = (x, z) => { const c = Math.floor(x + 32), r = Math.floor(z + 20); return (c < 0 || c >= GW || r < 0 || r >= GD) ? -1 : r * GW + c; };
function insideBox(x, z, m = 0) { for (const b of BOXES) if (Math.abs(x - b[0]) < b[2] / 2 + m && Math.abs(z - b[1]) < b[3] / 2 + m) return true; return false; }
const BLOCKED = new Uint8Array(GW * GD); let PAINTABLE = 0;
for (let r = 0; r < GD; r++) for (let c = 0; c < GW; c++) { if (insideBox(c - 32 + 0.5, r - 20 + 0.5)) BLOCKED[r * GW + c] = 1; else PAINTABLE++; }
const MODES = {
  core: { name: 'Asalto al Núcleo', emoji: '💎', desc: 'Roba el núcleo rival y llévalo a tu base' },
  paint: { name: 'Guerra de pintura', emoji: '🎨', desc: 'Pinta más suelo que el otro equipo' },
  heist: { name: 'Atracadores', emoji: '💰', desc: 'Roba el botín sin que te vean (2 rondas)' },
};
const LOOT = [[6, -3], [6, 3], [12, -8], [12, 8], [17, -16], [17, 16], [23, -4], [23, 4], [14, -4], [9, 0]];
const VIS_R = 10, VIS_A = 0.7, NEAR_R = 2.2, SMOKE_R = 3.2;
function spawnPoint(team, n) {
  const b = baseOf(team), sx = team === 0 ? -30.3 : 30.3;
  const zz = [0, -2, 2, -4, 4, -6, 6][n % 7];
  return { x: sx + (n >= 7 ? (team === 0 ? 1.5 : -1.5) : 0), z: zz, ry: team === 0 ? Math.PI / 2 : -Math.PI / 2, b };
}

/* =====================================================
   INICIO
   ===================================================== */

/* =====================================================
   ANFITRIÓN
   ===================================================== */
const room = P.room;
let M = null; // partida (solo anfitrión)

const send = (id, msg) => P.send(id, msg);
const broadcast = msg => P.broadcast(msg);
const toHost = msg => P.toHost(msg);
function broadcastPlayers() { P.broadcastPlayers(); broadcast({ t: 'set', settings }); }
const teamCount = t => room.players.filter(p => p.team === t).length;


function hostHandle(id, m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'team') { if (!M || M.over) { const p = room.players.find(p => p.id === id); if (p) { p.team = 1 - (p.team || 0); broadcastPlayers(); } } }
  else if (m.t === 'm') { if (M && !M.over && M.ps[id]) { const s = M.ps[id]; if (s.splatUntil || s.jailed || Date.now() < s.ignoreUntil) return; s.x = clamp(+m.x || 0, -32, 32); s.z = clamp(+m.z || 0, -20, 20); s.ry = +m.ry || 0; s.mv = m.mv ? 1 : 0; } }
  else if (m.t === 'dash') {
    if (M && !M.over && !M.paused && M.ps[id] && !M.ps[id].jailed) { const s = M.ps[id], now = Date.now(); if (now - s.lastDash > 1800 && now > s.stunUntil && now >= M.t0) { s.lastDash = now; s.dashUntil = now + 320; s.dashHit = {}; } }
  }
  else if (m.t === 'leak') hostLeak(id);
  else if (m.t === 'shoot') hostShoot(id, m);
  else if (m.t === 'smoke') hostSmoke(id);
  else if (m.t === 'callVote') hostCallVote(id);
  else if (m.t === 'vote') hostVote(id, m.target);
}
function dropPlayer(id) {
  if (M && !M.over && M.ps[id]) {
    M.cores.forEach(c => { if (c.st === 1 && c.by === id) dropCore(c, M.ps[id].x, M.ps[id].z); });
    if (M.loot) M.loot.forEach(l => { if (l.st === 1 && l.by === id) { l.st = 0; l.by = ''; l.x = l.hx; l.z = l.hz; } });
    delete M.ps[id];
    if (M.paused) { M.paused.voters = M.paused.voters.filter(v => v !== id); if (M.paused.voters.every(v => v in M.paused.votes)) resolveVote(); }
  }
}
/* --- partida --- */
function hostStart() {
  if (M && !M.over) return;
  if (room.players.length > 1 && (!teamCount(0) || !teamCount(1))) { toast('Cada equipo necesita al menos un jugador'); return; }
  if (settings.mode === 'heist') return heistBegin();
  const now = Date.now();
  M = { t0: now + 3500, dur: settings.dur * 60000, win: settings.win, sc: [0, 0], ps: {}, over: false, stats: {},
    cores: [0, 1].map(t => ({ team: t, st: 0, x: baseOf(t).x, z: 0, by: '', at: 0 })),
    pus: PUS.map(p => ({ ...p, on: true, at: 0 })) };
  const n = [0, 0], spawns = {};
  room.players.forEach(p => {
    const sp = spawnPoint(p.team, n[p.team]++);
    M.ps[p.id] = { x: sp.x, z: sp.z, ry: sp.ry, mv: 0, team: p.team, stunUntil: 0, shield: false, speedUntil: 0, dashUntil: 0, dashHit: {}, lastDash: 0,
      traitor: false, revealed: false, lastLeak: M.t0 - 15000, splatUntil: 0, invUntil: 0, bomb: false, lastShot: 0, ignoreUntil: 0 };
    M.stats[p.id] = { cap: 0, steal: 0, tack: 0, ret: 0, trip: 0, leak: 0, pnt: 0, spl: 0, dth: 0 };
    spawns[p.id] = [sp.x, sp.z, sp.ry];
  });
  M.traitors = [null, null]; M.votesUsed = [false, false]; M.paused = null;
  M.mode = settings.mode === 'paint' ? 'paint' : 'core';
  if (M.mode === 'paint') {
    M.grid = new Int8Array(GW * GD).fill(-1); M.cnt = [0, 0]; M.diff = []; M.cores = [];
    M.pus.forEach(u => { if (u.k === 'shield') u.k = 'bomb'; });
  }
  if (settings.traitor && M.mode === 'core') [0, 1].forEach(t => {
    const ids = room.players.filter(p => p.team === t).map(p => p.id);
    if (ids.length >= settings.traitor) { const id = pick(ids); M.traitors[t] = id; M.ps[id].traitor = true; }
  });
  broadcast({ t: 'start', spawns, cd: 3500, dur: M.dur, win: M.win, mode: M.mode });
  room.players.forEach(p => send(p.id, { t: 'role', traitor: !!M.ps[p.id].traitor, mine: !!M.traitors[p.team], theirs: !!M.traitors[1 - p.team] }));
  M.tick = setInterval(hostTick, 50);
}
const nameOf = id => (room.players.find(p => p.id === id) || {}).name || '¿?';
function ev(o) { broadcast({ t: 'ev', ...o }); }
function dropCore(c, x, z) { c.st = 2; c.x = x; c.z = z; c.by = ''; c.at = Date.now(); ev({ k: 'drop', team: c.team }); }
function homeCore(c) { const b = baseOf(c.team); c.st = 0; c.x = b.x; c.z = b.z; c.by = ''; }
function hostTick() {
  if (!M || M.over) return;
  const now = Date.now();
  if (M.paused) { if (now > M.paused.until) resolveVote(); else { sendSnap(now); return; } }
  if (!M || M.over) return;
  const t = now - M.t0;
  const ids = Object.keys(M.ps);
  if (M.mode === 'heist' && M.half) return;
  if (t >= 0 && M.mode === 'paint') { if (paintTick(now, t, ids)) return; }
  else if (t >= 0 && M.mode === 'heist') { if (heistTick(now, t, ids)) return; }
  else if (t >= 0) {
    // placajes
    ids.forEach(a => {
      const A = M.ps[a]; if (now > A.dashUntil) return;
      ids.forEach(b => {
        const B = M.ps[b], friendly = B.team === A.team;
        if (b === a || (friendly && !(A.traitor && !A.revealed)) || A.dashHit[b] || now < B.stunUntil) return;
        const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz);
        if (d > 1.5) return;
        A.dashHit[b] = 1;
        if (B.shield) { B.shield = false; ev({ k: 'block', who: b, from: a }); return; }
        B.stunUntil = now + 1700;
        const k = d > 0.01 ? 1 / d : 0;
        if (friendly) { M.stats[a].trip++; ev({ k: 'trip', who: b, dx: r2(dx * k), dz: r2(dz * k) }); }
        else { M.stats[a].tack++; ev({ k: 'hit', who: b, from: a, dx: r2(dx * k), dz: r2(dz * k) }); }
        M.cores.forEach(c => { if (c.st === 1 && c.by === b) dropCore(c, B.x, B.z); });
      });
    });
    // núcleos
    M.cores.forEach(c => {
      if (c.st === 2 && now - c.at > 10000) { homeCore(c); ev({ k: 'return', team: c.team, auto: 1 }); }
      if (c.st === 1) {
        const C = M.ps[c.by];
        if (!C) { homeCore(c); return; }
        c.x = C.x; c.z = C.z;
        const b = baseOf(C.team);
        if (Math.hypot(C.x - b.x, C.z - b.z) < MAP.baseR) {
          M.sc[C.team]++; M.stats[c.by].cap++;
          ev({ k: 'score', team: C.team, who: c.by, sc: M.sc.slice() });
          homeCore(c);
          if (M.sc[C.team] >= M.win) return hostEnd();
        }
        return;
      }
      for (const id of ids) {
        const P = M.ps[id];
        if (now < P.stunUntil || Math.hypot(P.x - c.x, P.z - c.z) > 1.35) continue;
        if (P.team !== c.team) {
          if (M.cores.some(o => o.st === 1 && o.by === id)) continue;
          c.st = 1; c.by = id; M.stats[id].steal++;
          ev({ k: 'steal', team: c.team, who: id }); break;
        } else if (c.st === 2) {
          homeCore(c); M.stats[id].ret++;
          ev({ k: 'return', team: c.team, who: id }); break;
        }
      }
    });
    // objetos
    M.pus.forEach(u => {
      if (!u.on) { if (now > u.at) u.on = true; return; }
      for (const id of ids) {
        const P = M.ps[id];
        if (Math.hypot(P.x - u.x, P.z - u.z) > 1.3) continue;
        u.on = false; u.at = now + 12000;
        if (u.k === 'speed') P.speedUntil = now + 6000; else P.shield = true;
        ev({ k: 'pu', who: id, pu: u.k }); break;
      }
    });
    if (t >= M.dur) return hostEnd();
  }
  sendSnap(now);
}
function sendSnap(now) {
  const ids = Object.keys(M.ps);
  const t = (M.paused ? M.paused.start : now) - M.t0;
  const p = ids.map(id => {
    const P = M.ps[id];
    let f = 0;
    if (now < P.stunUntil) f |= 1; if (P.shield) f |= 2; if (now < P.speedUntil) f |= 4; if (now < P.dashUntil) f |= 8;
    if (M.cores.some(c => c.st === 1 && c.by === id)) f |= 16;
    if (P.revealed) f |= 32;
    if (P.splatUntil) f |= 1 | 64;
    if (now < P.invUntil) f |= 2;
    if (P.bomb) f |= 128;
    if (P.jailed) f |= 1 | 256;
    if (M.loot && M.loot.some(l => l.st === 1 && l.by === id)) f |= 16;
    return [id, r2(P.x), r2(P.z), r2(P.ry), f, P.mv];
  });
  const paintInfo = M.mode === 'paint' ? { pc: [M.cnt[0], M.cnt[1], PAINTABLE], g: M.diff.splice(0) }
    : M.mode === 'heist' ? { hs: { loot: M.loot.map(l => [l.st, r2(l.x), r2(l.z), l.by]), bank: M.bank, smoke: M.smoke.map(k => [r2(k.x), r2(k.z), Math.max(0, k.until - now)]) } } : {};
  broadcast({ t: 's', ...paintInfo, T: Math.max(0, M.dur - Math.max(0, t)), sc: M.sc, p, pz: M.paused ? { team: M.paused.team, left: Math.max(0, M.paused.until - now) } : 0,
    c: M.cores.map(c => [c.st, r2(c.x), r2(c.z), c.by]), u: M.pus.map(u => u.on ? 1 : 0) });
}
function paintCircle(x, z, r, team, by) {
  const c0 = Math.max(0, Math.floor(x + 32 - r)), c1 = Math.min(GW - 1, Math.floor(x + 32 + r));
  const r0 = Math.max(0, Math.floor(z + 20 - r)), r1 = Math.min(GD - 1, Math.floor(z + 20 + r));
  for (let gr = r0; gr <= r1; gr++) for (let gc = c0; gc <= c1; gc++) {
    const i = gr * GW + gc; if (BLOCKED[i] || M.grid[i] === team) continue;
    const cx = gc - 32 + 0.5, cz = gr - 20 + 0.5; if ((cx - x) ** 2 + (cz - z) ** 2 > r * r) continue;
    if (M.grid[i] >= 0) M.cnt[M.grid[i]]--;
    M.grid[i] = team; M.cnt[team]++; M.diff.push(i, team);
    if (by && M.stats[by]) M.stats[by].pnt++;
  }
}
function splat(id, by, now) {
  const Q = M.ps[id]; if (!Q || Q.splatUntil || now < Q.invUntil) return;
  Q.splatUntil = now + 1600; Q.bomb = false;
  if (M.stats[by]) M.stats[by].spl++; if (M.stats[id]) M.stats[id].dth++;
  paintCircle(Q.x, Q.z, 2.2, M.ps[by] ? M.ps[by].team : 1 - Q.team, by);
  ev({ k: 'splat', who: id, by });
}
function paintTick(now, t, ids) {
  ids.forEach(id => {
    const P = M.ps[id];
    if (P.splatUntil) {
      if (now >= P.splatUntil) {
        const sp = spawnPoint(P.team, Math.floor(Math.random() * 7));
        P.x = sp.x; P.z = sp.z; P.splatUntil = 0; P.invUntil = now + 1800; P.ignoreUntil = now + 450;
        ev({ k: 'respawn', who: id, x: sp.x, z: sp.z, ry: sp.ry });
      }
      return;
    }
    paintCircle(P.x, P.z, 0.95, P.team, id);
  });
  M.pus.forEach(u => {
    if (!u.on) { if (now > u.at) u.on = true; return; }
    for (const id of ids) {
      const P = M.ps[id];
      if (P.splatUntil || Math.hypot(P.x - u.x, P.z - u.z) > 1.3) continue;
      u.on = false; u.at = now + 12000;
      if (u.k === 'speed') P.speedUntil = now + 6000; else P.bomb = true;
      ev({ k: 'pu', who: id, pu: u.k }); break;
    }
  });
  if (t >= M.dur) { hostEnd(); return true; }
  return false;
}
function hostShoot(id, m) {
  if (!M || M.over || M.mode !== 'paint') return;
  const P = M.ps[id], now = Date.now();
  if (!P || P.splatUntil || now < M.t0 || now - P.lastShot < 200) return;
  P.lastShot = now;
  const big = P.bomb; P.bomb = false;
  const ry = +m.ry || 0, dx = Math.sin(ry), dz = Math.cos(ry), range = big ? 11 : 9;
  let x = P.x, z = P.z, s = 0, hit = null;
  while (s < range) {
    s += 0.3;
    const nx = P.x + dx * s, nz = P.z + dz * s;
    if (Math.abs(nx) > 31.8 || Math.abs(nz) > 19.8 || insideBox(nx, nz, 0.05)) break;
    x = nx; z = nz;
    paintCircle(x, z, big ? 0.9 : 0.6, P.team, id);
    for (const q of Object.keys(M.ps)) {
      const Q = M.ps[q];
      if (Q.team === P.team || Q.splatUntil || now < Q.invUntil) continue;
      if (Math.hypot(Q.x - x, Q.z - z) < 0.95) { hit = q; break; }
    }
    if (hit) break;
  }
  const R = big ? 3.8 : 1.8;
  paintCircle(x, z, R, P.team, id);
  ev({ k: 'shot', who: id, team: P.team, x0: r2(P.x), z0: r2(P.z), x1: r2(x), z1: r2(z), big: big ? 1 : 0 });
  if (hit) splat(hit, id, now);
  if (big) Object.keys(M.ps).forEach(q => { const Q = M.ps[q]; if (Q.team !== P.team && Math.hypot(Q.x - x, Q.z - z) < 2.6) splat(q, id, now); });
}
/* --- atracadores --- */
function heistBegin() {
  M = { mode: 'heist', bank: [0, 0], stats: {}, over: false, round: 0, sc: [0, 0], traitors: [null, null], votesUsed: [true, true], paused: null, cores: [], pus: [], ps: {} };
  room.players.forEach(p => { M.stats[p.id] = { loot: 0, pick: 0, arrest: 0, rescue: 0, jailed: 0 }; });
  heistRound(1);
}
function heistRound(n) {
  const now = Date.now();
  M.round = n; M.half = false; M.rob = n === 1 ? 0 : 1;
  M.t0 = now + 3500; M.dur = settings.dur * 60000; M.ps = {}; M.smoke = [];
  const sg = M.rob === 0 ? 1 : -1;
  M.loot = LOOT.map(([x, z]) => ({ x: x * sg, z: z * sg, hx: x * sg, hz: z * sg, st: 0, by: '' }));
  const cnt = [0, 0], spawns = {};
  room.players.forEach(p => {
    if (!M.stats[p.id]) M.stats[p.id] = { loot: 0, pick: 0, arrest: 0, rescue: 0, jailed: 0 };
    const sp = spawnPoint(p.team, cnt[p.team]++);
    M.ps[p.id] = { x: sp.x, z: sp.z, ry: sp.ry, mv: 0, team: p.team, stunUntil: 0, shield: false, speedUntil: 0, dashUntil: 0, dashHit: {}, lastDash: 0,
      jailed: false, invUntil: 0, lastSmoke: 0, splatUntil: 0, ignoreUntil: 0 };
    spawns[p.id] = [sp.x, sp.z, sp.ry];
  });
  clearInterval(M.tick);
  broadcast({ t: 'start', mode: 'heist', round: n, rob: M.rob, spawns, cd: 3500, dur: M.dur, bank: M.bank });
  M.tick = setInterval(hostTick, 50);
}
function jailSpot(team, k) { const b = baseOf(team), a = k * 2.1; return { x: b.x + Math.cos(a) * 1.7, z: b.z + Math.sin(a) * 1.7 }; }
function heistTick(now, t, ids) {
  const rob = M.rob, guard = 1 - rob, gb = baseOf(guard), rb = baseOf(rob);
  // arrestos
  ids.forEach(gid => {
    const G = M.ps[gid]; if (G.team !== guard) return;
    ids.forEach(rid => {
      const R = M.ps[rid]; if (R.team !== rob || R.jailed || now < R.invUntil) return;
      if (Math.hypot(G.x - R.x, G.z - R.z) < (now < G.dashUntil ? 1.5 : 1.1)) {
        R.jailed = true;
        M.loot.forEach(l => { if (l.st === 1 && l.by === rid) { l.st = 0; l.by = ''; l.x = l.hx; l.z = l.hz; } });
        const k = ids.filter(i => M.ps[i].jailed).length;
        const js = jailSpot(guard, k); R.x = js.x; R.z = js.z; R.ignoreUntil = now + 450;
        M.stats[gid].arrest++; M.stats[rid].jailed++;
        ev({ k: 'arrest', who: rid, by: gid, x: r2(js.x), z: r2(js.z) });
      }
    });
  });
  // botín y rescates
  ids.forEach(rid => {
    const R = M.ps[rid]; if (R.team !== rob || R.jailed) return;
    const car = M.loot.find(l => l.st === 1 && l.by === rid);
    if (car) {
      car.x = R.x; car.z = R.z;
      if (Math.hypot(R.x - rb.x, R.z - rb.z) < MAP.baseR) { car.st = 2; car.by = ''; M.bank[rob]++; M.stats[rid].loot++; ev({ k: 'bank', who: rid, team: rob, bank: M.bank.slice() }); }
    } else {
      const l = M.loot.find(l => l.st === 0 && Math.hypot(l.x - R.x, l.z - R.z) < 1.25);
      if (l) { l.st = 1; l.by = rid; M.stats[rid].pick++; ev({ k: 'grab', who: rid }); }
    }
    const jailedIds = ids.filter(i => M.ps[i].jailed);
    if (jailedIds.length && now >= R.invUntil && Math.hypot(R.x - gb.x, R.z - gb.z) < MAP.baseR + 0.4) {
      jailedIds.forEach(i => { M.ps[i].jailed = false; M.ps[i].invUntil = now + 2500; });
      M.stats[rid].rescue += jailedIds.length;
      ev({ k: 'rescue', who: rid, n: jailedIds.length, ids: jailedIds });
    }
  });
  M.smoke = M.smoke.filter(k => k.until > now);
  const robbers = ids.filter(i => M.ps[i].team === rob);
  if (M.loot.every(l => l.st === 2)) { heistEndRound('loot'); return true; }
  if (robbers.length && robbers.every(i => M.ps[i].jailed)) { heistEndRound('jail'); return true; }
  if (t >= M.dur) { heistEndRound('time'); return true; }
  return false;
}
function hostSmoke(id) {
  if (!M || M.over || M.mode !== 'heist' || M.half) return;
  const P = M.ps[id], now = Date.now();
  if (!P || P.team !== M.rob || P.jailed || now < M.t0 || now - P.lastSmoke < 17000) return;
  P.lastSmoke = now;
  M.smoke.push({ x: P.x, z: P.z, until: now + 6000 });
  ev({ k: 'smoke', who: id, x: r2(P.x), z: r2(P.z), ms: 6000 });
}
function heistEndRound(reason) {
  clearInterval(M.tick);
  if (M.round === 1) {
    M.half = true;
    broadcast({ t: 'half', bank: M.bank, reason, rob: M.rob, ms: 7000 });
    setTimeout(() => { if (M && !M.over && M.mode === 'heist') heistRound(2); }, 7000);
  } else { M.endReason = reason; hostEnd(); }
}
function hostLeak(id) {
  if (!M || M.over || M.paused) return;
  const P = M.ps[id], now = Date.now();
  if (!P || !P.traitor || P.revealed || now < M.t0 || now - P.lastLeak < 35000) return;
  P.lastLeak = now; M.stats[id].leak++;
  ev({ k: 'leak', team: P.team, ms: 9000 });
}
function hostCallVote(id) {
  if (!M || M.over || M.paused || Date.now() < M.t0) return;
  const P = M.ps[id]; if (!P) return;
  const team = P.team;
  if (M.votesUsed[team] || !M.traitors[team]) return;
  M.votesUsed[team] = true;
  const voters = Object.keys(M.ps).filter(i => M.ps[i].team === team);
  const now = Date.now();
  M.paused = { team, start: now, until: now + 45000, votes: {}, voters };
  broadcast({ t: 'vote', team, caller: id, cands: voters, ms: 45000 });
}
function hostVote(id, target) {
  const V = M && M.paused; if (!V || !V.voters.includes(id) || (id in V.votes)) return;
  if (target !== 'skip' && !V.voters.includes(target)) return;
  V.votes[id] = target;
  broadcast({ t: 'voteTally', n: Object.keys(V.votes).length, of: V.voters.length });
  if (V.voters.every(v => v in V.votes)) resolveVote();
}
function resolveVote() {
  const V = M && M.paused; if (!V) return;
  const now = Date.now(), dt = now - V.start;
  M.paused = null;
  // el tiempo de pausa no cuenta
  M.t0 += dt;
  Object.values(M.ps).forEach(P => { ['stunUntil', 'speedUntil', 'dashUntil'].forEach(k => { if (P[k] > V.start) P[k] += dt; }); });
  M.cores.forEach(c => { if (c.st === 2) c.at += dt; });
  M.pus.forEach(u => { if (!u.on) u.at += dt; });
  const cnt = {};
  Object.values(V.votes).forEach(v => { if (v !== 'skip') cnt[v] = (cnt[v] || 0) + 1; });
  const max = Math.max(0, ...Object.values(cnt)), tops = Object.keys(cnt).filter(k => cnt[k] === max);
  const need = Math.ceil(V.voters.length / 2);
  const target = (max >= need && tops.length === 1) ? tops[0] : '';
  const tally = V.voters.map(v => ({ id: v, n: cnt[v] || 0 })).sort((a, b) => b.n - a.n);
  let traitor = false;
  if (target) {
    const P = M.ps[target];
    traitor = !!(P && P.traitor);
    if (traitor) {
      P.revealed = true; P.stunUntil = now + 15000;
      M.cores.forEach(c => { if (c.st === 1 && c.by === target) dropCore(c, P.x, P.z); });
      M.sc[V.team]++;
    } else M.sc[1 - V.team]++;
  }
  ev({ k: 'voteEnd', team: V.team, target, traitor, tally, sc: M.sc.slice() });
  if (M.sc[0] >= M.win || M.sc[1] >= M.win) return hostEnd();
}
function hostEnd() {
  if (!M || M.over) return;
  M.over = true; clearInterval(M.tick); M.paused = null;
  const scr = M.mode === 'paint' ? M.cnt : M.mode === 'heist' ? M.bank : M.sc;
  const winner = scr[0] > scr[1] ? 0 : scr[1] > scr[0] ? 1 : -1;
  const isTr = id => !!(M.ps[id] && M.ps[id].traitor) || M.traitors.includes(id);
  room.players.forEach(p => { if (winner !== -1 && (isTr(p.id) ? p.team !== winner : p.team === winner)) p.score += 5; });
  const stats = room.players.filter(p => M.stats[p.id]).map(p => ({ id: p.id, name: p.name, team: p.team, hat: p.color, traitor: isTr(p.id), revealed: !!(M.ps[p.id] && M.ps[p.id].revealed), ...M.stats[p.id] }));
  const traitors = [0, 1].map(t => { const id = M.traitors[t]; if (!id) return null; const s = M.stats[id] || {}; return { id, name: nameOf(id), team: t, revealed: !!(M.ps[id] && M.ps[id].revealed), trip: s.trip || 0, leak: s.leak || 0 }; });
  broadcastPlayers();
  const pct = M.mode === 'paint' ? M.cnt.map(c => Math.round(c / PAINTABLE * 100)) : null;
  broadcast({ t: 'end', sc: M.sc, winner, stats, traitors, mode: M.mode, pct, bank: M.bank || null, reason: M.endReason || '' });
}
function backToLobby() { if (M && !M.over) return; broadcast({ t: 'lobby' }); }
function shuffleTeams() {
  if (M && !M.over) return;
  const s = shuffle(room.players); s.forEach((p, i) => p.team = i % 2);
  broadcastPlayers();
}

/* =====================================================
   INVITADO
   ===================================================== */

/* =====================================================
   VISTAS
   ===================================================== */
function onMsg(m) {
  switch (m.t) {
    case 'set': settings = m.settings || settings; if (screen === 'lobby') renderLobby(); break;
    case 'lobby': renderLobby(); break;
    case 'start': playMatch(m); break;
    case 's': case 'ev': case 'role': case 'vote': case 'voteTally': if (gameHook) gameHook(m); break;
    case 'end': renderEnd(m); break;
    case 'half': renderHalf(m); break;
  }
}

function renderLobby() {
  const me = players.find(p => p.id === myId);
  const paintMode = settings.mode === 'paint' || settings.mode === 'heist', heistMode = settings.mode === 'heist';
  const col = t => `<div class="team t${t}"><h3><span>${TEAM[t].emoji} ${TEAM[t].name}</span><span class="mute" style="font-size:13px">${players.filter(p => p.team === t).length}</span></h3><ul>
    ${players.filter(p => p.team === t).map(p => `<li><span class="hat" style="background:${p.color}"></span><span class="nm">${esc(p.name)}${p.id === myId ? '<span class="tag">TÚ</span>' : ''}${p.id === 'host' ? '<span class="tag">👑</span>' : ''}</span><span class="wins">${p.score}</span></li>`).join('')}
  </ul></div>`;
  show('lobby', `
    <div class="hubtop"><h1>⚔️ Rojos <span style="color:var(--red)">vs</span> <span style="color:var(--blue)">Azules</span></h1><div class="codechip"><b>${esc(code)}</b></div></div>
    <div class="teams">${col(0)}${col(1)}</div>
    <button class="btn sec" id="swap" style="margin-top:12px">↔️ Cambiarme al equipo ${me ? TEAM[1 - me.team].name : ''}</button>
    <div class="modes">${Object.entries(MODES).map(([k, md]) => `<button class="mode${settings.mode === k ? ' sel' : ''}" data-m="${k}"${isHost ? '' : ' disabled'}><span class="e">${md.emoji}</span><b>${md.name}</b><small>${md.desc}</small></button>`).join('')}</div>
    ${isHost ? `
      <div class="card">
        <div class="row">
          <div><label class="lbl" style="margin-top:0">${heistMode ? 'Duración de cada ronda' : 'Duración'}</label><select id="dur">${[2, 3, 4, 5, 7].map(v => `<option value="${v}"${settings.dur === v ? ' selected' : ''}>${v} min</option>`).join('')}</select></div>
          ${paintMode ? '' : `<div><label class="lbl" style="margin-top:0">Puntos para ganar</label><select id="win">${[2, 3, 5].map(v => `<option value="${v}"${settings.win === v ? ' selected' : ''}>${v}</option>`).join('')}</select></div>`}
        </div>
        ${paintMode ? '' : `<label class="lbl">🗡️ Traidor secreto</label>
        <select id="trait">${[[0, 'No'], [3, 'Sí, en equipos de 3 o más'], [2, 'Sí, en equipos de 2 o más']].map(([v, l]) => `<option value="${v}"${settings.traitor === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`}
        <button class="btn sec small" id="mix" style="margin-top:12px">🔀 Mezclar equipos</button>
      </div>
      <button class="btn go" id="start">¡Empezar partida!</button>
      ${P.homeButton()}
    ` : `<div class="card" style="text-align:center"><b>Esperando a que el anfitrión empiece…</b><div class="mute" style="font-size:14px;margin-top:4px">${MODES[settings.mode].emoji} ${MODES[settings.mode].name} · ${settings.dur} min${paintMode ? '' : ` · gana quien llegue a ${settings.win}${settings.traitor ? ' · 🗡️ con traidor' : ''}`}</div></div>`}
    ${heistMode ? `<div class="card"><h3 style="margin-bottom:8px">Cómo se juega</h3><ul class="rules">
      <li>Hay <b>2 rondas</b>: en la primera atracan los <b style="color:var(--red)">Rojos</b> y vigilan los <b style="color:var(--blue)">Azules</b>; en la segunda, al revés.</li>
      <li><b>💰 Atracadores:</b> coged las bolsas del lado de los guardias y llevadlas a <b>vuestro escondite</b>. Tenéis <b>🌫️ humo</b> para tapar la visión.</li>
      <li><b>🚓 Guardias:</b> vuestra linterna solo ve lo que hay <b>en el cono</b> (los muros y el humo tapan). <b>Toca</b> a un ladrón para detenerlo.</li>
      <li>Los detenidos van a la <b>comisaría</b>. Si un ladrón libre entra en ella, <b>libera a todos</b>.</li>
      <li>Gana el equipo que robe <b>más botín</b> en su ronda.</li>
    </ul></div>` : paintMode ? `<div class="card"><h3 style="margin-bottom:8px">Cómo se juega</h3><ul class="rules">
      <li>Al caminar <b>pintas el suelo</b> de tu color. Gana el equipo con <b>más % del mapa</b> al acabar el tiempo.</li>
      <li>Botón <b>🎨 Pintar</b>: disparas pintura hacia delante. Si das a un rival, <b>lo pintas</b> y vuelve a su base.</li>
      <li>Disparar gasta <b>pintura</b>: se recarga sola, y mucho más rápido si estás sobre tu color.</li>
      <li>Sobre tu color <b>corres más</b>; sobre el color rival vas <b>más lento</b>.</li>
      <li>Objetos: <b>⚡ velocidad</b> y <b>💣 bomba</b>: tu siguiente disparo hace una mancha enorme.</li>
    </ul></div>` : `<div class="card"><h3 style="margin-bottom:8px">Cómo se juega</h3><ul class="rules">
      <li>Mueve a tu muñeco con el <b>joystick</b> (arrastra el dedo en la parte izquierda).</li>
      <li>Toca el <b>núcleo enemigo</b> en su base para cogerlo y llévalo a <b>tu base</b> para puntuar.</li>
      <li>Con el botón <b>💨 Placaje</b> haces un acelerón: si chocas con un rival lo aturdes y suelta el núcleo.</li>
      <li>Si vuestro núcleo queda en el suelo, <b>tócalo para devolverlo</b> a casa (o vuelve solo en 10 s).</li>
      <li>Objetos: <b>⚡ velocidad</b> durante 6 s y <b>🛡️ escudo</b>, que para un placaje.</li>
      <li>En el minimapa solo ves a los rivales que están <b>cerca de tu equipo</b>.</li>
    </ul></div>`}
    ${settings.traitor && !paintMode ? `<div class="card"><h3 style="margin-bottom:8px">🗡️ Modo traidor</h3><ul class="rules">
      <li>Cada equipo de ${settings.traitor} o más tiene un <b>traidor secreto</b> que gana si gana el <b>otro</b> equipo.</li>
      <li>El traidor puede <b>placar a sus compañeros</b> (solo se verá "X ha tropezado") y hacer un <b>📡 chivatazo</b>: el rival ve a todo tu equipo en el minimapa unos segundos.</li>
      <li>Cada equipo puede pedir un <b>🗳️ tiempo muerto</b>: se pausa la partida, habláis y votáis. Si pilláis al traidor: <b>+1 punto</b> y pierde sus poderes. Si expulsáis a un inocente: <b>+1 para el rival</b>.</li>
    </ul></div>` : ''}`);
  on('#swap', 'click', () => toHost({ t: 'team' }));
  if (isHost) {
    on('#dur', 'change', e => { settings.dur = +e.target.value; broadcastPlayers(); });
    on('#win', 'change', e => { settings.win = +e.target.value; broadcastPlayers(); });
    on('#trait', 'change', e => { settings.traitor = +e.target.value; broadcastPlayers(); });
    on('#mix', 'click', shuffleTeams);
    $$('.mode').forEach(b => b.addEventListener('click', () => { settings.mode = b.dataset.m; if (settings.mode !== 'core' && settings.dur > 4) settings.dur = 3; broadcastPlayers(); }));
    on('#start', 'click', () => { if (!window.THREE) { toast('Cargando el 3D… pulsa otra vez en un momento'); P.need3D(); return; } hostStart(); });
    P.bindHome();
  }
}

function renderEnd(m) {
  if (m.mode === 'paint') return renderPaintEnd(m);
  if (m.mode === 'heist') return renderHeistEnd(m);
  const me = players.find(p => p.id === myId) || {};
  const meS = m.stats.find(s => s.id === myId) || {};
  const tie = m.winner === -1, won = !tie && (meS.traitor ? me.team !== m.winner : me.team === m.winner);
  const trs = (m.traitors || []).filter(Boolean);
  const best = m.stats.slice().sort((a, b) => (b.cap * 5 + b.steal * 2 + b.tack + b.ret) - (a.cap * 5 + a.steal * 2 + a.tack + a.ret))[0];
  const rows = m.stats.slice().sort((a, b) => a.team - b.team || b.cap - a.cap || b.tack - a.tack);
  show('end', `
    <div class="mid" style="flex:none;margin-top:18px">
      <div style="font-size:64px">${tie ? '🤝' : won ? '🏆' : '💀'}</div>
      <div class="title">${tie ? '¡Empate!' : `¡Gana el equipo ${TEAM[m.winner].name}!`}</div>
      <div class="sub">${tie ? 'Nadie se lleva la victoria' : meS.traitor ? (won ? '🗡️ ¡Tu traición ha funcionado!' : '🗡️ Tu traición no ha bastado…') : won ? '¡Habéis ganado!' : 'Otra vez será…'}</div>
      <div class="score-big"><span class="r">${m.sc[0]}</span><span class="s">–</span><span class="b">${m.sc[1]}</span></div>
    </div>
    <div class="card"><table class="stats">
      <tr><th>Jugador</th><th title="Puntos">💎</th><th title="Robos">🖐️</th><th title="Placajes">💥</th><th title="Devoluciones">↩️</th></tr>
      ${rows.map(s => `<tr><td><span class="nm"><span class="hat" style="background:${TEAM[s.team].color}"></span>${esc(s.name)}${s.traitor ? ' 🗡️' : ''}${best && best.id === s.id && (s.cap + s.steal + s.tack) > 0 ? '<span class="mvp">MVP</span>' : ''}</span></td>
        <td>${s.cap}</td><td>${s.steal}</td><td>${s.tack}</td><td>${s.ret}</td></tr>`).join('')}
    </table>
    <div class="mute" style="font-size:12px;margin-top:8px">💎 puntos · 🖐️ robos · 💥 placajes · ↩️ devoluciones</div></div>
    ${trs.length ? `<div class="card"><h3 style="margin-bottom:8px">🗡️ Los traidores eran…</h3>${trs.map(t => `
      <div style="display:flex;gap:10px;align-items:center;padding:8px 0;border-top:1px solid var(--line)">
        <span class="hat" style="background:${TEAM[t.team].color}"></span>
        <div style="flex:1"><b>${esc(t.name)}</b> <span class="mute">(${TEAM[t.team].name}, trabajaba para ${TEAM[1 - t.team].name})</span>
        <div class="mute" style="font-size:13px">💥 ${t.trip} zancadilla${t.trip === 1 ? '' : 's'} · 📡 ${t.leak} chivatazo${t.leak === 1 ? '' : 's'}</div></div>
        <b style="color:${t.revealed ? 'var(--ok)' : '#ff8a8a'};font-size:13px">${t.revealed ? '¡Pillado!' : 'Se libró'}</b></div>`).join('')}</div>` : ''}
    ${isHost ? `<button class="btn go" id="again">🔁 Revancha</button><button class="btn sec" id="lobby">⚔️ Cambiar equipos o modo</button>${P.homeButton()}` : '<div class="sub">Esperando al anfitrión…</div>'}`);
  on('#again', 'click', hostStart);
  on('#lobby', 'click', backToLobby); P.bindHome();
  buzz(won ? [40, 40, 40, 40, 120] : [200]);
  if (won) SFX.score(); else if (!tie) SFX.lose();
}

function renderHalf(m) {
  const next = 1 - m.rob, me = players.find(p => p.id === myId) || {};
  const why = m.reason === 'loot' ? '¡Se han llevado todo el botín!' : m.reason === 'jail' ? '¡Todos los ladrones entre rejas!' : '¡Se acabó el tiempo!';
  show('half', `<div class="mid">
    <div style="font-size:60px">${m.reason === 'jail' ? '🚓' : '💰'}</div>
    <div class="title">Fin de la ronda 1</div>
    <div class="sub">${why}</div>
    <div class="score-big"><span class="r">${m.bank[0]}</span><span class="s">💰</span><span class="b">${m.bank[1]}</span></div>
    <div class="card" style="margin-top:14px"><b style="font-size:20px">Ahora atracan los <span style="color:${TEAM[next].color}">${TEAM[next].pl}</span></b>
      <div class="mute" style="margin-top:6px">${me.team === next ? '💰 Os toca robar. ¡Tenéis que superar ' + m.bank[m.rob] + ' bolsas!' : '🚓 Os toca vigilar. ¡Que no os roben más de ' + (m.bank[m.rob]) + '!'}</div></div>
    <div class="sub" id="hcd" style="margin-top:10px"></div></div>`);
  const end = Date.now() + m.ms;
  const tk = setInterval(() => { const el = $('#hcd'); if (!el) return clearInterval(tk); el.textContent = 'Empieza en ' + Math.max(0, Math.ceil((end - Date.now()) / 1000)) + '…'; }, 250);
  timers.push(tk);
  SFX.tick();
}
function renderHeistEnd(m) {
  const me = players.find(p => p.id === myId) || {};
  const tie = m.winner === -1, won = !tie && me.team === m.winner;
  const rows = m.stats.slice().sort((a, b) => a.team - b.team || b.loot - a.loot || b.arrest - a.arrest);
  const best = m.stats.slice().sort((a, b) => (b.loot * 3 + b.arrest * 2 + b.rescue) - (a.loot * 3 + a.arrest * 2 + a.rescue))[0];
  show('end', `
    <div class="mid" style="flex:none;margin-top:18px">
      <div style="font-size:64px">${tie ? '🤝' : won ? '🏆' : '💀'}</div>
      <div class="title">${tie ? '¡Empate!' : `¡Gana el equipo ${TEAM[m.winner].name}!`}</div>
      <div class="sub">${tie ? 'Los dos equipos robaron lo mismo' : won ? '¡Habéis sido los mejores ladrones!' : 'Otra vez será…'}</div>
      <div class="score-big"><span class="r">${m.bank[0]}</span><span class="s">💰</span><span class="b">${m.bank[1]}</span></div>
    </div>
    <div class="card"><table class="stats">
      <tr><th>Jugador</th><th title="Botín entregado">💰</th><th title="Detenciones">🚓</th><th title="Rescates">🔓</th><th title="Veces detenido">🔒</th></tr>
      ${rows.map(s => `<tr><td><span class="nm"><span class="hat" style="background:${TEAM[s.team].color}"></span>${esc(s.name)}${best && best.id === s.id && (s.loot + s.arrest + s.rescue) > 0 ? '<span class="mvp">MVP</span>' : ''}</span></td>
        <td>${s.loot}</td><td>${s.arrest}</td><td>${s.rescue}</td><td>${s.jailed}</td></tr>`).join('')}
    </table>
    <div class="mute" style="font-size:12px;margin-top:8px">💰 botín entregado · 🚓 detenciones · 🔓 compañeros rescatados · 🔒 veces detenido</div></div>
    ${isHost ? `<button class="btn go" id="again">🔁 Revancha</button><button class="btn sec" id="lobby">⚔️ Cambiar equipos o modo</button>${P.homeButton()}` : '<div class="sub">Esperando al anfitrión…</div>'}`);
  on('#again', 'click', hostStart);
  on('#lobby', 'click', backToLobby); P.bindHome();
  buzz(won ? [40, 40, 40, 40, 120] : [200]);
  if (won) SFX.score(); else if (!tie) SFX.lose();
}
function renderPaintEnd(m) {
  const me = players.find(p => p.id === myId) || {};
  const tie = m.winner === -1, won = !tie && me.team === m.winner;
  const rows = m.stats.slice().sort((a, b) => a.team - b.team || b.pnt - a.pnt);
  const best = m.stats.slice().sort((a, b) => (b.pnt + b.spl * 25) - (a.pnt + a.spl * 25))[0];
  const p0 = m.pct[0], p1 = m.pct[1];
  show('end', `
    <div class="mid" style="flex:none;margin-top:18px">
      <div style="font-size:64px">${tie ? '🤝' : won ? '🏆' : '💀'}</div>
      <div class="title">${tie ? '¡Empate!' : `¡Gana el equipo ${TEAM[m.winner].name}!`}</div>
      <div class="sub">${tie ? 'Mapa repartido a partes iguales' : won ? '¡Habéis pintado más!' : 'Otra vez será…'}</div>
      <div class="score-big"><span class="r">${p0}%</span><span class="s">–</span><span class="b">${p1}%</span></div>
      <div class="pbar big"><i class="r" style="width:${p0}%"></i><i class="b" style="width:${p1}%"></i></div>
    </div>
    <div class="card"><table class="stats">
      <tr><th>Jugador</th><th title="Casillas pintadas">🎨</th><th title="Rivales pintados">🎯</th><th title="Veces pintado">💦</th></tr>
      ${rows.map(s => `<tr><td><span class="nm"><span class="hat" style="background:${TEAM[s.team].color}"></span>${esc(s.name)}${best && best.id === s.id ? '<span class="mvp">MVP</span>' : ''}</span></td>
        <td>${s.pnt}</td><td>${s.spl}</td><td>${s.dth}</td></tr>`).join('')}
    </table>
    <div class="mute" style="font-size:12px;margin-top:8px">🎨 casillas pintadas · 🎯 rivales pintados · 💦 veces que te pintaron</div></div>
    ${isHost ? `<button class="btn go" id="again">🔁 Revancha</button><button class="btn sec" id="lobby">⚔️ Cambiar equipos o modo</button>${P.homeButton()}` : '<div class="sub">Esperando al anfitrión…</div>'}`);
  on('#again', 'click', hostStart);
  on('#lobby', 'click', backToLobby); P.bindHome();
  buzz(won ? [40, 40, 40, 40, 120] : [200]);
  if (won) SFX.score(); else if (!tie) SFX.lose();
}

/* =====================================================
   PARTIDA 3D
   ===================================================== */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}
function labelSprite(text, color) {
  const tex = canvasTex(256, 64, (g, w, h) => {
    g.font = '700 32px Rubik,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const tw = Math.min(w - 8, g.measureText(text).width + 26);
    g.fillStyle = 'rgba(15,12,28,.75)'; g.beginPath();
    if (g.roundRect) g.roundRect((w - tw) / 2, 8, tw, h - 16, 18); else g.rect((w - tw) / 2, 8, tw, h - 16);
    g.fill(); g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 1);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(2.8, 0.7, 1); s.renderOrder = 10; return s;
}
function iconSprite(emoji, size = 1.3) {
  const tex = canvasTex(128, 128, (g, w, h) => { g.font = '96px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(emoji, w / 2, h / 2 + 6); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(size, size, 1); return s;
}
function glowSprite(color, size) {
  const tex = canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, color); gr.addColorStop(0.35, color + '88'); gr.addColorStop(1, color + '00');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(size, size, 1); return s;
}

function buildArena(scene) {
  // suelo
  const floorTex = canvasTex(1024, 640, (g, w, h) => {
    const s = w / MAP.W;
    g.fillStyle = '#2a1d33'; g.fillRect(0, 0, w / 2, h);
    g.fillStyle = '#1b2240'; g.fillRect(w / 2, 0, w / 2, h);
    g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 2;
    for (let x = 0; x <= MAP.W; x += 2) { g.beginPath(); g.moveTo(x * s, 0); g.lineTo(x * s, h); g.stroke(); }
    for (let z = 0; z <= MAP.D; z += 2) { g.beginPath(); g.moveTo(0, z * s); g.lineTo(w, z * s); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 6; g.setLineDash([24, 18]);
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke(); g.setLineDash([]);
    g.beginPath(); g.arc(w / 2, h / 2, 5 * s, 0, 7); g.stroke();
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(MAP.W, MAP.D), new THREE.MeshLambertMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  // muros
  const side = new THREE.MeshLambertMaterial({ color: '#3a3066' }), top = new THREE.MeshLambertMaterial({ color: '#8f7fe0' });
  const mats = [side, side, top, side, side, side];
  const addBox = (x, z, w, d, h) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats); m.position.set(x, h / 2, z); scene.add(m); };
  BOXES.forEach(b => addBox(b[0], b[1], b[2], b[3], b[4]));
  const bw = 1;
  addBox(0, -MAP.D / 2 - bw / 2, MAP.W + bw * 2, bw, 1.4); addBox(0, MAP.D / 2 + bw / 2, MAP.W + bw * 2, bw, 1.4);
  addBox(-MAP.W / 2 - bw / 2, 0, bw, MAP.D, 1.4); addBox(MAP.W / 2 + bw / 2, 0, bw, MAP.D, 1.4);
  // bases
  [0, 1].forEach(t => {
    const b = baseOf(t), col = TEAM[t].color;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(MAP.baseR, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.18 }));
    disc.rotation.x = -Math.PI / 2; disc.position.set(b.x, 0.02, b.z); scene.add(disc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(MAP.baseR - 0.25, MAP.baseR, 48), new THREE.MeshBasicMaterial({ color: col }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(b.x, 0.03, b.z); scene.add(ring);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.4, 24), new THREE.MeshLambertMaterial({ color: TEAM[t].dark }));
    ped.position.set(b.x, 0.2, b.z); scene.add(ped);
  });
}

function makeChar(team, hat, name, isMe) {
  const g = new THREE.Group(), body = new THREE.Group();
  const col = TEAM[team].color;
  const bm = new THREE.MeshLambertMaterial({ color: col });
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.9, 16), bm); torso.position.y = 0.55; body.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 18, 14), new THREE.MeshLambertMaterial({ color: TEAM[team].light })); head.position.y = 1.32; body.add(head);
  const eyeM = new THREE.MeshBasicMaterial({ color: '#111' }), eyeW = new THREE.MeshBasicMaterial({ color: '#fff' });
  [-0.15, 0.15].forEach(x => {
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), eyeW); w.position.set(x, 1.38, 0.32); body.add(w);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), eyeM); p.position.set(x, 1.38, 0.41); body.add(p);
  });
  const hatM = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 0.26, 14), new THREE.MeshLambertMaterial({ color: hat })); hatM.position.y = 1.72; body.add(hatM);
  g.add(body);
  const sh = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; g.add(sh);
  if (isMe) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.9, 28), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring);
  }
  const shield = new THREE.Mesh(new THREE.SphereGeometry(1.0, 20, 14), new THREE.MeshBasicMaterial({ color: '#7fe8ff', transparent: true, opacity: 0.22, depthWrite: false }));
  shield.position.y = 0.9; shield.visible = false; g.add(shield);
  const stars = iconSprite('💫', 1.0); stars.position.y = 2.25; stars.visible = false; g.add(stars);
  const label = labelSprite(name, isMe ? '#ffcc33' : '#ffffff'); label.position.y = 2.55; g.add(label);
  const dagger = iconSprite('🗡️', 1.1); dagger.position.y = 3.35; dagger.visible = false; g.add(dagger);
  const puddle = iconSprite('💦', 1.6); puddle.position.y = 0.9; puddle.visible = false; g.add(puddle);
  const lock = iconSprite('🔒', 1.0); lock.position.y = 3.2; lock.visible = false; g.add(lock);
  return { g, body, shield, stars, label, dagger, puddle, lock };
}

function playMatch(m) {
  if (!window.THREE) {
    show('wait', `<div class="mid"><div class="spin"></div><div class="title">Cargando el 3D…</div></div>`);
    const tk = viewToken;
    P.need3D().then(ok => { if (tk !== viewToken) return; if (ok) playMatch(m); else show('error', `<div class="mid"><div style="font-size:56px">😢</div><div class="title">No se pudo cargar el 3D</div><div class="sub">Revisa la conexión a internet</div></div>`); });
    return;
  }
  show('game', `<div class="arena3d" id="game">
    <div id="gl"></div>
    <div class="vign" id="vign"></div>
    <div class="hud-top"><div class="sb"><span class="r" id="s0">${m.mode === 'paint' ? '0%' : '0'}</span><span class="tm" id="tm">${fmtClock(m.dur)}</span><span class="b" id="s1">${m.mode === 'paint' ? '0%' : '0'}</span></div>
      ${m.mode === 'paint' ? '<div class="pbar" id="pbar"><i class="r" style="width:0"></i><i class="b" style="width:0"></i></div>' : ''}
      ${m.mode === 'heist' ? `<div class="round">Ronda ${m.round}/2 · atracan los <b style="color:${TEAM[m.rob].color}">${TEAM[m.rob].pl}</b></div>` : ''}</div>
    <canvas class="mm" id="mm"></canvas>
    <div class="feed" id="feed"></div>
    <div class="acenter" id="cd"></div>
    <div class="status" id="status"></div>
    <div class="ahint" id="hint">Arrastra aquí para moverte</div>
    <button class="dash" id="dash"><span>${m.mode === 'paint' ? '<b>🎨</b>Pintar' : m.mode === 'heist' ? '<b>💨</b>Sprint' : '<b>💨</b>Placaje'}</span></button>
    <div class="ink" id="ink">PINTURA</div>
    ${m.mode === 'heist' && players.find(p => p.id === myId) && players.find(p => p.id === myId).team === m.rob ? '<button class="smokebtn" id="smoke"><span><b>☁️</b>Humo</span></button>' : ''}
    <button class="leak" id="leak"><span><b>📡</b>Chivatazo</span></button>
    <button class="votebtn" id="votebtn">🗳️ Tiempo muerto</button>
    <div class="ovl" id="ovl"></div>
    <div class="joy" id="joy"><i></i></div>
  </div>`);
  const tok = viewToken;
  const me = players.find(p => p.id === myId) || { team: 0, hat: '#fff', name: myName };
  const myTeam = me.team, enemy = 1 - myTeam;
  const fwd = myTeam === 0 ? { x: 1, z: 0 } : { x: -1, z: 0 };     // hacia la base enemiga = arriba en pantalla
  const right = myTeam === 0 ? { x: 0, z: 1 } : { x: 0, z: -1 };

  /* escena */
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
  $('#gl').appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0f0c1c');
  scene.fog = new THREE.Fog('#0f0c1c', 30, 70);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  let camBack = 10, camH = 19;
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    const portrait = w < h; camBack = portrait ? 11 : 8; camH = portrait ? 21 : 14;
  }
  resize(); window.addEventListener('resize', resize);
  scene.add(new THREE.HemisphereLight('#d6ccff', '#2a2148', 0.85));
  const sun = new THREE.DirectionalLight('#ffffff', 0.7); sun.position.set(-8, 20, 10); scene.add(sun);
  buildArena(scene);

  const paint = m.mode === 'paint';
  // núcleos
  const cores = (paint ? [] : [0, 1]).map(t => {
    const gr = new THREE.Group();
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), new THREE.MeshStandardMaterial({ color: TEAM[t].color, emissive: TEAM[t].color, emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.3 }));
    gr.add(gem); const glow = glowSprite(TEAM[t].color, 3.2); gr.add(glow);
    const b = baseOf(t); gr.position.set(b.x, 1.3, b.z); scene.add(gr);
    return { gr, gem, st: 0, x: b.x, z: b.z, by: '' };
  });
  // objetos
  const pus = (m.mode === 'heist' ? [] : PUS).map(u => {
    const gr = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), new THREE.MeshBasicMaterial({ color: u.k === 'speed' ? '#ffcc33' : paint ? '#ff7ad9' : '#7fe8ff', transparent: true, opacity: 0.35 }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.06; gr.add(disc);
    const ic = iconSprite(u.k === 'speed' ? '⚡' : paint ? '💣' : '🛡️', 1.2); ic.position.y = 1; gr.add(ic);
    gr.position.set(u.x, 0, u.z); scene.add(gr);
    return { gr, ic, on: true };
  });
  // capa de pintura
  const grid = new Int8Array(GW * GD).fill(-1);
  let paintTex = null, paintData = null, pcv = null, pctx = null, pimg = null;
  const TC = [[255, 77, 94], [61, 139, 255]];
  if (paint) {
    paintData = new Uint8Array(GW * GD * 4);
    paintTex = new THREE.DataTexture(paintData, GW, GD, THREE.RGBAFormat);
    paintTex.magFilter = THREE.LinearFilter; paintTex.minFilter = THREE.LinearFilter; paintTex.needsUpdate = true;
    const layer = new THREE.Mesh(new THREE.PlaneGeometry(MAP.W, MAP.D), new THREE.MeshLambertMaterial({ map: paintTex, transparent: true, depthWrite: false }));
    layer.rotation.x = -Math.PI / 2; layer.position.y = 0.035; scene.add(layer);
    pcv = document.createElement('canvas'); pcv.width = GW; pcv.height = GD; pctx = pcv.getContext('2d'); pimg = pctx.createImageData(GW, GD);
  }
  function applyPaint(g) {
    for (let k = 0; k < g.length; k += 2) {
      const i = g[k], t = g[k + 1]; grid[i] = t;
      const r = Math.floor(i / GW), c = i % GW, tr = GD - 1 - r;
      const o = (tr * GW + c) * 4, col = TC[t];
      paintData[o] = col[0]; paintData[o + 1] = col[1]; paintData[o + 2] = col[2]; paintData[o + 3] = 225;
      const q = i * 4; pimg.data[q] = col[0]; pimg.data[q + 1] = col[1]; pimg.data[q + 2] = col[2]; pimg.data[q + 3] = 170;
    }
    if (g.length) { paintTex.needsUpdate = true; pctx.putImageData(pimg, 0, 0); }
  }
  // atracadores
  const heist = m.mode === 'heist';
  const robTeam = heist ? m.rob : -1, guardTeam = heist ? 1 - m.rob : -1;
  const iAmRob = heist && myTeam === robTeam, iAmGuard = heist && myTeam === guardTeam;
  let loot = [], smokes = [], bank = heist ? m.bank.slice() : [0, 0];
  if (heist) {
    scene.background = new THREE.Color('#07060f'); scene.fog = new THREE.Fog('#07060f', 22, 55);
    scene.children.forEach(o => { if (o.isHemisphereLight) o.intensity = 0.42; if (o.isDirectionalLight) o.intensity = 0.25; });
    const sg = robTeam === 0 ? 1 : -1;
    loot = LOOT.map(([x, z]) => {
      const gr = new THREE.Group();
      const ic = iconSprite('💰', 1.15); ic.position.y = 0.9; gr.add(ic);
      const gl = glowSprite('#ffcc33', 2.6); gl.position.y = 0.5; gr.add(gl);
      gr.position.set(x * sg, 0, z * sg); scene.add(gr);
      return { gr, ic, st: 0, x: x * sg, z: z * sg, by: '' };
    });
    const hide = iconSprite('🚐', 2.2), cop = iconSprite('🚓', 2.2);
    const rb = baseOf(robTeam), gb = baseOf(guardTeam);
    hide.position.set(rb.x, 2.2, rb.z); cop.position.set(gb.x, 2.2, gb.z); scene.add(hide); scene.add(cop);
    const bars = new THREE.Mesh(new THREE.CylinderGeometry(MAP.baseR, MAP.baseR, 1.6, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#8fa0c8', wireframe: true, transparent: true, opacity: 0.35 }));
    bars.position.set(gb.x, 0.8, gb.z); scene.add(bars);
  }
  const coneGeo = new THREE.CircleGeometry(VIS_R, 24, -Math.PI / 2 - VIS_A, VIS_A * 2);
  const smokeMeshes = [];
  function smokeFx(x, z, ms) {
    const gr = new THREE.Group();
    for (let i = 0; i < 7; i++) { const sp = glowSprite('#9a9ab0', 3.6); sp.material.blending = THREE.NormalBlending; sp.position.set((Math.random() - 0.5) * 3.4, 0.8 + Math.random() * 1.6, (Math.random() - 0.5) * 3.4); gr.add(sp); }
    gr.position.set(x, 0, z); scene.add(gr);
    smokeMeshes.push({ gr, until: performance.now() + ms, t0: performance.now() });
  }
  function los(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.4);
    for (let i = 1; i < n; i++) {
      const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
      if (insideBox(x, z)) return false;
      for (const k of smokes) if (Math.hypot(x - k[0], z - k[1]) < SMOKE_R) return false;
    }
    return true;
  }
  function seen(c) {
    const px = c.g.position.x, pz = c.g.position.z;
    if (c.f & 256) return true;
    for (const [gid, gc] of chars) {
      if (gc.team !== guardTeam) continue;
      const gx = gc.g.position.x, gz = gc.g.position.z, dx = px - gx, dz = pz - gz, d = Math.hypot(dx, dz);
      if (d < NEAR_R) return true;
      if (d > VIS_R) continue;
      let a = Math.atan2(dx, dz) - gc.g.rotation.y; a = Math.atan2(Math.sin(a), Math.cos(a));
      if (Math.abs(a) < VIS_A && los(gx, gz, px, pz)) return true;
    }
    return false;
  }

  // efectos de disparo
  const fx = [];
  const blobGeo = new THREE.SphereGeometry(0.32, 12, 10), ringGeo = new THREE.CircleGeometry(1, 28);
  function shotFx(msg) {
    const col = TEAM[msg.team].color;
    const ball = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ color: col }));
    ball.position.set(msg.x0, 0.9, msg.z0); if (msg.big) ball.scale.setScalar(1.8); scene.add(ball);
    const d = Math.hypot(msg.x1 - msg.x0, msg.z1 - msg.z0);
    fx.push({ kind: 'ball', m: ball, x0: msg.x0, z0: msg.z0, x1: msg.x1, z1: msg.z1, t0: performance.now(), dur: Math.max(60, d / 30 * 1000), big: msg.big, col });
  }
  function splashFx(x, z, col, size) {
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.08, z); scene.add(ring);
    fx.push({ kind: 'ring', m: ring, t0: performance.now(), dur: 380, size });
  }
  function updateFx(now) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i], k = Math.min(1, (now - f.t0) / f.dur);
      if (f.kind === 'ball') {
        f.m.position.set(f.x0 + (f.x1 - f.x0) * k, 0.9 + Math.sin(k * Math.PI) * 0.8 - k * 0.6, f.z0 + (f.z1 - f.z0) * k);
        if (k >= 1) { scene.remove(f.m); f.m.material.dispose(); fx.splice(i, 1); splashFx(f.x1, f.z1, f.col, f.big ? 3.8 : 1.8); }
      } else {
        f.m.scale.setScalar(0.3 + k * f.size); f.m.material.opacity = 0.8 * (1 - k);
        if (k >= 1) { scene.remove(f.m); f.m.material.dispose(); fx.splice(i, 1); }
      }
    }
  }

  // personajes
  const chars = new Map();
  function charFor(id) {
    if (chars.has(id)) return chars.get(id);
    const p = players.find(q => q.id === id); if (!p) return null;
    const c = makeChar(p.team, p.color, p.name, id === myId);
    c.team = p.team; c.t = null; c.f = 0; c.mv = 0; c.ry = 0;
    if (m.mode === 'heist' && p.team === 1 - m.rob) {
      const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: '#fff2a8', transparent: true, opacity: id === myId ? 0.2 : 0.14, depthWrite: false, blending: THREE.AdditiveBlending }));
      cone.rotation.x = -Math.PI / 2; cone.position.y = 0.05; c.g.add(cone); c.cone = cone;
    }
    scene.add(c.g); chars.set(id, c); return c;
  }
  const sp = (m.spawns[myId] || [0, 0, 0]);
  const st = { x: sp[0], z: sp[1], ry: sp[2], vx: 0, vz: 0, dashUntil: 0, lastDash: -9999, kx: 0, kz: 0 };
  Object.entries(m.spawns).forEach(([id, s]) => { const c = charFor(id); if (c) { c.g.position.set(s[0], 0, s[1]); c.g.rotation.y = s[2]; c.ry = s[2]; } });
  const meC = charFor(myId);
  let myFlags = 0, T = m.dur, sc = [0, 0], over = false, pcount = [0, 0, 1];
  const role = { traitor: false, mine: false, theirs: false };
  let paused = null, voteUsed = false, myVote = null, leakT = [0, 0], lastLeakLocal = performance.now() + m.cd - 15000;
  const ovl = $('#ovl'), leakBtn = $('#leak'), voteBtn = $('#votebtn');
  const camPos = new THREE.Vector3(st.x - fwd.x * camBack, camH, st.z - fwd.z * camBack);

  /* controles */
  const gameEl = $('#game'), joy = $('#joy'), dashBtn = $('#dash');
  let touch = null;
  gameEl.addEventListener('pointerdown', e => {
    if (e.target.closest('.dash') || e.target.closest('.smokebtn')) return;
    e.preventDefault(); audio();
    if (touch) return;
    touch = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
    joy.style.left = e.clientX + 'px'; joy.style.top = e.clientY + 'px'; joy.classList.add('on');
    joy.firstChild.style.transform = 'translate(-50%,-50%)';
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
  const kd = e => { keys[e.key.toLowerCase()] = true; if (e.key === ' ') doDash(); }, ku = e => { keys[e.key.toLowerCase()] = false; };
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  const DASH_CD = 2200, SHOT_COST = 0.2;
  let ink = 1, lastShot = 0;
  function doShoot() {
    const now = performance.now();
    if (now < startAt || over || (myFlags & 1) || now - lastShot < 230) return;
    const bomb = !!(myFlags & 128);
    if (!bomb && ink < SHOT_COST) { if (now - lastShot > 600) { say('🪣 ¡Sin pintura! Pisa tu color para recargar'); lastShot = now; } return; }
    lastShot = now; if (!bomb) ink -= SHOT_COST;
    toHost({ t: 'shoot', ry: r2(st.ry) }); SFX.dash(); buzz(15);
  }
  function doDash() {
    if (paint) return doShoot();
    const now = performance.now();
    if (now < startAt || over || paused || (myFlags & 1) || now - st.lastDash < DASH_CD) return;
    st.lastDash = now; st.dashUntil = now + 300;
    st.vx = Math.sin(st.ry) * 19; st.vz = Math.cos(st.ry) * 19;
    toHost({ t: 'dash' }); SFX.dash(); buzz(20);
  }
  dashBtn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); audio(); doDash(); });
  const LEAK_CD = 35000;
  leakBtn.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    const now = performance.now();
    if (!role.traitor || (myFlags & 32) || paused || now < startAt || now - lastLeakLocal < LEAK_CD) return;
    lastLeakLocal = now; toHost({ t: 'leak' }); buzz(20);
  });
  const smokeBtn = $('#smoke'); let lastSmokeLocal = -99999; const SMOKE_CD = 17000;
  if (smokeBtn) smokeBtn.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation(); audio();
    const now = performance.now();
    if (now < startAt || (myFlags & 1) || now - lastSmokeLocal < SMOKE_CD) return;
    lastSmokeLocal = now; toHost({ t: 'smoke' }); buzz(20);
  });
  voteBtn.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    if (paused || voteUsed) return;
    ovl.innerHTML = `<div class="t">🗳️ ¿Pedir tiempo muerto?</div><div class="s">Se pausa la partida y tu equipo vota quién es el traidor.<br>Solo se puede una vez por partida.</div>
      <div class="row2"><button class="btn sec" id="vno">Cancelar</button><button class="btn" id="vyes">¡Votar!</button></div>`;
    ovl.classList.add('on');
    on('#vno', 'click', () => ovl.classList.remove('on'));
    on('#vyes', 'click', () => { ovl.classList.remove('on'); toHost({ t: 'callVote' }); });
  });
  ovl.addEventListener('pointerdown', e => e.stopPropagation());
  function showVote(msg) {
    const mineVote = msg.team === myTeam;
    myVote = null;
    if (!mineVote) {
      ovl.innerHTML = `<div class="t">⏸️ Tiempo muerto</div><div class="s">El equipo ${tName(msg.team)} está buscando a su traidor…</div><div class="timer" id="vt"></div>`;
    } else {
      const cands = msg.cands.filter(id => id !== myId);
      ovl.innerHTML = `<div class="t">🗳️ ¿Quién es el traidor?</div><div class="s">${pName(msg.caller)} ha pedido tiempo muerto. Hablad y votad.<br>Acertar: +1 punto · Fallar: +1 para el rival</div>
        <div class="timer" id="vt"></div>
        <div class="opts">${cands.map(id => { const p = players.find(q => q.id === id) || {}; return `<button class="vopt" data-v="${esc(id)}"><span class="hat" style="background:${p.color || '#fff'}"></span>${esc(p.name || '?')}</button>`; }).join('')}
        <button class="vopt" data-v="skip" style="justify-content:center;color:var(--mute)">No votar a nadie</button></div>
        <div class="s" id="vc" style="margin:10px 0 0">0 / ${msg.cands.length} votos</div>`;
      ovl.querySelectorAll('.vopt').forEach(b => b.addEventListener('click', () => {
        if (myVote) return; myVote = b.dataset.v;
        ovl.querySelectorAll('.vopt').forEach(x => x.disabled = x !== b); b.classList.add('sel');
        toHost({ t: 'vote', target: myVote }); buzz(20);
      }));
    }
    ovl.classList.add('on');
  }
  function input() {
    if (touch) return { x: touch.x, y: touch.y };
    let x = (keys.arrowright || keys.d ? 1 : 0) - (keys.arrowleft || keys.a ? 1 : 0);
    let y = (keys.arrowup || keys.w ? 1 : 0) - (keys.arrowdown || keys.s ? 1 : 0);
    const L = Math.hypot(x, y); if (L > 1) { x /= L; y /= L; }
    return { x, y };
  }

  /* HUD */
  const feed = $('#feed'), statusEl = $('#status'), cdEl = $('#cd'), vign = $('#vign');
  function say(html, big, ms = 2600) {
    const d = document.createElement('div'); d.innerHTML = html; if (big) d.className = 'big';
    feed.appendChild(d); while (feed.children.length > 3) feed.firstChild.remove();
    setTimeout(() => d.remove(), ms);
  }
  const tName = t => `<b style="color:${TEAM[t].color}">${TEAM[t].name}</b>`;
  const pName = id => { const p = players.find(q => q.id === id); return p ? `<b style="color:${TEAM[p.team].color}">${esc(p.name)}</b>` : 'Alguien'; };
  let vignT = null;
  function hurt() { vign.classList.add('on'); clearTimeout(vignT); vignT = setTimeout(() => vign.classList.remove('on'), 500); }

  gameHook = msg => {
    if (msg.t === 's') {
      T = msg.T; sc = msg.sc;
      if (paint && msg.g) { applyPaint(msg.g); pcount = msg.pc; }
      if (heist && msg.hs) {
        msg.hs.loot.forEach(([st2, x, z, by], i) => { const l = loot[i]; if (!l) return; l.st = st2; l.x = x; l.z = z; l.by = by; });
        bank = msg.hs.bank; smokes = msg.hs.smoke;
      }
      msg.p.forEach(([id, x, z, ry, f, mv]) => {
        const c = charFor(id); if (!c) return;
        c.f = f;
        if (id === myId) { myFlags = f; return; }
        if (!c.t) c.g.position.set(x, 0, z);
        c.t = { x, z }; c.ry = ry; c.mv = mv;
      });
      msg.c.forEach(([s, x, z, by], i) => { const c = cores[i]; c.st = s; c.x = x; c.z = z; c.by = by; });
      msg.u.forEach((v, i) => { pus[i].on = !!v; });
      paused = msg.pz || null;
      if (paused) { const el = $('#vt'); if (el) el.textContent = Math.ceil(paused.left / 1000) + ' s'; }
    } else if (msg.t === 'role') {
      Object.assign(role, msg);
      leakBtn.classList.toggle('on', role.traitor);
      voteBtn.classList.toggle('on', role.mine);
      if (performance.now() < startAt) cdLast = '';
    } else if (msg.t === 'vote') {
      if (msg.team === myTeam) { voteUsed = true; voteBtn.classList.remove('on'); }
      showVote(msg); SFX.alarm(); buzz([80, 40, 80]);
    } else if (msg.t === 'voteTally') {
      const el = $('#vc'); if (el) el.textContent = msg.n + ' / ' + msg.of + ' votos';
    } else if (msg.t === 'ev') {
      const k = msg.k;
      if (k === 'steal') {
        if (msg.team === myTeam) { say(`🚨 ${pName(msg.who)} ha robado vuestro núcleo`, true); SFX.alarm(); buzz([100, 60, 100]); }
        else { say(`🖐️ ${pName(msg.who)} tiene el núcleo ${tName(msg.team)}`); SFX.steal(); if (msg.who === myId) buzz(60); }
      } else if (k === 'drop') say(`💥 ¡Núcleo ${tName(msg.team)} al suelo!`);
      else if (k === 'return') { say(msg.auto ? `↩️ El núcleo ${tName(msg.team)} vuelve a su base` : `↩️ ${pName(msg.who)} devuelve el núcleo ${tName(msg.team)}`); SFX.tick(); }
      else if (k === 'score') {
        say(`💎 ¡PUNTO para ${tName(msg.team)}! <span class="mute">(${pName(msg.who)})</span>`, true, 3200);
        if (msg.team === myTeam) { SFX.score(); buzz([50, 50, 150]); } else { SFX.lose(); buzz(200); }
        const el = $('#s' + msg.team); el.animate([{ transform: 'scale(1.6)' }, { transform: 'scale(1)' }], { duration: 500 });
      } else if (k === 'hit') {
        if (msg.who === myId) { st.vx = msg.dx * 13; st.vz = msg.dz * 13; st.kUntil = performance.now() + 250; say(`😵 ¡${pName(msg.from)} te ha placado!`); SFX.hit(); buzz([120, 50, 80]); hurt(); }
        else if (msg.from === myId) { say(`💥 ¡Placaje a ${pName(msg.who)}!`); SFX.hit(); buzz(40); }
      } else if (k === 'block') { if (msg.who === myId || msg.from === myId) { say('🛡️ ¡Placaje bloqueado!'); SFX.block(); } }
      else if (k === 'pu') { if (msg.who === myId) { say(msg.pu === 'speed' ? '⚡ ¡Velocidad!' : msg.pu === 'bomb' ? '💣 ¡Bomba de pintura! Tu próximo disparo será enorme' : '🛡️ ¡Escudo activado!'); SFX.pu(); buzz(30); } }
      else if (k === 'shot') shotFx(msg);
      else if (k === 'grab') { if (msg.who === myId) { say('💰 ¡Tienes una bolsa! Vuelve a tu escondite 🚐'); SFX.steal(); buzz(40); } }
      else if (k === 'bank') { say(`💰 ${pName(msg.who)} ha puesto a salvo una bolsa (${msg.bank[msg.team]})`); if (iAmRob) { SFX.score(); buzz([40, 40, 80]); } else SFX.lose(); }
      else if (k === 'arrest') {
        const c = chars.get(msg.who); if (c) { c.g.position.set(msg.x, 0, msg.z); c.t = { x: msg.x, z: msg.z }; }
        if (msg.who === myId) { st.x = msg.x; st.z = msg.z; st.vx = st.vz = 0; camPos.set(st.x - fwd.x * camBack, camH, st.z - fwd.z * camBack); say(`🚓 ¡${pName(msg.by)} te ha detenido! Espera a que te rescaten`, true); SFX.alarm(); buzz([150, 60, 150]); hurt(); }
        else if (msg.by === myId) { say(`🚓 ¡Has detenido a ${pName(msg.who)}!`); SFX.score(); buzz(50); }
        else say(`🚓 ${pName(msg.by)} ha detenido a ${pName(msg.who)}`);
      } else if (k === 'rescue') {
        say(`🔓 ${pName(msg.who)} ha liberado a ${msg.n} preso${msg.n > 1 ? 's' : ''}`, true);
        if (iAmRob) { SFX.score(); buzz([40, 40, 80]); } else SFX.alarm();
      } else if (k === 'smoke') { smokeFx(msg.x, msg.z, msg.ms); tone(200, .4, 'sawtooth', .05, -100); if (iAmGuard) say('🌫️ ¡Bomba de humo!'); }
      else if (k === 'splat') {
        const c = chars.get(msg.who); if (c) splashFx(c.g.position.x, c.g.position.z, TEAM[1 - c.team].color, 2.6);
        if (msg.who === myId) { cdEl.innerHTML = `<div class="big">💦</div><div class="small">¡${pName(msg.by)} te ha pintado!<br>Vuelves a tu base…</div>`; SFX.hit(); buzz([150, 60, 150]); hurt(); }
        else if (msg.by === myId) { say(`🎯 ¡Has pintado a ${pName(msg.who)}!`); SFX.score(); buzz(40); }
        else say(`💦 ${pName(msg.by)} ha pintado a ${pName(msg.who)}`);
      } else if (k === 'respawn') {
        const c = chars.get(msg.who);
        if (c) { c.g.position.set(msg.x, 0, msg.z); c.t = { x: msg.x, z: msg.z }; }
        if (msg.who === myId) { st.x = msg.x; st.z = msg.z; st.vx = st.vz = 0; st.ry = msg.ry; ink = 1; cdEl.innerHTML = ''; camPos.set(st.x - fwd.x * camBack, camH, st.z - fwd.z * camBack); }
      }
      else if (k === 'trip') {
        if (msg.who === myId) { st.vx = msg.dx * 13; st.vz = msg.dz * 13; st.kUntil = performance.now() + 250; say('😵 ¡Has tropezado! ¿O alguien te ha empujado…?'); SFX.hit(); buzz([120, 50, 80]); hurt(); }
        else say(`😵 ${pName(msg.who)} ha tropezado…`);
      } else if (k === 'leak') {
        leakT[msg.team] = performance.now() + msg.ms;
        if (msg.team === myTeam) { say(role.traitor ? '📡 Chivatazo enviado 🤫' : '📡 ¡Alguien ha filtrado vuestras posiciones!', !role.traitor); if (!role.traitor) SFX.alarm(); }
        else { say(`📡 ¡Un chivato os revela al equipo ${tName(msg.team)}! Mirad el minimapa`); SFX.pu(); }
      } else if (k === 'voteEnd') {
        ovl.classList.remove('on'); paused = null;
        const tn = msg.target ? pName(msg.target) : '';
        let html;
        if (!msg.target) html = `🗳️ El equipo ${tName(msg.team)} no se pone de acuerdo. Nadie expulsado`;
        else if (msg.traitor) html = `🗡️ ¡${tn} era el TRAIDOR del equipo ${tName(msg.team)}! +1 punto`;
        else html = `😬 ${tn} era inocente… +1 punto para ${tName(1 - msg.team)}`;
        say(html, true, 4500);
        if (msg.target === myId && role.traitor) { leakBtn.classList.remove('on'); }
        if (msg.target) { if ((msg.traitor && msg.team === myTeam) || (!msg.traitor && msg.team !== myTeam)) SFX.score(); else SFX.lose(); }
      }
    }
  };

  /* minimapa */
  const mm = $('#mm'), mctx = mm.getContext('2d');
  const MS = 1.85, mmW = Math.round(MAP.D * MS), mmH = Math.round(MAP.W * MS), mdpr = Math.min(2, window.devicePixelRatio || 1);
  mm.width = mmW * mdpr; mm.height = mmH * mdpr; mm.style.width = mmW + 'px'; mm.style.height = mmH + 'px';
  mctx.setTransform(mdpr, 0, 0, mdpr, 0, 0);
  const toMM = (x, z) => { const u = x * right.x + z * right.z, v = x * fwd.x + z * fwd.z; return [mmW / 2 + u * MS, mmH / 2 - v * MS]; };
  function drawMM() {
    mctx.clearRect(0, 0, mmW, mmH);
    if (paint) {
      const a = right.x * MS, c2 = right.z * MS, e = mmW / 2 + (-32 * right.x - 20 * right.z) * MS;
      const b = -fwd.x * MS, d = -fwd.z * MS, f = mmH / 2 - (-32 * fwd.x - 20 * fwd.z) * MS;
      mctx.setTransform(a * mdpr, b * mdpr, c2 * mdpr, d * mdpr, e * mdpr, f * mdpr);
      mctx.imageSmoothingEnabled = true; mctx.drawImage(pcv, 0, 0);
      mctx.setTransform(mdpr, 0, 0, mdpr, 0, 0);
    }
    [0, 1].forEach(t => { const b = baseOf(t), [px, py] = toMM(b.x, b.z); mctx.fillStyle = TEAM[t].color + '55'; mctx.beginPath(); mctx.arc(px, py, MAP.baseR * MS, 0, 7); mctx.fill(); });
    mctx.fillStyle = 'rgba(160,145,230,.75)';
    BOXES.forEach(b => {
      const [ax, ay] = toMM(b[0] - b[2] / 2, b[1] - b[3] / 2), [bx, by] = toMM(b[0] + b[2] / 2, b[1] + b[3] / 2);
      mctx.fillRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
    });
    pus.forEach((u, i) => { if (!u.on) return; const [px, py] = toMM(PUS[i].x, PUS[i].z); mctx.fillStyle = PUS[i].k === 'speed' ? '#ffcc33' : paint ? '#ff7ad9' : '#7fe8ff'; mctx.fillRect(px - 1.5, py - 1.5, 3, 3); });
    cores.forEach((c, t) => {
      const [px, py] = toMM(c.gr.position.x, c.gr.position.z);
      mctx.fillStyle = TEAM[t].color; mctx.strokeStyle = '#fff'; mctx.lineWidth = 1.5;
      mctx.beginPath(); mctx.moveTo(px, py - 5); mctx.lineTo(px + 4, py); mctx.lineTo(px, py + 5); mctx.lineTo(px - 4, py); mctx.closePath(); mctx.fill(); mctx.stroke();
    });
    const now = performance.now();
    if (heist) {
      loot.forEach(l => { if (l.st !== 0) return; const [px, py] = toMM(l.x, l.z); mctx.fillStyle = '#ffcc33'; mctx.fillRect(px - 2, py - 2, 4, 4); });
      smokes.forEach(k => { const [px, py] = toMM(k[0], k[1]); mctx.fillStyle = 'rgba(180,180,200,.45)'; mctx.beginPath(); mctx.arc(px, py, SMOKE_R * MS, 0, 7); mctx.fill(); });
    }
    const mates = []; chars.forEach(c => { if (c.team === myTeam) mates.push(c.g.position); });
    chars.forEach((c, id) => {
      if (heist) { if (iAmGuard && c.team === robTeam && !c.g.visible) return; }
      else if (c.team !== myTeam && !(leakT[c.team] > now) && !mates.some(q => Math.hypot(q.x - c.g.position.x, q.z - c.g.position.z) < 11)) return;
      const [px, py] = toMM(c.g.position.x, c.g.position.z);
      if (leakT[c.team] > now && c.team !== myTeam) { mctx.strokeStyle = '#ff5a8a'; mctx.lineWidth = 1.5; mctx.beginPath(); mctx.arc(px, py, 5 + Math.sin(now / 120) * 1.5, 0, 7); mctx.stroke(); }
      mctx.fillStyle = TEAM[c.team].color; mctx.beginPath(); mctx.arc(px, py, id === myId ? 3.6 : 2.8, 0, 7); mctx.fill();
      if (id === myId) { mctx.strokeStyle = '#fff'; mctx.lineWidth = 1.5; mctx.stroke(); }
    });
  }

  /* bucle */
  const startAt = performance.now() + m.cd;
  let last = performance.now(), lastSend = 0, cdLast = '', t0 = performance.now();
  const SPEED = 7.2, R = 0.55;
  function loop() {
    if (tok !== viewToken) return;
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    const time = (now - t0) / 1000;
    // cuenta atrás
    if (now < startAt) {
      const s = String(Math.ceil((startAt - now) / 1000));
      if (s !== cdLast) {
        cdLast = s;
        const extra = role.traitor ? `<div class="small" style="color:#ff8aa8;font-size:20px;margin-top:10px">🗡️ Eres el TRAIDOR<br>Ayuda en secreto al equipo ${tName(enemy)}</div>`
          : role.mine ? `<div class="small" style="color:#ff8aa8;margin-top:8px">⚠️ Hay un traidor en tu equipo</div>` : '';
        cdEl.innerHTML = `<div class="big">${s}</div><div class="small">${role.traitor ? 'Finges ser del' : 'Equipo'} ${tName(myTeam)} · ${paint ? '¡pinta todo el mapa!' : heist ? (iAmRob ? '💰 Sois ATRACADORES: robad el botín sin que os vean' : '🚓 Sois GUARDIAS: tocad a los ladrones para detenerlos') : `¡a por el núcleo ${tName(enemy)}!`}</div>${extra}`; SFX.tick();
      }
    } else if (cdLast !== 'go') {
      cdLast = 'go'; cdEl.innerHTML = '<div class="big">¡YA!</div>'; SFX.go(); buzz(60);
      setTimeout(() => { if (tok === viewToken) cdEl.innerHTML = ''; }, 800);
    }
    // movimiento propio
    const stunned = !!(myFlags & 1), carrying = !!(myFlags & 16), fast = !!(myFlags & 4);
    const canMove = now >= startAt && !stunned && !over && !paused;
    const inp = canMove ? input() : { x: 0, y: 0 };
    const mvx = fwd.x * inp.y + right.x * inp.x, mvz = fwd.z * inp.y + right.z * inp.x;
    let floorMul = 1;
    if (paint) {
      const ci = cellOf(st.x, st.z), gv = ci >= 0 ? grid[ci] : -1;
      floorMul = gv === myTeam ? 1.3 : gv === enemy ? 0.72 : 1;
      if (!stunned) ink = Math.min(1, ink + dt * (gv === myTeam ? 0.6 : 0.16));
    }
    const spd = SPEED * (fast ? 1.45 : 1) * (carrying ? 0.82 : 1) * floorMul;
    if (now < st.dashUntil || now < (st.kUntil || 0)) { /* mantiene impulso */ }
    else if (paused) { st.vx = 0; st.vz = 0; }
    else { const k = Math.min(1, dt * (stunned ? 4 : 14)); st.vx += (mvx * spd - st.vx) * k; st.vz += (mvz * spd - st.vz) * k; }
    st.x += st.vx * dt; st.z += st.vz * dt;
    collide(st, R);
    const moving = Math.hypot(mvx, mvz) > 0.15;
    if (moving && now >= st.dashUntil) { const target = Math.atan2(mvx, mvz); let d = target - st.ry; d = Math.atan2(Math.sin(d), Math.cos(d)); st.ry += d * Math.min(1, dt * 14); }
    if (meC) {
      meC.g.position.set(st.x, 0, st.z); meC.g.rotation.y = st.ry; meC.mv = moving;
    }
    if (now - lastSend > 66) { lastSend = now; toHost({ t: 'm', x: r2(st.x), z: r2(st.z), ry: r2(st.ry), mv: moving ? 1 : 0 }); }
    // otros
    chars.forEach((c, id) => {
      if (id !== myId && c.t) {
        const k = Math.min(1, dt * 14);
        c.g.position.x += (c.t.x - c.g.position.x) * k; c.g.position.z += (c.t.z - c.g.position.z) * k;
        let d = c.ry - c.g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); c.g.rotation.y += d * k;
      }
      const f = c.f;
      c.body.position.y = c.mv && !(f & 1) ? Math.abs(Math.sin(time * 12)) * 0.13 : 0;
      c.body.rotation.z = (f & 1) ? Math.sin(time * 10) * 0.35 : 0;
      c.body.rotation.x = (f & 8) ? 0.45 : 0;
      c.stars.visible = !!(f & 1) && !(f & 64);
      c.body.visible = !(f & 64); c.label.visible = !(f & 64); c.puddle.visible = !!(f & 64);
      c.lock.visible = !!(f & 256); if (f & 256) c.stars.visible = false;
      c.dagger.visible = !!(f & 32);
      c.dagger.position.y = 3.35 + Math.sin(time * 4) * 0.1;
      c.shield.visible = !!(f & 2);
      c.shield.material.opacity = 0.18 + Math.sin(time * 5) * 0.06;
    });
    // núcleos
    cores.forEach(c => {
      let x = c.x, z = c.z, y = 1.3;
      if (c.st === 1) { const ch = chars.get(c.by); if (ch) { x = ch.g.position.x; z = ch.g.position.z; y = 2.9; } }
      else if (c.st === 2) y = 0.8 + Math.sin(time * 6) * 0.1;
      const k = c.st === 1 ? 1 : Math.min(1, dt * 10);
      c.gr.position.x += (x - c.gr.position.x) * k; c.gr.position.z += (z - c.gr.position.z) * k; c.gr.position.y += (y - c.gr.position.y) * Math.min(1, dt * 10);
      c.gem.rotation.y += dt * 2; c.gem.rotation.x = Math.sin(time * 1.5) * 0.2;
    });
    pus.forEach((u, i) => { u.gr.visible = u.on; u.ic.position.y = 1 + Math.sin(time * 3 + i) * 0.15; });
    // estado
    let stTxt = '', bad = false, anySeen = false;
    if (heist) {
      chars.forEach((c, id) => { if (c.team === robTeam && id !== myId) { const v = iAmRob || seen(c); c.g.visible = v; if (v && iAmGuard && !(c.f & 256)) anySeen = true; } });
      if (iAmGuard) { /* el propio guardia siempre visible */ }
      loot.forEach(l => {
        l.gr.visible = l.st !== 2;
        if (l.st === 1) { const ch = chars.get(l.by); if (ch) { l.gr.position.set(ch.g.position.x, 2.2, ch.g.position.z); if (!ch.g.visible) l.gr.visible = false; } }
        else l.gr.position.set(l.x, 0, l.z);
        l.ic.position.y = 0.9 + Math.sin(time * 3 + l.x) * 0.12;
      });
      smokeMeshes.forEach(sm => { const k = (sm.until - now) / 1000; sm.gr.visible = k > 0; sm.gr.children.forEach((c, i) => c.material.opacity = Math.min(1, k) * 0.85); sm.gr.rotation.y += dt * 0.3; });
      if (myFlags & 256) { stTxt = '🔒 ¡Detenido! Espera a que te rescaten'; bad = true; }
      else if (iAmRob && carrying) stTxt = '💰 ¡Llevas botín! Corre a tu escondite 🚐';
      else if (iAmRob && chars.size && [...chars.values()].some(c => c.team === robTeam && (c.f & 256))) stTxt = '🔓 Hay compañeros presos: ¡entra en la comisaría!';
      else if (iAmGuard && anySeen) { stTxt = '👀 ¡Ladrón a la vista!'; bad = true; }
    }
    else if (paint) {
      if (myFlags & 64) stTxt = '';
      else if (myFlags & 128) stTxt = '💣 ¡Bomba lista! Dispara';
      else if (ink < SHOT_COST) { stTxt = '🪣 Sin pintura: pisa tu color'; bad = true; }
    }
    else if (stunned) { stTxt = '😵 ¡Aturdido!'; bad = true; }
    else if (carrying) stTxt = '💎 ¡Llevas el núcleo! Corre a tu base';
    else if (cores[myTeam].st === 1) { stTxt = '🚨 ¡Os han robado el núcleo! Placad al ladrón'; bad = true; }
    else if (cores[myTeam].st === 2) stTxt = '↩️ Vuestro núcleo está en el suelo: ¡tócalo!';
    if (stunned && (myFlags & 32)) stTxt = '🗡️ ¡Te han desenmascarado! Congelado…';
    if (paused) stTxt = '';
    statusEl.textContent = stTxt; statusEl.classList.toggle('on', !!stTxt); statusEl.classList.toggle('bad', bad);
    const cdp = paint ? ink : Math.min(1, (now - st.lastDash) / DASH_CD);
    dashBtn.style.setProperty('--cd', cdp); dashBtn.classList.toggle('ready', (paint ? (ink >= SHOT_COST || (myFlags & 128)) : cdp >= 1) && !stunned);
    if (smokeBtn) smokeBtn.style.setProperty('--cd', Math.max(0, Math.min(1, (now - lastSmokeLocal) / SMOKE_CD)));
    if (role.traitor) { if (myFlags & 32) leakBtn.classList.remove('on'); leakBtn.style.setProperty('--cd', Math.max(0, Math.min(1, (now - lastLeakLocal) / LEAK_CD))); }
    if (paint) {
      const p0 = Math.round(pcount[0] / pcount[2] * 100), p1 = Math.round(pcount[1] / pcount[2] * 100);
      $('#s0').textContent = p0 + '%'; $('#s1').textContent = p1 + '%';
      const pb = $('#pbar'); if (pb) { pb.children[0].style.width = p0 + '%'; pb.children[1].style.width = p1 + '%'; }
    } else if (heist) { $('#s0').textContent = '💰' + bank[0]; $('#s1').textContent = '💰' + bank[1]; }
    else { $('#s0').textContent = sc[0]; $('#s1').textContent = sc[1]; }
    $('#tm').textContent = fmtClock(T);
    if (paint) updateFx(now);
    // cámara
    const want = new THREE.Vector3(st.x - fwd.x * camBack, camH, st.z - fwd.z * camBack);
    camPos.lerp(want, Math.min(1, dt * 8));
    camera.position.copy(camPos);
    camera.lookAt(camPos.x + fwd.x * (camBack + 2.5), 0, camPos.z + fwd.z * (camBack + 2.5));
    drawMM();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  if (location.hash === '#debug') window.__g = { st, keys, cores, role, grid, loot, chars, get bank() { return bank; }, get smokes() { return smokes; }, get ink() { return ink; }, doShoot, get flags() { return myFlags; }, get paused() { return paused; }, doDash };

  viewCleanup = () => {
    window.removeEventListener('resize', resize);
    window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
    try { renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss(); } catch (e) {}
  };
}


if (location.hash === '#debug') window.__M = () => M;
return {
  open() { if (isHost) { broadcastPlayers(); setTimeout(() => P.need3D(), 300); } renderLobby(); },
  onMsg,
  onHost: (id, m) => hostHandle(id, m),
  onPlayers(list) { players = list; if (screen === 'lobby') renderLobby(); },
  onLeave: dropPlayer,
  destroy() {
    clearTimers();
    if (viewCleanup) { const c = viewCleanup; viewCleanup = null; try { c(); } catch (e) {} }
    viewToken++; gameHook = null;
    if (M) { clearInterval(M.tick); M.over = true; M = null; }
  },
};
  }
});
