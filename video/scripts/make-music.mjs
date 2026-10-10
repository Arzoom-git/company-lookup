// 用程式合成 30 秒、120 BPM 的配樂（沒有版權問題）：node scripts/make-music.mjs → public/music.wav
// 一小節＝2 秒＝60 影格（30fps），一拍＝15 影格。影片的切換都對準這個節拍。
// 結構：第 0 小節前奏（只有和弦＋踩鈸，慢慢打開）→ 第 1 小節 build-up（鼓越打越密）→ 第 2 小節起正式進拍
//       → 第 14 小節最後一拍收尾重音，餘音到 30 秒。
import fs from 'node:fs';
import path from 'node:path';

const SR = 44100;
const DUR = 30;
const BPM = 120;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const N = SR * DUR;
const L = new Float32Array(N), R = new Float32Array(N);

const midi = (m) => 440 * 2 ** ((m - 69) / 12);
let seed = 7;
const noise = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1; };

function add(t0, len, fn, pan = 0, gain = 1) {
  const s0 = Math.floor(t0 * SR), n = Math.floor(len * SR);
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < n && s0 + i < N; i++) {
    if (s0 + i < 0) continue;
    const v = fn(i / SR, i);
    L[s0 + i] += v * gl; R[s0 + i] += v * gr;
  }
}

// ── 樂器 ───────────────────────────────────────────────
function kick(t, gain = 1) {
  let ph = 0;
  add(t, 0.45, (x) => {
    const f = 45 + 110 * Math.exp(-x * 28);
    ph += (2 * Math.PI * f) / SR;
    return Math.sin(ph) * Math.exp(-x * 7) * 0.95 + (x < 0.004 ? noise() * 0.3 : 0);
  }, 0, gain);
}
function clap(t, gain = 1) {
  let prev = 0;
  add(t, 0.25, (x) => {
    const n = noise(); const hp = n - prev; prev = n;
    const env = Math.exp(-x * 22) * (1 + 0.6 * Math.exp(-((x - 0.012) ** 2) / 0.00002));
    return hp * env * 0.55;
  }, 0, gain);
}
function hat(t, open = false, gain = 1, pan = 0.3) {
  let prev = 0, prev2 = 0;
  add(t, open ? 0.22 : 0.06, (x) => {
    const n = noise(); const hp = n - 2 * prev + prev2; prev2 = prev; prev = n;
    return hp * Math.exp(-x * (open ? 14 : 70)) * 0.22;
  }, pan, gain);
}
function bass(t, note, len, gain = 1) {
  const f = midi(note); let y = 0;
  add(t, len, (x) => {
    const saw = 2 * ((f * x) % 1) - 1;
    const cutoff = 0.05 + 0.25 * Math.exp(-x * 9);
    y += cutoff * (saw - y);
    const env = Math.min(1, x * 300) * Math.exp(-x * 2.2);
    return (y * 0.8 + Math.sin(2 * Math.PI * f * x) * 0.5) * env * 0.5;
  }, 0, gain);
}
function stab(t, notes, len, gain = 1, bright = 1) {
  notes.forEach((note, k) => {
    const f = midi(note); let y = 0;
    add(t, len, (x) => {
      const det = 1 + (k - 1) * 0.0025;
      const saw = 2 * ((f * det * x) % 1) - 1 + 2 * ((f * 1.004 * x) % 1) - 1;
      const cutoff = (0.04 + 0.35 * Math.exp(-x * 14)) * bright;
      y += Math.min(0.9, cutoff) * (saw - y);
      return y * Math.min(1, x * 400) * Math.exp(-x * 6) * 0.12;
    }, (k - 1) * 0.35, gain);
  });
}
function riser(t, len) {
  let prev = 0;
  add(t, len, (x) => {
    const p = x / len; const n = noise(); const hp = n - prev * (1 - p * 0.9); prev = n;
    return hp * p * p * 0.18;
  }, 0, 1);
}
function crash(t, gain = 1) {
  let prev = 0;
  add(t, 2.5, (x) => { const n = noise(); const hp = n - prev; prev = n; return hp * Math.exp(-x * 1.6) * 0.25; }, 0, gain);
  add(t, 2.5, (x) => noise() * Math.exp(-x * 2) * 0.05, 0.4, gain);
}

