// Central Helsinki, baked from OpenStreetMap into helsinki.data.js (tools/bake_helsinki.py; map data © OpenStreetMap
// contributors, ODbL): 16 px per metre, x east, y south, the Central Station in the middle.
// Where the village has one road and a handful of rectangles, the city has a surface raster (one cell per metre),
// building walls to collide with, and three street graphs: for cars, for people on foot, and for the robots' GPS.
// No DOM here: the raster is filled in plain TypeScript, so a server builds the same city as a browser.
import { SANTA_V } from '../data';
import type { Car, Edge, Pt, Santa, Walk } from '../types';
import { clamp, dist, pick, pushOut, rnd, seeded } from '../util';
import { HKI as MAP } from './helsinki.data';
import type { Box, GameMap, House, Shop, Tree } from './types';

// nx, ny: the outward normal of the wall the door is in
export interface HelsinkiShop extends Shop { addr: string; nx: number; ny: number }
export interface HelsinkiHouse extends House { no: string; addr: string; nx: number; ny: number }
export interface HelsinkiMap extends GameMap { SHOPS: HelsinkiShop[]; HOUSES: HelsinkiHouse[] }

const W = MAP.W, H = MAP.H;
export const PPM = MAP.ppm;
const pts = (a: number[], from = 0) => { const o: Pt[] = []; for (let i = from; i + 1 < a.length; i += 2) o.push({ x: a[i], y: a[i + 1] }); return o; };

export const ZONE = 260 * PPM; // hazards, pedestrians and traffic gather within this of a shop: where the deliveries are
const BLOCKS = MAP.shops.length; // per-level hazard counts were "per block, one shop each": now per shop
const SHOP_LOOK: Record<string, [name: string, color: string]> = { Alepa: ['ALEPA', '#f28c00'], 'S-market': ['S-MARKET', '#d7261e'] };
const SHOPS: HelsinkiShop[] = MAP.shops.map(([brand, street, no, x, y, nx, ny], k) => ({ name: SHOP_LOOK[brand][0], color: SHOP_LOOK[brand][1],
  tag: String.fromCharCode(65 + k), addr: `${street} ${no}`, door: { x, y }, nx, ny }));
const nearShop = (p: Pt) => SHOPS.reduce((a, b) => dist(p, a.door) <= dist(p, b.door) ? a : b);
const HOUSES: HelsinkiHouse[] = MAP.houses.map(([street, no, x, y, nx, ny], i) => ({ door: { x, y }, nx, ny, no, addr: `${street} ${no}`, n: i + 1 }));
const KIDS_HOME = MAP.kidsHome; // campaign: the kids' house on the shore, paper star in the window
const AVANTO = { x: MAP.avanto[0], y: MAP.avanto[1], r: 20 }; // ice-swimming hole out on the frozen bay, by the sauna pier
const SAUNA = { x: AVANTO.x + 75, y: AVANTO.y - 25, w: 70, h: 50 };
export const STATUE = { x: MAP.statue[0] - 20, y: MAP.statue[1] - 20, w: 40, h: 40 }; // Olli Lindholm in bronze, Kaisaniemi park
const SOLIDS: Box[] = [SAUNA, STATUE]; // rectangles; the city's buildings collide through their walls (wallPush)
const DOORS = [...SHOPS.map(b => b.door), ...HOUSES.map(h => h.door)];

