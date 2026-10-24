/* =========================================================
   FIESTA P2P · núcleo común
   Sala única, conexión P2P (PeerJS), clasificación de la noche
   y registro de juegos. Cada juego vive en games/*.js y se
   registra con Party.register({...}).
   ========================================================= */
(() => {
'use strict';

const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const PREFIX = 'fiestap2p-hub-v1-';
const COLORS = ['#ffcc33', '#ff4f8b', '#3ddc84', '#4d9bff', '#b46bff', '#ff9a3c', '#2ee6d6', '#ff6b6b', '#c6f432', '#f7a8ff', '#ffffff', '#8fd3ff', '#ffb38a', '#a0ffcf', '#d0a0ff', '#ffe08a'];
const MAX_PLAYERS = 16;
const THREE_URLS = ['https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js'];

const GAMES = {}, ORDER = [];
const COMING = [
];

let peer = null, hostConn = null, isHost = false, myId = null, myName = '', code = '';
let players = [], pending = [], screen = '', active = null, toastT = null;
const room = { players: [], pending: [] };
const conns = new Map();
let activeGame = null;   // anfitrión: juego abierto

function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); }
function show(name, html) { screen = name; app.innerHTML = html; window.scrollTo(0, 0); }
function on(sel, ev, fn) { const el = typeof sel === 'string' ? $(sel) : sel; if (el) el.addEventListener(ev, fn); }

