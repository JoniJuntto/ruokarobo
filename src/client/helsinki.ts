// Central Helsinki as scenery, minimap, GPS and title shot: the client module helsinki.page.ts names as its
// scenery. The buildings are the real ones (map data © OpenStreetMap contributors, ODbL), so a shop or a
// customer's home is a door, a sign and a canopy on a real wall. Builds the static scene at import, hands the engine
// its MapView, then builds the city itself: buildings, streets, sidewalks and sea ice.
import * as THREE from 'three';
import { BPOLY, CELL, G_ICE, G_SNOW, G_WALL, GH, GW, PPM, ROADS, SPAWNS, STATUE, ZONE, cellAt, freeAt, grid, helsinki, inLake, route, segPoint, zebras, zonePoint, type HelsinkiHouse, type HelsinkiShop } from '../sim/map/helsinki';
import { HKI } from '../sim/map/helsinki.data';
import type { Pt, Robot } from '../sim/types';
import { clamp, rnd } from '../sim/util';
import { blotches, box, flat, group, mat, mesh, place, rbox, scene, sphGeo, Std, tex } from './gfx';
import { addStatic, buildAvanto, buildLamp, buildSauna, buildStatue, buildTree, crackTex, groundMat, metalGray, plateMesh, ready, roadMat, shopFront, snowMat, snowTex, walkMat, white, windowAt } from './scenery';
import { G, OX, OZ, S } from './world';

const { W, H, BLOCKS, SHOPS, HOUSES, KIDS_HOME, DOORS, LAMPS, AVANTO, SAUNA, trees } = helsinki;
const pts = (a: number[], from = 0) => { const o: Pt[] = []; for (let i = from; i + 1 < a.length; i += 2) o.push({ x: a[i], y: a[i + 1] }); return o; };
snowTex.repeat.set((W * S + 400) / 8.4, (H * S + 400) / 8.4);

// ---------- static scene ----------
const staticFrom = scene.children.length; // everything added from here to ready() never moves
{
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W * S + 400, H * S + 400), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  for (let i = 0; i < 50 * BLOCKS; i++) { // snowdrifts in the parks and yards
    const { x, y } = zonePoint([G_SNOW], undefined, ZONE * 1.4, 70);
    if (!freeAt(x, y, 30)) continue;
    const d = mesh(sphGeo(1), snowMat, scene); place(d, x, y, 0); d.scale.set(rnd(2, 5), rnd(.5, 1.1), rnd(1.5, 3)); d.rotation.y = rnd(0, 3);
  }
  buildAvanto();
  for (const [n, shop] of [...SHOPS.map(b => [b, 1] as const), ...HOUSES.map(h => [h, 0] as const)]) // door mats, along the wall
    flat(new THREE.PlaneGeometry(3.6, 1.6), mat(shop ? '#2f7d4a' : '#7a5230', null, .95), n.door.x, n.door.y, .06).rotation.z = Math.atan2(-n.nx, -n.ny);
}
LAMPS.forEach(buildLamp);
// a group standing on a facade: local +Z points out of the wall (nx, ny: the wall's outward normal on the map)
function onWall(p: { door: Pt }, nx: number, ny: number) { const g = group(p.door.x - nx * 1.2 * PPM, p.door.y - ny * 1.2 * PPM); g.rotation.y = Math.atan2(nx, ny); return g; }
function buildDoor(h: HelsinkiHouse) { // the building is the real one: add a front door, a canopy, a step and the house-number plate
  const g = onWall(h, h.nx, h.ny);
  rbox(g, 2.4, 3.6, .3, .05, white, 0, 1.8, .1);
  rbox(g, 1.9, 3.3, .3, .04, '#6b3b1c', 0, 1.65, .18);
  mesh(sphGeo(.08), mat('#d9b44a', null, .3, .8), g, .6, 1.6, .38);
  rbox(g, 3.2, .3, 1.8, .05, '#4a4f57', 0, 3.95, .9); rbox(g, 3, .14, 1.6, .05, snowMat, 0, 4.15, .9);
  rbox(g, 2.8, .35, 1, .05, '#9aa1a8', 0, .17, .5);
  const p = plateMesh(h.no); p.position.set(2, 3, .2); g.add(p);
  if (h === HOUSES[KIDS_HOME]) { // two crossed squares read as a folded paper star, in the window next to the door
    windowAt(g, -3.2, 3.2, .1, 1);
    for (const rz of [0, Math.PI / 4]) box(g, 1, 1, .06, mat('#d7261e', '#ff3a20'), -3.2, 3.2, .32).rotation.z = rz;
  }
}
function buildShop(b: HelsinkiShop) { // the store is in a real building: a lit shop front with the chain's sign, and a canopy over the door
  const g = onWall(b, b.nx, b.ny);
  const f = new THREE.Mesh(new THREE.PlaneGeometry(13, 4.9), shopFront(b)); f.position.set(0, 2.6, .14); g.add(f);
  const dark = mat('#2b2f36', null, .5, .4);
  rbox(g, 7, .3, 2.2, .08, dark, 0, 5.4, 1.1); rbox(g, 6.8, .14, 2, .05, snowMat, 0, 5.6, 1.1); // entrance canopy
  for (let k = 0; k < 3; k++) { // bike rack
    const t = mesh(new THREE.TorusGeometry(.55, .06, 8, 20, Math.PI), metalGray, g, 5 + k * 1.1, 0, 1.6); t.rotation.y = Math.PI / 2;
  }
}
SHOPS.forEach(buildShop); buildSauna(); buildStatue(STATUE);
HOUSES.forEach(buildDoor);
trees.forEach(buildTree);

