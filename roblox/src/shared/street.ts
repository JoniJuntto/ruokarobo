// Everything on the street that is not your robot: Farmari traffic, grumpy locals, their dogs and a moped courier,
// snowball kids, the spurgu and his bottles, Prösma's thieving robots, the plow, and the stun gun to deal with them.
// Ported from updCars/updPeds/updKids/updThieves/updPlow in src/sim/npc.ts and zap() in src/sim/robot.ts.
// ponytail: walkers keep to the road edges instead of the web's sidewalk graph; cars give way only at the crossing;
// the plow is a slow car in the eastbound lane. Still to port: Santa, potholes, weather.
import { Car } from "./drive";
import { Cargo, ORDERS, R, Run, SOLIDS, TREES, W, damage, dist, pushBox, pushOut, surfaceAt } from "./deliver";

// ---- difficulty: every enemy count, speed (px/s; your robot does ~190 on the road, ~120 in snow) and range (px) ----
// ponytail: one fixed difficulty. The web game ramps these up shift by shift; do the same here when shifts are ported
export const TUNE = {
	people: 3, dogs: 1, couriers: 0, kids: 2, spurgus: 1, thieves: 1,
	walk: { person: 40, dog: 50, courier: 60 },
	chase: { person: 55, dog: 75, courier: 90, thief: 95, thiefFlee: 100 }, // the web game's 100/150/160/170/140 outran you
	spot: { person: 70, dog: 90, courier: 150, thief: 220 }, // how close you get before they come for you (web: 110/150/anywhere/420)
	giveUp: 160, // they stop chasing past this
	rest: { person: 12, dog: 10, courier: 15 }, // seconds of peace after a kick (web: 4/3/1.5)
	throwEvery: [5, 7], throwRange: 180, // kids (web: every 2.2–3.5 s from 260 px)
	carSpeed: [65, 90], // traffic (web: 90–130)
	// battery taken per hit, 1 = a full battery (web: car .25, kick .15, dog .08, snowball .06, bottle .04, plow .1)
	hurt: { car: 0.12, kick: 0.08, dog: 0.05, snowball: 0.03, bottle: 0.02, plow: 0.06 },
};

export type PedKind = "person" | "dog" | "courier";
export interface Ped {
	kind: PedKind; x: number; y: number; vx: number; vy: number; tx: number; ty: number; a: number;
	axis: "h" | "v"; c: number; // the road edge it walks along: a horizontal (y = c) or vertical (x = c) line
	mode: "walk" | "chase" | "fall" | "zapped"; t: number; cool: number; kickT: number; zapT: number;
	say: string; sayT: number; moving: boolean; coat: string; hat: string;
}
export interface Traffic { x: number; y: number; dx: number; dy: number; base: number; v: number; color: string; plow?: boolean }
// kids hide in the snow beside the road and throw; the spurgu (bum) reclines on his cardboard and throws bottles
export interface Kid { x: number; y: number; a: number; cool: number; throwT: number; zapT: number; say: string; sayT: number; bum: boolean; coat: string; hat: string }
export interface Ball { x: number; y: number; vx: number; vy: number; h0: number; vh: number; age: number; ft: number; bot: boolean; done?: boolean }
// Prösma's robots: walk a beat, shove you and take your order, run. Bump one to take it back
export interface Thief {
	x: number; y: number; vx: number; vy: number; tx: number; ty: number; a: number; axis: "h" | "v"; c: number;
	cargo?: Cargo; cd: number; imm: number; say: string; sayT: number; stray: boolean; moving: boolean;
}
export interface Street { peds: Ped[]; cars: Traffic[]; kids: Kid[]; balls: Ball[]; thieves: Thief[] }
export const GRAV = 20; // snowball gravity, three.js units/s² (height is in those units)
export const ballH = (b: Ball) => b.h0 + b.vh * b.age - 0.5 * GRAV * b.age * b.age;

