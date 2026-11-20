// ---------- sound: every effect is a few oscillator beeps ----------
import { hornOf } from '../sim/data';
import type { SfxName } from '../sim/types';
import { cfg } from './store';

let ac: AudioContext | undefined;
export function beep(f: number, d = .1, delay = 0, type: OscillatorType = 'square', vol = .05) {
  try { ac = ac || new AudioContext(); if (cfg.sfx) tone(f, d, ac.currentTime + delay, type, vol * cfg.sfx); } catch (e) { /* no audio, no problem */ }
}
function tone(f: number, d: number, t0: number, type: OscillatorType, vol: number) {
  const o = ac!.createOscillator(), g = ac!.createGain();
  o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(.0001, t0 + d);
  o.connect(g).connect(ac!.destination); o.start(t0); o.stop(t0 + d);
}
// horn note: holds its level (beep decays), and can slide from f to f1
function toot(f: number, d: number, delay = 0, type: OscillatorType = 'square', vol = .05, f1 = f) {
  try {
    ac = ac || new AudioContext(); if (!cfg.sfx) return;
    const t0 = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain(), v = vol * cfg.sfx;
    o.type = type; o.frequency.setValueAtTime(f, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + d);
    g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + .015); g.gain.setValueAtTime(v, t0 + d * .85); g.gain.exponentialRampToValueAtTime(.0001, t0 + d);
    o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + d);
  } catch (e) { /* no audio, no problem */ }
}
const chord = (fs: number[], d: number, t: number, type: OscillatorType, vol: number) => fs.forEach(f => toot(f, d, t, type, vol));
const mel = (ns: number[][], type: OscillatorType, vol: number) => ns.reduce((t, [f, d]) => (f && toot(f, d * .9, t, type, vol), t + d), 0); // [freq, length] pairs, 0 = rest
export const SFX: Record<SfxName, () => void> = {
  join: () => { beep(660, .08); beep(880, .1, .08); },
  crash: () => beep(140, .15, 0, 'sawtooth', .06),
  kick: () => { beep(90, .12, 0, 'square', .09); beep(60, .18, .03, 'triangle', .09); },
  escape: () => { beep(520, .08); beep(780, .12, .08); },
  hole: () => { beep(220, .2, 0, 'sawtooth'); beep(150, .3, .15, 'sawtooth'); },
  pickup: () => { beep(600, .08); beep(900, .1, .08); },
  deliver: () => { beep(660, .08); beep(880, .08, .09); beep(1320, .15, .18); },
  alarm: () => [880, 660, 880, 660].forEach((f, i) => beep(f, .12, i * .14, 'square', .04)),
  splat: () => beep(300, .08, 0, 'triangle', .07),
  clink: () => { beep(2400, .05, 0, 'triangle', .05); beep(1800, .07, .04, 'triangle', .04); beep(520, .12, .25, 'sine', .06); beep(380, .1, .35, 'sine', .05); },
  zap: () => { beep(1400, .07, 0, 'sawtooth', .05); beep(700, .14, .05, 'square', .04); beep(1800, .05, .1, 'sawtooth', .03); },
  honk: () => [0, .2, .4].forEach((t, i) => { const d = i < 2 ? .12 : .45; beep(415, d, t, 'square', .06); beep(523, d, t, 'square', .05); }),
  hook: () => { beep(900, .05, 0, 'triangle', .06); beep(300, .12, .05, 'sawtooth', .05); },
  jingle: () => [1568, 1568, 1568, 0, 1568, 1568, 1568, 0, 1568, 1865, 1245, 1397, 1568].forEach((f, i) => f && beep(f, .1, i * .11, 'triangle', .05)),
  bark: () => { beep(420, .07, 0, 'square', .06); beep(380, .09, .12, 'square', .06); },
  spark: () => beep(1250, .06, 0, 'triangle', .04),
  boost: () => { beep(160, .3, 0, 'sawtooth', .04); beep(320, .25, .05, 'sawtooth', .03); },
  clear: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, .15, i * .12)),
  over: () => { beep(300, .2); beep(200, .4, .2); },
  ach: () => [784, 1047, 1319, 1568].forEach((f, i) => beep(f, .12, i * .07, 'triangle', .05)),
};