/* pantalla encendida + permisos */
let wake = null;
async function keepAwake() { try { if ('wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => wake = null); } } catch (e) {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && peer) keepAwake(); });
function askTilt() {
  try { if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') return DeviceOrientationEvent.requestPermission().catch(() => 'denied'); } catch (e) {}
  return Promise.resolve('granted');
}
let actx = null;
function unlockAudio() { try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) {} }

/* Three.js bajo demanda */
let threeP = null;
function need3D() {
  if (window.THREE) return Promise.resolve(true);
  if (threeP) return threeP;
  threeP = new Promise(res => {
    const load = i => {
      if (i >= THREE_URLS.length) { threeP = null; return res(false); }
      const s = document.createElement('script'); s.src = THREE_URLS[i]; s.async = true;
      s.onload = () => res(!!window.THREE); s.onerror = () => load(i + 1);
      document.head.appendChild(s);
    };
    load(0);
  });
  return threeP;
}

/* =====================================================
   INICIO
   ===================================================== */
function renderHome() {
  if (active) closeLocal();
  const pre = (new URLSearchParams(location.search).get('sala') || '').toUpperCase().slice(0, 4);
  let saved = ''; try { saved = localStorage.getItem('fiesta-name') || ''; } catch (e) {}
  show('home', `
    <div class="logo"><div class="emoji">🎉</div><h1>Fiesta<span>P2P</span></h1>
    <p class="mute">Todos los juegos en una sola sala, cada uno con su móvil</p></div>
    <label class="lbl" for="name">Tu nombre</label>
    <input id="name" maxlength="14" placeholder="Ej. Diego" value="${esc(saved)}" autocomplete="off">
    <div class="card">
      <label class="lbl" style="margin-top:0">¿Tienes un código?</label>
      <div class="row"><input id="code" class="codein" maxlength="4" placeholder="ABCD" value="${esc(pre)}" autocomplete="off" autocapitalize="characters">
      <button class="btn" id="join" style="flex:0 0 auto;width:auto;margin:0">Entrar</button></div>
    </div>
    <div class="card"><label class="lbl" style="margin-top:0">O monta tú la fiesta</label>
      <button class="btn pink" id="create">Crear sala</button></div>
    <p class="foot mute">💡 Todos en la misma wifi · la sala sirve para todos los juegos</p>`);
  on('#create', 'click', () => { if (getName()) createRoom(); });
  on('#join', 'click', () => {
    if (!getName()) return;
    const c = $('#code').value.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(c)) { toast('El código son 4 letras'); return; }
    joinRoom(c);
  });
  on('#code', 'keydown', e => { if (e.key === 'Enter') $('#join').click(); });
  if (!window.Peer) toast('No se pudo cargar la conexión. ¿Tienes internet?');
}
function getName() {
  const v = $('#name').value.trim().slice(0, 14);
  if (!v) { toast('Escribe tu nombre primero'); $('#name').focus(); return null; }
  myName = v; try { localStorage.setItem('fiesta-name', v); } catch (e) {}
  keepAwake(); unlockAudio(); askTilt();
  return v;
}
function renderWait(title, sub) {
  show('wait', `<div class="mid"><div class="spin"></div><div class="title">${esc(title)}</div><div class="sub">${esc(sub || '')}</div></div>`);
}
function renderError(title, sub) {
  try { peer && peer.destroy(); } catch (e) {}
  peer = null; hostConn = null;
  if (active) closeLocal();
  show('error', `<div class="mid"><div style="font-size:56px">😵</div><div class="title">${esc(title)}</div><div class="sub">${esc(sub || '')}</div>
    <button class="btn" id="home" style="margin-top:20px">Volver al inicio</button></div>`);
  on('#home', 'click', renderHome);
}
const needPeer = () => { if (!window.Peer) { toast('No se pudo cargar la librería de conexión. Revisa internet y recarga.'); return false; } return true; };

/* =====================================================
   ANFITRIÓN
   ===================================================== */
function genCode() { const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let s = ''; for (let i = 0; i < 4; i++) s += L[Math.floor(Math.random() * L.length)]; return s; }
function freeColor() { const used = [...room.players, ...room.pending].map(p => p.color); return COLORS.find(c => !used.includes(c)) || COLORS[Math.floor(Math.random() * COLORS.length)]; }
function createRoom(tries = 0) {
  if (!needPeer()) return;
  isHost = true; myId = 'host'; code = genCode();
  renderWait('Creando sala…', 'Un segundo');
  try { peer && peer.destroy(); } catch (e) {}
  peer = new Peer(PREFIX + code, { debug: 0 });
  peer.on('open', () => {
    room.players = [{ id: 'host', name: myName, color: COLORS[0], score: 0, team: 0 }];
    room.pending = [];
    players = clone(room.players);
    renderHub();
    setTimeout(() => need3D(), 4000);
  });
  peer.on('connection', conn => {
    conn.on('data', d => { try { hostHandle(conn.peer, d, conn); } catch (e) { console.error(e); } });
    conn.on('close', () => dropPlayer(conn.peer));
    conn.on('error', () => dropPlayer(conn.peer));
  });
  peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
  peer.on('error', e => {
    if (e.type === 'unavailable-id' && tries < 5) { createRoom(tries + 1); return; }
    if (screen === 'wait' || screen === 'home') renderError('No se pudo crear la sala', 'Revisa la conexión e inténtalo otra vez. (' + e.type + ')');
  });
}
function sendCore(id, msg) {
  if (id === 'host') { const m = clone(msg); setTimeout(() => onMsg(m), 0); return; }
  const c = conns.get(id); if (c && c.open) { try { c.send(msg); } catch (e) {} }
}
function everyone() { return [...room.players, ...room.pending]; }
function broadcastCore(msg) { everyone().forEach(p => sendCore(p.id, msg)); }
function broadcastPlayers() { broadcastCore({ t: 'players', players: room.players, pending: room.pending }); }

function hostHandle(id, m, conn) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'hello') {
    const known = everyone().find(p => p.id === id);
    if (!known && everyone().length >= MAX_PLAYERS) { conn.send({ t: 'full' }); return; }
    if (conn) conns.set(id, conn);
    if (!known) {
      const p = { id, name: String(m.name || 'Jugador').slice(0, 14), color: freeColor(), score: 0, team: room.players.filter(q => q.team === 0).length <= room.players.filter(q => q.team === 1).length ? 0 : 1 };
      if (activeGame) room.pending.push(p); else room.players.push(p);
      toast('👋 ' + p.name + ' ha entrado');
    }
    sendCore(id, { t: 'welcome', id, code });
    broadcastPlayers();
    sendCore(id, activeGame ? { t: 'wait', game: activeGame } : { t: 'hub' });
  }
  else if (m.t === 'g') { if (active && room.players.some(p => p.id === id)) active.inst.onHost && active.inst.onHost(id, m.d); }
}
function dropPlayer(id) {
  if (!conns.has(id) && !everyone().some(p => p.id === id)) return;
  conns.delete(id);
  const p = everyone().find(p => p.id === id);
  room.players = room.players.filter(p => p.id !== id);
  room.pending = room.pending.filter(p => p.id !== id);
  if (p) toast('🚪 ' + p.name + ' se ha ido');
  if (active && active.inst.onLeave) { try { active.inst.onLeave(id); } catch (e) { console.error(e); } }
  broadcastPlayers();
}
function hostOpen(id) {
  if (activeGame) return;
  const def = GAMES[id]; if (!def) return;
  if (def.min && room.players.length < def.min) { toast(`${def.name} necesita al menos ${def.min} jugadores`); return; }
  activeGame = id;
  broadcastCore({ t: 'open', game: id });
}
function hostClose() {
  if (!isHost || !activeGame) return;
  activeGame = null;
  room.pending.forEach(p => room.players.push(p)); room.pending = [];
  broadcastPlayers();
  broadcastCore({ t: 'hub' });
}
function resetScores() { room.players.forEach(p => p.score = 0); broadcastPlayers(); toast('Puntos de la noche a cero'); }

