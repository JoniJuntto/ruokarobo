// The wire format between whoever simulates a game and whoever only shows it: a level message when hazards are
// rolled, ~20 snapshots a second after that, and the few things a player sends back. Typed from the messages the
// old PeerJS host and guests exchanged. Online the simulator is the server (server/rooms.ts) and every browser
// shows it (client/net.ts); the room messages at the bottom are what that needs on top.
import { heading } from '../sim/state';
import type { Ball, Cargo, Eetu, FxEvent, GameState, SimEvent, Hole, Input, PedMode, Phase, Present, Pt, UpKey, Upgrades, Weather } from '../sim/types';

export const SNAP_HZ = 20;  // snapshots a simulator sends per second
export const INPUT_HZ = 30; // inputs a player sends per second

export interface LevelMsg {
  type: 'lvl'; n: number; cg: boolean; ch: number;
  pr: Present[]; et?: Eetu['state'];
  ice: { x: number; y: number; rx: number; ry: number; gone?: boolean }[];
  holes: Hole[];
  cars: { x: number; y: number; a: number; base: number; v: number; color: string }[]; // a: heading, radians
  peds: { x: number; y: number; kind: 'person' | 'dog' | 'wolt'; color?: string; hat?: string }[];
  kids: { x: number; y: number; a: number; dx: number; dy: number; coat: string; hat: string; bum: boolean }[];
  loot: { x: number; y: number; got: number; ham?: number }[];
  th: Pt[]; plow: Pt | null; // where the plow starts, if the level has one
}
export interface SnapRobot {
  id: number; i: number; n: string; sk: string; owner: string; x: number; y: number; a: number; vx: number; vy: number; cargo: Cargo | null;
  hole: string | boolean; esc: number; stun: number; say: string; sayT: number;
  bo: number; bl: boolean; bz: boolean; dk: number; zp: number; hp: number; e: number; dr: number; lg: number; kd: boolean; th: number;
  tw: number; // id of the robot towing it, or -1
}
export interface SnapMsg {
  type: 's'; st: Phase; pvp: boolean; roam: boolean; cg: boolean; ch: number; pz: boolean;
  level: number; time: number; quota: number; delivered: number; score: number; bonus: number; money: number; up: Upgrades;
  banner: string; bannerT: number;
  r: SnapRobot[];
  c: [x: number, y: number, a: number][]; // cars in level-message order: whole px and a heading to 2 decimals
  fx: FxEvent[];
  p: { x: number; y: number; a: number; m: PedMode; k: boolean; mv: boolean; s: string; st: number }[];
  tv: { x: number; y: number; a: number; c: number; z: number; m?: 'walk' | 'chase'; s: string; st: number }[];
  kd: { a: number; th: number; s: string; st: number; z: boolean }[];
  b: Ball[]; wx: Weather;
  pl: { x: number; y: number; a: number } | null; sa: { x: number; y: number; a: number } | null; // sa: Santa, rounded like a car
  ig: string; pg: string; bxs: string; // one '0'/'1' per ice patch gone, present gone, item box taken
  et: { s: Eetu['state']; say: string; sayT: number } | null;
}
export type ServerMsg = LevelMsg | SnapMsg | { type: 'pong'; t: number };

// lid: the sender's nth robot. One 'in' message carries the input of every robot on that machine
export interface AddMsg { type: 'add'; lid: number; n: string; sk: string }
export interface InputMsg { type: 'in'; in: Record<number, Input> }
export interface BuyMsg { type: 'buy'; k: UpKey }
export interface SkinMsg { type: 'skin'; k: string }
export type ClientMsg = AddMsg | InputMsg | BuyMsg | SkinMsg | { type: 'ping'; t: number };