// ---------- surface raster, one cell per metre ----------
export const CELL = PPM, GW = Math.ceil(W / CELL), GH = Math.ceil(H / CELL);
export const G_SNOW = 0, G_PATH = 1, G_ROAD = 2, G_ICE = 3, G_WALL = 4;
export const grid = new Uint8Array(GW * GH);
export const cellAt = (x: number, y: number) => grid[clamp(y / CELL | 0, 0, GH - 1) * GW + clamp(x / CELL | 0, 0, GW - 1)];
const TRAMS = MAP.rails.filter(r => r[0] === 1).map(r => [104, 0, ...r.slice(1)]); // tram tracks are paved like a road
export const ROADS = [...MAP.roads, ...TRAMS];
// ponytail: the old page drew these shapes on a 2D canvas and read the pixels back, which called a cell covered from
// about 39 % ink (23 % for the shore line). A canvas cannot run on a server, and its antialiasing is each browser's own,
// so here a cell is covered when its centre is inside the shape or within `pad` of its edge: the same on every machine.
// Against Chrome's canvas that moves 0.5 % of the cells, all but a few along an edge (one metre). Supersample if an
// edge ever has to match a drawing exactly.
const AA = .1 * CELL;
// a polyline `w` px wide with round joins and ends: every cell whose centre is within w / 2 + pad of a segment
function stroke(out: Uint8Array, v: number, a: number[], from: number, w: number, pad = AA, close = false) {
  const r = w / 2 + pad, r2 = r * r, n = (a.length - from) >> 1;
  for (let k = 0; k < (close ? n : n - 1); k++) {
    const x0 = a[from + k * 2], y0 = a[from + k * 2 + 1], q = from + ((k + 1) % n) * 2, x1 = a[q], y1 = a[q + 1];
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
    const i0 = Math.max(0, Math.ceil((Math.min(x0, x1) - r) / CELL - .5)), i1 = Math.min(GW - 1, Math.floor((Math.max(x0, x1) + r) / CELL - .5));
    const j0 = Math.max(0, Math.ceil((Math.min(y0, y1) - r) / CELL - .5)), j1 = Math.min(GH - 1, Math.floor((Math.max(y0, y1) + r) / CELL - .5));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = (i + .5) * CELL - x0, py = (j + .5) * CELL - y0, u = clamp((px * dx + py * dy) / L2, 0, 1), ex = px - u * dx, ey = py - u * dy;
      if (ex * ex + ey * ey <= r2) out[j * GW + i] = v;
    }
  }
}
// a closed polygon, filled by the nonzero winding rule as a canvas does
function fill(out: Uint8Array, v: number, a: number[], from = 0) {
  const n = (a.length - from) >> 1;
  if (n < 3) return;
  let ymin = Infinity, ymax = -Infinity;
  for (let k = 0; k < n; k++) { const y = a[from + k * 2 + 1]; if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
  const xs: [x: number, wind: number][] = [];
  for (let j = Math.max(0, Math.ceil(ymin / CELL - .5)); j <= Math.min(GH - 1, Math.floor(ymax / CELL - .5)); j++) {
    const y = (j + .5) * CELL; xs.length = 0;
    for (let k = 0; k < n; k++) {
      const p = from + k * 2, q = from + ((k + 1) % n) * 2, y0 = a[p + 1], y1 = a[q + 1];
      if ((y0 <= y) !== (y1 <= y)) xs.push([a[p] + (a[q] - a[p]) * (y - y0) / (y1 - y0), y1 > y0 ? 1 : -1]);
    }
    xs.sort((s, t) => s[0] - t[0]);
    for (let k = 0, wind = 0; k + 1 < xs.length; k++) {
      if (!(wind += xs[k][1])) continue;
      for (let i = Math.max(0, Math.ceil(xs[k][0] / CELL - .5)), e = Math.min(GW - 1, Math.ceil(xs[k + 1][0] / CELL - .5) - 1); i <= e; i++) out[j * GW + i] = v;
    }
  }
  stroke(out, v, a, from, 0, AA, true);
}
{
  // later shapes paint over earlier ones: snow, then sidewalks and squares, streets, water, buildings
  for (const r of ROADS) stroke(grid, G_PATH, r, 2, r[0] + 5 * PPM); // a sidewalk along every street, mapped or not
  for (const w of MAP.walks) stroke(grid, G_PATH, w, 1, w[0]);
  for (const a of MAP.areas) fill(grid, G_PATH, a);
  for (const a of MAP.piers) fill(grid, G_PATH, a);
  for (const r of ROADS) stroke(grid, G_ROAD, r, 2, r[0]);
  for (const a of MAP.water) fill(grid, G_ICE, a);
  for (const b of MAP.buildings) fill(grid, G_WALL, b, 1);
  // the sea: OSM draws only its shore, so flood the snow on the water side of each coastline, walled in by the coast itself
  const wall = new Uint8Array(GW * GH), stack: number[] = [];
  for (const a of MAP.coast) stroke(wall, 1, a, 0, 2.5 * CELL, .265 * CELL);
  for (const s of pts(MAP.seaSeeds)) {
    const i0 = (s.y / CELL | 0) * GW + (s.x / CELL | 0);
    if (grid[i0] !== G_SNOW || wall[i0]) continue;
    const filled: number[] = []; stack.push(i0); grid[i0] = G_ICE;
    while (stack.length) {
      const i = stack.pop()!; filled.push(i);
      const x = i % GW;
      for (const j of [x > 0 ? i - 1 : -1, x < GW - 1 ? i + 1 : -1, i - GW, i + GW])
        if (j >= 0 && j < grid.length && grid[j] === G_SNOW && !wall[j]) { grid[j] = G_ICE; stack.push(j); }
    }
    if (filled.length > grid.length * .3) { stack.length = 0; for (const i of filled) grid[i] = G_SNOW; } // leaked onto land: a seed on the wrong side
  }
  for (let i = 0; i < GW * GH; i++) if (grid[i] === G_SNOW && wall[i]) { // the shore line itself: ice if it touches ice
    const x = i % GW; if ((x > 0 && grid[i - 1] === G_ICE) || (x < GW - 1 && grid[i + 1] === G_ICE)) grid[i] = G_ICE;
  }
}
const nearKind = (x: number, y: number, rad: number, kind: number) => { // is any cell of this kind within rad px (a square around the point)?
  const n = Math.ceil(rad / CELL);
  for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) if (cellAt(x + i * CELL, y + j * CELL) === kind) return true;
  return false;
};
export const inLake = (x: number, y: number, m = 0) => m ? nearKind(x, y, m, G_ICE) : cellAt(x, y) === G_ICE;

