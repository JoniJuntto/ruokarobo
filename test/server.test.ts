// The server, for real: started on a free port with a throwaway state directory, talked to over HTTP and
// WebSockets the way browsers do.
import { afterAll, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RoomClientMsg, RoomServerMsg, SnapMsg } from '../src/shared/protocol';

const dir = mkdtempSync(join(tmpdir(), 'ruokarobo-test-'));
process.env.STATE_DIRECTORY = dir; process.env.PORT = '0'; // before the server modules load: they read both at import
const { server } = await import('../server/index');
const { plausible, name, int } = await import('../server/board');
const { rooms } = await import('../server/rooms');
const http = `http://127.0.0.1:${server.port}/api/scores`, wsUrl = `ws://127.0.0.1:${server.port}/ws`;
afterAll(() => { server.stop(true); rmSync(dir, { recursive: true, force: true }); });

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
type Of<T extends RoomServerMsg['type']> = Extract<RoomServerMsg, { type: T }>;
async function client() {
  const ws = new WebSocket(wsUrl), got: RoomServerMsg[] = [];
  let closed = 0;
  ws.onmessage = e => got.push(JSON.parse(String(e.data)));
  ws.onclose = e => { closed = e.code; };
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
  const until = async <T>(what: () => T | undefined | false | null, ms = 4000): Promise<T> => {
    for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(10)) { const v = what(); if (v) return v; }
    throw new Error('timed out waiting for ' + what);
  };
  const all = <T extends RoomServerMsg['type']>(type: T) => got.filter((m): m is Of<T> => m.type === type);
  return {
    ws, got, all, until,
    send: (m: RoomClientMsg) => ws.send(JSON.stringify(m)),
    raw: (s: string) => ws.send(s),
    next: <T extends RoomServerMsg['type']>(type: T) => { const n = all(type).length; return until(() => all(type)[n]); }, // the next one to arrive
    last: <T extends RoomServerMsg['type']>(type: T) => until(() => all(type).at(-1)),
    closed: () => closed,
  };
}
type Client = Awaited<ReturnType<typeof client>>;
const snap = (c: Client): Promise<SnapMsg> => c.next('s');
const kinds = (c: Client) => c.all('ev').flatMap(m => m.e.map(e => e.k as string));

test('the plausibility rules board.js shipped with', () => {
  const ok = (score: number, shift: number, robots: number, s: number) => plausible({ score, shift, robots }, s * 1000);
  expect(ok(99999, 1, 2, 600)).toBe(false);   // the posts that hit the board
  expect(ok(99999, 23, 1, 3600)).toBe(false);
  expect(ok(6767, 4, 5, 13)).toBe(false);     // fine score, but 13 s after the run began
  expect(ok(450, 1, 1, 90)).toBe(true);       // a good first shift
  expect(ok(6000, 10, 1, 1500)).toBe(true);   // a strong solo run
  expect(ok(6000, 10, 1, 60)).toBe(false);    // ...not in a minute
  expect(ok(300, 1, 1, 13 * 3600)).toBe(false);
  expect(name('<b>Äiti & Eetu-99</b>!!')).toBe('bÄiti  Eetu-');
  expect(name('  ')).toBe('Robo');
  expect(int('12.9', 0, 10)).toBe(10); expect(int('x', 1, 9)).toBe(1); expect(int(-5, 0, 9)).toBe(0);
});

