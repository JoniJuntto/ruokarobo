// Headless cost of one simulation tick per map: `bun tools/bench_sim.ts [level] [robots] [ticks]`.
// Math.random is seeded, so the same build gives the same run every time: the `hash` line is a fingerprint of the
// final state, and an optimisation that is behaviour-preserving leaves it unchanged.
import { createGame } from '../src/sim/game';
import { startLevel } from '../src/sim/level';
import { maps } from '../src/sim/map/index';
import { updCars, updKids, updPeds, updPlow, updThieves } from '../src/sim/npc';
import { robotPairs, updRobot } from '../src/sim/robot';
import { seeded } from '../src/sim/util';

const LEVEL = +(process.argv[2] ?? 8), ROBOTS = +(process.argv[3] ?? 4), TICKS = +(process.argv[4] ?? 6000), DT = 1 / 60;
const ms = () => Bun.nanoseconds() / 1e6;

for (const id of ['village', 'helsinki']) {
  Math.random = seeded(12345);
  const game = createGame(maps[id]), g = game.state;
  const rs = Array.from({ length: ROBOTS }, () => game.addRobot());
  startLevel(g, LEVEL);
  const drive = (i: number) => rs.forEach((r, k) => game.setInput(r.id, { t: (i + k * 200) % 900 < 700 ? 1 : -1, s: Math.sin(i / 90 + k), b: (i + k * 70) % 300 < 60, h: i % 500 > 470, z: (i + k * 50) % 240 === 0, o: i % 400 === 0 && 1 }));
  for (let i = 0; i < 600; i++) { drive(i); g.time = 1e6; game.step(DT); game.drain(); } // warm-up: let the JIT settle
  const t = new Float64Array(TICKS);
  for (let i = 0; i < TICKS; i++) {
    drive(i); g.time = 1e6; if (g.state !== 'play') g.state = 'play'; // a shift that never ends
    const t0 = ms(); game.step(DT); t[i] = ms() - t0; game.drain();
  }
  let hash = 0; for (const e of [...g.robots, ...g.peds, ...g.cars, ...g.thieves, ...g.kids]) hash = (hash * 31 + Math.round(e.x * 1000) + Math.round(e.y * 1000) * 7) % 2147483647;
  const mean = t.reduce((a, b) => a + b) / TICKS, s = Array.from(t).sort((a, b) => a - b);
  console.log(`${id}: level ${LEVEL}, ${ROBOTS} robots, ${g.peds.length} peds, ${g.cars.length} cars, ${g.thieves.length} thieves, ${g.kids.length} kids, ${g.ice.length} ice, ${g.holes.length} holes, ${g.map.trees.length} trees`);
  console.log(`  step ms: mean ${mean.toFixed(4)}  p50 ${s[TICKS >> 1].toFixed(4)}  p99 ${s[TICKS * .99 | 0].toFixed(4)}  max ${s[TICKS - 1].toFixed(3)}  hash ${hash} money ${g.money} T ${g.T.toFixed(3)}`);
  // where the time goes: the same updates run again on the final state, one kind at a time (not a second fingerprint)
  const phase = (name: string, f: () => void, n = 2000) => { const t0 = ms(); for (let i = 0; i < n; i++) f(); return `${name} ${((ms() - t0) / n).toFixed(4)}`; };
  console.log('  phases ms: ' + [phase('robots', () => { g.robots.forEach(r => updRobot(g, r, DT)); robotPairs(g, DT); }), phase('cars', () => updCars(g, DT)), phase('peds', () => updPeds(g, DT)),
    phase('plow', () => updPlow(g, DT)), phase('thieves', () => updThieves(g, DT)), phase('kids', () => updKids(g, DT))].join('  '));
}