// what each horn sounds like, by its key in sim/data.ts HORNS
const HORN_PLAY: Record<string, () => void> = {
  '': () => chord([415, 523], .35, 0, 'square', .05), // the default, never in a case
  'h-kello': () => [0, .14].forEach(t => { beep(2093, .3, t, 'triangle', .06); beep(2637, .22, t, 'sine', .03); }),
  'h-piip': () => [0, .16].forEach(t => toot(1320, .1, t, 'square', .035)),
  'h-mopo': () => [0, .18].forEach(t => chord([740, 880], .13, t, 'square', .035)),
  'h-ankka': () => { toot(900, .12, 0, 'square', .04, 1500); toot(1100, .2, .15, 'square', .04, 650); },
  'h-rekka': () => chord([131, 165, 196], .9, 0, 'sawtooth', .035),
  'h-pelle': () => [0, .24].forEach(t => toot(330, .18, t, 'square', .06, 480)),
  'h-kukko': () => { toot(700, .12, 0, 'sawtooth', .04, 900); toot(900, .12, .14, 'sawtooth', .04, 1000); toot(1000, .5, .28, 'sawtooth', .04, 650); },
  'h-laiva': () => chord([73, 110, 147], 1.6, 0, 'sawtooth', .05),
  'h-halytys': () => mel([[622, .3], [466, .3], [622, .3], [466, .3]], 'square', .035),
  'h-cucaracha': () => mel([[392, .1], [392, .1], [392, .1], [523, .3], [659, .3], [0, .1], [392, .1], [392, .1], [392, .1], [523, .3], [659, .45]], 'square', .035),
  'h-lehma': () => { toot(190, 1.1, 0, 'sawtooth', .045, 130); toot(95, 1.1, 0, 'sawtooth', .03, 65); },
  'h-ovikello': () => { beep(659, .8, 0, 'sine', .09); beep(523, 1, .4, 'sine', .09); }, // ding-dong, the food is here
  'h-jaatelo': () => mel([[784, .15], [988, .15], [1175, .15], [1568, .3], [1175, .15], [1568, .45]], 'triangle', .06),
  'h-reki': () => SFX.jingle(),
  'h-juna': () => [[0, .4], [.55, 1]].forEach(([t, d]) => [523, 659, 784].forEach(f => toot(f * .94, d, t, 'sawtooth', .022, f))),
  'h-laser': () => [0, .14, .28].forEach(t => toot(1900, .12, t, 'square', .03, 180)),
  'h-ilma': () => [[0, .18], [.24, .18], [.48, .75]].forEach(([t, d]) => chord([466, 470, 587, 698], d, t, 'sawtooth', .03)),
  'h-ufo': () => { toot(300, .4, 0, 'sine', .07, 1400); toot(1400, .3, .4, 'sine', .07, 500); toot(500, .5, .7, 'sine', .07, 1800); },
  'h-urut': () => { const ns = [[440, .08], [392, .08], [440, .7], [0, .15], [392, .12], [349, .12], [330, .12], [294, .12], [277, .4], [294, 1]]; // Bach's toccata, both hands
    mel(ns, 'sawtooth', .025); mel(ns.map(([f, d]) => [f / 2, d]), 'sawtooth', .025); },
  'h-modeemi': () => { mel([[1209, .08], [0, .03], [1336, .08], [0, .03], [1477, .08], [0, .03], [1336, .08], [0, .1]], 'sine', .05);
    toot(2100, .25, .5, 'square', .025, 1200); toot(980, .4, .75, 'sawtooth', .025, 2400); toot(1650, .35, 1.15, 'square', .02); },
  'h-isi': () => SFX.honk(), // tö-tö-tööt, dad's honk from the story
// ---------- music: an original little polka loop, M toggles ----------
};
export const hasHornSound = (k: string) => k in HORN_PLAY;
export const playHorn = (k: unknown) => HORN_PLAY[hornOf(k).k]();

export let musicOn = false;
let musicNext = 0, musicStep = 0; // starts muted; the corner button prompts to unmute
export function flipMusic() { // returns whether it is now on
  musicOn = !musicOn;
  if (musicOn) { beep(880, .06); ac?.resume?.(); } // the click/key is the user gesture that lets audio start
  return musicOn;
}
const MEL = [12, 15, 19, 15, 17, 15, 12, null, 12, 15, 19, 22, 24, 22, 19, null, 19, 17, 15, 17, 19, null, 15, 12, 10, 12, 15, 12, 7, null, 12, null];
const BASS = [0, 0, -4, -4, -2, -2, 0, 0];
export function musicTick() {
  if (!ac || !musicOn || !cfg.music || ac.state !== 'running') return;
  if (musicNext < ac.currentTime) musicNext = ac.currentTime + .05;
  while (musicNext < ac.currentTime + .25) {
    const st = musicStep++ % MEL.length, n = MEL[st];
    if (n != null) tone(220 * 2 ** (n / 12), .2, musicNext, 'triangle', .018 * cfg.music);
    if (st % 4 === 0) tone(55 * 2 ** (BASS[st / 4 % BASS.length] / 12), .6, musicNext, 'sine', .05 * cfg.music);
    musicNext += .19;
  }
}
