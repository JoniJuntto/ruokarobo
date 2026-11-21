// Views: the meshes that show the simulation's entities. The game state never points at a mesh; a view is looked
// up by its entity object. Hazard views are rebuilt whenever a level's hazards are rolled, robot views are
// built the first time a robot is drawn and dropped when it is gone from the state.
// ---------- hazards & cars (rebuilt per level) ----------
import * as THREE from 'three';
import type { Car, Hole, IcePatch, ItemBox, Kid, Loot, Ped, Present, Pt, Robot, Thief } from '../sim/types';
import { achToast } from './achievements';
import { esc } from './dom';
import { nameOf, net } from './net';
import type { Dog, Person } from './scenery';
import { WOLT } from '../sim/data';
import { rnd } from '../sim/util';
import { _g, box, boxGeo, boxMat, coneGeo, cylGeo, flat, fuse, mat, mesh, place, rbox, scene, sphGeo, Std } from './gfx';
import { bottleM, buildDog, buildPerson, darkGlass, FI_TEX, metalGray, movers, rubber, snowMat, white } from './scenery';
import { G, S, SHOPS } from './world';
// its own matrix is fixed, so three.js does not recompute every hazard's world matrix each frame on its account: only what moved
const newHazardGroup = () => { const g = new THREE.Group(); g.matrixAutoUpdate = false; scene.add(g); return g; };
const still = <T extends THREE.Object3D>(o: T) => { o.updateMatrix(); o.matrixAutoUpdate = false; return o; }; // placed once, never moves: no matrix work per frame
let hazardGroup = newHazardGroup(), holeGeos: THREE.BufferGeometry[] = [];
export const hv = {
  ice: new Map<IcePatch, THREE.Mesh>(), presents: new Map<Present, THREE.Group>(), cars: new Map<Car, THREE.Group>(), peds: new Map<Ped, Person | Dog>(),
  thieves: new Map<Thief, THREE.Group>(), boxes: new Map<ItemBox, THREE.Group>(), loot: new Map<Loot, THREE.Group>(), kids: new Map<Kid, Person>(),
  plow: null as { g: THREE.Group; beacon: THREE.Mesh } | null, eetu: null as THREE.Group | null,
};
const iceMat = new Std({ color: '#dff2fe', roughness: .05, metalness: .1, transparent: true, opacity: .9 });
const rimGeo = new THREE.TorusGeometry(1, .28, 6, 20);
export function holeMesh(h: Hole, into: THREE.Object3D = hazardGroup) {
  const r = h.r * S;
  const rim = new THREE.Mesh(rimGeo, mat('#6c6f75')); rim.rotation.x = Math.PI / 2; rim.scale.set(r + .2, r, 1);
  place(rim, h.x, h.y, .06); rim.receiveShadow = true; into.add(still(rim));
  still(flat(_g.circ ??= new THREE.CircleGeometry(1, 32), mat('#141518'), h.x, h.y, .09, r, r * .85, into));
  still(flat(_g.circ, mat('#34506b'), h.x + 3, h.y + 2, .1, r * .5, r * .3, into));
}
export function buildHazards() {
  scene.remove(hazardGroup); hazardGroup = newHazardGroup(); movers.length = 0;
  holeGeos.forEach(g => g.dispose()); holeGeos = [];
  for (const m of Object.values(hv)) if (m instanceof Map) m.clear();
  hv.plow = hv.eetu = null;
  for (const p of G.ice) hv.ice.set(p, still(flat(_g.circ ??= new THREE.CircleGeometry(1, 32), iceMat, p.x, p.y, .06, p.rx * S, p.ry * S, hazardGroup))); // sync() hides the melted ones
  if (G.eetu) {
    const m = buildPerson(hazardGroup, '#2d9cff', '#d33', .62); place(m.g, G.eetu.x, G.eetu.y, -1.1);
    m.arms?.forEach(a => a.rotation.z = Math.PI * .8); hv.eetu = m.g;
  }
  for (const p of G.presents) { // wrapped box with a gold ribbon
    const g = new THREE.Group(); hv.presents.set(p, g); hazardGroup.add(g); place(g, p.x, p.y);
    box(g, 1.1, .8, 1.1, mat('#c0262d'), 0, .4, 0); box(g, 1.14, .82, .2, mat('#f5c400', null, .3, .6), 0, .4, 0); box(g, .2, .82, 1.14, mat('#f5c400', null, .3, .6), 0, .4, 0);
    g.rotation.y = rnd(0, 3); g.visible = !p.gone;
  }
  // a level's potholes are three meshes each (rim, pit, glint) and never move: one mesh per 80-unit cell instead, so a street
  // of them is a handful of draws. A hole dug mid-shift (holeMesh from a 'hole' event) stays as it is
  const holeCells = new Map<string, THREE.Group>();
  for (const h of G.holes) { const k = `${Math.floor(h.x * S / 80)},${Math.floor(h.y * S / 80)}`; holeMesh(h, holeCells.get(k) ?? holeCells.set(k, new THREE.Group()).get(k)!); }
  for (const c of holeCells.values()) {
    fuse(c);
    for (const m of [...c.children] as THREE.Mesh[]) { m.castShadow = false; holeGeos.push(m.geometry); hazardGroup.add(still(m)); } // as the three were: shadows fall on a pothole, it casts none
  }
  for (const c of G.cars) {
    const g = new THREE.Group(); hv.cars.set(c, g); hazardGroup.add(g);
    // Farmari: a boxy estate, the cabin running to the tail. Same footprint and wheel spots as the old saloon
    const paint = mat(c.color, null, .3, .3), trim = mat('#2b2f36', null, .6);
    rbox(g, 8.1, .36, 3.66, .1, trim, 0, .72, 0); // sill
    rbox(g, 8, .9, 3.6, .2, paint, 0, 1.3, 0);
    rbox(g, 5.25, 1.4, 3.3, .2, paint, -1.1, 2.45, 0); // cabin
    box(g, 4.75, .78, 3.34, darkGlass, -1.05, 2.5, 0); // side windows
    for (const x of [-.33, -2.47]) box(g, .26, .8, 3.38, paint, x, 2.5, 0); // B and C pillars
    box(g, .06, .8, 2.9, darkGlass, 1.555, 2.5, 0); box(g, .06, .78, 2.9, darkGlass, -3.755, 2.5, 0); // windscreen, rear window
    box(g, .05, .36, 1.5, trim, 4.025, 1.38, 0); // grille
    rbox(g, 4.75, .3, 2.6, .12, snowMat, -1.1, 3.3, 0); rbox(g, 2, .12, 2.9, .05, snowMat, 2.7, 1.81, -.1); // snow on the roof and bonnet
    for (const s of [-1, 1]) {
      rbox(g, .3, .46, 3.7, .1, trim, s * 4.12, .95, 0); // bumpers
      box(g, .04, .28, 1, white, s * 4.29, .95, 0); box(g, .02, .28, .14, mat('#1f4bb8'), s * 4.305, .95, s * .42); // plates, EU strip on the left
      box(g, 4.4, .12, .14, trim, -1.15, 3.21, s * 1.45); // roof rails
      box(g, .25, .26, .36, paint, 1.3, 2.15, s * 1.85); // mirrors
      box(g, .05, .5, .5, trim, -3.35, .55, s * 1.65); // mud flaps
      box(g, .06, .34, .7, mat('#fff6b0', '#fff6b0'), 4.02, 1.4, s * 1.2); box(g, .06, .7, .36, mat('#d1322b', '#ff2222'), -4.02, 1.45, s * 1.5); // head and tall tail lights
    }
    for (const sx of [-2.55, 2.55]) for (const sz of [-1.62, 1.62]) {
      mesh(cylGeo(.64, .64, .5, 20), rubber, g, sx, .64, sz).rotation.x = Math.PI / 2;
      mesh(cylGeo(.32, .32, .54, 14), metalGray, g, sx, .64, sz).rotation.x = Math.PI / 2;
    }
    fuse(g); movers.push({ o: g, r: 8 });
  }
  for (const p of G.peds) { // grumpy locals and their dogs
    const m = p.kind === 'dog' ? buildDog(hazardGroup) : buildPerson(hazardGroup, p.color!, p.hat!, 1, p.kind === 'wolt' ? { style: 'beanie', scarf: '#1d232b' } : {});
    if (p.kind === 'wolt') { // e-moped under the rider, delivery box on the back; all in body so it tips over with them
      for (const x of [-.75, .75]) mesh(cylGeo(.28, .28, .14, 14), rubber, m.body, x, .28, 0).rotation.x = Math.PI / 2;
      box(m.body, 1.5, .1, .42, rubber, 0, .3, 0); box(m.body, .07, 1.4, .07, metalGray, .72, 1, 0); box(m.body, .07, .07, .8, rubber, .72, 1.7, 0);
      box(m.body, .6, .7, .7, mat(WOLT, null, .6), -.6, 1.6, 0);
    }
    hv.peds.set(p, m); movers.push({ o: m.g, r: 5 });
  }
  for (const t of G.thieves) { // Prösma: the rival chain's delivery bot, green with red eyes
    const g = new THREE.Group(); hv.thieves.set(t, g); hazardGroup.add(g); g.scale.setScalar(.4); movers.push({ o: g, r: 3 });
    rbox(g, 3.6, 1.45, 2.6, .38, mat('#0a8f3c', '#053d1a', .45), 0, 1.25, 0);
    rbox(g, 3.66, .42, 2.66, .16, mat('#14181d', null, .6), 0, .62, 0);
    rbox(g, 3, .22, 2.25, .1, mat('#f2f2ee', null, .5), -.08, 2.02, 0);
    for (const sz of [-.55, .55]) mesh(sphGeo(.16), mat('#ff3b30', '#ff3b30'), g, 1.84, 1.45, sz);
  }
  for (const b of G.boxes) { // translucent rainbow cube with a ? on every face
    const bm = place(new THREE.Group(), b.x, b.y); hv.boxes.set(b, bm); hazardGroup.add(bm);
    mesh(boxGeo(2.2, 2.2, 2.2, .25), boxMat, bm).castShadow = false;
  }
  for (const l of G.loot) { // a small glowing crate, spinning so it catches the eye once you're close
    const lm = place(new THREE.Group(), l.x, l.y); hv.loot.set(l, lm); hazardGroup.add(lm);
    if (l.ham) { // meat thermometer: red-rimmed dial on a steel probe
      const dial = new THREE.Group(); dial.position.y = .5; lm.add(dial); dial.rotation.x = Math.PI / 2;
      mesh(cylGeo(.7, .7, .14, 24), mat('#d42a36', '#7a0010', .35), dial); mesh(cylGeo(.56, .56, .2, 24), mat('#f6f4ee', null, .25), dial);
      box(dial, .07, .04, .46, '#14181d', 0, .12, .12).rotation.y = .7; // needle
      mesh(cylGeo(.07, .02, 1.4, 8), mat('#c9cfd6', null, .2, 1), lm, 0, -.25, 0);
      continue;
    }
    rbox(lm, 1.5, 1, 1.1, .12, mat('#ffb400', '#8a5200', .3, .4), 0, 0, 0);
    box(lm, 1.54, .22, 1.14, '#1d232b', 0, 0, 0); box(lm, .24, 1.04, 1.14, '#1d232b', 0, 0, 0);
  }
  for (const k of G.kids) { // kid behind a snowdrift, or a bum lounging on cardboard with his bottles
    const m = buildPerson(hazardGroup, k.coat, k.hat, k.bum ? 1 : .62, { spurgu: k.bum });
    hv.kids.set(k, m); movers.push({ o: m.g, r: 5 });
    if (k.bum) {
      m.body.rotation.z = 1.15; m.body.position.set(.9, .35, 0); // reclined, feet towards the path
      box(m.g, 3, .06, 1.4, '#a07a4a', -.2, .03, 0);
      for (const z of [-.9, .9]) { const b = mesh(cylGeo(.09, .12, .5, 8), bottleM, m.g, 1.4, .25, z); if (z > 0) b.rotation.z = 1.5; }
      continue;
    }
    const d = mesh(sphGeo(1), '#f7fafc', hazardGroup); place(d, k.x + k.dx * 12, k.y + k.dy * 12);
    d.scale.set(1.4, .9, 1.4); still(d);
  }
  if (G.plow) { // sidewalk snowplow tractor
    const g = new THREE.Group(); hazardGroup.add(g);
    box(g, 3.6, 1.6, 2.4, '#f5a200', -.3, 1.3, 0); box(g, 1.8, 1.6, 2.1, '#2b3440', -.8, 2.9, 0);
    box(g, .3, 1.1, 3.6, '#9aa3ad', 2.0, .7, 0);
    for (const sx of [-1.3, 1]) for (const sz of [-1.2, 1.2]) { const w = mesh(cylGeo(.6, .6, .4, 12), '#151515', g, sx, .6, sz); w.rotation.x = Math.PI / 2; }
    hv.plow = { g, beacon: mesh(sphGeo(.25), mat('#ff9d00', '#ff7b00'), g, -.8, 3.9, 0) };
  }
}