// ---------- building walls, hashed by 8 m cell; each wall is listed in every cell within 32 px of it, so one lookup is enough ----------
type Wall = [x0: number, y0: number, x1: number, y1: number, building: number];
const WH = 128, wallHash = new Map<number, Wall[]>();
export const BPOLY = MAP.buildings.map(b => pts(b, 1));
BPOLY.forEach((ps, bi) => ps.forEach((p, k) => {
  const q = ps[(k + 1) % ps.length], s: Wall = [p.x, p.y, q.x, q.y, bi];
  for (let i = Math.floor((Math.min(p.x, q.x) - 32) / WH); i <= Math.floor((Math.max(p.x, q.x) + 32) / WH); i++)
    for (let j = Math.floor((Math.min(p.y, q.y) - 32) / WH); j <= Math.floor((Math.max(p.y, q.y) + 32) / WH); j++) {
      const key = i * 4096 + j; (wallHash.get(key) ?? wallHash.set(key, []).get(key)!).push(s);
    }
}));
export function segPoint(x: number, y: number, s: ArrayLike<number>): [number, number] { // closest point on segment s to (x, y)
  const dx = s[2] - s[0], dy = s[3] - s[1], u = clamp(((x - s[0]) * dx + (y - s[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return [s[0] + u * dx, s[1] + u * dy];
}
function inPoly(x: number, y: number, ps: Pt[]) {
  let c = false;
  for (let i = 0, j = ps.length - 1; i < ps.length; j = i++)
    if ((ps[i].y > y) !== (ps[j].y > y) && x < (ps[j].x - ps[i].x) * (y - ps[i].y) / (ps[j].y - ps[i].y) + ps[i].x) c = !c;
  return c;
}
// shove o out of every building wall within rad; returns the hardest impact (pushOut's "speed into the wall")
function wallPush(o: Pt & { vx: number; vy: number }, rad: number) {
  const list = wallHash.get(Math.floor(o.x / WH) * 4096 + Math.floor(o.y / WH));
  if (!list) return 0;
  if (cellAt(o.x, o.y) === G_WALL && list.some(s => inPoly(o.x, o.y, BPOLY[s[4]]))) { // got inside (spawned, flung by a car): out the nearest wall
    let best = Infinity, bx = 0, by = 0;
    for (const s of list) { const [cx, cy] = segPoint(o.x, o.y, s), d = Math.hypot(cx - o.x, cy - o.y); if (d < best) { best = d; bx = cx; by = cy; } }
    const d = best || 1; o.x = bx + (bx - o.x) / d * (rad + 1); o.y = by + (by - o.y) / d * (rad + 1);
  }
  let hit = 0;
  for (const s of list) { const [cx, cy] = segPoint(o.x, o.y, s); hit = Math.max(hit, pushOut(o, cx, cy, rad)); }
  return hit;
}
const insideSolid = (x: number, y: number) => nearKind(x, y, 10, G_WALL) || SOLIDS.some(b => x > b.x - 10 && x < b.x + b.w + 10 && y > b.y - 10 && y < b.y + b.h + 10);

// ---------- street networks. OSM ways share their junction nodes, and the bake rounds every node to whole px, so equal coords = same node ----------
interface Graph<E> { nodes: Pt[]; adj: E[][]; nid(x: number, y: number): number; hash: Map<number, number[]> }
function graph<E>(): Graph<E> {
  const id = new Map<number, number>(), nodes: Pt[] = [], adj: E[][] = [], hash = new Map<number, number[]>();
  const nid = (x: number, y: number) => {
    const k = x * 65536 + y; let i = id.get(k);
    if (i === undefined) {
      id.set(k, i = nodes.length); nodes.push({ x, y }); adj.push([]);
      const hk = (x >> 8) * 4096 + (y >> 8); (hash.get(hk) ?? hash.set(hk, []).get(hk)!).push(i);
    }
    return i;
  };
  return { nodes, adj, nid, hash };
}
const onMap = (x: number, y: number) => x > 0 && y > 0 && x < W && y < H;
function nearNode(g: Graph<unknown>, x: number, y: number, maxR = 6) { // nearest node, searching 256 px rings outwards
  let best = -1, bd = Infinity;
  const cx = x >> 8, cy = y >> 8;
  for (let r = 0; r <= maxR; r++) {
    for (let i = cx - r; i <= cx + r; i++) for (let j = cy - r; j <= cy + r; j++) {
      if (Math.max(Math.abs(i - cx), Math.abs(j - cy)) !== r) continue;
      for (const n of g.hash.get(i * 4096 + j) ?? []) { const d = Math.hypot(g.nodes[n].x - x, g.nodes[n].y - y); if (d < bd) { bd = d; best = n; } }
    }
    if (best >= 0 && bd < r * 256) break;
  }
  return best;
}
interface Lane { to: number; off: number; w: number } // a way out of a junction: the node it leads to, its lane's offset, the street's width
const CG = graph<Lane>(); // cars: drivable streets, one way where OSM says so; an edge knows its lane offset
for (const r of MAP.roads) {
  if (!(r[1] & 1)) continue;
  const one = r[1] & 2, back = r[1] & 4, off = one ? 0 : r[0] / 4;
  for (let i = 2; i + 3 < r.length; i += 2) {
    if (!onMap(r[i], r[i + 1]) || !onMap(r[i + 2], r[i + 3])) continue;
    const a = CG.nid(r[i], r[i + 1]), b = CG.nid(r[i + 2], r[i + 3]);
    if (!back) CG.adj[a].push({ to: b, off, w: r[0] });
    if (!one || back) CG.adj[b].push({ to: a, off, w: r[0] });
  }
}
const WG = graph<number>(), RG = graph<number>(); // WG: sidewalks and paths, for people on foot. RG: everything, for robots' GPS route
const link = (g: Graph<number>, a: number[], from: number) => { for (let i = from; i + 3 < a.length; i += 2) { const p = g.nid(a[i], a[i + 1]), q = g.nid(a[i + 2], a[i + 3]); if (p !== q) { g.adj[p].push(q); g.adj[q].push(p); } } };
for (const w of MAP.walks) { link(WG, w, 1); link(RG, w, 1); }
for (const r of ROADS) link(RG, r, 2);
{ // GPS snaps only to the biggest connected network: dropping tunnels and passages through buildings leaves little islands
  const comp = new Int32Array(RG.nodes.length).fill(-1), size: number[] = [];
  for (let s = 0; s < comp.length; s++) {
    if (comp[s] >= 0) continue;
    const c = size.length, st = [s]; comp[s] = c; size.push(0);
    while (st.length) { const u = st.pop()!; size[c]++; for (const v of RG.adj[u]) if (comp[v] < 0) { comp[v] = c; st.push(v); } }
  }
  const main = size.indexOf(Math.max(...size));
  for (const [k, list] of RG.hash) RG.hash.set(k, list.filter(n => comp[n] === main));
}
// A* from a to b over the streets and footways; a list of points to drive through, ending at b
export function route(a: Pt, b: Pt): Pt[] {
  const g = RG, s = nearNode(g, a.x, a.y), t = nearNode(g, b.x, b.y);
  if (s < 0 || t < 0) return [b];
  const N = g.nodes.length, cost = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), T = g.nodes[t];
  const hq: [number, number][] = [], push = (f: number, n: number) => { hq.push([f, n]); let i = hq.length - 1; while (i) { const p = (i - 1) >> 1; if (hq[p][0] <= hq[i][0]) break; [hq[p], hq[i]] = [hq[i], hq[p]]; i = p; } };
  const pop = () => { const top = hq[0], last = hq.pop()!; if (hq.length) { hq[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < hq.length && hq[l][0] < hq[m][0]) m = l; if (r < hq.length && hq[r][0] < hq[m][0]) m = r; if (m === i) break; [hq[m], hq[i]] = [hq[i], hq[m]]; i = m; } } return top; };
  cost[s] = 0; push(0, s);
  while (hq.length) {
    const [f, u] = pop();
    if (u === t) break;
    const U = g.nodes[u];
    if (f > cost[u] + Math.hypot(U.x - T.x, U.y - T.y) + 1e-6) continue;
    for (const v of g.adj[u]) {
      const V = g.nodes[v], c = cost[u] + Math.hypot(V.x - U.x, V.y - U.y);
      if (c < cost[v]) { cost[v] = c; prev[v] = u; push(c + Math.hypot(V.x - T.x, V.y - T.y), v); }
    }
  }
  if (prev[t] < 0 && s !== t) return [b];
  const out = [b]; for (let n = t; n >= 0; n = prev[n]) out.push(g.nodes[n]);
  return out.reverse();
}
// a random point near a shop (or near `c`) whose surface is one of `kinds`, away from doors
export function zonePoint(kinds: number[], c: Pt = pick(SHOPS).door, rad = ZONE, doorGap = 80, rng = Math.random): Pt {
  for (let i = 0; i < 400; i++) {
    const a = rng() * 7, d = Math.sqrt(rng()) * rad, x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d;
    if (onMap(x, y) && kinds.includes(cellAt(x, y)) && !DOORS.some(q => Math.hypot(q.x - x, q.y - y) < doorGap)) return { x, y };
  }
  return { x: c.x, y: c.y };
}
const _zone = new Map<string, number[]>();
function pathPoint(c: Pt = pick(SHOPS).door, rad = ZONE): Pt & { ni: number; pi: number } { // a sidewalk node near a shop: where people walk
  const k = `${c.x},${c.y},${rad}`;
  const list = _zone.get(k) ?? _zone.set(k, WG.nodes.flatMap((n, i) => WG.adj[i].length && Math.hypot(n.x - c.x, n.y - c.y) < rad ? [i] : [])).get(k)!;
  const i = list.length ? pick(list) : nearNode(WG, c.x, c.y);
  return { x: WG.nodes[i].x, y: WG.nodes[i].y, ni: i, pi: -1 };
}
// next sidewalk node for someone walking: onwards, not back where they came from unless it's a dead end.
// ni = -1 (or a node it has strayed 40 px from): start again from the nearest node
function wander(p: Pt & Walk): Pt {
  const ni = p.ni ?? -1, pi = p.pi ?? -1, n0 = ni >= 0 ? WG.nodes[ni] : null;
  if (!n0 || Math.hypot(n0.x - p.x, n0.y - p.y) > 40) { p.ni = nearNode(WG, p.x, p.y); p.pi = -1; }
  else { const nb = WG.adj[ni].filter(n => n !== pi), nx = nb.length ? pick(nb) : pi >= 0 ? pi : ni; p.pi = ni; p.ni = nx; }
  return WG.nodes[p.ni] ?? p;
}
export const CROSS = pts(MAP.crossings).filter(c => cellAt(c.x, c.y) === G_ROAD); // zebra crossings: drivers stop for robots
// for whoever paints them: each crossing that sits on a node of the street it crosses, with that street's direction and width
export const zebras = () => CROSS.flatMap(c => {
  const n = nearNode(CG, c.x, c.y, 1), e = CG.adj[n]?.[0];
  if (!e || Math.hypot(CG.nodes[n].x - c.x, CG.nodes[n].y - c.y) > 2) return [];
  const to = CG.nodes[e.to], L = Math.hypot(to.x - c.x, to.y - c.y) || 1;
  return [{ x: c.x, y: c.y, ux: (to.x - c.x) / L, uy: (to.y - c.y) / L, w: e.w }];
});
// item boxes (pvp): five on the streets around each shop, the same spots on every client
const BOXES = (() => {
  const rng = seeded(7), out: Pt[] = [];
  for (const s of SHOPS) for (let k = 0, tries = 0; k < 5 && tries < 500; tries++) {
    const a = rng() * 7, d = (40 + rng() * 120) * PPM, x = s.door.x + Math.cos(a) * d, y = s.door.y + Math.sin(a) * d;
    if (onMap(x, y) && cellAt(x, y) === G_ROAD && !out.some(b => Math.hypot(b.x - x, b.y - y) < 40 * PPM)) { out.push({ x, y }); k++; }
  }
  return out;
})();
// robots start on the sidewalk outside the shop by the station: the first sidewalk cells, ring by ring, 40 px apart
export const SPAWNS = (() => {
  const d = SHOPS[0].door, out: Pt[] = [];
  for (let r = 0; out.length < 8 && r < 60; r++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
    if (Math.max(Math.abs(i), Math.abs(j)) !== r || out.length >= 8) continue;
    const x = d.x + i * 20 + 10, y = d.y + j * 20 + 10;
    if (cellAt(x, y) === G_PATH && !nearKind(x, y, 24, G_WALL) && !nearKind(x, y, 8, G_ROAD) && out.every(p => Math.hypot(p.x - x, p.y - y) >= 40)) out.push({ x, y });
  }
  return out;
})();
const LAMPS = pts(MAP.lamps).filter(l => cellAt(l.x, l.y) !== G_WALL);

const trees: Tree[] = [{ x: STATUE.x - 60, y: STATUE.y + 20, r: 5, kind: 'flag' }];
export function freeAt(x: number, y: number, m: number) {
  if (x < m || y < m || x > W - m || y > H - m || cellAt(x, y) !== G_SNOW) return false;
  for (const k of [G_PATH, G_ROAD, G_WALL, G_ICE]) if (nearKind(x, y, m, k)) return false;
  for (const b of SOLIDS) if (x > b.x - m && x < b.x + b.w + m && y > b.y - m && y < b.y + b.h + m) return false;
  if (DOORS.some(d => Math.hypot(d.x - x, d.y - y) < 70)) return false;
  return !trees.some(t => Math.hypot(t.x - x, t.y - y) < m * 2);
}
{ // the city's own street and park trees, thinned to one per TREE_GAP, a spruce where there's room, plus four snowmen.
  // Rolled with a seeded PRNG: trees are obstacles, so the server and every browser must grow the same ones.
  // ponytail: the old page thinned to 16 m on phones (10 m elsewhere) so phones kept up. One world means one spacing, and
  // this is the desktop's; if phones need the relief back, raise this for everyone or draw far trees cheaper, not fewer.
  const TREE_GAP = 10 * PPM, rng = seeded(1952);
  for (const t of pts(MAP.trees)) {
    const c = cellAt(t.x, t.y);
    if (c === G_WALL || c === G_ROAD || c === G_ICE || Math.hypot(t.x - STATUE.x, t.y - STATUE.y) < 120 || trees.some(q => Math.abs(q.x - t.x) < TREE_GAP && Math.hypot(q.x - t.x, q.y - t.y) < TREE_GAP)) continue;
    const spruce = c === G_SNOW && !nearKind(t.x, t.y, 40, G_PATH) && !nearKind(t.x, t.y, 40, G_ROAD) && !nearKind(t.x, t.y, 40, G_WALL) && rng() < .5;
    trees.push({ ...t, kind: spruce ? 'spruce' : 'birch', r: spruce ? 15 : 10 });
  }
  for (let n = 0, tries = 0; n < 4 && tries < 4000; tries++) {
    const p = zonePoint([G_SNOW], STATUE, 120 * PPM, 120, rng);
    if (freeAt(p.x, p.y, 24)) { trees.push({ ...p, kind: 'snowman', r: 13 }); n++; }
  }
}

// ---------- cars (and Santa) ride the street graph ----------
type OnEdge = Pt & Partial<Edge> & { a?: number };
function carAt(c: OnEdge, n0: number, e: Lane) { // put car c on the street edge n0 → e.to, at the start
  Object.assign(c, { n0, n1: e.to, off: e.off, t: 0 }); carPlace(c);
}
function carPlace(c: OnEdge) { // position and heading from where it is along its edge; it keeps to the right of the centre line
  const A = CG.nodes[c.n0!], B = CG.nodes[c.n1!], dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
  c.len = L; c.a = Math.atan2(dy, dx);
  c.x = A.x + dx * c.t! / L - dy / L * c.off!; c.y = A.y + dy * c.t! / L + dx / L * c.off!;
}
function carStart<T extends object>(c: T, near: Pt = pick(SHOPS).door, rad = ZONE): (T & Pt) | null { // a random street edge near a shop
  for (let i = 0; i < 200; i++) {
    const p = zonePoint([G_ROAD], near, rad, 0), u = nearNode(CG, p.x, p.y);
    if (u >= 0 && CG.adj[u].length) { carAt(c as T & OnEdge, u, pick(CG.adj[u])); return c as T & Pt; }
  }
  return null;
}
function nextEdge(c: OnEdge, straight?: boolean) { // at a junction: any way on (the straightest for Santa), not back unless it's a dead end
  const outs = CG.adj[c.n1!], fwd = outs.filter(e => e.to !== c.n0), opts = fwd.length ? fwd : outs;
  if (!opts.length) return false;
  const turn = (e: Lane) => { const B = CG.nodes[c.n1!], C = CG.nodes[e.to], d = Math.atan2(C.y - B.y, C.x - B.x) - c.a!; return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))); };
  carAt(c, c.n1!, straight ? opts.reduce((a, b) => turn(a) <= turn(b) ? a : b) : pick(opts));
  return true;
}