/* =====================================================
   INVITADO
   ===================================================== */
function joinRoom(c) {
  if (!needPeer()) return;
  isHost = false; code = c;
  renderWait('Entrando en la sala ' + c + '…', 'Conectando con el anfitrión');
  try { peer && peer.destroy(); } catch (e) {}
  peer = new Peer({ debug: 0 });
  let opened = false;
  const failT = setTimeout(() => { if (!opened) renderError('No se pudo conectar', 'Comprueba el código y que estéis en la misma wifi.'); }, 15000);
  peer.on('open', id => {
    myId = id;
    hostConn = peer.connect(PREFIX + c, { reliable: true, serialization: 'json' });
    hostConn.on('open', () => { opened = true; clearTimeout(failT); hostConn.send({ t: 'hello', name: myName }); });
    hostConn.on('data', d => { try { onMsg(d); } catch (e) { console.error(e); } });
    hostConn.on('close', lost);
    hostConn.on('error', lost);
  });
  peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
  peer.on('error', e => {
    if (e.type === 'peer-unavailable') { clearTimeout(failT); renderError('Sala no encontrada', 'No existe ninguna sala con el código ' + c + '.'); }
    else if (!opened) { clearTimeout(failT); renderError('No se pudo conectar', 'Error de red (' + e.type + ').'); }
  });
}
function lost() {
  if (screen === 'error' || !hostConn) return;
  hostConn = null;
  if (active) closeLocal();
  show('error', `<div class="mid"><div style="font-size:56px">📡</div><div class="title">Conexión perdida</div>
    <div class="sub">Se ha cortado la conexión con el anfitrión.</div>
    <button class="btn" id="re" style="margin-top:20px">Volver a entrar</button>
    <button class="btn sec" id="home">Ir al inicio</button></div>`);
  on('#re', 'click', () => joinRoom(code));
  on('#home', 'click', renderHome);
}

/* =====================================================
   MENSAJES Y JUEGOS
   ===================================================== */
function onMsg(m) {
  switch (m.t) {
    case 'welcome': myId = m.id; code = m.code; break;
    case 'players':
      players = m.players; pending = m.pending || [];
      if (active) { try { active.inst.onPlayers && active.inst.onPlayers(players); } catch (e) { console.error(e); } }
      else if (screen === 'hub') renderHub();
      else if (screen === 'waitgame') renderWaitGame(m.game || waitingFor);
      break;
    case 'hub': if (active) closeLocal(); renderHub(); break;
    case 'open': openLocal(m.game); break;
    case 'wait': renderWaitGame(m.game); break;
    case 'full': renderError('Sala llena', 'Ya hay ' + MAX_PLAYERS + ' jugadores.'); break;
    case 'g': if (active) active.inst.onMsg && active.inst.onMsg(m.d); break;
  }
}
function api() {
  return {
    get myId() { return myId; }, get isHost() { return isHost; }, get myName() { return myName; }, get code() { return code; },
    room, players: () => players,
    send: (id, d) => sendCore(id, { t: 'g', d }),
    broadcast: d => room.players.forEach(p => sendCore(p.id, { t: 'g', d })),
    toHost: d => { if (isHost) { if (active && active.inst.onHost) active.inst.onHost('host', d); } else if (hostConn && hostConn.open) hostConn.send({ t: 'g', d }); },
    broadcastPlayers, close: hostClose, need3D, toast, askTilt,
    homeButton: () => isHost ? '<button class="btn sec" data-home="1">🏠 Volver a la sala</button>' : '',
    bindHome: () => document.querySelectorAll('[data-home]').forEach(b => b.addEventListener('click', hostClose)),
  };
}
function openLocal(id) {
  if (active) closeLocal();
  const def = GAMES[id]; if (!def) { renderError('Juego desconocido', 'Actualiza la página: el anfitrión tiene una versión más nueva.'); return; }
  screen = 'game:' + id;
  const inst = def.create(api());
  active = { id, inst };
  try { inst.open && inst.open(); } catch (e) { console.error(e); }
}
function closeLocal() {
  if (!active) return;
  const a = active; active = null;
  try { a.inst.destroy && a.inst.destroy(); } catch (e) { console.error(e); }
}

