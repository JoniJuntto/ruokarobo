// Headless check: the simulation and the mirror run with no DOM and no three.js.
import { expect, test } from 'bun:test';
import { applyLevelMsg, applySnap, mirrorTick } from '../src/client/mirror';
import { encodeLevel, encodeSnap } from '../src/shared/protocol';
import { createGame } from '../src/sim/game';
import { maps } from '../src/sim/map/index';
import { village } from '../src/sim/map/village';
import { createState, heading, isFx } from '../src/sim/state';
import type { FxEvent, GameState } from '../src/sim/types';
import { clamp, dist } from '../src/sim/util';

const DT = 1 / 60;
const finite = (g: GameState) => {
  for (const k of ['time', 'T', 'score', 'money', 'wind', 'delivered'] as const) expect(Number.isFinite(g[k])).toBe(true);
  for (const e of [...g.robots, ...g.peds, ...g.cars, ...g.thieves, ...g.kids, ...g.balls]) expect(Number.isFinite(e.x) && Number.isFinite(e.y)).toBe(true);
  for (const r of g.robots) for (const k of ['a', 'vx', 'vy', 'hp', 'boost', 'zaps'] as const) expect(Number.isFinite(r[k])).toBe(true);
};

test('a shift on the village map runs headless', () => {
  const game = createGame(village), g = game.state;
  expect(g.state).toBe('title');
  expect(g.ice.length).toBeGreaterThan(0);
  const r = game.addRobot();
  game.pressStart();
  expect(g.state).toBe('play');
  expect(g.quota).toBe(3);
  const t0 = g.time;
  let driven = 0, px = r.x, py = r.y;
  const kinds = new Set<string>();
  for (let i = 0; i < 4000; i++) { // drive, weave, boost in bursts, brake now and then, zap and honk
    game.setInput(r.id, { t: i % 900 < 700 ? 1 : -1, s: Math.sin(i / 90), b: i % 300 < 60, h: i % 500 > 470, z: i % 240 === 0, o: i % 400 === 0 && 1 });
    game.step(DT);
    driven += Math.hypot(r.x - px, r.y - py); px = r.x; py = r.y;
    for (const e of game.drain()) kinds.add(e.k);
    if (i % 500 === 0) finite(g);
  }
  finite(g);
  expect(g.T).toBeCloseTo(4000 * DT, 3);
  expect(g.state === 'play' ? g.time : 0).toBeLessThan(t0);
  expect(driven).toBeGreaterThan(300); // px on the odometer; where it ends up depends on the dice
  expect(r.x).toBeGreaterThanOrEqual(0); expect(r.x).toBeLessThanOrEqual(village.W);
  expect(r.y).toBeGreaterThanOrEqual(0); expect(r.y).toBeLessThanOrEqual(village.H);
  for (const k of ['level', 'start', 'run', 'sfx', 'stat']) expect(kinds.has(k)).toBe(true);
});

test('the battery runs out and a paused game stands still', () => {
  const game = createGame(village), g = game.state;
  game.addRobot(); game.pressStart();
  game.setPaused(true);
  const T = g.T; game.step(DT); expect(g.T).toBe(T);
  game.setPaused(false);
  const kinds = new Set<string>();
  for (let i = 0; i < 60 * 120 && g.state === 'play'; i++) { game.step(DT); for (const e of game.drain()) kinds.add(e.k); }
  expect(g.state).toBe('over');
  expect(kinds.has('over')).toBe(true);
});

test('speedrun splits: each category once a run, on a clock that only runs while driving', () => {
  const game = createGame(village), g = game.state;
  const splits = () => game.drain().flatMap(e => e.k === 'split' ? [e] : []);
  game.addRobot(); game.pressStart();
  for (let i = 0; i < 120; i++) game.step(DT);
  g.stats.del = 5; g.score = 500; // as if five orders had just paid 500 €
  game.step(DT); game.step(DT);
  const got = splits();
  expect(got.map(e => e.c).filter(c => c !== 'pick').sort()).toEqual(['del1', 'del5', 'eur500']);
  for (const e of got) if (e.c !== 'pick') { expect(e.t).toBeGreaterThan(2000); expect(e.t).toBeLessThan(2100); }
  g.state = 'shop'; const T = g.runT; game.step(DT); expect(g.runT).toBe(T); // the workshop is off the clock
  game.quit(); g.pvp = true; g.state = 'title'; game.pressStart(); g.pvp = true; g.stats.del = 9; game.step(DT);
  expect(splits()).toEqual([]); // pvp has no speedruns
  // the story: every chapter is a category, and the whole of it only when it began at the prologue
  g.pvp = false; game.quit(); game.startStory(0); expect(g.fullStory).toBe(true);
  game.startStory(8, { money: 0 }); expect(g.fullStory).toBe(false);
  g.stateT = 1; game.pressStart(); expect(g.state as string).toBe('play');
  for (let i = 0; i < 60; i++) game.step(DT);
  game.drain(); g.goalDone = true; g.goalT = g.T - 4; game.step(DT);
  expect(splits().map(e => e.c)).toEqual(['ch8']);
});