// Santa's sleigh: built once, shown while he bowls down a lane. Local +x is forward.
export const sleigh = new THREE.Group(); scene.add(sleigh); sleigh.visible = false;
{
  const red = mat('#c0262d', null, .35, .2), gold = mat('#f5c400', null, .3, .7);
  rbox(sleigh, 4.4, 1.4, 3, .4, red, -3.2, 1.3, 0); rbox(sleigh, 1.3, 2.2, 3, .4, red, -5, 1.9, 0);
  for (const z of [-1.35, 1.35]) { box(sleigh, 6, .18, .2, gold, -3.3, .3, z); const c = box(sleigh, 1, .18, .2, gold, .1, .6, z); c.rotation.z = .8; }
  buildPerson(sleigh, '#c0262d', '#c0262d', 1.25, { style: 'santa', beard: true, scarf: '#f4f1ea' }).g.position.set(-3.6, .6, 0);
  mesh(sphGeo(1), '#6b4a2b', sleigh, -5.3, 3.3, 0).scale.set(.8, .9, .9); // sack of presents
}
export const deer: Dog[] = [];
{
  for (const x of [1.6, 4.6]) for (const z of [-.9, .9]) {
    const d = buildDog(sleigh); d.g.position.set(x, .2, z); d.g.scale.setScalar(1.7); deer.push(d);
    for (const az of [-.08, .08]) { const a = box(d.body, .05, .45, .05, '#e9dcc3', .62, 1.25, az); a.rotation.x = az * 6; }
    if (x > 4 && z > 0) mesh(sphGeo(.07), mat('#ff2020', '#ff2020'), d.body, 1.05, .86, 0); // Rudolf
  }
  for (const z of [-.9, .9]) box(sleigh, 6.2, .06, .06, '#3a2412', 2, 1.4, z); // reins
}
const arrowGeo = (() => { const s = new THREE.Shape(); s.moveTo(1.3, 0); s.lineTo(-.6, .8); s.lineTo(-.6, -.8); s.closePath(); const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2); return g; })();
function beam(color: string) {
  const g = new THREE.Group(); scene.add(g);
  const bm = new THREE.Mesh(_g.beam ??= new THREE.CylinderGeometry(2.6, 2.6, 18, 24, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .22, depthWrite: false, side: THREE.DoubleSide }));
  bm.position.y = 9; g.add(bm);
  const ring = new THREE.Mesh(_g.ring ??= new THREE.RingGeometry(2.5, 3.2, 32), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .12; g.add(ring);
  g.userData.pkg = box(g, 1.4, 1.4, 1.4, '#b07a43', 0, 8, 0);
  box(g.userData.pkg, 1.42, .25, .3, '#e9d3a8', 0, 0, 0);
  return g;
}
export const shopBeams = SHOPS.map(b => place(beam('#2fbf6a'), b.door.x, b.door.y));

