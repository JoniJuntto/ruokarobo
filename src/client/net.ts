// ---------- online: the server runs the game, every browser sends input & renders snapshots ----------
// An online room is simulated by server/rooms.ts. This is the browser's end of it: one WebSocket, the typed
// messages of shared/protocol.ts going out, level messages and snapshots going into the mirror (client/mirror.ts).
//
//   - net.role is 'guest' while the state in `G` comes from the server. Then the main loop calls netTick()
//     instead of game.step(). That is true for everyone in a room, the one who opened it included.
//   - One player leads the room (net.leader): whoever opened it, or the longest-connected player once they
//     leave. Only the leader's start / roam / PvP / pause / quit / story count, so everyone else's buttons say
//     "waiting for the host": waiting() is that test. Anyone may buy.
//   - The players already on this machine come along as extra robots (input.ts takeOnline()).
// ponytail: no reconnecting. A dropped socket is back on the local title screen with a status line; rejoin with
// the code. See the same note in server/rooms.ts.
import { INPUT_HZ, type RoomClientMsg, type RoomServerMsg } from '../shared/protocol';
import type { Robot } from '../sim/types';
import { bump } from './achievements';
import { WS_URL } from './api';
import { $ } from './dom';
import { localCtrls, localInputs, takeOnline, touchDev } from './input';
import { applyLevelMsg, applySnap, mirrorTick } from './mirror';
import { saveTot, skins, store } from './store';
import { ui } from './ui';
import { G, MAP, game } from './world';

export const net = {
  role: 'local' as 'local' | 'guest', // guest: G is mirrored from the server, not simulated here
  myOwner: 'H',                       // Robot.owner of the robots this machine drives
  leader: '',                         // Robot.owner of the player who leads the room
  ownStory: false,                    // this machine started the story the room is playing, from its own save
  roomCode: '',
  ping: null as number | null,        // ms, round trip
  snaps: 0, snapRate: 0, lastSnap: 0, // snapshots this second / last second, performance.now() of the newest
};
// online, and not the one whose buttons count
export const waiting = () => net.role === 'guest' && net.leader !== net.myOwner;
// story saves belong to the machine whose story it is: always in a local game; online, only the leader who started it
export const keepsStory = () => net.role === 'local' || net.ownStory && !waiting();
// the name the server puts on the leaderboard for this room's runs: the leader's (server/rooms.ts record())
export const teamName = () => (G.robots.find(r => r.owner === net.leader) ?? G.robots[0])?.n || 'Robo';

// each map is its own page; a joiner on the wrong one is sent to the right one with the code
const PAGES: Record<string, string> = { village: './', helsinki: './helsinki.html' };
const UNREACHABLE = "Couldn't reach the game server. Check your connection and try again. Solo and same-screen games work without it.";
const CONNECT_MS = 10000;

export const status = (t: string) => { $('status').textContent = t; };
const codeIn = $<HTMLInputElement>('code'), bInvite = $('bInvite');
function showMenuButtons(on: boolean) { $('bHost').hidden = $('joinBox').hidden = !on; bInvite.hidden = true; }
const inviteUrl = () => location.origin + location.pathname + '?join=' + net.roomCode;
bInvite.onclick = () => navigator.clipboard.writeText(inviteUrl()).then(
  () => { bInvite.textContent = 'Link copied!'; setTimeout(() => { bInvite.textContent = 'Copy invite link'; }, 2000); },
  () => status('Copy this link: ' + inviteUrl()));

// online players are told apart by nickname, so going online needs one
function needName() {
  if (store.pname.trim()) return false;
  status('Type your name first, then go online.'); $('pname').focus();
  return true;
}

let ws: WebSocket | null = null, netT = 0;
export function send(m: RoomClientMsg) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); }
// open the socket and say first (host or join); the server answers with room, or with err and a closed socket
function connect(first: RoomClientMsg, connecting: string) {
  status(connecting); showMenuButtons(false);
  let sock: WebSocket, refused = '';
  try { sock = ws = new WebSocket(WS_URL); } catch (e) { return leaveOnline(UNREACHABLE); }
  // a server that never answers must not leave anyone on Connecting… forever
  const giveUp = setTimeout(() => { if (ws === sock && net.role === 'local') leaveOnline(UNREACHABLE); }, CONNECT_MS);
  sock.onopen = () => sock.send(JSON.stringify(first));
  sock.onmessage = e => {
    if (ws !== sock) return;
    let m: RoomServerMsg;
    try { m = JSON.parse(String(e.data)); } catch (err) { return; }
    if (m.type === 'err') refused = String(m.m); else onMessage(m);
  };
  // every way a socket ends comes through here: refused, server gone, network gone
  sock.onclose = () => {
    clearTimeout(giveUp);
    if (ws === sock) leaveOnline(refused || (net.role === 'guest' ? 'Lost the connection to the game server. You can rejoin with the room code.' : UNREACHABLE));
  };
}
function onMessage(m: RoomServerMsg) {
  if (m.type === 'room') {
    if (m.map !== MAP.id) { // a room on another map: go to that map's page and join from there
      const page = PAGES[m.map];
      leaveOnline(page ? 'That room is on another map. Taking you there…' : `Room ${m.code} is on a map this page doesn't have.`);
      if (page) location.href = `${page}?join=${encodeURIComponent(m.code)}`;
      return;
    }
    takeOnline(); // players who already joined on this machine come along; nobody yet: one robot now, joining should be enough to play
    Object.assign(net, { role: 'guest', myOwner: m.me, leader: m.leader, roomCode: m.code, ownStory: false });
    localCtrls.forEach((_, lid) => send({ type: 'add', lid, n: store.pname, sk: skins.sel }));
    bump('online'); saveTot();
    bInvite.hidden = !location.protocol.startsWith('http');
    status(waiting() ? `Joined room ${m.code}. ${touchDev ? 'Touch the stick to drive' : 'You drive with WASD'}. Waiting for the host to start…`
      : `Room code: ${m.code} — send the invite link, or friends type the code and press Join`);
  } else if (net.role !== 'guest') return; // nothing else means anything outside a room
  else if (m.type === 'leader') {
    net.leader = m.leader;
    status(waiting() ? `Room ${net.roomCode}: the host left, another player is the host now.` : `Room ${net.roomCode}: the host left. You are the host now.`);
  }
  else if (m.type === 'lvl') applyLevelMsg(G, m);
  else if (m.type === 's') { applySnap(G, m); net.snaps++; net.lastSnap = performance.now(); }
  else if (m.type === 'ev') G.events.push(...m.e); // the main loop drains these like the local simulation's own
  else if (m.type === 'pong') net.ping = performance.now() - m.t;
}

