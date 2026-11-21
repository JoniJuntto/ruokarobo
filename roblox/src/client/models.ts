// The web game's models, rebuilt from Roblox parts. Each builder copies its three.js twin (buildRobot in
// src/client/entities.ts, buildHouse/buildShop in src/client/village.ts, buildTree/buildLamp/windowAt in
// src/client/scenery.ts): same shapes, sizes in the same three.js units, same colours.
// ponytail: parts, not imported meshes, so everything stays in code and syncs with Rojo. Roblox has no rounded
// boxes or cones, so rounded boxes are sharp and spruce tiers are rounded blobs.
import { Building } from "shared/deliver";

const M = Enum.Material;
const I = new CFrame();
const UPRIGHT = CFrame.Angles(0, 0, math.pi / 2); // a Cylinder's axis is X: this stands it up
const ALONG_Z = CFrame.Angles(0, math.pi / 2, 0);
export const STUDS = 3; // studs per three.js unit (web: 0.1 unit per px; here 0.3 studs per px)
const WHITE = "#f4f4f0", SNOW = "#fbfdff", METAL = "#9aa1a8", ROOF = "#3a3f47";

// builders in a model's own frame, sizes and positions in three.js units times k
function kit(parent: Instance, k: number) {
	function make(size: Vector3, cf: CFrame, color: string, material: Enum.Material, wedge = false): BasePart {
		const p = new Instance(wedge ? "WedgePart" : "Part");
		p.Anchored = true;
		p.CanCollide = false;
		p.Size = size;
		p.CFrame = cf;
		p.Color = Color3.fromHex(color);
		p.Material = material;
		p.TopSurface = Enum.SurfaceType.Smooth;
		p.BottomSurface = Enum.SurfaceType.Smooth;
		p.Parent = parent;
		return p;
	}
	const at = (x: number, y: number, z: number) => new CFrame(x * k, y * k, z * k);
	return {
		box: (w: number, h: number, d: number, x: number, y: number, z: number, color: string, material: Enum.Material = M.SmoothPlastic, rot = I) =>
			make(new Vector3(w * k, h * k, d * k), at(x, y, z).mul(rot), color, material),
		ball(r: number, x: number, y: number, z: number, color: string, material: Enum.Material = M.SmoothPlastic) {
			const p = make(new Vector3(2 * r * k, 2 * r * k, 2 * r * k), at(x, y, z), color, material) as Part;
			p.Shape = Enum.PartType.Ball;
			return p;
		},
		blob(sx: number, sy: number, sz: number, x: number, y: number, z: number, color: string, material: Enum.Material = M.SmoothPlastic) { // ellipsoid
			const p = make(new Vector3(sx * k, sy * k, sz * k), at(x, y, z), color, material);
			const sm = new Instance("SpecialMesh");
			sm.MeshType = Enum.MeshType.Sphere;
			sm.Parent = p;
			return p;
		},
		cyl(r: number, len: number, x: number, y: number, z: number, color: string, material: Enum.Material = M.SmoothPlastic, axis: "x" | "y" | "z" = "y") {
			const p = make(new Vector3(len * k, 2 * r * k, 2 * r * k), at(x, y, z).mul(axis === "y" ? UPRIGHT : axis === "z" ? ALONG_Z : I), color, material) as Part;
			p.Shape = Enum.PartType.Cylinder;
			return p;
		},
		// gable roof like the web's prism(): ridge along X, base at y. A wedge slopes down towards its front (-Z)
		roof(across: number, h: number, len: number, x: number, y: number, z: number, color: string, material: Enum.Material, yaw = 0) {
			const base = at(x, y, z).mul(CFrame.Angles(0, yaw, 0)), size = new Vector3(len * k, h * k, (across / 2) * k);
			make(size, base.mul(new CFrame(0, (h * k) / 2, (-across * k) / 4)), color, material, true);
			make(size, base.mul(new CFrame(0, (h * k) / 2, (across * k) / 4)).mul(CFrame.Angles(0, math.pi, 0)), color, material, true);
		},
	};
}
type Kit = ReturnType<typeof kit>;

