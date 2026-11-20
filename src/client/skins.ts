// skin cases: found hidden on the map during shifts, opened on the title screen; skins live on this machine
import * as THREE from 'three';
import { HORNS } from '../sim/data';
import type { Robot } from '../sim/types';
import { playHorn } from './audio';
import { $, setText } from './dom';
import type { Draw } from './gfx';
import { send } from './net';
import { pick, rnd } from '../sim/util';
import { beep, SFX } from './audio';
import { _m, mat, Std } from './gfx';
import { net } from './net';
import { saveSkins, skins } from './store';
export const RARITY = [{ n: 'Common', c: '#9aa5b1', w: 59 }, { n: 'Rare', c: '#2d7cff', w: 28 }, { n: 'Epic', c: '#9b4dff', w: 10 }, { n: 'Legendary', c: '#ffb400', w: 2 }, { n: 'Ultra Rare', c: '#ff2d55', w: 1 }, { n: 'Sauna', c: '#e8657a', w: 0 }]; // w 0: never in a case
// ultra rare skins paint a pattern p(ctx, w, h) onto the shell; c is only the fallback swatch colour
const blobs = (g: CanvasRenderingContext2D, w: number, cols: string[], n: number, r: number) => cols.forEach(c => { g.fillStyle = c; for (let i = 0; i < n; i++) {
  const x = rnd(0, w), y = rnd(0, w); for (let j = 0; j < 4; j++) { g.beginPath(); g.ellipse(x + rnd(-r, r), y + rnd(-r, r) * .6, rnd(r * .5, r), rnd(r * .3, r * .6), rnd(0, 3), 0, 7); g.fill(); } } });
