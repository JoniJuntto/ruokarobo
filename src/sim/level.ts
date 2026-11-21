// Level setup and the flow between screens: title → shift → workshop → next shift, the story's cards, game over.
import { CHAPTERS, LEVEL_NAMES, PRICES, WOLT, freshUp, isStyle } from './data';
import { bump, chap, coopX, cv, fx, hz, most, say, sfx, woltN } from './state';
import type { GameState, Ped, UpKey, Upgrades } from './types';
import { dist, pick, rnd } from './util';

// roll the hazards for level n. Robots are left where they are. How many of each is decided here; where they go,
// and how they travel, is the map's business
export function setupLevel(g: GameState, n: number) {
  const m = g.map;
  g.ice = []; g.holes = []; g.cars = [];
  g.eetu = chap(g)?.goal === 'rescue' ? { x: g.map.AVANTO.x, y: g.map.AVANTO.y, state: 'ice', say: '', sayT: 0, cool: 1 } : null; // ch 5: holding on to the edge
  g.presents = chap(g)?.goal !== 'collect' ? [] : Array.from({ length: cv(g, 'quota', 0) + (g.robots.length - 1) * 2 }, () => ({ ...m.presentSpot(), gone: false }));
  for (let i = 0; i < hz(g, cv(g, 'ice', 2 + n * 2)) * g.map.BLOCKS; i++) g.ice.push({ ...g.map.spot(), rx: rnd(40, 90), ry: rnd(18, 36) });
  for (let i = 0; i < hz(g, cv(g, 'holes', 2 + n * 2)) * g.map.BLOCKS; i++) {
    const s = g.map.spot();
    if (!g.holes.some(h => Math.hypot(h.x - s.x, h.y - s.y) < 60)) g.holes.push({ ...s, r: rnd(15, 21) });
  }
  for (const { fast, ...at } of m.traffic(hz(g, cv(g, 'cars', n > 3 ? 2 : 1)))) {
    const base = 130 + n * 15 + fast;
    g.cars.push({ ...at, base, v: base, color: pick(['#c0392b', '#2c3e50', '#f1f1f1', '#2e86de', '#7f8c8d', '#16a085']) });
  }
  g.peds = [];
  // someone on foot: starts where the map puts the i-th of its kind, already heading for the next point of its walk
  const walker = (kind: Ped['kind'], i: number, far: boolean, cool: number, look?: { color: string; hat: string }): Ped => {
    let pos; do pos = m.walker(kind, i); while (far && dist(pos, m.nearShop(pos).door) < 160);
    const to = m.walkOn(pos);
    return { ...pos, tx: to.x, ty: to.y, kind, a: 0, vx: 0, vy: 0, mode: 'walk', t: 0, cool, kickT: 0, zapT: 0, say: '', sayT: 0, ...look };
  };
  for (let i = 0; i < hz(g, cv(g, 'peds', Math.min(8, 1 + n))) * m.BLOCKS; i++) // nobody starts right outside a shop
    g.peds.push(walker('person', i, true, 2, { color: pick(['#3b6ea5', '#7a2e3a', '#2e6b4f', '#5b4a8a', '#a0522d', '#333a44']), hat: pick(['#d33', '#f5c400', '#1f4e9c', '#2fbf6a', '#e84393']) }));
  for (let i = 0; i < hz(g, cv(g, 'dogs', n >= 4 ? 2 : n >= 2 ? 1 : 0)) * m.BLOCKS; i++) g.peds.push(walker('dog', i, false, 3)); // dogs from shift 2
  // Woltti couriers on e-mopeds: they hunt a robot down from anywhere and only a zap shakes them off
  for (let i = 0; i < hz(g, woltN(g, n)); i++) g.peds.push(walker('wolt', i, false, 4, { color: WOLT, hat: WOLT }));
  g.kids = []; g.balls = [];
  const nKids = hz(g, cv(g, 'kids', Math.min(4, n))) * g.map.BLOCKS, nBums = g.campaign && !nKids ? 0 : g.map.BLOCKS; // no bottles in story chapters without kids
  const home = chap(g)?.kidsNearHome && g.map.HOUSES[g.map.KIDS_HOME].door; // ch 3: the kids guard their own house
  for (let i = 0, tries = 0; i < nKids + nBums && tries < 400 * g.map.BLOCKS; tries++) { // kids hide in the snow next to sidewalks; one bum per block
    const at = m.kidSpot(i < nKids && home || null, g.kids);
    if (!at) continue;
    const bum = i >= nKids;
    g.kids.push({ ...at, a: Math.atan2(at.dy, at.dx), cool: rnd(1, 3), throwT: 0, zapT: 0, say: '', sayT: 0, bum,
                coat: bum ? pick(['#5a4d3a', '#4a4f3a', '#3d3a36']) : pick(['#ff7b00', '#2d9cff', '#e84393', '#2fbf6a']),
                hat: bum ? pick(['#6b6b6b', '#7a3b2e']) : pick(['#d33', '#f5c400', '#1f4e9c']) });
    i++;
  }
  g.loot = []; // skin cases tucked in beside a building, well off the sidewalks: you have to go looking
  for (let tries = 0; g.loot.length < 2 && tries < 5000; tries++) {
    const at = m.lootSpot(g.loot);
    if (at) g.loot.push({ ...at, got: 0 });
  }
  if (Math.random() < .2) g.loot.push({ x: g.map.SAUNA.x + g.map.SAUNA.w / 2, y: g.map.SAUNA.y + g.map.SAUNA.h + 25, got: 0, ham: 1 }); // rare: a kinkkumittari left by the sauna
  g.plow = cv(g, 'plow', n >= 2) ? m.plowStart() : null;
  // Prösma robots (endless, shift 5+): one per block, two from shift 8. they wander until someone nearby carries an order
  g.thieves = g.campaign || g.pvp || g.roam || n < 5 ? [] : Array.from({ length: hz(g, n >= 8 ? 2 : 1) * g.map.BLOCKS }, () => {
    const s = m.walker('thief', 0), to = m.walkOn(s);
    return { ...s, gx: to.x, gy: to.y, a: 0, vx: 0, vy: 0, cargo: null, cd: 0, imm: 0, say: '', sayT: 0 };
  });  g.darkness = cv(g, 'darkness', Math.min(.8, (n - 1) * .3));
  fx(g, { k: 'level', n });
}
export function startLevel(g: GameState, n: number) {
  g.level = n; setupLevel(g, n);
  g.time = Math.round((cv(g, 'time', 80 + n * 3) + g.up.battery * 20) * g.map.timeX * Math.max(.6, 1 - coopX(g) * .2)); g.delivered = 0; g.goalDone = false;
  g.quota = cv(g, 'quota', 2 + n) + (g.robots.length - 1) * 2;
  g.robots.forEach(r => Object.assign(r, g.map.spawn(r.i), { vx: 0, vy: 0, a: 0, boost: 1, zaps: 3 + 2 * g.up.tesla, cargo: null, hole: null, stun: 0, immune: 1, hp: 1, earn: 0, towT: 0, hookCd: 0, dDir: 0, dCh: 0, dTier: 0, mt: 0, drunk: 0, lag: 0 }));
  g.boxes.forEach(b => b.t = 0);
  g.weather = { k: null, t: 0 }; g.weatherIn = n >= 2 ? rnd(15, 35) : Infinity;
  const wx = chap(g)?.weather;
  if (wx) { g.weather = { k: wx, t: 1e9 }; fx(g, { k: 'wx', w: wx }); sfx(g, 'alarm'); } // ch 7: blizzard all chapter
  g.santa = null; g.santaIn = g.campaign ? Infinity : rnd(20, 45); // no sleigh knocking cars over on the night of the crash
  g.shiftT0 = g.runT;
  g.mark = { ...g.stats }; // "clear a shift without X" is measured against this snapshot
  most(g, 'players', g.robots.length);
  g.state = 'play'; g.stateT = 0; fx(g, { k: 'start' });
  const s1 = chap(g)?.s1;
  if (s1 && g.robots[0]) say(g.robots[0], s1, 4);
  g.banner = g.campaign ? CHAPTERS[g.chapter].title : `Shift ${n} – ${LEVEL_NAMES[Math.min(n, 4) - 1]}`; g.bannerT = 3;
}