function model(name: string, parent?: Instance) {
	const m = new Instance("Model");
	m.Name = name;
	m.WorldPivot = I;
	if (parent) m.Parent = parent;
	return m;
}

// ---- robot: buildRobot() at the web's .4 scale. Faces +X like the web model; main turns it to face its heading ----
export function robot(color: string, shell = "#f2f2ee") {
	const m = model("Robot"), K = kit(m, 0.4 * STUDS);
	K.box(3.6, 1.45, 2.6, 0, 1.25, 0, shell);
	K.box(3.66, 0.42, 2.66, 0, 0.62, 0, "#2a2f36"); // dark skirt
	K.box(3, 0.22, 2.25, -0.08, 2.02, 0, "#e3e6ea"); // lid
	K.box(3.02, 0.24, 0.46, -0.08, 2.04, 0, color); // stripe in the player's colour
	K.box(3.08, 0.05, 2.32, -0.08, 1.9, 0, "#8d949b"); // lid seam
	K.box(0.1, 0.62, 2, 1.8, 1.35, 0, "#14181d", M.Glass); // sensor face
	for (const z of [-0.55, 0.55]) K.ball(0.12, 1.84, 1.45, z, "#7ef9ff", M.Neon); // eyes
	K.ball(0.2, 1.4, 2.12, 0, "#14181d", M.Glass); // camera dome
	for (const z of [-1.33, 1.33]) K.box(0.5, 0.14, 0.04, -1.3, 1.1, z, "#ff7b00", M.Neon); // reflectors
	for (const x of [-1.2, 0, 1.2]) for (const z of [-1.38, 1.38]) {
		K.cyl(0.45, 0.32, x, 0.45, z, "#1d1d1d", M.SmoothPlastic, "z"); // tyre
		K.cyl(0.24, 0.36, x, 0.45, z, METAL, M.Metal, "z"); // hub
	}
	K.cyl(0.03, 3.9, -1.45, 3.95, 0.85, "#3a3f45", M.Metal); // flag pole
	K.box(1.3, 0.5, 0.04, -2.1, 5.5, 0.85, "#ff7b00", M.Neon); // pennant
	const flame = K.blob(1.6, 0.7, 0.7, -2.6, 1.2, 0, "#7ef9ff", M.Neon);
	const sparks = [-1.5, 1.5].map((z) => K.ball(0.32, -1.6, 0.35, z, "#3aa8ff", M.Neon));
	for (const p of [flame, ...sparks]) { p.Transparency = 1; p.CastShadow = false; }
	return { model: m, flame, sparks };
}

// ---- windowAt(): framed window with crossbars and a sill, facing +Z*s. Some are lit from inside ----
function windowAt(K: Kit, x: number, y: number, z: number, s: number, w = 2.1, h = 2.3) {
	K.box(w + 0.4, h + 0.4, 0.16, x, y, z, WHITE);
	const lit = math.random() < 0.45;
	const glass = K.box(w, h, 0.18, x, y, z + s * 0.02, lit ? "#e9bd73" : "#2f3d4c", lit ? M.Neon : M.Glass);
	if (!lit) glass.Reflectance = 0.25;
	K.box(0.1, h, 0.22, x, y, z + s * 0.03, WHITE);
	K.box(w, 0.1, 0.22, x, y + h * 0.12, z + s * 0.03, WHITE);
	K.box(w + 0.7, 0.14, 0.45, x, y - h / 2 - 0.25, z + s * 0.18, WHITE);
}