const PAT: Record<string, Draw> = {
  camo: (g, w) => { g.fillStyle = '#6b7a45'; g.fillRect(0, 0, w, w); blobs(g, w, ['#8c7f55', '#3f4d28', '#26281a'], 9, w / 10); },
  frost: (g, w) => { const q = w / 16, cs = ['#f3f6f8', '#dfe6ec', '#b9c4ce', '#8796a4']; // digital snow camo
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { g.fillStyle = pick(Math.random() < .55 ? cs.slice(0, 2) : cs); g.fillRect(x * q, y * q, q, q); } },
  tiger: (g, w) => { g.fillStyle = '#f2871c'; g.fillRect(0, 0, w, w); g.strokeStyle = '#151210'; g.lineCap = 'round';
    for (let x = -8; x < w; x += w / 7) { g.lineWidth = rnd(4, 9); g.beginPath(); g.moveTo(x, -4); g.bezierCurveTo(x + rnd(-20, 20), w * .3, x + rnd(-20, 20), w * .6, x + rnd(-10, 10), w * .75); g.stroke(); } },
  alpha: (g, w) => { const q = w / 8; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#cccccc' : '#fff'; g.fillRect(x * q, y * q, q, q); } },
  ham: (g, w) => { g.fillStyle = '#e98d8d'; g.fillRect(0, 0, w, w); blobs(g, w, ['#f4b3ae', '#d9706f'], 6, w / 9); // pink with marbling
    g.fillStyle = '#fbeee6'; g.fillRect(0, w * .82, w, w * .18); }, // fat rim
  galaxy: (g, w) => { g.fillStyle = '#0a0620'; g.fillRect(0, 0, w, w);
    for (const c of ['#7b2cff55', '#1fa2ff44', '#ff3fa455']) { const x = rnd(0, w), y = rnd(0, w), gr = g.createRadialGradient(x, y, 0, x, y, w * .45);
      gr.addColorStop(0, c); gr.addColorStop(1, '#0000'); g.fillStyle = gr; g.fillRect(0, 0, w, w); }
    g.fillStyle = '#fff'; for (let i = 0; i < 70; i++) g.fillRect(rnd(0, w), rnd(0, w), i % 9 ? 1 : 2, i % 9 ? 1 : 2); },
  zebra: (g, w) => { g.fillStyle = '#f5f4ee'; g.fillRect(0, 0, w, w); g.strokeStyle = '#111'; g.lineCap = 'round';
    for (let x = -4; x < w; x += w / 11) { g.lineWidth = rnd(3, 6); g.beginPath(); g.moveTo(x, -4); g.bezierCurveTo(x + rnd(-14, 14), w * .35, x + rnd(-14, 14), w * .65, x + rnd(-8, 8), w + 4); g.stroke(); } },
  candy: (g, w) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, w); g.fillStyle = '#d4141c'; // candy cane: diagonal stripes
    for (let x = 0; x < w * 2; x += w / 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + w / 8, 0); g.lineTo(x + w / 8 - w, w); g.lineTo(x - w, w); g.fill(); } },
  knit: (g, w) => { const q = w / 16; // christmas sweater: red bands, white zigzag between
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      g.fillStyle = y < 2 || y > 13 ? '#c8102e' : y > 4 && y < 11 && (x + Math.abs(y - 7.5) | 0) % 4 === 0 ? '#fff' : '#1d5b34'; g.fillRect(x * q, y * q, q, q); } },
};
// one thing a case can hold: a skin, or a horn (horn: true, i = its icon; the sound is in audio.ts)
export interface CaseItem {
  k: string; n: string; r: number; c?: string; e?: string; ro?: number; me?: number; glow?: number; op?: number; lid?: string; p?: Draw; cv?: HTMLCanvasElement;
  story?: boolean; hint?: string; i?: string; horn?: boolean;
}
const skinCanvas = (s: CaseItem) => s.cv ??= (() => { const c = document.createElement('canvas'); c.width = c.height = 128; s.p!(c.getContext('2d')!, 128, 128); return c; })();
export const SKINS: CaseItem[] = [ // c = shell colour, ro/me = roughness/metalness, e = glow, p = pattern
  { k: '', n: 'Tehdasvalkoinen', r: 0, c: '#f4f4f2' }, // the default, never in a case
  { k: 'mint', n: 'Minttu', r: 0, c: '#9be3c4' },
  { k: 'peach', n: 'Persikka', r: 0, c: '#ffb38a' },
  { k: 'sky', n: 'Taivas', r: 0, c: '#8cc8ff' },
  { k: 'sand', n: 'Hiekka', r: 0, c: '#d9c49a' },
  { k: 'lilac', n: 'Syreeni', r: 0, c: '#c9b3f0' },
  { k: 'navy', n: 'Yönsininen', r: 1, c: '#1f3a68', ro: .35 },
  { k: 'ruby', n: 'Rubiini', r: 1, c: '#c0263a', ro: .3 },
  { k: 'forest', n: 'Kuusikko', r: 1, c: '#2f6b3a', ro: .5 },
  { k: 'lemon', n: 'Sitruuna', r: 1, c: '#f5d90a', ro: .35 },
  { k: 'chrome', n: 'Kromi', r: 2, c: '#dfe4ea', ro: .12, me: 1 },
  { k: 'bubble', n: 'Purkka', r: 2, c: '#ff5fb0', ro: .2, me: .3 },
  { k: 'onyx', n: 'Onyx', r: 2, c: '#15171b', ro: .18, me: .6 },
  { k: 'copper', n: 'Kupari', r: 2, c: '#b8733a', ro: .25, me: 1 },
  { k: 'pearl', n: 'Helmiäinen', r: 2, c: '#f3ece0', ro: .15, me: .45 },
  { k: 'aurora', n: 'Revontuli', r: 3, c: '#3fe0b0', e: '#0d6b55', ro: .25 },
  { k: 'lava', n: 'Laava', r: 3, c: '#ff5a1f', e: '#7a1800', ro: .4 },
  { k: 'neon', n: 'Neon', r: 3, c: '#39ff14', e: '#1f8a0c', ro: .3 },
  { k: 'ice', n: 'Jää', r: 3, c: '#bfe9ff', e: '#2f6f94', ro: .08, me: .2 },
  { k: 'zebra', n: 'Seepra', r: 4, c: '#f5f4ee', p: PAT.zebra },
  { k: 'candy', n: 'Karkkikeppi', r: 4, c: '#d4141c', p: PAT.candy, ro: .3 },
  { k: 'knit', n: 'Jouluneule', r: 4, c: '#1d5b34', p: PAT.knit, ro: .95 },
  { k: 'camo', n: 'Maastokuvio', r: 4, c: '#6b7a45', p: PAT.camo },
  { k: 'frost', n: 'Pakkaskamo', r: 4, c: '#dfe6ec', p: PAT.frost, ro: .6 },
  { k: 'tiger', n: 'Tiikeri', r: 4, c: '#f2871c', p: PAT.tiger, ro: .5 },
  { k: 'galaxy', n: 'Linnunrata', r: 4, c: '#0a0620', p: PAT.galaxy, ro: .3, glow: 1 }, // stars light up
  { k: 'alpha', n: 'Alfakanava', r: 4, c: '#fff', p: PAT.alpha }, // the "transparent" checkerboard, painted on for real
  { k: 'ham', n: 'Joulukinkku', r: 5, c: '#e98d8d', p: PAT.ham, ro: .45, lid: '#a8551c' }, // only from the kinkkumittari by the sauna; lid = glazed crust
  { k: 'cena', n: 'John Cena', r: 4, c: 'transparent', op: 0 }, // you can't see me: shell gone, shadow and wheels stay
  // dad's flannel shirt: only from finishing the story (story: never in a case)
  { k: 'isi', n: 'Isi', r: 4, c: '#b3261e', story: true, hint: 'Finish the story', p: (g, w) => {
    g.fillStyle = '#b3261e'; g.fillRect(0, 0, w, w); g.fillStyle = 'rgba(20,8,8,.55)'; // buffalo check: dark bands both ways
    for (let i = 0; i < w; i += w / 4) { g.fillRect(i, 0, w / 8, w); g.fillRect(0, i, w, w / 8); } } },
];
export const HORN_ITEMS: CaseItem[] = HORNS.map(h => ({ ...h, horn: true }));
export const skinMat = (k: string) => { const s = SKINS.find(s => s.k === k) || SKINS[0]; if (!s.p && s.op == null) return mat(s.c!, s.e, s.ro ?? .82, s.me ?? 0);
  return _m['skin:' + k] ??= (t => new Std({ map: t, roughness: s.ro ?? .82, metalness: s.me ?? 0,
    ...s.glow && { emissive: '#fff', emissiveMap: t, emissiveIntensity: .8 }, ...s.op != null && { transparent: true, opacity: s.op, depthWrite: false } }))(
    s.p ? Object.assign(new THREE.CanvasTexture(skinCanvas(s)), { colorSpace: THREE.SRGBColorSpace }) : null); };
