// The village: five 1600px blocks along one road, 8000x900 px.
import { SANTA_V } from '../data';
import { dist, clamp, inR, pick, pushOut, rnd, seeded } from '../util';
import type { Pt, Rect } from '../types';
import type { Box, GameMap, House, Shop, Tree } from './types';

export interface VillageShop extends Shop, Box {}
export interface VillageHouse extends House, Box { wall?: string; tall?: boolean }
// the layout itself, for the village's own scenery and minimap (client/village.ts); the simulation asks through GameMap
export interface VillageMap extends GameMap {
  SHOPS: VillageShop[]; HOUSES: VillageHouse[];
  BW: number; // one block's width: what the minimap shows, and (x1.2) how far from its shop an order may go
  PATHS: Rect[]; ROAD: Rect; CROSS: Rect[]; LAKE: { x: number; y: number; rx: number; ry: number }; STATUE: Box;
  inLake(x: number, y: number, m?: number): boolean; // on (or within m px of) natural ice
  freeAt(x: number, y: number, m: number): boolean;  // open snow with m px clear all round (scenery placement)
}

const BW = 1600, BLOCKS = 5, W = BW * BLOCKS, H = 900;

const BX = Array.from({ length: BLOCKS }, (_, k) => k * BW); // left edge of each block
const PATHS: Rect[] = [[0, 560, W, 40], [0, 720, W, 40], ...BX.flatMap((bx): Rect[] => [[bx + 620, 256, 40, 304], [bx + 400, 220, 950, 36], [bx + 1300, 256, 40, 304]])];
const ROAD: Rect = [0, 600, W, 120];
// item boxes: a row across the road mid-block plus one on each sidewalk
const BOXES = BX.flatMap(bx => [{ x: bx + 960, y: 625 }, { x: bx + 960, y: 660 }, { x: bx + 960, y: 695 }, { x: bx + 300, y: 580 }, { x: bx + 1450, y: 740 }]);
const CROSS = BX.flatMap((bx): Rect[] => [[bx + 620, 600, 40, 120], [bx + 1300, 600, 40, 120]]);
const LAKE = { x: 980, y: 400, rx: 210, ry: 95 };
const AVANTO = { x: 1100, y: 420, r: 20 }; // ice-swimming hole by the sauna pier
// one shop per block; the lake, avanto and sauna stay in the first block
const SHOPS: VillageShop[] = [['SALEPA', '#e8501f', 'A'], ['PUOTI', '#2d6fd6', 'B'], ['KIOSKI', '#2f9e57', 'C'], ['MARKETTI', '#c02a7a', 'D'], ['KAUPPA', '#7a4fc9', 'E']]
  .map(([name, color, tag], k) => ({ x: BX[k] + 30, y: 330, w: 190, h: 200, door: { x: BX[k] + 125, y: 552 }, name, color, tag }));
const nearShop = (p: Pt) => SHOPS.reduce((a, b) => dist(p, a.door) <= dist(p, b.door) ? a : b);
const SAUNA = { x: 1205, y: 420, w: 70, h: 50 };
const STATUE = { x: BW + 960, y: 380, w: 40, h: 40 }; // Olli Lindholm in bronze, block 2 where block 1 has its lake
const WALLS = ['#b3261e', '#e2b13c', '#3d6e9e', '#2e6b4f'];
const HOUSE_ROW: { x: number; y: number; w: number; h: number; door: Pt; wall?: number; tall?: boolean }[] = [
  { x: 420, y: 90, w: 150, h: 110, door: { x: 495, y: 222 }, wall: 0 },
  { x: 780, y: 80, w: 160, h: 120, door: { x: 860, y: 222 }, wall: 0 },
  { x: 1120, y: 90, w: 150, h: 110, door: { x: 1195, y: 222 }, wall: 1 },
  { x: 1390, y: 300, w: 170, h: 220, door: { x: 1475, y: 552 }, tall: true },
  { x: 250, y: 790, w: 160, h: 90, door: { x: 330, y: 776 }, wall: 0 },
  { x: 760, y: 790, w: 160, h: 90, door: { x: 840, y: 776 }, wall: 2 },
  { x: 1250, y: 790, w: 160, h: 90, door: { x: 1330, y: 776 }, wall: 0 },
];
const HOUSES: VillageHouse[] = BX.flatMap((bx, k) => HOUSE_ROW.map(h => ({ ...h, x: h.x + bx, door: { x: h.door.x + bx, y: h.door.y },
  wall: h.wall == null ? undefined : WALLS[(h.wall + k) % WALLS.length], n: 0 })));
