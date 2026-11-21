// Orders, the Salepa shop, houses, and bumping into them. Rules ported from updRobot() in src/sim/robot.ts
// and ORDERS in src/sim/data.ts. Units are web-game px and seconds.
// ponytail: one shop, the 5 regular orders; the sofa (needs two robots) waits for multiplayer.
import { Car } from "./drive";

export const R = 7; // robot radius
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

export interface Cargo { o: number; dest: number; cond: number; t: number; t0: number }
export interface Run { T: number; money: number; delivered: number; cargo?: Cargo; hitCd: number }
export const newRun = (): Run => ({ T: 0, money: 0, delivered: 0, hitCd: 0 });

const dist = (a: Pt, b: Pt) => math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
export const isHeavy = (run: Run) => run.cargo !== undefined && ORDERS[run.cargo.o].heavy === true;

function pickOrder() {
	let x = math.random() * ORDERS.reduce((a, o) => a + o.w, 0);
	return ORDERS.findIndex((o) => (x -= o.w) < 0);
}

// push the robot out of a box; returns how fast it was going into it
export function pushBox(r: Car, b: Building): number {
	let px = math.clamp(r.x, b.x, b.x + b.w), py = math.clamp(r.y, b.y, b.y + b.h);
	let nx = r.x - px, ny = r.y - py;
	const d = math.sqrt(nx * nx + ny * ny);
	if (d >= R) return 0;
	if (d < 0.001) { // centre got inside: out through the nearest side
		const l = r.x - b.x, rt = b.x + b.w - r.x, t = r.y - b.y, bt = b.y + b.h - r.y, m = math.min(l, rt, t, bt);
		[nx, ny] = m === l ? [-1, 0] : m === rt ? [1, 0] : m === t ? [0, -1] : [0, 1];
		px = m === l ? b.x : m === rt ? b.x + b.w : r.x;
		py = m === t ? b.y : m === bt ? b.y + b.h : r.y;
	} else { nx /= d; ny /= d; }
	r.x = px + nx * R;
	r.y = py + ny * R;
	const vn = r.vx * nx + r.vy * ny;
	if (vn < 0) { r.vx -= 1.4 * vn * nx; r.vy -= 1.4 * vn * ny; }
	return -vn;
}

// one step after driving: walls, the order clock, pickups and deliveries. Returns a message to flash, if any.
export function tick(run: Run, r: Car, dt: number): string | undefined {
	run.T += dt;
	run.hitCd -= dt;
	let msg: string | undefined;
	let hit = 0;
	for (const b of SOLIDS) hit = math.max(hit, pushBox(r, b));
	if (hit > 150 && run.hitCd <= 0) { // a real crash, not a scrape
		run.hitCd = 0.7;
		msg = "Auts!";
		if (run.cargo) run.cargo.cond = math.max(0, run.cargo.cond - 0.08 * (ORDERS[run.cargo.o].dmg ?? 1));
	}
	if (run.cargo) run.cargo.t -= dt;

	if (!run.cargo && dist(r, SHOP.door) < DOOR) {
		const o = pickOrder(), O = ORDERS[o], dest = math.floor(math.random() * HOUSES.size());
		// each order has a deadline: arrive in time for the speed tip
		const t = math.round((8 + dist(SHOP.door, HOUSES[dest].door) / 60) * (O.time ?? 1));
		run.cargo = { o, dest, cond: 1, t, t0: run.T };
		return `${O.icon} ${O.name} → ${HOUSES[dest].name}`;
	}
	if (run.cargo && dist(r, HOUSES[run.cargo.dest].door) < DOOR) {
		const c = run.cargo, O = ORDERS[c.o], late = c.t <= 0, tipX = O.tipX ?? 1;
		const pay = math.round((late ? 10 : 20) + (O.bonus ?? 0) + math.round(15 * c.cond) + (late ? 0 : math.min(20 * tipX, math.round(c.t * tipX))));
		run.money += pay;
		run.delivered += 1;
		run.cargo = undefined;
		msg = `+${pay} €${late ? " (myöhässä)" : c.cond > 0.8 ? " Kiitos!" : " Vähän kolhuja…"}`;
		if (!late && math.random() < 0.25) { r.boost = 1; msg += "  🥐 Mummo gave you pulla! Boost full"; } // mummo at the door
	}
	return msg;
}
