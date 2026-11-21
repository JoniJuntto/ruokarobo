// One robot in a snowy village: pick up orders at Salepa, deliver them to the houses, dodge the traffic, the locals,
// the snowball kids, the plow and Prösma's thieves.
// WASD/arrows drive, Shift boost, Space drift, E zap.
// ponytail: built and simulated on the client, so only you see your robot. Move the world to the server for multiplayer.
import { drive, newCar, Surface } from "shared/drive";
import { HOUSES, ORDERS, SHOP, SOLIDS, TREES, W, ZONES, inLake, isHeavy, newRun, surfaceAt, tick } from "shared/deliver";
import { Ball, ballH, newStreet, stepStreet } from "shared/street";
import { STUDS, Walker, cardboard, dog, drift, farmari, house, lamp, person, plow, pose, robot as buildRobot, shop, spruce } from "./models";

const RunService = game.GetService("RunService");
const UIS = game.GetService("UserInputService");
const Players = game.GetService("Players");
const camera = game.GetService("Workspace").CurrentCamera!;

const PX = 0.3; // studs per web-game px
const COLOR: Record<Surface, Color3> = {
	snow: Color3.fromHex("#eef3f8"),
	path: Color3.fromHex("#4d525a"),
	ice: Color3.fromHex("#b9dcf0"),
};
const MATERIAL: Record<Surface, Enum.Material> = {
	snow: Enum.Material.Snow,
	path: Enum.Material.Asphalt,
	ice: Enum.Material.Ice,
};

function flat(parent: Instance, x: number, y: number, w: number, h: number, top: number, color: Color3, material: Enum.Material) {
	const p = new Instance("Part");
	p.Anchored = true;
	p.Size = new Vector3(w * PX, 1, h * PX);
	p.Position = new Vector3((x + w / 2) * PX, top - 0.5, (y + h / 2) * PX);
	p.Color = color;
	p.Material = material;
	p.TopSurface = Enum.SurfaceType.Smooth;
	p.Parent = parent;
	return p;
}
const rnd = (a: number, b: number) => a + math.random() * (b - a);
const FACE_X = CFrame.Angles(0, math.pi / 2, 0); // models face +X (like the web's); this turns +X onto a heading
const facing = (x: number, y: number, dx: number, dy: number) => {
	const pos = new Vector3(x * PX, 0, y * PX);
	return CFrame.lookAt(pos, pos.add(new Vector3(dx, 0, dy))).mul(FACE_X);
};

// ---- world ----
const world = new Instance("Folder");
world.Name = "World";
world.Parent = game.GetService("Workspace");
const buildings = new Instance("Folder"); // what the camera can't see through
buildings.Name = "Buildings";
buildings.Parent = world;
flat(world, 0, 0, W, W, 0, COLOR.snow, MATERIAL.snow);
ZONES.forEach((z, i) => { // a hair apart: no flicker where they overlap
	const p = flat(world, z.x, z.y, z.w, z.h, 0.02 * (i + 1), COLOR[z.k], MATERIAL[z.k]);
	if (z.k === "ice") p.Reflectance = 0.15;
});
const DASH = Color3.fromHex("#d8bf62"); // worn paint, matte: the web's dashes are thin and dull
for (let t = 14; t < W; t += 60) {
	if (t > 900 && t < 1100) continue; // not across the crossing
	flat(world, t, 999, 24, 2, 0.08, DASH, Enum.Material.Concrete);
	flat(world, 999, t, 2, 24, 0.08, DASH, Enum.Material.Concrete);
}

function bubble(part: BasePart, offset: number, size = new UDim2(0, 160, 0, 36)) {
	const bb = new Instance("BillboardGui");
	bb.Size = size;
	bb.StudsOffset = new Vector3(0, offset, 0);
	bb.MaxDistance = 160;
	const t = new Instance("TextLabel");
	t.Size = UDim2.fromScale(1, 1);
	t.BackgroundTransparency = 1;
	t.TextColor3 = Color3.fromRGB(255, 255, 255);
	t.TextStrokeTransparency = 0;
	t.Font = Enum.Font.GothamBold;
	t.TextScaled = true;
	t.Parent = bb;
	bb.Parent = part;
	return t;
}
const WALLS = ["#a5322a", "#e0b84e", "#5f7d9b", "#ebe6d7", "#c9643a", "#7a9a6e"];
HOUSES.forEach((h, i) => {
	const walls = house(h, WALLS[i % WALLS.size()], buildings, PX);
	bubble(walls, walls.Size.Y / 2 + 14).Text = h.name;
});
shop(SHOP, "#e8501f", buildings, PX);
const camRay = new RaycastParams();
camRay.FilterType = Enum.RaycastFilterType.Include;
camRay.FilterDescendantsInstances = [buildings];
let camReady = false;
for (const t of TREES) spruce(t.x, t.y, world, PX);