HOUSES.forEach((h, i) => h.n = i + 1);
const KIDS_HOME = 2; // campaign: the kids' house by the lake, paper star in the window
const SOLIDS: Box[] = [...SHOPS, SAUNA, STATUE, ...HOUSES];
const EDGES = Float64Array.from(SOLIDS.flatMap(b => [b.x, b.y, b.x + b.w, b.y + b.h])); // each solid's left, top, right, bottom, for collide(): this runs for everyone on foot every tick
const DOORS = [...SHOPS.map(b => b.door), ...HOUSES.map(h => h.door)];
const LAMPS: Pt[] = [];
for (const bx of BX) {
  for (const x of [180, 450, 760, 1060, 1420]) LAMPS.push({ x: bx + x, y: 548 }, { x: bx + x + 60, y: 772 });
  for (const x of [470, 760, 1040, 1260]) LAMPS.push({ x: bx + x, y: 270 });
}
const inLake = (x: number, y: number, m = 0) => ((x - LAKE.x) / (LAKE.rx + m)) ** 2 + ((y - LAKE.y) / (LAKE.ry + m)) ** 2 < 1;

// trees are rolled with a seeded PRNG: every process (a server, each browser) grows the same forest, on every load
const rng = seeded(1917);
const trees: Tree[] = [{ x: 300, y: 150, r: 5, kind: 'flag' }];
function freeAt(x: number, y: number, m: number) {
  if (x < m || y < m || x > W - m || y > H - m) return false;
  for (const p of [...PATHS, ROAD]) if (x > p[0] - m && x < p[0] + p[2] + m && y > p[1] - m && y < p[1] + p[3] + m) return false;
  for (const b of SOLIDS) if (x > b.x - m && x < b.x + b.w + m && y > b.y - m && y < b.y + b.h + m) return false;
  if (inLake(x, y, m)) return false;
  if (DOORS.some(d => Math.hypot(d.x - x, d.y - y) < 70)) return false;
  return !trees.some(t => Math.hypot(t.x - x, t.y - y) < m * 2);
}
for (let tries = 0; trees.length < 45 * BLOCKS && tries < 4000 * BLOCKS; tries++) {
  const x = rng() * W, y = rng() * H;
  if (freeAt(x, y, 24)) {
    const kind = trees.length < 4 ? 'snowman' : rng() < .55 ? 'spruce' : 'birch';
    trees.push({ x, y, kind, r: { spruce: 15, birch: 10, snowman: 13 }[kind] });
  }
}

function spot(): Pt {
  for (;;) {
    const p = pick([...PATHS, ...PATHS, ROAD]);
    const x = p[0] + Math.random() * p[2], y = p[1] + Math.random() * p[3];
    if (!DOORS.some(d => Math.hypot(d.x - x, d.y - y) < 80)) return { x, y };
  }
}
function pathPoint(side: number): Pt { // a point on a sidewalk on this side of the road
  for (;;) {
    const q = pick(PATHS), x = q[0] + Math.random() * q[2], y = q[1] + Math.random() * q[3];
    if ((y < 660) === (side === 0)) return { x, y };
  }
}

const insideSolid = (x: number, y: number) => SOLIDS.some(b => x > b.x - 10 && x < b.x + b.w + 10 && y > b.y - 10 && y < b.y + b.h + 10);
// the sidewalk snowplow drives this loop there and back
const PLOW_ROUTE: [number, number][] = [[20, 580], ...BX.flatMap((bx): [number, number][] => [[bx + 640, 580], [bx + 640, 238], [bx + 1320, 238], [bx + 1320, 580]]), [W - 20, 580]];
const rectD = (x: number, y: number, p: Rect) => Math.hypot(Math.max(p[0] - x, 0, x - p[0] - p[2]), Math.max(p[1] - y, 0, y - p[1] - p[3]));

