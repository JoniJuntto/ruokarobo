// Scenery both maps share: textures and materials, the models every map is furnished with (lamps, trees, the sauna
// and its ice hole, the statue, people and dogs), the bake that fuses a map's static scene into a few meshes, and
// the particle pools. A map's own module (village.ts, helsinki.ts) builds its world out of these at import and then
// calls ready() with its MapView; what the engine needs to know about a particular map at run time goes through that.
// ---------- procedural textures ----------
import * as THREE from 'three';
import type { Box, Shop, Tree } from '../sim/map/types';
import type { Pt, Robot } from '../sim/types';
import { type StdMat } from './gfx';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pick, rnd } from '../sim/util';
import { _vc, blotches, box, capGeo, coneGeo, cylGeo, flat, fuse, group, mat, mesh, MOBILE, paint, place, plainCopy, prism, rbox, scene, seqIndex, speckle, sphGeo, Std, sun, tex } from './gfx';
import { AVANTO, HOUSES, KIDS_HOME, OX, OZ, S, SAUNA } from './world';
export const snowTex = tex(512, 512, (c, w, h) => {
  c.fillStyle = '#eef3f8'; c.fillRect(0, 0, w, h);
  blotches(c, w, h, 30, 'rgba(214,226,240,.22)', 110); blotches(c, w, h, 30, 'rgba(255,255,255,.5)', 80);
  speckle(c, w, h, 1800, ['rgba(255,255,255,.95)', 'rgba(205,218,234,.35)'], 1.1);
}, true);
export const asphaltTex = tex(512, 512, (c, w, h) => {
  c.fillStyle = '#4a4f57'; c.fillRect(0, 0, w, h);
  blotches(c, w, h, 50, 'rgba(30,33,38,.35)', 60); blotches(c, w, h, 25, 'rgba(215,222,230,.18)', 80); // road salt
  speckle(c, w, h, 6000, ['rgba(255,255,255,.12)', 'rgba(0,0,0,.25)', 'rgba(120,125,135,.4)'], 1.1);
}, true);
export const walkTex = tex(512, 512, (c, w, h) => { // packed snow on the sidewalk, with footprints
  c.fillStyle = '#cfd5dd'; c.fillRect(0, 0, w, h);
  blotches(c, w, h, 40, 'rgba(240,244,248,.55)', 70); blotches(c, w, h, 20, 'rgba(170,180,192,.2)', 50);
  c.fillStyle = 'rgba(160,170,182,.22)';
  for (let i = 0; i < 70; i++) { const x = Math.random() * w, y = Math.random() * h; c.beginPath(); c.ellipse(x, y, 5, 9, Math.random() * 3, 0, 7); c.fill(); }
  speckle(c, w, h, 2500, ['rgba(255,255,255,.7)', 'rgba(120,130,145,.3)'], 1.2);
}, true);
export const barkTex = tex(128, 512, (c, w, h) => { // birch: white bark with black dashes
  c.fillStyle = '#f1efe8'; c.fillRect(0, 0, w, h);
  blotches(c, w, h, 12, 'rgba(200,195,180,.5)', 30);
  for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(25,25,25,${rnd(.5, .9)})`; c.fillRect(Math.random() * w, Math.random() * h, rnd(8, 40), rnd(2, 5)); }
}, true);
export const crackTex = (repeat?: boolean) => tex(512, 512, (c, w, h) => { // frozen lake or sea: cracks and snow dust
  c.fillStyle = '#b3d9ef'; c.fillRect(0, 0, w, h);
  blotches(c, w, h, 25, 'rgba(240,248,255,.55)', 90); blotches(c, w, h, 15, 'rgba(120,175,210,.4)', 60);
  c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 1.4;
  for (let i = 0; i < 26; i++) {
    let x = Math.random() * w, y = Math.random() * h; c.beginPath(); c.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += rnd(-40, 40); y += rnd(-30, 30); c.lineTo(x, y); } c.stroke();
  }
}, repeat);
export const FI_TEX = tex(180, 110, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 180, 110); c.fillStyle = '#003580'; c.fillRect(50, 0, 30, 110); c.fillRect(0, 40, 180, 30); });
// shared materials
export const snowMat = mat('#fbfdff', null, .9);
export const groundMat = new Std({ map: snowTex, roughness: .95 });
export const walkMat = new Std({ map: walkTex, roughness: .9 });
export const roadMat = new Std({ map: asphaltTex, roughness: .85 });
export const glass = new Std({ color: '#ffd98a', emissive: '#ffb84a', emissiveIntensity: .75, roughness: .15 });
export const darkGlass = mat('#1b2631', null, .08, .3);
export const white = mat('#f4f4f0', null, .7), metalGray = mat('#9aa1a8', null, .35, .6), rubber = mat('#16181b', null, .9);
export function plateMesh(n: number | string) { // house-number plate; a long street number gets smaller type
  const t = tex(64, 48, (g) => { g.fillStyle = '#1f4e9c'; g.fillRect(0, 0, 64, 48); g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeRect(4, 4, 56, 40); g.fillStyle = '#fff'; g.font = `900 ${String(n).length > 2 ? 19 : 30}px Overpass, system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 32, 27); });
  return new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.05), new Std({ map: t, emissive: '#fff', emissiveMap: t, emissiveIntensity: .3, roughness: .5 }));
}