// which way a building's door faces, as a yaw that turns the model's front (+Z) towards it, and its length along that front
function facing(b: Building) {
	const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
	if (b.door.y > b.y + b.h) return { yaw: 0, w: b.w, d: b.h, along: b.door.x - cx };
	if (b.door.y < b.y) return { yaw: math.pi, w: b.w, d: b.h, along: cx - b.door.x };
	if (b.door.x > b.x + b.w) return { yaw: math.pi / 2, w: b.h, d: b.w, along: cy - b.door.y };
	return { yaw: -math.pi / 2, w: b.h, d: b.w, along: b.door.y - cy };
}
const placeAt = (m: Model, b: Building, yaw: number, px: number) =>
	m.PivotTo(new CFrame((b.x + b.w / 2) * px, 0, (b.y + b.h / 2) * px).mul(CFrame.Angles(0, yaw, 0)));

// ---- buildHouse(): wooden house on a stone plinth, snowy gable roof, chimney, porch canopy ----
export function house(b: Building, wall: string, parent: Instance, px: number) {
	const m = model(b.name, parent), K = kit(m, STUDS), f = facing(b);
	const w = f.w * 0.1, d = f.d * 0.1, base = 0.7, wh = 4.6, rh = 3.4, top = base + wh, fz = d / 2, dx = f.along * 0.1;
	K.box(w + 0.35, base, d + 0.35, 0, base / 2, 0, "#8d939b", M.Slate); // stone plinth
	const walls = K.box(w, wh, d, 0, base + wh / 2, 0, wall, M.WoodPlanks);
	for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(0.45, wh, 0.45, (sx * w) / 2, base + wh / 2, (sz * d) / 2, WHITE); // corner boards
	for (const sz of [-1, 1]) K.box(w + 1.5, 0.3, 0.2, 0, top - 0.05, sz * (d / 2 + 0.72), WHITE); // fascia
	K.roof(d + 1.6, rh, w + 1.6, 0, top, 0, ROOF, M.Metal);
	K.roof(d + 1.5, rh * 0.97, w + 1.5, 0, top + 0.32, 0, SNOW, M.Snow);
	const run = d / 2 + 0.8, slope = math.atan2(rh, run), len = math.sqrt(rh * rh + run * run);
	for (const sx of [-1, 1]) for (const sz of [-1, 1]) // white barge boards on the gables
		K.box(0.2, 0.3, len, sx * (w / 2 + 0.8), top + rh / 2, (sz * run) / 2, WHITE, M.SmoothPlastic, CFrame.Angles(sz * slope, 0, 0));
	K.box(1, 2.6, 1, w * 0.25, top + rh * 0.55, -d * 0.15, "#8a3b2a", M.Brick); // chimney
	K.box(1.3, 0.2, 1.3, w * 0.25, top + rh * 0.55 + 1.35, -d * 0.15, "#4a4f57");
	for (const side of [1, -1]) for (const fx of [-0.3, 0.3]) {
		if (side === 1 && math.abs(w * fx - dx) < 2.2) continue; // leave room for the door
		windowAt(K, w * fx, base + wh * 0.55, side * (d / 2 + 0.02), side);
	}
	K.box(2, 3.2, 0.16, dx, base + 1.6, fz + 0.02, WHITE); // door frame
	K.box(1.5, 2.85, 0.2, dx, base + 1.45, fz + 0.06, "#6b3b1c", M.WoodPlanks);
	K.ball(0.08, dx + 0.5, base + 1.45, fz + 0.2, "#d9b44a", M.Metal);
	K.roof(2.6, 0.8, 1.6, dx, base + 3.25, fz + 0.8, ROOF, M.Metal, math.pi / 2); // porch canopy
	K.roof(2.5, 0.78, 1.55, dx, base + 3.38, fz + 0.8, SNOW, M.Snow, math.pi / 2);
	K.box(2.4, 0.35, 1, dx, 0.17, fz + 0.5, METAL, M.Concrete); // steps
	K.box(2.4, 0.35, 0.6, dx, 0.5, fz + 0.3, METAL, M.Concrete);
	placeAt(m, b, f.yaw, px);
	return walls;
}

