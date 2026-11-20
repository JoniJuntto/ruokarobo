// Small math helpers shared by the simulation and the client. No DOM, no three.js.
import type { Pt, Rect } from './types';

export const R = 7; // robot radius, px
export const inR = (x: number, y: number, p: Rect) => x >= p[0] && x <= p[0] + p[2] && y >= p[1] && y <= p[1] + p[3];
export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
export const clamp = (v: number, a: number, b: number) => v < a ? a : v > b ? b : v;
export const rnd = (a: number, b: number) => a + Math.random() * (b - a);
export const pick = <T>(a: readonly T[]): T => a[Math.random() * a.length | 0];
// a small seeded PRNG (an LCG): the same numbers in every process. Maps roll their scenery with it, so a server
// and its browsers build the same world
export const seeded = (s: number) => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;

// push a moving circle out of a point obstacle; returns how fast it was going into it
export function pushOut(r: Pt & { vx: number; vy: number }, cx: number, cy: number, minD: number): number {
  let dx = r.x - cx, dy = r.y - cy;
  if (dx >= minD || dx <= -minD || dy >= minD || dy <= -minD) return 0; // minD away on one axis alone: no need for the distance (most calls end here)
  let d = Math.hypot(dx, dy);
  if (d >= minD) return 0;
  if (d < .001) { dx = 0; dy = 1; d = 1; }
  const nx = dx / d, ny = dy / d;
  r.x = cx + nx * minD; r.y = cy + ny * minD;
  const vn = r.vx * nx + r.vy * ny;
  if (vn < 0) { r.vx -= 1.4 * vn * nx; r.vy -= 1.4 * vn * ny; }
  return -vn;
}

// ---- trees, hashed by 128 px cell: a walker asks about the few around it, not every tree in a city ----
// pushTrees() gives exactly what trying every tree in list order gives (pushes are applied in that order, and a body
// shoved further than the cells it looked in cover falls back to the full list), at about 1/200 of the tests in Helsinki.
interface Round { x: number; y: number; r: number }
interface TreeGrid { x0: number; y0: number; cols: number; rows: number; cells: (number[] | undefined)[]; maxR: number }
const TCELL = 128, SLACK = 48, treeGrids = new WeakMap<readonly Round[], TreeGrid>(), _near: number[] = [];
function treeGrid(trees: readonly Round[]): TreeGrid {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, maxR = 0;
  for (const t of trees) { x0 = Math.min(x0, t.x); y0 = Math.min(y0, t.y); x1 = Math.max(x1, t.x); y1 = Math.max(y1, t.y); maxR = Math.max(maxR, t.r); }
  const cols = trees.length ? Math.floor((x1 - x0) / TCELL) + 1 : 0, rows = trees.length ? Math.floor((y1 - y0) / TCELL) + 1 : 0, cells: (number[] | undefined)[] = new Array(cols * rows);
  trees.forEach((t, i) => (cells[Math.floor((t.y - y0) / TCELL) * cols + Math.floor((t.x - x0) / TCELL)] ??= []).push(i));
  const g = { x0, y0, cols, rows, cells, maxR }; treeGrids.set(trees, g); return g;
}
// push o out of every tree it touches. box: only trees within this of o on both axes are tried (as the callers' own
// box tests did). hit: told every tree tried and the impact speed; returning true stops there
export function pushTrees<T extends Round>(o: Pt & { vx: number; vy: number }, trees: readonly T[], rad: number, box = Infinity, hit?: (t: T, v: number) => boolean | void) {
  const g = treeGrids.get(trees) ?? treeGrid(trees), sx = o.x, sy = o.y, reach = Math.min(box, rad + g.maxR) + SLACK;
  const i0 = Math.max(0, Math.floor((sx - reach - g.x0) / TCELL)), i1 = Math.min(g.cols - 1, Math.floor((sx + reach - g.x0) / TCELL));
  const j0 = Math.max(0, Math.floor((sy - reach - g.y0) / TCELL)), j1 = Math.min(g.rows - 1, Math.floor((sy + reach - g.y0) / TCELL));
  let n = 0;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const c = g.cells[j * g.cols + i]; if (c) for (const k of c) _near[n++] = k; }
  for (let a = 1; a < n; a++) { const v = _near[a]; let b = a - 1; for (; b >= 0 && _near[b] > v; b--) _near[b + 1] = _near[b]; _near[b + 1] = v; } // back into list order
  for (let a = 0; a < n; a++) {
    const k = _near[a], t = trees[k];
    if (Math.abs(t.x - o.x) < box && Math.abs(t.y - o.y) < box) { const v = pushOut(o, t.x, t.y, rad + t.r); if (hit?.(t, v)) return; }
    if (Math.abs(o.x - sx) > SLACK || Math.abs(o.y - sy) > SLACK) { // shoved out of the cells looked in: the rest of the list, the long way
      for (let m = k + 1; m < trees.length; m++) { const u = trees[m]; if (Math.abs(u.x - o.x) < box && Math.abs(u.y - o.y) < box) { const v = pushOut(o, u.x, u.y, rad + u.r); if (hit?.(u, v)) return; } }
      return;
    }
  }
}
