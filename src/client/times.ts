// ---------- speedrun boards ----------
// One board per category of sim/splits.ts, fastest first. The simulation says when a category is reached
// ('split'); the time goes on this machine's board for this map, and on the worldwide one where the page has one,
// with the same run token the score uses (board.ts). An online room's times are the server's to record, as its
// scores are. The boards show under Records on the title screen.
import { SPLIT, SPLITS } from '../sim/splits';
import { achToast } from './achievements';
import { TIMES_URL } from './api';
import { boardOn, runToken } from './board';
import { $, esc } from './dom';
import { net } from './net';
import { page } from './page';
import { store } from './store';
import { G } from './world';

interface Row { n: string; ms: number; p: number }
type Boards = Record<string, Row[]>;
const KEY = page.board + '-times';
let local: Boards = {}, global: Boards | null = null;
try { local = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}

export const fmt = (ms: number) => `${ms >= 60000 ? Math.floor(ms / 60000) + ':' + String(Math.floor(ms / 1000) % 60).padStart(2, '0') : Math.floor(ms / 1000)}.${String(Math.floor(ms / 10) % 100).padStart(2, '0')}${ms >= 60000 ? '' : ' s'}`;

const sel = $<HTMLSelectElement>('spCat');
function render() {
  const cat = sel.value || SPLITS[0].k, rows = (global || local)[cat] || [];
  sel.innerHTML = SPLITS.map(s => `<option value="${s.k}">${s.n}${local[s.k]?.[0] ? ` · best here ${fmt(local[s.k][0].ms)}` : ''}</option>`).join('');
  sel.value = cat;
  $('spWhere').textContent = !boardOn() ? 'fastest on this machine' : global ? 'fastest anywhere' : 'offline — showing this machine';
  $('spEmpty').hidden = rows.length > 0;
  $('spList').innerHTML = rows.map((r, i) => `<li><span class="rk">${i + 1}</span><span>${esc(r.n)}</span><span class="mt">${r.p} robot${r.p === 1 ? '' : 's'}</span><span class="sc">${fmt(r.ms)}</span></li>`).join('');
}
async function load() {
  if (boardOn()) try {
    const r = await fetch(TIMES_URL);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const o = await r.json() as Record<string, { name?: string; ms: number; robots: number }[]>;
    global = Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.map(x => ({ n: String(x.name ?? ''), ms: x.ms | 0, p: x.robots | 0 }))]));
  } catch (e) { global = null; } // a dead network just shows this machine's times
  render();
}
sel.onchange = render;
$('mRecords').addEventListener('toggle', e => { if ((e as ToggleEvent).newState === 'open') load(); });
render();

export async function gotSplit(cat: string, ms: number) {
  const def = SPLIT[cat];
  if (!def) return;
  const best = local[cat]?.[0]?.ms, online = net.role === 'guest';
  achToast({ i: '⏱️', n: `${def.n}: ${fmt(ms)}`, d: online ? 'Speedrun time' : best == null ? 'First time on this machine' : ms < best ? `New best here! Was ${fmt(best)}` : `Best here: ${fmt(best)}` }, false);
  if (online) return; // the server timed it and has put it on the board under the host's name
  const row: Row = { n: (store.pname || 'Robo').slice(0, 12), ms, p: G.robots.length };
  local[cat] = [...(local[cat] || []), row].sort((a, b) => a.ms - b.ms).slice(0, 10);
  try { localStorage.setItem(KEY, JSON.stringify(local)); } catch (e) {}
  if (boardOn()) try {
    await fetch(TIMES_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                             body: JSON.stringify({ run: await runToken(), name: row.n, robots: row.p, cat, ms }) });
  } catch (e) { /* the time is still on this machine's board */ }
  render();
}
