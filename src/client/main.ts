// ---------- go ----------
// The page's entry: wires the modules together and runs the frame loop. Each frame either steps the local
// simulation or (online) lets the network mirror fill the state in, then hands what happened to the screen.
import './style.css';
import * as THREE from 'three';
import { CHAPTERS, HORNS, ORDERS, PRICES, SURF, UPGRADES, hornOf } from '../sim/data';
import { damage, hook } from '../sim/robot';
import { woltN } from '../sim/state';
import type { GameEvent } from '../sim/types';
import { dist } from '../sim/util';
import { achTick, achToast, bump, countStat, unlock } from './achievements';
import { pollPads, urlChapter } from './actions';
import { SFX, hasHornSound, musicTick, playHorn } from './audio';
import { boardTick, onlineRun, recordRun, startRun } from './board';
import { $ } from './dom';
import { holeMesh } from './entities';
import { MOBILE, camera, fog, renderer, scene, vh } from './gfx';
import { feedInputs, tickAskJoin, touchDev } from './input';
import { adaptRes } from './menu';
import { keepsStory, net, netTick, teamName } from './net';
import { drawUI, floats } from './overlay';
import { bolts, burst, cust, lampLights } from './scenery';
import { updateDOM } from './screens';
import { HORN_ITEMS, RARITY, SKINS, equipSkin, rollSkin } from './skins';
import { saveBest, saveSkins, saveTot, skins, store, storyClear, storySave } from './store';
import { applyLevel, resetCams, sync, views } from './sync';
import { ui } from './ui';
import { page } from './page';
import { G, HOUSES, KIDS_HOME, MAP, SHOPS, game, nearShop } from './world';

// ---------- what the simulation (or the mirror) says happened ----------
function handle(e: GameEvent) {
  switch (e.k) {
    case 'sfx': SFX[e.n](); break;
    case 'horn': playHorn(e.h); break;
    case 'pop': floats.push({ x: e.x, y: e.y, h: 6, text: e.text, color: e.color, t: 1.4 }); break;
    case 'cust': cust[e.i].custT = 2.5; break;
    case 'burst': burst(e.x, e.y, e.n); break;
    case 'zap': bolts.push({ ...e, t: .2 }); break;
    case 'wx': ui.wxKind = e.w; ui.wxMsgT = 3.5; break;
    case 'hole': holeMesh(e.h); burst(e.h.x, e.h.y, 16); break;
    case 'bowl': break; // the car's fly timer is in the state; sync() tumbles it
    case 'loot':
      if (!G.loot[e.i]) break;
      burst(e.x, e.y, 20);
      if (e.o === net.myOwner && G.loot[e.i].ham) { if (!skins.own.includes('ham')) skins.own.push('ham'); equipSkin('ham'); achToast({ i: '🍖', n: 'Kinkkumittari!', d: 'Joulukinkku skin unlocked and equipped' }); }
      else if (e.o === net.myOwner) { skins.cases++; saveSkins(); achToast({ i: '🎁', n: 'Skin case found!', d: 'Open it from 🎁 Skins on the title screen' }); }
      break;
    case 'level': applyLevel(e.n); break;
    case 'start': resetCams(); break;
    case 'stat': countStat(e.s, e.n, e.max); break;
    case 'ach': unlock(e.a); break;
    case 'run': if (net.role === 'guest') onlineRun(null); else startRun(); break; // an online run is the server's to put on the board
    case 'clear': saveTot(); break;
    case 'over':
      if (G.campaign) {} // story runs stay off the best run and the leaderboard
      else if (net.role === 'guest') { if (!G.pvp) onlineRun(teamName()); } // online: the server has posted the run; it is not this machine's best run either, as it never was a guest's
      else if (!G.pvp) { // a pvp match is not a team run: keep it off the best run and the leaderboard
        if (G.score > store.best) { store.best = G.score; saveBest(); }
        recordRun(); // on this page's own board, and on the worldwide one if the page is on it (board.ts)
      } else { // pvp: the winner counts only on the machine that drives it
        const [a, b] = G.robots.filter(r => !r.kid).sort((x, y) => y.earn - x.earn); // the kid plays for fun, not €
        if (a?.owner === net.myOwner && (!b || a.earn > b.earn)) bump('pvpWin');
      }
      saveTot();
      break;
    case 'storySave': if (keepsStory()) storySave(e.ch, G.money, G.up); break; // online: only on the machine whose story it is
    case 'storyEnd': if (keepsStory()) storyClear(); break;
  }
}
const frozen = () => net.role !== 'guest' && G.paused; // a guest's own menu never stops the room's world
function update(dt: number) {
  tickAskJoin(dt);
  pollPads();
  if (frozen()) return;
  ui.wxMsgT -= dt;
  achTick(dt);
  boardTick();
  for (const f of floats) { f.t -= dt; f.h += 3 * dt; }
  while (floats.length && floats[0].t <= 0) floats.shift();
  // the one place that decides who fills the state in: the network mirror, or the simulation right here
  if (net.role === 'guest') netTick(dt);
  else { feedInputs(); game.step(dt); }
  for (const e of game.drain()) handle(e);
}

