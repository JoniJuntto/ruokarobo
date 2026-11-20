// The one game this page shows, and the map it is played on. `G` is the state every client module reads:
// the local simulation advances it in solo and split-screen play, the mirror fills it in from snapshots online.
// The map is the page's choice (page.ts), awaited here: every module that imports this loads after the map has.
// Nothing here or in the modules that import this knows which map it is.
// What only one map has (the village's lake, Helsinki's street graph) stays in that map's own client module.
import { createGame } from '../sim/game';
import { page } from './page';

export const MAP = await page.map;
export const game = createGame(MAP);
export const G = game.state;

export const W = MAP.W, H = MAP.H, BLOCKS = MAP.BLOCKS;
export const AVANTO = MAP.AVANTO, SHOPS = MAP.SHOPS, SAUNA = MAP.SAUNA;
export const HOUSES = MAP.HOUSES, KIDS_HOME = MAP.KIDS_HOME, DOORS = MAP.DOORS, LAMPS = MAP.LAMPS, trees = MAP.trees;
export const nearShop = MAP.nearShop, insideSolid = MAP.insideSolid;
// Simulation runs on a flat map in px. Rendering maps px → 3D units.
export const S = .1, OX = W * S / 2, OZ = H * S / 2;