export interface RobotView {
  mesh: THREE.Group; body: THREE.Group; shell: THREE.Mesh; lidM: THREE.Mesh; flag: THREE.Group; fl: THREE.Mesh; fiFlag: THREE.Mesh; pipo: THREE.Group; scarf: THREE.Group;
  flame: THREE.Mesh; sparks: THREE.Group; sparkMat: THREE.MeshBasicMaterial; spot: THREE.SpotLight; arrow: THREE.Mesh; beam: THREE.Group;
  cam: THREE.PerspectiveCamera; camYaw: number; // third-person chase cam; its yaw lags the robot's
  person?: Person; // the pvp snowball kid, built the first time this robot turns into one
  lt?: Pt;         // where its last wheel track was laid
}
const robotViews = new Map<Robot, RobotView>();
export const rv = (r: Robot) => robotViews.get(r) ?? buildRobot(r);
export const eachRobotView = (f: (v: RobotView, r: Robot) => void) => robotViews.forEach(f);
// robots that left the state (a player dropped out, a snapshot no longer lists them) take their meshes with them
export function dropGoneRobots() {
  for (const [r, v] of robotViews) if (!G.robots.includes(r)) { scene.remove(v.mesh, v.arrow, v.beam); robotViews.delete(r); }
}
function buildRobot(r: Robot): RobotView {
  const g = new THREE.Group(); scene.add(g);
  g.scale.setScalar(.4); // model is built at 1.0; this keeps it in proportion to the houses
  const body = new THREE.Group(); g.add(body); // body tilts/sinks; g holds position
  const shell = rbox(body, 3.6, 1.45, 2.6, .38, mat('#f2f2ee', null, .45), 0, 1.25, 0);
  rbox(body, 3.66, .42, 2.66, .16, mat('#2a2f36', null, .6), 0, .62, 0); // dark skirt
  const lidM = rbox(body, 3, .22, 2.25, .1, mat('#e3e6ea', null, .5), -.08, 2.02, 0); // lid
  rbox(body, 3.02, .24, .46, .08, mat(r.color, null, .4), -.08, 2.04, 0);
  box(body, 3.08, .05, 2.32, '#8d949b', -.08, 1.9, 0); // lid seam
  rbox(body, .1, .62, 2, .05, mat('#14181d', null, .2), 1.8, 1.35, 0); // sensor face
  for (const sz of [-.55, .55]) mesh(sphGeo(.12), mat('#7ef9ff', '#7ef9ff'), body, 1.84, 1.45, sz);
  mesh(sphGeo(.2), mat('#14181d', null, .1, .3), body, 1.4, 2.12, 0); // camera dome
  for (const sz of [-1.33, 1.33]) box(body, .5, .14, .04, mat('#ff7b00', '#ff5500'), -1.3, 1.1, sz); // reflectors
  const flame = mesh(coneGeo(.45, 1.6), mat('#7ef9ff', '#4fd8ff'), body, -2.6, 1.2, 0); flame.rotation.z = Math.PI / 2; flame.castShadow = false;
  const sparkMat = new THREE.MeshBasicMaterial({ color: '#3aa8ff' }), sparks = new THREE.Group(); body.add(sparks); // drift sparks at the back wheels
  for (const sz of [-1.5, 1.5]) mesh(sphGeo(.32), sparkMat, sparks, -1.6, .35, sz).castShadow = false;
  for (const wx of [-1.2, 0, 1.2]) for (const sz of [-1.38, 1.38]) { // wheels don't spin: plain meshes so fuse() merges them
    mesh(cylGeo(.45, .45, .32, 20), rubber, body, wx, .45, sz).rotation.x = Math.PI / 2;
    mesh(cylGeo(.24, .24, .36, 16), metalGray, body, wx, .45, sz).rotation.x = Math.PI / 2;
  }
  mesh(cylGeo(.025, .035, 3.9, 6), mat('#3a3f45', null, .4, .5), body, -1.45, 3.95, .85);
  fuse(body, [shell, lidM]); // shell and lid swap materials with skins
  const flag = new THREE.Group(); flag.position.set(-1.45, 5.75, .85); body.add(flag);
  const fl = new THREE.Mesh(_g.pennant ??= (() => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(-1.3, -.3); s.lineTo(0, -.6); s.closePath(); return new THREE.ShapeGeometry(s); })(),
    new Std({ color: '#ff7b00', emissive: '#ff5500', emissiveIntensity: .3, roughness: .7, side: THREE.DoubleSide }));
  flag.add(fl);
  const fiFlag = new THREE.Mesh(_g.fiflag ??= new THREE.PlaneGeometry(1.3, .8), new Std({ map: FI_TEX, roughness: .8, side: THREE.DoubleSide }));
  fiFlag.position.set(-.65, -.4, 0); flag.add(fiFlag);
  const pipo = new THREE.Group(); body.add(pipo); // shop cosmetics
  const ph = mesh(new THREE.SphereGeometry(.85, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(r.color, null, .95), pipo, .3, 2.12, 0); ph.scale.y = 1.05;
  mesh(cylGeo(.88, .88, .25, 20), white, pipo, .3, 2.2, 0); mesh(sphGeo(.32), white, pipo, .3, 3.05, 0);
  const scarf = new THREE.Group(); body.add(scarf);
  rbox(scarf, 3.72, .32, 2.74, .15, mat('#d33', null, .95), 0, 1.78, 0); const tl = rbox(scarf, .9, .3, .25, .1, mat('#d33', null, .95), -2.1, 1.6, .9); tl.rotation.z = -.4;
  const spot = new THREE.SpotLight('#fff3d6', G.darkness * 60, 45, .6, .6, 1);
  spot.visible = G.darkness > 0; spot.position.set(1.9, 1.4, 0); spot.target.position.set(12, 0, 0); g.add(spot, spot.target);
  const arrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: r.color, side: THREE.DoubleSide }));
  arrow.scale.setScalar(.6); scene.add(arrow);
  const v: RobotView = { mesh: g, body, lidM, flag, fl, fiFlag, pipo, scarf, shell, flame, sparks, sparkMat, spot, arrow, beam: beam(r.color), cam: new THREE.PerspectiveCamera(60, 1, .5, 700), camYaw: r.a };
  robotViews.set(r, v);
  achToast({ i: `<i style="display:block;width:24px;height:24px;border-radius:5px;background:${r.color}"></i>`, n: `${esc(nameOf(r))} joined`,
             d: r.owner === net.myOwner ? 'On this machine' : 'Online' }, false);
  return v;
}
