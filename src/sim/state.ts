// The game state object and the small helpers every part of the simulation leans on.
import { CHAPTERS, SURF, freshUp, type ChapterDef } from './data';
import type { GameMap } from './map/types';
import type { FxEvent, GameEvent, GameState, Pt, SfxName } from './types';

// a blank game on the title screen with no hazards rolled yet. The simulation and the mirror both start here
export function createState(map: GameMap): GameState {
  return {
    map,
    state: 'title', stateT: 0, level: 1, time: 0, quota: 0, delivered: 0, score: 0, bonus: 0, T: 0,
    darkness: 0, banner: '', bannerT: 0, wind: 0,
    pvp: false, roam: false, paused: false,
    campaign: false, chapter: 0, goalDone: false, goalT: 0, storyStart: null,
    money: 0, up: freshUp(),
    robots: [],
    presents: [], eetu: null, ice: [], holes: [], cars: [], peds: [], kids: [], balls: [], loot: [], thieves: [], plow: null, santa: null,
    boxes: map.BOXES.map(b => ({ ...b, t: 0 })),
    weather: { k: null, t: 0 },
    stats: {}, mark: {}, runT: 0, shiftT0: 0, splits: {}, fullStory: false,
    santaIn: Infinity, weatherIn: Infinity, handT: {}, nextId: 0, inputs: {}, events: [],
  };
}

// the clock every presenter of a state advances, simulating or mirroring
export function tickClock(g: GameState, dt: number) {
  g.T += dt; g.stateT += dt; g.bannerT -= dt;
  g.wind = Math.sin(g.T * .3) * 2.5 * g.level * (g.weather.k === 'blizzard' ? 4 : 1);
}

export const fx = (g: GameState, e: GameEvent) => { g.events.push(e); };
export const sfx = (g: GameState, n: SfxName) => fx(g, { k: 'sfx', n });
export const isFx = (e: GameEvent): e is FxEvent => !['level', 'start', 'stat', 'ach', 'run', 'split', 'clear', 'over', 'storySave', 'storyEnd'].includes(e.k);
export function say(r: { say: string; sayT: number }, text: string, t = 1.6) { r.say = text; r.sayT = t; }
export function pop(g: GameState, r: Pt, text: string, color: string) { fx(g, { k: 'pop', x: r.x, y: r.y, text, color }); }

// Events only ever bump a counter; the client's achievement table decides what unlocks.
// stats is this run's bag; every change is also an event, so lifetime totals can be kept wherever they live
export function bump(g: GameState, k: string, n = 1) { fx(g, { k: 'stat', s: k, n }); return (g.stats[k] = (g.stats[k] || 0) + n); }
export function most(g: GameState, k: string, v: number) { if (v > (g.stats[k] || 0)) { g.stats[k] = v; fx(g, { k: 'stat', s: k, n: v, max: true }); } } // high-water mark
export const since = (g: GameState, k: string) => (g.stats[k] || 0) - (g.mark[k] || 0);

// chapter override, or the endless-shift value when there is none
export const chap = (g: GameState): ChapterDef | null => g.campaign ? CHAPTERS[g.chapter] : null;
export const cv = <K extends keyof ChapterDef>(g: GameState, k: K, v: NonNullable<ChapterDef[K]>): NonNullable<ChapterDef[K]> => chap(g)?.[k] ?? v;
// co-op (endless, 2+ robots): each extra robot means +50% hazards (max 2x) and -20% battery (min 60%). story and pvp keep their own balance
export const coopX = (g: GameState) => g.campaign || g.pvp ? 0 : Math.max(0, g.robots.length - 1);
export const woltN = (g: GameState, n: number) => g.campaign || g.pvp || g.roam || n < 9 ? 0 : 1 + ((n - 9) / 3 | 0); // endless only: one courier from shift 9, one more every 3 shifts
export const hz = (g: GameState, v: number) => Math.round(v * Math.min(2, 1 + coopX(g) * .5)); // hazard count, scaled for co-op

// which way a car or Santa points, as a unit vector: its angle where the map gave it one, else along x.
// Along x it is exactly (±1, 0), so the village's lanes need no trigonometry and lose nothing to rounding
export const unit = (c: { a?: number; dir?: number }): [number, number] => c.a == null ? [c.dir!, 0] : [Math.cos(c.a), Math.sin(c.a)];
export const heading = (c: { a?: number; dir?: number }) => c.a ?? (c.dir! > 0 ? 0 : Math.PI);

export function surface(g: GameState, x: number, y: number, dry?: boolean) {
  if (g.weather.k === 'freeze' && !dry) return 'ice'; // freezing rain glazes everything
  for (const p of g.ice) if (!p.gone && ((x - p.x) / p.rx) ** 2 + ((y - p.y) / p.ry) ** 2 < 1) return 'ice';
  return g.map.ground(x, y);
}
export function surf(g: GameState, x: number, y: number) { // surface feel with upgrades applied
  const up = g.up, s = SURF[surface(g, x, y, up.heat >= 3)]; // heated wheels 3: freezing rain doesn't stick under you
  const grip = up.tires * (s === SURF.ice ? 1.2 : 1.4);
  if (s === SURF.ice) return { ice: true, acc: s.acc + up.tires * 90, kF: s.kF + up.tires * .3, kL: s.kL + grip, max: s.max };
  return { ice: false, acc: s.acc * (1 + .25 * up.motor), kF: s.kF, kL: s.kL + grip, max: s.max * (1 + .2 * up.motor) };
}
