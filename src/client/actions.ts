// What a key, a pad button or an on-screen button does to the game. Local games act on the simulation
// directly; online, the same actions become messages (or wait for whoever runs the room).
import { SHOP } from '../sim/data';
import type { UpKey } from '../sim/types';
import { bump } from './achievements';
import { flipMusic } from './audio';
import { $ } from './dom';
import { KB, type Ctrl, confirmJoin, join, joinTouch, keys, myCtrls, touchDev, wantJoin } from './input';
import { setMenu } from './menu';
import { joinRoom, net, send, waiting } from './net';
import { closeCases } from './skins';
import { storyLoad } from './store';
import { ui } from './ui';
import { G, game } from './world';

export const urlChapter = Math.min(8, Math.max(0, Math.floor(+(new URLSearchParams(location.search).get('chapter') || 0) || 0))); // ?chapter=N jumps straight in

// Online (net.role 'guest') the server runs the game: the same buttons become messages, and only the room's
// leader may press the ones that steer the whole room (waiting() is everyone else). Anyone may buy.
const online = () => net.role === 'guest';
const ensureRobot = () => { if (touchDev) joinTouch(); else if (!myCtrls().length) join({ kb: 0 }); };
export function pressStart() {
  if (waiting()) return; // the host starts the game
  if (G.state === 'title') ensureRobot();
  if (online()) send({ type: 'act', a: 'start' }); else game.pressStart();
}
export function startRoam() {
  if (G.state !== 'title' || waiting()) return;
  ensureRobot();
  if (online()) send({ type: 'act', a: 'roam' }); else game.startRoam();
}
export function storyButton(fresh: boolean) {
  if (waiting() || G.state !== 'title') return;
  ensureRobot();
  const sv = !fresh && !urlChapter ? storyLoad() : null, ch = fresh ? 0 : urlChapter || sv?.ch || 0;
  if (!online()) return game.startStory(ch, sv);
  net.ownStory = true; // this machine's save started it, so this machine keeps its progress (main.ts, storySave)
  send({ type: 'story', ch, save: sv && { money: sv.money, up: sv.up } });
}
export function togglePvp() {
  if (waiting()) return;
  if (online()) send({ type: 'act', a: 'pvp' }); else game.togglePvp();
}
export function buy(k: UpKey) {
  if (G.state !== 'shop') return;
  if (online()) return send({ type: 'buy', k });
  game.buy(k);
}
export function toggleMusic() { if (!flipMusic()) bump('music'); }

const codeIn = $<HTMLInputElement>('code');
addEventListener('keydown', e => {
  const target = e.target as HTMLElement;
  if (!$('cases').hidden) { if (e.code === 'Escape') closeCases(); return; } // skins screen eats keys, so Enter can't start a shift under it
  const sub = document.querySelector<HTMLElement>(':popover-open'); // a title submenu: Esc closes it by itself, Enter is for its buttons
  if (sub && e.code === 'Escape') return;
  if (e.code === 'Escape' && !e.repeat) { if (target.tagName === 'INPUT') target.blur(); return setMenu(!ui.menuOpen); }
  if (target.tagName === 'INPUT' || target.tagName === 'SELECT') { if (e.code === 'Enter' && target === codeIn) { joinRoom(codeIn.value); sub?.hidePopover(); } return; }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.repeat || ui.menuOpen) return;
  const i = KB.findIndex(k => [k.u, k.d, k.l, k.r].includes(e.code));
  if (i >= 0) wantJoin({ kb: i });
  const bi = KB.findIndex(k => k.b === e.code);
  if (bi >= 0) confirmJoin({ kb: bi });
  if (e.code === 'Enter' && !sub) pressStart(); // Space is a handbrake
  const u = SHOP.find(u => u.key === (e.key === '=' ? '+' : e.key)); // '=' is '+' without shift on US keyboards
  if (u) buy(u.k);
  if (e.code === 'KeyM') toggleMusic();
});
const padPrev: Record<number, boolean[]> = {};
export function pollPads() {
  for (const gp of navigator.getGamepads?.() || []) {
    if (!gp) continue;
    const now = gp.buttons.map(b => b.pressed);
    // first sighting is the baseline, not a press: Firefox on macOS exposes some HID devices
    // as gamepads with buttons stuck down, and those used to join as extra players
    const prev = padPrev[gp.index] || now;
    padPrev[gp.index] = now;
    const edge = (k: number) => now[k] && !prev[k], ctrl: Ctrl = { pad: gp.index };
    if (!myCtrls().some(c => c.pad === gp.index)) {
      if (edge(0) && confirmJoin(ctrl)) continue;
      if (now.some((p, k) => p && !prev[k])) wantJoin(ctrl);
      continue;
    }
    if (edge(9)) G.state === 'play' || ui.menuOpen ? setMenu(!ui.menuOpen) : pressStart();
    else if (ui.menuOpen && edge(1)) setMenu(false);
    else if (G.state === 'title' && !ui.menuOpen && edge(0)) pressStart();
  }
}