// lamps and plowed snowbanks along both roads, with gaps at the doors and the crossing
const clear = (x: number, y: number, r: number) => SOLIDS.every((b) => (b.door.x - x) ** 2 + (b.door.y - y) ** 2 > r * r);
for (let t = 100; t < W; t += 200) {
	if (math.abs(t - 1000) < 120) continue;
	if (clear(t, 928, 45)) lamp(t, 928, -math.pi / 2, world, PX); // north edge, arm over the road
	if (clear(t + 100, 1072, 45)) lamp(t + 100, 1072, math.pi / 2, world, PX);
	if (clear(928, t, 45)) lamp(928, t, 0, world, PX);
	if (clear(1072, t + 100, 45)) lamp(1072, t + 100, math.pi, world, PX);
}
for (let t = 15; t < W; t += rnd(30, 42)) {
	if (math.abs(t - 1000) < 90) continue;
	for (const e of [932, 1068]) {
		if (clear(t, e, 45)) drift(t, e + rnd(-2, 2), rnd(3.6, 5.6), rnd(0.9, 1.6), rnd(1.4, 2), rnd(-0.2, 0.2), world, PX);
		if (clear(e, t, 45)) drift(e + rnd(-2, 2), t, rnd(3.6, 5.6), rnd(0.9, 1.6), rnd(1.4, 2), math.pi / 2 + rnd(-0.2, 0.2), world, PX);
	}
}
for (let i = 0; i < 60; i++) { // drifts in the yards
	const x = rnd(40, W - 40), y = rnd(40, W - 40);
	if (x > 900 && x < 1100 || y > 900 && y < 1100 || inLake(x, y)) continue;
	if (SOLIDS.some((b) => x > b.x - 30 && x < b.x + b.w + 30 && y > b.y - 30 && y < b.y + b.h + 30)) continue;
	drift(x, y, rnd(4, 10), rnd(1, 2.2), rnd(3, 6), rnd(0, 3), world, PX);
}

// a beam of light over where to go next: orange = Salepa, yellow = the customer
const ORANGE = Color3.fromRGB(255, 140, 40), YELLOW = Color3.fromRGB(255, 216, 74), RED = Color3.fromRGB(255, 70, 60);
function neon(size: Vector3, color: Color3, transparency: number) {
	const p = new Instance("Part");
	p.Anchored = true;
	p.CanCollide = false;
	p.CastShadow = false;
	p.Size = size;
	p.Color = color;
	p.Material = Enum.Material.Neon;
	p.Transparency = transparency;
	p.Parent = world;
	return p;
}
const beacon = neon(new Vector3(1.5, 60, 1.5), ORANGE, 0.35);

// ---- the street: traffic, locals, dogs, a courier ----
const street = newStreet();
const carModels = street.cars.map((c) => (c.plow ? plow(world).model : farmari(c.color, world)));
const walkers = street.peds.map((p) => {
	const w: Walker = p.kind === "dog" ? dog(world) : person(p.coat, p.hat, world, p.kind === "courier");
	return { w, say: bubble(w.head, p.kind === "dog" ? 3 : 2.5, new UDim2(0, 200, 0, 30)) };
});
const kidModels = street.kids.map((k) => {
	if (k.bum) cardboard(k.x, k.y, world, PX);
	const w = person(k.coat, k.hat, world, false, k.bum ? 1 : 0.62);
	return { w, say: bubble(w.head, 2, new UDim2(0, 200, 0, 30)) };
});
const thiefModels = street.thieves.map(() => {
	const m = buildRobot("#2f9e57", "#2b2f36").model; // Prösma: dark shell, green stripe
	m.Parent = world;
	return { m, say: bubble(m.GetChildren()[0] as BasePart, 5, new UDim2(0, 220, 0, 30)) };
});
const ballParts = new Map<Ball, Part>();
const bolts: { p: Part; t: number }[] = [];

// ---- robot ----
const bot = buildRobot("#e8501f");
bot.model.Parent = world;

