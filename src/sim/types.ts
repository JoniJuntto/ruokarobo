// Plain-data shapes of the simulation. Nothing here knows about rendering: views (meshes, cameras) live in
// the client, keyed by these objects.
import type { GameMap } from './map/types';

export interface Pt { x: number; y: number }
export type Rect = [x: number, y: number, w: number, h: number];
export type Body = Pt & { vx: number; vy: number };

// one controller's state for one tick. o is the horn key of the machine that pressed it (1 = "my default")
export interface Input {
  t: number; s: number; // throttle and steer, -1..1
  b?: boolean; h?: boolean; z?: boolean; g?: boolean; x?: boolean; // boost, handbrake, zap, hook, snowball
  o?: string | number | boolean;
}

export type UpKey = 'tires' | 'motor' | 'susp' | 'battery' | 'turbo' | 'tesla' | 'heat' | 'box' | 'pipo' | 'scarf' | 'fiflag' | 'gold';
export type Upgrades = Record<UpKey, number>;
export type Stats = Record<string, number>;

export interface Cargo { dest: number; o: number; cond: number; t0: number; t: number }
export interface Hole { x: number; y: number; r: number }
export interface IcePatch { x: number; y: number; rx: number; ry: number; gone?: boolean; melt?: number }
export interface Present { x: number; y: number; gone: boolean }
export interface Eetu { x: number; y: number; state: 'ice' | 'carried' | 'home'; say: string; sayT: number; cool: number }
// Where a map keeps the things that travel its streets. Each map uses its own fields and leaves the rest unset.
// Edge (Helsinki): on the street-graph edge n0 → n1, t px along its len, off px right of the centre line.
export interface Edge { n0: number; n1: number; off: number; t: number; len: number }
// Walk: side = which side of the village's road; ni, pi (Helsinki) = the footway node it is walking to, and the one before
export interface Walk { side?: number; ni?: number; pi?: number }
// a car's heading is a (radians) where the map or the mirror sets it, else along x by dir (the village). tx, ty: mirror only
export interface Car extends Partial<Edge> { x: number; y: number; dir?: number; a?: number; base: number; v: number; color: string; fly?: number; tx?: number; ty?: number }
export type PedMode = 'walk' | 'chase' | 'fall' | 'zapped';
export interface Ped {
  x: number; y: number; tx: number; ty: number; side?: number; ni?: number; pi?: number; kind: 'person' | 'dog' | 'wolt'; // side, ni, pi: see Walk
  a: number; vx: number; vy: number; mode: PedMode; t: number; cool: number; kickT: number; say: string; sayT: number;
  color?: string; hat?: string; target?: Robot; zapT: number; moving?: boolean;
}
export interface Kid {
  x: number; y: number; dx: number; dy: number; a: number; cool: number; throwT: number; say: string; sayT: number;
  bum: boolean; coat: string; hat: string; zapT: number;
}
export interface Ball { x: number; y: number; vx: number; vy: number; h0: number; vh: number; age: number; ft: number; o?: number; bot?: boolean; done?: boolean }
export interface Loot { x: number; y: number; got: number; ham?: number }
export interface Thief {
  x: number; y: number; gx: number; gy: number; a: number; vx: number; vy: number; cargo: Cargo | null;
  cd: number; imm: number; say: string; sayT: number; mode?: 'walk' | 'chase'; tx?: number; ty?: number;
  ni?: number; pi?: number; stray?: boolean; // stray: it left its beat to chase or run, and picks a new one when it calms down
}
// gx, gy: the point it is driving to (a mirror has none). wi, dir: where the village's plow is on its fixed route; ni, pi: see Walk
export interface Plow { x: number; y: number; a: number; gx?: number; gy?: number; wi?: number; dir?: number; ni?: number; pi?: number; tx?: number; ty?: number }
// heading as for a car. life (Helsinki): seconds until he lifts off
export interface Santa extends Partial<Edge> { x: number; y: number; dir?: number; a?: number; life?: number }
export interface ItemBox { x: number; y: number; t: number } // t = seconds until it respawns
export interface Weather { k: 'blizzard' | 'freeze' | null; t: number }

