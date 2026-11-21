// ---------- 2D overlay ----------
// Drawn on the canvas above the 3D view: speech bubbles, name tags, health bars, each player's order sign and minimap.
import type { Robot } from '../sim/types';
import type { View } from './sync';

type PlayerView = View & { r: Robot }; // a split-screen pane that follows a robot
export const floats: { x: number; y: number; h: number; text: string; color: string; t: number }[] = []; // "+35 €" and friends, rising
import { ORDERS, WOLT } from '../sim/data';
import { helper } from '../sim/robot';
import { heading } from '../sim/state';
import { clamp } from '../sim/util';
import { ctx, safe, vh, vw } from './gfx';
import { touchDev } from './input';
import { view } from './scenery';
import { _v } from './sync';
import { G, HOUSES, nearShop, OX, OZ, S } from './world';
function scr(x: number, y: number, h: number, v: View) {
  _v.set(x * S - OX, h, y * S - OZ).project(v.cam);
  return { x: v.x + (_v.x + 1) / 2 * v.w, y: v.y + (1 - _v.y) / 2 * v.h, ok: _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1 };
}
const F = (w: number, px: number) => `${w} ${px}px Overpass, system-ui, sans-serif`;
const INK = '#1d232b', BLUE = '#0b4f9c', YELLOW = '#ffcc00', RED = '#d7261e';
function rr(x: number, y: number, w: number, h: number, r: number | number[]) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function plate(x: number, y: number, w: number, h: number, fill: string, rim: string) { // road-sign plate: drop shadow, body, inset rim line
  ctx.fillStyle = 'rgba(0,0,0,.25)'; rr(x, y + 3, w, h, 7); ctx.fill();
  ctx.fillStyle = fill; rr(x, y, w, h, 7); ctx.fill();
  ctx.strokeStyle = rim; ctx.lineWidth = 2; rr(x + 4, y + 4, w - 8, h - 8, 4); ctx.stroke();
}
function bubble(x: number, y: number, text: string, edge: string) { // speech bubble whose tail points down at (x, y)
  ctx.font = F(800, 14);
  const w = ctx.measureText(text).width + 20, h = 26, top = y - 7 - h;
  ctx.fillStyle = '#fff'; ctx.strokeStyle = edge; ctx.lineWidth = 2;
  rr(x - w / 2, top, w, h, 6); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 6, y - 8); ctx.lineTo(x, y); ctx.lineTo(x + 6, y - 8); ctx.fill(); ctx.stroke();
  ctx.fillRect(x - 5, y - 10, 10, 3); // hide the rim under the tail
  ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, top + h / 2 + 1);
}
function warnTriangle(x: number, y: number, s: number) { // small yellow-and-red warning sign above angry people
  ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 1.1, y + s * .8); ctx.lineTo(x - s * 1.1, y + s * .8); ctx.closePath();
  ctx.fillStyle = YELLOW; ctx.strokeStyle = RED; ctx.lineWidth = s * .28; ctx.lineJoin = 'round'; ctx.fill(); ctx.stroke();
  ctx.fillStyle = INK; ctx.fillRect(x - s * .1, y - s * .35, s * .2, s * .65); ctx.fillRect(x - s * .1, y + s * .4, s * .2, s * .2);
}
export function drawUI(vs: View[]) {
  ctx.clearRect(0, 0, vw, vh);
  for (const v of vs) { ctx.save(); ctx.beginPath(); ctx.rect(v.x, v.y, v.w, v.h); ctx.clip(); drawLabels(v); ctx.restore(); }
  ctx.strokeStyle = INK; ctx.lineWidth = 4;
  for (const v of vs) if (vs.length > 1) ctx.strokeRect(v.x, v.y, v.w, v.h);
}
function drawTag(v: PlayerView) { // the player's own order sign at the bottom of their view
  const r = v.r, cx = v.x + v.w / 2, by = v.y + v.h - 14 - (v.y + v.h > vh - 1 ? safe.b : 0);
  let title: string, sub: string, num: number | string | null = null, numFill = BLUE, right = '', late = false;
  if (r.kid) { title = '❄️ Snowball kid'; sub = r.stun > 0 ? 'Knocked over! Up in a moment' : 'No score. Pelt the robots and get in their way'; }
  else if (r.hole) { title = r.hole === 'snow' ? 'Buried in snow' : r.hole === 'avanto' ? 'Fell through the ice' : 'Stuck in a pothole'; sub = G.pvp ? 'Wiggle out: nobody is coming to help' : 'Wiggle out, or wait for a friend to tow you'; }
  else if (r.cargo) {
    const O = ORDERS[r.cargo.o], h = HOUSES[r.cargo.dest]; // the plate shows the door's own number: its street number where the map has addresses
    title = `${O.icon} ${O.name}`; num = h.no ?? r.cargo.dest + 1;
    sub = O.duo && !helper(G, r) ? (G.campaign && G.robots.length === 1 ? 'Heavy: slow going alone, but it gets there' : 'Too heavy alone: get a teammate right next to you') : `Deliver to ${h.addr ?? 'house ' + num}${O.duo ? ' together' : ''}`;
    late = r.cargo.t <= 0; right = late ? 'Late' : Math.ceil(r.cargo.t) + ' s';
  } else if (G.eetu?.state === 'ice') { title = '🪝 Eetu is in the ice hole'; sub = 'By the sauna. Aim at him and use your hook'; }
  else if (G.presents.length) { title = '🎁 Collect the presents'; sub = `${G.presents.filter(p => !p.gone).length} left on the road. Mind the cars`; }
  else { const b = nearShop(r); title = `Pick up at ${b.name[0] + b.name.slice(1).toLowerCase()}${b.addr ? ', ' + b.addr : ''}`; sub = view.aim ? 'Follow the arrow to the green marker' : 'Follow the green marker'; num = b.tag; numFill = b.color; }
  ctx.font = F(800, 17); const tw = ctx.measureText(title).width;
  ctx.font = F(600, 13); const sw = ctx.measureText(sub).width;
  ctx.font = F(900, 24); const rw = right ? ctx.measureText(right).width + 34 : 0;
  const h = 58, w = Math.min(v.w - 20, 26 + (num != null ? 48 : 0) + Math.max(tw, sw) + rw + 14), x = cx - w / 2, y = by - h;
  plate(x, y, w, h, BLUE, '#fff');
  ctx.fillStyle = r.color; rr(x, y, 9, h, [7, 0, 0, 7]); ctx.fill();
  let tx = x + 22;
  if (num != null) { // house-number plate, like the ones on the houses
    plate(tx, y + 11, 36, 36, numFill, '#fff');
    ctx.fillStyle = '#fff'; ctx.font = F(900, 20); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(num), tx + 18, y + 31);
    tx += 48;
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff'; ctx.font = F(800, 17); ctx.fillText(title, tx, y + 27);
  ctx.fillStyle = 'rgba(255,255,255,.82)'; ctx.font = F(600, 13); ctx.fillText(sub, tx, y + 45);
  if (right) {
    const rx = x + w - rw - 6;
    if (late) { ctx.fillStyle = YELLOW; rr(rx + 8, y + 12, rw - 14, h - 24, 5); ctx.fill(); }
    ctx.fillStyle = late ? INK : '#fff'; ctx.font = F(900, 24); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(right, rx + 1 + rw / 2, y + h / 2 + 2);
  }
  if (r.kid) return; // no battery, boost or zap to show
  // boost meter and stun-gun charges on a small supplementary panel above
  // phones get one slim plate: health, boost and zaps side by side, colour-matched to the buttons instead of labelled
  const slim = touchDev && (v.h > v.w || v.h < 480), squat = slim && v.w > v.h;
  const pw = 230, px = cx - pw / 2, py = squat ? v.y + 18 + (v.y < 1 ? 42 + safe.t : 0) : y - 30; // phone on its side: up under the HUD, off the robot
  const hp = r.hp ?? 1, hy = slim ? py : py - 28; // robo health
  const low = hp < .3 && (performance.now() / 300 | 0) % 2 === 0; // blink when nearly broken
  const hx = px + (slim ? 26 : 50), hw = slim ? 58 : 168, bx = px + (slim ? 96 : 50), bw = slim ? 64 : 84;
  plate(px, hy, pw, 24, low ? RED : '#fff', low ? '#fff' : INK);
  if (!slim) plate(px, py, pw, 24, '#fff', INK);
  ctx.fillStyle = low ? '#fff' : INK;
  ctx.font = F(700, 11); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(slim ? '♥' : 'Robo', px + 11, hy + 13);
  ctx.fillStyle = '#d8e0e8'; rr(hx, hy + 7, hw, 10, 2); ctx.fill();
  ctx.fillStyle = `hsl(${hp * 120},75%,45%)`; rr(hx, hy + 7, hw * hp, 10, 2); ctx.fill();
  ctx.fillStyle = INK;
  if (!slim) { ctx.fillText('Boost', px + 11, py + 13); ctx.fillText('Zap', px + 146, py + 13); }
  ctx.fillStyle = '#d8e0e8'; rr(bx, py + 8, bw, 8, 2); ctx.fill();
  ctx.fillStyle = r.boost > .02 && !r.boostLock ? BLUE : '#9aa5b1'; rr(bx, py + 8, bw * r.boost, 8, 2); ctx.fill();
  const nz = 3 + 2 * G.up.tesla, zs = 51 / nz, zw = zs - (nz > 3 ? 2 : 5); // tesla coil adds pips, squeeze them in
  for (let k = 0; k < nz; k++) {
    const f = clamp((r.zaps ?? 3) - k, 0, 1), zx = px + 172 + k * zs;
    ctx.fillStyle = '#d8e0e8'; rr(zx, py + 6, zw, 12, 2); ctx.fill();
    if (f > 0) { ctx.fillStyle = f >= 1 ? '#0a8fa8' : '#8fcfda'; rr(zx, py + 18 - 12 * f, zw, 12 * f, 2); ctx.fill(); }
  }
}
function drawLabels(v: View) {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const p of [...G.peds, ...G.kids, ...G.thieves]) {
    if (p.sayT <= 0 && !('mode' in p && p.mode === 'chase')) continue; // nothing to show over them: no need to find them on screen
    const q = scr(p.x, p.y, 'dx' in p ? 2.4 : 3.3, v); // kids are shorter
    if (!q.ok) continue;
    if (p.sayT > 0) bubble(q.x, q.y, p.say, RED);
    else if ('mode' in p && p.mode === 'chase') warnTriangle(q.x, q.y - 8, 10);
  }
  if (G.eetu?.state === 'ice' && G.eetu.sayT > 0) { const q = scr(G.eetu.x, G.eetu.y, 1.6, v); if (q.ok) bubble(q.x, q.y, G.eetu.say, RED); }
  for (const r of G.robots) {
    const p = scr(r.x, r.y, 0, v), top = scr(r.x, r.y, 3, v);
    if (!p.ok) continue;
    ctx.font = F(900, 11); const lw = ctx.measureText('P' + (r.i + 1)).width + 10;
    ctx.fillStyle = r.color; rr(p.x - lw / 2, p.y + 15, lw, 16, 4); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('P' + (r.i + 1), p.x, p.y + 24);
    let y = top.y;
    if ((r.hp ?? 1) < 1) { // robot health
      ctx.fillStyle = 'rgba(29,35,43,.75)'; rr(top.x - 22, y - 5, 44, 10, 3); ctx.fill();
      ctx.fillStyle = `hsl(${r.hp * 120},80%,50%)`; rr(top.x - 20, y - 3, 40 * r.hp, 6, 2); ctx.fill();
      y -= 12;
    }
    if (r.cargo) { // package condition
      ctx.fillStyle = 'rgba(29,35,43,.75)'; rr(top.x - 22, y - 5, 44, 10, 3); ctx.fill();
      ctx.fillStyle = `hsl(${r.cargo.cond * 120},75%,48%)`; rr(top.x - 20, y - 3, 40 * r.cargo.cond, 6, 2); ctx.fill();
      y -= 10;
    }
    if (r.hole) {
      ctx.fillStyle = 'rgba(29,35,43,.75)'; rr(p.x - 24, p.y + 36, 48, 9, 3); ctx.fill();
      ctx.fillStyle = YELLOW; rr(p.x - 22, p.y + 38, 44 * r.esc, 5, 2); ctx.fill();
    }
    if (r.lag > 0) { // 3G: show the victim how long the misery lasts
      ctx.font = F(900, 14); ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 4;
      const t = `📶 3G ${Math.ceil(r.lag)}s`; ctx.strokeText(t, top.x, y - 4); ctx.fillStyle = '#ff5a78'; ctx.fillText(t, top.x, y - 4); y -= 18;
    }
    if (r.sayT > 0) bubble(top.x, y - 4, r.say, r.color);
  }
  for (const f of floats) {
    const p = scr(f.x, f.y, f.h, v);
    if (!p.ok) continue;
    ctx.font = F(900, 22); ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.strokeText(f.text, p.x, p.y);
    ctx.fillStyle = f.color; ctx.fillText(f.text, p.x, p.y);
  }
  if (v.r && G.state === 'play') { drawTag(v as PlayerView); drawMinimap(v as PlayerView); }
}
// the map's own picture (its view's mini.bg) with everything that moves drawn on top
function drawMinimap(v: PlayerView) {
  const M = view.mini, mid = touchDev && v.w > v.h, squat = mid && v.h < 480; // on its side the buttons own the right edge, so the map sits top centre and smaller; on a phone the meters are there, so top left
  const mw = Math.min(232, v.w * .3, mid ? v.h * .4 : 1e9), mh = mw * M.h / M.w, x0 = squat ? v.x + 14 + (v.x < 1 ? safe.l : 0) : mid ? v.x + (v.w - mw) / 2 : v.x + v.w - mw - 18 - (v.x + v.w > vw - 1 ? safe.r : 0), y0 = v.y + (v.y < 1 ? 60 + safe.t : 18), k = mw / M.w;
  const o = M.at(v.r), x = x0 - o.x * k, y = y0 - o.y * k; // the window's corner on the map; north up
  plate(x0 - 7, y0 - 7, mw + 14, mh + 14, '#fff', INK);
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, mw, mh); ctx.clip();
  ctx.drawImage(M.bg, o.x * M.px, o.y * M.px, M.w * M.px, M.h * M.px, x0, y0, mw, mh);
  // a city's map is far bigger than the window: a mark that lies wholly outside it (m: its reach, map px) is clipped away anyway, so it is not drawn at all
  const seen = (px: number, py: number, m: number) => px > o.x - m && px < o.x + M.w + m && py > o.y - m && py < o.y + M.h + m, dm = 5 / k; // dm: a dot's reach, with room to spare
  const dot = (px: number, py: number, rad: number, color: string) => { if (!seen(px, py, dm)) return; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x + px * k, y + py * k, rad, 0, 7); ctx.fill(); };
  ctx.fillStyle = 'rgba(150,210,245,.95)';
  for (const p of G.ice) if (!p.gone && seen(p.x, p.y, Math.max(p.rx, p.ry) + dm)) { ctx.beginPath(); ctx.ellipse(x + p.x * k, y + p.y * k, p.rx * k, p.ry * k, 0, 0, 7); ctx.fill(); }
  for (const h of G.holes) dot(h.x, h.y, 2.2, INK);
  for (const c of G.cars) if (seen(c.x, c.y, 45 + dm)) { ctx.save(); ctx.translate(x + c.x * k, y + c.y * k); ctx.rotate(heading(c)); ctx.fillStyle = '#26303b'; ctx.fillRect(-40 * k, -18 * k, 80 * k, 36 * k); ctx.restore(); }
  M.over?.(ctx, v.r, x, y, k);
  const tgt = v.r.cargo ? HOUSES[v.r.cargo.dest].door : nearShop(v.r).door, e = M.pin(k); // off-window targets pin to the edge
  const tx = clamp(tgt.x, o.x + e, o.x + M.w - e), ty = clamp(tgt.y, o.y + e, o.y + M.h - e);
  ctx.strokeStyle = v.r.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + tx * k, y + ty * k, 7 + Math.sin(G.T * 6) * 2, 0, 7); ctx.stroke();
  for (const p of G.peds) dot(p.x, p.y, 2.6, p.mode === 'chase' ? RED : p.kind === 'dog' ? '#8b5a2b' : p.kind === 'wolt' ? WOLT : '#6b7480');
  for (const q of G.kids) dot(q.x, q.y, 2.2, '#ff9d00');
  for (const t of G.thieves) dot(t.x, t.y, 3, t.cargo ? RED : '#0a8f3c');
  if (G.plow) { ctx.fillStyle = '#f5a200'; ctx.fillRect(x + G.plow.x * k - 4, y + G.plow.y * k - 4, 8, 8); }
  if (G.santa) { ctx.fillStyle = '#e8262d'; ctx.fillRect(x + G.santa.x * k - 7, y + G.santa.y * k - 4, 14, 8); }
  for (const r of G.robots) {
    ctx.save(); ctx.translate(x + r.x * k, y + r.y * k); ctx.rotate(r.a);
    const sz = r === v.r ? 6.5 : 4.5;
    ctx.fillStyle = r.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(sz, 0); ctx.lineTo(-sz * .7, -sz * .7); ctx.lineTo(-sz * .7, sz * .7); ctx.closePath(); ctx.fill(); if (r === v.r) ctx.stroke();
    ctx.restore();
  }
  if (M.credit) { // the map data's licence asks for this credit wherever the map is shown
    ctx.font = F(700, 9); ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = 'rgba(29,35,43,.7)';
    ctx.fillText(M.credit, x0 + mw - 3, y0 + mh - 3);
  }
  ctx.restore();
}
