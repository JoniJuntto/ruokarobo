// ---------- three.js setup ----------
// Renderer, scene, lights, the 2D overlay canvas, and the small builders every model is made with.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pick, rnd } from '../sim/util';
import type { Rect } from '../sim/types';
import { OX, OZ, S } from './world';

export const MOBILE = matchMedia('(pointer: coarse)').matches || location.search.includes('mobile'); // phones/tablets: lighter shadows and fewer lamp lights
export const PX = MOBILE ? 1.5 : 2; // pixel ratio ceiling: a 3x phone screen at 1.5x draws a quarter of the pixels
export const renderer = new THREE.WebGLRenderer({ antialias: !MOBILE, // phones: MSAA costs more than it shows at 1.5x+ density
  powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, PX));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = MOBILE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
export const scene = new THREE.Scene();
scene.matrixAutoUpdate = false; // the scene itself never moves: left on, three.js recomputes the world matrix of every object in it every frame, static or not
export const FOG_FAR = MOBILE ? 160 : 220; // phones draw one block deep instead of nearly one and a half
export const fog = scene.fog = new THREE.Fog('#cfdbe8', 60, FOG_FAR);
renderer.shadowMap.autoUpdate = false; // updated once per frame, not once per split-screen view
export const camera = new THREE.PerspectiveCamera(45, 1, 1, 700);
const uiCanvas = document.getElementById('ui') as HTMLCanvasElement;
export const ctx = uiCanvas.getContext('2d')!;
export let vw = 0, vh = 0;
export const safe = { t: 0, r: 0, b: 0, l: 0 }; // safe: px a notch or home bar takes off each edge
export function resize() {
  vw = innerWidth; vh = innerHeight;
  const cs = getComputedStyle(document.documentElement);
  for (const k of ['t', 'r', 'b', 'l'] as const) safe[k] = parseFloat(cs.getPropertyValue('--s' + k)) || 0;
  renderer.setSize(vw, vh); camera.aspect = vw / vh; camera.updateProjectionMatrix();
  const d = Math.min(devicePixelRatio || 1, 2); // HUD at 3x on phones is a full-screen clear for nothing
  uiCanvas.width = vw * d; uiCanvas.height = vh * d; uiCanvas.style.width = vw + 'px'; uiCanvas.style.height = vh + 'px';
  ctx.setTransform(d, 0, 0, d, 0, 0);
}
addEventListener('resize', resize); resize();

// filmic tone mapping + a soft studio environment so PBR materials pick up highlights
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = .88;
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(renderer), .04).texture;
export const hemi = new THREE.HemisphereLight('#dfeaf7', '#f4f7fb', 1);
scene.add(hemi);
export const sun = new THREE.DirectionalLight('#fff0dc', 2.6);
sun.position.set(-60, 70, 55); // low winter sun, long shadows
sun.castShadow = true;
sun.shadow.mapSize.setScalar(MOBILE ? 2048 : 4096);
Object.assign(sun.shadow.camera, { left: -100, right: 100, top: 70, bottom: -70, near: 10, far: 300 });
sun.shadow.bias = -.0004; sun.shadow.normalBias = .04;
scene.add(sun);

