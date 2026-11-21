// One robot in a snowy village: pick up orders at Salepa, deliver them to the houses. WASD/arrows, Shift boost, Space drift.
// ponytail: built on the client, so only you see your robot. Move the world and robots to the server for multiplayer.
import { drive, newCar, Surface } from "shared/drive";
import { HOUSES, ORDERS, SHOP, SOLIDS, TREES, inLake, isHeavy, newRun, tick } from "shared/deliver";
import { drift, house, lamp, robot as buildRobot, shop, spruce } from "./models";

const RunService = game.GetService("RunService");
const UIS = game.GetService("UserInputService");
const Players = game.GetService("Players");
const camera = game.GetService("Workspace").CurrentCamera!;

const PX = 0.3; // studs per web-game px
const W = 2000; // world is W×W px
// surfaces in px, last match wins; everything else is snow
const ZONES: { k: Surface; x: number; y: number; w: number; h: number }[] = [
	{ k: "path", x: 0, y: 940, w: W, h: 120 },
	{ k: "path", x: 940, y: 0, w: 120, h: W },
	{ k: "ice", x: 1250, y: 1250, w: 500, h: 400 },
];
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

function surfaceAt(x: number, y: number): Surface {
	let k: Surface = "snow";
	for (const z of ZONES) if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) k = z.k;
	return k;
}

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

// ---- world ----
const world = new Instance("Folder");
world.Name = "World";
world.Parent = game.GetService("Workspace");
flat(world, 0, 0, W, W, 0, COLOR.snow, MATERIAL.snow);
ZONES.forEach((z, i) => { // a hair apart: no flicker where they overlap
	const p = flat(world, z.x, z.y, z.w, z.h, 0.02 * (i + 1), COLOR[z.k], MATERIAL[z.k]);
	if (z.k === "ice") p.Reflectance = 0.15;
});
const DASH = Color3.fromHex("#e9c84a");
for (let t = 10; t < W; t += 60) {
	if (t > 900 && t < 1100) continue; // not across the crossing
	flat(world, t, 998, 32, 4, 0.08, DASH, Enum.Material.SmoothPlastic);
	flat(world, 998, t, 4, 32, 0.08, DASH, Enum.Material.SmoothPlastic);
}

function sign(part: BasePart, text: string) {
	const bb = new Instance("BillboardGui");
	bb.Size = new UDim2(0, 160, 0, 36);
	bb.StudsOffset = new Vector3(0, part.Size.Y / 2 + 14, 0);
	bb.MaxDistance = 160;
	const t = new Instance("TextLabel");
	t.Size = UDim2.fromScale(1, 1);
	t.BackgroundTransparency = 1;
	t.Text = text;
	t.TextColor3 = Color3.fromRGB(255, 255, 255);
	t.TextStrokeTransparency = 0;
	t.Font = Enum.Font.GothamBold;
	t.TextScaled = true;
	t.Parent = bb;
	bb.Parent = part;
}
const WALLS = ["#a5322a", "#e0b84e", "#5f7d9b", "#ebe6d7", "#c9643a", "#7a9a6e"];
HOUSES.forEach((h, i) => sign(house(h, WALLS[i % WALLS.size()], world, PX), h.name));
shop(SHOP, "#e8501f", world, PX);
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
const ORANGE = Color3.fromRGB(255, 140, 40), YELLOW = Color3.fromRGB(255, 216, 74);
const beacon = new Instance("Part");
beacon.Anchored = true;
beacon.CanCollide = false;
beacon.CastShadow = false;
beacon.Size = new Vector3(1.5, 60, 1.5);
beacon.Material = Enum.Material.Neon;
beacon.Transparency = 0.35;
beacon.Parent = world;

// ---- robot ----
const bot = buildRobot("#e8501f");
bot.model.Parent = world;
const FACE_X = CFrame.Angles(0, math.pi / 2, 0); // the model faces +X (like the web's); this turns +X onto the heading

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
const hud = label(new UDim2(0, 320, 0, 36), new UDim2(0, 12, 1, -48), 18);
const orderHud = label(new UDim2(0, 460, 0, 40), new UDim2(0, 12, 0, 12), 20);
const toast = label(new UDim2(0, 520, 0, 44), new UDim2(0.5, -260, 0, 64), 22);
toast.Visible = false;
gui.Parent = Players.LocalPlayer.WaitForChild("PlayerGui");

// ---- loop ----
const car = newCar(W / 2, W / 2);
const run = newRun();
let toastT = 0;
const TIER = [Color3.fromRGB(0, 0, 0), Color3.fromRGB(80, 170, 255), Color3.fromRGB(255, 150, 40), Color3.fromRGB(190, 90, 255)];
const key = (...ks: Enum.KeyCode[]) => ks.some((k) => UIS.IsKeyDown(k));
camera.CameraType = Enum.CameraType.Scriptable;

RunService.RenderStepped.Connect((frameDt) => {
	const dt = math.min(frameDt, 0.05);
	const K = Enum.KeyCode;
	const surface = surfaceAt(car.x, car.y);
	drive(car, {
		t: (key(K.W, K.Up) ? 1 : 0) - (key(K.S, K.Down) ? 1 : 0),
		s: (key(K.D, K.Right) ? 1 : 0) - (key(K.A, K.Left) ? 1 : 0),
		b: key(K.LeftShift, K.RightShift),
		h: key(K.Space),
	}, surface, dt, isHeavy(run));
	car.x = math.clamp(car.x, 7, W - 7); // R = 7 px, like the web game's edge
	car.y = math.clamp(car.y, 7, W - 7);
	const msg = tick(run, car, dt);
	if (msg !== undefined) { toast.Text = msg; toastT = 2.5; }
	toastT -= dt;
	toast.Visible = toastT > 0;

	const c = run.cargo, target = c ? HOUSES[c.dest].door : SHOP.door;
	beacon.Position = new Vector3(target.x * PX, 30, target.y * PX);
	beacon.Color = c ? YELLOW : ORANGE;
	orderHud.Text = (c
		? `${ORDERS[c.o].icon} → ${HOUSES[c.dest].name} · ${c.t > 0 ? `${math.ceil(c.t)} s` : "late!"} · ${math.floor(c.cond * 100)}%`
		: "Drive to the Salepa door 🟠") + `   💶 ${run.money} € · 📦 ${run.delivered}`;

	const pos = new Vector3(car.x * PX, 0, car.y * PX), fwd = new Vector3(math.cos(car.a), 0, math.sin(car.a));
	bot.model.PivotTo(CFrame.lookAt(pos, pos.add(fwd)).mul(FACE_X));
	for (const s of bot.sparks) {
		s.Color = TIER[car.dTier];
		s.Transparency = car.dTier > 0 ? 0.2 : 1;
	}
	bot.flame.Transparency = car.turbo ? 0.3 : 1;

	const goal = CFrame.lookAt(pos.sub(fwd.mul(16)).add(new Vector3(0, 8, 0)), pos.add(new Vector3(0, 2, 0)));
	camera.CFrame = camera.CFrame.Lerp(goal, 1 - math.exp(-6 * dt));
	hud.Text = `Boost ${math.floor(car.boost * 100)}%${car.boostLock ? " 🔒" : ""}  ·  ${surface}  ·  ${math.floor(math.sqrt(car.vx * car.vx + car.vy * car.vy))} px/s`;
});
