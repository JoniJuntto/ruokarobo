// Per-frame 3D: move every view to where the state says its entity is, and aim the cameras. Reads `G`, never
// writes it, so it does not care whether the simulation or the mirror is filling the state in.
import * as THREE from 'three';
import type { Robot } from '../sim/types';
import { type StdMat, fog } from './gfx';
import { ballH } from '../sim/npc';
import { helper, isDuo } from '../sim/robot';
import { heading, surface } from '../sim/state';
import { clamp, dist, rnd } from '../sim/util';
import { buildHazards, deer, dropGoneRobots, eachRobotView, hv, rv, shopBeams, sleigh } from './entities';
import { boxMat, camera, FOG_FAR, hemi, mat, MOBILE, place, scene, Std, sun, vh, vw } from './gfx';
import { net } from './net';
import { addTrack, ballPool, BOLT_SEG, boltGeo, boltPos, bolts, bottlePool, buildPerson, clearTracks, cust, flagMesh, groundMat, lampLights, lightLamps, puff, roadMat, ropeGeo, ropePos, smoke, smokeFrom, snow, SNOW_N, snowGeo, snowPos, SPRAY_N, sprayGeo, sprayLife, sprayPos, sprayVel, view, walkMat } from './scenery';
import { skinMat, skinOf, SKINS } from './skins';
import { G, HOUSES, insideSolid, nearShop, OX, OZ, S } from './world';
const DAY = new THREE.Color('#cfdbe8'), NIGHT = new THREE.Color('#0a1328'), SKIN = new THREE.Color('#f1c7a5'), ANGRY = new THREE.Color('#e0675a'), ZAPPED = new THREE.Color('#bfe8ff');
let snowCount = 0;
// visuals for a level: runs whenever the state's hazards were rolled (a 'level' event), simulated here or mirrored
export function applyLevel(n: number) {
  buildHazards();
  clearTracks();
  const day = 1 - G.darkness;
  const sky = DAY.clone().lerp(NIGHT, G.darkness / .8);
  scene.background = sky; fog.color.copy(sky);
  const d2 = day * day; // light falls off fast: kaamos should feel dark
  hemi.intensity = (.06 + .57 * d2) * (MOBILE ? 3 : 1); // Lambert gets no environment light, so the sky light stands in for it
  sun.intensity = .08 + 2.67 * d2;
  const envI = .07 + .48 * d2; // dim the studio reflections at night
  scene.traverse(o => { for (const m of ([] as THREE.Material[]).concat((o as THREE.Mesh).material || [])) if ('envMapIntensity' in m) m.envMapIntensity = envI; });
  sun.color.set(G.darkness > .5 ? '#9fb4ff' : '#fff1dc');
  // hidden in daylight: a 0-intensity light still costs every pixel its shader loop
  lampLights.forEach(l => { l.intensity = G.darkness * 40; l.visible = G.darkness > 0; });
  eachRobotView(v => { v.spot.intensity = G.darkness * 60; v.spot.visible = G.darkness > 0; });
  snowCount = Math.min(SNOW_N, 2000 + n * 1500); snowGeo.setDrawRange(0, snowCount);
}
// ---------- 3D sync ----------
const goldMat = new Std({ color: '#e8c547', roughness: .28, metalness: .9 });
let lastFreeze = false;
function applyWeatherLook(dt: number) {
  const bl = G.weather.k === 'blizzard', k = Math.min(1, dt * 1.5);
  fog.near += ((bl ? 4 : 60) - fog.near) * k; fog.far += ((bl ? 38 : FOG_FAR) - fog.far) * k;
  snowGeo.setDrawRange(0, bl ? SNOW_N : snowCount);
  const fz = G.weather.k === 'freeze';
  if (fz !== lastFreeze) { // glaze the world blue while freezing rain lasts
    lastFreeze = fz;
    for (const [m, tint, rough] of [[walkMat, '#cfe9fb', .9], [groundMat, '#dcefff', .95], [roadMat, '#a9c9e0', .85]] as [StdMat, string, number][]) { m.color.set(fz ? tint : '#ffffff'); m.roughness = fz ? .15 : rough; }
  }
}
export const _v = new THREE.Vector3();
function updCameras(dt: number, shadowNow: boolean) {
  view.titleCam(camera, G.T); // title screen: the map's own slow orbit
  // shadows, snowfall and lamp lights cover a block's worth (a couple of streets), so they follow the local players
  const f = view.focus(G.state === 'title' ? [] : G.robots.filter(r => r.owner === net.myOwner));
  const wx = f.x * S - OX, wz = f.y * S - OZ;
  if (shadowNow) sun.position.set(wx - 60, 70, wz + 55), sun.target.position.set(wx, 0, wz); sun.target.updateMatrixWorld();
  snow.position.set(wx, 0, wz); lightLamps(view.lampsNear(f));
  // third-person chase cam per robot; yaw lags behind so ice slides feel like slides
  for (const r of G.robots) {
    const v = rv(r);
    let d = r.a - v.camYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    v.camYaw += d * Math.min(1, dt * 3.5);
    const cx = Math.cos(v.camYaw), sy = Math.sin(v.camYaw);
    let back = 70; // px behind the robot; pull in if a building is in the way
    while (back > 25 && insideSolid(r.x - cx * back, r.y - sy * back)) back -= 10;
    v.cam.position.set((r.x - cx * back) * S - OX, 1.2 + back * .025, (r.y - sy * back) * S - OZ);
    v.cam.lookAt((r.x + cx * 45) * S - OX, .6, (r.y + sy * 45) * S - OZ);
    if (r.drunk > 0) v.cam.rotateZ(Math.sin(G.T * 1.7) * .22 * Math.min(1, r.drunk));
    v.cam.fov += ((r.boosting ? 74 : 60) + (r.drunk > 0 ? Math.sin(G.T * 2.9) * 12 : 0) - v.cam.fov) * Math.min(1, dt * 5);
    const sh = Math.max(0, r.stun) * .5 + (r.boosting ? .03 : 0); // screen shake on hits
    if (sh) v.cam.position.add(_v.set(rnd(-sh, sh), rnd(-sh, sh), rnd(-sh, sh)));
  }
}
// a shift began with every robot back on its spawn: the cameras start behind them, not swinging round from where they were
export function resetCams() { eachRobotView((v, r) => { v.camYaw = r.a; }); }
export interface View { r?: Robot; cam: THREE.PerspectiveCamera; x: number; y: number; w: number; h: number }
export function views(): View[] { // split-screen rects in CSS px
  const mine = G.robots.filter(r => r.owner === net.myOwner), n = mine.length;
  if (G.state === 'title' || n === 0) return [{ cam: camera, x: 0, y: 0, w: vw, h: vh }];
  const cols = n <= 2 ? 1 : n <= 4 ? 2 : n <= 6 ? 3 : 4, rows = Math.ceil(n / cols);
  const w = vw / cols, h = vh / rows;
  return mine.map((r, i) => ({ r, cam: rv(r).cam, x: (i % cols) * w, y: (i / cols | 0) * h, w, h }));
}
const SPARK = [0, '#3aa8ff', '#ff8a1f', '#c04bff'];
const SNOW_SIN = Float32Array.from({ length: SNOW_N }, (_, i) => Math.sin(i)), SNOW_COS = Float32Array.from({ length: SNOW_N }, (_, i) => Math.cos(i));
export function sync(dt: number, shadowNow: boolean) {
  dropGoneRobots();
  for (const r of G.robots) {
    const v = rv(r);
    place(v.mesh, r.x, r.y); v.mesh.rotation.y = -r.a;
    v.body.visible = !r.kid;
    if (r.kid && !v.person) v.person = buildPerson(v.mesh, r.color, '#fff', 1.55, { kid: true }); // 1.55 × the robot's .4 = the street kids' .62
    if (v.person) {
      v.person.g.visible = !!r.kid;
      const sw = Math.hypot(r.vx, r.vy) > 10 && r.stun <= 0 ? Math.sin(G.T * 14) * .6 : 0;
      v.person.legs[0].rotation.z = sw; v.person.legs[1].rotation.z = -sw;
      v.person.arms[1].rotation.z = r.throwT > 0 ? -2.4 + (.3 - r.throwT) * 8 : 0;
      v.person.body.rotation.z = r.stun > 0 ? Math.PI / 2 : 0; // knocked on his back
    }
    if (r.kid) { v.arrow.visible = v.beam.visible = false; continue; }
    v.body.position.y = r.hole ? -1 : 0;
    v.body.rotation.x = r.hole ? Math.sin(G.T * 18) * .12 : 0;
    v.body.rotation.z = r.stun > 0 ? Math.sin(G.T * 30) * .15 : 0;
    v.flame.visible = !!r.boosting; v.flame.scale.set(1 + .25 * G.up.turbo, (.8 + Math.random() * .5) * (1 + .35 * G.up.turbo), 1 + .25 * G.up.turbo);
    v.sparks.visible = !!r.dTier && !r.hole;
    if (r.dTier) { v.sparkMat.color.set(SPARK[r.dTier]); v.sparks.scale.setScalar(.7 + Math.random() * .6 + .2 * r.dTier); }
    v.pipo.visible = !!G.up.pipo; v.scarf.visible = !!G.up.scarf; v.fiFlag.visible = !!G.up.fiflag; v.fl.visible = !G.up.fiflag;
    v.shell.material = G.up.gold ? goldMat : skinMat(skinOf(r));
    const lid = SKINS.find(s => s.k === skinOf(r))?.lid; v.lidM.material = mat(lid || '#e3e6ea', null, lid ? .3 : .5);
    if (!r.hole && (!v.lt || Math.hypot(r.x - v.lt.x, r.y - v.lt.y) > 5)) { // wheel tracks in the snow
      if (surface(G, r.x, r.y) !== 'ice') { const px = -Math.sin(r.a) * 3, py = Math.cos(r.a) * 3; addTrack(r.x + px, r.y + py, r.a); addTrack(r.x - px, r.y - py, r.a); }
      v.lt = { x: r.x, y: r.y };
    }
    const slip = Math.abs(-r.vx * Math.sin(r.a) + r.vy * Math.cos(r.a)); // snow spray when drifting or boosting
    if (!r.hole && (slip > 45 || r.boosting)) for (let k = 0; k < 2; k++)
      puff(r.x - Math.cos(r.a) * 6, r.y - Math.sin(r.a) * 6, .15, -Math.cos(r.a) * 2 + rnd(-1.5, 1.5), -Math.sin(r.a) * 2 + rnd(-1.5, 1.5), rnd(1, 3));
    v.flag.rotation.y = Math.PI + Math.sin(G.T * 8 + r.i) * .35 + clamp(Math.hypot(r.vx, r.vy) / 400, 0, .3);
    const tgt = r.cargo ? HOUSES[r.cargo.dest].door : nearShop(r).door, mine = r.owner === net.myOwner;
    const aim = mine && G.state === 'play' && view.aim?.(r, tgt) || tgt, a = Math.atan2(aim.y - r.y, aim.x - r.x); // straight at the door, or along the streets where the map knows the way
    v.arrow.visible = mine && G.state === 'play' && dist(r, tgt) > 90;
    place(v.arrow, r.x + Math.cos(a) * 22, r.y + Math.sin(a) * 22, .3); v.arrow.rotation.y = -a;
    v.beam.visible = mine && G.state === 'play' && !!r.cargo;
    if (r.cargo) place(v.beam, tgt.x, tgt.y);
  }
  const want = G.state === 'play' && !G.presents.length && !G.eetu && G.robots.some(r => r.owner === net.myOwner && !r.cargo);
  for (const g of shopBeams) g.visible = want;
  for (const g of [...shopBeams, ...G.robots.map(r => rv(r).beam)]) {
    g.userData.pkg.rotation.y = G.T * 1.5; g.userData.pkg.position.y = 8 + Math.sin(G.T * 3) * .6;
  }
  for (const p of G.peds) {
    const pv = hv.peds.get(p);
    if (!pv) continue;
    place(pv.g, p.x, p.y); pv.g.rotation.y = -p.a;
    const dog = p.kind === 'dog', down = p.mode === 'fall';
    const f = p.mode === 'chase' ? 16 : 9, sw = p.moving && p.kind !== 'wolt' ? Math.sin(G.T * f) * .5 : 0;
    pv.body.rotation.z = down && !dog ? Math.PI / 2 : sw && !dog && p.mode === 'chase' ? -.12 : 0; pv.body.rotation.x = down && dog ? Math.PI / 2 : 0; // lean into a chase
    pv.legs[0].rotation.z = sw; pv.legs[1].rotation.z = p.kickT > 0 && !dog ? 1.4 : -sw;
    if (pv.arms) { pv.arms[0].rotation.z = -sw * .7; pv.arms[1].rotation.z = sw * .7; } // arms counter-swing
    pv.body.position.y = dog && p.kickT > 0 ? .6 : sw && !dog ? Math.abs(Math.cos(G.T * f)) * .05 : 0; // dogs jump at you; people bob as they walk
    if (pv.head) pv.head.material.color.copy(p.mode === 'chase' ? ANGRY : p.mode === 'zapped' ? ZAPPED : SKIN); // ready-made colours: no '#hex' to parse per face per frame
    pv.g.rotation.x = p.mode === 'zapped' ? Math.sin(G.T * 45) * .08 : 0; // twitching
    if (p.mode === 'zapped' && Math.random() < .3) puff(p.x, p.y, rnd(1, 2.5), rnd(-1, 1), rnd(-1, 1), rnd(0, 2));
  }
  for (const k of G.kids) {
    const kv = hv.kids.get(k);
    if (!kv) continue;
    place(kv.g, k.x, k.y); kv.g.rotation.y = -k.a;
    const sg = (G.T + k.x) % 5; // the spurgu takes a swig every five seconds
    kv.arms[1].rotation.z = k.throwT > 0 ? -2.4 + (.3 - k.throwT) * 8 : k.bum && sg < 1.2 ? -1.9 * Math.sin(sg / 1.2 * Math.PI) : 0;
    kv.g.rotation.x = k.zapT > 0 ? Math.sin(G.T * 45) * .1 : 0;
  }
  let nb = 0; // jagged lightning bolts for stun-gun shots
  for (const b of bolts) {
    b.t -= dt;
    if (b.t <= 0 || nb >= 8) continue;
    let px = b.x1, py = b.y1, ph = .8;
    for (let k = 1; k <= BOLT_SEG; k++) {
      const f = k / BOLT_SEG, j = k < BOLT_SEG ? 6 : 0;
      const nx = b.x1 + (b.x2 - b.x1) * f + rnd(-j, j), ny = b.y1 + (b.y2 - b.y1) * f + rnd(-j, j), nh = .8 + (k < BOLT_SEG ? rnd(-.3, .5) : 1);
      boltPos.set([px * S - OX, ph, py * S - OZ, nx * S - OX, nh, ny * S - OZ], (nb * BOLT_SEG + k - 1) * 6);
      px = nx; py = ny; ph = nh;
    }
    nb++;
  }
  while (bolts.length && bolts[0].t <= 0) bolts.shift();
  boltGeo.setDrawRange(0, nb * BOLT_SEG * 2); boltGeo.attributes.position.needsUpdate = true;
  const fly = G.balls.filter(b => b.age < b.ft), sb = fly.filter(b => !b.bot), bt = fly.filter(b => b.bot);
  ballPool.forEach((m, i) => { const b = sb[i]; m.visible = !!b; if (b) place(m, b.x, b.y, Math.max(.2, ballH(b))); });
  bottlePool.forEach((m, i) => { const b = bt[i]; m.visible = !!b; if (b) { place(m, b.x, b.y, Math.max(.2, ballH(b))); m.rotation.z = b.age * 14; } });
  for (const [b, m] of hv.boxes) { m.visible = m.matrixWorldAutoUpdate = G.pvp && !b.t; m.rotation.set(G.T * .7, G.T * 1.3, 0); m.position.y = 1.6 + Math.sin(G.T * 2.5 + b.x) * .2; }
  boxMat.color.setHSL(G.T * .15 % 1, .9, .6);
  for (const [l, m] of hv.loot) { m.visible = !l.got; m.rotation.y = G.T * 1.5; m.position.y = .7 + Math.sin(G.T * 3) * .15; }
  for (const [t, m] of hv.thieves) { place(m, t.x, t.y); m.rotation.y = -t.a + (t.cd > 0 ? G.T * 12 : 0); } // stunned ones spin
  if (G.plow && hv.plow) { place(hv.plow.g, G.plow.x, G.plow.y); hv.plow.g.rotation.y = -G.plow.a; hv.plow.beacon.visible = (G.T * 4 | 0) % 2 === 0; }
  for (const [p, m] of hv.ice) m.visible = !p.gone; // melted, or scraped off by the plow
  for (const [p, m] of hv.presents) m.visible = !p.gone;
  if (hv.eetu) hv.eetu.visible = G.eetu?.state === 'ice'; // out of sight once he is hooked out and riding home
  let ropes = 0; // tow ropes, and straps between a sofa and its helper
  for (const r of G.robots) {
    const t = r.towT > 0 ? G.robots.find(q => q.id === r.tow) : isDuo(r) && helper(G, r);
    if (!t || ropes >= 8) continue;
    ropePos.set([r.x * S - OX, .45, r.y * S - OZ, t.x * S - OX, .45, t.y * S - OZ], ropes++ * 6);
  }
  ropeGeo.setDrawRange(0, ropes * 2); ropeGeo.attributes.position.needsUpdate = true;
  HOUSES.forEach((h, i) => { // customers wave when their order is close, stomp when it's late
    let late = false, near = false; // is an order for this door late, or close? (no list of its robots per door per frame)
    for (const r of G.robots) if (r.cargo && r.cargo.dest === i) { late ||= r.cargo.t <= 0; near ||= G.state === 'play' && dist(r, h.door) < 220; }
    const c = cust[i]; c.custT -= dt;
    c.g.visible = c.g.matrixWorldAutoUpdate = near || c.custT > 0; // out of sight: no matrix work for their twelve parts either
    if (!c.g.visible) return;
    const happy = c.custT > 0 || !late;
    c.arms[1].rotation.x = happy ? -2.6 + Math.sin(G.T * 9) * .5 : 0;
    c.body.position.y = happy ? 0 : Math.abs(Math.sin(G.T * 14)) * .12;
    c.head.material.color.copy(happy ? SKIN : ANGRY);
  });
  for (let i = 0; i < SPRAY_N; i++) {
    if (sprayLife[i] <= 0) continue;
    sprayLife[i] -= dt; sprayVel[i * 3 + 1] -= 9 * dt;
    for (let k = 0; k < 3; k++) sprayPos[i * 3 + k] += sprayVel[i * 3 + k] * dt;
    if (sprayLife[i] <= 0 || sprayPos[i * 3 + 1] < 0) { sprayLife[i] = 0; sprayPos[i * 3 + 1] = -50; }
  }
  sprayGeo.attributes.position.needsUpdate = true;
  applyWeatherLook(dt);
  for (const c of G.cars) {
    const m = hv.cars.get(c), f = c.fly! > 0 ? c.fly! : 0; // tumbling arc after Santa bowls it
    if (!m) continue;
    place(m, c.x, c.y, f > 0 ? f * (1.4 - f) * 14 : 0); m.rotation.y = -heading(c); m.rotation.x = f > 0 ? f * 9 : 0;
  }
  sleigh.visible = !!G.santa;
  if (G.santa) {
    place(sleigh, G.santa.x, G.santa.y, .6 + Math.sin(G.T * 7) * .25); sleigh.rotation.y = -heading(G.santa);
    deer.forEach((d, i) => d.legs.forEach((l, j) => l.rotation.z = Math.sin(G.T * 22 + i + j * 3) * .7));
  }
  if (flagMesh) flagMesh.rotation.y = Math.sin(G.T * 1.3) * .5;
  // each flake sways by sin(T + i): as sin T cos i + cos T sin i that is two table lookups instead of up to 8000 sines a frame
  const sway = Math.sin(G.T) * 1.5 * dt, swayC = Math.cos(G.T) * 1.5 * dt, drift = G.wind * dt;
  for (let i = 0; i < snowCount; i++) {
    snowPos[i * 3 + 1] -= (4 + (i % 7)) * dt;
    snowPos[i * 3] += drift + sway * SNOW_COS[i] + swayC * SNOW_SIN[i];
    if (snowPos[i * 3 + 1] < 0) { snowPos[i * 3 + 1] = 30; snowPos[i * 3] = rnd(-90, 90); snowPos[i * 3 + 2] = rnd(-55, 55); }
  }
  snowGeo.attributes.position.needsUpdate = true;
  for (const s of smoke) {
    s.t = (s.t + dt) % 3;
    place(s.m, smokeFrom.x + s.t * (8 + G.wind * 3), smokeFrom.y, smokeFrom.h + s.t * 3);
    s.m.scale.setScalar(.5 + s.t * .6); s.m.material.opacity = .55 * (1 - s.t / 3);
  }
  updCameras(dt, shadowNow);
}