export function encodeLevel(g: GameState): LevelMsg {
  return { type: 'lvl', n: g.level, cg: g.campaign, ch: g.chapter, pr: g.presents.map(({ x, y, gone }) => ({ x, y, gone })), et: g.eetu?.state,
           ice: g.ice.map(({ x, y, rx, ry, gone }) => ({ x, y, rx, ry, gone })), holes: g.holes,
           cars: g.cars.map(c => ({ x: c.x, y: c.y, a: heading(c), base: c.base, v: c.v, color: c.color })),
           peds: g.peds.map(({ x, y, kind, color, hat }) => ({ x, y, kind, color, hat })),
           kids: g.kids.map(({ x, y, a, dx, dy, coat, hat, bum }) => ({ x, y, a, dx, dy, coat, hat, bum })),
           loot: g.loot.map(({ x, y, got, ham }) => ({ x, y, got, ham })), th: g.thieves.map(({ x, y }) => ({ x, y })), plow: g.plow && { x: g.plow.x, y: g.plow.y } };
}
const r2 = (v: number) => Math.round(v * 100) / 100;
// fx: the one-shot effects since the last snapshot (the FxEvents among what the game drained)
export function encodeSnap(g: GameState, fx: FxEvent[]): SnapMsg {
  return { type: 's', st: g.state, pvp: g.pvp, roam: g.roam, cg: g.campaign, ch: g.chapter, pz: g.paused, level: g.level, time: g.time, quota: g.quota,
    delivered: g.delivered, score: g.score, bonus: g.bonus, money: g.money, up: g.up, banner: g.banner, bannerT: g.bannerT,
    r: g.robots.map(r => ({ id: r.id, i: r.i, n: r.n, sk: r.skin, owner: r.owner, x: r.x, y: r.y, a: r.a, vx: r.vx, vy: r.vy, cargo: r.cargo,
                            hole: typeof r.hole === 'string' ? r.hole : !!r.hole, esc: r.esc, stun: r.stun, say: r.say, sayT: r.sayT, bo: r.boost, bl: r.boostLock, bz: r.boosting, dk: r.dTier, zp: r.zaps, hp: r.hp, e: r.earn, dr: r.drunk, lg: r.lag, kd: !!r.kid, th: r.throwT, tw: r.towT > 0 ? r.tow : -1 })),
    c: g.cars.map(c => [Math.round(c.x), Math.round(c.y), r2(heading(c))]), fx,
    p: g.peds.map(p => ({ x: p.x, y: p.y, a: p.a, m: p.mode, k: p.kickT > 0, mv: !!p.moving, s: p.say, st: p.sayT })),
    tv: g.thieves.map(t => ({ x: t.x, y: t.y, a: t.a, c: t.cargo ? 1 : 0, z: t.cd > 0 ? 1 : 0, m: t.mode, s: t.say, st: t.sayT })),
    kd: g.kids.map(k => ({ a: k.a, th: k.throwT, s: k.say, st: k.sayT, z: k.zapT > 0 })), b: g.balls, wx: g.weather,
    pl: g.plow && { x: g.plow.x, y: g.plow.y, a: g.plow.a }, sa: g.santa && { x: Math.round(g.santa.x), y: Math.round(g.santa.y), a: r2(heading(g.santa)) }, ig: g.ice.map(p => p.gone ? 1 : 0).join(''), pg: g.presents.map(p => p.gone ? 1 : 0).join(''),
    bxs: g.boxes.map(b => b.t ? 1 : 0).join(''), et: g.eetu && { s: g.eetu.state, say: g.eetu.say, sayT: g.eetu.sayT } };
}

// ---------- rooms: server/ ⇄ client/net.ts over one WebSocket ----------
// A socket first sends host or join and gets room (or err) back; after that the messages above flow.
// The leader (whoever opened the room; the longest-connected player if they leave) is the only one whose
// act and story messages count. Anyone may buy, as guests always could.
export interface HostMsg { type: 'host'; map: string }   // a key of maps in sim/map/index.ts
export interface JoinMsg { type: 'join'; code: string }
export interface ActMsg { type: 'act'; a: 'start' | 'roam' | 'pvp' | 'pause' | 'resume' | 'retry' | 'quit' } // start = Game.pressStart
export interface StoryMsg { type: 'story'; ch: number; save?: { money?: number; up?: Partial<Upgrades> } | null }
export type RoomClientMsg = ClientMsg | HostMsg | JoinMsg | ActMsg | StoryMsg;

export interface RoomMsg { type: 'room'; code: string; map: string; me: string; leader: string } // me: this socket's Robot.owner
export interface LeaderMsg { type: 'leader'; leader: string }
export interface ErrMsg { type: 'err'; m: string }       // shown to the player as is; the server closes the socket after it
// the lifecycle SimEvents a mirror cannot work out for itself (start, run, clear, over, storySave, storyEnd, ach);
// never the per-tick stat events
export interface EvMsg { type: 'ev'; e: SimEvent[] }
export type RoomServerMsg = ServerMsg | RoomMsg | LeaderMsg | ErrMsg | EvMsg;