export const village: VillageMap = {
  id: 'village',
  W, H, BW, BLOCKS, timeX: 1, SHOPS, HOUSES, DOORS, SOLIDS, LAMPS, trees, KIDS_HOME, AVANTO, SAUNA, BOXES,
  PATHS, ROAD, CROSS, LAKE, STATUE,
  spawn: i => ({ x: 70 + (i % 4) * 42, y: i < 4 ? 582 : 550 }),
  nearShop, inLake, freeAt, spot, insideSolid,
  // orders go to this block or the next one over, never across the whole map
  dests: shop => HOUSES.flatMap((h, i) => Math.abs(h.door.x - shop.door.x) < BW * 1.2 ? [i] : []),
  ground(x, y) {
    if (inLake(x, y)) return 'ice';
    if (inR(x, y, ROAD)) return 'path';
    for (const p of PATHS) if (inR(x, y, p)) return 'path';
    return 'snow';
  },
  collide(o, rad) {
    let hit = 0, x = o.x, y = o.y;
    for (let i = 0; i < EDGES.length; i += 4) { // nearly every solid is nowhere near: those are passed over here, on plain numbers, by pushOut's own first test
      const cx = clamp(x, EDGES[i], EDGES[i + 2]), cy = clamp(y, EDGES[i + 1], EDGES[i + 3]), dx = x - cx, dy = y - cy;
      if (dx >= rad || dx <= -rad || dy >= rad || dy <= -rad) continue;
      hit = Math.max(hit, pushOut(o, cx, cy, rad)); x = o.x; y = o.y;
    }
    return hit;
  },

  presentSpot: () => ({ x: rnd(500, 1300), y: rnd(615, 705) }), // across both lanes of the first block
  kidSpot(home) { // in the snow next to a sidewalk
    const q = pathPoint(Math.random() < .7 ? 0 : 1), [dx, dy] = pick([[0, 1], [0, -1], [1, 0], [-1, 0]]), off = rnd(45, 70);
    const x = q.x + dx * off, y = q.y + dy * off;
    if (x < 20 || x > W - 20 || y < 20 || y > H - 20 || [...PATHS, ROAD].some(p => inR(x, y, p)) || inLake(x, y, 10) || insideSolid(x, y)
        || DOORS.some(d => Math.hypot(d.x - x, d.y - y) < 90) || home && Math.hypot(home.x - x, home.y - y) > 250) return null;
    return { x, y, dx: -dx, dy: -dy };
  },
  lootSpot(loot) { // beside a building, well off the sidewalks
    const x = rnd(25, W - 25), y = rnd(25, H - 15), sd = Math.min(...SOLIDS.map(b => rectD(x, y, [b.x, b.y, b.w, b.h])));
    if (sd < 14 || sd > 45 || [...PATHS, ROAD].some(p => rectD(x, y, p) < 70) || inLake(x, y, 20)
        || DOORS.some(d => Math.hypot(d.x - x, d.y - y) < 120) || trees.some(t => Math.hypot(t.x - x, t.y - y) < t.r + 15)
        || loot.some(l => Math.abs(l.x - x) < BW / 2)) return null; // spread out: not both in the same block
    return { x, y };
  },

  // two lanes, one each way, the whole length of the road; cars leaving one end of the map come back in at the other
  traffic(perBlock) {
    const out = [], count = perBlock * BLOCKS;
    for (let lane = 0; lane < 2; lane++) for (let k = 0; k < count; k++)
      out.push({ x: (k + Math.random() * .4) * (W + 200) / count, y: lane ? 690 : 630, dir: lane ? -1 : 1, fast: lane * 20 });
    return out;
  },
  drive(c, d) {
    c.x += d * c.dir!;
    if (c.dir! > 0 && c.x > W + 100) c.x = -100;
    if (c.dir! < 0 && c.x < -100) c.x = W + 100;
  },
  yields(c, robots) {
    for (const cr of CROSS) {
      const ahead = (cr[0] + 20 - c.x) * c.dir!;
      if (ahead > 45 && ahead < 200 && robots.some(r => inR(r.x, r.y, [cr[0] - 24, 590, 88, 140]))) return true;
    }
    return false;
  },

  // people keep to their side of the road (most of them the shops' side); thieves have no side and roam roads and sidewalks alike
  walker(kind, i) {
    if (kind === 'thief') return spot();
    const side = kind === 'wolt' ? i % 2 : Math.random() < (kind === 'dog' ? .7 : .75) ? 0 : 1;
    return { ...pathPoint(side), side };
  },
  walkOn: w => w.side == null ? spot() : pathPoint(w.side),
  curb(p) { if (p.kind !== 'wolt') p.y = p.side === 0 ? Math.min(p.y, 594) : Math.max(p.y, 726); }, // never step into traffic (mopeds ride straight across)
  plowStart: () => ({ x: 20, y: 580, a: 0, wi: 1, dir: 1, gx: PLOW_ROUTE[1][0], gy: PLOW_ROUTE[1][1] }),
  plowOn(p) {
    if (p.wi! + p.dir! < 0 || p.wi! + p.dir! >= PLOW_ROUTE.length) p.dir! *= -1;
    p.wi! += p.dir!; [p.gx, p.gy] = PLOW_ROUTE[p.wi!];
  },

  // Santa sweeps one lane from end to end
  santaStart() { const dir = pick([1, -1]); return { x: dir > 0 ? -250 : W + 250, y: pick([630, 690]), dir }; },
  santaMove(s, dt) { s.x += s.dir! * SANTA_V * dt; return s.x >= -300 && s.x <= W + 300; },
  santaHits: (s, c) => c.y === s.y && Math.abs(c.x - s.x) <= 100,
};
