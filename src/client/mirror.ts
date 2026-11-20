// The mirror: fills a GameState from level messages and snapshots instead of simulating it, and glides
// everything between snapshots. This is the old guest path. The renderer reads the same state either way.
// Pure data, no DOM: whatever receives the messages (client/net.ts) calls these.
import { SANTA_V } from '../sim/data';
import { newRobot } from '../sim/game';
import { cv, fx, tickClock, unit } from '../sim/state';
import type { Cargo, FxEvent, GameState } from '../sim/types';
import { dist } from '../sim/util';
import type { LevelMsg, SnapMsg } from '../shared/protocol';

const STOLEN: Cargo = { dest: 0, o: 0, cond: 1, t0: 0, t: 0 }; // a mirrored thief only knows that it carries something

export function applyLevelMsg(g: GameState, m: LevelMsg) {
  const A = g.map.AVANTO;
  g.level = m.n; g.campaign = !!m.cg; g.chapter = m.ch || 0; g.presents = m.pr || [];
  g.eetu = m.et ? { x: A.x, y: A.y, state: m.et, say: '', sayT: 0, cool: 1 } : null; g.ice = m.ice; g.holes = m.holes; g.cars = m.cars;
  g.peds = m.peds.map(p => ({ ...p, tx: p.x, ty: p.y, a: 0, vx: 0, vy: 0, mode: 'walk', t: 0, cool: 0, kickT: 0, zapT: 0, say: '', sayT: 0 }));
  g.kids = m.kids.map(k => ({ ...k, cool: 0, throwT: 0, zapT: 0, say: '', sayT: 0 })); g.balls = []; g.loot = m.loot || [];
  g.plow = m.plow && { ...m.plow, a: 0 };
  g.thieves = (m.th || []).map(t => ({ ...t, gx: t.x, gy: t.y, a: 0, vx: 0, vy: 0, cargo: null, cd: 0, imm: 0, say: '', sayT: 0 }));
  g.darkness = cv(g, 'darkness', Math.min(.8, (m.n - 1) * .3));
  fx(g, { k: 'level', n: m.n });
}

// the effects that change state as well as look: a simulator has already applied these to its own state
function applyFx(g: GameState, e: FxEvent) {
  if (e.k === 'hole') g.holes.push(e.h);
  else if (e.k === 'bowl' && g.cars[e.i]) g.cars[e.i].fly = 1.4;
  else if (e.k === 'loot' && g.loot[e.i]) g.loot[e.i].got = 1;
}