/* sala */
function renderHub() {
  const sorted = players.slice().sort((a, b) => b.score - a.score);
  const MED = ['🥇', '🥈', '🥉'];
  const cards = ORDER.map(id => {
    const g = GAMES[id];
    return `<button class="gcard g-${id}${g.wide ? ' wide' : ''}" data-g="${id}"${isHost ? '' : ' disabled'}>
      <span class="np">${esc(g.players || '')}</span><span class="e">${g.emoji}</span><div><b>${esc(g.name)}</b><small>${esc(g.desc)}</small></div></button>`;
  }).join('');
  const soon = COMING.map(g => `<div class="gcard soon"><span class="np">Próximamente</span><span class="e">${g.emoji}</span><b>${esc(g.name)}</b><small>${esc(g.desc)}</small></div>`).join('');
  show('hub', `
    <div class="hubtop"><h1>🎉 Fiesta<span>P2P</span></h1>
      <div class="codechip"><b>${esc(code)}</b><button id="share">📤 Invitar</button></div></div>
    <div class="card"><div class="top" style="display:flex;justify-content:space-between;align-items:center"><h3>🏆 Clasificación de la noche</h3><span class="mute" style="font-size:13px;font-weight:700">${players.length} jugador${players.length === 1 ? '' : 'es'}</span></div>
      <ul class="plist rank">${sorted.map((p, i) => `<li><span class="med">${p.score > 0 && i < 3 ? MED[i] : ''}</span><span class="dot" style="background:${p.color}"></span>
        <span class="nm">${esc(p.name)}${p.id === myId ? '<span class="tag">TÚ</span>' : ''}${p.id === 'host' ? '<span class="tag">👑</span>' : ''}</span><span class="pts">${p.score}</span></li>`).join('')}
        ${pending.map(p => `<li class="pend"><span class="med">⏳</span><span class="dot" style="background:${p.color}"></span><span class="nm">${esc(p.name)}</span><span class="pts">${p.score}</span></li>`).join('')}</ul>
    </div>
    <div class="cat">${isHost ? 'Elige un juego' : 'Juegos · elige el anfitrión'}</div>
    <div class="gcards">${cards}</div>
    <div class="cat">Próximamente</div>
    <div class="gcards">${soon}</div>
    ${isHost ? '<button class="btn sec small" id="reset" style="margin-top:18px">Poner a cero la clasificación</button>' : ''}
    <p class="foot mute">Los puntos de cada juego se suman a la clasificación de la noche</p>`);
  on('#share', 'click', share);
  if (isHost) {
    document.querySelectorAll('.gcard[data-g]').forEach(b => b.addEventListener('click', () => { unlockAudio(); hostOpen(b.dataset.g); }));
    on('#reset', 'click', resetScores);
  }
}
let waitingFor = null;
function renderWaitGame(game) {
  waitingFor = game;
  const g = GAMES[game] || { emoji: '🎮', name: 'un juego' };
  show('waitgame', `<div class="mid"><div style="font-size:60px">${g.emoji}</div><div class="title">Están jugando a ${esc(g.name)}</div>
    <div class="sub">Entrarás en cuanto vuelvan a la sala</div>
    <div class="waitlist">${players.map(p => esc(p.name)).join(' · ')}</div></div>`);
}
async function share() {
  const isFile = location.protocol === 'file:';
  const url = isFile ? '' : location.origin + location.pathname + '?sala=' + code;
  const text = '¡Únete a la fiesta! Código de sala: ' + code;
  try { if (navigator.share) { await navigator.share(url ? { title: 'Fiesta P2P', text, url } : { title: 'Fiesta P2P', text }); return; } } catch (e) { return; }
  try { await navigator.clipboard.writeText(url ? text + '\n' + url : text); toast('Copiado al portapapeles'); } catch (e) { toast('Código: ' + code); }
}

window.addEventListener('beforeunload', e => { if (isHost && room.players.length > 1) { e.preventDefault(); e.returnValue = ''; } });

window.Party = {
  register(def) { GAMES[def.id] = def; ORDER.push(def.id); },
  boot() { renderHome(); },
  debug: () => ({ room, players, active, activeGame, myId }),
};
})();
