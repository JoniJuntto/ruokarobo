// Orders, the Salepa shop, houses, and bumping into them. Rules ported from updRobot() in src/sim/robot.ts
// and ORDERS in src/sim/data.ts. Units are web-game px and seconds.
// ponytail: one shop, the 5 regular orders; the sofa (needs two robots) waits for multiplayer.
import { Car, Surface } from "./drive";

export const R = 7; // robot radius
export const W = 2000; // the village is W×W px
// surfaces in px, last match wins; everything else is snow
export const ZONES: { k: Surface; x: number; y: number; w: number; h: number }[] = [
	{ k: "path", x: 0, y: 940, w: W, h: 120 },
	{ k: "path", x: 940, y: 0, w: 120, h: W },
	{ k: "ice", x: 1250, y: 1250, w: 500, h: 400 },
];
export function surfaceAt(x: number, y: number): Surface {
	let k: Surface = "snow";
	for (const z of ZONES) if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) k = z.k;
	return k;
}
const DOOR = 45; // how close to a door counts as "there"

export interface Order { icon: string; name: string; w: number; dmg?: number; bonus?: number; time?: number; tipX?: number; heavy?: boolean }
export const ORDERS: Order[] = [
	{ icon: "🛍️", name: "Groceries", w: 4 },
	{ icon: "🥚", name: "Eggs – fragile!", dmg: 2.5, bonus: 10, w: 2 },
	{ icon: "🍦", name: "Ice cream – hurry!", time: 0.6, bonus: 10, w: 2 },
	{ icon: "🍉", name: "Heavy order", heavy: true, bonus: 15, w: 2 },
	{ icon: "🍕", name: "Hot pizza – tip cools fast", time: 0.8, tipX: 2, w: 2 },
];

export interface Pt { x: number; y: number }
export interface Building { x: number; y: number; w: number; h: number; door: Pt; name: string }
const building = (name: string, x: number, y: number, w: number, h: number, dx: number, dy: number): Building =>
	({ name, x, y, w, h, door: { x: dx, y: dy } });

// a road cross through the middle of a 2000 px field (x and y 940–1060), houses facing it
export const SHOP = building("SALEPA", 700, 740, 200, 160, 800, 925);
export const HOUSES: Building[] = [];
for (const x of [200, 450, 1300, 1550, 1750]) {
	HOUSES.push(building(`Talo ${HOUSES.size() + 1}`, x, 780, 150, 120, x + 75, 925)); // north of the road
	HOUSES.push(building(`Talo ${HOUSES.size() + 1}`, x, 1100, 150, 120, x + 75, 1075)); // south
}
for (const y of [200, 450, 1300, 1550]) {
	HOUSES.push(building(`Talo ${HOUSES.size() + 1}`, 780, y, 120, 150, 925, y + 75)); // west
	HOUSES.push(building(`Talo ${HOUSES.size() + 1}`, 1100, y, 120, 150, 1075, y + 75)); // east
}
export const SOLIDS = [SHOP, ...HOUSES];
export const inLake = (x: number, y: number) => x > 1220 && x < 1780 && y > 1220 && y < 1680;

// spruces in the yards, from a seeded LCG (like the web's seeded()): a server and its clients plant the same forest
export interface Tree { x: number; y: number; r: number }
export const TREES: Tree[] = [];
{
	let s = 7;
	const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; // exact in doubles: no bit ops needed
	for (let i = 0; i < 500 && TREES.size() < 60; i++) {
		const x = 40 + rnd() * 1920, y = 40 + rnd() * 1920;
		if (x > 880 && x < 1120 || y > 880 && y < 1120 || inLake(x, y)) continue; // off the roads and the lake
		if (SOLIDS.some((b) => x > b.x - 40 && x < b.x + b.w + 40 && y > b.y - 40 && y < b.y + b.h + 40)) continue;
		if (TREES.some((t) => (t.x - x) ** 2 + (t.y - y) ** 2 < 70 * 70)) continue;
		TREES.push({ x, y, r: 6 }); // the trunk: the robot fits under the branches
	}
}

export interface Cargo { o: number; dest: number; cond: number; t: number; t0: number }
export interface Bolt { x1: number; y1: number; x2: number; y2: number }
// one robot's shift: the order it carries, its battery, and what happened this frame for the screen to show
export interface Run {
	T: number; money: number; delivered: number; cargo?: Cargo;
	hp: number; hitCd: number; stun: number; immune: number; // battery 0..1, then the web game's timers
	zaps: number; zapCd: number; zPrev: boolean; // stun gun: 3 charges, one back every 6 s
	drunk: number; // seconds of the spurgu's bottle left: steering flips and sways
	msgs: string[]; bolts: Bolt[]; // drained by the client each frame
}
export const newRun = (): Run => ({
	T: 0, money: 0, delivered: 0, hp: 1, hitCd: 0, stun: 0, immune: 0, zaps: 3, zapCd: 0, zPrev: false, drunk: 0, msgs: [], bolts: [],
});

export const dist = (a: Pt, b: Pt) => math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
export const isHeavy = (run: Run) => run.cargo !== undefined && ORDERS[run.cargo.o].heavy === true;