await page.scenery; // the map's static scene is built and baked, and scenery.ts has its view: now the game can be shown
for (const e of game.drain()) handle(e); // the level behind the title screen
{ // compile the lit night variant now, behind the title, so the first dark chapter doesn't stall on shader compiles
  const sp = new THREE.SpotLight(); scene.add(sp); lampLights.forEach(l => l.visible = true);
  renderer.compile(scene, camera); scene.remove(sp); lampLights.forEach(l => l.visible = G.darkness > 0);
}
let last = performance.now(), shadowNow = true;
// ?perf: per-phase CPU ms (render includes the GPU: gl.finish) logged every 2 s, also on window.__perf
interface Perf { n: number; t0: number; ms: Record<string, number>; worst: number; x: number; el?: HTMLElement }
const PERF: Perf | null = location.search.includes('perf') ? { n: 0, t0: performance.now(), ms: {}, worst: 0, x: +(new URLSearchParams(location.search).get('perf') ?? 0) || 1 } : null; // ?perf=N draws every frame N times: raise N until fps drops and 1000 / fps / N is the true GPU ms per frame
const lap = PERF ? (k: string, t: number) => { const n = performance.now(); PERF.ms[k] = (PERF.ms[k] || 0) + n - t; return n; } : () => 0;
const dev = window as unknown as Record<string, unknown>; // window.__perf, window.__story: console handles for testing
renderer.setAnimationLoop(now => {
  const raw = (now - last) / 1000, dt = Math.min(.05, raw); last = now;
  if (raw > 0) ui.fps += (1 / raw - ui.fps) * .05;
  let pt = PERF ? performance.now() : 0; const pt0 = pt;
  shadowNow = !MOBILE || !shadowNow; // phones redraw the shadow map every other frame: it is half the triangles of a frame
  update(dt); pt = lap('update', pt); sync(frozen() ? 0 : dt, shadowNow); pt = lap('sync', pt); if (!(PERF && PERF.x > 1)) adaptRes(raw); // a load test must not rescale itself
  const vs = views();
  renderer.shadowMap.needsUpdate = shadowNow;
  renderer.setScissorTest(true);
  for (const v of vs) {
    v.cam.aspect = v.w / v.h; v.cam.far = fog.far + 5; v.cam.updateProjectionMatrix(); // past the fog is just sky colour: don't draw it
    renderer.setViewport(v.x, vh - v.y - v.h, v.w, v.h); renderer.setScissor(v.x, vh - v.y - v.h, v.w, v.h);
    renderer.render(scene, v.cam);
    for (let i = 1; i < (PERF?.x ?? 1); i++) { renderer.shadowMap.needsUpdate = true; renderer.render(scene, v.cam); }
  }
  if (PERF) { renderer.getContext().finish(); pt = lap('render', pt); }
  drawUI(vs); pt = lap('ui', pt);
  updateDOM(); pt = lap('dom', pt);
  if (PERF) {
    PERF.worst = Math.max(PERF.worst, pt - pt0);
    if (++PERF.n && pt - PERF.t0 > 2000) {
      const o: Record<string, number | string> = { fps: Math.round(PERF.n / (pt - PERF.t0) * 1000), worst: +PERF.worst.toFixed(1), calls: renderer.info.render.calls, tris: renderer.info.render.triangles, px: renderer.getPixelRatio(), state: G.state };
      let tot = 0; for (const k in PERF.ms) tot += o[k] = +(PERF.ms[k] / PERF.n).toFixed(2); o.total = +tot.toFixed(2);
      console.log('perf ' + JSON.stringify(dev.__perf = o));
      (PERF.el ||= document.body.appendChild(Object.assign(document.createElement('div'), { style: 'position:fixed;left:50%;bottom:4px;transform:translateX(-50%);z-index:99;font:12px monospace;color:#fff;background:#000a;padding:2px 6px;pointer-events:none' }))).textContent = `${o.fps} fps · ${o.total} ms · res ${(o.px as number).toFixed(2)} · ${o.calls} calls`; Object.assign(PERF, { n: 0, t0: pt, ms: {}, worst: 0 });
    }
  }
  $('touch').hidden = !touchDev || G.state !== 'play' || ui.menuOpen; // only while driving: on the title they sat on top of the menu
  $('tBall').hidden = !G.pvp;
  musicTick();
});

