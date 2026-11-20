// Online rooms. The server runs one simulation per room; every browser in it, the one that opened it included,
// sends input and draws the snapshots it gets back (src/client/net.ts + mirror.ts). The messages are in
// src/shared/protocol.ts.
// This is a public endpoint, so nothing a socket sends is trusted: every message is size-capped, parsed
// defensively, shape-checked and clamped before it gets near a game, and a room that throws is closed on its own.
// ponytail: no reconnection. A socket that drops loses its robots, and a leader's reload hands the room to the next
// player. Resuming needs a per-player secret and a grace period before the robots go; add them if drops become a
// complaint.
// ponytail: rooms live in this process's memory, so a restart (every deploy) ends the games in flight.
import type { ServerWebSocket } from 'bun';
import { MAX_PLAYERS, freshUp, isStyle } from '../src/sim/data';
import { createGame, type Game } from '../src/sim/game';
import { maps } from '../src/sim/map/index';
import { isFx } from '../src/sim/state';
import type { FxEvent, Input, SimEvent, UpKey, Upgrades } from '../src/sim/types';
import { SNAP_HZ, encodeLevel, encodeSnap, type RoomServerMsg } from '../src/shared/protocol';
import { RUN_MAX, addRow, clean, int, name, plausible } from './board';

// ---------- limits ----------
export const MSG_MAX = 2048;   // bytes of one message; Bun closes a socket that sends more (code 1009)
// ponytail: one process, one thread. A village room costs about 0.1 ms per step and a Helsinki room about 0.5 ms
// (measured on a laptop; the box is slower), so a dozen of the heavy ones is 30-70 % of a core at 60 steps a second.
// Past that, run a second process per map or step rooms in workers.
const MAX_ROOMS = 12;          // rooms alive at once
const ROOM_SOCKS = 8;          // sockets in one room: MAX_PLAYERS robots and a few people watching
const MAX_SOCKS = 120;         // sockets on the whole server: every room full, and some still knocking
const IP_SOCKS = 16;           // sockets from one address (a school or a family share one)
const RATE = 120;              // messages a socket may send per second (a player sends about 31); the rest are dropped
const FLOOD = 600;             // ...and at this many in one second the socket is closed
const ROOM_MAX = RUN_MAX;      // a room older than this is closed: no run on the board can be longer anyway
const FX_MAX = 400;            // one-shot effects held for the next snapshot
const SKIN_MAX = 24;           // characters in a skin key
const DT = 1 / 60;             // the simulation's fixed step
const MAX_STEPS = 5;           // catch-up steps after a stall; time beyond that is dropped, not replayed
const CODE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L: codes are read out loud

export interface Sock { id: string; ip: string; room: Room | null; n: number; win: number } // n: messages since win (ms)
type WS = ServerWebSocket<Sock>;
interface Room {
  code: string; map: string; game: Game;
  socks: WS[];      // in the order they came: the first is the longest-connected
  leader: string;   // Sock.id of the one whose act and story messages count
  born: number;     // Date.now() when it was opened
  last: number; acc: number; snapIn: number; // performance.now() of the last tick, unsimulated ms, ms to the next snapshot
  fx: FxEvent[];    // effects since the last snapshot
  runAt: number;    // Date.now() when the endless run in progress began, 0 if none
}

export const rooms = new Map<string, Room>();
const perIp = new Map<string, number>();
let socks = 0, nextId = 1;
export const newSock = (ip: string): Sock => ({ id: 'p' + nextId++, ip, room: null, n: 0, win: 0 });

// Snapshots are a few kB of JSON twenty times a second, mostly the same keys every time: deflate takes most of it
// off the wire (index.ts turns it on with one shared compressor, so it costs no memory per socket).
const SQUEEZE = 256; // bytes; shorter messages go as they are
const send = (ws: WS, m: RoomServerMsg) => { const s = JSON.stringify(m); ws.send(s, s.length > SQUEEZE); };
function broadcast(room: Room, m: RoomServerMsg) { const s = JSON.stringify(m); for (const ws of room.socks) ws.send(s, s.length > SQUEEZE); }
function refuse(ws: WS, m: string) { send(ws, { type: 'err', m }); ws.close(1000, 'refused'); }