export function applySnap(g: GameState, m: SnapMsg) {
  g.campaign = !!m.cg; g.chapter = m.ch || 0; g.paused = !!m.pz;
  ({ st: g.state, pvp: g.pvp, roam: g.roam, level: g.level, time: g.time, quota: g.quota, delivered: g.delivered, score: g.score, bonus: g.bonus,
     money: g.money, up: g.up, banner: g.banner, bannerT: g.bannerT } = m);
  const ids = new Set(m.r.map(s => s.id));
  g.robots = g.robots.filter(r => ids.has(r.id));
  for (const s of m.r) {
    let r = g.robots.find(q => q.id === s.id);
    if (!r) { r = Object.assign(newRobot(g, { id: s.id, owner: s.owner, i: s.i, n: s.n }), { x: s.x, y: s.y, a: s.a }); g.robots.push(r); }
    Object.assign(r, { owner: s.owner, n: s.n, skin: s.sk || '', tx: s.x, ty: s.y, ta: s.a, vx: s.vx, vy: s.vy, cargo: s.cargo, hole: s.hole || null,
                       esc: s.esc, stun: s.stun, say: s.say, sayT: s.sayT, boost: s.bo, boostLock: s.bl, boosting: s.bz, dTier: s.dk || 0, zaps: s.zp, hp: s.hp ?? 1, earn: s.e ?? 0, drunk: s.dr || 0, lag: s.lg || 0, kid: !!s.kd, throwT: s.th || 0, tow: s.tw, towT: s.tw >= 0 ? 1 : 0 });
  }
  m.c.forEach(([tx, ty, a], i) => g.cars[i] && Object.assign(g.cars[i], { tx, ty, a }));
  m.p?.forEach((q, i) => g.peds[i] && Object.assign(g.peds[i], { tx: q.x, ty: q.y, a: q.a, mode: q.m, kickT: q.k ? .3 : 0, moving: q.mv, say: q.s, sayT: q.st }));
  m.tv?.forEach((q, i) => g.thieves[i] && Object.assign(g.thieves[i], { tx: q.x, ty: q.y, a: q.a, cargo: q.c ? STOLEN : null, cd: q.z, mode: q.m, say: q.s, sayT: q.st }));
  m.kd?.forEach((q, i) => g.kids[i] && Object.assign(g.kids[i], { a: q.a, throwT: q.th, say: q.s, sayT: q.st, zapT: q.z ? 1 : 0 }));
  g.balls = m.b || []; g.weather = m.wx || g.weather;
  g.boxes.forEach((b, i) => b.t = +(m.bxs?.[i] === '1'));
  if (g.plow && m.pl) Object.assign(g.plow, { tx: m.pl.x, ty: m.pl.y, a: m.pl.a });
  // Santa: mirrors fly him on between snapshots (mirrorTick). Each one turns him the way the simulation's is heading and
  // pulls him part of the way over to it, so what he cuts off a corner (33 px a snapshot at his speed) does not stay with him
  const sa = g.santa;
  if (!m.sa) g.santa = null; else if (!sa || dist(sa, m.sa) > 150) g.santa = m.sa;
  else { sa.a = m.sa.a; sa.x += (m.sa.x - sa.x) * .3; sa.y += (m.sa.y - sa.y) * .3; }
  if (g.eetu && m.et) Object.assign(g.eetu, { state: m.et.s, say: m.et.say, sayT: m.et.sayT });
  [...(m.pg || '')].forEach((gone, i) => { const p = g.presents[i]; if (p && gone === '1') p.gone = true; });
  [...(m.ig || '')].forEach((gone, i) => { if (g.ice[i] && gone === '1') g.ice[i].gone = true; });
  for (const e of m.fx) { applyFx(g, e); fx(g, e); }
}

// one frame between snapshots: advance the clock, extrapolate, ease towards the last known positions
export function mirrorTick(g: GameState, dt: number) {
  tickClock(g, dt);
  const k = 1 - Math.exp(-15 * dt);
  for (const r of g.robots) {
    if (r.tx == null || r.ty == null || r.ta == null) continue;
    r.tx += r.vx * dt; r.ty += r.vy * dt; // extrapolate between snapshots
    r.x += (r.tx - r.x) * k; r.y += (r.ty - r.y) * k;
    const d = r.ta - r.a; r.a += Math.atan2(Math.sin(d), Math.cos(d)) * k;
    r.sayT -= dt;
  }
  for (const p of [...g.peds, ...g.thieves]) if (p.tx != null && p.ty != null) { p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k; if ('kickT' in p) p.kickT -= dt; p.sayT -= dt; }
  for (const c of g.cars) {
    if (c.tx != null && c.ty != null) { // a car that went round the map's edge, or started again on another street, jumps
      if (Math.hypot(c.tx - c.x, c.ty - c.y) > 400) { c.x = c.tx; c.y = c.ty; } else { c.x += (c.tx - c.x) * k; c.y += (c.ty - c.y) * k; }
    }
    if (c.fly! > 0) c.fly! -= dt;
  }
  if (g.santa) { const [ca, sa] = unit(g.santa); g.santa.x += ca * SANTA_V * dt; g.santa.y += sa * SANTA_V * dt; }
  if (g.plow?.tx != null && g.plow.ty != null) { g.plow.x += (g.plow.tx - g.plow.x) * k; g.plow.y += (g.plow.ty - g.plow.y) * k; }
  for (const b of g.balls) { b.age += dt; b.x += b.vx * dt; b.y += b.vy * dt; }
  for (const q of g.kids) { q.throwT -= dt; q.sayT -= dt; }
}