// ---- buildShop(): flat-roofed store with a lit front, the chain's sign, an entrance canopy ----
export function shop(b: Building, color: string, parent: Instance, px: number) {
	const m = model(b.name, parent), K = kit(m, STUDS), f = facing(b);
	const w = f.w * 0.1, d = f.d * 0.1, hh = 7, fz = d / 2;
	const body = K.box(w, hh, d, 0, hh / 2, 0, "#7d858f", M.Concrete);
	K.box(w * 0.96, hh - 2.6, 0.15, 0, (hh - 2.6) / 2, fz + 0.08, "#262b32"); // dark lower front
	const sign = K.box(w * 0.96, 2.2, 0.2, 0, hh - 1.35, fz + 0.1, color);
	const gui = new Instance("SurfaceGui");
	gui.Face = Enum.NormalId.Back; // the part's +Z face: the street side
	const t = new Instance("TextLabel");
	t.Size = UDim2.fromScale(1, 1);
	t.BackgroundTransparency = 1;
	t.Text = b.name;
	t.TextColor3 = Color3.fromRGB(255, 255, 255);
	t.Font = Enum.Font.GothamBlack;
	t.TextScaled = true;
	t.Parent = gui;
	gui.Parent = sign;
	const GOODS = ["#e8501f", "#2f9e57", "#2d6fd6", "#f5c400"];
	for (const sx of [-1, 1]) { // shop windows with shelves of goods
		const x = sx * w * 0.3;
		K.box(w * 0.32, 3, 0.2, x, 2.4, fz + 0.15, "#fff1c9", M.Neon);
		for (const y of [1.5, 2.3, 3.1]) {
			K.box(w * 0.32, 0.08, 0.3, x, y, fz + 0.2, "#8a6a4a");
			for (let i = 0; i < 8; i++)
				K.box(0.25, 0.45, 0.12, x + (math.random() - 0.5) * w * 0.3, y + 0.27, fz + 0.3, GOODS[math.floor(math.random() * GOODS.size())]);
		}
	}
	K.box(2.8, 3.4, 0.22, 0, 1.7, fz + 0.15, "#9fd3ff", M.Glass); // glass door
	K.box(w + 0.4, 0.6, d + 0.4, 0, hh + 0.2, 0, "#5b626c"); // parapet
	K.box(w + 0.2, 0.3, d + 0.2, 0, hh + 0.55, 0, SNOW, M.Snow);
	K.box(7, 0.3, 2.6, 0, 4.1, fz + 1.3, "#2b2f36", M.Metal); // entrance canopy
	K.box(6.8, 0.14, 2.4, 0, 4.3, fz + 1.3, SNOW, M.Snow);
	for (const sx of [-3.2, 3.2]) K.cyl(0.1, 4, sx, 2, fz + 2.45, "#2b2f36", M.Metal);
	K.box(3, 1.2, 2, -4, hh + 0.6, -3, METAL, M.Metal); // rooftop units
	K.box(4, 1.4, 3, 4, hh + 0.7, 2, METAL, M.Metal);
	placeAt(m, b, f.yaw, px);
	return body;
}

// ---- buildTree() spruce: trunk and five snowy tiers ----
const GREENS = ["#1f4d34", "#244f36", "#1b4630"];
export function spruce(x: number, y: number, parent: Instance, px: number) {
	const m = model("Spruce", parent), K = kit(m, STUDS * (0.8 + math.random() * 0.45));
	const green = GREENS[math.floor(math.random() * GREENS.size())];
	K.cyl(0.42, 2.4, 0, 1.2, 0, "#5a3d2b", M.Wood);
	for (const [r, h, ty] of [[3.4, 3.6, 1.4], [2.9, 3.3, 3.0], [2.35, 3, 4.5], [1.8, 2.6, 5.9], [1.15, 2.2, 7.2]]) {
		K.blob(2 * r, h * 0.75, 2 * r, 0, ty + h * 0.38, 0, green);
		K.blob(1.6 * r, h * 0.3, 1.6 * r, 0, ty + h * 0.72, 0, SNOW, M.Snow);
	}
	m.PivotTo(new CFrame(x * px, 0, y * px).mul(CFrame.Angles(0, math.random() * 6, 0)));
}

