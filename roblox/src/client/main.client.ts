// One robot on a snowy field: pick up orders at Salepa, deliver them to the houses. WASD/arrows, Shift boost, Space drift.
// ponytail: built on the client, so only you see your robot. Move the world and robots to the server for multiplayer.
import { drive, newCar, Surface } from "shared/drive";
import { Building, HOUSES, ORDERS, SHOP, isHeavy, newRun, tick } from "shared/deliver";

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
	snow: Color3.fromRGB(235, 242, 250),
	path: Color3.fromRGB(120, 116, 112),
	ice: Color3.fromRGB(170, 215, 240),
};
const MATERIAL: Record<Surface, Enum.Material> = {
	snow: Enum.Material.Snow,
	path: Enum.Material.Asphalt,
	ice: Enum.Material.Glacier,
};

function surfaceAt(x: number, y: number): Surface {
	let k: Surface = "snow";
	for (const z of ZONES) if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) k = z.k;
	return k;
}

function block(parent: Instance, size: Vector3, pos: Vector3, color: Color3, material: Enum.Material = Enum.Material.SmoothPlastic) {
	const p = new Instance("Part");
	p.Anchored = true;
	p.CanCollide = false;
	p.Size = size;
	p.Position = pos;
	p.Color = color;
	p.Material = material;
	p.TopSurface = Enum.SurfaceType.Smooth;
	p.BottomSurface = Enum.SurfaceType.Smooth;
	p.Parent = parent;
	return p;
}

// ---- world ----
const world = new Instance("Folder");
world.Name = "World";
world.Parent = game.GetService("Workspace");
block(world, new Vector3(W * PX, 1, W * PX), new Vector3((W / 2) * PX, -0.5, (W / 2) * PX), COLOR.snow, MATERIAL.snow);
ZONES.forEach((z, i) => {
	const top = 0.02 * (i + 1); // stacked a hair apart so overlapping zones don't flicker
	block(world, new Vector3(z.w * PX, 1, z.h * PX), new Vector3((z.x + z.w / 2) * PX, top - 0.5, (z.y + z.h / 2) * PX), COLOR[z.k], MATERIAL[z.k]);
});

function sign(part: BasePart, text: string, color: Color3) {
	const bb = new Instance("BillboardGui");
	bb.Size = new UDim2(0, 160, 0, 36);
	bb.StudsOffset = new Vector3(0, part.Size.Y / 2 + 2, 0);
	bb.MaxDistance = 160;
	const t = new Instance("TextLabel");
	t.Size = UDim2.fromScale(1, 1);
	t.BackgroundTransparency = 1;
	t.Text = text;
	t.TextColor3 = color;
	t.TextStrokeTransparency = 0;
	t.Font = Enum.Font.GothamBold;
	t.TextScaled = true;
	t.Parent = bb;
	bb.Parent = part;
}
function building(b: Building, height: number, color: Color3, material: Enum.Material) {
	const p = block(world, new Vector3(b.w * PX, height, b.h * PX), new Vector3((b.x + b.w / 2) * PX, height / 2, (b.y + b.h / 2) * PX), color, material);
	// the door sits on the wall closest to the door spot
	const dx = math.clamp(b.door.x, b.x, b.x + b.w), dy = math.clamp(b.door.y, b.y, b.y + b.h);
	block(world, new Vector3(2.6, 4.2, 2.6), new Vector3(dx * PX, 2.1, dy * PX), Color3.fromRGB(60, 40, 30), Enum.Material.Wood);
	sign(p, b.name, Color3.fromRGB(255, 255, 255));
}
const WALLS = [Color3.fromRGB(165, 50, 40), Color3.fromRGB(230, 190, 80), Color3.fromRGB(95, 125, 155), Color3.fromRGB(235, 230, 215)];
HOUSES.forEach((h, i) => building(h, 9, WALLS[i % WALLS.size()], Enum.Material.WoodPlanks));
building(SHOP, 12, Color3.fromRGB(232, 80, 31), Enum.Material.SmoothPlastic);

// a beam of light over where to go next: orange = Salepa, yellow = the customer
const ORANGE = Color3.fromRGB(255, 140, 40), YELLOW = Color3.fromRGB(255, 216, 74);
const beacon = block(world, new Vector3(1.5, 60, 1.5), new Vector3(), ORANGE, Enum.Material.Neon);
beacon.Transparency = 0.35;

// ---- robot: built facing -Z around the origin, then moved as one model ----
const robot = new Instance("Model");
robot.Name = "Robot";
const body = block(robot, new Vector3(3.4, 1.8, 4.2), new Vector3(0, 1.3, 0), Color3.fromRGB(245, 245, 240));
block(robot, new Vector3(3.5, 0.3, 4.3), new Vector3(0, 2.3, 0), Color3.fromRGB(40, 40, 45)); // lid
for (const [x, z] of [[-1.8, -1.3], [1.8, -1.3], [-1.8, 0], [1.8, 0], [-1.8, 1.3], [1.8, 1.3]]) {
	const w = block(robot, new Vector3(0.4, 0.9, 0.9), new Vector3(x, 0.45, z), Color3.fromRGB(30, 30, 30));
	w.Shape = Enum.PartType.Cylinder;
	w.Size = new Vector3(0.4, 0.9, 0.9);
}
block(robot, new Vector3(0.08, 3.5, 0.08), new Vector3(-1.4, 4, 1.8), Color3.fromRGB(200, 200, 200)); // flag pole
block(robot, new Vector3(0.05, 0.6, 0.9), new Vector3(-1.4, 5.4, 2.25), Color3.fromRGB(255, 120, 40), Enum.Material.Neon); // flag
const sparks = block(robot, new Vector3(3, 0.1, 3.8), new Vector3(0, 0.08, 0), Color3.fromRGB(0, 0, 0), Enum.Material.Neon);
robot.PrimaryPart = body;
robot.WorldPivot = new CFrame();
robot.Parent = world;

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
	robot.PivotTo(CFrame.lookAt(pos, pos.add(fwd)));
	sparks.Color = TIER[car.dTier];
	sparks.Transparency = car.dTier > 0 ? 0.3 : 1;

	const goal = CFrame.lookAt(pos.sub(fwd.mul(16)).add(new Vector3(0, 8, 0)), pos.add(new Vector3(0, 2, 0)));
	camera.CFrame = camera.CFrame.Lerp(goal, 1 - math.exp(-6 * dt));
	hud.Text = `Boost ${math.floor(car.boost * 100)}%${car.boostLock ? " 🔒" : ""}  ·  ${surface}  ·  ${math.floor(math.sqrt(car.vx * car.vx + car.vy * car.vy))} px/s`;
});
