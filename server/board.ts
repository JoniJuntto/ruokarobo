// Ruokarobo leaderboard. GET -> top ten, POST ?start -> a run token, POST -> add that run.
// Paths ending in /times are the speedrun boards, one per category of src/sim/splits.ts: GET -> the top ten of
// each, POST -> one category's time for a run. They live in a second JSON file beside the first.
// The whole board is one JSON file: it is a list of at most 50 rows that changes a few times
// an hour, so a database would be more moving parts than the data is worth.
// ponytail: file + full rewrite on every POST. Move to SQLite if this ever sees real traffic.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { SPLIT } from '../src/sim/splits';

const DIR = process.env.STATE_DIRECTORY || '/var/lib/ruokarobo-board';
const FILE = DIR + '/scores.json', TIMES = DIR + '/times.json';
const KEEP = 50;        // rows kept on the board
const COOLDOWN = 5000;  // ms between runs started from one address
const BODY_MAX = 2048;  // bytes of a posted score

export interface Row { name: string; score: number; shift: number; robots: number; at: number }
let rows: Row[] = [];
try { rows = JSON.parse(readFileSync(FILE, 'utf8')); } catch (e) { /* first boot */ }
export interface TimeRow { name: string; ms: number; robots: number; at: number }
let times: Record<string, TimeRow[]> = {}; // category -> fastest first
try { times = JSON.parse(readFileSync(TIMES, 'utf8')); } catch (e) { /* first boot */ }

function save(file = FILE, data: unknown = rows) { // write beside the file and rename, so a crash cannot leave half a board
  try {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(file + '.tmp', JSON.stringify(data));
    renameSync(file + '.tmp', file);
  } catch (e) { console.error('save failed', (e as Error).message); }
}

// Untrusted input: anyone can post anything, so names are stripped to letters, digits and a
// little punctuation, and every number is clamped into a range the game can actually produce.
export const clean = (v: unknown) => String(v ?? '').replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, 12);
export const name = (v: unknown) => clean(v) || 'Robo';
export const int = (v: unknown, lo: number, hi: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
};

// A score only counts for a run this server saw start: the game asks for a run token when a run
// begins and hands it back with the score. Each token works once, and the score has to be one
// the game could have produced in the time since. A bare POST gets nothing on the board.
// ponytail: a local game still runs in the browser, so a patient cheat can start a run, wait as long
// as a real one takes and post the best plausible score. Online runs do not have the hole: the server
// simulates those itself (rooms.ts) and writes their rows with addRow().
// ponytail: runs live in memory, so a restart drops the scores of runs in flight.
export const RUN_MAX = 12 * 3600e3; // a token older than this is dead
const runs = new Map<string, { t0: number; cats: Set<string> }>(); // token -> start time, and the speedrun categories it has posted
const quota = (k: number, robots: number) => 2 + k + (robots - 1) * 2; // startLevel() in src/sim/level.ts
// most a shift can pay: every quota order at the best payout (hot pizza, 98), a sofa on top that
// overshoots the quota, the leftover-battery bonus (at most 111 + 5k) and some +5 friend saves
const shiftMax = (k: number, robots: number) => quota(k, robots) * 100 + 111 + 111 + 5 * k + 100;
export function plausible(o: { score: number; shift: number; robots: number }, ms: number) {
  let max = 0, min = 45; // the last shift only ends when its battery (48 s at the very least) runs out
  for (let k = 1; k <= o.shift; k++) {
    max += shiftMax(k, o.robots);
    if (k < o.shift) min += 4 * quota(k, o.robots) / o.robots; // no order is delivered in under 4 s
  }
  return o.score <= max && ms >= min * 1000 && ms <= RUN_MAX;
}

const seen = new Map<string, number>(); // address -> last run started
setInterval(() => { // keep the maps from growing forever
  const cut = Date.now() - COOLDOWN * 10;
  for (const [k, t] of seen) if (t < cut) seen.delete(k);
  for (const [k, r] of runs) if (r.t0 < Date.now() - RUN_MAX) runs.delete(k);
}, 60000).unref();

