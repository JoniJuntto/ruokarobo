// Ruokarobo leaderboard. GET -> top ten, POST ?start -> a run token, POST -> add that run.
// The whole board is one JSON file: it is a list of at most 50 rows that changes a few times
// an hour, so a database would be more moving parts than the data is worth.
// ponytail: file + full rewrite on every POST. Move to SQLite if this ever sees real traffic.
'use strict';
const { createServer } = require('node:http');
const { readFileSync, writeFileSync, renameSync, mkdirSync } = require('node:fs');
const { randomUUID } = require('node:crypto');

const DIR = process.env.STATE_DIRECTORY || '/var/lib/ruokarobo-board';
const FILE = DIR + '/scores.json';
const PORT = Number(process.env.PORT) || 47500;
const KEEP = 50;        // rows kept on the board
const COOLDOWN = 5000;  // ms between runs started from one address

let rows = [];
try { rows = JSON.parse(readFileSync(FILE, 'utf8')); } catch (e) { /* first boot */ }

function save() { // write beside the file and rename, so a crash cannot leave half a board
  try {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(FILE + '.tmp', JSON.stringify(rows));
    renameSync(FILE + '.tmp', FILE);
  } catch (e) { console.error('save failed', e.message); }
}

// Untrusted input: anyone can post anything, so names are stripped to letters, digits and a
// little punctuation, and every number is clamped into a range the game can actually produce.
const name = v => (String(v ?? '').replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, 12)) || 'Robo';
const int = (v, lo, hi) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
};

// A score only counts for a run this server saw start: the game asks for a run token when a run
// begins and hands it back with the score. Each token works once, and the score has to be one
// the game could have produced in the time since. A bare POST gets nothing on the board.
// ponytail: the game still runs in the browser, so a patient cheat can start a run, wait as long
// as a real one takes and post the best plausible score. Closing that needs the server to replay
// the run's inputs — do it if someone bothers.
// ponytail: runs live in memory, so a restart drops the scores of runs in flight.
const RUN_MAX = 12 * 3600e3; // a token older than this is dead
const runs = new Map();      // token -> start time
const quota = (k, robots) => 2 + k + (robots - 1) * 2; // startLevel() in index.html
// most a shift can pay: every quota order at the best payout (hot pizza, 98), a sofa on top that
// overshoots the quota, the leftover-battery bonus (at most 111 + 5k) and some +5 friend saves
const shiftMax = (k, robots) => quota(k, robots) * 100 + 111 + 111 + 5 * k + 100;
function plausible(o, ms) {
  let max = 0, min = 45; // the last shift only ends when its battery (48 s at the very least) runs out
  for (let k = 1; k <= o.shift; k++) {
    max += shiftMax(k, o.robots);
    if (k < o.shift) min += 4 * quota(k, o.robots) / o.robots; // no order is delivered in under 4 s
  }
  return o.score <= max && ms >= min * 1000 && ms <= RUN_MAX;
}

const seen = new Map(); // address -> last run started
setInterval(() => { // keep the maps from growing forever
  const cut = Date.now() - COOLDOWN * 10;
  for (const [k, t] of seen) if (t < cut) seen.delete(k);
  for (const [k, t] of runs) if (t < Date.now() - RUN_MAX) runs.delete(k);
}, 60000).unref();

if (process.argv[2] === 'test') { // node board.js test
  const assert = require('node:assert');
  const ok = (score, shift, robots, s) => plausible({ score, shift, robots }, s * 1000);
  assert(!ok(99999, 1, 2, 600));   // the posts that hit the board
  assert(!ok(99999, 23, 1, 3600));
  assert(!ok(6767, 4, 5, 13));     // fine score, but 13 s after the run began
  assert(ok(450, 1, 1, 90));       // a good first shift
  assert(ok(6000, 10, 1, 1500));   // a strong solo run
  assert(!ok(6000, 10, 1, 60));    // ...not in a minute
  assert(!ok(300, 1, 1, 13 * 3600));
  console.log('ok');
  process.exit(0);
}

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  if (req.method === 'OPTIONS') return res.writeHead(204).end();

  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(rows.slice(0, 10)));
  }

  if (req.method !== 'POST') return res.writeHead(405).end();

  const now = Date.now();
  if (req.url.includes('?start')) { // a run begins: hand out its token
    const who = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
    if (now - (seen.get(who) || 0) < COOLDOWN) return res.writeHead(429).end();
    seen.set(who, now);
    if (runs.size >= 5000) runs.delete(runs.keys().next().value); // full: the oldest run gives way
    const run = randomUUID();
    runs.set(run, now);
    return res.writeHead(201, { 'Content-Type': 'application/json' }).end(JSON.stringify({ run }));
  }

  let body = '';
  req.on('data', c => { body += c; if (body.length > 2048) req.destroy(); });
  req.on('end', () => {
    let o;
    try { o = JSON.parse(body); } catch (e) { return res.writeHead(400).end(); }
    const t0 = runs.get(o?.run);
    if (!t0) return res.writeHead(403).end();
    runs.delete(o.run); // one score per run, plausible or not
    const row = { name: name(o.name), score: int(o.score, 0, 99999), shift: int(o.shift, 1, 999),
                  robots: int(o.robots, 1, 4), at: now };
    if (!plausible(row, now - t0)) return res.writeHead(422).end();
    rows.push(row);
    rows.sort((a, b) => b.score - a.score || a.at - b.at);
    rows = rows.slice(0, KEEP);
    save();
    res.writeHead(201, { 'Content-Type': 'application/json' }).end('{"ok":true}');
  });
}).listen(PORT, '127.0.0.1', () => console.log('leaderboard on 127.0.0.1:' + PORT));