const PED_SHOUTS = ["Senkin romu!", "Pois tieltä!", "Robotit vie meidän työt!", "Hitto sentään!", "Mene pois!"];
const COURIER_SHOUTS = ["Tää on mun keikka!", "Robotit vie meidän keikat!", "Pois mun reitiltä!", "Viis tähteä, kiitos!"];
const COATS = ["#c0262d", "#1f4bb8", "#2e8b57", "#f5c400", "#7b4bbf", "#2b2f36", "#ff7b00", "#8b5a2b"];
const CAR_COLORS = ["#c0262d", "#1f4bb8", "#e9edf2", "#2b2f36", "#3d7a4a", "#9aa1a8"];
const EDGES = [948, 1052]; // walkers keep to the road's edges, cars to the lanes between
const pick = <T>(a: T[]) => a[math.floor(math.random() * a.size())];
const say = (p: { say: string; sayT: number }, text: string, t = 1.6) => { p.say = text; p.sayT = t; };
const rnd = (a: number, b: number) => a + math.random() * (b - a);

// Finland drives on the right: eastbound on the south half of the road, southbound on the west half
const LANES = [
	{ x: 0, y: 1025, dx: 1, dy: 0, n: 2 }, { x: 0, y: 975, dx: -1, dy: 0, n: 2 },
	{ x: 975, y: 0, dx: 0, dy: 1, n: 1 }, { x: 1025, y: 0, dx: 0, dy: -1, n: 1 },
];

function walkOn(p: { x: number; y: number; tx: number; ty: number; axis: "h" | "v"; c: number }) { // next spot along its road edge; near the crossing it may turn onto the other road
	if (math.abs((p.axis === "h" ? p.x : p.y) - 1000) < 80 && math.random() < 0.5) { p.axis = p.axis === "h" ? "v" : "h"; p.c = pick(EDGES); }
	const to = 40 + math.random() * (W - 80);
	[p.tx, p.ty] = p.axis === "h" ? [to, p.c] : [p.c, to];
}
const backToEdge = (p: { x: number; y: number; tx: number; ty: number; axis: "h" | "v"; c: number }) => { [p.tx, p.ty] = p.axis === "h" ? [p.x, p.c] : [p.c, p.y]; };