// put a row on the board. Callers have clamped it and checked it is plausible
export function addRow(row: Row) {
  rows.push(row);
  rows.sort((a, b) => b.score - a.score || a.at - b.at);
  rows = rows.slice(0, KEEP);
  save();
}

// put a time on its category's board: a name holds one row per category, its fastest. Callers have clamped it
export function addTime(cat: string, row: TimeRow) {
  if (!SPLIT[cat]) return;
  const list = times[cat] || [], old = list.find(r => r.name === row.name);
  if (old && old.ms <= row.ms) return;
  times[cat] = [...list.filter(r => r !== old), row].sort((a, b) => a.ms - b.ms || a.at - b.at).slice(0, KEEP);
  save(TIMES, times);
}
// a posted time is believed when the category exists, no honest run is faster (SplitDef.min), and the run it
// claims to be part of has been going at least that long: play time never outruns the wall clock
// ponytail: the same hole as scores, a patient cheat can post the floor. Online rooms' times are the server's own
export const plausibleTime = (cat: string, ms: number, robots: number, wall: number) =>
  !!SPLIT[cat] && ms >= SPLIT[cat].min(robots) * 1000 && ms <= wall + 2000 && wall <= RUN_MAX;

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
const reply = (status: number, body: string | null = null, headers: Record<string, string> = {}) => new Response(body, { status, headers: { ...CORS, ...headers } });
const JSON_TYPE = { 'Content-Type': 'application/json' };

// who: the address the request came from
export async function boardHttp(req: Request, who: string): Promise<Response> {
  const isTimes = new URL(req.url).pathname.endsWith('/times');
  if (req.method === 'OPTIONS') return reply(204);
  if (req.method === 'GET' && isTimes) return reply(200, JSON.stringify(Object.fromEntries(Object.entries(times).map(([k, v]) => [k, v.slice(0, 10)]))), { ...JSON_TYPE, 'Cache-Control': 'no-store' });
  if (req.method === 'GET') return reply(200, JSON.stringify(rows.slice(0, 10)), { ...JSON_TYPE, 'Cache-Control': 'no-store' });
  if (req.method !== 'POST') return reply(405);

  const now = Date.now();
  if (req.url.includes('?start')) { // a run begins: hand out its token
    if (now - (seen.get(who) || 0) < COOLDOWN) return reply(429);
    seen.set(who, now);
    if (runs.size >= 5000) runs.delete(runs.keys().next().value!); // full: the oldest run gives way
    const run = crypto.randomUUID();
    runs.set(run, { t0: now, cats: new Set() });
    return reply(201, JSON.stringify({ run }), JSON_TYPE);
  }

  let o: Record<string, unknown> | null;
  try {
    const body = await req.text(); // Bun.serve's maxRequestBodySize (index.ts) has already refused anything huge
    if (body.length > BODY_MAX) return reply(413);
    o = JSON.parse(body);
  } catch (e) { return reply(400); }
  const run = typeof o?.run === 'string' ? runs.get(o.run) : undefined, t0 = run?.t0;
  if (!o || !run || !t0) return reply(403);
  if (isTimes) { // a speedrun time: each category once per run, and the run goes on
    const cat = String(o.cat), t: TimeRow = { name: name(o.name), ms: int(o.ms, 0, RUN_MAX), robots: int(o.robots, 1, 4), at: now };
    if (run.cats.has(cat) || run.cats.size >= 64) return reply(403);
    run.cats.add(cat);
    if (!plausibleTime(cat, t.ms, t.robots, now - t0)) return reply(422);
    addTime(cat, t);
    return reply(201, '{"ok":true}', JSON_TYPE);
  }
  runs.delete(o.run as string); // one score per run, plausible or not
  const row: Row = { name: name(o.name), score: int(o.score, 0, 99999), shift: int(o.shift, 1, 999), robots: int(o.robots, 1, 4), at: now };
  if (!plausible(row, now - t0)) return reply(422);
  addRow(row);
  return reply(201, '{"ok":true}', JSON_TYPE);
}