// ---------- every map in the registry ----------
for (const map of Object.values(maps)) {
  // What a room does, without the socket: a game on one side, a blank state on the other, and between them only
  // level messages and snapshots that have been through JSON
  test(`${map.id}: level message and snapshots round-trip through the mirror`, () => {
    const game = createGame(map), g = game.state;
    game.addRobot({ n: 'Aino', skin: 'mint' }); game.addRobot({ owner: 'guest-1', n: 'Eetu' });
    game.pressStart();
    const wire = <T>(m: T): T => JSON.parse(JSON.stringify(m)); // what a socket would do to it
    const mirror = createState(map);
    let pending: FxEvent[] = [], levels = 0, snaps = 0, bytes = 0, tick = 0;
    const flush = () => {
      for (const e of game.drain()) { if (e.k === 'level') { applyLevelMsg(mirror, wire(encodeLevel(g))); levels++; } else if (isFx(e)) pending.push(e); }
    };
    const snap = () => { const s = JSON.stringify(encodeSnap(g, pending)); applySnap(mirror, JSON.parse(s)); pending = []; snaps++; bytes += s.length; };
    const run = (n: number, each?: () => void) => {
      for (let i = 0; i < n; i++, tick++) {
        for (const r of g.robots) game.setInput(r.id, { t: 1, s: Math.sin(tick / 50 + r.id), z: tick % 200 === 0 });
        game.step(DT); flush(); mirrorTick(mirror, DT);
        if (tick % 3 === 0) snap(); // 20 a second
        each?.();
      }
    };
    const settle = () => { snap(); for (let i = 0; i < 30; i++) mirrorTick(mirror, DT); }; // onto the last snapshot (robots keep coasting on their last velocity)
    const turn = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    const carsMatch = () => {
      expect(mirror.cars.length).toBe(g.cars.length);
      for (const [i, c] of g.cars.entries()) { // eased towards whole px, so close rather than equal
        expect(dist(mirror.cars[i], c)).toBeLessThan(3);
        expect(turn(heading(mirror.cars[i]), heading(c))).toBeLessThan(.01);
      }
    };
    flush();
    run(1200); settle();
    expect(levels).toBe(2); expect(snaps).toBe(401); // the title screen's level, then shift 1
    expect(mirror.state).toBe(g.state);
    expect(mirror.level).toBe(g.level); expect(mirror.quota).toBe(g.quota); expect(mirror.time).toBe(g.time);
    expect(mirror.robots.map(r => [r.id, r.owner, r.n, r.skin, r.color])).toEqual(g.robots.map(r => [r.id, r.owner, r.n, r.skin, r.color]));
    for (const [i, r] of g.robots.entries()) expect(dist(mirror.robots[i], r)).toBeLessThan(200);
    for (const k of ['ice', 'holes', 'cars', 'peds', 'kids', 'loot', 'thieves'] as const) expect(mirror[k].length).toBe(g[k].length);
    carsMatch();
    for (const [i, p] of g.peds.entries()) expect(dist(mirror.peds[i], p)).toBeLessThan(3);
    expect(mirror.events.some(e => e.k === 'level')).toBe(true);
    expect(mirror.events.some(e => e.k === 'sfx')).toBe(true);
    expect(bytes / snaps).toBeLessThan(12000); // two robots on shift 1: about 5 kB in the village, 6.5 kB in Helsinki
    finite(mirror);

    // shift 2 has a plow: the mirror's stands where the simulation's does before any snapshot moves it
    g.delivered = g.quota; run(1); expect(g.state).toBe('shop');
    run(70); game.pressStart(); flush();
    expect(g.level).toBe(2); expect(levels).toBe(3);
    expect(g.plow).toBeTruthy(); expect(mirror.plow).toBeTruthy();
    expect(dist(mirror.plow!, g.plow!)).toBeLessThan(1);
    let ploughed = 0, at = { x: g.plow!.x, y: g.plow!.y };

    // Santa: the mirror flies him on its own between snapshots, along whatever street the map sent him down
    let flown = 0, off = 0, worst = 0, sum = 0;
    g.santaIn = 0;
    run(900, () => {
      ploughed += dist(g.plow!, at); at = { x: g.plow!.x, y: g.plow!.y };
      const s = g.santa, ms = mirror.santa;
      if (!s) { if (flown < 5) g.santaIn = 0; return; } // no street for him near the robots just now: ask again
      if (!ms) return; // the snapshot that brings him is at most two ticks away
      flown++;
      worst = Math.max(worst, dist(ms, s)); sum += dist(ms, s); off = Math.max(off, turn(heading(ms), heading(s)));
    });
    expect(flown).toBeGreaterThan(60);
    expect(worst).toBeLessThan(200); // a resync at 150 px, and what he covers until the next snapshot
    expect(sum / flown).toBeLessThan(12); // px off on average: he is on the simulation's street, not beside it
    if (map.id === 'village') expect(off).toBeLessThan(.01); // one straight lane: he never turns
    settle();
    expect(ploughed).toBeGreaterThan(300); // px on its odometer: a plow that turns round in a dead end ends up where it began
    expect(dist(mirror.plow!, g.plow!)).toBeLessThan(3);
    carsMatch();
    finite(mirror);

    game.removeRobot(g.robots[1]);
    applySnap(mirror, wire(encodeSnap(g, [])));
    expect(mirror.robots.length).toBe(1);
  });

  test(`${map.id}: a robot drives a shift and the streets are alive`, () => {
    const game = createGame(map), g = game.state;
    expect(g.ice.length).toBeGreaterThan(0);
    for (const p of g.ice) expect(map.ground(p.x, p.y)).toBe('path'); // ice lies where robots drive
    const r = game.addRobot();
    expect(map.ground(r.x, r.y)).toBe('path'); // it starts on a sidewalk
    game.pressStart();
    expect(g.state).toBe('play');
    expect(g.time).toBe(Math.round(83 * map.timeX)); // shift 1's battery, stretched to the map's distances
    expect(g.cars.length).toBeGreaterThan(0); expect(g.peds.length).toBeGreaterThan(0);
    const cars0 = g.cars.map(c => ({ x: c.x, y: c.y })), peds0 = g.peds.map(p => ({ x: p.x, y: p.y }));
    let driven = 0, onPath = 0, picked = false, px = r.x, py = r.y, back = 0;
    for (let i = 0; i < 3000 && g.state === 'play'; i++) { // drive at the next door (the shop, then the customer); back out when stuck
      const to = r.cargo ? map.HOUSES[r.cargo.dest].door : map.nearShop(r).door, d = Math.atan2(to.y - r.y, to.x - r.x) - r.a;
      if (i % 60 === 59) { if (Math.hypot(r.vx, r.vy) < 15) back = 40; }
      game.setInput(r.id, back-- > 0 ? { t: -1, s: 1 } : { t: 1, s: clamp(Math.atan2(Math.sin(d), Math.cos(d)) * 2, -1, 1) });
      game.step(DT); game.drain();
      driven += Math.hypot(r.x - px, r.y - py); px = r.x; py = r.y;
      if (map.ground(r.x, r.y) === 'path') onPath++;
      if (r.cargo) { picked = true; expect(map.dests(map.nearShop(map.HOUSES[r.cargo.dest].door)).length).toBeGreaterThan(0); }
      if (i % 500 === 0) finite(g);
    }
    finite(g);
    expect(driven).toBeGreaterThan(300);
    expect(onPath).toBeGreaterThan(30);  // ticks spent on a sidewalk or street. It drives as the crow flies, so mostly through snow: 1 village run in 50 has under 200, the worst of 600 had 73
    expect(picked).toBe(true);           // it reached a shop door and was given an order for a door nearby
    expect(r.x).toBeGreaterThanOrEqual(0); expect(r.x).toBeLessThanOrEqual(map.W);
    expect(r.y).toBeGreaterThanOrEqual(0); expect(r.y).toBeLessThanOrEqual(map.H);
    // traffic moved, and stayed on the streets; people walked
    expect(Math.max(...g.cars.map((c, i) => dist(c, cars0[i])))).toBeGreaterThan(300);
    for (const c of g.cars) if (c.x > 0 && c.x < map.W && c.y > 0 && c.y < map.H) expect(map.ground(c.x, c.y)).toBe('path');
    expect(Math.max(...g.peds.map((p, i) => dist(p, peds0[i])))).toBeGreaterThan(50);
  });

  test(`${map.id}: later shifts, the story and Santa roll and run`, () => {
    const game = createGame(map), g = game.state;
    game.addRobot(); game.addRobot();
    const chapter = (ch: number) => { game.quit(); game.startStory(ch); for (let i = 0; i < 40; i++) game.step(DT); game.pressStart(); }; // past the story card
    chapter(2); // presents on the road
    expect(g.state).toBe('play');
    expect(g.presents.length).toBeGreaterThan(0);
    for (const p of g.presents) expect(map.ground(p.x, p.y)).toBe('path');
    chapter(5); // kids, the plow, Eetu in the ice hole
    expect(g.eetu).toBeTruthy(); expect(g.plow).toBeTruthy(); expect(g.kids.length).toBeGreaterThan(0);
    for (const k of g.kids) expect(map.ground(k.x, k.y)).toBe('snow');
    expect(map.ground(map.AVANTO.x, map.AVANTO.y)).toBe('ice');
    let ploughed = 0; // px on its odometer: a plow that turns round in a dead end ends up where it began
    for (let i = 0; i < 600; i++) { const at = { x: g.plow!.x, y: g.plow!.y }; game.step(DT); ploughed += dist(g.plow!, at); }
    expect(ploughed).toBeGreaterThan(300);
    game.quit(); game.pressStart(); // endless: skip ahead to a shift with thieves and Santa on his way
    g.level = 8; g.delivered = g.quota; game.step(DT); expect(g.state).toBe('shop');
    for (let i = 0; i < 70; i++) game.step(DT);
    game.pressStart();
    expect(g.level).toBe(9); expect(g.thieves.length).toBeGreaterThan(0); expect(g.loot.length).toBeGreaterThanOrEqual(2);
    expect(g.peds.some(p => p.kind === 'wolt')).toBe(true);
    g.santaIn = 0;
    let santa = 0;
    for (let i = 0; i < 1500 && g.state === 'play'; i++) {
      for (const r of g.robots) game.setInput(r.id, { t: 1, s: Math.sin(i / 70 + r.id) });
      game.step(DT); game.drain();
      if (g.santa) { santa++; expect(Number.isFinite(g.santa.x) && Number.isFinite(g.santa.y)).toBe(true); }
      else if (santa < 5) g.santaIn = 0; // no street for him near the robots just now: ask again
    }
    expect(santa).toBeGreaterThan(5);
    finite(g);
    for (const b of map.BOXES) expect(map.ground(b.x, b.y)).toBe('path');
    expect(map.BOXES.length).toBe(g.boxes.length);
  });
}