// ---- buildLamp(): street lamp with an arm; the arm points along yaw ----
export function lamp(x: number, y: number, yaw: number, parent: Instance, px: number) {
	const m = model("Lamp", parent), K = kit(m, STUDS);
	K.cyl(0.15, 6.4, 0, 3.2, 0, "#2b2f36", M.Metal);
	K.cyl(0.28, 0.4, 0, 0.2, 0, "#2b2f36", M.Metal);
	K.box(1.6, 0.14, 0.14, 0.7, 6.35, 0, "#2b2f36", M.Metal);
	K.box(0.9, 0.22, 0.5, 1.45, 6.3, 0, "#2b2f36", M.Metal);
	const bulb = K.box(0.7, 0.04, 0.34, 1.45, 6.18, 0, "#fff3c4", M.Neon);
	const light = new Instance("SpotLight");
	light.Face = Enum.NormalId.Bottom;
	light.Angle = 120;
	light.Range = 40;
	light.Brightness = 2;
	light.Color = Color3.fromHex("#ffd9a0");
	light.Parent = bulb;
	m.PivotTo(new CFrame(x * px, 0, y * px).mul(CFrame.Angles(0, yaw, 0)));
}

// ---- snowbank / drift: a squashed snow ellipsoid ----
export function drift(x: number, y: number, sx: number, sy: number, sz: number, yaw: number, parent: Instance, px: number) {
	const m = model("Snowbank", parent);
	kit(m, STUDS).blob(sx, sy, sz, 0, 0, 0, SNOW, M.Snow);
	m.PivotTo(new CFrame(x * px, 0, y * px).mul(CFrame.Angles(0, yaw, 0)));
}

// ---- Farmari, the boxy winter estate from buildHazards(); faces +X ----
export function farmari(color: string, parent: Instance) {
	const m = model("Farmari", parent), K = kit(m, STUDS), TRIM = "#2b2f36", GLASS = "#1b2631";
	K.box(8.1, 0.36, 3.66, 0, 0.72, 0, TRIM); // sill
	K.box(8, 0.9, 3.6, 0, 1.3, 0, color);
	K.box(5.25, 1.4, 3.3, -1.1, 2.45, 0, color); // cabin
	K.box(4.75, 0.78, 3.34, -1.05, 2.5, 0, GLASS, M.Glass); // side windows
	for (const x of [-0.33, -2.47]) K.box(0.26, 0.8, 3.38, x, 2.5, 0, color); // B and C pillars
	K.box(0.06, 0.8, 2.9, 1.555, 2.5, 0, GLASS, M.Glass); // windscreen
	K.box(0.06, 0.78, 2.9, -3.755, 2.5, 0, GLASS, M.Glass);
	K.box(0.05, 0.36, 1.5, 4.025, 1.38, 0, TRIM); // grille
	K.box(4.75, 0.3, 2.6, -1.1, 3.3, 0, SNOW, M.Snow); // snow on the roof and bonnet
	K.box(2, 0.12, 2.9, 2.7, 1.81, -0.1, SNOW, M.Snow);
	for (const s of [-1, 1]) {
		K.box(0.3, 0.46, 3.7, s * 4.12, 0.95, 0, TRIM); // bumpers
		K.box(0.04, 0.28, 1, s * 4.29, 0.95, 0, WHITE); // number plates
		K.box(4.4, 0.12, 0.14, -1.15, 3.21, s * 1.45, TRIM); // roof rails
		K.box(0.25, 0.26, 0.36, 1.3, 2.15, s * 1.85, color); // mirrors
		K.box(0.06, 0.34, 0.7, 4.02, 1.4, s * 1.2, "#fff6b0", M.Neon); // headlights
		K.box(0.06, 0.7, 0.36, -4.02, 1.45, s * 1.5, "#d1322b", M.Neon); // tall tail lights
	}
	for (const sx of [-2.55, 2.55]) for (const sz of [-1.62, 1.62]) {
		K.cyl(0.64, 0.5, sx, 0.64, sz, "#1d1d1d", M.SmoothPlastic, "z");
		K.cyl(0.32, 0.54, sx, 0.64, sz, METAL, M.Metal, "z");
	}
	return m;
}