// ---- HUD ----
const gui = new Instance("ScreenGui");
gui.ResetOnSpawn = false;
function label(size: UDim2, pos: UDim2, textSize: number) {
	const l = new Instance("TextLabel");
	l.Size = size;
	l.Position = pos;
	l.BackgroundTransparency = 0.4;
	l.BackgroundColor3 = Color3.fromRGB(0, 0, 0);
	l.TextColor3 = Color3.fromRGB(255, 255, 255);
	l.Font = Enum.Font.GothamBold;
	l.TextSize = textSize;
	l.Parent = gui;
	return l;
}
const hud = label(new UDim2(0, 460, 0, 36), new UDim2(0, 12, 1, -48), 18);
const orderHud = label(new UDim2(0, 460, 0, 40), new UDim2(0, 12, 0, 12), 20);
const toast = label(new UDim2(0, 520, 0, 44), new UDim2(0.5, -260, 0, 64), 22);
toast.Visible = false;
const keys = label(new UDim2(0, 430, 0, 26), new UDim2(1, -442, 1, -38), 14);
keys.Text = "WASD drive · Shift boost · Space drift · E zap";
gui.Parent = Players.LocalPlayer.WaitForChild("PlayerGui");

// ---- loop ----
const car = newCar(SHOP.door.x, SHOP.door.y); // robots start at the Salepa door, like the web game
car.a = math.pi / 2; // facing the road
const run = newRun();
let toastT = 0, T = 0;
const TIER = [Color3.fromRGB(0, 0, 0), Color3.fromRGB(80, 170, 255), Color3.fromRGB(255, 150, 40), Color3.fromRGB(190, 90, 255)];
const key = (...ks: Enum.KeyCode[]) => ks.some((k) => UIS.IsKeyDown(k));
camera.CameraType = Enum.CameraType.Scriptable;

