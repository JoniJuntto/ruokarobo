// The game's rule tables: surfaces, upgrades, orders, the story's chapters, horns. Data only.
import type { UpKey, Upgrades } from './types';

export const COLORS = ['#ff7a1a', '#2d9cff', '#2fbf6a', '#e84393', '#f5c400', '#9b59b6', '#00c2c7', '#e74c3c'];
// ponytail: the street is sized for 4; grow the map before raising this
export const MAX_PLAYERS = 4;
export const LAG = 1; // 3G input delay in seconds; the knob for how awful it feels
export const GRAV = 20; // snowball gravity, units/s²
export const SANTA_V = 650;
export const KID_SP = 120;
export const WOLT = '#00c2e8';

// ponytail: feel knobs. terminal speed ≈ acc/kF, kL = sideways grip
export const SURF: Record<'path' | 'snow' | 'ice', { acc: number; kF: number; kL: number; max: number }> = {
  // winter: everything slides. Packed-snow sidewalks drift, fresh snow grips a bit more, ice barely at all
  path: { acc: 420, kF: 1.1, kL: 2.2, max: 190 },
  snow: { acc: 380, kF: 2.6, kL: 3.5, max: 120 },
  ice:  { acc: 110, kF: 0.12, kL: 0.18, max: 270 },
};

// team money buys robot upgrades between shifts; each upgrade has 3 levels
export const PRICES = [100, 300, 700]; // steep on purpose: a run affords 2-3 maxed lines, never the whole shop
export interface UpgradeDef { k: UpKey; key: string; name: string; desc: string; lv?: string[] }
export const UPGRADES: UpgradeDef[] = [
  { k: 'tires', key: '1', name: '❄️ Studded tyres', desc: 'Less sliding, especially on ice', lv: ['Ice stops throwing you around', 'Steer and brake on ice', 'Ice drives like snow'] },
  { k: 'motor', key: '2', name: '⚡ Stronger motor', desc: 'Drive faster', lv: ['+20 % top speed', '+40 % top speed', '+60 % top speed'] },
  { k: 'susp', key: '3', name: '🛞 Suspension', desc: 'Less damage, quicker out of potholes', lv: ['Much less damage, out of potholes twice as fast', 'Pop out of potholes at once', 'Drive straight over potholes'] },
  { k: 'battery', key: '4', name: '🔋 Bigger battery', desc: '+20 s per shift', lv: ['+20 s per shift', '+40 s per shift', '+60 s per shift'] },
  { k: 'turbo', key: '5', name: '🚀 Rocket booster', desc: 'Longer, stronger boost that refills faster', lv: ['Boost lasts 3 s, refills in 5', 'Boost lasts 4.5 s, refills in 3.5', 'Boost almost never runs out'] },
  { k: 'tesla', key: '6', name: '⚡ Tesla coil', desc: 'More zap charges and longer reach', lv: ['5 zaps, longer reach', '7 zaps, long reach', '9 zaps, huge reach'] },
  { k: 'heat', key: '7', name: '🔥 Heated wheels', desc: 'Melt ice patches by driving on them', lv: ['Melt an ice patch in a second', 'Melt ice almost at once', 'Melt ice on touch, ignore freezing rain'] },
  { k: 'box', key: '8', name: '📦 Thermobox', desc: 'Longer deadlines, more pay', lv: ['+25 % pay and deadline', '+50 % pay and deadline', '+75 % pay and deadline'] },
];
export const COSMETICS: UpgradeDef[] = [
  { k: 'pipo', key: '9', name: '🧶 Pipo hats', desc: 'Warm heads for every robot' },
  { k: 'scarf', key: '0', name: '🧣 Scarves', desc: 'Very stylish' },
  { k: 'fiflag', key: '+', name: '🇫🇮 Finnish flags', desc: 'Swap the orange flags' },
  { k: 'gold', key: '-', name: '✨ Gold paint', desc: 'Pure bling' },
];
export const SHOP = [...UPGRADES, ...COSMETICS];
export const isStyle = (k: string) => COSMETICS.some(c => c.k === k);
export const freshUp = (): Upgrades => ({ tires: 0, motor: 0, susp: 0, battery: 0, turbo: 0, tesla: 0, heat: 0, box: 0, pipo: 0, scarf: 0, fiflag: 0, gold: 0 });

