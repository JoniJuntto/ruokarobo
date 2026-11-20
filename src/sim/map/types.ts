// What the simulation (and the renderer) may ask of a map. Everything that depends on the street layout is behind
// these functions: the village (village.ts) answers with its one road and fixed rectangles, Helsinki (helsinki.ts)
// with a surface raster and street graphs baked from OpenStreetMap. Maps are plain modules with no DOM, and they
// roll their scenery with a seeded PRNG, so a server and every browser build the same world.
import type { Body, Car, Ped, Plow, Pt, Santa, Walk } from '../types';

export interface Box { x: number; y: number; w: number; h: number }
// addr: a street address, on maps that have real ones. no: the number on the door plate when it is not just n
export interface Shop { door: Pt; name: string; color: string; tag: string; addr?: string }
export interface House { door: Pt; n: number; no?: string; addr?: string }
export interface Tree { x: number; y: number; r: number; kind: 'flag' | 'spruce' | 'birch' | 'snowman' }
export type Ground = 'path' | 'snow' | 'ice';
export type WalkerKind = Ped['kind'] | 'thief';

export interface GameMap {
  id: string;
  W: number; H: number; // size in px; the simulation's units
  BLOCKS: number; // per-level hazard counts are per block: the village's five blocks, one per shop in Helsinki
  timeX: number;  // how many times longer an average order's round trip is than the village's: a shift gets that
                  // much more battery, and the leftover-battery bonus is paid in village seconds
  SHOPS: Shop[];
  HOUSES: House[];
  DOORS: Pt[];    // every shop and house door
  SOLIDS: Box[];  // rectangles nothing drives through (collide() covers them, and whatever else the map has)
  LAMPS: Pt[];
  trees: Tree[];  // round obstacles; hitting a spruce or birch can bury a robot
  KIDS_HOME: number; // index into HOUSES: where every story order goes
  AVANTO: { x: number; y: number; r: number }; // the ice hole (ch 5: Eetu hangs on here)
  SAUNA: Box;
  BOXES: Pt[];    // pvp item boxes
  spawn(i: number): Pt; // where robot slot i starts a shift
  nearShop(p: Pt): Shop;
  dests(shop: Shop): number[]; // indices into HOUSES: the doors an order from this shop may go to
  ground(x: number, y: number): Ground; // the surface with no level hazards or weather on it
  insideSolid(x: number, y: number): boolean; // inside, or within 10 px of, something solid
  collide(o: Body, rad: number): number; // push o out of everything solid; returns the hardest impact speed

  // ---- where a level's hazards go ----
  spot(): Pt;        // a random point on a sidewalk or road, away from doors: ice and potholes
  presentSpot(): Pt; // ch 2: a present lying on the road
  // one try at a hiding place in the snow beside a sidewalk (near `home` if given, clear of `kids`); dx, dy: the way to the sidewalk
  kidSpot(home: Pt | null, kids: Pt[]): (Pt & { dx: number; dy: number }) | null;
  lootSpot(loot: Pt[]): Pt | null; // one try at a spot tucked in beside a building, away from the other cases

  // ---- traffic. A car keeps whatever the map needs to know where it is on its street (types.ts: Edge) ----
  traffic(perBlock: number): (Omit<Car, 'base' | 'v' | 'color'> & { fast: number })[]; // a level's cars; fast: px/s over the level's base speed
  drive(c: Car, d: number): void;          // move c d px along its street: round the map's edge, or on at the next junction
  yields(c: Car, robots: Pt[]): boolean;   // is a robot on a zebra crossing just ahead of c?

  // ---- people, dogs, couriers and thieves walk. Each carries the map's own idea of its route (types.ts: Walk) ----
  walker(kind: WalkerKind, i: number): Pt & Walk; // where the i-th one of its kind starts
  walkOn(w: Pt & Walk, off?: boolean): Pt; // its next point to walk to. off: it left its route (a chase, a kick) and starts again from where it stands
  curb(p: Ped): void;                      // keep a pedestrian where people may be on this map
  plowStart(): Plow;
  plowOn(p: Plow): void;                   // it reached (gx, gy): set the next one

  // ---- Santa ----
  santaStart(robots: Pt[]): Santa | null;  // null: no street for him right now
  santaMove(s: Santa, dt: number): boolean; // false: he is gone
  santaHits(s: Santa, c: Car): boolean;    // is this car in his way?
}
