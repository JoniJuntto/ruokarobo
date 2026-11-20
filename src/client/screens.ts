// ---------- DOM screens: title, HUD, shift sign, weather warning, workshop, run over ----------
import { CHAPTERS, CREDITS, ENDING, isStyle, LEVEL_NAMES, MAX_PLAYERS, PRICES, SHOP } from '../sim/data';
import type { UpKey } from '../sim/types';
import { chap, coopX, hz } from '../sim/state';
import { clamp } from '../sim/util';
import { ACH, type Ach, achDone, achLeft, achToast } from './achievements';
import { buy, pressStart, startRoam, storyButton, toggleMusic, togglePvp, urlChapter } from './actions';
import { musicOn } from './audio';
import { board, boardState, lastRank } from './board';
import { $, esc, setText } from './dom';
import { vw } from './gfx';
import { askJoin, KB, myCtrls, touchDev } from './input';
import { updateMenu } from './menu';
import { page } from './page';
import { nameOf, net, waiting } from './net';
import { closeCases, renderSkins } from './skins';
import { saveName, saveSkins, skins, store, storyLoad } from './store';
import { ui } from './ui';
import { BLOCKS, G } from './world';
let achKey = -1, boardKey = '';
const nameIn = $<HTMLInputElement>('pname');
nameIn.value = store.pname;
nameIn.oninput = () => { store.pname = nameIn.value; saveName(); };
const ICONS: Record<UpKey, string> = { // white pictograms for the workshop cards
  tires: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
  motor: '<path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="#fff" stroke="none"/>',
  susp: '<path d="M7 3h10M7 21h10M8 6l8 2-8 2 8 2-8 2 8 2-8 2"/>',
  battery: '<rect x="2" y="7" width="18" height="10" rx="2"/><path d="M22 10v4M6 12h7"/>',
  turbo: '<path d="M12 2c4 3 5 8 3 13H9C7 10 8 5 12 2z"/><circle cx="12" cy="9" r="1.8"/><path d="M9 13l-3 3 1-5M15 13l3 3-1-5M10 18l2 4 2-4"/>',
  tesla: '<path d="M9 22h6M10 22V11M14 22V11M8 11h8M8 8h8"/><circle cx="12" cy="4" r="2" fill="#fff"/><path d="M5 2l2 3-2 2 2 3M19 2l-2 3 2 2-2 3"/>',
  heat: '<path d="M12 2c1 4 6 6 6 12a6 6 0 01-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-6 1-9z"/>',
  box: '<rect x="3" y="10" width="18" height="11" rx="1.5"/><path d="M3 14h18M8 7c0-1.5 1-1.5 1-3M12 7c0-1.5 1-1.5 1-3M16 7c0-1.5 1-1.5 1-3"/>',
  pipo: '<path d="M4 18a8 8 0 0116 0z"/><path d="M3 18h18v3H3z"/><circle cx="12" cy="6" r="2.4" fill="#fff"/>',
  scarf: '<path d="M4 7h16v4H4zM14 11v10h4V11"/>',
  fiflag: '<path d="M4 3v19"/><rect x="4" y="4" width="16" height="11" fill="#fff" stroke="none"/><path d="M10 4v11M4 9.5h16" stroke="#0b4f9c" stroke-width="2.6"/>',
  gold: '<path d="M12 2l2.6 6.4L21 11l-6.4 2.6L12 20l-2.6-6.4L3 11l6.4-2.6z" fill="#fff" stroke="none"/>',
};
const svgIcon = (k: UpKey) => `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">${ICONS[k]}</svg>`;
for (const u of SHOP) {
  const b = document.createElement('button');
  b.className = 'card'; b.dataset.k = u.k; b.onclick = () => buy(u.k);
  b.innerHTML = `<span class="pic">${svgIcon(u.k)}</span><b>${u.name.replace(/^\S+\s/, '')}</b><small>${u.desc}</small><span class="row"><span class="lv"></span><span class="price"></span></span>`;
  $(isStyle(u.k) ? 'cardsStyle' : 'cardsUp').append(b);
}
$('bNext').onclick = $('bStart').onclick = $('bRetry').onclick = $('bStoryGo').onclick = pressStart;
$('bStory').onclick = () => storyButton(false);
$('bNewStory').onclick = () => storyButton(true);
$('bMode').onclick = $('bMode2').onclick = togglePvp;
$('bMap').onclick = () => { location.href = page.other; }; // the other map is its own page
$('bRoam').onclick = startRoam;
$('bMusic').onclick = e => { toggleMusic(); (e.currentTarget as HTMLElement).blur(); };
const BOARD_WHERE = { local: 'best runs on this machine', loading: 'loading…', global: 'best runs anywhere', offline: 'offline — showing this machine' };
const WX_TEXT: Record<string, string[]> = { santa: ['Hohoho! 🎅', page.santa], blizzard: ['Blizzard', 'You can barely see the street'], freeze: ['Freezing rain', 'Every surface is ice for a while'] };
let lastBannerT = 0, lastWxT = 0, playersKey: string | null = null, shopKey = '', pipsKey = '', scoresKey = '';
function restartAnim(el: HTMLElement) { el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
export function updateDOM() {
  const play = G.state === 'play', wait = waiting(); // wait: online, and the room's leader is someone else
  for (const id of ['bMode', 'bMode2']) { // co-op or pvp: always on the title, so solo players can see pvp exists
    const solo = G.robots.length < 2;
    $(id).hidden = solo && id === 'bMode2' || G.campaign && id === 'bMode2'; // no pvp inside the story
    $<HTMLButtonElement>(id).disabled = solo || wait;
    // a robot only exists once its player presses a key, so say that instead of just "needs a 2nd player"
    setText(id, !solo ? `Mode: ${G.pvp ? 'PvP' : 'Co-op'}`
      : !myCtrls().length ? 'PvP: press a key to get your robot'
      : wait ? 'PvP: waiting for the host to press a key'
      : 'PvP: 2nd player, press a key');
  }
  const ranked = G.robots.filter(r => !r.kid).sort((a, b) => b.earn - a.earn);
  if (G.state !== 'title') { closeCases(); document.querySelector<HTMLElement>(':popover-open')?.hidePopover(); }
  // title
  $('title').hidden = G.state !== 'title';
  if (G.state === 'title') {
    $('bStart').hidden = $('bRoam').hidden = wait; $('bMap').hidden = net.role === 'guest'; // the other map is another page: going there would leave the room
    const sv = storyLoad();
    $('bStory').hidden = wait; $('bNewStory').hidden = wait || !sv || !!urlChapter;
    setText('bStory', urlChapter ? `Story: chapter ${urlChapter}` : sv ? `Continue story: chapter ${sv.ch}` : 'Story');
    $('keys').hidden = touchDev; $('touchNote').hidden = !touchDev;
    const pk = G.robots.map(r => r.i + nameOf(r) + !!r.kid).join() + G.pvp;
    if (pk !== playersKey) {
      playersKey = pk;
      $('players').innerHTML = G.robots.length
        ? G.robots.map(r => `<span class="chip"><i style="background:${r.color}"></i>${r.kid ? '🧒 ' : ''}${esc(nameOf(r))}</span>`).join('')
          + (G.pvp ? '<br>PvP: press your snowball key to play as a snowball kid. No score, just mayhem.' : '')
        : (touchDev ? 'Tap Start shift to play.' : 'Press Start shift, then drive with WASD or the arrow keys.');
    }
    setText('bestLine', store.best ? `Best run ${store.best} €` : '');
    if (achKey !== achDone.size) { // unlocked first, so the newest sit at the top
      achKey = achDone.size;
      setText('achCount', `${achDone.size} / ${ACH.length}`);
      const row = (a: Ach) => `<span class="achIt${achDone.has(a.k) ? ' on' : ''}" title="${a.d}"><i>${a.i}</i>${achDone.has(a.k) ? a.n : '???'}</span>`;
      $('achGrid').innerHTML = [...ACH.filter(a => achDone.has(a.k)), ...achLeft].map(row).join('');
    }
    const bk = board.length + ':' + lastRank + ':' + boardState + ':' + (board[0]?.s ?? -1);
    if (bk !== boardKey) {
      boardKey = bk;
      $('boardEmpty').hidden = board.length > 0;
      setText('boardWhere', BOARD_WHERE[boardState]);
      $('boardList').innerHTML = board.map((b, i) => `<li class="${i + 1 === lastRank ? 'you' : ''}"><span class="rk">${i + 1}</span><span>${esc(b.n)}</span>`
        + `<span class="mt">shift ${b.lv} · ${b.p} robot${b.p === 1 ? '' : 's'}</span><span class="sc">${b.s} €</span></li>`).join('');
    }
  }
  // HUD
  $('hud').hidden = !play;
  if (play) {
    setText('hShiftLbl', G.campaign ? 'Chapter' : 'Shift'); setText('hShift', G.level); setText('hTime', Math.ceil(G.time)); setText('hMoney', G.money); setText('hDel', `${G.delivered} / ${G.quota}`);
    $('hBat').style.width = clamp(G.time / (80 + G.level * 3 + G.up.battery * 20), 0, 1) * 100 + '%';
    $('hBatPlate').classList.toggle('low', G.time < 15);
    const pk = `${G.delivered}/${G.quota}`;
    if (pk !== pipsKey) { pipsKey = pk; $('hPips').innerHTML = G.quota <= 12 ? Array.from({ length: G.quota }, (_, i) => `<i class="${i < G.delivered ? 'on' : ''}"></i>`).join('') : ''; }
    $('hDelPlate').hidden = $('hMoneyPlate').hidden = G.pvp; $('hScores').hidden = !G.pvp;
    $('hShiftPlate').hidden = $('hBatPlate').hidden = $('hPips').hidden = G.roam; if (G.roam) setText('hDel', G.delivered); // no quota to count towards
    const sc = G.pvp ? ranked.map(r => `<i style="background:${r.color}"></i><b>${r.earn}</b>`).join('') + '<span class="lbl">€</span>' : '';
    if (sc !== scoresKey) $('hScores').innerHTML = scoresKey = sc;
    $('hWx').hidden = !G.weather.k;
    if (G.weather.k) setText('hWxText', G.weather.t < 1e6 ? `${WX_TEXT[G.weather.k][0]} ${Math.ceil(G.weather.t)} s` : WX_TEXT[G.weather.k][0]); // a chapter's blizzard has no end
    $('hRoom').hidden = !net.roomCode; setText('hRoomCode', net.roomCode);
    const free = KB.filter((k, i) => !myCtrls().some(c => c.kb === i)).map(k => k.name);
    $('joinHint').hidden = G.robots.length >= MAX_PLAYERS || vw < 900 || touchDev;
    setText('joinHint', `More players can join with ${free.length ? free.join(', ') + ' or ' : ''}a gamepad`);
  } else $('joinHint').hidden = true;
  // a second controller asks before it joins
  $('joinAsk').hidden = !askJoin;
  if (askJoin) {
    const k = askJoin.ctrl.kb != null ? KB[askJoin.ctrl.kb] : null, who = k ? k.name : 'A gamepad', n = net.role === 'guest' ? '' : ` as Player ${G.robots.length + 1}`;
    const html = `${who} wants to join${n}. Press <kbd>${k ? k.bn : 'A'}</kbd> to join.`;
    if ($('joinAsk').innerHTML !== html) $('joinAsk').innerHTML = html;
  }
  $('hostPaused').hidden = !(wait && G.paused && play);
  $('bPause').hidden = ui.menuOpen;
  $('bMusic').hidden = ui.menuOpen || musicOn;
  if (ui.menuOpen) updateMenu();
  // shift sign drops in when a new shift starts
  if (play && G.bannerT > lastBannerT + .5) {
    setText('signTitle', G.roam ? 'Free roam' : G.pvp ? 'PvP' : G.campaign ? `Chapter ${G.chapter}` : `Shift ${G.level}`);
    setText('signSub', G.roam ? 'No battery, no quota. Drive anywhere. Esc to quit.' : G.pvp ? 'Most € when the battery dies wins. Zap rivals, pelt them with snowballs.' : G.campaign ? CHAPTERS[G.chapter].title : `${LEVEL_NAMES[Math.min(G.level, 4) - 1]}. Deliver before the battery runs out.`);
    setText('signQuota', G.quota); $('signQuota').parentElement!.hidden = G.pvp || G.roam || chap(G)?.goal === 'rescue';
    $('sign').hidden = false; restartAnim($('sign'));
  }
  lastBannerT = G.bannerT;
  if (!play || G.bannerT <= 0) $('sign').hidden = true;
  // weather warning
  if (play && ui.wxMsgT > lastWxT + .5 && WX_TEXT[ui.wxKind]) {
    setText('alertTitle', WX_TEXT[ui.wxKind][0]); setText('alertSub', WX_TEXT[ui.wxKind][1]);
    $('alert').hidden = false; restartAnim($('alert'));
  }
  lastWxT = ui.wxMsgT;
  if (!play || ui.wxMsgT <= 0) $('alert').hidden = true;
  // workshop
  $('shop').hidden = G.state !== 'shop';
  const sk = JSON.stringify([G.state, G.money, G.up, wait, G.level]);
  if (G.state === 'shop' && sk !== shopKey) {
    shopKey = sk;
    setText('shopSub', G.campaign ? `${CHAPTERS[G.chapter].title} done. ${CHAPTERS[G.chapter].outro || ''}` : `Shift ${G.level} done. Next: ${G.quota + 1} orders in ${Math.round((83 + G.level * 3 + G.up.battery * 20) * Math.max(.6, 1 - coopX(G) * .2))} s, ${hz(G, 4 + G.level * 2) * BLOCKS} ice patches and as many potholes. Buy for that.`);
    setText('shopBonus', `+${G.bonus} €`); setText('shopMoney', `${G.money} €`);
    for (const b of document.querySelectorAll<HTMLButtonElement>('.card')) {
      const u = SHOP.find(u => u.k === b.dataset.k)!, lv = G.up[u.k], style = isStyle(u.k), price = PRICES[lv];
      b.disabled = !style && (lv >= 3 || G.money < price); b.classList.toggle('owned', style ? !!lv : lv >= 3);
      b.querySelector('.lv')!.innerHTML = `<kbd>${u.key}</kbd>` + (style ? '' : Array.from({ length: 3 }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join(''));
      if (u.lv) b.querySelector('small')!.textContent = lv >= 3 ? u.lv[2] : `Level ${lv + 1}: ${u.lv[lv]}`;
      b.querySelector('.price')!.textContent = style ? (lv ? 'On' : 'Free') : lv >= 3 ? 'Maxed' : `${price} €`;
    }
    $<HTMLButtonElement>('bNext').disabled = wait;
    $('bNext').textContent = wait ? 'Waiting for the host to start the next shift' : G.campaign ? 'Next chapter' : 'Start next shift';
  }
  // story card: prologue, chapter intros, ending
  $('story').hidden = G.state !== 'story';
  if (G.state === 'story') {
    const c = CHAPTERS[G.chapter] || (G.chapter === 9 ? ENDING : CREDITS);
    if (G.chapter > 8 && !skins.own.includes('isi')) { // the whole story played: dad's skin
      skins.own.push('isi'); saveSkins(); renderSkins();
      achToast({ i: '👔', n: 'Isi unlocked', d: 'Ultra Rare skin. Pick it under Skins.' });
    }
    if (G.chapter > 8 && !skins.own.includes('h-isi')) { // and dad's tö-tö-tööt (separate check: saves that already have the skin get it too)
      skins.own.push('h-isi'); saveSkins(); renderSkins();
      achToast({ i: '🚗', n: 'Isin tööt unlocked', d: 'Ultra Rare horn. Pick it under Skins & horns.' });
    }
    setText('storyLbl', G.chapter >= 1 && G.chapter <= 8 ? `Chapter ${G.chapter} of 8` : '');
    setText('storyTitle', c.title); setText('storyText', c.intro);
    $<HTMLButtonElement>('bStoryGo').disabled = wait || G.stateT < .5;
    setText('bStoryGo', wait ? 'Waiting for the host' : G.chapter === 9 ? 'Credits' : G.chapter > 9 ? 'Back to the title' : G.chapter === 0 ? 'Continue' : 'Start chapter');
  }
  // run over
  $('over').hidden = G.state !== 'over';
  if (G.state === 'over') {
    const tie = ranked.length > 1 && ranked[0].earn === ranked[1].earn;
    setText('overTitle', !G.pvp ? 'Battery dead' : tie || !ranked[0] ? "It's a tie!" : `${nameOf(ranked[0])} wins!`);
    setText('overSub', G.pvp ? ranked.map(r => `${nameOf(r)}: ${r.earn} €`).join(' · ') : G.campaign ? `The battery ran out in ${CHAPTERS[G.chapter].title}. Try the chapter again.` : `The team missed the quota on shift ${G.level}.`);
    $('overStats').hidden = G.pvp || G.campaign;
    setText('overEarned', `${G.score} €`); setText('overBest', `${store.best} €`);
    setText('overRank', lastRank ? `🏆 #${lastRank} ${boardState === 'global' ? 'worldwide' : 'on this machine'}` : '');
    $<HTMLButtonElement>('bRetry').disabled = wait || G.stateT < 1;
    setText('bRetry', wait ? 'Waiting for the host' : 'Try again');
  }
}