export function newStreet(): Street {
	const peds: Ped[] = [];
	const kinds: PedKind[] = [];
	for (const [k, n] of [["person", TUNE.people], ["dog", TUNE.dogs], ["courier", TUNE.couriers]] as const) for (let i = 0; i < n; i++) kinds.push(k);
	for (const kind of kinds) {
		const axis = math.random() < 0.6 ? "h" : "v", c = pick(EDGES);
		let along = 60 + math.random() * (W - 120);
		if (math.abs(along - 1000) < 250) along += 500; // nobody waits at the spawn point
		const [x, y] = axis === "h" ? [along, c] : [c, along];
		const p: Ped = {
			kind, x, y, vx: 0, vy: 0, tx: x, ty: y, a: 0, axis, c, mode: "walk", t: 0, cool: 3, kickT: 0, zapT: 0,
			say: "", sayT: 0, moving: false, coat: kind === "courier" ? "#00a3d9" : pick(COATS), hat: pick(COATS),
		};
		walkOn(p);
		peds.push(p);
	}
	const cars: Traffic[] = [];
	for (const l of LANES) for (let i = 0; i < l.n; i++) {
		const along = ((i + 0.3 + math.random() * 0.4) / l.n) * W;
		const base = TUNE.carSpeed[0] + math.random() * (TUNE.carSpeed[1] - TUNE.carSpeed[0]);
		cars.push({ x: l.dx !== 0 ? along : l.x, y: l.dy !== 0 ? along : l.y, dx: l.dx, dy: l.dy, base, v: base, color: pick(CAR_COLORS) });
	}
	cars.push({ x: 1050, y: 1025, dx: 1, dy: 0, base: 70, v: 70, color: "#f5a200", plow: true }); // ploughs the eastbound lane, traffic queues behind
	// kids in the snow between the houses and the road, facing it; one spurgu
	const kids: Kid[] = [];
	for (let tries = 0; kids.size() < TUNE.kids + TUNE.spurgus && tries < 400; tries++) {
		const along = rnd(60, W - 60), side = math.random() < 0.5 ? -1 : 1, onH = math.random() < 0.6;
		if (math.abs(along - 1000) < 150) continue;
		const off = 1000 + side * 85, [x, y] = onH ? [along, off] : [off, along];
		if (SOLIDS.some((b) => x > b.x - 10 && x < b.x + b.w + 10 && y > b.y - 10 && y < b.y + b.h + 10 || (b.door.x - x) ** 2 + (b.door.y - y) ** 2 < 60 * 60)) continue;
		if (kids.some((k) => (k.x - x) ** 2 + (k.y - y) ** 2 < 200 * 200)) continue;
		const bum = kids.size() >= TUNE.kids;
		kids.push({
			x, y, a: onH ? (side < 0 ? math.pi / 2 : -math.pi / 2) : side < 0 ? 0 : math.pi, cool: rnd(1, 3), throwT: 0, zapT: 0, say: "", sayT: 0, bum,
			coat: bum ? pick(["#5a4d3a", "#4a4f3a", "#3d3a36"]) : pick(["#ff7b00", "#2d9cff", "#e84393", "#2fbf6a"]),
			hat: bum ? pick(["#6b6b6b", "#7a3b2e"]) : pick(["#dd3333", "#f5c400", "#1f4e9c"]),
		});
	}
	const thieves: Thief[] = [];
	const beats = [["h", 948, 300], ["v", 1052, 1600], ["h", 1052, 1700], ["v", 948, 300]] as const;
	for (let i = 0; i < math.min(TUNE.thieves, beats.size()); i++) {
		const [axis, c, along] = beats[i];
		const [x, y] = axis === "h" ? [along, c] : [c, along];
		const t: Thief = { x, y, vx: 0, vy: 0, tx: x, ty: y, a: 0, axis, c, cd: 0, imm: 0, say: "", sayT: 0, stray: false, moving: false };
		walkOn(t);
		thieves.push(t);
	}
	return { peds, cars, kids, balls: [], thieves };
}

// ---- stun gun: zaps the nearest local, dog or courier within ~45° ahead ----
function zap(st: Street, run: Run, r: Car) {
	run.zaps -= 1;
	run.zapCd = 0.4;
	const fx = math.cos(r.a), fy = math.sin(r.a);
	let best: { x: number; y: number; hit: () => void } | undefined, bd = 120;
	const consider = (x: number, y: number, hit: () => void) => {
		const dx = x - r.x, dy = y - r.y, d = math.sqrt(dx * dx + dy * dy);
		if (d < bd && (dx * fx + dy * fy) / (d > 0 ? d : 1) > 0.7) { best = { x, y, hit }; bd = d; }
	};
	for (const p of st.peds) if (p.mode !== "fall") consider(p.x, p.y, () => {
		p.mode = "zapped"; p.zapT = 3; p.moving = false;
		say(p, p.kind === "dog" ? "Vuh?" : pick(["Bzzzt!", "Aijai!", "Auh!"]), 1.4);
	});
	for (const k of st.kids) consider(k.x, k.y, () => { k.zapT = 3; say(k, pick(["Bzzzt!", "Aijai!", "Auh!"]), 1.4); });
	for (const t of st.thieves) consider(t.x, t.y, () => { t.cd = 3; say(t, "Bzzzt! ⚡", 1.4); }); // frozen in place: go bump it
	const b = best as { x: number; y: number; hit: () => void } | undefined;
	run.bolts.push({ x1: r.x, y1: r.y, x2: b ? b.x : r.x + fx * 70, y2: b ? b.y : r.y + fy * 70 });
	b?.hit();
}