// ---------- the clock: one timer for every room, none when there are no rooms ----------
let timer: ReturnType<typeof setInterval> | null = null;
function drop(room: Room) {
  rooms.delete(room.code);
  if (!rooms.size && timer) { clearInterval(timer); timer = null; }
  console.log(`room ${room.code} closed, ${rooms.size} open`);
}
function closeRoom(room: Room, why: string) {
  drop(room);
  for (const ws of room.socks.splice(0)) { ws.data.room = null; refuse(ws, why); }
}
function tick() {
  const now = performance.now();
  for (const room of rooms.values()) {
    // one room's bug must not reach the others
    try { tickRoom(room, now); } catch (e) { console.error(`room ${room.code} crashed`, e); closeRoom(room, 'The room crashed. Sorry! Open a new one.'); }
  }
}
function tickRoom(room: Room, now: number) {
  if (Date.now() - room.born > ROOM_MAX) return closeRoom(room, 'This room has been open for 12 hours. Open a new one.');
  const ms = now - room.last; room.last = now;
  room.acc = Math.min(room.acc + ms, MAX_STEPS * DT * 1000);
  const ev: SimEvent[] = [];
  let level = false;
  const collect = () => {
    for (const e of room.game.drain()) {
      if (isFx(e)) { if (room.fx.length < FX_MAX) room.fx.push(e); }
      else if (e.k === 'level') level = true;
      else if (e.k !== 'stat') { ev.push(e); if (e.k === 'run') room.runAt = Date.now(); else if (e.k === 'over') record(room); }
    }
  };
  collect(); // what act, story and buy messages did since the last tick
  for (; room.acc >= DT * 1000; room.acc -= DT * 1000) { room.game.step(DT); collect(); }
  const g = room.game.state;
  if (level) broadcast(room, encodeLevel(g));
  // a lifecycle event goes out right behind a fresh snapshot, so whoever handles it sees the state it is about
  if ((room.snapIn -= ms) <= 0 || ev.length) {
    room.snapIn = 1000 / SNAP_HZ;
    broadcast(room, encodeSnap(g, room.fx.splice(0)));
  }
  if (ev.length) broadcast(room, { type: 'ev', e: ev });
}
// The run's row on the leaderboard, written by the one who watched it happen. Same meaning as the row a browser
// posts for a local run (src/client/board.ts): team score, shift reached, robots on the team at the end.
function record(room: Room) {
  const g = room.game.state, t0 = room.runAt;
  room.runAt = 0;
  if (g.campaign || g.pvp || g.roam || !t0) return; // story and pvp stay off the board, as they do locally
  if (room.map !== 'village') return; // the board is the village's, and so is the arithmetic in plausible(): other maps' runs stay off it
  const lead = g.robots.find(r => r.owner === room.leader) ?? g.robots[0];
  const row = {
    name: name(lead?.n), // client-claimed: the nickname the leader typed (cleaned when its robot was added). Nothing else here comes from a browser
    score: int(g.score, 0, 99999), shift: int(g.level, 1, 999), robots: int(g.robots.length, 1, MAX_PLAYERS), at: Date.now(),
  };
  // players come and go mid-run, so the sanity check allows what the biggest team this run saw could have earned
  if (plausible({ ...row, robots: int(g.stats.players, row.robots, MAX_PLAYERS) }, row.at - t0)) addRow(row);
  else console.error(`room ${room.code}: implausible run not recorded`, row);
}

// ---------- sockets ----------
export function open(ws: WS) {
  const s = ws.data;
  socks++; perIp.set(s.ip, (perIp.get(s.ip) || 0) + 1);
  if (socks > MAX_SOCKS || perIp.get(s.ip)! > IP_SOCKS) refuse(ws, 'The server is full. Try again in a bit.');
}
export function close(ws: WS) {
  const s = ws.data, room = s.room;
  socks--;
  const left = (perIp.get(s.ip) || 1) - 1;
  if (left > 0) perIp.set(s.ip, left); else perIp.delete(s.ip);
  if (!room) return;
  s.room = null;
  room.socks.splice(room.socks.indexOf(ws), 1);
  if (!room.socks.length) return drop(room); // the last one out: the game is garbage now
  try {
    const game = room.game;
    for (const r of game.state.robots.filter(r => r.owner === s.id)) game.removeRobot(r);
    if (room.leader === s.id) {
      room.leader = room.socks[0].data.id;
      game.setPaused(false); // the old leader's pause menu went with them
      broadcast(room, { type: 'leader', leader: room.leader });
    }
  } catch (e) { console.error(`room ${room.code} crashed`, e); closeRoom(room, 'The room crashed. Sorry! Open a new one.'); }
}
export function message(ws: WS, raw: string | Buffer) {
  const s = ws.data, now = Date.now();
  if (now - s.win >= 1000) { s.win = now; s.n = 0; }
  if (++s.n > RATE) { if (s.n > FLOOD) ws.close(1008, 'flood'); return; }
  if (typeof raw !== 'string' || raw.length > MSG_MAX) return; // no binary messages in this protocol
  let m: unknown;
  try { m = JSON.parse(raw); } catch (e) { return; }
  if (!m || typeof m !== 'object' || Array.isArray(m)) return;
  try { handle(ws, m as Rec); }
  catch (e) {
    console.error('message handler threw', e);
    if (s.room) closeRoom(s.room, 'The room crashed. Sorry! Open a new one.');
  }
}

