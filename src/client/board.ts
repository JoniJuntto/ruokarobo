// ---------- leaderboard ----------
// The board is served by server/board.ts next to the game: GET returns the top ten, POST adds
// a run. It keeps the top 50 in one JSON file — a database would be more moving parts than a
// score list is worth.
// A score only counts for a run the server saw start: startRun() asks for a run token, the score
// goes back with it, and the server throws out scores the game could not have produced in that time.
// Online runs are simulated by the server, which writes their rows itself: see onlineRun().
// Where the board lives is in api.ts. Where nothing answers (no network) the fetch fails and the local board shows.
// Each map's page has its own board on this machine (page.board), and only a page that says so (page.worldwide)
// talks to the server at all: the others show, and add to, the local board alone.
import { SCORES_URL } from './api';
import { page } from './page';
import { store } from './store';
import { G } from './world';

const BOARD = { url: page.worldwide ? SCORES_URL : '' };
export const boardOn = () => !!BOARD.url;
export interface Row { s: number; lv: number; p: number; n: string; d?: number }
let localBoard: Row[] = [];
try { localBoard = JSON.parse(localStorage.getItem(page.board) || '[]'); } catch (e) {}
export let board = localBoard;                                 // whatever is on screen right now
export let boardState: 'local' | 'loading' | 'global' | 'offline' = boardOn() ? 'loading' : 'local';
let boardNext = 0;                                             // next refresh, in game seconds
let lastRow: Row | null = null;
export let lastRank = 0;
const rankRow = () => { const row = lastRow; lastRank = row ? board.findIndex(b => b.n === row.n && b.s === row.s) + 1 : 0; };
// the board refreshes every 30 s while nobody is driving
export function boardTick() { if (boardOn() && G.state !== 'play' && G.T > boardNext) { boardNext = G.T + 30; loadBoard(); } }
async function loadBoard() {
  if (!boardOn()) return;
  try {
    const r = await fetch(`${BOARD.url}?limit=10`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    board = ((await r.json()) as { score: number; shift: number; robots: number; name?: string }[]).map(x => ({ s: x.score | 0, lv: x.shift | 0, p: x.robots | 0, n: String(x.name ?? '') }));
    boardState = 'global';
  } catch (e) { board = localBoard; boardState = 'offline'; } // a dead network just shows the local board
  rankRow();
}
let runTok: Promise<string | null> | null = null; // promise of this run's token
export const runToken = () => runTok; // this run's token, for its speedrun times too (times.ts)
// a new run: ask the server for its token, and forget where the last one ranked
export const startRun = () => { lastRank = 0; runTok = boardOn() ? fetch(BOARD.url + '?start', { method: 'POST' }).then(r => r.json()).then(o => o.run).catch(() => null) : null; };
async function postScore(row: Row) {
  try {
    await fetch(BOARD.url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                             body: JSON.stringify({ run: await runTok, name: row.n, score: row.s, shift: row.lv, robots: row.p }) });
  } catch (e) { /* the run is still on the local board */ }
  await loadBoard();
}
export function recordRun() {
  const row: Row = { s: G.score, lv: G.level, p: G.robots.length, n: (store.pname || 'Robo').slice(0, 12), d: Date.now() };
  lastRow = row;
  localBoard = [...localBoard, row].sort((a, b) => b.s - a.s || a.d! - b.d!).slice(0, 10);
  try { localStorage.setItem(page.board, JSON.stringify(localBoard)); } catch (e) {}
  if (boardOn()) { boardNext = 0; postScore(row); } else { board = localBoard; rankRow(); }
}
// An online run: the server that simulated it has already put it on the board (server/rooms.ts record()), under
// the room leader's name. Nothing is posted and nothing goes on this machine's own board; the row is only
// remembered so the reloaded board can show where the team landed. null: a new run began, forget the last rank.
export function onlineRun(name: string | null) {
  lastRank = 0;
  lastRow = name == null ? null : { s: G.score, lv: G.level, p: Math.min(4, Math.max(1, G.robots.length)), n: name };
  if (lastRow && boardOn()) { boardNext = 0; loadBoard(); }
}
