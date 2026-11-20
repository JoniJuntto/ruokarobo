// Robots: driving physics, damage, the zapper, the hook, snowballs, power-ups, picking up and delivering orders.
import { EETU, KID_SP, GRAV, LAG, ORDERS, SLED, hornOf } from './data';
import { bump, chap, fx, most, pop, say, sfx, surf, surface } from './state';
import type { GameState, Input, Kid, Ped, Robot, Thief } from './types';
import { R, clamp, dist, pick, pushOut, pushTrees } from './util';

const ZERO: Input = { t: 0, s: 0 };
const input = (g: GameState, r: Robot): Input => g.inputs[r.id] || ZERO;

function pickOrder(g: GameState) {
  const ws = (chap(g)?.orders || ORDERS.map(o => o.w)).map((w, i) => ORDERS[i].duo && (g.robots.length < 2 || g.pvp) && !chap(g)?.orders ? 0 : w); // a chapter's own weights are used as given
  let x = Math.random() * ws.reduce((a, w) => a + w, 0);
  return ws.findIndex(w => (x -= w) < 0);
}
// a sofa only moves at a crawl unless a teammate drives right next to it
export const helper = (g: GameState, r: Robot) => g.robots.find(q => q !== r && !q.hole && dist(q, r) < 2 * R + 26);
export const isDuo = (r: Robot) => !!r.cargo && !!ORDERS[r.cargo.o].duo;
export function damage(g: GameState, r: Robot, amt: number, msg: string) {
  if (r.hitCd > 0) return;
  if (r.kid) { r.hitCd = .7; r.stun = Math.max(r.stun, 2); r.vx = r.vy = 0; say(r, pick(['Auts!', 'Hei!', 'Äiti!']), 1); sfx(g, 'kick'); return; } // pvp kid: no battery, just knocked over
  r.hitCd = .7; say(r, msg, 1); bump(g, 'dmg'); g.stats.streak = 0;
  if (r.cargo) r.cargo.cond = Math.max(0, r.cargo.cond - amt * (1 - .28 * g.up.susp) * (ORDERS[r.cargo.o].dmg ?? 1));
  sfx(g, 'crash');
  if (r.immune > 0) return;
  r.hp = Math.max(0, r.hp - amt * (1 - .28 * g.up.susp));
  if (r.hp <= 0) { // out cold: a few seconds of sparks, then back up on half a battery
    r.hp = .5; r.stun = Math.max(r.stun, 2.5); r.immune = 3; r.vx = r.vy = 0;
    say(r, 'Rikki! 🔧', 2.5); fx(g, { k: 'burst', x: r.x, y: r.y, n: 26 }); bump(g, 'broke');
    if (r.cargo && !ORDERS[r.cargo.o].keep) { r.cargo = null; pop(g, r, '📦 Tilaus meni!', '#ff9b9b'); bump(g, 'lostOrder'); } // order is lost: back to Salepa
  }
}
function zap(g: GameState, r: Robot) {
  r.zaps -= 1; r.zapCd = .4; sfx(g, 'zap');
  const fx_ = Math.cos(r.a), fy = Math.sin(r.a);
  let best: Ped | Kid | Thief | Robot | null = null, bd = 120 + 50 * g.up.tesla;
  for (const e of [...g.peds, ...g.kids, ...g.thieves, ...(g.pvp ? g.robots.filter(q => q !== r && !q.hole) : [])]) {
    if ('mode' in e && e.mode === 'fall') continue;
    const dx = e.x - r.x, dy = e.y - r.y, d = Math.hypot(dx, dy);
    if (d < bd && (dx * fx_ + dy * fy) / (d || 1) > .7) { best = e; bd = d; } // within ~45° ahead
  }
  fx(g, { k: 'zap', x1: r.x, y1: r.y, x2: best ? best.x : r.x + fx_ * 70, y2: best ? best.y : r.y + fy * 70 });
  if (!best) return;
  if ('owner' in best) { best.stun = Math.max(best.stun, 1.5); best.vx = best.vy = 0; say(best, 'Bzzzt! ⚡', 1.4); bump(g, 'rivals'); return; }
  if ('cd' in best) { best.cd = 3; say(best, 'Bzzzt! ⚡', 1.4); return; } // a Prösma robot, frozen in place: go bump it
  const ped = 'kind' in best ? best : null; // a local, a dog or a courier; otherwise it is a snowball kid
  best.zapT = 3; say(best, ped?.kind === 'dog' ? 'Vuh?' : pick(['Bzzzt!', 'Aijai!', 'Auh!']), 1.4);
  bump(g, 'zaps');
  bump(g, ped?.kind === 'dog' ? 'dogs' : ped ? 'peds' : 'kids');
  g.stats.spreeN = g.T - (g.stats.zapT ?? -99) < 5 ? (g.stats.spreeN || 1) + 1 : 1;
  g.stats.zapT = g.T; most(g, 'spree', g.stats.spreeN);
  if (ped) { ped.mode = 'zapped'; ped.moving = false; }
}
export function hook(g: GameState, r: Robot) { // grappling hook: the nearest robot ahead is dragged behind you on a rope for 5 s
  r.hookCd = 8; sfx(g, 'hook');
  const fx_ = Math.cos(r.a), fy = Math.sin(r.a);
  if (g.eetu?.state === 'ice') { // ch 5: hook Eetu out of the avanto; he rides home as cargo
    const dx = g.eetu.x - r.x, dy = g.eetu.y - r.y, d = Math.hypot(dx, dy);
    if (d < 220 && (dx * fx_ + dy * fy) / (d || 1) > .5) {
      if (r.cargo) { r.hookCd = 1; return say(r, 'Kädet täynnä!', 1.2); }
      g.eetu.state = 'carried';
      r.cargo = { dest: g.map.KIDS_HOME, o: EETU, cond: 1, t0: g.T, t: 60 };
      say(r, 'Kiinni! 🪝', 1.4); pop(g, r, '🧒 Eetu is out!', '#ffd84a'); return;
    }
  }
  let best = null, bd = 220;
  for (const q of g.robots) {
    if (q === r || q.hole || q.towT > 0) continue;
    const dx = q.x - r.x, dy = q.y - r.y, d = Math.hypot(dx, dy);
    if (d < bd && (dx * fx_ + dy * fy) / (d || 1) > .5) { best = q; bd = d; } // within ~60° ahead
  }
  if (!best) return say(r, 'Ohi!', 1);
  Object.assign(best, { tow: r.id, towT: 5 }); say(best, 'Hei! 🪝', 1.4); say(r, 'Mukaan! 🪝', 1.4);
}
function snowball(g: GameState, r: Robot) { // pvp only: lob a snowball at the nearest rival ahead, or straight ahead if nobody's there
  r.ballCd = .7;
  const fx_ = Math.cos(r.a), fy = Math.sin(r.a);
  let q = null, bd = 260;
  for (const o of g.robots) {
    if (o === r || o.hole) continue;
    const dx = o.x - r.x, dy = o.y - r.y, d = Math.hypot(dx, dy);
    if (d < bd && (dx * fx_ + dy * fy) / (d || 1) > .6) { q = o; bd = d; } // within ~53° ahead
  }
  const ft = (q ? bd : 160) / 300 + .15, h0 = 1.6; // same arc as the kids' throws
  const tx = q ? q.x + q.vx * ft : r.x + fx_ * 160 + r.vx * ft, ty = q ? q.y + q.vy * ft : r.y + fy * 160 + r.vy * ft; // lead the target
  g.balls.push({ x: r.x, y: r.y, vx: (tx - r.x) / ft, vy: (ty - r.y) / ft, h0, vh: (.5 * GRAV * ft * ft - (h0 - .3)) / ft, age: 0, ft, o: r.id });
}
// power-ups fire the moment you drive through an item box. pvp only, so there's always a rival
export function powerUp(g: GameState, r: Robot) {
  const others = g.robots.filter(q => q !== r);
  const x = Math.random(); // booze 3 %, 3G 4 %, turbo ~54 %, the other five ~8 % each
  const k = x < .03 ? 'booze' : x < .07 ? '3g' : pick(['turbo', 'turbo', 'turbo', 'turbo', 'turbo', 'turbo', 'turbo', 'star', 'storm', 'refill', 'pulla', 'hole']);
  sfx(g, 'pickup');
  if (k === 'turbo') { r.mt = 2.5; r.boost = 1; say(r, '🍄 Turbo!', 1.6); sfx(g, 'boost'); }
  if (k === 'star') { r.immune = 6; r.stun = 0; say(r, '⭐ Koskematon!', 2); }
  if (k === '3g') {
    say(r, '📶 3G kaikille!', 2);
    for (const q of others) { q.lag = 2; say(q, pick(['Lagaa…', 'Yhteys pätkii', '📶 E-verkko?!']), 2); }
    bump(g, 'lag3g');
  }
  if (k === 'booze') { say(r, '🍾 Kippis kaikille!', 2); sfx(g, 'clink'); for (const q of others) { q.drunk = 5; say(q, 'Hik! 🍾', 1.6); } }
  if (k === 'storm') { // every rival gets a bolt, wherever they are
    say(r, '⚡ Ukkosmyrsky!', 2); sfx(g, 'zap');
    for (const q of others) { fx(g, { k: 'zap', x1: r.x, y1: r.y, x2: q.x, y2: q.y }); q.stun = Math.max(q.stun, 1.5); q.vx = q.vy = 0; say(q, 'Bzzzt! ⚡', 1.4); }
  }
  if (k === 'refill') { r.hookCd = 0; r.zaps = 3 + 2 * g.up.tesla; say(r, '🪝 Koukku ja ⚡ täynnä!', 1.8); }
  if (k === 'pulla') { r.boost = 1; r.hp = 1; say(r, '🥐 Mummon pulla!', 1.8); }
  if (k === 'hole') { // a fresh pothole dug right behind you, for whoever's following
    say(r, '🕳️ Kuoppa taakse!', 1.8);
    const h = { x: clamp(r.x - Math.cos(r.a) * 40, 20, g.map.W - 20), y: clamp(r.y - Math.sin(r.a) * 40, 20, g.map.H - 20), r: 18 };
    g.holes.push(h); fx(g, { k: 'hole', h });
  }
}
// pvp snowball kid: walks, turns on the spot, throws. no orders, no holes, no score
function kidMove(g: GameState, r: Robot, inp: Input, dt: number) {
  const control = r.stun > 0 ? 0 : 1;
  r.a += inp.s * 3.4 * dt * control;
  if (control) { const v = KID_SP * inp.t * (inp.t < 0 ? .5 : 1); r.vx = Math.cos(r.a) * v; r.vy = Math.sin(r.a) * v; }
  else { r.vx *= Math.exp(-6 * dt); r.vy *= Math.exp(-6 * dt); } // knocked over: slide to a stop
  r.x += r.vx * dt; r.y += r.vy * dt;
  g.map.collide(r, R);
  pushTrees(r, g.map.trees, R);
  r.x = clamp(r.x, R, g.map.W - R); r.y = clamp(r.y, R, g.map.H - R);
  r.ballCd = (r.ballCd || 0) - dt;
  if (inp.x && !r.xPrev && control && r.ballCd <= 0 && g.state === 'play') { snowball(g, r); r.ballCd = .5; r.throwT = .3; }
  r.xPrev = !!inp.x; r.throwT = (r.throwT || 0) - dt;
}
function escape(g: GameState, r: Robot, msg: string, nx = Math.cos(r.a), ny = Math.sin(r.a)) {
  r.hole = null; r.immune = 1.5; r.vx = nx * 150; r.vy = ny * 150;
  say(r, msg); sfx(g, 'escape');
}
export function updRobot(g: GameState, r: Robot, dt: number) {
  r.hitCd -= dt; r.immune -= dt; r.sayT -= dt; r.stun -= dt;
  if (r.stun <= 0 && r.hitCd <= 0) r.hp = Math.min(1, r.hp + dt * .012); // ponytail: flat self-repair, no repair stations
  r.drunk = Math.max(0, (r.drunk || 0) - dt);
  r.lag = Math.max(0, (r.lag || 0) - dt);
  let in0 = input(g, r);
  if (r.lag) { // 3G: inputs arrive LAG seconds late; the first second just replays whatever you were doing when it hit
    const q = r.lagQ ||= []; q.push({ T: g.T, i: in0 });
    while (q.length > 1 && q[1].T <= g.T - LAG) q.shift();
    in0 = q[0].i;
  } else r.lagQ = null;
  const inp = r.drunk ? { ...in0, s: clamp(-in0.s + Math.sin(g.T * 2.3 + r.i) * .7, -1, 1) } : in0; // drunk: steering flips and sways
  if (r.hole) {
    if (inp.t || inp.s) r.esc += dt * .35 * [1, 2, 12, 12][g.up.susp];
    if (r.esc >= 1) { escape(g, r, 'Ylös! 💪'); bump(g, 'holes'); }
    return;
  }
  if (r.towT > 0) { // being towed out by a friend: follow on a rope
    r.towT -= dt;
    const t = g.robots.find(q => q.id === r.tow);
    if (t) {
      const tx = t.x - Math.cos(t.a) * (2 * R + 12), ty = t.y - Math.sin(t.a) * (2 * R + 12);
      r.vx = t.vx + (tx - r.x) * 6; r.vy = t.vy + (ty - r.y) * 6;
      const d = t.a - r.a; r.a += Math.atan2(Math.sin(d), Math.cos(d)) * Math.min(1, dt * 5);
      r.x += r.vx * dt; r.y += r.vy * dt;
      g.map.collide(r, R); // hooked for 5 s: don't drag through houses
      r.x = clamp(r.x, R, g.map.W - R); r.y = clamp(r.y, R, g.map.H - R);
      return;
    }
  }
  if (inp.x && !r.xPrev && g.state === 'title' && g.pvp) { r.kid = !r.kid; say(r, r.kid ? 'Lumisota! ❄️' : 'Robo taas', 1.2); sfx(g, 'join'); }
  if (r.kid) return kidMove(g, r, inp, dt);
  const Sf = { ...surf(g, r.x, r.y) }, control = r.stun > 0 ? 0 : 1;
  if (r.cargo && ORDERS[r.cargo.o].heavy || isDuo(r)) { Sf.acc *= .65; Sf.max *= .8; Sf.kL *= .6; } // watermelons slide
  if (isDuo(r) && !helper(g, r)) { Sf.acc *= .3; Sf.max *= .15; }
  if (g.weather.k === 'blizzard') r.vx += Math.sign(g.wind || 1) * 30 * dt;
  // boost: ~2 s of turbo, recharges in ~7 s; drain it empty and it stays locked until full again. handbrake: wheels lock, back end swings out
  if (r.boost >= 1) r.boostLock = false;
  const boosting = !!(inp.b && inp.t > 0 && !r.boostLock && control); // drains to exactly 0 (clamp) so the lock below engages
  if (boosting && !r.boosting) sfx(g, 'boost');
  r.boost = clamp(r.boost + (boosting ? -dt / (2 + 1.2 * g.up.turbo) : dt / (7 - 1.8 * g.up.turbo)), 0, 1);
  if (r.boost <= 0) r.boostLock = true;
  // stun gun: 3 charges, one recharges every 6 s; zaps the nearest local, dog or kid in front
  r.zaps = Math.min(3 + 2 * g.up.tesla, r.zaps + dt / 6); r.zapCd -= dt;
  if (inp.z && !r.zPrev && control && r.zapCd <= 0 && r.zaps >= 1 && g.state === 'play') zap(g, r);
  r.zPrev = !!inp.z;
  r.hookCd -= dt;
  if (inp.g && !r.gPrev && control && r.hookCd <= 0 && (g.robots.length > 1 || g.eetu?.state === 'ice') && g.state === 'play') hook(g, r);
  r.gPrev = !!inp.g;
  r.ballCd = (r.ballCd || 0) - dt;
  if (inp.x && !r.xPrev && control && g.pvp && r.ballCd <= 0 && g.state === 'play') snowball(g, r);
  r.xPrev = !!inp.x;
  r.hornCd = (r.hornCd || 0) - dt;
  if (inp.o && !r.oPrev && r.hornCd <= 0) { r.hornCd = .5; const h = hornOf(inp.o); fx(g, { k: 'horn', h: h.k }); say(r, h.i + ' Tööt!', .8); }
  r.oPrev = !!inp.o;
  const hb = !!inp.h;
  // drift, kart-style manual: brake + gas + steer at speed. the direction locks in; steer into it to tighten, away to widen.
  // hold it to charge sparks (blue → orange → purple), let go of brake for a mini-turbo. slow down or get stunned and the charge is lost
  const sp0 = Math.hypot(r.vx, r.vy);
  if (!r.dDir && hb && inp.t > 0 && inp.s && sp0 > 70 && control) { r.dDir = Math.sign(inp.s); r.dCh = 0; }
  if (r.dDir && (!hb || inp.t <= 0 || sp0 < 40 || !control)) {
    if (!hb && control && r.dTier) { r.mt = [0, .6, 1.1, 1.7][r.dTier]; sfx(g, 'boost'); }
    r.dDir = r.dCh = r.dTier = 0;
  }
  if (r.dDir) {
    r.dCh += dt * (.7 + .5 * Math.max(0, inp.s * r.dDir)); // tighter line charges faster
    const tier = +(r.dCh >= 1) + +(r.dCh >= 2) + +(r.dCh >= 3.2);
    if (tier > r.dTier) sfx(g, 'spark');
    r.dTier = tier;
  }
  r.mt = Math.max(0, (r.mt || 0) - dt);
  const turbo = boosting || r.mt > 0;
  r.boosting = turbo;
  r.a += (r.dDir ? r.dDir * (.75 + .45 * inp.s * r.dDir) : inp.s * (hb ? 1.7 : 1)) * 3.4 * dt * control;
  const cx = Math.cos(r.a), sy = Math.sin(r.a);
  const acc = Sf.acc * inp.t * (inp.t < 0 ? .6 : 1) * control * (turbo ? 1.9 + .2 * g.up.turbo : 1) * (r.dDir ? .9 : hb ? .2 : 1);
  r.vx += cx * acc * dt; r.vy += sy * acc * dt;
  const kF = r.dDir ? Sf.kF : hb ? Sf.kF + (Sf.ice ? .4 : 3) : Sf.kF, kL = Sf.kL * (r.dDir ? .4 : hb ? .2 : 1), max = Sf.max * (turbo ? 1.5 + .1 * g.up.turbo : 1);
  let f = r.vx * cx + r.vy * sy, l = -r.vx * sy + r.vy * cx;
  f *= Math.exp(-kF * dt); l *= Math.exp(-kL * dt);
  r.vx = f * cx - l * sy; r.vy = f * sy + l * cx;
  const sp = Math.hypot(r.vx, r.vy);
  if (sp > max) { const k = Math.max(max / sp, Math.exp(-3 * dt)); r.vx *= k; r.vy *= k; }
  r.x += r.vx * dt; r.y += r.vy * dt;
  // heated wheels: stay on an ice patch and it melts away (the lake stays frozen)
  if (g.up.heat && Sf.ice) for (const p of g.ice) if (!p.gone && ((r.x - p.x) / p.rx) ** 2 + ((r.y - p.y) / p.ry) ** 2 < 1 && (p.melt = (p.melt || 0) + dt * [0, .85, 2.5, 99][g.up.heat]) >= 1) {
    p.gone = true; pop(g, r, '🔥 Ice melted', '#ffb35c'); sfx(g, 'escape');
  }
  if (g.state === 'play') { // driving counters
    most(g, 'topSp', sp);
    if (Sf.ice) bump(g, 'iceT', dt);
    if (boosting) bump(g, 'boostT', dt);
    if (hb && sp > 80) bump(g, 'driftT', dt);
  }

  if (r.immune <= 0) for (const h of g.holes) if (Math.hypot(r.x - h.x, r.y - h.y) < h.r) {
    if (g.up.susp >= 3) { // suspension 3: over it with a bump, once per pothole until another one
      if (r.overH !== h) { r.overH = h; if (r.cargo) r.cargo.cond = Math.max(0, r.cargo.cond - .04 * (ORDERS[r.cargo.o].dmg ?? 1)); pop(g, r, '🛞 Over it', '#9fd3ff'); sfx(g, 'kick'); }
      break;
    }
    r.hole = h; r.esc = 0; r.x = h.x; r.y = h.y; r.vx = r.vy = 0; bump(g, 'holeIn');
    if (r.cargo) r.cargo.cond = Math.max(0, r.cargo.cond - .15 * (1 - .28 * g.up.susp) * (ORDERS[r.cargo.o].dmg ?? 1));
    say(r, 'Apua! 🆘', 3); sfx(g, 'hole');
    return;
  }
  // avanto: like a pothole, but the cold water also drains the battery and soaks the cargo
  if (r.immune <= 0 && Math.hypot(r.x - g.map.AVANTO.x, r.y - g.map.AVANTO.y) < g.map.AVANTO.r) {
    r.hole = 'avanto'; r.esc = 0; r.x = g.map.AVANTO.x; r.y = g.map.AVANTO.y; r.vx = r.vy = 0;
    if (r.cargo) r.cargo.cond = Math.max(0, r.cargo.cond - .3 * (ORDERS[r.cargo.o].dmg ?? 1));
    damage(g, r, .2, ''); say(r, 'Kylmää! 🥶', 3); sfx(g, 'hole'); fx(g, { k: 'burst', x: r.x, y: r.y, n: 20 });
    return;
  }
  if (g.map.collide(r, R) > 150) { damage(g, r, .08, surface(g, r.x, r.y) === 'ice' ? 'Hups!' : 'Auts!'); bump(g, 'bumps'); }
  let buried = false;
  pushTrees(r, g.map.trees, R, Infinity, (t, v) => { // only the trees around it (util.ts): same pushes, same order
    if (v <= 150) return;
    damage(g, r, .08, 'Auts!');
    // ponytail: half the time the tree drops its snow on you; being buried plays exactly like a pothole
    if ((t.kind === 'spruce' || t.kind === 'birch') && r.immune <= 0 && Math.random() < .5) {
      r.hole = 'snow'; r.esc = 0; r.vx = r.vy = 0; say(r, 'Lunta niskaan! ❄️', 3); sfx(g, 'hole');
      return buried = true;
    }
  });
  if (buried) return;
  r.x = clamp(r.x, R, g.map.W - R); r.y = clamp(r.y, R, g.map.H - R);

  if (g.state !== 'play') return;
  if (r.cargo) r.cargo.t -= dt;
  for (const p of g.presents) if (!p.gone && dist(r, p) < R + 10) { // ch 2: presents on the road count as deliveries
    p.gone = true; g.delivered++;
    pop(g, r, '🎁 Found one', '#ffd84a'); sfx(g, 'pickup');
  }
  const shop = g.map.nearShop(r);
  if (!r.cargo && dist(r, shop.door) < 45 && !g.presents.length && !g.eetu) {
    const near = g.map.dests(shop); // a few doors around this shop, never across the whole map
    // ch 8: once only the sled is missing, S-1 gets it at the next shop it reaches (the HUD points to the nearest)
    const sled = chap(g)?.goal === 'sled' && r === g.robots[0] && g.delivered >= g.quota - 1 && !g.goalDone;
    const o = sled ? SLED : pickOrder(g), O = ORDERS[o], dest = O.home ? g.map.KIDS_HOME : pick(near);
    // each order has a deadline: arrive in time for the speed tip
    r.cargo = { dest, o, cond: 1, t0: g.T, t: Math.round((8 + dist(shop.door, g.map.HOUSES[dest].door) / 60) * (O.time || 1) * (1 + .25 * g.up.box)) };
    say(r, `${O.icon} → ${g.map.HOUSES[dest].addr ?? dest + 1}`); pop(g, r, O.name, '#fff'); sfx(g, 'pickup');
  } else if (r.cargo && dist(r, g.map.HOUSES[r.cargo.dest].door) < 45 && (!isDuo(r) || helper(g, r) || g.campaign && g.robots.length === 1)) {
    const c = r.cargo, O = ORDERS[c.o], late = c.t <= 0, tipX = O.tipX || 1;
    const pay = Math.round(((late ? 10 : 20) + (O.bonus || 0) + Math.round(15 * c.cond) + (late ? 0 : Math.min(20 * tipX, Math.round(c.t * tipX)))) * (1 + .25 * g.up.box));
    g.money += pay; g.score += pay; r.earn += pay; g.delivered += O.duo ? 2 : 1;
    const h = O.duo && helper(g, r); if (h) { say(h, 'Hyvä tiimi! 🛋️'); pop(g, h, '🛋️ Teamwork', '#9fd3ff'); }
    if (c.o === EETU) { g.goalDone = true; g.goalT = g.T; g.eetu!.state = 'home'; say(r, 'Kotona! 💛', 2); }
    if (O.s1) { // the hint: dad always honked three times when he got home
      g.goalDone = true; g.goalT = g.T; sfx(g, 'honk');
      fx(g, { k: 'pop', x: r.x, y: r.y - 45, text: 'Eetu: "Isi tööttäs aina noin."', color: '#ffd84a' });
    }
    pop(g, r, `+${pay} €${late ? ' (late)' : ''}`, late ? '#ff9b9b' : r.color);
    if (c.o !== EETU && !O.s1) say(r, late ? 'Anteeksi, myöhässä…' : c.cond > .8 ? pick(['Kiitos!', 'Ole hyvä!', 'Hyvää ruokahalua!']) : 'Vähän kolhuja…');
    fx(g, { k: 'cust', i: c.dest });
    if (!late && Math.random() < .25) { // mummo at the door hands over a pulla: full boost
      r.boost = 1; fx(g, { k: 'pop', x: r.x, y: r.y - 20, text: '🥐 Mummo gave you pulla! Boost full', color: '#ffd84a' });
      bump(g, 'pulla');
    }
    sfx(g, 'deliver');
    bump(g, 'del'); bump(g, 'd' + c.o); bump(g, 'h' + c.dest); bump(g, 'earn', pay);
    bump(g, late ? 'late' : 'ontime');
    most(g, 'payMax', pay);
    if (c.cond >= 1) bump(g, 'mint');
    if (c.cond <= .2) bump(g, 'wreck');
    if (g.T - c.t0 < 3) bump(g, 'fast3');
    if (O.icon === '🥚' && c.cond >= 1) bump(g, 'eggMint');
    if (O.icon === '🍕' && !late) bump(g, 'pizzaOn');
    if (O.icon === '🍦' && c.t >= 4) bump(g, 'iceFast');
    if (g.weather.k) bump(g, g.weather.k === 'blizzard' ? 'blizzDel' : 'freezeDel');
    g.stats.streak = (g.stats.streak || 0) + 1; most(g, 'streakMax', g.stats.streak);
    r.cargo = null;
  }
}
export function robotPairs(g: GameState, dt: number) {
  for (let i = 0; i < g.robots.length; i++) for (let j = i + 1; j < g.robots.length; j++) {
    const a = g.robots[i], b = g.robots[j];
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    // handoff: park next to a teammate for a moment and the package changes robots
    const key = a.id + '-' + b.id;
    if (g.state === 'play' && !g.pvp && d < 2 * R + 8 && !a.hole && !b.hole && !a.cargo !== !b.cargo && !isDuo(a) && !isDuo(b) && ![a, b].some(q => q.cargo && ORDERS[q.cargo.o].s1) && Math.hypot(a.vx, a.vy) < 50 && Math.hypot(b.vx, b.vy) < 50
        && dist(a, g.map.nearShop(a).door) > 80) {
      g.handT[key] = (g.handT[key] || 0) + dt;
      if (g.handT[key] > .8) {
        const [from, to] = a.cargo ? [a, b] : [b, a];
        to.cargo = from.cargo; from.cargo = null; g.handT[key] = -3;
        say(from, 'Ota tästä! 📦'); say(to, 'Selvä!'); pop(g, to, '🤝 Handoff', '#9fd3ff'); sfx(g, 'pickup'); bump(g, 'handoffs');
      }
    } else g.handT[key] = Math.min(0, (g.handT[key] || 0) + dt);
    if (a.towT > 0 && a.tow === b.id || b.towT > 0 && b.tow === a.id) continue; // a hooked robot gets reeled past you, not into you
    if (d >= 2 * R || d < .001) continue;
    const nx = dx / d, ny = dy / d;
    // friend to the rescue: bumping a stuck robot hooks a tow rope and pulls it out
    if (!g.pvp && a.hole && !b.hole) { escape(g, a, 'Kiitos kaveri! 💛', -nx, -ny); Object.assign(a, { tow: b.id, towT: 1.5 }); g.money += 5; g.score += 5; pop(g, a, 'Rescue +5 €', '#ffd84a'); bump(g, 'rescues'); continue; }
    if (!g.pvp && b.hole && !a.hole) { escape(g, b, 'Kiitos kaveri! 💛', nx, ny); Object.assign(b, { tow: a.id, towT: 1.5 }); g.money += 5; g.score += 5; pop(g, b, 'Rescue +5 €', '#ffd84a'); bump(g, 'rescues'); continue; }
    if (a.hole || b.hole) continue;
    if (a.kid !== b.kid && Math.hypot(b.vx - a.vx, b.vy - a.vy) > 80) damage(g, a.kid ? a : b, 0, ''); // a robot runs the kid over
    const o = (2 * R - d) / 2;
    a.x -= nx * o; a.y -= ny * o; b.x += nx * o; b.y += ny * o;
    const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rv < 0) { const k = rv * .9; a.vx += nx * k; a.vy += ny * k; b.vx -= nx * k; b.vy -= ny * k; }
  }
}
