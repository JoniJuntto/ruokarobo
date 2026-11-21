// ---------- pause menu: settings + online debug ----------
// Esc / P / gamepad Start opens it. A local game freezes. Online, the room's leader pauses the room for everyone
// (as the host's menu always did) and nobody else can.
import { beep } from './audio';
import { $, setText } from './dom';
import { MOBILE, PX, renderer, resize, sun } from './gfx';
import { keys } from './input';
import { leaveOnline, net, netDebug, send, waiting } from './net';
import { cfg, saveCfg } from './store';
import { ui } from './ui';
import { G, game } from './world';

// ponytail: dynamic resolution. The target is 60 fps on phones and 120 on computers, or the screen's own rate if that
// is lower (peak = the best fps this screen has shown). Under 92 % of it drop pixels; win them back only after 20 s
// without a drop, so it doesn't flip every 2 s. Floor .5; a 30 Hz low-power screen has peak 30 and never drops.
// cfg.scale stays the user's ceiling.
let dynRes = 1, dynT = 0, peak = 30, dropT = 0;
export function adaptRes(raw: number) {
  peak = Math.max(peak, Math.min(ui.fps, MOBILE ? 60 : 120));
  if ((dynT += raw) < 2 || G.state !== 'play') return; dynT = 0; dropT += 2;
  const n = ui.fps < peak * .92 ? Math.max(.5, dynRes - .15) : dropT > 20 ? Math.min(1, dynRes + .1) : dynRes;
  if (n < dynRes) dropT = 0;
  if (n !== dynRes) { dynRes = n; applyCfg(); }
}
function applyCfg() {
  saveCfg();
  sun.castShadow = cfg.shadows;
  renderer.setPixelRatio(Math.min(devicePixelRatio, PX) * cfg.scale * dynRes); resize();
}
const sMusic = $<HTMLInputElement>('sMusic'), sSfx = $<HTMLInputElement>('sSfx'), sShadows = $<HTMLInputElement>('sShadows'), sScale = $<HTMLSelectElement>('sScale');
sMusic.value = String(cfg.music); sSfx.value = String(cfg.sfx); sShadows.checked = cfg.shadows; sScale.value = String(cfg.scale);
sMusic.oninput = () => { cfg.music = +sMusic.value; applyCfg(); };
sSfx.oninput = () => { cfg.sfx = +sSfx.value; applyCfg(); beep(880, .06); };
sShadows.onchange = () => { cfg.shadows = sShadows.checked; applyCfg(); };
sScale.onchange = () => { cfg.scale = +sScale.value; applyCfg(); };
applyCfg();
export function setMenu(open: boolean) {
  const online = net.role === 'guest', paused = open && !waiting() && G.state !== 'title';
  ui.menuOpen = open; keys.clear();
  if (!online) game.setPaused(paused); else if (!waiting()) send({ type: 'act', a: paused ? 'pause' : 'resume' });
  $('pause').hidden = !open;
  setText('pauseTitle', G.state === 'title' ? 'Settings' : paused ? 'Paused' : 'Menu');
  $('pauseNote').hidden = !waiting() || G.state === 'title';
  // online the leader's Quit takes the whole room back to its title screen; on that screen, and for everyone else, it leaves the room
  $('bQuit').hidden = G.state === 'title' && !online;
  $('bRestart').hidden = waiting() || G.state === 'title' || G.state === 'story'; // only whoever steers the game
  setText('bRestart', G.campaign ? 'Retry chapter' : 'Retry from shift 1');
  setText('bQuit', online && (waiting() || G.state === 'title') ? 'Leave online game' : 'Quit to title');
  if (open) { updateMenu(); $('bResume').focus(); }
}
$('bPause').onclick = () => setMenu(true);
$('bResume').onclick = () => setMenu(false);
$('bRestart').onclick = () => {
  setMenu(false);
  if (net.role === 'guest') send({ type: 'act', a: 'retry' }); else game.retry();
};
$('bQuit').onclick = () => {
  const room = net.role === 'guest' && !waiting() && G.state !== 'title';
  setMenu(false);
  if (room) return send({ type: 'act', a: 'quit' });
  if (net.role !== 'local') return leaveOnline('You left the online game.');
  game.quit();
};
export function updateMenu() { setText('net', netDebug().join('\n')); }