// ── 編曲：C – G – Am – F，兩小節一組 ───────────────────────
const PROG = [
  { root: 36, chord: [60, 64, 67, 72] }, // C
  { root: 43, chord: [59, 62, 67, 71] }, // G
  { root: 45, chord: [60, 64, 69, 72] }, // Am
  { root: 41, chord: [60, 65, 69, 72] }, // F
];
const BARS = 15;
for (let bar = 0; bar < BARS; bar++) {
  const t0 = bar * BAR;
  const p = PROG[bar % 4];
  const last = bar === BARS - 1;
  if (bar === 0) {
    // 前奏：和弦慢慢變亮，踩鈸在後半小節進來
    for (let b = 0; b < 8; b++) stab(t0 + b * BEAT / 2 + BEAT / 2 * 0, p.chord, 0.3, 0.7, 0.3 + b * 0.09);
    for (let b = 4; b < 8; b++) hat(t0 + b * BEAT / 2 + BEAT / 4, false, 0.7);
    continue;
  }
  if (bar === 1) {
    // build-up：大鼓四拍 → 八分 → 十六分，加上上升噪音
    for (let b = 0; b < 4; b++) kick(t0 + b * BEAT, 0.8);
    for (let s = 0; s < 8; s++) clap(t0 + BEAT * 2 + s * BEAT / 4, 0.25 + s * 0.08);
    riser(t0, BAR);
    for (let b = 0; b < 8; b++) stab(t0 + b * BEAT / 2, p.chord, 0.22, 0.8, 1.2);
    continue;
  }
  if (bar === 2) crash(t0, 1);
  if (bar === 8) crash(t0, 0.7);
  const beats = last ? 1 : 4;
  for (let b = 0; b < beats; b++) {
    const tb = t0 + b * BEAT;
    kick(tb, 1);
    if (b % 2 === 1) clap(tb, 0.9);
    hat(tb + BEAT / 2, b === 3, 0.9);
    hat(tb + BEAT / 4, false, 0.4, -0.3);
    hat(tb + BEAT * 3 / 4, false, 0.4, -0.3);
    // 貝斯：八分音符，反拍高八度
    bass(tb, p.root, BEAT / 2 - 0.02, 1);
    bass(tb + BEAT / 2, p.root + 12, BEAT / 2 - 0.02, 0.7);
    // 和弦：反拍短促
    stab(tb + BEAT / 2, p.chord, 0.25, 1, 1.4);
  }
  if (last) {
    crash(t0, 1.2);
    stab(t0, [48, 60, 64, 67, 72], 2.2, 1.4, 1.6);
    bass(t0, 36, 2.2, 1.2);
  }
}

// ── 混音：大鼓 sidechain 感（每拍開頭壓一下），軟削波、正規化、結尾淡出 ──
const out = Buffer.alloc(44 + N * 4);
let peak = 0;
for (let i = 0; i < N; i++) { peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
const g = 0.9 / Math.tanh(peak * 0.9) ;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const fade = t > DUR - 0.6 ? (DUR - t) / 0.6 : 1;
  const l = Math.tanh(L[i] * 0.9) * g * 0.95 * fade, r = Math.tanh(R[i] * 0.9) * g * 0.95 * fade;
  out.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(l * 32767))), 44 + i * 4);
  out.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(r * 32767))), 46 + i * 4);
}
out.write('RIFF', 0); out.writeUInt32LE(36 + N * 4, 4); out.write('WAVE', 8);
out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34);
out.write('data', 36); out.writeUInt32LE(N * 4, 40);
const file = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..', 'public', 'music.wav');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, out);
console.log('寫入', file, (out.length / 1e6).toFixed(1), 'MB');