function updCars(st: Street, run: Run, r: Car, dt: number) {
	for (const c of st.cars) {
		let target = c.base;
		// the main (east-west) road has right of way: side-road cars wait at the line while one is near the crossing
		const toCross = (1000 - c.y) * c.dy;
		if (c.dx === 0 && toCross > 95 && toCross < 140 && st.cars.some((o) => o.dy === 0 && math.abs(o.x - 1000) < 160)) target = 0;
		for (const o of st.cars) { // keep a gap to the car ahead in the same lane
			if (o === c) continue;
			const f = (o.x - c.x) * c.dx + (o.y - c.y) * c.dy, side = math.abs((o.y - c.y) * c.dx - (o.x - c.x) * c.dy);
			if (f > 0 && f < 130 && side < 26 && o.dx * c.dx + o.dy * c.dy > 0.3) target = math.min(target, f < 100 ? 0 : o.v);
		}
		c.v += (target - c.v) * math.min(1, dt * 3);
		c.x += c.dx * c.v * dt;
		c.y += c.dy * c.v * dt;
		if (c.x > W + 80) c.x = -80; else if (c.x < -80) c.x = W + 80; // round the block and back
		if (c.y > W + 80) c.y = -80; else if (c.y < -80) c.y = W + 80;
		if (c.plow) { // shoves robots into the snowbank
			const dd = dist(r, c);
			if (dd >= R + 22) continue;
			const nx = (r.x - c.x) / (dd > 0 ? dd : 1), ny = (r.y - c.y) / (dd > 0 ? dd : 1);
			r.x = c.x + nx * (R + 22);
			r.y = c.y + ny * (R + 22);
			if (run.hitCd <= 0) {
				r.vx = nx * 260 + c.dx * 90;
				r.vy = ny * 260 + c.dy * 90;
				run.stun = 0.6;
				damage(run, r, TUNE.hurt.plow, "Aurauskone! 😵");
			}
			continue;
		}
		// the robot against the car's box (80 × 36 px): pushed out, and thrown if the car is moving
		const ca = c.dx, sa = c.dy, dx = r.x - c.x, dy = r.y - c.y;
		const lx = math.clamp(dx * ca + dy * sa, -40, 40), ly = math.clamp(dy * ca - dx * sa, -18, 18);
		pushOut(r, c.x + lx * ca - ly * sa, c.y + lx * sa + ly * ca, R);
		const f = (r.x - c.x) * ca + (r.y - c.y) * sa, s = (r.y - c.y) * ca - (r.x - c.x) * sa;
		if (c.v > 30 && run.hitCd <= 0 && math.abs(f) < 40 + R + 1 && math.abs(s) < 18 + R + 1) {
			const side = s >= 0 ? 1 : -1; // thrown along the car's way and off to the side it was hit on
			r.vx += ca * c.v * 1.2 - sa * side * 220;
			r.vy += sa * c.v * 1.2 + ca * side * 220;
			run.stun = 0.7;
			damage(run, r, TUNE.hurt.car, "Auts! 🚗");
		}
	}
}

function fall(p: Ped, msg: string) {
	p.mode = "fall";
	p.t = 2.5;
	p.moving = false;
	say(p, p.kind === "dog" ? "Vuh!" : msg, 1.2);
}
function kick(run: Run, p: Ped, r: Car) { // people kick, dogs jump on you
	const dog = p.kind === "dog", a = math.atan2(r.y - p.y, r.x - p.x), f = dog ? 220 : 340;
	r.vx += math.cos(a) * f;
	r.vy += math.sin(a) * f;
	run.stun = math.max(run.stun, dog ? 0.4 : 0.6);
	damage(run, r, dog ? TUNE.hurt.dog : TUNE.hurt.kick, pick(["Auts!", "Apua!", "Hei!"]));
	p.kickT = 0.35;
	say(p, dog ? pick(["Hau hau!", "Murr!", "Vuh vuh!"]) : pick(p.kind === "courier" ? COURIER_SHOUTS : PED_SHOUTS), 1.8);
	p.mode = "walk"; // satisfied, walks off (a courier just circles back)
	p.cool = TUNE.rest[p.kind];
	backToEdge(p);
}

