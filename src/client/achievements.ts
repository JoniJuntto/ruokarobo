// ---------- achievements ----------
// Events only ever bump a counter; one predicate loop decides what unlocks. 80 achievements
// are then 80 data rows instead of 80 call sites scattered through the simulation.
// ponytail: counters are per machine, and a machine only counts the games it simulates itself. In an online room
// the server simulates and keeps its stat events to itself (server/rooms.ts), so there only the outright unlocks
// ('ach' events) and what this client bumps on its own (online, pvpWin, music) arrive.
import { COSMETICS, ORDERS, UPGRADES } from '../sim/data';
import type { Stats } from '../sim/types';
import { SFX } from './audio';
import { $ } from './dom';
import { saveTot, tot } from './store';
import { G, HOUSES } from './world';

// This run's counters are G.stats, cleared by a new run; `tot` (store.ts) is the lifetime bag, persisted.
// bump: for what only this machine knows (music switched off, who won a pvp match)
export const bump = (k: string, n = 1) => { tot[k] = (tot[k] || 0) + n; return (G.stats[k] = (G.stats[k] || 0) + n); };
// the simulation's own counters arrive as 'stat' events with G.stats already counted; the lifetime bag follows here
export function countStat(k: string, n: number, max?: boolean) { if (!max) tot[k] = (tot[k] || 0) + n; else if (n > (tot[k] || 0)) tot[k] = n; } // max: high-water mark
const everyHouse = (s: Stats) => HOUSES.every((_, i) => s['h' + i]);
const everyOrder = (s: Stats) => ORDERS.every((o, i) => o.story || s['d' + i]);
// w(s, t) reads this run's counters and the lifetime ones; the game state (level, up, score) is fair game too
export interface Ach { k: string; i: string; n: string; d: string; w: (s: Stats, t: Stats) => unknown }
export const ACH: Ach[] = [
  { k: 'first',    i: '📦', n: 'Ensimmäinen',      d: 'Deliver your first order',              w: (s, t) => t.del >= 1 },
  { k: 'del10',    i: '🛍️', n: 'Kymppi',           d: 'Deliver 10 orders in one run',          w: s => s.del >= 10 },
  { k: 'del25',    i: '🚚', n: 'Ruuhka',           d: 'Deliver 25 orders in one run',          w: s => s.del >= 25 },
  { k: 'del50',    i: '🏭', n: 'Liukuhihna',       d: 'Deliver 50 orders in one run',          w: s => s.del >= 50 },
  { k: 'tot100',   i: '💯', n: 'Satanen',          d: 'Deliver 100 orders all time',           w: (s, t) => t.del >= 100 },
  { k: 'tot500',   i: '🎖️', n: 'Veteraani',        d: 'Deliver 500 orders all time',           w: (s, t) => t.del >= 500 },
  { k: 'tot1000',  i: '🏅', n: 'Tuhat ja yksi',    d: 'Deliver 1000 orders all time',          w: (s, t) => t.del >= 1000 },
  { k: 'houses',   i: '🏘️', n: 'Koko katu',        d: 'Deliver to every door in one run',      w: s => everyHouse(s) },
  { k: 'types',    i: '🧺', n: 'Koko valikoima',   d: 'Deliver every kind of order in one run', w: s => everyOrder(s) },
  { k: 'streak10', i: '🎯', n: 'Putki',            d: '10 deliveries in a row without a scratch', w: s => s.streakMax >= 10 },
  { k: 'mint1',    i: '✨', n: 'Naarmuton',        d: 'Deliver one order in perfect condition', w: (s, t) => t.mint >= 1 },
  { k: 'mint10',   i: '💎', n: 'Käsittelee varoen', d: '10 perfect-condition orders in one run', w: s => s.mint >= 10 },
  { k: 'mint30',   i: '🔬', n: 'Laatupäällikkö',   d: '30 perfect-condition orders in one run', w: s => s.mint >= 30 },
  { k: 'late1',    i: '🐌', n: 'Anteeksi…',        d: 'Deliver one order late',                w: (s, t) => t.late >= 1 },
  { k: 'wreck',    i: '🗑️', n: 'Sisältö siirtynyt', d: 'Deliver an order at 20% condition or worse', w: (s, t) => t.wreck >= 1 },
  { k: 'fast3',    i: '⚡', n: 'Pikatoimitus',     d: 'Deliver within 3 s of pickup',          w: (s, t) => t.fast3 >= 1 },
  { k: 'fast3x5',  i: '🚀', n: 'Raketti',          d: 'Five sub-3-second deliveries in one run', w: s => s.fast3 >= 5 },
  { k: 'egg10',    i: '🥚', n: 'Munankuljettaja',  d: 'Deliver 10 egg orders in one run',      w: s => s.d1 >= 10 },
  { k: 'pristine', i: '🧪', n: 'Ei kolhuja',       d: 'Deliver eggs in perfect condition',     w: (s, t) => t.eggMint >= 1 },
  { k: 'ice10',    i: '🍦', n: 'Kylmäketju',       d: 'Deliver 10 ice creams in one run',      w: s => s.d2 >= 10 },
  { k: 'iceFast',  i: '🧊', n: 'Ei sulanut',       d: 'Deliver ice cream with time to spare',  w: (s, t) => t.iceFast >= 1 },
  { k: 'heavy10',  i: '🍉', n: 'Raskas sarja',     d: 'Deliver 10 heavy orders in one run',    w: s => s.d3 >= 10 },
  { k: 'pizza10',  i: '🍕', n: 'Pizzalähetti',     d: 'Deliver 10 pizzas in one run',          w: s => s.d4 >= 10 },
  { k: 'pizzaOn',  i: '🔥', n: 'Vielä lämmin',     d: 'Deliver a pizza on time',               w: (s, t) => t.pizzaOn >= 1 },
  { k: 'sofa',     i: '🛋️', n: 'Muuttomiehet',     d: 'Deliver a sofa together',               w: (s, t) => t.d5 >= 1 },
  { k: 'sofa5',    i: '🛏️', n: 'Muuttofirma',      d: 'Deliver 5 sofas in one run',            w: s => s.d5 >= 5 },
  { k: 'pay60',    i: '💶', n: 'Iso tippi',        d: 'Earn 60 € from a single delivery',      w: (s, t) => t.payMax >= 60 },
  { k: 'rich500',  i: '💰', n: 'Rahakas',          d: 'Earn 500 € in one run',                 w: () => G.score >= 500 },
  { k: 'rich1500', i: '🤑', n: 'Kassamagneetti',   d: 'Earn 1500 € in one run',                w: () => G.score >= 1500 },
  { k: 'rich3000', i: '🏦', n: 'Pörssirobotti',    d: 'Earn 3000 € in one run',                w: () => G.score >= 3000 },
  { k: 'earned',   i: '📈', n: 'Vuosikertymä',     d: 'Earn 20 000 € all time',                w: (s, t) => t.earn >= 20000 },
  { k: 'spend500', i: '🛒', n: 'Tuhlari',          d: 'Spend 500 € in one run',                w: s => s.spent >= 500 },
  { k: 'maxed',    i: '🔧', n: 'Täysin viritetty', d: 'Max out any upgrade',                   w: () => UPGRADES.some(u => G.up[u.k] >= 3) },
  { k: 'allMax',   i: '⚙️', n: 'Tehdasasetukset ylitetty', d: 'Max out four upgrades in one run', w: () => UPGRADES.filter(u => G.up[u.k] >= 3).length >= 4 },
  { k: 'gold',     i: '👑', n: 'Bling',            d: 'Paint the team gold',                   w: () => G.up.gold >= 1 },
  { k: 'allStyle', i: '🧶', n: 'Tyylitietoinen',   d: 'Own every cosmetic at once',            w: () => COSMETICS.every(c => G.up[c.k] >= 1) },
  { k: 'poorShop', i: '🪙', n: 'Lama',             d: 'Reach the workshop with under 10 €',    w: (s, t) => t.poorShop >= 1 },
  { k: 'kaamos',   i: '🌃', n: 'Kaamos',           d: 'Reach shift 3',                         w: () => G.level >= 3 },
  { k: 'shift5',   i: '🏁', n: 'Yötyöläinen',      d: 'Reach shift 5',                         w: () => G.level >= 5 },
  { k: 'shift8',   i: '🌌', n: 'Ikuinen yö',       d: 'Reach shift 8',                         w: () => G.level >= 8 },
  { k: 'shift12',  i: '⛄', n: 'Talvi ei lopu',    d: 'Reach shift 12',                        w: () => G.level >= 12 },
  { k: 'perfect',  i: '🛡️', n: 'Täydellinen vuoro', d: 'Clear a shift without taking damage',  w: (s, t) => t.perfShift >= 1 },
  { k: 'perfect3', i: '🏆', n: 'Kolme putkeen',    d: 'Clear three spotless shifts in one run', w: s => s.perfShift >= 3 },
  { k: 'clean',    i: '⏰', n: 'Ei myöhästymisiä', d: 'Clear a shift with nothing delivered late', w: (s, t) => t.cleanShift >= 1 },
  { k: 'bonus40',  i: '🔋', n: 'Akkua jäljellä',   d: 'Clear a shift with 40 s still on the battery', w: (s, t) => t.bigBonus >= 1 },
  { k: 'shifts50', i: '📅', n: 'Viisikymmentä vuoroa', d: 'Clear 50 shifts all time',          w: (s, t) => t.shifts >= 50 },
  { k: 'runs25',   i: '🔁', n: 'Sinnikäs',         d: 'Start 25 runs all time',                w: (s, t) => t.runs >= 25 },
  { k: 'holeIn',   i: '🕳️', n: 'Kuoppaan',         d: 'Fall into a pothole',                   w: (s, t) => t.holeIn >= 1 },
  { k: 'pothole',  i: '💪', n: 'Kuoppaekspertti',  d: 'Climb out of 5 potholes yourself',      w: s => s.holes >= 5 },
  { k: 'pothole20',i: '🧗', n: 'Kuoppakuningas',   d: 'Climb out of 20 potholes in one run',   w: s => s.holes >= 20 },
  { k: 'noHole',   i: '🛣️', n: 'Siististi ohi',    d: 'Clear a shift without falling in a hole', w: (s, t) => t.noHoleShift >= 1 },
  { k: 'ball5',    i: '❄️', n: 'Lumisota',         d: 'Take 5 snowballs in one run',           w: s => s.balls >= 5 },
  { k: 'ball25',   i: '⛄', n: 'Lumisodan uhri',   d: 'Take 25 snowballs in one run',          w: s => s.balls >= 25 },
  { k: 'car',      i: '🚗', n: 'Auts',             d: 'Get hit by a car',                      w: (s, t) => t.carHit >= 1 },
  { k: 'car10',    i: '🚑', n: 'Liikenneturva',    d: 'Get hit by cars 10 times in one run',   w: s => s.carHit >= 10 },
  { k: 'bottle',   i: '🍾', n: 'Kännissä',         d: 'Get hit by a bottle from a bum',        w: (s, t) => t.bottle >= 1 },
  { k: 'santa',    i: '🎅', n: 'Hohoho',           d: 'Get bowled over by Santa',              w: (s, t) => t.santaHit >= 1 },
  { k: 'plow',     i: '🚜', n: 'Aurauskone',       d: 'Get shoved by the snowplow',            w: (s, t) => t.plowHit >= 1 },
  { k: 'kick',     i: '👢', n: 'Potkittu',         d: 'Get kicked by a local',                 w: (s, t) => t.kick >= 1 },
  { k: 'bite',     i: '🐶', n: 'Purtu',            d: 'Get jumped on by a dog',                w: (s, t) => t.bite >= 1 },
  { k: 'bumps50',  i: '🧱', n: 'Seinäkosketus',    d: 'Bump into walls 50 times in one run',   w: s => s.bumps >= 50 },
  { k: 'broke1',   i: '🔩', n: 'Rikki',            d: 'Break down once',                       w: (s, t) => t.broke >= 1 },
  { k: 'broke10',  i: '🪛', n: 'Kierrätykseen',    d: 'Break down 10 times all time',          w: (s, t) => t.broke >= 10 },
  { k: 'lostOrd',  i: '📭', n: 'Tilaus meni',      d: 'Lose an order to a breakdown',          w: (s, t) => t.lostOrder >= 1 },
  { k: 'fullHp',   i: '💚', n: 'Ehjänä maaliin',   d: 'Clear a shift with the team at full health', w: (s, t) => t.fullHpShift >= 1 },
  { k: 'blizzard', i: '🌨️', n: 'Myrskyn läpi',     d: 'Deliver during a blizzard',             w: (s, t) => t.blizzDel >= 1 },
  { k: 'freeze',   i: '🌧️', n: 'Jäätävä tihku',    d: 'Deliver during freezing rain',          w: (s, t) => t.freezeDel >= 1 },
  { k: 'bothWx',   i: '🌪️', n: 'Säät sekaisin',    d: 'Deliver in both kinds of weather in one run', w: s => s.blizzDel && s.freezeDel },
  { k: 'zap1',     i: '🔌', n: 'Ensimmäinen isku', d: 'Zap someone',                           w: (s, t) => t.zaps >= 1 },
  { k: 'zap25',    i: '⚡', n: 'Sähköshokki',      d: 'Land 25 zaps in one run',               w: s => s.zaps >= 25 },
  { k: 'zap100',   i: '🪫', n: 'Tyhjä akku',       d: 'Land 100 zaps in one run',              w: s => s.zaps >= 100 },
  { k: 'dogs5',    i: '🐕', n: 'Koiranulkoiluttaja', d: 'Zap 5 dogs in one run',               w: s => s.dogs >= 5 },
  { k: 'kids10',   i: '🧒', n: 'Lumisota loppui',  d: 'Zap 10 kids in one run',                w: s => s.kids >= 10 },
  { k: 'spree',    i: '💥', n: 'Sarjatuli',        d: 'Land three zaps within five seconds',   w: (s, t) => t.spree >= 3 },
  { k: 'handoff',  i: '🤝', n: 'Saumaton vaihto',  d: 'Hand a package to a teammate',          w: (s, t) => t.handoffs >= 1 },
  { k: 'handoff10',i: '🔄', n: 'Vaihtokaveri',     d: 'Make 10 handoffs in one run',           w: s => s.handoffs >= 10 },
  { k: 'rescue',   i: '💛', n: 'Hyvä kaveri',      d: 'Tow a teammate out of a pothole',       w: (s, t) => t.rescues >= 1 },
  { k: 'rescue10', i: '🪢', n: 'Hinausauto',       d: 'Tow teammates out 10 times in one run', w: s => s.rescues >= 10 },
  { k: 'saved',    i: '🦸', n: 'Pelastit kaverin', d: 'Flatten a local who was chasing a teammate', w: (s, t) => t.saved >= 1 },
  { k: 'four',     i: '👥', n: 'Nelinpeli',        d: 'Drive a shift with four robots',        w: (s, t) => t.players >= 4 },
  { k: 'eight',    i: '🎉', n: 'Täysi tiimi',      d: 'Drive a shift with eight robots',       w: (s, t) => t.players >= 8 },
  { k: 'online',   i: '🌐', n: 'Etävuoro',         d: 'Play an online room',                   w: (s, t) => t.online >= 1 },
  { k: 'drift',    i: '🏎️', n: 'Talvidriftaaja',   d: 'Spend 10 s sideways on the handbrake in one run', w: s => s.driftT >= 10 },
  { k: 'ice60',    i: '⛸️', n: 'Taitoluistelija',  d: 'Spend 60 s on ice in one run',          w: s => s.iceT >= 60 },
  { k: 'boost30',  i: '💨', n: 'Turbo päällä',     d: 'Spend 30 s on boost in one run',        w: s => s.boostT >= 30 },
  { k: 'topSpeed', i: '📏', n: 'Huippunopeus',     d: 'Hit 280 px/s',                          w: (s, t) => t.topSp >= 280 },
  { k: 'pulla',    i: '🥐', n: 'Mummon pulla',     d: 'Get pulla from a grandma',              w: (s, t) => t.pulla >= 1 },
  { k: 'pulla10',  i: '🧁', n: 'Pullakuski',       d: 'Collect 10 pullas all time',            w: (s, t) => t.pulla >= 10 },
  { k: 'music',    i: '🎵', n: 'Hiljaisuus',       d: 'Turn the music off',                    w: (s, t) => t.music >= 1 },
  { k: 'del100',   i: '🏗️', n: 'Satanen putkeen',  d: 'Deliver 100 orders in one run',         w: s => s.del >= 100 },
  { k: 'streak25', i: '🎳', n: 'Pitkä putki',      d: '25 deliveries in a row without a scratch', w: s => s.streakMax >= 25 },
  { k: 'ontime250',i: '🕰️', n: 'Täsmällinen',      d: 'Deliver 250 orders on time all time',   w: (s, t) => t.ontime >= 250 },
  { k: 'rich6000', i: '💸', n: 'Miljonäärirobotti', d: 'Earn 6000 € in one run',               w: () => G.score >= 6000 },
  { k: 'buys20',   i: '🧾', n: 'Kanta-asiakas',    d: 'Buy 20 things at the workshop all time', w: (s, t) => t.buys >= 20 },
  { k: 'shift15',  i: '🌠', n: 'Kevät ei tule',    d: 'Reach shift 15',                        w: () => G.level >= 15 },
  { k: 'runs100',  i: '♾️', n: 'Elämäntapa',       d: 'Start 100 runs all time',               w: (s, t) => t.runs >= 100 },
  { k: 'peds10',   i: '🚶', n: 'Rauhanrikkoja',    d: 'Zap 10 locals in one run',              w: s => s.peds >= 10 },
  { k: 'pvp1',     i: '🥊', n: 'Kaksintaistelu',   d: 'Play a PvP match',                      w: (s, t) => t.pvp >= 1 },
  { k: 'pvpWin',   i: '🏆', n: 'Kortteli on minun', d: 'Win a PvP match',                      w: (s, t) => t.pvpWin >= 1 },
  { k: 'rival10',  i: '🎯', n: 'Kilpailija kyykkyyn', d: 'Zap rival robots 10 times in one run', w: s => s.rivals >= 10 },
  { k: 'half',     i: '🌟', n: 'Puolimatka',       d: 'Unlock 50 achievements',                w: () => achDone.size >= 50 },
  { k: 'all',      i: '🎖️', n: 'Kaikki kasassa',   d: 'Unlock everything else',                w: () => achDone.size >= ACH.length - 1 },
];
export let achDone = new Set<string>();
try { achDone = new Set(JSON.parse(localStorage.getItem('ruokarobo-ach') || '[]')); } catch (e) {}
achDone = new Set(ACH.filter(a => achDone.has(a.k)).map(a => a.k)); // drop keys from older builds, so the count is honest
export let achLeft = ACH.filter(a => !achDone.has(a.k));
// self-check: keys must be unique, and every predicate must survive empty counter bags
console.assert(new Set(ACH.map(a => a.k)).size === ACH.length, 'duplicate achievement key');
for (const a of ACH) try { a.w({}, {}); } catch (e) { console.error('achievement predicate throws:', a.k, e); }
const achQ: Ach[] = []; // toasts are queued so a burst of unlocks does not bury the screen
let achT = 0, achCheckT = 0;
export function achTick(dt: number) {
  if (achQ.length && (achT -= dt) <= 0) { achT = 1.1; achToast(achQ.shift()!); }
  if ((achCheckT -= dt) <= 0) { achCheckT = .4; if (G.state !== 'title' && !G.campaign) checkAch(); } // story chapters are not shifts: no endless achievements
}
function checkAch() {
  for (let i = achLeft.length - 1; i >= 0; i--) {
    let hit = false;
    try { hit = !!achLeft[i].w(G.stats, tot); } catch (e) {} // a counter that does not exist yet is just false
    if (hit) unlock(achLeft[i]);
  }
}
export function unlock(key: string | Ach) {
  const a = typeof key === 'string' ? ACH.find(x => x.k === key) : key;
  if (!a || achDone.has(a.k)) return;
  achDone.add(a.k);
  achLeft = achLeft.filter(x => x.k !== a.k);
  achQ.push(a);
  try { localStorage.setItem('ruokarobo-ach', JSON.stringify([...achDone])); } catch (e) {}
  saveTot();
}
export function achToast(a: { i: string; n: string; d: string }, sound = true) { // also announces players joining (sound off: join has its own)
  const el = document.createElement('div');
  el.className = 'plate yellow ach';
  el.innerHTML = `<span class="ic">${a.i}</span><span><b>${a.n}</b><small>${a.d}</small></span>`;
  $('achs').append(el);
  setTimeout(() => el.remove(), 4200);
  if (sound) SFX.ach(); // local only: an achievement is this machine's, not the whole room's
}
