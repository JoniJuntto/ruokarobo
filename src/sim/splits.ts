// Speedrun categories: milestones of a run, each timed in seconds of play (the clock stands still in the workshop,
// on story cards and while paused). The simulation announces each one once per run as a 'split' event; whoever
// presents the game (a browser, or the server for an online room) puts the time on that category's board.
// ponytail: one board per category, whatever the team size; the row says how many robots. Split by team size if
// co-op times crowd the solo ones out.
import type { GameState } from './types';

export interface SplitDef {
  k: string; n: string;
  hit?: (g: GameState) => boolean;   // endless runs: checked every tick until it is true. The story's are called out where a chapter clears
  min: (robots: number) => number;   // seconds no honest run gets under: the server's sanity floor
}
const ORDER_S = 4; // no order is delivered in under 4 s (server/board.ts counts with the same number)
const quota = (k: number, p: number) => 2 + k + (p - 1) * 2; // startLevel()
const shifts = (n: number, p: number) => { let s = 0; for (let k = 1; k <= n; k++) s += ORDER_S * quota(k, p) / p; return s; };
export const SPLITS: SplitDef[] = [
  { k: 'pick', n: 'First pickup', hit: g => g.robots.some(r => r.cargo), min: () => 1 },
  ...[1, 5, 10, 25, 50, 100].map((n): SplitDef => ({ k: 'del' + n, n: n === 1 ? 'First delivery' : `${n} deliveries`, hit: g => g.stats.del >= n, min: p => ORDER_S * n / p })),
  ...[1, 3, 5, 10, 15].map((n): SplitDef => ({ k: 'shift' + n, n: n === 1 ? 'First shift done' : `${n} shifts done`, hit: g => g.stats.shifts >= n, min: p => shifts(n, p) })),
  // ponytail: 250 € is more than any one order pays with its share of the battery bonus, so this floor is loose
  ...[500, 1000, 2500, 5000].map((n): SplitDef => ({ k: 'eur' + n, n: `Earn ${n} €`, hit: g => g.score >= n, min: p => ORDER_S * Math.ceil(n / 250) / p })),
  { k: 'story', n: 'Story 100 %', min: () => 60 }, // prologue to credits in one sitting, retries and all
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n): SplitDef => ({ k: 'ch' + n, n: `Story chapter ${n}`, min: () => 6 })), // one attempt at the chapter, start to goal
];
export const SPLIT: Record<string, SplitDef> = Object.fromEntries(SPLITS.map(s => [s.k, s]));

export function split(g: GameState, k: string, t: number) {
  if (k in g.splits || !SPLIT[k]) return;
  g.splits[k] = t; g.events.push({ k: 'split', c: k, t: Math.round(t * 1000) });
}
// once a tick: the run clock, and which endless milestones were just reached
export function tickSplits(g: GameState, dt: number) {
  if (g.pvp || g.roam || g.state === 'title') return;
  if (g.state === 'play') g.runT += dt;
  if (!g.campaign) for (const s of SPLITS) if (s.hit && !(s.k in g.splits) && s.hit(g)) split(g, s.k, g.runT);
}