// A server and its browsers each evaluate the map modules themselves, and must end up with the same world.
// A fresh process, with Math.random made to throw, has to roll exactly the trees, solids and item boxes this one did.
test('maps are deterministic: a fresh process builds the same world without Math.random', () => {
  const digest = (m: (typeof maps)[string]) => {
    const probe = Array.from({ length: 400 }, (_, i) => { // the collision world, sampled: solids, walls and surfaces
      const x = (i * 7919 % 1000) / 1000 * m.W, y = (i * 104729 % 1000) / 1000 * m.H, o = { x, y, vx: 0, vy: 0 };
      m.collide(o, 7);
      return [m.ground(x, y), m.insideSolid(x, y), Math.round(o.x * 100), Math.round(o.y * 100)];
    });
    return JSON.stringify([m.id, m.W, m.H, m.trees, m.SOLIDS, m.BOXES, m.LAMPS.length, m.DOORS, Array.from({ length: 8 }, (_, i) => m.spawn(i)), probe]);
  };
  const here = Object.values(maps).map(digest);
  const src = `Math.random = () => { throw new Error('a map rolled Math.random at load'); };
    const { maps } = await import(${JSON.stringify(new URL('../src/sim/map/index.ts', import.meta.url).pathname)});
    const digest = ${digest.toString()};
    console.log(JSON.stringify(Object.values(maps).map(digest)));`;
  const run = Bun.spawnSync([process.execPath, '-e', src]);
  expect(run.stderr.toString()).toBe('');
  expect(JSON.parse(run.stdout.toString())).toEqual(here);
  for (const m of Object.values(maps)) { // and there is a world to agree on
    expect(m.trees.length).toBeGreaterThan(100);
    expect(m.trees.filter(t => t.kind === 'snowman').length).toBeGreaterThanOrEqual(3);
    expect(new Set(m.trees.map(t => `${t.x},${t.y}`)).size).toBe(m.trees.length);
  }
});

// tsconfig.sim.json keeps DOM globals out of the simulation; this keeps three.js and the client out too
test('nothing under src/sim or src/shared imports anything but itself', async () => {
  const { Glob } = await import('bun');
  const { resolve, dirname, relative } = await import('node:path');
  const root = resolve(import.meta.dir, '../src');
  let files = 0;
  for await (const f of new Glob('{sim,shared}/**/*.ts').scan(root)) {
    files++;
    const src = await Bun.file(resolve(root, f)).text();
    for (const m of src.matchAll(/^\s*(?:import|export)\b[^'"\n]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]/gm)) {
      const spec = m[1] ?? m[2] ?? m[3];
      expect(spec.startsWith('.'), `${f} imports ${spec}`).toBe(true);
      const to = relative(root, resolve(root, dirname(f), spec));
      expect(/^(sim|shared)\//.test(to), `${f} imports ${spec}`).toBe(true);
    }
  }
  expect(files).toBeGreaterThan(8);
});
