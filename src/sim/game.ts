// The simulation's front door. createGame() gives you a game on a map; you feed it inputs and call step(dt),
// then drain() what happened. It runs the same in a browser (solo and split-screen) and on a server (online):
// nothing under src/sim touches the DOM, three.js or the network.
import { COLORS } from './data';
import { buy, pressStart, retry, setupLevel, startStory } from './level';
import type { GameMap } from './map/types';
import { updCars, updEetu, updKids, updPeds, updPlow, updSanta, updThieves, updWeather } from './npc';
import { powerUp, robotPairs, updRobot } from './robot';
import { EETU } from './data';
import { split, tickSplits } from './splits';
import { bump, chap, createState, fx, most, say, sfx, since, tickClock } from './state';
import type { GameEvent, GameState, Input, Robot, UpKey, Upgrades } from './types';

export interface AddRobotOpts { owner?: string; lid?: number; id?: number; i?: number; n?: string; skin?: string }
export interface GameOpts { level?: number } // the level whose hazards sit behind the title screen

export interface Game {
  readonly state: GameState;
  readonly map: GameMap;
  step(dt: number): void;                       // advance one tick (a no-op while paused)
  drain(): GameEvent[];                         // everything that happened since the last drain
  setInput(robotId: number, input: Input): void;
  addRobot(opts?: AddRobotOpts): Robot;         // joins with a "Moi!"; callers enforce MAX_PLAYERS
  removeRobot(r: Robot): void;
  pressStart(): void;                           // Start shift / Try again / Start next shift / Continue, by state
  startRoam(): void;                            // from the title: a shift with no battery and no quota
  startStory(ch: number, save?: { money?: number; up?: Partial<Upgrades> } | null): void;
  togglePvp(): void;
  buy(k: UpKey): void;
  setSkin(owner: string, skin: string): void;   // every robot of this owner wears it
  setPaused(paused: boolean): void;
  retry(): void;                                // pause menu: replay the chapter, or the run from shift 1
  quit(): void;                                 // back to the title, fresh level 1 hazards; robots stay
}

// a robot with everything at rest. The mirror builds its robots with this too
export function newRobot(g: GameState, { owner = 'H', lid = 0, id = g.nextId++, i, n = '', skin = '' }: AddRobotOpts): Robot {
  i ??= COLORS.findIndex((_, k) => !g.robots.some(r => r.i === k));
  return { id, owner, lid, i, n, skin, color: COLORS[i], ...g.map.spawn(i), a: 0, vx: 0, vy: 0, cargo: null, hole: null, esc: 0,
           immune: 1, hitCd: 0, stun: 0, say: '', sayT: 0, boost: 1, boosting: false, boostLock: false, zaps: 3, zapCd: 0, hookCd: 0, ballCd: 0, hornCd: 0,
           hp: 1, earn: 0, tow: -1, towT: 0, dDir: 0, dCh: 0, dTier: 0, mt: 0, drunk: 0, lag: 0, lagQ: null, kid: false, throwT: 0,
           xPrev: false, zPrev: false, gPrev: false, oPrev: false, overH: null };
}
// owner 'H' = this machine in a local game; online, a robot is owned by its player's connection
export function addRobot(g: GameState, opts: AddRobotOpts = {}): Robot {
  const r = newRobot(g, opts); g.robots.push(r);
  say(r, 'Moi!'); sfx(g, 'join'); most(g, 'players', g.robots.length);
  return r;
}
export function removeRobot(g: GameState, r: Robot) {
  if (g.eetu && r.cargo?.o === EETU) g.eetu.state = 'ice'; // nobody may leave with Eetu: back to the edge
  g.robots.splice(g.robots.indexOf(r), 1);
  delete g.inputs[r.id];
}

