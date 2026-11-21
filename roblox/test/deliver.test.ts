// Runs the shared Roblox rules under bun: stand-ins for the bits of Luau they use.
import { expect, test } from "bun:test";

const M = Math;
Object.assign(globalThis, {
	math: { sqrt: M.sqrt, max: M.max, min: M.min, floor: M.floor, ceil: M.ceil, exp: M.exp, cos: M.cos, sin: M.sin, random: M.random, round: M.round, sign: M.sign, clamp: (v: number, a: number, b: number) => M.min(b, M.max(a, v)) },
});
(Array.prototype as unknown as { size(): number }).size = function (this: unknown[]) { return this.length; };
const { HOUSES, SHOP, newRun, pushBox, tick } = await import("../src/shared/deliver");
const { newCar } = await import("../src/shared/drive");

test("a robot driving into a wall is pushed out and bounces", () => {
	const h = HOUSES[0], r = newCar(h.x - 5, h.y + 50);
	r.vx = 200;
	expect(pushBox(r, h)).toBe(200);
	expect(r.x).toBe(h.x - 7);
	expect(r.vx).toBeLessThan(0);
});

test("pick up at Salepa, deliver to the house, get paid", () => {
	const run = newRun(), r = newCar(SHOP.door.x, SHOP.door.y);
	expect(tick(run, r, 0.016)).toContain("→");
	const c = run.cargo!;
	Object.assign(r, HOUSES[c.dest].door);
	tick(run, r, 0.016);
	expect(run.cargo).toBeUndefined();
	expect(run.delivered).toBe(1);
	expect(run.money).toBeGreaterThanOrEqual(35); // on time, mint: 20 + 15 + tip
});
