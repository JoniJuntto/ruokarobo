// Robot driving, ported by hand from updRobot() in src/sim/robot.ts: same numbers, so it feels the same.
// Units are the web game's: px and seconds. The client scales px to studs.
// ponytail: no upgrades yet (every g.up.* is 0), add them back when the shop is ported.

export const SURF = {
	path: { acc: 420, kF: 1.1, kL: 2.2, max: 190 },
	snow: { acc: 380, kF: 2.6, kL: 3.5, max: 120 },
	ice: { acc: 110, kF: 0.12, kL: 0.18, max: 270 },
};
export type Surface = keyof typeof SURF;

export interface Car {
	x: number;
	y: number;
	a: number; // heading, radians; forward is (cos a, sin a)
	vx: number;
	vy: number;
	boost: number; // 0..1
	boostLock: boolean;
	mt: number; // mini-turbo seconds left
	dDir: number; // drift direction: -1, 0, 1
	dCh: number; // drift charge
	dTier: number; // 0 none, 1 blue, 2 orange, 3 purple
	turbo: boolean; // boosting or on a mini-turbo this step
}

export interface Keys {
	t: number; // throttle -1..1
	s: number; // steer -1..1, +1 turns right
	b: boolean; // boost
	h: boolean; // handbrake / drift
}

export const newCar = (x: number, y: number): Car => ({
	x, y, a: 0, vx: 0, vy: 0, boost: 1, boostLock: false, mt: 0, dDir: 0, dCh: 0, dTier: 0, turbo: false,
});

const MT = [0, 0.6, 1.1, 1.7];

export function drive(r: Car, inp: Keys, surface: Surface, dt: number, heavy = false) {
	const s = SURF[surface], ice = surface === "ice";
	const S = heavy ? { acc: s.acc * 0.65, kF: s.kF, kL: s.kL * 0.6, max: s.max * 0.8 } : s; // watermelons slide
	// boost: ~2 s of turbo, recharges in ~7 s; drain it empty and it stays locked until full again
	if (r.boost >= 1) r.boostLock = false;
	const boosting = inp.b && inp.t > 0 && !r.boostLock;
	r.boost = math.clamp(r.boost + (boosting ? -dt / 2 : dt / 7), 0, 1);
	if (r.boost <= 0) r.boostLock = true;
	// drift: brake + gas + steer at speed. hold to charge sparks, let go of brake for a mini-turbo
	const sp0 = math.sqrt(r.vx * r.vx + r.vy * r.vy);
	if (r.dDir === 0 && inp.h && inp.t > 0 && inp.s !== 0 && sp0 > 70) {
		r.dDir = math.sign(inp.s);
		r.dCh = 0;
	}
	if (r.dDir !== 0 && (!inp.h || inp.t <= 0 || sp0 < 40)) {
		if (!inp.h && r.dTier > 0) r.mt = MT[r.dTier];
		r.dDir = r.dCh = r.dTier = 0;
	}
	if (r.dDir !== 0) {
		r.dCh += dt * (0.7 + 0.5 * math.max(0, inp.s * r.dDir)); // tighter line charges faster
		r.dTier = (r.dCh >= 1 ? 1 : 0) + (r.dCh >= 2 ? 1 : 0) + (r.dCh >= 3.2 ? 1 : 0);
	}
	r.mt = math.max(0, r.mt - dt);
	const turbo = (r.turbo = boosting || r.mt > 0), drifting = r.dDir !== 0;
	r.a += (drifting ? r.dDir * (0.75 + 0.45 * inp.s * r.dDir) : inp.s * (inp.h ? 1.7 : 1)) * 3.4 * dt;
	const cx = math.cos(r.a), sy = math.sin(r.a);
	const acc = S.acc * inp.t * (inp.t < 0 ? 0.6 : 1) * (turbo ? 1.9 : 1) * (drifting ? 0.9 : inp.h ? 0.2 : 1);
	r.vx += cx * acc * dt;
	r.vy += sy * acc * dt;
	// split velocity into forward and sideways: tyres resist sideways much more (that's the grip)
	const kF = !drifting && inp.h ? S.kF + (ice ? 0.4 : 3) : S.kF;
	const kL = S.kL * (drifting ? 0.4 : inp.h ? 0.2 : 1);
	const max = S.max * (turbo ? 1.5 : 1);
	let f = r.vx * cx + r.vy * sy, l = -r.vx * sy + r.vy * cx;
	f *= math.exp(-kF * dt);
	l *= math.exp(-kL * dt);
	r.vx = f * cx - l * sy;
	r.vy = f * sy + l * cx;
	const sp = math.sqrt(r.vx * r.vx + r.vy * r.vy);
	if (sp > max) {
		const k = math.max(max / sp, math.exp(-3 * dt));
		r.vx *= k;
		r.vy *= k;
	}
	r.x += r.vx * dt;
	r.y += r.vy * dt;
}