function updPeds(st: Street, run: Run, r: Car, dt: number) {
	for (const p of st.peds) {
		p.t -= dt; p.cool -= dt; p.kickT -= dt; p.sayT -= dt;
		const courier = p.kind === "courier", dog = p.kind === "dog";
		if (p.mode === "fall") { if (p.t <= 0) { p.mode = "walk"; p.cool = 2; } continue; }
		if (p.mode === "zapped") { if ((p.zapT -= dt) <= 0) { p.mode = "walk"; p.cool = courier ? 20 : 3; } continue; } // a zapped courier leaves you alone for 20 s
		if (p.mode === "walk" && p.cool <= 0 && dist(p, r) < TUNE.spot[p.kind]) {
			p.mode = "chase";
			say(p, courier ? "🛵 " + pick(COURIER_SHOUTS) : dog ? "Hau hau! 🐕" : pick(["Hei sinä!", "Taas noi robotit!", "Nyt riitti!"]), 1.5);
		}
		let gx = p.tx, gy = p.ty, sp = TUNE.walk[p.kind];
		if (p.mode === "chase") {
			if (dist(p, r) > TUNE.giveUp) { p.mode = "walk"; p.cool = 2; backToEdge(p); }
			else {
				gx = r.x; gy = r.y; sp = TUNE.chase[p.kind];
				if (dist(p, r) < R + (dog ? 10 : 16) && p.kickT < -0.5) kick(run, p, r);
				if (surfaceAt(p.x, p.y) === "ice" && math.random() < dt * (dog ? 1.2 : 0.8)) { fall(p, "Hups!"); continue; }
			}
		} else if (math.sqrt((p.tx - p.x) ** 2 + (p.ty - p.y) ** 2) < 12) walkOn(p);
		const d = math.sqrt((gx - p.x) ** 2 + (gy - p.y) ** 2);
		p.moving = d > 2 && p.kickT < 0;
		if (p.moving) {
			p.a = math.atan2(gy - p.y, gx - p.x);
			const m = math.min(d, sp * dt);
			p.x += math.cos(p.a) * m;
			p.y += math.sin(p.a) * m;
		}
		for (const b of SOLIDS) pushBox(p, b, 8);
		for (const t of TREES) pushOut(p, t.x, t.y, 8 + t.r);
		p.x = math.clamp(p.x, 8, W - 8);
		p.y = math.clamp(p.y, 8, W - 8);
		p.vx = p.vy = 0;
		if (pushOut(r, p.x, p.y, R + 8) > 130) fall(p, "Auts!"); // ramming at speed knocks them on their behind
	}
}

function updKids(st: Street, run: Run, r: Car, dt: number) {
	for (const k of st.kids) {
		k.cool -= dt; k.throwT -= dt; k.sayT -= dt;
		pushOut(r, k.x, k.y, R + 6); // you can't drive through them
		if ((k.zapT -= dt) > 0 || dist(k, r) > TUNE.throwRange) continue;
		k.a = math.atan2(r.y - k.y, r.x - k.x);
		if (k.cool > 0) continue;
		const ft = dist(k, r) / 300 + 0.15, tx = r.x + r.vx * ft, ty = r.y + r.vy * ft; // lead the target
		const h0 = k.bum ? 0.9 : 1.4;
		st.balls.push({ x: k.x, y: k.y, vx: (tx - k.x) / ft, vy: (ty - k.y) / ft, h0, vh: (0.5 * GRAV * ft * ft - (h0 - 0.3)) / ft, age: 0, ft, bot: k.bum });
		k.cool = k.bum ? rnd(5, 7) : rnd(TUNE.throwEvery[0], TUNE.throwEvery[1]);
		k.throwT = 0.3;
		if (math.random() < 0.4) say(k, pick(k.bum ? ["Ota huikka!", "Skool!", "Hei kaveri!", "Mitä sä tuijotat?"] : ["Hihi!", "Ota tästä!", "Lumisota!"]), 1.2);
	}
	for (const b of st.balls) {
		b.age += dt; b.x += b.vx * dt; b.y += b.vy * dt;
		if (b.age < b.ft) continue;
		b.done = true;
		if (dist(r, b) >= R + 9) continue;
		const s = math.max(1, math.sqrt(b.vx * b.vx + b.vy * b.vy));
		r.vx += (b.vx / s) * 170;
		r.vy += (b.vy / s) * 170;
		run.stun = math.max(run.stun, 0.3);
		if (b.bot) { run.drunk = 5; damage(run, r, TUNE.hurt.bottle, "Hik! 🍾"); }
		else damage(run, r, TUNE.hurt.snowball, "Läts! ❄️");
	}
	st.balls = st.balls.filter((b) => !b.done);
}