// ---- people and dogs: limbs swing about a hip or shoulder, so each frame poses them from a root CFrame ----
interface Limb { pivot: CFrame; parts: { p: BasePart; rel: CFrame }[] }
export interface Walker { model: Model; still: { p: BasePart; rel: CFrame }[]; legs: Limb[]; arms: Limb[]; head: BasePart }
// a kit whose parts are recorded with their place in the model, so pose() can move them all from one CFrame
function rig(parent: Instance, k: number) {
	const m = model("Walker", parent), K = kit(m, k);
	const rec = (into: { p: BasePart; rel: CFrame }[], p: BasePart, pivot = I) => { into.push({ p, rel: pivot.Inverse().mul(p.CFrame) }); return p; };
	return { m, K, rec };
}
export function pose(w: Walker, root: CFrame, swing: number, armSwing: number, arm1?: number) {
	for (const s of w.still) s.p.CFrame = root.mul(s.rel);
	w.legs.forEach((l, i) => { const a = root.mul(l.pivot).mul(CFrame.Angles(0, 0, i === 0 ? swing : -swing)); for (const s of l.parts) s.p.CFrame = a.mul(s.rel); });
	w.arms.forEach((l, i) => { const a = root.mul(l.pivot).mul(CFrame.Angles(0, 0, i === 0 ? -armSwing : arm1 ?? armSwing)); for (const s of l.parts) s.p.CFrame = a.mul(s.rel); });
}

const SKIN = "#f1c7a5", SCARVES = ["#dd3333", "#f5c400", "#2e8b57", "#2d9cff", "#f4f1ea", "#7b4bbf"];
// buildPerson(), simplified: winter boots, a puffy coat, scarf, mittens, a bobble hat. Faces +X
export function person(coat: string, hat: string, parent: Instance, courier = false, scale = 1): Walker {
	const k = STUDS * scale, { m, K, rec } = rig(parent, k), still: { p: BasePart; rel: CFrame }[] = [];
	const legs = [-0.16, 0.16].map((z): Limb => {
		const pivot = new CFrame(0, 0.95 * k, z * k), parts: Limb["parts"] = [];
		rec(parts, K.cyl(0.12, 0.75, 0, 0.6, z, "#2b2f36", M.Fabric), pivot);
		rec(parts, K.box(0.46, 0.22, 0.27, 0.06, 0.11, z, "#24272d", M.Leather), pivot); // boot
		return { pivot, parts };
	});
	rec(still, K.blob(0.62, 1.25, 0.8, 0, 1.5, 0, coat, M.Fabric)); // coat
	rec(still, K.cyl(0.25, 0.16, 0, 2.02, 0, SCARVES[math.floor(math.random() * SCARVES.size())], M.Fabric));
	const arms = [-0.38, 0.38].map((z): Limb => {
		const pivot = new CFrame(0, 1.9 * k, z * k), parts: Limb["parts"] = [];
		rec(parts, K.cyl(0.11, 0.6, 0, 1.58, z, coat, M.Fabric), pivot);
		rec(parts, K.ball(0.12, 0, 1.22, z, hat, M.Fabric), pivot); // mitten
		return { pivot, parts };
	});
	const head = rec(still, K.ball(0.3, 0, 2.36, 0, SKIN));
	for (const z of [-0.1, 0.1]) rec(still, K.ball(0.045, 0.28, 2.4, z, "#1d1d1d")); // eyes
	rec(still, K.ball(0.07, 0.3, 2.3, 0, "#e8a98a")); // nose
	rec(still, K.blob(0.64, 0.44, 0.64, 0, 2.56, 0, courier ? "#00a3d9" : hat, M.Fabric)); // bobble hat
	rec(still, K.cyl(0.31, 0.1, 0, 2.5, 0, WHITE, M.Fabric));
	rec(still, K.ball(0.11, 0, 2.8, 0, WHITE, M.Fabric));
	if (courier) { // e-moped under the rider, delivery box on the back
		for (const x of [-0.75, 0.75]) rec(still, K.cyl(0.28, 0.14, x, 0.28, 0, "#1d1d1d", M.SmoothPlastic, "z"));
		rec(still, K.box(1.5, 0.1, 0.42, 0, 0.3, 0, "#1d1d1d"));
		rec(still, K.box(0.07, 1.4, 0.07, 0.72, 1, 0, METAL, M.Metal));
		rec(still, K.box(0.07, 0.07, 0.8, 0.72, 1.7, 0, "#1d1d1d"));
		rec(still, K.box(0.75, 0.75, 0.75, -0.55, 1.9, 0, "#00a3d9")); // the insulated box
	}
	return { model: m, still, legs, arms, head };
}

