// What a page chose to be. One engine serves two pages: index.html plays the village, helsinki.html central
// Helsinki. Each page's only script is its entry (village.page.ts, helsinki.page.ts): it calls openPage() and then
// imports the engine (main.ts). The engine's modules read the choice as they load: world.ts awaits the map and
// builds the game on it, main.ts awaits the map's scenery before its first frame.
// The entry hands over promises of dynamic imports, not modules. That is what keeps the order right in a bundle
// (a statically imported entry module is hoisted behind the shared chunk it imports, however the source lists
// them) and it starts every download at once.
import type { GameMap } from '../sim/map/types';

export interface Page {
  map: Promise<GameMap>;     // the simulation's map module (src/sim/map)
  scenery: Promise<unknown>; // the map's client module: it builds the static scene and calls scenery.ts's ready()
  other: string;      // the other map's page: where the title screen's map button goes
  best: string;       // localStorage key of this map's best run
  board: string;      // localStorage key of this machine's leaderboard for this map
  worldwide: boolean; // do runs on this map go on the worldwide leaderboard?
  santa: string;      // the warning when Santa comes: which part of this map to stay off
}
export let page: Page;
export const openPage = (p: Page) => { page = p; };
