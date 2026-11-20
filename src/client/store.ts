// Everything this machine remembers between visits. The localStorage keys and their JSON shapes are the save
// format: existing saves must keep loading.
import type { Stats, Upgrades } from '../sim/types';
import { page } from './page';

const load = <T>(key: string, into: T): T => { try { Object.assign(into as object, JSON.parse(localStorage.getItem(key) || '{}')); } catch (e) {} return into; };
const save = (key: string, v: unknown) => { try { localStorage.setItem(key, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {} };
const read = (key: string) => { try { return localStorage.getItem(key); } catch (e) { return null; } };

export const cfg = load('ruokarobo-cfg', { music: 1, sfx: 1, shadows: true, scale: 1 });
export const saveCfg = () => save('ruokarobo-cfg', cfg);

// skin cases: found hidden on the map during shifts, opened on the title screen; skins live on this machine
export const skins = load('ruokarobo-skins', { cases: 0, own: [] as string[], sel: '', horn: '' }); // cases are found on the map, see loot
export const saveSkins = () => save('ruokarobo-skins', skins);

export const tot: Stats = load('ruokarobo-tot', {}); // lifetime counters
export const saveTot = () => save('ruokarobo-tot', tot);

// the best run is per map (page.best); everything else here is shared by both pages
export const store = { best: +(read(page.best) || 0) || 0, pname: read('ruokarobo-name') || '' };
export const saveBest = () => save(page.best, String(store.best));
export const saveName = () => save('ruokarobo-name', store.pname);

export interface StorySave { ch: number; money?: number; up?: Partial<Upgrades> }
export function storyLoad(): StorySave | null {
  try { const s = JSON.parse(localStorage.getItem('ruokarobo-story')!); return s && s.ch >= 1 && s.ch <= 8 ? s : null; } catch (e) { return null; }
}
export const storySave = (ch: number, money: number, up: Upgrades) => save('ruokarobo-story', { ch, money, up });
export const storyClear = () => { try { localStorage.removeItem('ruokarobo-story'); } catch (e) {} };