// buildDog(): brown with dark ears and snout. Faces +X
export function dog(parent: Instance): Walker {
	const { m, K, rec } = rig(parent, STUDS), still: { p: BasePart; rel: CFrame }[] = [], FUR = "#8b5a2b", DARK = "#3a2412";
	rec(still, K.blob(1.2, 0.5, 0.5, 0, 0.62, 0, FUR, M.Fabric)); // body
	const head = rec(still, K.ball(0.24, 0.65, 0.88, 0, FUR, M.Fabric));
	rec(still, K.box(0.26, 0.18, 0.22, 0.9, 0.82, 0, DARK));
	rec(still, K.ball(0.05, 1.03, 0.86, 0, "#111111"));
	for (const z of [-0.13, 0.13]) rec(still, K.box(0.1, 0.2, 0.1, 0.6, 1.12, z, DARK));
	rec(still, K.box(0.1, 0.42, 0.1, -0.66, 0.86, 0, FUR, M.Fabric, CFrame.Angles(0, 0, -0.9))); // tail
	const legs = [0.32, -0.32].map((x): Limb => {
		const pivot = new CFrame(x * STUDS, 0.45 * STUDS, 0), parts: Limb["parts"] = [];
		for (const z of [-0.13, 0.13]) rec(parts, K.cyl(0.06, 0.42, x, 0.23, z, FUR, M.Fabric), pivot);
		return { pivot, parts };
	});
	return { model: m, still, legs, arms: [], head };
}

// sidewalk snowplow tractor from buildHazards(), with its orange beacon. Faces +X
export function plow(parent: Instance) {
	const m = model("Plow", parent), K = kit(m, STUDS);
	K.box(3.6, 1.6, 2.4, -0.3, 1.3, 0, "#f5a200");
	K.box(1.8, 1.6, 2.1, -0.8, 2.9, 0, "#2b3440", M.Glass); // cab
	K.box(0.3, 1.1, 3.6, 2.0, 0.7, 0, "#9aa3ad", M.Metal); // blade
	K.box(0.8, 0.5, 3.4, 2.4, 0.3, 0, SNOW, M.Snow); // snow piling up in front of it
	for (const sx of [-1.3, 1]) for (const sz of [-1.2, 1.2]) K.cyl(0.6, 0.4, sx, 0.6, sz, "#151515", M.SmoothPlastic, "z");
	const beacon = K.ball(0.25, -0.8, 3.9, 0, "#ff9d00", M.Neon);
	const light = new Instance("PointLight");
	light.Color = Color3.fromHex("#ff7b00");
	light.Range = 14;
	light.Parent = beacon;
	return { model: m, light };
}

// the spurgu's cardboard, a flattened box under where he reclines
export function cardboard(x: number, y: number, parent: Instance, px: number) {
	const m = model("Cardboard", parent);
	kit(m, STUDS).box(2.4, 0.06, 1.4, 0, 0.03, 0, "#b08a5a", M.Cardboard);
	m.PivotTo(new CFrame(x * px, 0, y * px).mul(CFrame.Angles(0, math.random() * 6, 0)));
}