// ---------- messages: everything in m is whatever a stranger typed ----------
type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec | null => v && typeof v === 'object' ? v as Rec : null;
const num = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0;
const UP = freshUp(), UP_KEYS = Object.keys(UP) as UpKey[];
const skin = (v: unknown) => typeof v === 'string' && v.length <= SKIN_MAX && /^[\w-]*$/.test(v) ? v : ''; // ponytail: the skin list lives in the client; an unknown key just draws the default
function input(v: unknown): Input | null {
  const o = rec(v);
  if (!o) return null;
  // o is the sender's horn key; hornOf() turns anything it does not know into the default horn
  return { t: num(o.t, -1, 1), s: num(o.s, -1, 1), b: o.b === true, h: o.h === true, z: o.z === true, g: o.g === true, x: o.x === true,
           o: typeof o.o === 'string' ? o.o.slice(0, SKIN_MAX) : !!o.o && 1 };
}

function enter(ws: WS, room: Room) {
  ws.data.room = room; room.socks.push(ws);
  send(ws, { type: 'room', code: room.code, map: room.map, me: ws.data.id, leader: room.leader });
  send(ws, encodeLevel(room.game.state));
}
function handle(ws: WS, m: Rec) {
  const s = ws.data, room = s.room;
  if (m.type === 'ping') return send(ws, { type: 'pong', t: num(m.t, 0, Number.MAX_SAFE_INTEGER) });
  if (!room) {
    if (m.type === 'host') {
      const map = typeof m.map === 'string' && Object.hasOwn(maps, m.map) ? m.map : null;
      if (!map) return refuse(ws, 'This map cannot be played online yet.');
      if (rooms.size >= MAX_ROOMS) return refuse(ws, 'The server is full. Try again in a bit.');
      let code: string;
      do code = Array.from({ length: 5 }, () => CODE[Math.random() * CODE.length | 0]).join(''); while (rooms.has(code));
      const room: Room = { code, map, game: createGame(maps[map]), socks: [], leader: s.id, born: Date.now(), last: performance.now(), acc: 0, snapIn: 0, fx: [], runAt: 0 };
      room.game.drain(); // the title screen's level event: everyone gets that level as they come in
      rooms.set(code, room);
      timer ??= setInterval(tick, 1000 * DT);
      console.log(`room ${code} opened on ${map}, ${rooms.size} open`);
      enter(ws, room);
    } else if (m.type === 'join') {
      const code = typeof m.code === 'string' ? m.code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5) : '';
      const to = rooms.get(code);
      if (!to) return refuse(ws, `No room called ${code || '?'}.`);
      if (to.socks.length >= ROOM_SOCKS) return refuse(ws, `Room ${code} is full.`);
      enter(ws, to);
    }
    return;
  }
  const game = room.game, g = game.state, leads = room.leader === s.id;
  switch (m.type) {
    case 'in': { // one message carries the input of every robot on that machine, keyed by lid
      const ins = rec(m.in);
      if (ins) for (const r of g.robots) if (r.owner === s.id) { const i = input(ins[r.lid]); if (i) game.setInput(r.id, i); }
      break;
    }
    case 'add': {
      const lid = m.lid;
      if (typeof lid !== 'number' || !Number.isInteger(lid) || lid < 0 || lid >= MAX_PLAYERS) break;
      if (g.robots.length >= MAX_PLAYERS || g.robots.some(r => r.owner === s.id && r.lid === lid)) break;
      game.addRobot({ owner: s.id, lid, n: clean(m.n), skin: skin(m.sk) });
      break;
    }
    case 'skin': game.setSkin(s.id, skin(m.k)); break;
    case 'buy': if (typeof m.k === 'string' && Object.hasOwn(UP, m.k)) game.buy(m.k as UpKey); break; // buy() itself checks the workshop is open and the money is there
    case 'act': // the leader's buttons. Each is refused where the same button does not exist in a local game
      if (!leads) break;
      if (m.a === 'start') { if (g.state !== 'title' || g.robots.length) game.pressStart(); }
      else if (m.a === 'roam') { if (g.robots.length) game.startRoam(); }
      else if (m.a === 'pvp') { if (g.robots.length >= 2 && (g.state === 'title' || g.state === 'over' && !g.campaign)) game.togglePvp(); }
      else if (m.a === 'pause') { if (g.state !== 'title') game.setPaused(true); }
      else if (m.a === 'resume') game.setPaused(false);
      else if (m.a === 'quit') { if (g.state !== 'title') { game.setPaused(false); game.quit(); } }
      break;
    case 'story': {
      if (!leads || g.state !== 'title' || !g.robots.length) break;
      const sv = rec(m.save), svUp = rec(sv?.up) ?? {}, up: Partial<Upgrades> = {};
      for (const k of UP_KEYS) if (Object.hasOwn(svUp, k)) up[k] = int(svUp[k], 0, isStyle(k) ? 1 : 3);
      game.startStory(int(m.ch, 0, 8), sv && { money: int(sv.money, 0, 99999), up }); // client-claimed: the story save lives in the leader's browser
      break;
    }
  }
}