// average order round trip (shop → door → nearest shop). Real Helsinki streets are ~4.7x longer than the village's 1485 px,
// so shifts get that much more battery and the leftover-battery bonus is paid in village seconds: same difficulty, same economy
const NEAR = 350 * PPM; // orders go to doors a few streets away, never across the whole city
const _dests = new Map<Shop, number[]>();
const dests = (shop: Shop) => _dests.get(shop) ?? _dests.set(shop, HOUSES.flatMap((h, i) => dist(h.door, shop.door) < NEAR ? [i] : [])).get(shop)!;
export const TRIP = (a => a.reduce((x, y) => x + y) / a.length)(SHOPS.flatMap(b => dests(b).map(i => dist(b.door, HOUSES[i].door) + dist(HOUSES[i].door, nearShop(HOUSES[i].door).door))));

export const helsinki: HelsinkiMap = {
  id: 'helsinki',
  W, H, BLOCKS, timeX: Math.max(1, TRIP / 1485), SHOPS, HOUSES, DOORS, SOLIDS, LAMPS, trees, KIDS_HOME, AVANTO, SAUNA, BOXES,
  spawn: i => ({ ...SPAWNS[i % SPAWNS.length] }),
  nearShop, dests, insideSolid,
  ground(x, y) {
    const c = cellAt(x, y);
    return c === G_ICE ? 'ice' : c === G_ROAD || c === G_PATH ? 'path' : 'snow';
  },
  collide(o, rad) {
    let hit = wallPush(o, rad);
    for (const b of SOLIDS) hit = Math.max(hit, pushOut(o, clamp(o.x, b.x, b.x + b.w), clamp(o.y, b.y, b.y + b.h), rad));
    return hit;
  },

  spot: () => zonePoint(Math.random() < .67 ? [G_PATH] : [G_ROAD]), // ice and potholes: on a sidewalk twice as often as on the street
  presentSpot: () => zonePoint([G_ROAD], SHOPS[0].door, 120 * PPM), // on the streets by the station
  kidSpot(home, kids) { // in the snow next to a sidewalk; ch 3's kids within 50 m of their own door
    const q = home ? pathPoint(home, 50 * PPM) : pathPoint(), [dx, dy] = pick([[0, 1], [0, -1], [1, 0], [-1, 0]]), off = rnd(45, 70);
    const x = q.x + dx * off, y = q.y + dy * off;
    if (x < 20 || x > W - 20 || y < 20 || y > H - 20 || cellAt(x, y) !== G_SNOW || inLake(x, y, 10) || insideSolid(x, y)
        || DOORS.some(d => Math.hypot(d.x - x, d.y - y) < 90) || home && Math.hypot(home.x - x, home.y - y) > 50 * PPM || kids.some(k => Math.hypot(k.x - x, k.y - y) < 60)) return null;
    return { x, y, dx: -dx, dy: -dy };
  },
  lootSpot(loot) { // in a courtyard or a park, against a wall
    const { x, y } = zonePoint([G_SNOW], undefined, ZONE * 1.3, 120);
    if (nearKind(x, y, 14, G_WALL) || !nearKind(x, y, 45, G_WALL) || nearKind(x, y, 70, G_PATH) || nearKind(x, y, 70, G_ROAD) || inLake(x, y, 20)
        || trees.some(t => Math.hypot(t.x - x, t.y - y) < t.r + 15)
        || loot.some(l => Math.hypot(l.x - x, l.y - y) < 150 * PPM)) return null; // spread out: not both round the same corner
    return { x, y };
  },

  // cars start on a random street near a shop and take a random turn at every junction, keeping right
  traffic(perBlock) {
    const out = [];
    for (let k = perBlock * BLOCKS * 2; k > 0; k--) { // as many as two lanes per block had
      const c = carStart({ fast: rnd(0, 20) });
      if (c) out.push(c);
    }
    return out;
  },
  drive(c, d) {
    c.t! += d;
    while (c.t! > c.len!) { const t = c.t! - c.len!; if (!nextEdge(c)) { carStart(c); break; } c.t = t; }
    carPlace(c);
  },
  yields(c, robots) {
    // a crossing counts within 200 px of the car with a robot within 70 px of it: no robot within 270 px (271: rounding), no crossing to look for
    if (!robots.some(r => Math.abs(r.x - c.x) < 271 && Math.abs(r.y - c.y) < 271)) return false;
    const ca = Math.cos(c.a!), sa = Math.sin(c.a!);
    for (const cr of CROSS) {
      if (Math.abs(cr.x - c.x) > 200 || Math.abs(cr.y - c.y) > 200) continue;
      const f = (cr.x - c.x) * ca + (cr.y - c.y) * sa, side = Math.abs((cr.y - c.y) * ca - (cr.x - c.x) * sa);
      if (f > 45 && f < 200 && side < 60 && robots.some(r => Math.hypot(r.x - cr.x, r.y - cr.y) < 70)) return true;
    }
    return false;
  },

  // everyone on foot wanders the footway graph from a node near a shop
  walker: () => pathPoint(),
  walkOn(w, off) { if (off) w.ni = -1; return wander(w); },
  curb(p) { p.y = clamp(p.y, 8, H - 8); }, // people cross the street where they like; just keep them on the map
  plowStart() { const p = pathPoint(SHOPS[0].door), to = wander(p); return { ...p, a: 0, gx: to.x, gy: to.y }; }, // clears the sidewalks, wandering the city's footways
  plowOn(p) { const to = wander(p); p.gx = to.x; p.gy = to.y; },

  // Santa comes down a street a few blocks off, straight on at every junction, for ten seconds
  santaStart(robots) {
    const r = pick(robots), a = rnd(0, 7);
    return carStart({ off: 0, life: 10 }, { x: r.x + Math.cos(a) * 160 * PPM, y: r.y + Math.sin(a) * 160 * PPM }, 60 * PPM);
  },
  santaMove(s: Santa, dt) {
    s.t! += SANTA_V * dt;
    while (s.t! > s.len!) { const t = s.t! - s.len!; if (!nextEdge(s, true)) return false; s.t = t; }
    carPlace(s);
    return (s.life! -= dt) > 0;
  },
  santaHits: (s, c: Car) => dist(c, s) <= 100,
};