export interface OrderDef {
  icon: string; name: string; w: number; dmg?: number; time?: number; tipX?: number; bonus?: number;
  heavy?: boolean; duo?: boolean; story?: boolean; home?: boolean; keep?: boolean; s1?: boolean;
}
// order types: dmg = damage multiplier, time = deadline multiplier, tipX = speed-tip multiplier
export const ORDERS: OrderDef[] = [
  { icon: '🛍️', name: 'Groceries', w: 4 },
  { icon: '🥚', name: 'Eggs – fragile!', dmg: 2.5, bonus: 10, w: 2 },
  { icon: '🍦', name: 'Ice cream – hurry!', time: .6, bonus: 10, w: 2 },
  { icon: '🍉', name: 'Heavy order', heavy: true, bonus: 15, w: 2 },
  { icon: '🍕', name: 'Hot pizza – tip cools fast', time: .8, tipX: 2, w: 2 },
  { icon: '🛋️', name: 'Sofa – needs two robots', duo: true, time: 1.6, bonus: 30, w: .25 }, // counts as 2 orders; .25 of 12.25 ≈ 2 % of orders (was 3 → 20 %)
  // campaign only (story: true): home = always to the kids' house, keep = survives a breakdown, s1 = only S-1 (robots[0]) carries it
  { icon: '🎁', name: 'Present for the kids', story: true, home: true, bonus: 10, w: 0 },
  { icon: '🎄', name: 'Christmas tree – needs two robots', story: true, home: true, duo: true, time: 1.6, bonus: 30, w: 0 },
  { icon: '🛷', name: "Dad's sled", story: true, home: true, keep: true, s1: true, time: 1.5, w: 0 },
  { icon: '🧒', name: 'Eetu – get him home', story: true, home: true, keep: true, dmg: 0, time: 3, w: 0 },
];
export const SLED = ORDERS.findIndex(o => o.s1), EETU = ORDERS.findIndex(o => o.icon === '🧒');
export const LEVEL_NAMES = ['Morning flurry', 'Afternoon dusk', 'Kaamos (polar night)', 'Blizzard'];

// ---------- campaign: one Christmas Eve night, a prologue and 8 chapters ----------
// S-1 is robots[0]. Dad's spirit is in it; the kids never find out for sure.
export interface ChapterDef {
  title: string; intro: string; outro?: string; s1?: string;
  ice?: number; holes?: number; cars?: number; peds?: number; dogs?: number; kids?: number; kidsNearHome?: boolean; plow?: boolean;
  weather?: 'blizzard' | 'freeze'; quota?: number; time?: number; darkness?: number; orders?: number[]; goal?: 'collect' | 'rescue' | 'sled';
}
export const CHAPTERS: ChapterDef[] = [
  { title: 'Prologue', intro: 'Christmas Eve, a little after six. Dad is driving home with a boot full of presents. When he turns onto the street he will honk three times, the way he always does: tö-tö-tööt.\nThe road is icier than it looks.\n\nIn the Salepa warehouse, something switches on.' },
  { title: 'Waking up (Herääminen)', s1: 'Miksi mulla on pyörät?', ice: 0, holes: 0, cars: 1, peds: 1, dogs: 0, kids: 0, plow: false, quota: 3, time: 90, darkness: .1, orders: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    intro: 'Delivery robot S-1 wakes up on its charging pad with the odd feeling that it used to have hands. Salepa has three orders waiting. Start with those.',
    outro: 'S-1 drove like it had done this a thousand times.' },
  { title: 'The crash site (Kolaripaikka)', s1: 'Tää käärepaperi… mistä mä tunnen sen?', ice: 2, holes: 1, cars: 2, peds: 2, dogs: 0, kids: 0, plow: false, quota: 4, time: 90, darkness: .25, goal: 'collect',
    intro: 'Something pulls S-1 to the main road. Presents lie across both lanes, in wrapping paper it somehow remembers buying. Collect every one before the traffic does.',
    outro: 'Every present found. A few are a bit dented.' },
  { title: 'The first present (Ensimmäinen lahja)', s1: 'Tähti ikkunassa. Tuttu talo.', ice: 3, holes: 2, cars: 1, peds: 2, dogs: 1, kids: 3, kidsNearHome: true, plow: false, quota: 4, time: 95, darkness: .4, orders: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    intro: 'The house with the paper star in the window. Two kids live there, and tonight nobody is coming home with presents. Take them there. The kids do not trust strange robots, and they have snowballs.',
    outro: 'The door opened. Nobody outside, just presents on the step.' },
  { title: 'The shift calls (Vuoro kutsuu)', s1: 'Ensin kiintiö. Sitten lahjat.', ice: 5, holes: 4, cars: 2, peds: 4, dogs: 1, kids: 2, plow: true, quota: 7, time: 100, darkness: .6, orders: [4, 2, 2, 2, 2, 0, 3, 0, 0, 0],
    intro: 'The Salepa boss has noticed S-1 wandering off its route. Hit the quota tonight or it goes to the scrapyard. The presents still have to get there in between.',
    outro: 'The boss is satisfied. For now.' },
  { title: 'The ice hole (Avanto)', s1: 'Kestä, Eetu! Tullaan!', ice: 4, holes: 3, cars: 1, peds: 3, dogs: 1, kids: 1, plow: true, quota: 1, time: 90, darkness: .7, goal: 'rescue',
    intro: 'Eetu went to look at the ice hole by the sauna, and the ice gave way. He is holding on to the edge. Hook him out and drive him home.',
    outro: 'Eetu is home. Wet, cold and safe.' },
  { title: 'The tree (Kuusi)', s1: 'Kuusi pitää olla. Aina on ollut.', ice: 4, holes: 3, cars: 1, peds: 3, dogs: 1, kids: 2, plow: true, quota: 2, time: 110, darkness: .75, orders: [0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
    intro: 'Christmas Eve without a tree is not Christmas Eve. Salepa has one left and it is big. Get a colleague to carry the other end, or drag it home very slowly.',
    outro: 'The tree stands in the corner. Aino put the star on top.' },
  { title: 'Blizzard (Myräkkä)', s1: 'Ei näe mitään. Mutta tie on tuttu.', ice: 6, holes: 5, cars: 2, peds: 3, dogs: 2, kids: 2, plow: true, weather: 'blizzard', quota: 6, time: 105, darkness: .8, orders: [2, 1, 1, 1, 1, 0, 2, 0, 0, 0],
    intro: 'The snow is so thick S-1 can barely see its own wheels. The plough is out. The last presents are still at the shops.',
    outro: 'Through the storm. Almost morning.' },
  { title: 'Christmas morning (Joulun aamu)', s1: 'Vielä yksi.', ice: 4, holes: 3, cars: 1, peds: 2, dogs: 1, kids: 0, plow: true, quota: 5, time: 110, darkness: .3, orders: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0], goal: 'sled',
    intro: 'The sky is getting lighter. One present is left, the one that was always meant for Eetu: a red sled. Only S-1 can take it.' },
];
export const ENDING = { title: 'The end', intro: 'S-1 drives back to the warehouse as the sky turns pink.\nIn the window with the paper star, Eetu is still waving.' };
// chapter 10: end credits, after the ending card
export const CREDITS = { title: 'Credits', intro: 'Ruokarobo\n\nSpecial thanks\nOhDensy\njuhistwitch\nmuumitikkari_\ncrazywako\nHemmuliX\nkekewut\n\nThanks for playing!' };