export function hostRoom() {
  if (net.role !== 'local' || ws || needName()) return;
  connect({ type: 'host', map: MAP.id }, 'Opening room…');
}
export function joinRoom(code: string) {
  code = code.trim().toUpperCase();
  if (!code || net.role !== 'local' || ws) return;
  if (needName()) return void (codeIn.value = code);
  connect({ type: 'join', code }, 'Connecting…');
}
// once a frame while online: this machine's inputs out INPUT_HZ times a second, then glide towards the last snapshot
export function netTick(dt: number) {
  if ((netT += dt) >= 1 / INPUT_HZ) { netT = 0; send({ type: 'in', in: localInputs() }); }
  if (!G.paused) mirrorTick(G, dt); // the host paused: nothing to glide towards
}
// back to a local game on the title screen
export function leaveOnline(msg: string) {
  const sock = ws, wasIn = net.role === 'guest'; ws = null; sock?.close();
  Object.assign(net, { role: 'local', myOwner: 'H', leader: '', roomCode: '', ownStory: false, ping: null });
  showMenuButtons(true); status(msg);
  if (!wasIn) return; // never got into a room: the local game, and whoever had joined it, is as it was
  localCtrls.length = 0;
  // the mirror has been writing the room's game into G: put back what a fresh title screen has
  game.setPaused(false);
  [...G.robots].forEach(r => game.removeRobot(r));
  Object.assign(G, { campaign: false, pvp: false, roam: false, santa: null, weather: { k: null, t: 0 }, bannerT: 0 });
  game.quit();
}
// a hidden tab gets no frames, so it sends no input: let go of the controls on the way out, or the server keeps
// driving this machine's robots on the last thing it heard
document.addEventListener('visibilitychange', () => {
  if (document.hidden && net.role === 'guest') send({ type: 'in', in: Object.fromEntries(localCtrls.map((_, lid) => [lid, { t: 0, s: 0 }])) });
});

// online every robot shows its player's nickname; couch play keeps Player N
export function nameOf(r: Robot) { return (net.role !== 'local' && r.n) || `Player ${r.i + 1}`; }

// the pause menu's "Online / debug" panel
export function netDebug(): string[] {
  const L = [`Role: ${net.role === 'local' ? 'local' : waiting() ? 'guest' : 'host'}${net.roomCode ? '   Room: ' + net.roomCode : ''}   FPS: ${Math.round(ui.fps)}`];
  if (net.role === 'local') return [...L, 'Not online. Host or join a game from the title screen.'];
  const ms = net.ping;
  L.push(`Server: ping ${ms != null ? Math.round(ms) + ' ms' : '…'}${ms != null && ms > 150 ? ' ⚠ laggy' : ''}   players here: ${localCtrls.length}`);
  const age = net.lastSnap ? Math.round(performance.now() - net.lastSnap) : -1;
  L.push(`Snapshots: ${net.snapRate}/s of 20${net.snapRate < 15 ? ' ⚠ dropping' : ''}   last: ${age < 0 ? 'none' : age + ' ms ago'}`);
  return L;
}
setInterval(() => { net.snapRate = net.snaps; net.snaps = 0; }, 1000);
// RTT is measured on our own clock, so no clock sync is needed
setInterval(() => { if (net.role === 'guest') send({ type: 'ping', t: performance.now() }); }, 2000);

$('bHost').onclick = hostRoom;
$('bJoin').onclick = () => joinRoom(codeIn.value);
// invite link: ?join=CODE connects straight away; drop it from the URL so a reload doesn't rejoin a dead room
const inviteCode = new URLSearchParams(location.search).get('join');
if (inviteCode) { history.replaceState(null, '', location.pathname); joinRoom(inviteCode); }