// ---------- what every map is furnished with ----------
export function buildLamp(l: Pt) { // modern street lamp with an arm
  const g = group(l.x, l.y);
  const pole = mat('#2b2f36', null, .5, .5);
  mesh(cylGeo(.12, .18, 6.4, 12), pole, g, 0, 3.2, 0);
  mesh(cylGeo(.26, .3, .4, 12), pole, g, 0, .2, 0);
  rbox(g, 1.6, .14, .14, .05, pole, .7, 6.35, 0);
  rbox(g, .9, .22, .5, .08, pole, 1.45, 6.3, 0);
  box(g, .7, .04, .34, mat('#fff3c4', '#ffd877'), 1.45, 6.18, 0);
}
// ponytail: 14 (6 on phones) real lights follow the players around the map's lamps (70 in the village, ~1100 in Helsinki); more lights = slower shaders and a recompile per change
export const lampLights = Array.from({ length: MOBILE ? 6 : 14 }, () => { const pl = new THREE.PointLight('#ffd9a0', 0, 28, 1); scene.add(pl); return pl; });
export function lightLamps(near: Pt[]) { // near: the lamps to light, nearest first (the map's view picks them)
  lampLights.forEach((pl, i) => place(pl, near[i] ? near[i].x + 14.5 : -1e5, near[i]?.y ?? 0, 6)); // spare lights park far away
}
export function windowAt(g: THREE.Object3D, x: number, y: number, z: number, s: number, w = 2.1, h = 2.3) { // framed window with crossbars and a sill, facing +Z*s
  rbox(g, w + .4, h + .4, .16, .05, white, x, y, z);
  box(g, w, h, .18, glass, x, y, z + s * .02);
  box(g, .1, h, .22, white, x, y, z + s * .03); box(g, w, .1, .22, white, x, y + h * .12, z + s * .03);
  rbox(g, w + .7, .14, .45, .04, white, x, y - h / 2 - .25, z + s * .18);
}
// a lit shop front with the chain's sign over two windows of shelves: the material for the wall it goes on
export function shopFront(b: Shop) {
  const front = tex(512, 192, (c) => {
    c.fillStyle = '#262b32'; c.fillRect(0, 0, 512, 192);
    c.fillStyle = b.color; c.fillRect(0, 0, 512, 72);
    c.fillStyle = '#fff'; c.font = '900 58px Overpass, system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(b.name, 256, 40);
    for (const x of [16, 324]) { // shop windows with shelves
      c.fillStyle = '#fff1c9'; c.fillRect(x, 88, 172, 96);
      c.fillStyle = 'rgba(80,60,40,.25)'; for (let y = 112; y < 184; y += 24) c.fillRect(x, y, 172, 4);
      for (let i = 0; i < 40; i++) { c.fillStyle = pick(['#e8501f', '#2f9e57', '#2d6fd6', '#f5c400']); c.fillRect(x + Math.random() * 166, 98 + (Math.random() * 3 | 0) * 24, 5, 10); }
      c.fillStyle = '#262b32'; for (let k = 1; k < 3; k++) c.fillRect(x + k * 57, 88, 3, 96);
    }
    c.fillStyle = '#9fd3ff'; c.fillRect(214, 86, 84, 106);
  });
  const fm = new Std({ map: front, emissive: '#fff', emissiveMap: front, emissiveIntensity: .45, roughness: .4 });
  return fm;
}
export const smokeFrom = { x: 0, y: 0, h: 0 };
export function buildSauna() {
  const b = SAUNA, g = group(b.x + b.w / 2, b.y + b.h / 2), w = b.w * S, d = b.h * S;
  const log = mat('#7a4e2c', null, .9), logD = mat('#5e3b20', null, .9);
  box(g, w - .2, 3.2, d - .2, logD, 0, 1.6, 0);
  for (let y = .25, i = 0; y < 3.2; y += .44, i++) for (const sz of [-1, 1]) { // stacked logs
    const l = mesh(cylGeo(.22, .22, w + .5, 10), i % 2 ? log : logD, g, 0, y, sz * (d / 2 - .05)); l.rotation.z = Math.PI / 2;
  }
  mesh(prism(d + 1, 2, w + 1), '#2f2a26', g, 0, 3.2, 0);
  mesh(prism(d + .9, 1.95, w + .9), snowMat, g, 0, 3.4, 0);
  rbox(g, .9, 2.4, .9, .05, '#555', w * .3, 4.2, 0);
  windowAt(g, -w * .2, 1.9, d / 2 + .1, 1, 1, .8);
  Object.assign(smokeFrom, { x: b.x + b.w / 2 + w * .3 / S, y: b.y + b.h / 2, h: 5.6 });
}
export function buildAvanto() { // the ice hole, and the sauna's pier beside it
  flat(new THREE.CircleGeometry(1, 32), mat('#e8f4fb'), AVANTO.x, AVANTO.y, .03, (AVANTO.r + 6) * S, (AVANTO.r + 4) * S); // snowy rim
  flat(new THREE.CircleGeometry(1, 32), mat('#0f3a55', null, .05, .2), AVANTO.x, AVANTO.y, .04, AVANTO.r * S, AVANTO.r * .8 * S);
  const pier = group(AVANTO.x + 73, AVANTO.y + 26);
  for (let k = -3; k <= 3; k++) rbox(pier, .85, .22, 1.7, .05, '#8a5a33', k * .93, .25, 0);
  for (const sx of [-2.8, 2.8]) for (const sz of [-.7, .7]) mesh(cylGeo(.12, .12, 1), '#5c3b20', pier, sx, .1, sz);
}
export let flagMesh: THREE.Group | undefined;
export const barkMat = new Std({ map: barkTex, roughness: .8 });
export const crown = new Std({ color: '#7d6658', roughness: 1, transparent: true, opacity: .22, depthWrite: false }); // bare birch twigs, seen as a haze
export function buildTree(t: Tree) {
  const g = group(t.x, t.y); g.rotation.y = rnd(0, 6);
  if (t.kind === 'spruce') {
    g.scale.setScalar(rnd(.8, 1.25));
    const green = mat(pick(['#1f4d34', '#244f36', '#1b4630']), null, .9);
    mesh(cylGeo(.35, .5, 2.4, 8), '#5a3d2b', g, 0, 1.2, 0);
    const tiers = [[3.4, 3.6, 1.4], [2.9, 3.3, 3.0], [2.35, 3, 4.5], [1.8, 2.6, 5.9], [1.15, 2.2, 7.2]];
    for (const [r, h, y] of tiers) {
      const c = mesh(coneGeo(r, h, 11), green, g, rnd(-.1, .1), y + h / 2, rnd(-.1, .1)); c.rotation.y = rnd(0, 3);
      const sn = mesh(coneGeo(r * .78, h * .4, 11), snowMat, g, 0, y + h * .6, 0); sn.rotation.y = rnd(0, 3); // snow on each tier
      for (let k = 0; k < 3; k++) { // clumps on branch tips
        const a = rnd(0, 6.28), cl = mesh(sphGeo(.35), snowMat, g, Math.cos(a) * r * .75, y + .45, Math.sin(a) * r * .75); cl.scale.set(1.4, .5, 1);
      }
    }
  } else if (t.kind === 'birch') {
    const hgt = rnd(8, 10), lean = rnd(-.06, .06);
    const tr = mesh(cylGeo(.24, .36, hgt, 14), barkMat, g, 0, hgt / 2, 0); tr.rotation.z = lean;
    const twig = mat('#6e5a4c', null, .9);
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Group(); p.position.set(Math.sin(lean) * -hgt * .6, rnd(hgt * .45, hgt * .9), 0); p.rotation.set(0, rnd(0, 6), rnd(.45, .95)); g.add(p);
      mesh(cylGeo(.03, .09, 3.6, 6), twig, p, 0, 1.8, 0);
      const q = new THREE.Group(); q.position.y = rnd(1.6, 3); q.rotation.z = rnd(-.7, .7); p.add(q);
      mesh(cylGeo(.015, .04, 1.6, 5), twig, q, 0, .8, 0);
    }
    for (let i = 0; i < 3; i++) { const c = mesh(sphGeo(2.2), crown, g, rnd(-1, 1), hgt - rnd(0, 1.5), rnd(-1, 1)); c.castShadow = false; c.scale.y = 1.2; }
  } else if (t.kind === 'snowman') {
    for (const [r, y] of [[1.4, 1.2], [1, 3.1], [.72, 4.5]]) mesh(sphGeo(r), snowMat, g, 0, y, 0);
    const n = mesh(coneGeo(.13, .9, 10), '#f08a24', g, .95, 4.5, 0); n.rotation.z = -Math.PI / 2;
    for (const z of [-.25, .25]) mesh(sphGeo(.09), '#111', g, .62, 4.75, z);
    for (const y of [2.8, 3.2, 3.6]) mesh(sphGeo(.09), '#111', g, .96, y, 0);
    for (const z of [-1, 1]) { const arm = mesh(cylGeo(.04, .06, 1.8, 5), '#5c4030', g, 0, 3.4, z * 1.4); arm.rotation.x = z * 1; }
    mesh(cylGeo(.42, .42, .65, 16), '#1d1d1d', g, 0, 5.4, 0); mesh(cylGeo(.62, .62, .07, 18), '#1d1d1d', g, 0, 5.08, 0);
    const sc = mesh(new THREE.TorusGeometry(.72, .17, 10, 20), mat('#d33', null, .95), g, 0, 3.9, 0); sc.rotation.x = Math.PI / 2;
  } else {
    mesh(cylGeo(.08, .12, 10, 12), white, g, 0, 5, 0);
    mesh(sphGeo(.16), mat('#d9b44a', null, .3, .8), g, 0, 10.05, 0);
    const fp = new THREE.Group(); fp.position.y = 8.9; g.add(fp);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.2, 12, 1), new Std({ map: FI_TEX, side: THREE.DoubleSide, roughness: .8 }));
    f.position.x = 1.85; f.castShadow = true; fp.add(f); flagMesh = fp;
  }
}
// people face +X. Legs/arms are pivot groups so they can walk, kick, wave and throw
export interface Person { g: THREE.Group; body: THREE.Group; legs: THREE.Group[]; arms: THREE.Group[]; head: THREE.Mesh<THREE.BufferGeometry, StdMat> }
export interface Dog { g: THREE.Group; body: THREE.Group; legs: THREE.Group[]; arms: null; head: null }
export function buildPerson(parent: THREE.Object3D, coat: string, hat: string, scale = 1): Person {
  const g = new THREE.Group(); parent.add(g); g.scale.setScalar(scale);
  const body = new THREE.Group(); g.add(body); // tips over when they slip
  const coatM = mat(coat, null, .85), hatM = mat(hat, null, .95);
  const legs = [-.17, .17].map(z => {
    const leg = new THREE.Group(); leg.position.set(0, .95, z); body.add(leg);
    mesh(capGeo(.13, .55), mat('#2b2f3a', null, .9), leg, 0, -.42, 0);
    rbox(leg, .4, .2, .26, .07, rubber, .07, -.88, 0);
    return leg;
  });
  const torso = mesh(capGeo(.33, .5), coatM, body, 0, 1.47, 0); torso.scale.set(.82, 1, 1.12);
  box(body, .04, .8, .06, mat('#2b2f3a', null, .5), .27, 1.45, 0); // zipper
  const sc = mesh(new THREE.TorusGeometry(.22, .09, 8, 16), hatM, body, 0, 2.02, 0); sc.rotation.x = Math.PI / 2;
  const arms = [-.44, .44].map(z => {
    const a = new THREE.Group(); a.position.set(0, 1.92, z); body.add(a);
    mesh(capGeo(.1, .55), coatM, a, 0, -.38, 0); mesh(sphGeo(.12), hatM, a, 0, -.76, 0);
    return a;
  });
  const head = mesh(sphGeo(.27), new Std({ color: '#f1c7a5', roughness: .7 }), body, 0, 2.33, 0) as Person['head'];
  mesh(sphGeo(.06), mat('#e8a98a', null, .7), body, .27, 2.3, 0);
  for (const z of [-.09, .09]) mesh(sphGeo(.035), '#1d1d1d', body, .24, 2.4, z);
  for (const z of [-.1, .1]) { const br = box(body, .04, .04, .14, '#3a2a1f', .25, 2.47, z); br.rotation.x = z > 0 ? .5 : -.5; }
  const pipo = mesh(new THREE.SphereGeometry(.29, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), hatM, body, 0, 2.4, 0); pipo.scale.y = 1.15;
  mesh(cylGeo(.3, .3, .12, 18), white, body, 0, 2.42, 0);
  mesh(sphGeo(.11), white, body, 0, 2.74, 0);
  fuse(body, [head], .85); legs.forEach(l => fuse(l, [], .88)); arms.forEach(a => fuse(a, [], .85));
  return { g, body, legs, arms, head };
}
export function buildDog(parent: THREE.Object3D): Dog {
  const g = new THREE.Group(); parent.add(g);
  const body = new THREE.Group(); g.add(body);
  const fur = mat('#8b5a2b', null, .95), dark = mat('#3a2412', null, .9);
  const torso = mesh(capGeo(.24, .7), fur, body, 0, .62, 0); torso.rotation.z = Math.PI / 2;
  mesh(sphGeo(.24), fur, body, .65, .88, 0);
  rbox(body, .26, .18, .22, .07, dark, .9, .82, 0); mesh(sphGeo(.05), '#111', body, 1.03, .86, 0);
  for (const z of [-.13, .13]) { const e = mesh(coneGeo(.08, .22, 8), dark, body, .6, 1.12, z); e.rotation.x = z * 2; }
  const tail = mesh(capGeo(.05, .35), fur, body, -.62, .86, 0); tail.rotation.z = -.9;
  const legs = [.32, -.32].map(x => {
    const l = new THREE.Group(); l.position.set(x, .45, 0); body.add(l);
    for (const z of [-.13, .13]) mesh(capGeo(.06, .3), fur, l, 0, -.22, z);
    fuse(l); return l;
  });
  fuse(body, [], .92);
  return { g, body, legs, arms: null, head: null };
}
export function buildStatue(b: Box) { // Olli Lindholm in bronze
  const g = group(b.x + b.w / 2, b.y + b.h / 2), granite = mat('#6f747c', null, .6, .1);
  rbox(g, 4.6, .5, 4.6, .08, granite, 0, .25, 0);
  rbox(g, 3.6, 2.2, 3.6, .1, granite, 0, 1.6, 0);
  rbox(g, 3.4, .2, 3.4, .08, snowMat, 0, 2.75, 0);
  const t = tex(256, 96, (c) => {
    c.fillStyle = '#7a5a2a'; c.fillRect(0, 0, 256, 96); c.strokeStyle = '#e0b860'; c.lineWidth = 6; c.strokeRect(6, 6, 244, 84);
    c.fillStyle = '#f3d68a'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '900 28px Overpass, system-ui'; c.fillText('OLLI LINDHOLM', 128, 38); c.font = '700 22px Overpass, system-ui'; c.fillText('1964–2019', 128, 70);
  });
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.05), new Std({ map: t, roughness: .35, metalness: .7 }));
  plaque.position.set(0, 1.6, 1.82); g.add(plaque);
  const p = buildPerson(g, '#000', '#000', 1.7); p.g.position.y = 2.7; p.g.rotation.y = -Math.PI / 2; // faces the road
  // singing: hand held at the chin, mic tilted up to the mouth (not a raised arm)
  p.arms[1].quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(.42, .2, -.44).normalize());
  const mic = mesh(cylGeo(.05, .08, .3, 8), '#000', p.body, .46, 2.2, -.04); mic.rotation.z = .5;
  mesh(sphGeo(.1), '#000', p.body, .39, 2.34, -.04);
  const bronze = mat('#8c6a3a', null, .35, .85);
  p.g.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = bronze; });
}
// ponytail: ~2700 static meshes → one per (material, shadow flags, 80-unit map chunk), ~2700 → ~150 draw calls.
// Chunks keep frustum culling working. Anything that must move later has to be built after this.
// from: the scene's child count before the map built anything static. byZ: chunk in both directions (a city), not just along x (one street)
function bakeStatic(from: number, byZ: boolean) {
  scene.attach(flagMesh!); // the flag waves; the rest of its pole is static
  scene.updateMatrixWorld(true);
  const buckets = new Map<string, { m: THREE.Material; cast: boolean; recv: boolean; gs: THREE.BufferGeometry[] }>();
  const roots = scene.children.slice(from).filter(o => !(o as THREE.Light).isLight && o !== flagMesh);
  const add = (key: string, m0: THREE.Material, cast: boolean, recv: boolean, g: THREE.BufferGeometry) => {
    let m = m0 as StdMat;
    for (const k in g.attributes) if (k !== 'position' && k !== 'normal' && k !== 'uv' && !(k === 'color' && m.vertexColors)) g.deleteAttribute(k);
    if (m.isStd && !m.map && !m.transparent && !m.emissive.getHex()) { // plain colour → vertex colour, shared material
      g.deleteAttribute('uv'); if (!m.vertexColors) paint(g, m.color); // already fused: keep its colours
      const vk = `${m.roughness}|${m.metalness}`; key = 'vc' + vk + key.slice(m.uuid.length);
      m = _vc[vk] ??= new Std({ vertexColors: true, roughness: m.roughness, metalness: m.metalness });
    }
    const b = buckets.get(key) ?? buckets.set(key, { m, cast, recv, gs: [] }).get(key)!;
    if (!g.index) g.setIndex(seqIndex(g.attributes.position.count)); // mergeGeometries wants all indexed
    b.gs.push(g);
  };
  const p = new THREE.Vector3();
  for (const root of roots) root.traverse(node => {
    const o = node as THREE.Mesh;
    if (!o.isMesh) return;
    o.getWorldPosition(p);
    const f = `${+o.castShadow}${+o.receiveShadow}|${Math.floor((p.x + OX) / 80)}${byZ ? ',' + Math.floor((p.z + OZ) / 80) : ''}`;
    const g = plainCopy(o.geometry).applyMatrix4(o.matrixWorld);
    if (!Array.isArray(o.material)) return add(o.material.uuid + f, o.material, o.castShadow, o.receiveShadow, g);
    for (const gr of o.geometry.groups) { // multi-material box: one sub-geometry per face group
      const s = g.clone(); s.setIndex(new THREE.BufferAttribute(g.index!.array.slice(gr.start, gr.start + gr.count), 1)); s.clearGroups();
      const gm = o.material[gr.materialIndex!];
      add(gm.uuid + f, gm, o.castShadow, o.receiveShadow, s);
    }
  });
  roots.forEach(r => scene.remove(r));
  for (const { m, cast, recv, gs } of buckets.values()) {
    const o = new THREE.Mesh(mergeGeometries(gs), m); o.castShadow = cast; o.receiveShadow = recv;
    addStatic(o);
  }
}
// Static meshes are filed by 320-unit cell, one group each. three.js visits every object in the scene to cull it,
// once per view and once more for the shadow map, and again to refresh its matrix: a city bakes to ~3400 static meshes,
// nearly all of them streets away. A cell that neither this view nor the sun's shadow can reach is skipped whole
// (its meshes would each have failed the same test), and nothing in a cell is revisited for matrices.
const SCELL = 320, cells = new Map<string, { g: THREE.Group; s: THREE.Sphere }>();
export function addStatic(o: THREE.Mesh) { // o: a mesh that never moves, its geometry already in world coordinates
  o.matrixAutoUpdate = false;
  const bs = o.geometry.boundingSphere ?? (o.geometry.computeBoundingSphere(), o.geometry.boundingSphere!);
  const i = Math.floor(bs.center.x / SCELL), j = Math.floor(bs.center.z / SCELL), k = i + ',' + j;
  let c = cells.get(k);
  if (!c) {
    const g = new THREE.Group(); g.matrixAutoUpdate = g.matrixWorldAutoUpdate = false; scene.add(g);
    cells.set(k, c = { g, s: new THREE.Sphere(new THREE.Vector3((i + .5) * SCELL, 0, (j + .5) * SCELL), 0) });
  }
  c.s.radius = Math.max(c.s.radius, c.s.center.distanceTo(bs.center) + bs.radius); // the cell's sphere holds every mesh's own
  c.g.add(o);
}
// The same for what moves but is usually streets away (people, cars: entities.ts lists them per level). o: its root,
// r: a sphere round o.position that holds the whole model in any pose. Out of reach it is hidden and its matrices are left alone
export const movers: { o: THREE.Object3D; r: number }[] = [];
const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _lit = new THREE.Sphere(), _ms = new THREE.Sphere();
scene.onBeforeRender = (_r, _s, cam) => { // three calls this in render(), once the camera's matrices are current
  _fr.setFromProjectionMatrix(_pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  const sc = sun.shadow.camera, far = (sc.near + sc.far) / 2; // a sphere round the box the shadow camera sees: it looks from the sun at its target
  _lit.center.subVectors(sun.target.position, sun.position).normalize().multiplyScalar(far).add(sun.position);
  _lit.radius = Math.hypot(Math.max(-sc.left, sc.right), Math.max(sc.top, -sc.bottom), (sc.far - sc.near) / 2);
  for (const c of cells.values()) c.g.visible = _fr.intersectsSphere(c.s) || sun.castShadow && _lit.intersectsSphere(c.s);
  for (const { o, r } of movers) {
    _ms.center.copy(o.position); _ms.radius = r;
    const on = o.visible = _fr.intersectsSphere(_ms) || sun.castShadow && _lit.intersectsSphere(_ms);
    if (on && !o.matrixWorldAutoUpdate) o.updateMatrixWorld(true); // back in reach: three.js already did this frame's matrices, so catch up now
    o.matrixWorldAutoUpdate = on;
  }
};

// ---------- the map's view ----------
// What the engine asks of whichever map this page shows, each frame. The map's module hands it over with ready().
export interface MapView {
  custAt(i: number): { x: number; y: number; rot: number }; // where the customer at house i's door stands, and which way they face
  titleCam(cam: THREE.PerspectiveCamera, T: number): void;  // the title screen's slow orbit
  focus(mine: Robot[]): Pt;   // the point (px) that shadows, snowfall and lamp lights centre on; mine is empty on the title screen
  lampsNear(f: Pt): Pt[];     // the lamps worth a real light around f, nearest first
  aim?(r: Robot, tgt: Pt): Pt; // on a map with a GPS: the next point on r's way to tgt along the streets (its arrow points there)
  mini: {
    bg: HTMLCanvasElement; px: number; // the map drawn once, at px canvas pixels per map px
    w: number; h: number;              // the window a minimap shows, in map px
    at(r: Robot): Pt;                  // that window's top-left corner for this robot
    pin(k: number): number;            // how far inside the window's edge an off-window target is pinned (map px), at k screen px per map px
    over?(ctx: CanvasRenderingContext2D, r: Robot, x: number, y: number, k: number): void; // extra marks under the dots: map px (px, py) is at (x + px * k, y + py * k)
    credit?: string;                   // attribution the map data's licence asks for
  };
}
export let view: MapView;
// a customer waits at every door; shown when their order is on its way
export let cust: (Person & { custT: number })[] = []; // by house index; custT: seconds they keep waving after a delivery
// the map's module calls this once its static scene is built: bake it, put the customers at their doors, and the engine can start
export function ready(v: MapView, from: number, byZ: boolean) {
  bakeStatic(from, byZ);
  view = v;
  cust = HOUSES.map((h, i) => {
    const c = h === HOUSES[KIDS_HOME] ? buildPerson(scene, '#2d9cff', '#d33', .62) // the kids' house: Eetu answers the door
      : buildPerson(scene, pick(['#7a2e3a', '#2e6b4f', '#5b4a8a', '#3b6ea5']), pick(['#d33', '#f5c400', '#e84393']));
    const at = v.custAt(i);
    place(c.g, at.x, at.y); c.g.rotation.y = at.rot;
    c.g.visible = false;
    return { ...c, custT: 0 };
  });
}

// snowfall
export const SNOW_N = 8000, snowPos = new Float32Array(SNOW_N * 3);
for (let i = 0; i < SNOW_N; i++) { snowPos[i * 3] = rnd(-90, 90); snowPos[i * 3 + 1] = rnd(0, 30); snowPos[i * 3 + 2] = rnd(-55, 55); }
export const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
export const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: '#fff', size: .22, transparent: true, depthWrite: false,
  map: tex(32, 32, (c) => { const g = c.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 32, 32); }) }));
