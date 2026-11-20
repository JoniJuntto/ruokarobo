// ---------- players & input ----------
// Keyboards, gamepads and the touch stick: who is playing on this machine, and what each of them is pressing.
import { MAX_PLAYERS } from '../sim/data';
import type { Input } from '../sim/types';
import { beep } from './audio';
import { $ } from './dom';
import { net, send } from './net';
import { skins, store } from './store';
import { ui } from './ui';
import { G, game } from './world';

export interface Ctrl { kb?: number; pad?: number; touch?: number }
export const KB = [
  { name: 'WASD', u: 'KeyW', d: 'KeyS', l: 'KeyA', r: 'KeyD', b: 'ShiftLeft', h: 'Space', z: 'KeyE', g: 'KeyQ', x: 'KeyZ', o: 'KeyX', bn: 'Shift' },
  { name: 'Arrows', u: 'ArrowUp', d: 'ArrowDown', l: 'ArrowLeft', r: 'ArrowRight', b: 'ShiftRight', h: 'Period', z: 'Comma', g: 'Slash', x: 'AltRight', o: 'ControlRight', bn: 'R-Shift' },
  { name: 'IJKL', u: 'KeyI', d: 'KeyK', l: 'KeyJ', r: 'KeyL', b: 'KeyU', h: 'KeyO', z: 'KeyP', g: 'KeyN', x: 'Semicolon', o: 'BracketLeft', bn: 'U' },
  { name: 'TFGH', u: 'KeyT', d: 'KeyG', l: 'KeyF', r: 'KeyH', b: 'KeyR', h: 'KeyY', z: 'KeyV', g: 'KeyB', x: 'KeyC', o: 'Digit6', bn: 'R' }, // ponytail: 6 is also a workshop key; only bites player 4 honking in the workshop,
];
export const keys = new Set<string>();
const ctrls = new Map<number, Ctrl>();  // local game: robot id → the controller that drives it
export const localCtrls: Ctrl[] = [];   // online: this machine's controllers, by lid (the robots themselves live on the server)
export const myCtrls = (): Ctrl[] => net.role === 'guest' ? localCtrls : G.robots.flatMap(r => r.owner === 'H' && ctrls.get(r.id) || []);
// going online: the players already on this machine come along (as lids, in the order they joined) and their
// local robots go. Nobody yet: one controller, so that joining a room is enough to play
export function takeOnline() {
  localCtrls.length = 0;
  for (const r of [...G.robots]) { const c = ctrls.get(r.id); if (c) localCtrls.push(c); game.removeRobot(r); }
  ctrls.clear();
  if (!localCtrls.length) localCtrls.push(touchDev ? { touch: 1 } : { kb: 0 });
}
export function join(ctrl: Ctrl) {
  if (net.role === 'guest') {
    if (localCtrls.length >= 4) return;
    localCtrls.push(ctrl); send({ type: 'add', lid: localCtrls.length - 1, n: store.pname, sk: skins.sel });
    return;
  }
  if (G.robots.length >= MAX_PLAYERS) return;
  ctrls.set(game.addRobot().id, ctrl);
}
// the first player joins straight away; anyone after that has to confirm with their own Boost button,
// so a stray arrow key (or a phantom gamepad) never splits the screen
export let askJoin: { ctrl: Ctrl; t: number } | null = null;
const sameCtrl = (a: Ctrl, b: Ctrl) => a.kb === b.kb && a.pad === b.pad;
export function wantJoin(ctrl: Ctrl) {
  if (ui.menuOpen || myCtrls().some(c => sameCtrl(c, ctrl))) return;
  if (!myCtrls().length) return join(ctrl);
  if (net.role !== 'guest' && G.robots.length >= MAX_PLAYERS) return;
  if (askJoin && sameCtrl(askJoin.ctrl, ctrl)) return void (askJoin.t = 6);
  askJoin = { ctrl, t: 6 }; beep(520, .08);
}
export function confirmJoin(ctrl: Ctrl) {
  if (!askJoin || !sameCtrl(askJoin.ctrl, ctrl)) return false;
  askJoin = null; join(ctrl); return true;
}
export function tickAskJoin(dt: number) { if (askJoin && (askJoin.t -= dt) <= 0) askJoin = null; }