// dev only (?chapter=N): skip to the end of a chapter for testing
if (urlChapter) dev.__story = { drain: () => { G.time = .1; }, end: () => { G.chapter = 9; G.state = 'story'; G.stateT = 0; }, clear: () => { G.delivered = G.quota; }, setDel: (n: number) => { G.delivered = n; },
  tp: (i: number, x: number, y: number) => Object.assign(G.robots[i], { x, y, vx: 0, vy: 0, immune: 0, hitCd: 0 }), cargo: (i: number) => { const c = G.robots[i].cargo; return c && { ...c, icon: ORDERS[c.o].icon }; },
  doors: () => ({ salepa: SHOPS[0].door, home: HOUSES[KIDS_HOME].door, puoti: SHOPS[1].door }), wreck: (i: number) => { const r = G.robots[i]; r.hp = .01; r.hitCd = 0; r.immune = 0; damage(G, r, 1, 'test'); },
  goal: () => G.goalDone, hook: (i: number) => hook(G, G.robots[i]), drop: (i: number) => game.removeRobot(G.robots[i]), robots: () => G.robots.map(r => ({ id: r.id, owner: r.owner, mine: r.owner === net.myOwner, x: Math.round(r.x), y: Math.round(r.y) })), face: (i: number, x: number, y: number) => { const r = G.robots[i]; r.a = Math.atan2(y - r.y, x - r.x); }, eetu: () => G.eetu && { state: G.eetu.state, say: G.eetu.say, x: G.eetu.x, y: G.eetu.y }, pres: () => G.presents.map(({ x, y, gone }) => ({ x, y, gone })), get: () => ({ state: G.state, chapter: G.chapter, level: G.level, quota: G.quota, delivered: G.delivered, money: G.money, up: G.up, campaign: G.campaign, time: G.time, darkness: G.darkness, wx: G.weather.k, santaIn: G.santaIn, ice: G.ice.length, holes: G.holes.length, cars: G.cars.length, peds: G.peds.length, kids: G.kids.map(k => [Math.round(k.x), Math.round(k.y)]), plow: !!G.plow }) };

