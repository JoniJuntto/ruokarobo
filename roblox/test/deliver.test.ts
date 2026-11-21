// Runs the shared Roblox rules under bun: stand-ins for the bits of Luau they use.
import { expect, test } from "bun:test";

const M = Math;
Object.assign(globalThis, {
	math: {
		sqrt: M.sqrt, max: M.max, min: M.min, floor: M.floor, ceil: M.ceil, exp: M.exp, cos: M.cos, sin: M.sin, atan2: M.atan2, abs: M.abs,
		random: M.random, round: M.round, sign: M.sign, huge: Infinity, clamp: (v: number, a: number, b: number) => M.min(b, M.max(a, v)),
	},
});
const A = Array.prototype as unknown as { size(): number; clear(): void };
A.size = function (this: unknown[]) { return this.length; };
A.clear = function (this: unknown[]) { this.length = 0; };
const { HOUSES, SHOP, newRun, pushBox, tick } = await import("../src/shared/deliver");
const { newCar } = await import("../src/shared/drive");
const { TUNE, newStreet, stepStreet } = await import("../src/shared/street");

test("a robot driving into a wall is pushed out and bounces", () => {
	const h = HOUSES[0], r = newCar(h.x - 5, h.y + 50);
	r.vx = 200;
	expect(pushBox(r, h)).toBe(200);
	expect(r.x).toBe(h.x - 7);
	expect(r.vx).toBeLessThan(0);
});

test("pick up at Salepa, deliver to the house, get paid", () => {
	const run = newRun(), r = newCar(SHOP.door.x, SHOP.door.y);
	tick(run, r, 0.016);
	expect(run.msgs[0]).toContain("→");
	const c = run.cargo!;
	Object.assign(r, HOUSES[c.dest].door);
	tick(run, r, 0.016);
	expect(run.cargo).toBeUndefined();
	expect(run.delivered).toBe(1);
	expect(run.money).toBeGreaterThanOrEqual(35); // on time, mint: 20 + 15 + tip
});

test("a car hits the robot: thrown, stunned, battery down", () => {
	const run = newRun(), st = newStreet(), c = st.cars[0], r = newCar(c.x + 45, c.y); // just ahead of it, in its lane
	st.peds.length = 0;
	stepStreet(st, run, r, false, 0.016);
	expect(run.stun).toBeGreaterThan(0);
	expect(run.hp).toBeCloseTo(1 - TUNE.hurt.car);
	expect(r.vx).toBeGreaterThan(50); // thrown along the car's way
});

test("the zapper stuns the local in front, and only one charge goes", () => {
	const run = newRun(), st = newStreet(), r = newCar(500, 500), p = st.peds[0];
	st.cars.length = 0;
	Object.assign(p, { x: 560, y: 500, mode: "walk" });
	stepStreet(st, run, r, true, 0.016);
	expect(p.mode).toBe("zapped");
	expect(run.bolts.length).toBe(1);
	expect(M.floor(run.zaps)).toBe(2);
});

test("a Prösma robot steals the order; bumping it gets it back", () => {
	const run = newRun(), st = newStreet(), t = st.thieves[0], r = newCar(500, 500);
	st.cars.length = 0; st.peds.length = 0; st.kids.length = 0; st.thieves.length = 1;
	run.cargo = { o: 0, dest: 3, cond: 1, t: 30, t0: 0 };
	Object.assign(t, { x: 510, y: 500 });
	stepStreet(st, run, r, false, 0.016);
	expect(run.cargo).toBeUndefined();
	expect(t.cargo?.dest).toBe(3);
	Object.assign(t, { imm: 0, x: r.x + 8, y: r.y }); // caught up with it
	stepStreet(st, run, r, false, 0.016);
	expect(run.cargo?.dest).toBe(3);
	expect(t.cargo).toBeUndefined();
});

test("a snowball that lands on the robot knocks it and drains the battery", () => {
	const run = newRun(), st = newStreet(), r = newCar(500, 500);
	st.cars.length = 0; st.peds.length = 0; st.kids.length = 0; st.thieves.length = 0;
	st.balls.push({ x: 500, y: 500, vx: 100, vy: 0, h0: 1.4, vh: 0, age: 1, ft: 1, bot: false });
	stepStreet(st, run, r, false, 0.016);
	expect(st.balls.length).toBe(0);
	expect(run.hp).toBeCloseTo(1 - TUNE.hurt.snowball);
	expect(r.vx).toBeGreaterThan(100);
});