RunService.RenderStepped.Connect((frameDt) => {
	const dt = math.min(frameDt, 0.05);
	T += dt;
	const K = Enum.KeyCode, stunned = run.stun > 0;
	const surface = surfaceAt(car.x, car.y);
	let s = (key(K.D, K.Right) ? 1 : 0) - (key(K.A, K.Left) ? 1 : 0);
	if (run.drunk > 0) s = math.clamp(-s + math.sin(T * 2.3) * 0.7, -1, 1); // the spurgu's bottle: steering flips and sways
	drive(car, stunned ? { t: 0, s: 0, b: false, h: false } : {
		t: (key(K.W, K.Up) ? 1 : 0) - (key(K.S, K.Down) ? 1 : 0),
		s,
		b: key(K.LeftShift, K.RightShift),
		h: key(K.Space),
	}, surface, dt, isHeavy(run));
	car.x = math.clamp(car.x, 7, W - 7); // R = 7 px, like the web game's edge
	car.y = math.clamp(car.y, 7, W - 7);
	tick(run, car, dt);
	stepStreet(street, run, car, key(K.E), dt);

	// messages and zap bolts from this step
	if (run.msgs.size() > 0) { toast.Text = run.msgs.join("   "); toastT = 2.5; run.msgs.clear(); }
	toastT -= dt;
	toast.Visible = toastT > 0;
	for (const b of run.bolts) {
		const a = new Vector3(b.x1 * PX, 1.6, b.y1 * PX), z = new Vector3(b.x2 * PX, 1.6, b.y2 * PX);
		const p = neon(new Vector3(0.25, 0.25, a.sub(z).Magnitude), Color3.fromHex("#7ef9ff"), 0);
		p.CFrame = CFrame.lookAt(a.add(z).div(2), z);
		bolts.push({ p, t: 0.18 });
	}
	run.bolts.clear();
	for (let i = bolts.size() - 1; i >= 0; i--) if ((bolts[i].t -= dt) <= 0) { bolts[i].p.Destroy(); bolts.remove(i); }

	// street
	street.cars.forEach((c, i) => carModels[i].PivotTo(facing(c.x, c.y, c.dx, c.dy)));
	street.peds.forEach((p, i) => {
		const { w, say } = walkers[i], down = p.mode === "fall", dogp = p.kind === "dog";
		let root = facing(p.x, p.y, math.cos(p.a), math.sin(p.a));
		if (down) root = root.mul(dogp ? CFrame.Angles(math.pi / 2, 0, 0) : CFrame.Angles(0, 0, math.pi / 2));
		if (p.mode === "zapped") root = root.mul(CFrame.Angles(math.sin(T * 45) * 0.08, 0, 0)); // twitching
		const f = p.mode === "chase" ? 16 : 9, sw = p.moving && p.kind !== "courier" ? math.sin(T * f) * 0.5 : 0;
		if (sw !== 0 && !dogp) root = root.mul(new CFrame(0, math.abs(math.cos(T * f)) * 0.15, 0)); // people bob as they walk
		pose(w, root, p.kickT > 0 && !dogp ? 0.9 : sw, sw * 0.7);
		say.Text = p.sayT > 0 ? p.say : "";
	});
	street.kids.forEach((k, i) => {
		const { w, say } = kidModels[i];
		let root = facing(k.x, k.y, math.cos(k.a), math.sin(k.a));
		if (k.bum) root = root.mul(new CFrame(0.9 * STUDS, 0.35 * STUDS, 0)).mul(CFrame.Angles(0, 0, 1.15)); // reclined, feet to the road
		if (k.zapT > 0) root = root.mul(CFrame.Angles(math.sin(T * 45) * 0.1, 0, 0));
		const sg = (T + k.x) % 5; // the spurgu takes a swig every five seconds
		pose(w, root, 0, 0, k.throwT > 0 ? -2.4 + (0.3 - k.throwT) * 8 : k.bum && sg < 1.2 ? -1.9 * math.sin((sg / 1.2) * math.pi) : 0);
		say.Text = k.sayT > 0 ? k.say : "";
	});
	street.thieves.forEach((t, i) => {
		const { m, say } = thiefModels[i];
		let root = facing(t.x, t.y, math.cos(t.a), math.sin(t.a));
		if (t.cd > 0) root = root.mul(CFrame.Angles(0, math.sin(T * 40) * 0.15, 0)); // stunned
		m.PivotTo(root);
		say.Text = t.sayT > 0 ? t.say : "";
	});
	for (const [b, p] of ballParts) if (!street.balls.includes(b)) { p.Destroy(); ballParts.delete(b); }
	for (const b of street.balls) {
		let p = ballParts.get(b);
		if (!p) {
			p = new Instance("Part");
			p.Anchored = true;
			p.CanCollide = false;
			p.Shape = b.bot ? Enum.PartType.Cylinder : Enum.PartType.Ball;
			p.Size = b.bot ? new Vector3(1, 0.4, 0.4) : new Vector3(0.75, 0.75, 0.75);
			p.Color = Color3.fromHex(b.bot ? "#3d5a2e" : "#fbfdff");
			p.Material = b.bot ? Enum.Material.Glass : Enum.Material.Snow;
			p.Parent = world;
			ballParts.set(b, p);
		}
		p.CFrame = new CFrame(b.x * PX, ballH(b) * STUDS, b.y * PX).mul(CFrame.Angles(b.age * 9, 0, b.age * 6)); // bottles tumble
	}

	// target beam, HUD
	const c = run.cargo, thief = street.thieves.find((t) => t.cargo !== undefined);
	const target = c ? HOUSES[c.dest].door : thief ?? SHOP.door; // a stolen order: the beam follows the thief
	beacon.Position = new Vector3(target.x * PX, 30, target.y * PX);
	beacon.Color = c ? YELLOW : thief ? RED : ORANGE;
	orderHud.Text = (c
		? `${ORDERS[c.o].icon} → ${HOUSES[c.dest].name} · ${c.t > 0 ? `${math.ceil(c.t)} s` : "late!"} · ${math.floor(c.cond * 100)}%`
		: thief ? "Prösma has your order! Bump the thief 🔴" : "Drive to the Salepa door 🟠") + `   💶 ${run.money} € · 📦 ${run.delivered}`;
	hud.Text = `${run.drunk > 0 ? "🍾 " : ""}🔋 ${math.floor(run.hp * 100)}%  ·  ⚡ ${math.floor(run.zaps)}  ·  Boost ${math.floor(car.boost * 100)}%${car.boostLock ? " 🔒" : ""}  ·  ${math.floor(math.sqrt(car.vx * car.vx + car.vy * car.vy))} px/s`;

	// robot, camera
	const fwd = new Vector3(math.cos(car.a), 0, math.sin(car.a)), pos = new Vector3(car.x * PX, 0, car.y * PX);
	let rc = facing(car.x, car.y, fwd.X, fwd.Z);
	if (stunned) rc = rc.mul(CFrame.Angles(0, math.sin(T * 40) * 0.15, 0)); // knocked about: shaking
	bot.model.PivotTo(rc);
	for (const s of bot.sparks) {
		s.Color = TIER[car.dTier];
		s.Transparency = car.dTier > 0 ? 0.2 : 1;
	}
	bot.flame.Transparency = car.turbo ? 0.3 : 1;
	const goal = CFrame.lookAt(pos.sub(fwd.mul(16)).add(new Vector3(0, 8, 0)), pos.add(new Vector3(0, 2, 0)));
	let cf = camReady ? camera.CFrame.Lerp(goal, 1 - math.exp(-6 * dt)) : goal; // first frame: straight there, no glide from the origin
	camReady = true;
	// a wall between the robot and the camera: pull the camera in front of it
	const focus = pos.add(new Vector3(0, 2, 0)), hit = game.GetService("Workspace").Raycast(focus, cf.Position.sub(focus), camRay);
	if (hit) cf = CFrame.lookAt(hit.Position.add(hit.Normal.mul(0.8)), focus);
	camera.CFrame = cf;
});
