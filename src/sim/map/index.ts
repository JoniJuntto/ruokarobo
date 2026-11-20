// Every map a game can be played on, by the id a room is opened with.
// Only a server wants them all: a page imports just its own map, so the village's bundle carries no Helsinki data.
import { helsinki } from './helsinki';
import type { GameMap } from './types';
import { village } from './village';

export const maps: Record<string, GameMap> = { village, helsinki };