export function newRun(g: GameState) {
  g.campaign = false;
  if (g.robots.length < 2) g.pvp = false;
  g.score = 0; g.money = 0; g.up = freshUp();
  for (const k in g.stats) delete g.stats[k];
  g.runT = 0; g.splits = {};
  bump(g, 'runs'); fx(g, { k: 'run' });
  startLevel(g, 1);
}
// ch 0 is the prologue card; save carries the team money and upgrades of a continued story
export function startStory(g: GameState, ch: number, save?: { money?: number; up?: Partial<Upgrades> } | null) {
  g.campaign = true; g.pvp = false; g.roam = false; g.score = 0; g.money = save?.money || 0; g.up = { ...freshUp(), ...save?.up };
  for (const k in g.stats) delete g.stats[k];
  g.runT = 0; g.splits = {}; g.fullStory = ch <= 1 && !save; fx(g, { k: 'run' });
  g.chapter = ch; g.state = 'story'; g.stateT = 0;
}
// a chapter starts from its card; a retry restarts it with the money and upgrades it began with
function playChapter(g: GameState) {
  g.pvp = false; g.storyStart = { money: g.money, up: { ...g.up } }; fx(g, { k: 'storySave', ch: g.chapter });
  startLevel(g, g.chapter);
}
function retryChapter(g: GameState) { g.money = g.storyStart!.money; g.up = { ...g.storyStart!.up }; playChapter(g); }
// the pause menu's Retry: a story chapter restarts with the money and upgrades it began with, anything else
// (endless, pvp, roaming) starts its run over from shift 1. Nothing to retry on the title or a story card
export function retry(g: GameState) {
  if (g.state === 'title' || g.state === 'story') return;
  if (g.campaign) { if (g.storyStart) retryChapter(g); } else newRun(g); // newRun leaves g.roam alone, so a roam stays a roam
}
// the one "go on" button: Start shift, Try again, Start next shift, Continue. Whoever calls this on the title
// screen makes sure a robot exists first
export function pressStart(g: GameState) {
  if (g.state === 'title') { g.roam = false; newRun(g); }
  else if (g.state === 'over' && g.stateT > 1) g.campaign ? retryChapter(g) : newRun(g);
  else if (g.state === 'shop' && g.stateT > 1) g.campaign ? (g.chapter++, g.state = 'story', g.stateT = 0) : startLevel(g, g.level + 1);
  else if (g.state === 'story' && g.stateT > .5) {
    if (g.chapter === 0) { g.chapter = 1; g.stateT = 0; }
    else if (g.chapter <= 8) playChapter(g);
    else if (g.chapter === 9) { g.chapter = 10; g.stateT = 0; } // ending → credits
    else { fx(g, { k: 'storyEnd' }); g.campaign = false; g.state = 'title'; } // the ending card
  }
}
export function buy(g: GameState, k: UpKey) {
  if (g.state !== 'shop') return;
  // style is a free toggle, so the team's money only ever goes to upgrades
  if (isStyle(k)) { g.up[k] ^= 1; sfx(g, 'pickup'); if (k === 'gold' && g.up.gold) fx(g, { k: 'ach', a: 'gold' }); return; }
  const lv = g.up[k], price = PRICES[lv];
  if (lv >= 3 || g.money < price) return;
  g.money -= price; g.up[k]++; sfx(g, 'pickup');
  bump(g, 'spent', price); bump(g, 'buys');
}