// damage() from src/sim/robot.ts: dents the cargo, drains the battery; empty battery = out cold and the order is lost
export function damage(run: Run, r: Car, amt: number, msg: string) {
	if (run.hitCd > 0) return;
	run.hitCd = 0.7;
	if (msg !== "") run.msgs.push(msg);
	if (run.cargo) run.cargo.cond = math.max(0, run.cargo.cond - amt * (ORDERS[run.cargo.o].dmg ?? 1));
	if (run.immune > 0) return;
	run.hp = math.max(0, run.hp - amt);
	if (run.hp <= 0) { // a few seconds of sparks, then back up on half a battery
		run.hp = 0.5;
		run.stun = math.max(run.stun, 2.5);
		run.immune = 3;
		r.vx = r.vy = 0;
		run.msgs.push("Rikki! 🔧");
		if (run.cargo) { run.cargo = undefined; run.msgs.push("📦 Tilaus meni! Back to Salepa"); }
	}
}

function pickOrder() {
	let x = math.random() * ORDERS.reduce((a, o) => a + o.w, 0);
	return ORDERS.findIndex((o) => (x -= o.w) < 0);
}

// push the robot out of a box; returns how fast it was going into it
export function pushBox(r: Car | Body, b: Building, rad = R): number {
	let px = math.clamp(r.x, b.x, b.x + b.w), py = math.clamp(r.y, b.y, b.y + b.h);
	let nx = r.x - px, ny = r.y - py;
	const d = math.sqrt(nx * nx + ny * ny);
	if (d >= rad) return 0;
	if (d < 0.001) { // centre got inside: out through the nearest side
		const l = r.x - b.x, rt = b.x + b.w - r.x, t = r.y - b.y, bt = b.y + b.h - r.y, m = math.min(l, rt, t, bt);
		[nx, ny] = m === l ? [-1, 0] : m === rt ? [1, 0] : m === t ? [0, -1] : [0, 1];
		px = m === l ? b.x : m === rt ? b.x + b.w : r.x;
		py = m === t ? b.y : m === bt ? b.y + b.h : r.y;
	} else { nx /= d; ny /= d; }
	r.x = px + nx * rad;
	r.y = py + ny * rad;
	const vn = r.vx * nx + r.vy * ny;
	if (vn < 0) { r.vx -= 1.4 * vn * nx; r.vy -= 1.4 * vn * ny; }
	return -vn;
}

// pushOut() from src/sim/util.ts: push the robot out of a round obstacle; returns how fast it was going into it
export interface Body { x: number; y: number; vx: number; vy: number }
export function pushOut(r: Body, cx: number, cy: number, minD: number): number {
	let dx = r.x - cx, dy = r.y - cy, d = math.sqrt(dx * dx + dy * dy);
	if (d >= minD) return 0;
	if (d < 0.001) { dx = 0; dy = 1; d = 1; }
	const nx = dx / d, ny = dy / d;
	r.x = cx + nx * minD;
	r.y = cy + ny * minD;
	const vn = r.vx * nx + r.vy * ny;
	if (vn < 0) { r.vx -= 1.4 * vn * nx; r.vy -= 1.4 * vn * ny; }
	return -vn;
}

// one step after driving: walls, trees, the order clock, pickups and deliveries
export function tick(run: Run, r: Car, dt: number) {
	run.T += dt;
	run.hitCd -= dt;
	run.immune -= dt;
	run.stun -= dt;
	run.drunk = math.max(0, run.drunk - dt);
	if (run.stun <= 0 && run.hitCd <= 0) run.hp = math.min(1, run.hp + dt * 0.012); // flat self-repair, like the web game
	let hit = 0;
	for (const b of SOLIDS) hit = math.max(hit, pushBox(r, b));
	for (const t of TREES) hit = math.max(hit, pushOut(r, t.x, t.y, R + t.r));
	if (hit > 150) damage(run, r, 0.08, "Auts!"); // a real crash, not a scrape
	if (run.cargo) run.cargo.t -= dt;

	if (!run.cargo && dist(r, SHOP.door) < DOOR) {
		const o = pickOrder(), O = ORDERS[o], dest = math.floor(math.random() * HOUSES.size());
		// each order has a deadline: arrive in time for the speed tip
		const t = math.round((8 + dist(SHOP.door, HOUSES[dest].door) / 60) * (O.time ?? 1));
		run.cargo = { o, dest, cond: 1, t, t0: run.T };
		run.msgs.push(`${O.icon} ${O.name} → ${HOUSES[dest].name}`);
	} else if (run.cargo && dist(r, HOUSES[run.cargo.dest].door) < DOOR) {
		const c = run.cargo, O = ORDERS[c.o], late = c.t <= 0, tipX = O.tipX ?? 1;
		const pay = math.round((late ? 10 : 20) + (O.bonus ?? 0) + math.round(15 * c.cond) + (late ? 0 : math.min(20 * tipX, math.round(c.t * tipX))));
		run.money += pay;
		run.delivered += 1;
		run.cargo = undefined;
		let msg = `+${pay} €${late ? " (myöhässä)" : c.cond > 0.8 ? " Kiitos!" : " Vähän kolhuja…"}`;
		if (!late && math.random() < 0.25) { r.boost = 1; msg += "  🥐 Mummo gave you pulla! Boost full"; } // mummo at the door
		run.msgs.push(msg);
	}
}
