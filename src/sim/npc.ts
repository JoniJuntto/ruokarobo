// Everything on the street that is not a robot: traffic, grumpy locals and their dogs, couriers, the snowplow,
// Prösma's thieving robots, Santa, snowball kids, Eetu and the weather.
import { GRAV, ORDERS, PED_SHOUTS, WOLT_SHOUTS } from './data';
import { damage, isDuo } from './robot';
import { bump, fx, pop, say, sfx, surface, unit } from './state';
import type { Ball, GameState, Ped, PedMode, Pt, Robot } from './types';
import { R, clamp, dist, pick, pushOut, pushTrees, rnd } from './util';

export function updCars(g: GameState, dt: number) {
  for (const c of g.cars) {
    if (c.fly! > 0) { c.fly! -= dt; c.v = 0; continue; } // bowled over by Santa: a tumbling arc, then back on its wheels
    let target = c.base;
    const [ca, sa] = unit(c); // everything below is in the car's own frame: f px ahead of it, side px to its right
    if (g.map.yields(c, g.robots)) target = 0; // Finnish drivers yield at the suojatie
    for (const o of g.cars) if (o !== c && Math.abs(o.x - c.x) < 130 && Math.abs(o.y - c.y) < 130) { // keep a gap to the car ahead in the same lane
      const f = (o.x - c.x) * ca + (o.y - c.y) * sa, side = Math.abs((o.y - c.y) * ca - (o.x - c.x) * sa), [oa, ob] = unit(o);
      if (f > 0 && f < 130 && side < 26 && oa * ca + ob * sa > .3) target = Math.min(target, f < 100 ? 0 : o.v);
    }
    c.v += (target - c.v) * Math.min(1, dt * 3);
    g.map.drive(c, c.v * dt);
    for (const r of g.robots) {
      if (r.hole) continue;
      const dx = r.x - c.x, dy = r.y - c.y, lx = clamp(dx * ca + dy * sa, -40, 40), ly = clamp(dy * ca - dx * sa, -18, 18);
      pushOut(r, c.x + lx * ca - ly * sa, c.y + lx * sa + ly * ca, R);
      const f = (r.x - c.x) * ca + (r.y - c.y) * sa, s = (r.y - c.y) * ca - (r.x - c.x) * sa;
      if (c.v > 30 && r.hitCd <= 0 && Math.abs(f) < 40 + R + 1 && Math.abs(s) < 18 + R + 1) {
        const side = Math.sign(s || 1); // thrown along the car's way and off to the side it was hit on
        r.vx += ca * c.v * 1.2 - sa * side * 220; r.vy += sa * c.v * 1.2 + ca * side * 220; r.stun = .7;
        damage(g, r, .25, 'Auts! 🚗'); bump(g, 'carHit');
      }
    }
  }
}
const walkTo = (p: { tx: number; ty: number }, to: Pt) => { p.tx = to.x; p.ty = to.y; };
// the nearest robot to p that passes `ok`: what filter().sort(by distance)[0] gave (the first of equals), without a list per walker per tick
function nearest(g: GameState, p: Pt, ok: (r: Robot) => boolean): Robot | undefined {
  let best: Robot | undefined, bd = Infinity;
  for (const r of g.robots) if (ok(r)) { const d = dist(p, r); if (d < bd) { bd = d; best = r; } }
  return best;
}
const upright = (r: Robot) => !r.hole && !r.kid, outOfHole = (r: Robot) => !r.hole;
function fall(g: GameState, p: Ped, msg: string) { p.mode = 'fall'; p.t = 2.5; p.moving = false; say(p, p.kind === 'dog' ? 'Vuh!' : msg, 1.2); sfx(g, 'kick'); fx(g, { k: 'burst', x: p.x, y: p.y, n: 10 }); }
function kick(g: GameState, p: Ped, r: Robot) { // people kick, dogs jump on you
  const dog = p.kind === 'dog', a = Math.atan2(r.y - p.y, r.x - p.x), f = dog ? 220 : 340;
  r.vx += Math.cos(a) * f; r.vy += Math.sin(a) * f; r.stun = dog ? .4 : .6;
  damage(g, r, dog ? .08 : .15, pick(['Auts!', 'Apua!', 'Hei!'])); bump(g, dog ? 'bite' : 'kick');
  p.kickT = .35; say(p, dog ? pick(['Hau hau!', 'Murr!', 'Vuh vuh!']) : pick(p.kind === 'wolt' ? WOLT_SHOUTS : PED_SHOUTS), 1.8); sfx(g, dog ? 'bark' : 'kick');
  fx(g, { k: 'burst', x: r.x, y: r.y, n: 8 });
  Object.assign(p, { mode: 'walk', cool: p.kind === 'wolt' ? 1.5 : dog ? 3 : 4 }); walkTo(p, g.map.walkOn(p, true)); // satisfied, walks off (a courier just circles back)
}
export function updPeds(g: GameState, dt: number) {
  for (const p of g.peds) {
    p.t -= dt; p.cool -= dt; p.kickT -= dt; p.sayT -= dt;
    const wolt = p.kind === 'wolt';
    if (p.mode === 'fall') { if (p.t <= 0) { p.mode = 'walk'; p.cool = 2; } continue; }
    if (p.mode === 'zapped') { if ((p.zapT -= dt) <= 0) { p.mode = 'walk'; p.cool = wolt ? 20 : 3; } continue; } // a zapped courier leaves you alone for 20 s
    const dog = p.kind === 'dog';
    if (p.mode === 'walk' && g.state === 'play' && p.cool <= 0) {
      const r = nearest(g, p, upright);
      if (r && dist(p, r) < (wolt ? Infinity : dog ? 150 : 110)) {
        p.mode = 'chase'; p.target = r;
        if (wolt) say(p, '🛵 ' + pick(WOLT_SHOUTS), 1.5); else if (dog) { say(p, 'Hau hau! 🐕', 1.5); sfx(g, 'bark'); } else say(p, pick(['Hei sinä!', 'Taas noi robotit!', 'Nyt riitti!']), 1.5);
      }
    }
    let gx = p.tx, gy = p.ty, sp = wolt ? 70 : dog ? 60 : 45;
    if (p.mode === 'chase') {
      const r = p.target!;
      if (!g.robots.includes(r) || r.hole || !wolt && dist(p, r) > 260 || g.state !== 'play') { p.mode = 'walk'; p.cool = 2; walkTo(p, g.map.walkOn(p, true)); }
      else {
        gx = r.x; gy = r.y; sp = wolt ? 160 : dog ? 150 : 100; // moped: outruns a robot in snow, loses it on a clear path
        if (dist(p, r) < R + (dog ? 10 : 16) && p.kickT < -.5) kick(g, p, r);
        if (surface(g, p.x, p.y) === 'ice' && Math.random() < dt * (dog ? 1.2 : .8)) { fall(g, p, 'Hups!'); continue; }
      }
    } else if (Math.hypot(p.tx - p.x, p.ty - p.y) < 12) walkTo(p, g.map.walkOn(p));
    const d = Math.hypot(gx - p.x, gy - p.y);
    p.moving = d > 2 && p.kickT < 0;
    if (p.moving) { p.a = Math.atan2(gy - p.y, gx - p.x); const m = Math.min(d, sp * dt); p.x += Math.cos(p.a) * m; p.y += Math.sin(p.a) * m; }
    g.map.curb(p);
    g.map.collide(p, 8);
    pushTrees(p, g.map.trees, 8, 30); // only the trees around them (util.ts): a city has a thousand
    p.x = clamp(p.x, 8, g.map.W - 8); p.vx = p.vy = 0;
    // robots bump people; ramming at speed knocks them on their behind
    for (const r of g.robots) {
      if (r.hole || (p.mode as PedMode) === 'fall') continue; // fall() below may have floored them for the robots after this one
      const chasingSomeoneElse = p.mode === 'chase' && p.target !== r;
      if (pushOut(r, p.x, p.y, R + 8) > 130) {
        fall(g, p, 'Auts!');
        if (chasingSomeoneElse) { g.money += 5; g.score += 5; pop(g, r, 'Saved a friend +5 €', '#ffd84a'); bump(g, 'saved'); }
      }
    }
  }
}
export function updPlow(g: GameState, dt: number) {
  if (!g.plow) return;
  const tx = g.plow.gx!, ty = g.plow.gy!, d = Math.hypot(tx - g.plow.x, ty - g.plow.y);
  if (d < 4) { g.map.plowOn(g.plow); return; }
  g.plow.a = Math.atan2(ty - g.plow.y, tx - g.plow.x);
  const m = Math.min(d, 70 * dt); g.plow.x += Math.cos(g.plow.a) * m; g.plow.y += Math.sin(g.plow.a) * m;
  for (const p of g.ice) if (!p.gone && Math.hypot(p.x - g.plow.x, p.y - g.plow.y) < Math.max(p.rx, p.ry) * .7 + 18) p.gone = true;
  for (const r of g.robots) { // shoves robots into the snowbank
    if (r.hole) continue;
    const dd = dist(r, g.plow);
    if (dd >= R + 22) continue;
    const nx = (r.x - g.plow.x) / (dd || 1), ny = (r.y - g.plow.y) / (dd || 1);
    r.x = g.plow.x + nx * (R + 22); r.y = g.plow.y + ny * (R + 22);
    if (r.hitCd <= 0) {
      r.vx = nx * 260 + Math.cos(g.plow.a) * 90; r.vy = ny * 260 + Math.sin(g.plow.a) * 90; r.stun = .6;
      damage(g, r, .1, 'Aurauskone! 😵'); fx(g, { k: 'burst', x: r.x, y: r.y, n: 20 }); bump(g, 'plowHit');
    }
  }
}
// ---------- Prösma robots: shove you, take the order and run. bump one to take the order back ----------
const stealable = (r: Robot) => !!r.cargo && !r.hole && !isDuo(r) && !ORDERS[r.cargo.o].keep;
export function updThieves(g: GameState, dt: number) {
  for (const t of g.thieves) {
    t.cd -= dt; t.imm -= dt; t.sayT -= dt; // cd > 0: stunned
    if (t.cargo && t.sayT <= 0) say(t, ORDERS[t.cargo.o].icon + ' 😈', .3); // the loot stays on show
    const near = nearest(g, t, outOfHole), st = t.cargo ? undefined : nearest(g, t, stealable), prey = st && dist(t, st) < 420 && st;
    let gx = t.gx, gy = t.gy, sp = 60;
    if (t.cargo && near && dist(t, near) < 320) { gx = 2 * t.x - near.x; gy = 2 * t.y - near.y; sp = 140; t.stray = true; } // runs, but a robot on a clear sidewalk (190) catches it
    else if (prey) { gx = prey.x; gy = prey.y; sp = 170; t.stray = true; } // off its beat: back to it when it calms down
    else if (t.stray || Math.hypot(gx - t.x, gy - t.y) < 12) { const s = g.map.walkOn(t, t.stray); gx = t.gx = s.x; gy = t.gy = s.y; t.stray = false; }
    t.mode = prey ? 'chase' : 'walk';
    const d = Math.hypot(gx - t.x, gy - t.y);
    if (g.state === 'play' && t.cd <= 0 && d > 2) { t.a = Math.atan2(gy - t.y, gx - t.x); const m = Math.min(d, sp * dt); t.x += Math.cos(t.a) * m; t.y += Math.sin(t.a) * m; }
    // ponytail: no pathfinding, it steers straight and slides along walls; a cornered thief is the catchable kind
    g.map.collide(t, R);
    pushTrees(t, g.map.trees, R, 30);
    t.x = clamp(t.x, 10, g.map.W - 10); t.y = clamp(t.y, 10, g.map.H - 10); t.vx = t.vy = 0;
    if (g.state !== 'play') continue;
    for (const r of g.robots) {
      const dd = dist(r, t);
      if (r.hole || dd >= 2 * R) continue;
      const nx = (r.x - t.x) / (dd || 1), ny = (r.y - t.y) / (dd || 1);
      pushOut(r, t.x, t.y, 2 * R);
      if (t.cargo) { // bumped: the order goes back to whoever has room for it
        if (t.imm > 0 || r.cargo) continue;
        r.cargo = t.cargo; t.cargo = null; t.cd = 4;
        say(t, 'Höh! 😵', 2); say(r, 'Mun tilaus! 📦'); pop(g, r, '📦 Got it back', '#9fd3ff'); sfx(g, 'pickup'); fx(g, { k: 'burst', x: t.x, y: t.y, n: 14 });
      } else if (t.cd <= 0) {
        r.vx += nx * 260; r.vy += ny * 260; r.stun = Math.max(r.stun, .4); sfx(g, 'kick');
        if (stealable(r)) { t.cargo = r.cargo; r.cargo = null; t.imm = 1; say(t, 'Prösma kiittää! 😈', 1.5); pop(g, r, '📦 Prösma took your order!', '#ff9b9b'); }
        else { t.cd = 1.5; say(t, 'Pois tieltä!', 1); }
      }
    }
  }
}
// Santa sweeps down a street now and then: cars tumble like pins, robots get flung. Which street, and how far, is the map's call
export function updSanta(g: GameState, dt: number) {
  if (!g.santa) {
    if (g.state !== 'play' || (g.santaIn -= dt) > 0 || !g.robots.length) return;
    g.santaIn = rnd(35, 70);
    g.santa = g.map.santaStart(g.robots);
    if (g.santa) { fx(g, { k: 'wx', w: 'santa' }); sfx(g, 'jingle'); }
    return;
  }
  const santa = g.santa;
  if (!g.map.santaMove(santa, dt)) { g.santa = null; return; }
  const [ca, sa] = unit(santa);
  g.cars.forEach((c, i) => {
    if (c.fly! > 0 || !g.map.santaHits(santa, c)) return;
    c.fly = 1.4; fx(g, { k: 'bowl', i }); fx(g, { k: 'burst', x: c.x, y: c.y, n: 24 }); sfx(g, 'crash');
  });
  for (const r of g.robots) {
    const f = (r.x - santa.x) * ca + (r.y - santa.y) * sa, side = (r.y - santa.y) * ca - (r.x - santa.x) * sa; // ahead of the sleigh, and to its right
    if (r.hole || r.hitCd > 0 || Math.abs(f) > 70 + R || Math.abs(side) > 28 + R) continue;
    const sg = Math.sign(side || 1);
    r.vx = ca * 650 - sa * sg * 320; r.vy = sa * 650 + ca * sg * 320; r.stun = 1;
    damage(g, r, .2, 'Hohoho! 🎅'); fx(g, { k: 'burst', x: r.x, y: r.y, n: 20 }); bump(g, 'santaHit');
  }
}
export const ballH = (b: Ball) => b.h0 + b.vh * b.age - .5 * GRAV * b.age * b.age;
export function updKids(g: GameState, dt: number) {
  for (const k of g.kids) {
    k.cool -= dt; k.throwT -= dt; k.sayT -= dt;
    if (g.state !== 'play' || (k.zapT -= dt) > 0) continue;
    const r = nearest(g, k, upright);
    if (!r || dist(k, r) > 260) continue;
    k.a = Math.atan2(r.y - k.y, r.x - k.x);
    if (k.cool > 0) continue;
    const ft = dist(k, r) / 300 + .15, tx = r.x + r.vx * ft, ty = r.y + r.vy * ft; // lead the target
    const h0 = k.bum ? .9 : 1.4;
    g.balls.push({ x: k.x, y: k.y, vx: (tx - k.x) / ft, vy: (ty - k.y) / ft, h0, vh: (.5 * GRAV * ft * ft - (h0 - .3)) / ft, age: 0, ft, bot: k.bum });
    k.cool = k.bum ? rnd(4, 6) : rnd(2.2, 3.5); k.throwT = .3;
    if (Math.random() < .4) say(k, pick(k.bum ? ['Ota huikka!', 'Skool!', 'Hei kaveri!', 'Mitä sä tuijotat?'] : ['Hihi!', 'Ota tästä!', 'Lumisota!']), 1.2);
  }
  for (const b of g.balls) {
    b.age += dt; b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.age < b.ft) continue;
    b.done = true; fx(g, { k: 'burst', x: b.x, y: b.y, n: 10 });
    for (const r of g.robots) if (r.id !== b.o && !r.hole && Math.hypot(r.x - b.x, r.y - b.y) < R + 9) {
      const s = Math.hypot(b.vx, b.vy) || 1;
      r.vx += b.vx / s * 170; r.vy += b.vy / s * 170; r.stun = Math.max(r.stun, .3);
      if (b.bot) { r.drunk = 5; damage(g, r, .04, 'Hik! 🍾'); sfx(g, 'clink'); bump(g, 'bottle'); }
      else { damage(g, r, .06, 'Läts! ❄️'); sfx(g, 'splat'); bump(g, 'balls'); }
    }
  }
  g.balls = g.balls.filter(b => !b.done);
}
export function updEetu(g: GameState, dt: number) {
  if (g.state !== 'play' || g.eetu?.state !== 'ice') return;
  g.eetu.sayT -= dt;
  if ((g.eetu.cool -= dt) <= 0) { g.eetu.cool = rnd(2.5, 4); g.eetu.say = pick(['Apua!', 'Apuaa! 🥶', 'Täällä!']); g.eetu.sayT = 1.6; }
}
export function updWeather(g: GameState, dt: number) {
  if (g.state !== 'play') return;
  if (g.weather.k) { if ((g.weather.t -= dt) <= 0) { g.weather = { k: null, t: 0 }; g.weatherIn = rnd(25, 45); } return; }
  if ((g.weatherIn -= dt) > 0) return;
  const k = pick(['blizzard', 'freeze'] as const);
  g.weather = { k, t: k === 'blizzard' ? 20 : 15 };
  fx(g, { k: 'wx', w: k }); sfx(g, 'alarm');
}