export type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;
// what both lit material classes below take and expose; isStd marks "a normal lit material" either way
export type StdMat = THREE.MeshStandardMaterial & { isStd?: boolean };
export type Mat = string | THREE.Material | THREE.Material[];
export const _g: Record<string, THREE.BufferGeometry> = {}, _m: Record<string, StdMat> = {};
// phones shade with Lambert: no specular or environment lookups per pixel, about half the fragment work of the PBR shader.
// It keeps roughness/metalness as plain fields because the bakers key on them. isStd marks "a normal lit material" either way.
class LambertStd extends THREE.MeshLambertMaterial {
  roughness: number; metalness: number;
  constructor({ roughness = 1, metalness = 0, ...p }: THREE.MeshStandardMaterialParameters = {}) { super(p as THREE.MeshLambertMaterialParameters); this.roughness = roughness; this.metalness = metalness; }
}
// typed as the standard material: the Lambert stand-in has every field the game touches
export const Std = (MOBILE ? LambertStd : THREE.MeshStandardMaterial) as unknown as new (p?: THREE.MeshStandardMaterialParameters) => StdMat;
(Std.prototype as StdMat).isStd = true;
const LO = MOBILE ? .5 : 1;
export const seg = (n: number, min = 5) => Math.max(min, Math.round(n * LO)); // phones: half the segments on every round shape
export const boxGeo = (w: number, h: number, d: number, r = 0) => _g[`b${w},${h},${d},${r}`] ??= r ? new RoundedBoxGeometry(w, h, d, MOBILE ? 1 : 2, r) : new THREE.BoxGeometry(w, h, d);
export const cylGeo = (a: number, b: number, h: number, n = 16) => _g[`c${a},${b},${h},${n}`] ??= new THREE.CylinderGeometry(a, b, h, seg(n, 6));
export const coneGeo = (r: number, h: number, n = 14) => _g[`k${r},${h},${n}`] ??= new THREE.ConeGeometry(r, h, seg(n, 6));
export const sphGeo = (r: number) => _g[`s${r}`] ??= new THREE.SphereGeometry(r, seg(r < .5 ? 12 : 18, 6), seg(r < .5 ? 9 : 13));
export const capGeo = (r: number, l: number) => _g[`p${r},${l}`] ??= new THREE.CapsuleGeometry(r, l, seg(6, 3), seg(14, 7));
// physically based materials; rough = matte by default, lower it for paint, glass and metal
export const mat = (c: string, e?: string | null, rough = .82, metal = 0) => _m[`${c}|${e || ''}|${rough}|${metal}`] ??= new Std(
  e ? { color: c, emissive: e, emissiveIntensity: .9, roughness: rough, metalness: metal } : { color: c, roughness: rough, metalness: metal });
export function mesh(geo: THREE.BufferGeometry, m: Mat, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, typeof m === 'string' ? mat(m) : m);
  o.position.set(x, y, z); o.receiveShadow = true; parent.add(o);
  o.castShadow = (geo.boundingSphere ?? (geo.computeBoundingSphere(), geo.boundingSphere!)).radius > .12; return o;
}
// fuse a group's plain-coloured mesh children into one vertex-coloured mesh per (roughness, metalness): one draw
// instead of ten. `rough` given = treat all as that roughness (tiny parts on people). Skips textured, glowing,
// see-through meshes and `keep` (parts whose material changes at runtime).
export const _vc: Record<string, StdMat> = {};
export function paint(q: THREE.BufferGeometry, col: THREE.Color) { // solid vertex colour + an index (mergeGeometries wants all indexed); typed loops, this runs on ~1M verts at load
  const n = q.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i += 3) { c[i] = col.r; c[i + 1] = col.g; c[i + 2] = col.b; }
  q.setAttribute('color', new THREE.BufferAttribute(c, 3)); if (!q.index) q.setIndex(seqIndex(n)); return q;
}
// ponytail: geometry.clone() on a SphereGeometry etc. first builds a default sphere, then overwrites it: 90% of load-time baking
export const plainCopy = (geo: THREE.BufferGeometry) => new THREE.BufferGeometry().copy(geo);
export function seqIndex(n: number) { const a = new Uint32Array(n); for (let i = 0; i < n; i++) a[i] = i; return new THREE.BufferAttribute(a, 1); }
export function fuse(g: THREE.Object3D, keep: THREE.Object3D[] = [], rough: number | null = null) {
  const by: Record<string, THREE.Mesh<THREE.BufferGeometry, StdMat>[]> = {};
  for (const o of g.children as THREE.Mesh<THREE.BufferGeometry, StdMat>[]) {
    const m = o.material;
    if (!o.isMesh || keep.includes(o) || Array.isArray(m) || m.map || m.transparent || m.emissive.getHex() || !m.isStd) continue;
    (by[rough ?? `${m.roughness}|${m.metalness}`] ??= []).push(o);
  }
  for (const [k, ms] of Object.entries(by)) {
    if (ms.length < 2) continue;
    const gs = ms.map(o => {
      o.updateMatrix(); const q = plainCopy(o.geometry).applyMatrix4(o.matrix); q.deleteAttribute('uv'); return paint(q, o.material.color);
    });
    const [r, me = 0] = String(k).split('|').map(Number);
    const f = new THREE.Mesh(mergeGeometries(gs), _vc[k] ??= new Std({ vertexColors: true, roughness: r, metalness: me }));
    f.castShadow = f.receiveShadow = true; ms.forEach(o => g.remove(o)); g.add(f);
  }
}
export const boxMat = new Std({ map: tex(128, 128, (g, w) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, w); g.strokeStyle = '#1d232b'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, w - 10);
  g.font = '900 96px Overpass, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#1d232b'; g.fillText('?', w / 2, w / 2 + 6); }),
  transparent: true, opacity: .8, roughness: .2, emissive: '#444', emissiveIntensity: .5 });