if (location.search.includes('selftest')) { // ?selftest: the price curve still beats the income curve (55 € a delivery + ~30 € battery bonus, quota 2 + shift)
  const income = (n: number) => Array.from({ length: n }, (_, i) => (3 + i) * 55 + 30).reduce((a, b) => a + b), all = PRICES.reduce((a, b) => a + b);
  console.assert(income(3) < PRICES[0] * 8, 'three shifts buy level 1 of everything');
  console.assert(income(10) * 1.75 < all * UPGRADES.length, 'ten shifts max the whole shop'); // 1.75: thermobox maxed from the start, the best case
  const avg = (a: number[]) => a.reduce((x, y) => x + y) / a.length, trip = avg(SHOPS.flatMap(b => MAP.dests(b).map(i => HOUSES[i]).map(h => dist(b.door, h.door) + dist(h.door, nearShop(h.door).door))));
  // where the battery wall sits: seconds a shift gives per order vs seconds a round trip takes flat out on a clear path
  console.log('selftest wall', { trip: Math.round(trip), perOrder: [1, 3, 5, 7, 10, 14].map(n => `shift ${n}: ${((80 + n * 3) / (2 + n)).toFixed(1)} s`), tripBase: (trip / SURF.path.max).toFixed(1), tripMotor3: (trip / SURF.path.max / 1.6).toFixed(1) });
  console.log('selftest', { after3: income(3), after10: income(10), maxOne: all, maxAll: all * UPGRADES.length });
}
// campaign data invariants: any failure shows as "Assertion failed" in the console
function storyCheck() {
  console.assert(SKINS.some(s => s.k === 'isi' && s.p && RARITY[s.r].n === 'Ultra Rare' && s.story), 'Isi: Ultra Rare, patterned, story-only');
  console.assert(Array.from({ length: 5000 }, rollSkin).every(s => s?.k !== 'isi' && s?.k !== 'h-isi'), 'cases never roll Isi or his horn');
  console.assert(HORNS.slice(1).every(h => h.k.startsWith('h-')) && HORNS.every(h => hasHornSound(h.k)) && new Set(HORNS.map(h => h.k)).size === HORNS.length, 'horn keys unique, h- prefixed, each with a sound');
  console.assert(RARITY.slice(0, 5).every((_, r) => HORN_ITEMS.some(h => h.k && h.r === r && !h.story)), 'every case rarity has a horn');
  console.assert(Array.from({ length: 2000 }, rollSkin).some(s => s.horn), 'cases roll horns');
  console.assert(hornOf('nope') === HORNS[0] && hornOf(1) === HORNS[0], 'unknown horn falls back to the default');
  console.assert(woltN(G, 8) === 0 && woltN(G, 9) === 1 && woltN(G, 12) === 2, 'Woltti couriers start on shift 9');
  console.assert(CHAPTERS.length === 9, 'prologue + 8 chapters');
  console.assert(CHAPTERS.every(c => c.title && c.intro), 'every chapter has title + intro');
  console.assert(CHAPTERS.slice(1).every(c => c.darkness != null && c.quota! > 0 && c.time! > 0), 'every chapter sets darkness, quota, time');
  console.assert(CHAPTERS.every(c => !c.orders || c.orders.length === ORDERS.length), 'order weights match ORDERS');
  console.assert(CHAPTERS.slice(1).every(c => c.darkness! >= 0 && c.darkness! <= .8), 'darkness in range');
  console.assert(ORDERS.filter(o => !o.story).length === 6, 'endless order set unchanged');
  console.assert(CHAPTERS[2].goal === 'collect' && CHAPTERS[2].quota! > 0, 'ch 2 collects presents from the road');
  console.assert(CHAPTERS.slice(1).every(c => c.s1) && !CHAPTERS.some(c => /\b(isi|isä|dad)\b/i.test(c.s1 || '')), 'S-1 has a line per chapter and never names dad');
  console.assert(ORDERS.some(o => o.icon === '🧒' && o.keep && o.dmg === 0) && CHAPTERS[5].goal === 'rescue', 'ch 5: Eetu is safe cargo');
  console.assert(ORDERS.every(o => !o.story || o.home), 'story orders go home');
  console.assert(ORDERS.some(o => o.s1 && o.keep && o.home), "dad's sled exists, survives breakdowns, goes home");
  console.assert(CHAPTERS[8].goal === 'sled' && CHAPTERS[3].orders?.[ORDERS.findIndex(o => o.icon === '🎁')]! > 0, 'ch 3 gives presents, ch 8 ends on the sled');
}
storyCheck();