function updThieves(st: Street, run: Run, r: Car, dt: number) {
	for (const t of st.thieves) {
		t.cd -= dt; t.imm -= dt; t.sayT -= dt; // cd > 0: stunned
		if (t.cargo && t.sayT <= 0) say(t, ORDERS[t.cargo.o].icon + " 😈", 0.3); // the loot stays on show
		const prey = !t.cargo && run.cargo !== undefined && dist(t, r) < TUNE.spot.thief;
		let gx = t.tx, gy = t.ty, sp = 60;
		if (t.cargo && dist(t, r) < 320) { gx = 2 * t.x - r.x; gy = 2 * t.y - r.y; sp = TUNE.chase.thiefFlee; t.stray = true; } // runs, but a robot on a clear road (190) catches it
		else if (prey) { gx = r.x; gy = r.y; sp = TUNE.chase.thief; t.stray = true; }
		else if (t.stray) { backToEdge(t); gx = t.tx; gy = t.ty; t.stray = false; } // off its beat: back to it when it calms down
		else if (math.sqrt((gx - t.x) ** 2 + (gy - t.y) ** 2) < 12) { walkOn(t); gx = t.tx; gy = t.ty; }
		const d = math.sqrt((gx - t.x) ** 2 + (gy - t.y) ** 2);
		t.moving = t.cd <= 0 && d > 2;
		if (t.moving) {
			t.a = math.atan2(gy - t.y, gx - t.x);
			const m = math.min(d, sp * dt);
			t.x += math.cos(t.a) * m;
			t.y += math.sin(t.a) * m;
		}
		// no pathfinding, it steers straight and slides along walls: a cornered thief is the catchable kind
		for (const b of SOLIDS) pushBox(t, b);
		for (const tr of TREES) pushOut(t, tr.x, tr.y, R + tr.r);
		t.x = math.clamp(t.x, 10, W - 10);
		t.y = math.clamp(t.y, 10, W - 10);
		t.vx = t.vy = 0;
		const dd = dist(r, t);
		if (dd >= 2 * R) continue;
		const nx = (r.x - t.x) / (dd > 0 ? dd : 1), ny = (r.y - t.y) / (dd > 0 ? dd : 1);
		pushOut(r, t.x, t.y, 2 * R);
		if (t.cargo) { // bumped: you get the order back if you have room for it
			if (t.imm > 0 || run.cargo) continue;
			run.cargo = t.cargo;
			t.cargo = undefined;
			t.cd = 4;
			say(t, "Höh! 😵", 2);
			run.msgs.push("📦 Got it back!");
		} else if (t.cd <= 0) {
			r.vx += nx * 260;
			r.vy += ny * 260;
			run.stun = math.max(run.stun, 0.4);
			if (run.cargo) { t.cargo = run.cargo; run.cargo = undefined; t.imm = 1; say(t, "Prösma kiittää! 😈", 1.5); run.msgs.push("📦 Prösma took your order! Bump it to get it back"); }
			else { t.cd = 1.5; say(t, "Pois tieltä!", 1); }
		}
	}
}

// one street step: zapper (edge-triggered on the zap key), traffic, walkers
export function stepStreet(st: Street, run: Run, r: Car, z: boolean, dt: number) {
	run.zaps = math.min(3, run.zaps + dt / 6);
	run.zapCd -= dt;
	if (z && !run.zPrev && run.stun <= 0 && run.zapCd <= 0 && run.zaps >= 1) zap(st, run, r);
	run.zPrev = z;
	updCars(st, run, r, dt);
	updPeds(st, run, r, dt);
	updKids(st, run, r, dt);
	updThieves(st, run, r, dt);
}