export function step(g: GameState, dt: number) {
  if (g.paused) return;
  tickClock(g, dt);
  if (!g.pvp) g.robots.forEach(r => r.kid = false); // ponytail: kids exist only in pvp; one line here covers every way pvp gets switched off
  g.robots.forEach(r => updRobot(g, r, dt));
  robotPairs(g, dt);
  updCars(g, dt);
  updPeds(g, dt);
  updPlow(g, dt);
  updThieves(g, dt);
  updSanta(g, dt);
  updKids(g, dt);
  if (g.state === 'play') for (const [i, l] of g.loot.entries()) {
    const r = !l.got && g.robots.find(r => !r.hole && Math.hypot(r.x - l.x, r.y - l.y) < 22);
    if (r) { say(r, l.ham ? '🌡️ Kinkkumittari!' : '🎁 Skin case!', 2); l.got = 1; fx(g, { k: 'loot', i, o: r.owner, x: l.x, y: l.y }); }
  }
  if (g.pvp) for (const b of g.boxes) { // item boxes (pvp only) respawn 8 s after someone drives through
    b.t = Math.max(0, b.t - dt);
    const r = g.state === 'play' && !b.t && g.robots.find(r => !r.hole && Math.hypot(r.x - b.x, r.y - b.y) < 20);
    if (r) { b.t = 8; fx(g, { k: 'burst', x: b.x, y: b.y, n: 14 }); powerUp(g, r); }
  }
  updWeather(g, dt);
  updEetu(g, dt);
  tickSplits(g, dt);
  if (g.state === 'play' && !g.roam) {
    if (!g.goalDone) g.time -= dt; // the battery waits while a story moment plays out
    const goal = chap(g)?.goal;
    if (!g.pvp && (goal && goal !== 'collect' ? g.goalDone && g.T - g.goalT > 3 : g.delivered >= g.quota)) {
      g.bonus = Math.ceil(g.time / g.map.timeX); g.money += g.bonus; g.score += g.bonus; g.state = 'shop'; g.stateT = 0;
      sfx(g, 'clear');
      bump(g, 'shifts'); bump(g, 'earn', g.bonus);
      if (!since(g, 'dmg')) bump(g, 'perfShift');
      if (!since(g, 'late')) bump(g, 'cleanShift');
      if (!since(g, 'holeIn')) bump(g, 'noHoleShift');
      if (g.bonus >= 40) bump(g, 'bigBonus');
      if (g.robots.every(r => (r.hp ?? 1) >= 1)) bump(g, 'fullHpShift');
      if (g.money < 10) bump(g, 'poorShop');
      fx(g, { k: 'clear' });
      if (g.campaign) { split(g, 'ch' + g.chapter, g.runT - g.shiftT0); if (g.chapter === 8 && g.fullStory) split(g, 'story', g.runT); }
      if (g.campaign) { fx(g, { k: 'storySave', ch: g.chapter + 1 }); if (g.chapter === 8) { g.chapter = 9; g.state = 'story'; } } // after the last chapter: the ending card, no workshop
    } else if (g.time <= 0) {
      g.time = 0; g.state = 'over'; g.stateT = 0;
      if (!g.campaign && g.pvp) bump(g, 'pvp'); // best run, leaderboard and who won a pvp match are for whoever shows the game: see 'over'
      fx(g, { k: 'over' });
      sfx(g, 'over');
    }
  }
}

export function createGame(map: GameMap, opts: GameOpts = {}): Game {
  const g = createState(map);
  setupLevel(g, opts.level ?? 1);
  return {
    state: g, map,
    step: dt => step(g, dt),
    drain: () => g.events.splice(0),
    setInput: (id, input) => { g.inputs[id] = input; },
    addRobot: opts => addRobot(g, opts),
    removeRobot: r => removeRobot(g, r),
    pressStart: () => pressStart(g),
    startRoam: () => { if (g.state !== 'title') return; g.pvp = false; pressStart(g); g.roam = true; },
    startStory: (ch, save) => startStory(g, ch, save),
    togglePvp: () => { g.pvp = !g.pvp; },
    buy: k => buy(g, k),
    setSkin: (owner, skin) => { for (const r of g.robots) if (r.owner === owner) r.skin = skin; },
    setPaused: paused => { g.paused = paused; },
    retry: () => retry(g),
    quit: () => { g.state = 'title'; setupLevel(g, 1); },
  };
}