// horns come out of the same cases as skins; i = icon. keys start with h- so they never clash with skins in skins.own.
// The sounds themselves are the client's (client/audio.ts); the simulation only needs to know which horns exist.
export interface HornDef { k: string; n: string; r: number; i: string; story?: boolean; hint?: string }
export const HORNS: HornDef[] = [
  { k: '', n: 'Perustööt', r: 0, i: '📯' },
  { k: 'h-kello', n: 'Pyöränkello', r: 0, i: '🔔' },
  { k: 'h-piip', n: 'Piip piip', r: 0, i: '🐤' },
  { k: 'h-mopo', n: 'Mopo', r: 0, i: '🛵' },
  { k: 'h-ankka', n: 'Kumiankka', r: 0, i: '🦆' },
  { k: 'h-rekka', n: 'Rekkatorvi', r: 1, i: '🚛' },
  { k: 'h-pelle', n: 'Pellen torvi', r: 1, i: '🤡' },
  { k: 'h-kukko', n: 'Kukko', r: 1, i: '🐓' },
  { k: 'h-laiva', n: 'Sumutorvi', r: 2, i: '🚢' },
  { k: 'h-halytys', n: 'Hälytys', r: 2, i: '🚨' },
  { k: 'h-cucaracha', n: 'Cucaracha', r: 2, i: '🌮' },
  { k: 'h-lehma', n: 'Lehmä', r: 2, i: '🐄' },
  { k: 'h-ovikello', n: 'Ovikello', r: 2, i: '🛎️' },
  { k: 'h-jaatelo', n: 'Jäätelöauto', r: 3, i: '🍦' },
  { k: 'h-reki', n: 'Joulupukin reki', r: 3, i: '🛷' },
  { k: 'h-juna', n: 'Höyryjuna', r: 3, i: '🚂' },
  { k: 'h-laser', n: 'Laser', r: 3, i: '🔫' },
  { k: 'h-ilma', n: 'Ilmatorvi', r: 4, i: '🎺' },
  { k: 'h-ufo', n: 'Ufo', r: 4, i: '👽' },
  { k: 'h-urut', n: 'Urut', r: 4, i: '🎹' },
  { k: 'h-modeemi', n: 'Modeemi', r: 4, i: '📠' },
  { k: 'h-isi', n: 'Isin tööt', r: 4, i: '🚗', story: true, hint: 'Finish the story' },
];
export const hornOf = (k: unknown): HornDef => HORNS.find(h => h.k === k) || HORNS[0]; // anything unknown (old saves, remote input) is the default

export const WOLT_SHOUTS = ['Tää on mun keikka!', 'Robotit vie meidän keikat!', 'Pois mun reitiltä!', 'Viis tähteä, kiitos!'];
export const PED_SHOUTS = ['Senkin romu!', 'Pois tieltä!', 'Robotit vie meidän työt!', 'Hitto sentään!', 'Mene pois!'];
