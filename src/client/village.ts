// The village as scenery, minimap and title shot: the client module village.page.ts names as its scenery.
// Builds the static scene at import (ground, lake, road, wooden houses, shops, trees, lamps: baked into a few meshes)
// and hands the engine its MapView.
import * as THREE from 'three';
import { village, type VillageHouse, type VillageShop } from '../sim/map/village';
import { clamp, rnd } from '../sim/util';
import { type StdMat, blotches, box, boxGeo, cylGeo, flat, group, mat, mesh, place, prism, rbox, rect, scene, speckle, sphGeo, Std, tex, tiled } from './gfx';
import { buildAvanto, buildLamp, buildSauna, buildStatue, buildTree, crackTex, darkGlass, groundMat, metalGray, plateMesh, ready, roadMat, shopFront, snowMat, snowTex, walkMat, white, windowAt } from './scenery';
import { OX, S } from './world';

const { W, H, BW, BLOCKS, PATHS, ROAD, CROSS, LAKE, AVANTO, SAUNA, STATUE, SHOPS, HOUSES, KIDS_HOME, DOORS, LAMPS, trees, freeAt } = village;
snowTex.repeat.set(110, 75);
const sidingTex = tex(256, 256, (c, w, h) => { // vertical board-and-batten, tinted by wall color
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 16) {
    c.fillStyle = `rgba(0,0,0,${rnd(.02, .07)})`; c.fillRect(x, 0, 16, h);
    c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(x, 0, 1.5, h);
    c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(x + 1.5, 0, 2, h);
  }
  speckle(c, w, h, 800, ['rgba(0,0,0,.06)', 'rgba(255,255,255,.08)'], 1.2);
}, true);
const roofTex = tex(256, 64, (c, w, h) => { // standing-seam metal
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 22) { c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x, 0, 2, h); c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(x + 2, 0, 2, h); }
}, true);
const wallMats: Record<string, StdMat> = {}, wallMat = (c: string) => wallMats[c] ??= new Std({ color: c, map: sidingTex, roughness: .85 });
const roofMat = new Std({ color: '#3a3f47', map: roofTex, roughness: .45, metalness: .35 });