scene.add(snow);
export const smoke = Array.from({ length: 16 }, (_, i) => {
  const m = new THREE.Mesh(sphGeo(1), new Std({ color: '#d5d7dc', roughness: 1, transparent: true, opacity: .5 }));
  scene.add(m); return { m, t: i / 16 * 3 };
});
// snowballs, tow ropes, wheel tracks and snow spray
export const ballPool = Array.from({ length: 16 }, () => { const m = mesh(sphGeo(.22), '#ffffff', scene); m.visible = false; return m; });
export const bottleM = mat('#2f7a3a', null, .15, .1);
export const bottlePool = Array.from({ length: 8 }, () => { const m = mesh(cylGeo(.09, .12, .5, 8), bottleM, scene); m.visible = false; return m; });
export const bolts: { x1: number; y1: number; x2: number; y2: number; t: number }[] = [], BOLT_SEG = 7, boltPos = new Float32Array(8 * BOLT_SEG * 6), boltGeo = new THREE.BufferGeometry();
boltGeo.setAttribute('position', new THREE.BufferAttribute(boltPos, 3));
export const boltLines = new THREE.LineSegments(boltGeo, new THREE.LineBasicMaterial({ color: '#8ff4ff' })); boltLines.frustumCulled = false; scene.add(boltLines);
export const ropePos = new Float32Array(8 * 6), ropeGeo = new THREE.BufferGeometry();
ropeGeo.setAttribute('position', new THREE.BufferAttribute(ropePos, 3));
export const rope = new THREE.LineSegments(ropeGeo, new THREE.LineBasicMaterial({ color: '#222' })); rope.frustumCulled = false; scene.add(rope);
const TRACK_N = 2000, _o = new THREE.Object3D();
export const tracks = new THREE.InstancedMesh(new THREE.PlaneGeometry(.45, .16).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: '#a9b7c7', transparent: true, opacity: .5, depthWrite: false }), TRACK_N);
tracks.count = 0; tracks.frustumCulled = false; scene.add(tracks);
let trackI = 0, trackTotal = 0;
export function clearTracks() { trackTotal = trackI = 0; tracks.count = 0; }
export function addTrack(x: number, y: number, a: number) {
  _o.position.set(x * S - OX, .057, y * S - OZ); _o.rotation.set(0, -a, 0); _o.updateMatrix();
  tracks.setMatrixAt(trackI, _o.matrix); trackI = (trackI + 1) % TRACK_N;
  tracks.count = Math.min(TRACK_N, ++trackTotal); tracks.instanceMatrix.needsUpdate = true;
}
export const SPRAY_N = 600, sprayPos = new Float32Array(SPRAY_N * 3).fill(-50), sprayVel = new Float32Array(SPRAY_N * 3), sprayLife = new Float32Array(SPRAY_N);
export let sprayI = 0;
export const sprayGeo = new THREE.BufferGeometry(); sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
export const spray = new THREE.Points(sprayGeo, new THREE.PointsMaterial({ color: '#fff', size: .2, map: snow.material.map, transparent: true, depthWrite: false }));
spray.frustumCulled = false; scene.add(spray);
export function puff(x: number, y: number, h: number, vx: number, vy: number, vh: number) {
  const i = sprayI; sprayI = (sprayI + 1) % SPRAY_N;
  sprayPos.set([x * S - OX, h, y * S - OZ], i * 3); sprayVel.set([vx, vh, vy], i * 3); sprayLife[i] = .8;
}
export function burst(x: number, y: number, n = 12) { for (let k = 0; k < n; k++) puff(x, y, .3, rnd(-3, 3), rnd(-3, 3), rnd(2, 5)); }