export const skinOf = (r: Robot) => r.owner === net.myOwner ? skins.sel : r.skin || '';
export function rollSkin() { let x = Math.random() * 100; const r = RARITY.findIndex(q => (x -= q.w) < 0); return pick([...SKINS, ...HORN_ITEMS].filter(s => s.k && s.r === r && !s.story)); }
// skin cases: a reel of random skins slides under a marker and stops on the one already rolled
const TILE = 104, WIN_AT = 40;
let spinning = false, unrevealed = ''; // unrevealed: already saved as owned, but the reel hasn't stopped on it yet
const skinTile = (s: CaseItem, tag = 'div', mine = true) =>
  `<${tag} class="sk r${s.r}${s.k === (s.horn ? skins.horn : skins.sel) && tag === 'button' ? ' on' : ''}" data-k="${s.k}" style="--sc:${s.p ? `url(${skinCanvas(s).toDataURL()}) center/cover` : s.c || '#fff'};--rc:${RARITY[s.r].c}"${mine ? '' : ' disabled'}><i>${mine && s.i || ''}</i>${mine ? s.n : s.hint || '???'}</${tag}>`;
export function renderSkins() {
  setText('caseCount', `${skins.cases} 🎁`);
  $<HTMLButtonElement>('bOpen').disabled = spinning || !skins.cases;
  setText('bOpen', skins.cases ? 'Open case' : 'No cases yet');
  const grid = (list: CaseItem[]) => [...list].sort((a, b) => a.r - b.r).map(s => skinTile(s, 'button', !s.k || (skins.own.includes(s.k) && s.k !== unrevealed))).join('');
  $('skinGrid').innerHTML = grid(SKINS); $('hornGrid').innerHTML = grid(HORN_ITEMS);
}
export function equipSkin(k: string) {
  skins.sel = k; saveSkins(); renderSkins();
  if (net.role === 'guest') send({ type: 'skin', k }); // in a room (net.ts: 'guest' is everyone in one): the server repaints this machine's robots for the others
}
function equipHorn(k: string) { skins.horn = k; saveSkins(); renderSkins(); playHorn(k); }
function openCases() {
  if (!$('strip').childElementCount) $('strip').innerHTML = Array.from({ length: 12 }, rollSkin).map(s => skinTile(s)).join('');
  $('cases').hidden = false; renderSkins();
}
export function closeCases() { $('cases').hidden = true; }
function openCase() {
  if (spinning || !skins.cases) return;
  const win = rollSkin(), dup = skins.own.includes(win.k);
  skins.cases--;
  if (!dup) skins.own.push(unrevealed = win.k);
  saveSkins(); // ponytail: saved before the reel stops, so reloading mid-spin can't reroll
  spinning = true; setText('caseMsg', ''); renderSkins();
  const strip = $('strip'), w = $('reel').clientWidth;
  strip.innerHTML = Array.from({ length: WIN_AT + 6 }, (_, i) => i === WIN_AT ? win : rollSkin()).map(s => skinTile(s)).join('');
  strip.style.transition = 'none'; strip.style.transform = 'translateX(0)'; void strip.offsetWidth;
  strip.style.transition = 'transform 5.5s cubic-bezier(.1,.7,.12,1)';
  strip.style.transform = `translateX(${-(WIN_AT * TILE + TILE / 2 - w / 2 + rnd(-40, 40))}px)`;
  let last = 0;
  (function tick() { // a click each time a tile passes the marker
    const n = Math.floor((w / 2 - new DOMMatrix(getComputedStyle(strip).transform).m41) / TILE);
    if (n !== last) { last = n; beep(1100, .025, 0, 'square', .03); }
    if (spinning) requestAnimationFrame(tick);
  })();
  strip.ontransitionend = strip.ontransitioncancel = () => {
    if (!spinning) return;
    spinning = false; unrevealed = '';
    (win.r >= 2 ? SFX.ach : SFX.pickup)();
    setText('caseMsg', `${RARITY[win.r].n}: ${win.n}! ` + (dup ? 'You had it already.' : win.horn ? 'Your robots honk with it now.' : 'Your robots wear it now.'));
    if (dup) renderSkins(); else if (win.horn) setTimeout(() => equipHorn(win.k), 600); else equipSkin(win.k); // the fanfare first, then the horn
  };
}
$('bCases').onclick = openCases;
$('bCasesX').onclick = closeCases;
$('bOpen').onclick = openCase;
const tileAt = (e: MouseEvent) => { const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button.sk'); return b && !b.disabled ? b.dataset.k! : null; };
$('skinGrid').onclick = e => { const k = tileAt(e); if (k != null) equipSkin(k); };
$('hornGrid').onclick = e => { const k = tileAt(e); if (k != null) equipHorn(k); };