export const box = (p: THREE.Object3D, w: number, h: number, d: number, c: Mat, x?: number, y?: number, z?: number) => mesh(boxGeo(w, h, d), c, p, x, y, z);
export const rbox = (p: THREE.Object3D, w: number, h: number, d: number, r: number, c: Mat, x?: number, y?: number, z?: number) => mesh(boxGeo(w, h, d, r), c, p, x, y, z);
export const place = <T extends THREE.Object3D>(o: T, x: number, y: number, h = 0): T => (o.position.set(x * S - OX, h, y * S - OZ), o);
export const group = (x: number, y: number, parent: THREE.Object3D = scene) => { const g = place(new THREE.Group(), x, y); parent.add(g); return g; };
export function flat(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, h: number, sx = 1, sz = 1, parent: THREE.Object3D = scene) {
  const o = new THREE.Mesh(geo, m); o.rotation.x = -Math.PI / 2; o.scale.set(sx, sz, 1);
  place(o, x, y, h); o.receiveShadow = true; parent.add(o); return o;
}
export function tex(w: number, h: number, draw: Draw, repeat?: boolean) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// a ground plane whose UVs are in world units, so one tiling texture fits every sidewalk and road
export function tiled(p: Rect, m: THREE.Material, h: number, unit: number) {
  const g = new THREE.PlaneGeometry(p[2] * S, p[3] * S), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * p[2] * S / unit, uv.getY(i) * p[3] * S / unit);
  return flat(g, m, p[0] + p[2] / 2, p[1] + p[3] / 2, h);
}
export const rect = (p: Rect, color: string, h: number) => flat(new THREE.PlaneGeometry(p[2] * S, p[3] * S), mat(color), p[0] + p[2] / 2, p[1] + p[3] / 2, h);
export function prism(width: number, height: number, length: number) { // gable roof, ridge along X
  const s = new THREE.Shape(); s.moveTo(-width / 2, 0); s.lineTo(width / 2, 0); s.lineTo(0, height); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: false });
  g.translate(0, 0, -length / 2); g.rotateY(Math.PI / 2); return g;
}
export function speckle(c: CanvasRenderingContext2D, w: number, h: number, n: number, colors: string[], rMax = 1.6) {
  for (let i = 0; i < n; i++) { c.fillStyle = pick(colors); c.beginPath(); c.arc(Math.random() * w, Math.random() * h, Math.random() * rMax + .3, 0, 7); c.fill(); }
}
export function blotches(c: CanvasRenderingContext2D, w: number, h: number, n: number, color: string, rMax: number) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = rnd(rMax * .3, rMax), g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