// ---------- static scene ----------
const staticFrom = scene.children.length; // everything added from here to ready() never moves
{
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W * S + 120, 400), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  for (let i = 0; i < 50 * BLOCKS; i++) { // snowdrifts in the yards
    const x = rnd(0, W), y = rnd(0, H);
    if (!freeAt(x, y, 30)) continue;
    const d = mesh(sphGeo(1), snowMat, scene); place(d, x, y, 0); d.scale.set(rnd(2, 5), rnd(.5, 1.1), rnd(1.5, 3)); d.rotation.y = rnd(0, 3);
  }
  // plowed snowbanks along the outer edges of the sidewalks
  const gap = (x: number) => DOORS.some(d => Math.abs(d.x - x) < 40) || CROSS.some(c => x > c[0] - 30 && x < c[0] + 70);
  for (const [y, side] of [[553, -1], [767, 1]]) for (let x = 10; x < W; x += rnd(26, 40)) {
    if (gap(x) || (side < 0 && SHOPS.some(b => x > b.x - 10 && x < b.x + b.w + 10))) continue;
    const b = mesh(sphGeo(1), snowMat, scene); place(b, x, y + side * rnd(0, 3), 0);
    b.scale.set(rnd(1.8, 2.8), rnd(.45, .8), rnd(.7, 1)); b.rotation.y = rnd(-.2, .2);
  }
  const lake = new Std({ map: crackTex(), roughness: .12, metalness: .05 });
  flat(new THREE.CircleGeometry(1, 64), lake, LAKE.x, LAKE.y, .025, LAKE.rx * S, LAKE.ry * S);
  buildAvanto();
  tiled(ROAD, roadMat, .02, 12);
  for (const p of PATHS) tiled(p, walkMat, .03, 10);
  for (let x = 10; x < W; x += 60) rect([x, 658, 32, 4], '#e9c84a', .045);
  for (const c of CROSS) for (let y = c[1] + 6; y < c[1] + c[3] - 4; y += 16) rect([c[0], y, c[2], 9], '#eef0f2', .045);
  for (const d of DOORS) flat(new THREE.PlaneGeometry(3.6, 1.6), mat(SHOPS.some(b => b.door === d) ? '#2f7d4a' : '#7a5230', null, .95), d.x, d.y, .05);
}
LAMPS.forEach(buildLamp);
function buildHouse(b: VillageHouse) {
  const g = group(b.x + b.w / 2, b.y + b.h / 2), w = b.w * S, d = b.h * S, base = .7, wh = 4.6, rh = 3.4, top = base + wh;
  const s = b.door.y > b.y + b.h / 2 ? 1 : -1, fz = s * d / 2;
  rbox(g, w + .35, base, d + .35, .08, '#8d939b', 0, base / 2, 0); // stone plinth
  mesh(boxGeo(w, wh, d), wallMat(b.wall!), g, 0, base + wh / 2, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, .45, wh, .45, white, sx * w / 2, base + wh / 2, sz * d / 2);
  for (const sz of [-1, 1]) box(g, w + 1.5, .3, .2, white, 0, top - .05, sz * (d / 2 + .72)); // fascia
  mesh(prism(d + 1.6, rh, w + 1.6), roofMat, g, 0, top, 0);
  mesh(prism(d + 1.5, rh * .97, w + 1.5), snowMat, g, 0, top + .32, 0);
  const run = d / 2 + .8, slope = Math.atan2(rh, run), len = Math.hypot(rh, run);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { // white barge boards on the gables
    const bb = box(g, .2, .3, len, white, sx * (w / 2 + .8), top + rh / 2, sz * run / 2); bb.rotation.x = sz * slope;
  }
  rbox(g, 1, 2.6, 1, .05, '#8a3b2a', w * .25, top + rh * .55, -s * d * .15);
  rbox(g, 1.3, .2, 1.3, .05, '#4a4f57', w * .25, top + rh * .55 + 1.35, -s * d * .15);
  const dx = (b.door.x - b.x - b.w / 2) * S;
  for (const side of [1, -1]) for (const fx of [-.3, .3]) {
    if (side === s && Math.abs(w * fx - dx) < 2.2) continue; // leave room for the door
    windowAt(g, w * fx, base + wh * .55, side * (d / 2 + .02), side);
    if (b === HOUSES[KIDS_HOME] && side === s) { // two crossed squares read as a folded paper star, in both front windows
      for (const rz of [0, Math.PI / 4]) box(g, 1, 1, .06, mat('#d7261e', '#ff3a20'), w * fx, base + wh * .55, side * (d / 2 + .14)).rotation.z = rz;
    }
  }
  rbox(g, 2, 3.2, .16, .05, white, dx, base + 1.6, fz + s * .02);
  rbox(g, 1.5, 2.85, .2, .04, '#6b3b1c', dx, base + 1.45, fz + s * .06);
  mesh(sphGeo(.08), mat('#d9b44a', null, .3, .8), g, dx + .5, base + 1.45, fz + s * .2);
  const canopy = mesh(prism(2.6, .8, 1.6), roofMat, g, dx, base + 3.25, fz + s * .8); canopy.rotation.y = Math.PI / 2;
  const cs = mesh(prism(2.5, .78, 1.55), snowMat, g, dx, base + 3.38, fz + s * .8); cs.rotation.y = Math.PI / 2;
  rbox(g, 2.4, .35, 1, .05, '#9aa1a8', dx, .17, fz + s * .5); rbox(g, 2.4, .35, .6, .05, '#9aa1a8', dx, .5, fz + s * .3);
  const p = plateMesh(b.n); p.position.set(dx + 1.7, base + 2.8, fz + s * .1); if (s < 0) p.rotation.y = Math.PI; g.add(p);
}
function buildBlock(b: VillageHouse) {
  const g = group(b.x + b.w / 2, b.y + b.h / 2), w = b.w * S, d = b.h * S, hh = 16;
  const facade = tex(256, 256, (c) => {
    c.fillStyle = '#ddd2bd'; c.fillRect(0, 0, 256, 256);
    blotches(c, 256, 256, 12, 'rgba(160,150,130,.25)', 50);
    for (let r = 0; r < 5; r++) {
      c.fillStyle = 'rgba(120,110,95,.35)'; c.fillRect(0, 48 + r * 50, 256, 2); // floor seams
      for (let k = 0; k < 4; k++) {
        const lit = Math.random() < .6;
        c.fillStyle = '#f7f4ee'; c.fillRect(17 + k * 60, 13 + r * 50, 40, 34);
        c.fillStyle = lit ? '#ffd98a' : '#3d4652'; c.fillRect(20 + k * 60, 16 + r * 50, 34, 28);
        c.fillStyle = '#f7f4ee'; c.fillRect(36 + k * 60, 16 + r * 50, 2, 28);
      }
    }
  });
  const fm = new Std({ map: facade, emissive: '#fff', emissiveMap: facade, emissiveIntensity: .22, roughness: .85 });
  mesh(boxGeo(w, hh, d), [fm, fm, snowMat, fm, fm, fm], g, 0, hh / 2, 0);
  rbox(g, w + .5, .7, d + .5, .1, '#8d939b', 0, hh + .3, 0); // parapet
  rbox(g, w + .2, .35, d + .2, .1, snowMat, 0, hh + .75, 0);
  const rail = new Std({ color: '#cfe6f5', roughness: .1, metalness: .1, transparent: true, opacity: .45 });
  for (let r = 1; r < 5; r++) for (const fx of [-.32, .32]) { // balconies on the front
    rbox(g, 4.4, .25, 1.6, .06, '#b9b1a2', w * fx, r * 3.2 + .35, d / 2 + .8);
    box(g, 4.4, 1.1, .08, rail, w * fx, r * 3.2 + .95, d / 2 + 1.56);
    rbox(g, 4.2, .12, 1.4, .05, snowMat, w * fx, r * 3.2 + .55, d / 2 + .8);
  }
  const dx = (b.door.x - b.x - b.w / 2) * S;
  rbox(g, 2.6, 3.2, .2, .05, darkGlass, dx, 1.6, d / 2 + .1);
  rbox(g, 4.6, .3, 2.4, .08, '#4a4f57', dx, 3.6, d / 2 + 1.1);
  const p = plateMesh(b.n); p.position.set(dx + 2.4, 3.1, d / 2 + .12); g.add(p);
}
function buildShop(b: VillageShop) {
  const g = group(b.x + b.w / 2, b.y + b.h / 2), w = b.w * S, d = b.h * S, hh = 7;
  const fm = shopFront(b);
  const wall = mat('#7d858f', null, .6, .2);
  mesh(boxGeo(w, hh, d), [wall, wall, snowMat, wall, fm, wall], g, 0, hh / 2, 0);
  rbox(g, w + .4, .6, d + .4, .1, '#5b626c', 0, hh + .2, 0);
  rbox(g, w + .2, .3, d + .2, .1, snowMat, 0, hh + .55, 0);
  const dark = mat('#2b2f36', null, .5, .4);
  rbox(g, 7, .3, 2.6, .08, dark, 0, 4.1, d / 2 + 1.3); // entrance canopy
  rbox(g, 6.8, .14, 2.4, .05, snowMat, 0, 4.3, d / 2 + 1.3);
  for (const sx of [-3.2, 3.2]) mesh(cylGeo(.1, .1, 4), dark, g, sx, 2, d / 2 + 2.45);
  rbox(g, 3, 1.2, 2, .1, metalGray, -4, hh + .6, -3); rbox(g, 4, 1.4, 3, .1, metalGray, 4, hh + .7, 2);
  for (let k = 0; k < 3; k++) { // bike rack
    const t = mesh(new THREE.TorusGeometry(.55, .06, 8, 20, Math.PI), metalGray, g, w / 2 - 2 - k * 1.1, 0, d / 2 + 1.5); t.rotation.y = Math.PI / 2;
  }
}
SHOPS.forEach(buildShop); buildSauna(); buildStatue(STATUE);
HOUSES.forEach(h => h.tall ? buildBlock(h) : buildHouse(h));
trees.forEach(buildTree);