// ---------- minimap background: the surface raster itself, one pixel per metre, plus the railway ----------
const MINI = 1 / CELL, MWIN = 200 * PPM, miniBg = document.createElement('canvas'); miniBg.width = GW; miniBg.height = GH; // shows 200 m around the robot
{
  const g = miniBg.getContext('2d')!, img = g.createImageData(GW, GH), d = img.data;
  const COL = [[238, 243, 248], [179, 186, 196], [77, 82, 90], [185, 220, 240], [130, 138, 150]];
  for (let i = 0; i < grid.length; i++) { const c = COL[grid[i]]; d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  g.scale(MINI, MINI); g.strokeStyle = 'rgba(110,80,60,.6)'; g.lineWidth = 1.5 * PPM;
  for (const r of HKI.rails) if (!r[0]) { g.beginPath(); for (let i = 1; i + 1 < r.length; i += 2) g.lineTo(r[i], r[i + 1]); g.stroke(); }
  g.fillStyle = '#0f3a55'; g.beginPath(); g.arc(AVANTO.x, AVANTO.y, AVANTO.r * 2, 0, 7); g.fill();
  g.fillStyle = '#6b4226'; g.fillRect(SAUNA.x, SAUNA.y, SAUNA.w, SAUNA.h);
  g.fillStyle = '#8c6a3a'; g.fillRect(STATUE.x, STATUE.y, STATUE.w, STATUE.h);
}

// ---------- GPS ----------
// a street route to the robot's target, refreshed every second: the minimap draws it and the 3D arrow points along it
interface Gps { route: Pt[]; to: Pt; T: number; i: number }
const gpsOf = new WeakMap<Robot, Gps>();
function gps(r: Robot, tgt: Pt): Pt {
  let n = gpsOf.get(r);
  if (!n || n.to !== tgt || G.T > n.T) gpsOf.set(r, n = { route: route(r, tgt), to: tgt, T: G.T + 1, i: 0 });
  const rt = n.route; // where the robot is on the route (closest segment), then 100 px further along it
  let bd = Infinity, bi = 0, bp = rt[0];
  for (let i = 0; i + 1 < rt.length; i++) { const [x, y] = segPoint(r.x, r.y, [rt[i].x, rt[i].y, rt[i + 1].x, rt[i + 1].y]), d = Math.hypot(x - r.x, y - r.y); if (d < bd) { bd = d; bi = i; bp = { x, y }; } }
  n.i = bi + 1;
  let left = 100, p = bp;
  for (let i = bi + 1; i < rt.length; i++) {
    const L = Math.hypot(rt[i].x - p.x, rt[i].y - p.y);
    if (L >= left) return { x: p.x + (rt[i].x - p.x) * left / L, y: p.y + (rt[i].y - p.y) * left / L };
    left -= L; p = rt[i];
  }
  return tgt;
}

const lampD = new Map<Pt, number>();
ready({
  custAt(i) { const h = HOUSES[i]; return { x: h.door.x - h.ny * 22, y: h.door.y + h.nx * 22, rot: -Math.atan2(h.ny, h.nx) }; }, // beside the door, facing the street
  titleCam(cam, T) { // slow orbit over the streets by the station, where the robots start
    const a = T * .08, c = SHOPS[0].door, cx = c.x * S - OX, cz = c.y * S - OZ;
    cam.position.set(cx + Math.sin(a) * 75, 48, cz + Math.cos(a) * 75); cam.lookAt(cx, 4, cz);
  },
  // shadows, snowfall and lamp lights cover a couple of streets, so they follow the local players
  focus: mine => mine.length ? { x: mine.reduce((t, r) => t + r.x, 0) / mine.length, y: mine.reduce((t, r) => t + r.y, 0) / mine.length } : { x: W / 2, y: H / 2 },
  lampsNear: f => { // the same list as before, with each lamp's distance worked out once instead of at every comparison of the sort
    const near = LAMPS.filter(l => Math.abs(l.x - f.x) < 1500 && Math.abs(l.y - f.y) < 1500);
    for (const l of near) lampD.set(l, Math.hypot(l.x - f.x, l.y - f.y));
    return near.sort((a, b) => lampD.get(a)! - lampD.get(b)!);
  },
  aim: gps,
  mini: {
    bg: miniBg, px: MINI, w: MWIN, h: MWIN * .75,
    at: r => ({ x: clamp(r.x - MWIN / 2, 0, W - MWIN), y: clamp(r.y - MWIN * .375, 0, H - MWIN * .75) }), // the robot in the middle
    pin: k => 10 / k,
    over(ctx, r, x, y, k) {
      const n = gpsOf.get(r);
      if (n && n.route.length > 1) { // the GPS route, from the robot to the door
        ctx.strokeStyle = r.color; ctx.lineWidth = 3; ctx.lineJoin = ctx.lineCap = 'round'; ctx.globalAlpha = .75;
        ctx.beginPath(); ctx.moveTo(x + r.x * k, y + r.y * k); for (const p of n.route.slice(n.i)) ctx.lineTo(x + p.x * k, y + p.y * k); ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.font = '900 10px Overpass, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const b of SHOPS) {
        ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(x + b.door.x * k, y + b.door.y * k, 7, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillText(b.tag, x + b.door.x * k, y + b.door.y * k + 1);
      }
      ctx.fillStyle = '#0b4f9c'; for (const h of HOUSES) ctx.fillRect(x + h.door.x * k - 2.5, y + h.door.y * k - 2.5, 5, 5);
    },
    credit: '© OpenStreetMap', // map data licence (ODbL) asks for this credit
  },
}, staticFrom, true);

// ---------- the city: buildings, streets, sidewalks and sea ice ----------
// Built straight into 160-unit chunks, one mesh per material per chunk: few draws, and frustum culling still drops what's behind you.
const facadeTex = tex(256, 256, (c) => { // 4 bays x 4 floors of windows, tinted per building by vertex colour
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, 256, 256);
  blotches(c, 256, 256, 14, 'rgba(120,110,95,.18)', 50);
  for (let r = 0; r < 4; r++) {
    c.fillStyle = 'rgba(90,80,70,.28)'; c.fillRect(0, r * 64 + 60, 256, 3); // cornice line between floors
    for (let k = 0; k < 4; k++) { c.fillStyle = '#f4f1ea'; c.fillRect(k * 64 + 16, r * 64 + 12, 32, 40); c.fillStyle = '#3d4652'; c.fillRect(k * 64 + 19, r * 64 + 15, 26, 34); c.fillStyle = '#f4f1ea'; c.fillRect(k * 64 + 31, r * 64 + 15, 2, 34); }
  }
}, true);
const facadeGlow = tex(256, 256, (c) => { // the same windows, about half of them lit: shows in kaamos darkness
  c.fillStyle = '#000'; c.fillRect(0, 0, 256, 256);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) if (Math.random() < .5) { c.fillStyle = '#ffd98a'; c.fillRect(k * 64 + 19, r * 64 + 15, 12, 34); c.fillRect(k * 64 + 33, r * 64 + 15, 12, 34); }
}, true);
const facadeMat = new Std({ map: facadeTex, vertexColors: true, emissive: '#fff', emissiveMap: facadeGlow, emissiveIntensity: .35, roughness: .85 });
const iceMat0 = new Std({ map: crackTex(true), roughness: .12, metalness: .05 }); // frozen sea
const zebraMat = mat('#eef0f2', null, .7);
const roofTex = snowTex.clone(); roofTex.repeat.set(1, 1); // the ground's snow, one tile per 10 units
const roofMat = new Std({ map: roofTex, color: '#dfe5ec', roughness: .95 });
const FACADES = ['#e8d8b0', '#f0e2c0', '#d9b77c', '#c9c2b5', '#e6c9b5', '#b8b2a8', '#f2ecdf', '#d3a77a', '#9ea7ad', '#e3cf9a', '#c98f6b', '#dcd6c4'];
(function buildCity() {
  interface Bucket { m: THREE.Material; shadow?: boolean; p: number[]; n: number[]; uv: number[]; c: number[]; i: number[] }
  const CH = 1600, buckets = new Map<string, Bucket>();
  const B = (m: THREE.Material, x: number, y: number, shadow?: boolean) => { // geometry accumulator for this material in the chunk around (x, y)
    const k = `${m.uuid}|${Math.floor(x / CH)},${Math.floor(y / CH)}`;
    return buckets.get(k) ?? buckets.set(k, { m, shadow, p: [], n: [], uv: [], c: [], i: [] }).get(k)!;
  };
  const flatV = (b: Bucket, x: number, y: number, h: number, unit: number) => { b.p.push(x * S - OX, h, y * S - OZ); b.n.push(0, 1, 0); b.uv.push(x * S / unit, y * S / unit); return b.p.length / 3 - 1; };
  const tri = (b: Bucket, i: number, j: number, k: number) => { // ground triangles face up whatever order they came in
    const P = b.p, cr = (P[j * 3] - P[i * 3]) * (P[k * 3 + 2] - P[i * 3 + 2]) - (P[j * 3 + 2] - P[i * 3 + 2]) * (P[k * 3] - P[i * 3]);
    b.i.push(i, ...(cr > 0 ? [k, j] : [j, k]));
  };
  // a flat band along a polyline: a quad per segment, and a round joint where it bends or ends
  function ribbon(m: THREE.Material, a: number[], from: number, w: number, h: number, unit: number) {
    const ps = pts(a, from), r = w / 2;
    for (let k = 0; k + 1 < ps.length; k++) {
      const p = ps[k], q = ps[k + 1], L = Math.hypot(q.x - p.x, q.y - p.y);
      if (L < 1) continue;
      const nx = -(q.y - p.y) / L * r, ny = (q.x - p.x) / L * r, b = B(m, (p.x + q.x) / 2, (p.y + q.y) / 2);
      const i0 = flatV(b, p.x + nx, p.y + ny, h, unit), i1 = flatV(b, q.x + nx, q.y + ny, h, unit), i2 = flatV(b, q.x - nx, q.y - ny, h, unit), i3 = flatV(b, p.x - nx, p.y - ny, h, unit);
      tri(b, i0, i1, i2); tri(b, i0, i2, i3);
    }
    ps.forEach((p, k) => {
      if (k > 0 && k < ps.length - 1) { // a straight-through node needs no joint
        const a1 = Math.atan2(p.y - ps[k - 1].y, p.x - ps[k - 1].x), a2 = Math.atan2(ps[k + 1].y - p.y, ps[k + 1].x - p.x);
        if (Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1))) < .2) return;
      }
      const b = B(m, p.x, p.y), c = flatV(b, p.x, p.y, h, unit), n = 8;
      for (let s = 0; s <= n; s++) flatV(b, p.x + Math.cos(s / n * 6.283) * r, p.y + Math.sin(s / n * 6.283) * r, h, unit);
      for (let s = 0; s < n; s++) tri(b, c, c + 1 + s, c + 2 + s);
    });
  }
  function fillPoly(m: THREE.Material, a: number[], from: number, h: number, unit: number) {
    const ps = pts(a, from); if (ps.length < 3) return;
    const cx = ps.reduce((t, p) => t + p.x, 0) / ps.length, cy = ps.reduce((t, p) => t + p.y, 0) / ps.length, b = B(m, cx, cy);
    const base = b.p.length / 3; ps.forEach(p => flatV(b, p.x, p.y, h, unit));
    for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(ps.map(p => new THREE.Vector2(p.x, p.y)), [])) tri(b, base + i, base + j, base + k);
  }
  for (const r of ROADS) ribbon(walkMat, r, 2, r[0] + 5 * PPM, .02, 10); // the sidewalk the raster gives every street
  for (const w of HKI.walks) ribbon(walkMat, w, 1, w[0], .03, 10);
  for (const a of [...HKI.areas, ...HKI.piers]) fillPoly(walkMat, a, 0, .03, 10);
  for (const r of ROADS) ribbon(roadMat, r, 2, r[0], .04, 12);
  for (const c of zebras()) { // zebra stripes: run along the street, laid across it
    for (let o = -c.w / 2 + 10; o < c.w / 2 - 6; o += 16) {
      const mx = c.x - c.uy * o, my = c.y + c.ux * o, b = B(zebraMat, mx, my);
      const q = [[-24, -4], [24, -4], [24, 4], [-24, 4]].map(([a, d]) => flatV(b, mx + c.ux * a - c.uy * d, my + c.uy * a + c.ux * d, .055, 10));
      tri(b, q[0], q[1], q[2]); tri(b, q[0], q[2], q[3]);
    }
  }
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW;) { // sea and lake ice: one quad per run of ice cells in a row
    if (grid[y * GW + x] !== G_ICE) { x++; continue; }
    let e = x; while (e < GW && grid[y * GW + e] === G_ICE) e++;
    const b = B(iceMat0, (x + e) / 2 * CELL, y * CELL), q = [[x, y], [e, y], [e, y + 1], [x, y + 1]].map(([u, v]) => flatV(b, u * CELL, v * CELL, .025, 40));
    tri(b, q[0], q[1], q[2]); tri(b, q[0], q[2], q[3]); x = e;
  }
  // buildings: walls with windows and a flat, snowed-in roof
  const FW = 16 * PPM * S, FH = 12.8 * PPM * S, col = new THREE.Color();
  BPOLY.forEach((ps, bi) => {
    const h = HKI.buildings[bi][0] * S, cx = ps.reduce((t, p) => t + p.x, 0) / ps.length, cy = ps.reduce((t, p) => t + p.y, 0) / ps.length;
    const b = B(facadeMat, cx, cy, true), rf = B(roofMat, cx, cy, true);
    col.set(FACADES[(bi * 7 + (bi >> 3)) % FACADES.length]);
    let u = 0;
    ps.forEach((p, k) => {
      const q = ps[(k + 1) % ps.length], L = Math.hypot(q.x - p.x, q.y - p.y);
      if (L < 1) return;
      const nx = -(q.y - p.y) / L, nz = (q.x - p.x) / L, i = b.p.length / 3, l = L * S;
      b.p.push(p.x * S - OX, 0, p.y * S - OZ, q.x * S - OX, 0, q.y * S - OZ, q.x * S - OX, h, q.y * S - OZ, p.x * S - OX, h, p.y * S - OZ);
      for (let v = 0; v < 4; v++) { b.n.push(nx, 0, nz); b.c.push(col.r, col.g, col.b); }
      b.uv.push(u / FW, 0, (u + l) / FW, 0, (u + l) / FW, h / FH, u / FW, h / FH);
      b.i.push(i, i + 1, i + 2, i, i + 2, i + 3); u += l;
    });
    const base = rf.p.length / 3; ps.forEach(p => flatV(rf, p.x, p.y, h, 10));
    for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(ps.map(p => new THREE.Vector2(p.x, p.y)), [])) tri(rf, base + i, base + j, base + k);
  });
  for (const { m, shadow, p, n, uv, c, i } of buckets.values()) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); if (c.length) g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    g.setIndex(p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(i, 1) : new THREE.Uint16BufferAttribute(i, 1));
    const o = new THREE.Mesh(g, m); o.receiveShadow = true; o.castShadow = !!shadow; addStatic(o);
  }
})();

// map invariants: any failure shows as "Assertion failed" in the console
console.assert(HOUSES[KIDS_HOME] && inLake(AVANTO.x, AVANTO.y) && inLake(SAUNA.x + SAUNA.w / 2, SAUNA.y + SAUNA.h / 2), 'kids home, and the avanto and sauna out on the ice');
console.assert(SHOPS.length >= 5 && HOUSES.length >= 30 && SPAWNS.length === 8, 'Helsinki map: shops, doors and spawn spots');
console.assert(DOORS.every(d => cellAt(d.x, d.y) !== G_WALL), 'every door is outside its building');
console.assert(route(SHOPS[0].door, HOUSES[0].door).length > 2, 'GPS finds a street route');