test('the leaderboard over HTTP: tokens, cooldown, junk', async () => {
  const get = await fetch(http + '?limit=10');
  expect(get.status).toBe(200); expect(await get.json()).toEqual([]);
  expect(get.headers.get('access-control-allow-origin')).toBe('*');
  expect((await fetch(http, { method: 'OPTIONS' })).status).toBe(204);
  expect((await fetch(http, { method: 'DELETE' })).status).toBe(405);
  const post = (body: string) => fetch(http, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  expect((await post('{"name":"x","score":100,"shift":1,"robots":1}')).status).toBe(403); // no run token
  expect((await post('not json')).status).toBe(400);
  expect((await post('null')).status).toBe(403);
  expect((await post('x'.repeat(100_000))).status).toBeGreaterThanOrEqual(400);
  const start = await fetch(http + '?start', { method: 'POST' });
  expect(start.status).toBe(201);
  const { run } = await start.json() as { run: string };
  expect((await fetch(http + '?start', { method: 'POST' })).status).toBe(429); // one run per address per 5 s
  expect((await post(JSON.stringify({ run, name: 'Aino', score: 100, shift: 1, robots: 1 }))).status).toBe(422); // a second after it began
  expect((await post(JSON.stringify({ run, name: 'Aino', score: 0, shift: 1, robots: 1 }))).status).toBe(403);   // each token works once
  expect(await (await fetch(http)).json()).toEqual([]);
});

test('two browsers in a room: host, join, drive, leader rules, hostile input, leader leaves, run recorded', async () => {
  // refusals first: each comes as err and the socket is closed after it
  const lost = await client(); lost.send({ type: 'join', code: 'zzzzz' });
  expect((await lost.last('err')).m).toBe('No room called ZZZZZ.');
  await lost.until(() => lost.closed());
  const odd = await client(); odd.send({ type: 'host', map: 'constructor' });
  expect((await odd.last('err')).m).toContain('map');
  expect(rooms.size).toBe(0);

  const a = await client(), b = await client();
  a.send({ type: 'host', map: 'village' });
  const ra = await a.last('room');
  expect(ra.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
  expect(ra.map).toBe('village'); expect(ra.leader).toBe(ra.me);
  b.send({ type: 'join', code: ' ' + ra.code.toLowerCase() });
  const rb = await b.last('room');
  expect(rb.code).toBe(ra.code); expect(rb.leader).toBe(ra.me); expect(rb.me).not.toBe(ra.me);
  expect((await a.last('lvl')).ice.length).toBeGreaterThan(0);
  expect((await b.last('lvl')).n).toBe(1);

  a.send({ type: 'add', lid: 0, n: '<b>Aino</b>!!', sk: 'mint' });
  b.send({ type: 'add', lid: 0, n: 'Eetu', sk: '"><script>' });
  b.send({ type: 'add', lid: 0, n: 'Eetu again', sk: '' }); // the same lid twice: one robot
  for (let lid = 1; lid < 9; lid++) b.send({ type: 'add', lid, n: 'x', sk: '' }); // MAX_PLAYERS holds: 4 robots in the room, not 10
  let s = await b.until(() => b.all('s').filter(m => m.r.length === 4).at(-1));
  expect((await snap(a)).r.length).toBe(4);
  expect(s.r.filter(r => r.owner === rb.me).length).toBe(3);
  const mine = s.r.find(r => r.owner === ra.me)!;
  expect(mine.n).toBe('bAinob'); expect(mine.sk).toBe('mint');
  expect(s.r.find(r => r.owner === rb.me)!.sk).toBe('');
  expect(s.st).toBe('title');

  // only the leader's buttons work
  for (const act of ['start', 'roam', 'pvp', 'pause', 'quit'] as const) b.send({ type: 'act', a: act });
  b.send({ type: 'story', ch: 3 });
  await sleep(200);
  s = await snap(b);
  expect(s.st).toBe('title'); expect(s.pvp).toBe(false); expect(s.cg).toBe(false); expect(s.pz).toBe(false);
  expect(a.all('ev').length).toBe(0);
  a.send({ type: 'act', a: 'start' });
  await b.until(() => b.all('s').at(-1)?.st === 'play');
  // each socket on its own: a's events and b's are sent in the same tick, but nothing orders their arrival across two sockets
  for (const c of [a, b]) { await c.until(() => kinds(c).includes('start')); expect(kinds(c)).toContain('run'); }
  // on one socket the order is the server's: the level, then a snapshot of it, then the events about it
  for (const c of [a, b]) {
    const ev = c.got.findIndex(m => m.type === 'ev');
    expect(c.got[ev - 1].type).toBe('s'); expect((c.got[ev - 1] as SnapMsg).st).toBe('play'); expect(c.got[ev - 2].type).toBe('lvl');
  }
  expect(kinds(a)).not.toContain('stat'); expect(kinds(a)).not.toContain('level');
  expect(a.all('lvl').length).toBe(2); expect(b.all('lvl').length).toBe(2); // the title's level, then shift 1
  expect((await snap(a)).quota).toBe(3 + 3 * 2);

  // input drives the sender's own robot and nobody else's; numbers are clamped, junk is ignored
  const at = (m: SnapMsg, owner: string) => { const r = m.r.find(r => r.owner === owner)!; return { x: r.x, y: r.y }; };
  const a0 = at(await snap(a), ra.me);
  b.send({ type: 'in', in: { 0: { t: 1e308, s: -1e308, b: true, o: 'x'.repeat(500) }, 7: { t: 1, s: 0 } } });
  for (const junk of ['not json', '[]', 'null', '42', '{}', '{"type":"in"}', '{"type":"in","in":{"0":null,"1":7}}', '{"type":"in","in":{"0":{"t":"NaN","s":{}}}}',
    '{"type":"add","lid":"x"}', '{"type":"add","lid":-1}', '{"type":"add","lid":1.5}', '{"type":"buy","k":"__proto__"}', '{"type":"buy","k":"toString"}',
    '{"type":"skin","k":{"a":1}}', '{"type":"act","a":"explode"}', '{"type":"story","ch":"nine","save":{"money":1e99,"up":{"motor":99,"__proto__":{"x":1}}}}',
    '{"type":"host","map":"village"}', '{"type":"join","code":"AAAAA"}', '{"type":"ping","t":"soon"}', '{"type":"__proto__"}']) a.raw(junk);
  a.send({ type: 'in', in: { 0: { t: 1, s: 0 } } }); // after the junk: the last input a robot got is the one it keeps
  await sleep(1000);
  s = await snap(a);
  const a1 = at(s, ra.me);
  expect(Math.hypot(a1.x - a0.x, a1.y - a0.y)).toBeGreaterThan(20);
  for (const r of s.r) for (const k of ['x', 'y', 'a', 'vx', 'vy'] as const) expect(Number.isFinite(r[k])).toBe(true);
  expect(s.st).toBe('play'); expect(rooms.size).toBe(1);
  a.send({ type: 'ping', t: 123.5 });
  expect((await a.last('pong')).t).toBe(0); // the junk ping, answered with a clean number
  expect((await a.until(() => a.all('pong')[1])).t).toBe(123.5);

  // the leader may pause; an oversized message costs its sender the socket and nobody else anything
  a.send({ type: 'act', a: 'pause' });
  await b.until(() => b.all('s').at(-1)?.pz);
  a.send({ type: 'act', a: 'resume' });
  await b.until(() => !b.all('s').at(-1)?.pz);
  const big = await client(); big.send({ type: 'join', code: ra.code });
  await big.last('room');
  big.raw(JSON.stringify({ type: 'in', in: { 0: { t: 1, s: 0, pad: 'x'.repeat(5000) } } }));
  expect(await big.until(() => big.closed())).toBe(1009);
  const flood = await client(); flood.send({ type: 'join', code: ra.code });
  await flood.last('room');
  for (let i = 0; i < 2000; i++) flood.send({ type: 'ping', t: i });
  await flood.until(() => flood.closed());
  expect(flood.all('pong').length).toBeLessThan(200);
  expect((await fetch(http)).status).toBe(200);
  await snap(b);

  // the leader goes: its robot goes with it and the longest-connected socket leads
  a.ws.close();
  expect((await b.last('leader')).leader).toBe(rb.me);
  s = await b.until(() => b.all('s').filter(m => m.r.length === 3).at(-1));
  expect(s.r.every(r => r.owner === rb.me)).toBe(true);
  b.send({ type: 'act', a: 'pause' });
  await b.until(() => b.all('s').at(-1)?.pz);
  b.send({ type: 'act', a: 'resume' });

  // the battery dies: the server writes the run's row itself. (Fast-forwarded: the room believes the run is ten minutes old)
  const room = rooms.get(ra.code)!;
  room.runAt -= 600e3; room.game.state.time = .05; room.game.state.score = 321;
  await b.until(() => kinds(b).includes('over'));
  const board = await (await fetch(http)).json() as { name: string; score: number; shift: number; robots: number }[];
  expect(board.length).toBe(1);
  expect(board[0]).toMatchObject({ name: 'Eetu', score: 321, shift: 1, robots: 3 });
  expect(JSON.parse(readFileSync(join(dir, 'scores.json'), 'utf8'))[0].score).toBe(321);

  // the last one out switches the room off
  b.ws.close();
  await b.until(() => rooms.size === 0);
});

test('a room on the Helsinki map: cars on streets with headings, a plow where the server put it, no leaderboard row', async () => {
  const { helsinki } = await import('../src/sim/map/helsinki');
  const before = await (await fetch(http)).json() as unknown[];
  const a = await client(), b = await client();
  a.send({ type: 'host', map: 'helsinki' });
  const ra = await a.last('room');
  expect(ra.map).toBe('helsinki');
  b.send({ type: 'join', code: ra.code });
  expect((await b.last('room')).map).toBe('helsinki'); // a browser on the village page reads this and goes to the Helsinki page (client/net.ts)
  a.send({ type: 'add', lid: 0, n: 'Aino', sk: '' }); b.send({ type: 'add', lid: 0, n: 'Eetu', sk: '' });
  await b.until(() => b.all('s').at(-1)?.r.length === 2);
  a.send({ type: 'act', a: 'start' });
  await b.until(() => kinds(b).includes('start'));
  const lvl = b.all('lvl').at(-1)!, s0 = await snap(b);
  expect(lvl.cars.length).toBeGreaterThan(0); expect(s0.c.length).toBe(lvl.cars.length);
  await sleep(1500);
  const s1 = await snap(b), between = b.all('s').slice(b.all('s').indexOf(s0));
  let moved = 0, turned = 0;
  for (const [i, [x, y, h]] of s1.c.entries()) {
    expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
    if (x > 0 && x < helsinki.W && y > 0 && y < helsinki.H) expect(helsinki.ground(x, y)).toBe('path'); // on a street
    const dx = x - s0.c[i][0], dy = y - s0.c[i][1], d = Math.hypot(dx, dy);
    if (d > 100 && d < 400 && between.every(m => m.c[i][2] === h)) { // it never turned: it went the way it points, give or take the lane it changed to where one stretch of street meets the next
      moved++; const off = Math.atan2(dy, dx) - h; expect(Math.abs(Math.atan2(Math.sin(off), Math.cos(off)))).toBeLessThan(.5);
    }
    if (Math.abs(Math.sin(h)) > .2) turned++;
  }
  expect(moved).toBeGreaterThan(0); expect(turned).toBeGreaterThan(0); // and not every street runs east-west

  // shift 2 brings the plow: the level message says where it starts
  const room = rooms.get(ra.code)!, g = room.game.state;
  g.delivered = g.quota;
  await b.until(() => b.all('s').at(-1)?.st === 'shop');
  await sleep(1100); // the workshop's button is dead for its first second
  a.send({ type: 'act', a: 'start' });
  const l2 = await b.until(() => b.all('lvl').find(m => m.n === 2));
  expect(l2.plow).toBeTruthy();
  const pl = b.got.slice(b.got.indexOf(l2)).find((m): m is SnapMsg => m.type === 's' && !!m.pl)!.pl!;
  expect(Math.hypot(pl.x - l2.plow!.x, pl.y - l2.plow!.y)).toBeLessThan(30); // the first snapshot after it: it has barely left

  // Santa comes down a street
  const sa = (await b.until(() => { if (!g.santa) g.santaIn = 0; return b.all('s').filter(m => m.sa).at(-1); }, 8000)).sa!; // asked again if there is no street for him just now
  expect(Object.keys(sa).sort()).toEqual(['a', 'x', 'y']);

  // the battery dies ten minutes in: a plausible run by the village's rules, and still no row, because this is not the village
  room.runAt -= 600e3; g.time = .05; g.score = 321;
  await b.until(() => kinds(b).includes('over'));
  await sleep(100);
  expect(await (await fetch(http)).json()).toEqual(before);
  a.ws.close(); b.ws.close();
  await b.until(() => rooms.size === 0);
});