// ---------- minimap background: the whole village, drawn once ----------
const MINI = .3, miniBg = document.createElement('canvas'); miniBg.width = W * MINI; miniBg.height = H * MINI;
{
  const g = miniBg.getContext('2d')!; g.scale(MINI, MINI);
  g.fillStyle = '#eef3f8'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#b9dcf0'; g.beginPath(); g.ellipse(LAKE.x, LAKE.y, LAKE.rx, LAKE.ry, 0, 0, 7); g.fill();
  g.fillStyle = '#0f3a55'; g.beginPath(); g.arc(AVANTO.x, AVANTO.y, AVANTO.r, 0, 7); g.fill();
  g.fillStyle = '#4d525a'; g.fillRect(...ROAD);
  g.fillStyle = '#b3bac4'; PATHS.forEach(p => g.fillRect(...p));
  for (const b of SHOPS) { g.fillStyle = b.color; g.fillRect(b.x, b.y, b.w, b.h); }
  g.fillStyle = '#6b4226'; g.fillRect(SAUNA.x, SAUNA.y, SAUNA.w, SAUNA.h);
  g.fillStyle = '#8c6a3a'; g.fillRect(STATUE.x, STATUE.y, STATUE.w, STATUE.h);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 72px Overpass, system-ui, sans-serif';
  for (const h of HOUSES) { g.fillStyle = '#0b4f9c'; g.fillRect(h.x, h.y, h.w, h.h); g.fillStyle = '#fff'; g.fillText(String(h.n), h.x + h.w / 2, h.y + h.h / 2 + 6); }
  g.fillStyle = '#fff'; for (const b of SHOPS) g.fillText(b.tag, b.x + b.w / 2, b.y + b.h / 2 + 6);
}

ready({
  custAt(i) { // beside the door, facing the street
    const h = HOUSES[i], south = h.door.y > h.y + h.h / 2;
    return { x: h.door.x + 22, y: south ? h.door.y - 12 : h.door.y + 8, rot: south ? -Math.PI / 2 : Math.PI / 2 };
  },
  titleCam(cam, T) { // slow orbit over the first block
    const a = T * .08, tx = BW / 2 * S - OX;
    cam.position.set(tx + Math.sin(a) * 110, 75, Math.cos(a) * 80); cam.lookAt(tx, 0, 0);
  },
  // shadows, snowfall and lamp lights cover one block's worth, so they follow the local players along the street
  focus: mine => ({ x: mine.length ? mine.reduce((t, r) => t + r.x, 0) / mine.length : BW / 2, y: H / 2 }),
  lampsNear: f => [...LAMPS].sort((a, b) => Math.abs(a.x - f.x) - Math.abs(b.x - f.x)),
  mini: { bg: miniBg, px: MINI, w: BW, h: H, at: r => ({ x: clamp(r.x - BW / 2, 0, W - BW), y: 0 }), pin: () => 30 }, // shows one block's width around the robot
}, staticFrom, false);

console.assert(HOUSES[KIDS_HOME] && HOUSES[KIDS_HOME].door.x < BW, 'kids home is in block 0');