export interface Robot {
  id: number; owner: string; lid: number; // owner: who drives it ('H' = this machine in a local game); lid: that owner's nth robot
  i: number; n: string; skin: string; color: string; // i: colour/spawn slot; n: nickname; skin: the owner's chosen skin key
  x: number; y: number; a: number; vx: number; vy: number;
  cargo: Cargo | null;
  hole: Hole | 'avanto' | 'snow' | true | null; // true: a mirrored robot only knows it is in some pothole
  esc: number; immune: number; hitCd: number; stun: number; say: string; sayT: number;
  boost: number; boosting: boolean; boostLock: boolean; zaps: number; zapCd: number; hookCd: number; ballCd: number; hornCd: number;
  hp: number; earn: number;
  tow: number; towT: number; // towed behind robot id `tow` while towT > 0
  dDir: number; dCh: number; dTier: number; mt: number; // drift direction, charge, spark tier; mini-turbo seconds left
  drunk: number; lag: number; lagQ: { T: number; i: Input }[] | null;
  kid: boolean; throwT: number; // pvp snowball kid
  xPrev: boolean; zPrev: boolean; gPrev: boolean; oPrev: boolean;
  overH: Hole | null;
  tx?: number; ty?: number; ta?: number; // mirror only: where the last snapshot put it
}

export type Phase = 'title' | 'play' | 'shop' | 'over' | 'story';
export type SfxName = 'join' | 'crash' | 'kick' | 'escape' | 'hole' | 'pickup' | 'deliver' | 'alarm' | 'splat' | 'clink' | 'zap' | 'honk'
  | 'hook' | 'jingle' | 'bark' | 'spark' | 'boost' | 'clear' | 'over' | 'ach';

// one-shot effects: what the old host forwarded to its guests in every snapshot
export type FxEvent =
  | { k: 'sfx'; n: SfxName }
  | { k: 'horn'; h: string }
  | { k: 'pop'; x: number; y: number; text: string; color: string }
  | { k: 'cust'; i: number }                       // the customer at house i got their order
  | { k: 'burst'; x: number; y: number; n: number } // a puff of snow
  | { k: 'zap'; x1: number; y1: number; x2: number; y2: number }
  | { k: 'wx'; w: 'blizzard' | 'freeze' | 'santa' }
  | { k: 'hole'; h: Hole }                          // a pothole was dug mid-shift (already in state.holes)
  | { k: 'bowl'; i: number }                        // Santa bowled car i over (its fly timer is already set)
  | { k: 'loot'; i: number; o: string; x: number; y: number }; // owner o's robot grabbed loot i
// what else the simulation tells whoever is running it
export type SimEvent =
  | { k: 'level'; n: number }                // hazards were rolled for level n: rebuild their views
  | { k: 'start' }                           // a shift began: every robot is back on its spawn
  | { k: 'stat'; s: string; n: number; max?: true } // counter s went up by n (max: is now at least n), for lifetime totals
  | { k: 'ach'; a: string }                  // unlock achievement a outright
  | { k: 'run' }                             // a new endless run, or a story, began
  | { k: 'split'; c: string; t: number }     // speedrun category c (sim/splits.ts) was reached t ms of play into the run
  | { k: 'clear' }                           // shift cleared, the workshop (or the next story card) is up
  | { k: 'over' }                            // battery dead
  | { k: 'storySave'; ch: number }           // the story reached chapter ch with the money and upgrades now in state
  | { k: 'storyEnd' };                       // credits done: the story save can go
export type GameEvent = FxEvent | SimEvent;

export interface GameState {
  map: GameMap;
  state: Phase; stateT: number; level: number; time: number; quota: number; delivered: number; score: number; bonus: number;
  T: number; // seconds since the game was created, paused time excluded
  darkness: number; banner: string; bannerT: number; wind: number;
  // pvp: one shift, each robot banks its own € (r.earn), most € when the battery dies wins. no quota, no workshop
  pvp: boolean;
  // roam: free roam, a shift with no battery drain and no quota. it never ends; quit from the menu. no score, no leaderboard
  roam: boolean;
  paused: boolean;
  campaign: boolean; chapter: number; goalDone: boolean; goalT: number;
  storyStart: { money: number; up: Upgrades } | null;
  // team money buys robot upgrades between shifts; each upgrade has 3 levels
  money: number; up: Upgrades;
  robots: Robot[];
  presents: Present[]; eetu: Eetu | null; ice: IcePatch[]; holes: Hole[]; cars: Car[]; peds: Ped[]; kids: Kid[]; balls: Ball[];
  loot: Loot[]; thieves: Thief[]; plow: Plow | null; santa: Santa | null; boxes: ItemBox[];
  weather: Weather;
  stats: Stats; // this run's counters, cleared by a new run
  // speedruns (sim/splits.ts): seconds of play this run, what runT was when this shift began, the categories already
  // reached and when, and whether this story began at the prologue with nothing saved
  runT: number; shiftT0: number; splits: Stats; fullStory: boolean;
  mark: Stats;  // counter snapshot taken at the start of the shift, for "clear a shift without X"
  // simulation bookkeeping; a mirror leaves these alone
  santaIn: number; weatherIn: number; handT: Record<string, number>; nextId: number;
  inputs: Record<number, Input>; // robot id → its controller this tick
  events: GameEvent[];           // filled by step() (or by the mirror), drained by whoever presents the game
}