// o carries this machine's horn key, so the simulation never has to track which horn each player picked
const myHorn = () => skins.horn || 1;
export function ctrlInput(ctrl: Ctrl): Input {
  if (ctrl.touch) return touchIn;
  if (ctrl.kb != null) { const k = KB[ctrl.kb]; return { t: +keys.has(k.u) - +keys.has(k.d), s: +keys.has(k.r) - +keys.has(k.l), b: keys.has(k.b), h: keys.has(k.h), z: keys.has(k.z), g: keys.has(k.g), x: keys.has(k.x), o: keys.has(k.o) && myHorn() }; }
  const gp = navigator.getGamepads?.()[ctrl.pad!];
  if (!gp) return { t: 0, s: 0 };
  const dz = (v: number) => Math.abs(v) < .2 ? 0 : v, b = (k: number) => gp.buttons[k]?.pressed;
  let t = -dz(gp.axes[1] || 0), s = dz(gp.axes[0] || 0);
  if (b(7) || b(12)) t = 1;
  if (b(6) || b(13)) t = -1;
  if (b(14)) s = -1; if (b(15)) s = 1;
  if (b(0) && !t) t = 1; // boost alone also drives
  return { t, s, b: b(0) || b(5), h: b(1), z: b(2), g: b(3), x: b(4), o: b(10) && myHorn() }; // L3: press the stick to honk
}
// local game: hand every robot on this machine its controller's state before the simulation steps
export function feedInputs() { for (const r of G.robots) { const c = r.owner === 'H' && ctrls.get(r.id); if (c) game.setInput(r.id, ctrlInput(c)); } }
// online: the same, as the body of an 'in' message
export const localInputs = (): Record<number, Input> => Object.fromEntries(localCtrls.map((c, lid) => [lid, ctrlInput(c)]));
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

// ---------- touch controls ----------
export const touchDev = matchMedia('(pointer: coarse)').matches;
const touchIn: Input = { t: 0, s: 0, b: false, h: false, z: false, g: false, x: false, o: 0 };
const stick = $('stick'), knob = $('knob');
export const joinTouch = () => { if (!myCtrls().some(c => c.touch)) join({ touch: 1 }); };
function moveStick(e: PointerEvent) {
  const b = stick.getBoundingClientRect(), rad = b.width / 2 - 20;
  let dx = e.clientX - b.left - b.width / 2, dy = e.clientY - b.top - b.height / 2;
  const l = Math.hypot(dx, dy); if (l > rad) { dx *= rad / l; dy *= rad / l; }
  knob.style.transform = `translate(${dx}px,${dy}px)`;
  const dz = (v: number) => Math.abs(v) < .15 ? 0 : v;
  touchIn.s = dz(dx / rad); touchIn.t = dz(-dy / rad);
}
let stickId: number | null = null; // follow the finger that grabbed the stick
stick.onpointerdown = e => { stickId = e.pointerId; try { stick.setPointerCapture(e.pointerId); } catch (_) {} joinTouch(); moveStick(e); };
stick.onpointermove = e => { if (e.pointerId === stickId) moveStick(e); };
stick.onpointerup = stick.onpointercancel = e => { if (e.pointerId !== stickId) return; stickId = null; touchIn.t = touchIn.s = 0; knob.style.transform = ''; };
for (const [id, k] of [['tBoost', 'b'], ['tBrake', 'h'], ['tZap', 'z'], ['tHook', 'g'], ['tBall', 'x'], ['tHorn', 'o']] as const) {
  const el = $(id);
  el.onpointerdown = e => { try { el.setPointerCapture(e.pointerId); } catch (_) {} joinTouch(); if (k === 'o') touchIn.o = myHorn(); else touchIn[k] = true; };
  el.onpointerup = el.onpointercancel = () => { touchIn[k] = false; };
}
