// Ruokarobo leaderboard. GET -> top ten, POST -> add a run.
// The whole board is one JSON file: it is a list of at most 50 rows that changes a few times
// an hour, so a database would be more moving parts than the data is worth.
// ponytail: file + full rewrite on every POST. Move to SQLite if this ever sees real traffic.
'use strict';
const { createServer } = require('node:http');
const { readFileSync, writeFileSync, renameSync, mkdirSync } = require('node:fs');

const DIR = process.env.STATE_DIRECTORY || '/var/lib/ruokarobo-board';
const FILE = DIR + '/scores.json';
const PORT = Number(process.env.PORT) || 47500;
const KEEP = 50;        // rows kept on the board
const COOLDOWN = 5000;  // ms between accepted posts from one address

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

const seen = new Map(); // address -> last accepted post
setInterval(() => { // keep the cooldown map from growing forever
  const cut = Date.now() - COOLDOWN * 10;
  for (const [k, t] of seen) if (t < cut) seen.delete(k);
}, 60000).unref();

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

  const who = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
  const now = Date.now();
  if (now - (seen.get(who) || 0) < COOLDOWN) return res.writeHead(429).end();

  let body = '';
  req.on('data', c => { body += c; if (body.length > 2048) req.destroy(); });
  req.on('end', () => {
    let o;
    try { o = JSON.parse(body); } catch (e) { return res.writeHead(400).end(); }
    seen.set(who, now);
    rows.push({ name: name(o.name), score: int(o.score, 0, 99999), shift: int(o.shift, 1, 999),
                robots: int(o.robots, 1, 8), at: now });
    rows.sort((a, b) => b.score - a.score || a.at - b.at);
    rows = rows.slice(0, KEEP);
    save();
    res.writeHead(201, { 'Content-Type': 'application/json' }).end('{"ok":true}');
  });
}).listen(PORT, '127.0.0.1', () => console.log('leaderboard on 127.0.0.1:' + PORT));
