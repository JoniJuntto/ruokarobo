// The two pages are one page playing two maps. helsinki.html is index.html with the handful of differences listed
// here; anything else that drifts between them is a mistake this test names.
import { expect, test } from 'bun:test';

const read = (f: string) => Bun.file(new URL('../' + f, import.meta.url)).text();
const DIFFERS: [village: RegExp, helsinki: RegExp][] = [
  [/<title>Ruokarobo<\/title>/, /<title>Ruokarobo: Helsinki<\/title>/],
  [/ {4}<p>Deliver groceries from the corner shops[^\n]*<\/p>/, / {4}<p>Deliver groceries from the real Alepa[^\n]*<\/p>\n {4}<p [^\n]*OpenStreetMap[^\n]*<\/p>/],
  [/>🏙 Helsinki map</, />🏘 Village map</],
  [/village\.page\.ts/, /helsinki\.page\.ts/],
];

test('helsinki.html is index.html but for its map, its blurb and the map credit', async () => {
  let a = await read('index.html'), b = await read('helsinki.html');
  for (const [va, hb] of DIFFERS) {
    expect(va.test(a), `index.html has ${va}`).toBe(true); expect(hb.test(b), `helsinki.html has ${hb}`).toBe(true);
    a = a.replace(va, '·'); b = b.replace(hb, '·');
  }
  expect(b).toBe(a);
});

test('the Helsinki page credits OpenStreetMap on the title screen, on the minimap and in the data', async () => {
  expect(await read('helsinki.html')).toContain('Map data © <a href="https://www.openstreetmap.org/copyright"');
  expect(await read('src/client/helsinki.ts')).toContain("credit: '© OpenStreetMap'");
  const { HKI } = await import('../src/sim/map/helsinki.data');
  expect(HKI.credit).toContain('© OpenStreetMap contributors');
});
