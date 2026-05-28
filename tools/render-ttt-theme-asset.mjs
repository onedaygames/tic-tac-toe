import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = path.resolve('assets/audio');
const WAV_PATH = path.join(OUT_DIR, 'ttt-theme-canonical-take.wav');
const RECIPE_PATH = path.join(OUT_DIR, 'ttt-theme-canonical-take.recipe.json');

const SEED = 'ODG-TTT-THEME-CANONICAL-2026-05-27';
const SAMPLE_RATE = 44100;
const BPM = 74;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const CHORD_BLOCK_SECONDS = BAR * 2;
const PROGRESSION_SECONDS = CHORD_BLOCK_SECONDS * 4;
const REVERB_TAIL_SECONDS = 3.5;
const DURATION_SECONDS = PROGRESSION_SECONDS + REVERB_TAIL_SECONDS;
const CHANNELS = 2;

const CHORDS = [
  { name: 'C',  b:130.81, a:[261.63,329.63,392.00,523.25], m:[659.25,783.99,523.25,659.25,880.00,659.25] },
  { name: 'G',  b:196.00, a:[392.00,493.88,587.33,783.99], m:[587.33,783.99,493.88,659.25,783.99,493.88] },
  { name: 'Am', b:220.00, a:[440.00,523.25,659.25,880.00], m:[659.25,880.00,523.25,659.25,523.25,440.00] },
  { name: 'F',  b:174.61, a:[349.23,440.00,523.25,698.46], m:[698.46,880.00,523.25,698.46,523.25,440.00] },
];

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function seed() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a) {
  return function random() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(xmur3(SEED)());
const totalSamples = Math.ceil(DURATION_SECONDS * SAMPLE_RATE);
const dryL = new Float64Array(totalSamples);
const dryR = new Float64Array(totalSamples);
const wetL = new Float64Array(totalSamples);
const wetR = new Float64Array(totalSamples);
const melodyEvents = [];

function clampSample(value) {
  return Math.max(-1, Math.min(1, value));
}

function sine(phase) {
  return Math.sin(phase);
}

function triangle(phase) {
  return (2 / Math.PI) * Math.asin(Math.sin(phase));
}

function addToStereo(destL, destR, index, value, pan = 0) {
  if (index < 0 || index >= totalSamples) return;
  const left = Math.cos((pan + 1) * Math.PI / 4);
  const right = Math.sin((pan + 1) * Math.PI / 4);
  destL[index] += value * left;
  destR[index] += value * right;
}

function envelopePluck(t, dur, vol) {
  if (t < 0 || t > dur) return 0;
  if (t <= 0.008) return vol * (t / 0.008);
  const decayStart = 0.008;
  const decayMid = dur * 0.25;
  if (t <= decayMid) {
    const progress = (t - decayStart) / Math.max(0.001, decayMid - decayStart);
    return vol * Math.pow(0.3, progress);
  }
  const progress = (t - decayMid) / Math.max(0.001, dur - decayMid);
  return (vol * 0.3) * Math.pow(0.0001 / 0.3, progress);
}

function envelopePad(t, dur, vol) {
  if (t < 0 || t > dur) return 0;
  if (t < 0.8) return vol * (t / 0.8);
  if (t < dur - 1.0) return vol * 0.7;
  return Math.max(0, vol * 0.7 * ((dur - t) / 1.0));
}

function renderOsc(destL, destR, { freq, type, when, dur, vol, pan = 0 }) {
  const start = Math.max(0, Math.floor(when * SAMPLE_RATE));
  const stop = Math.min(totalSamples, Math.ceil((when + dur + 0.1) * SAMPLE_RATE));
  for (let i = start; i < stop; i++) {
    const t = i / SAMPLE_RATE - when;
    const env = type === 'pluck' ? envelopePluck(t, dur, vol) : envelopePad(t, dur, vol);
    if (env <= 0) continue;
    const phase = 2 * Math.PI * freq * t;
    const wave = type === 'pad' ? triangle(phase) : sine(phase);
    addToStereo(destL, destR, i, wave * env, pan);
  }
}

function pluck(destL, destR, freq, when, dur, vol, pan = 0) {
  renderOsc(destL, destR, { freq, type: 'pluck', when, dur, vol, pan });
  renderOsc(destL, destR, { freq: freq * 2, type: 'pluck', when, dur, vol: vol * 0.18, pan });
}

function pad(destL, destR, freq, when, dur, vol, pan = 0) {
  renderOsc(destL, destR, { freq, type: 'pad', when, dur, vol, pan });
}

function scheduleChord(chord, startTime) {
  const bars = 2;
  const beats = bars * 4;
  const arpStep = BEAT * 0.5;
  const arpPat = [0,1,2,3,2,1,0,2, 1,3,2,1,0,2,1,3];

  pad(dryL, dryR, chord.b, startTime, BAR * bars, 0.055);
  pad(dryL, dryR, chord.b * 2, startTime, BAR * bars, 0.028);
  pad(wetL, wetR, chord.b, startTime, BAR * bars, 0.030);

  for (let i = 0; i < beats * 2; i++) {
    const t = startTime + i * arpStep;
    const note = chord.a[arpPat[i % arpPat.length]];
    const vol = i % 8 === 0 ? 0.11 : 0.07;
    const pan = (i % 4 - 1.5) * 0.06;
    pluck(dryL, dryR, note, t, BEAT * 1.4, vol, pan);
    pluck(wetL, wetR, note, t, BEAT * 2.0, vol * 0.4, -pan);
  }

  let mt = startTime + BEAT * 0.5;
  while (mt < startTime + BAR * bars - BEAT) {
    const frequency = chord.m[Math.floor(rand() * chord.m.length)];
    const dur = BEAT * (rand() > 0.5 ? 2 : 1.5);
    const pan = (rand() - 0.5) * 0.18;
    melodyEvents.push({
      chord: chord.name,
      time: Number(mt.toFixed(4)),
      frequency,
      duration: Number(dur.toFixed(4)),
    });
    pluck(dryL, dryR, frequency, mt, dur + 0.6, 0.09, pan);
    pluck(wetL, wetR, frequency, mt, dur + 1.2, 0.06, -pan);
    mt += BEAT * (1 + Math.floor(rand() * 2));
  }
}

function applyReverb(sourceL, sourceR) {
  const outL = new Float64Array(totalSamples);
  const outR = new Float64Array(totalSamples);
  const taps = [
    [0.061, 0.074, 0.40],
    [0.103, 0.121, 0.32],
    [0.177, 0.149, 0.25],
    [0.281, 0.337, 0.18],
    [0.449, 0.391, 0.13],
    [0.719, 0.631, 0.09],
    [1.097, 0.911, 0.06],
    [1.611, 1.423, 0.04],
    [2.137, 1.891, 0.025],
  ];

  for (let i = 0; i < totalSamples; i++) {
    const l = sourceL[i];
    const r = sourceR[i];
    if (Math.abs(l) < 1e-10 && Math.abs(r) < 1e-10) continue;
    for (const [delayL, delayR, gain] of taps) {
      const jL = i + Math.floor(delayL * SAMPLE_RATE);
      const jR = i + Math.floor(delayR * SAMPLE_RATE);
      if (jL < totalSamples) {
        outL[jL] += (l * 0.72 + r * 0.28) * gain;
        outR[jL] += (r * 0.52 + l * 0.18) * gain * 0.58;
      }
      if (jR < totalSamples) {
        outR[jR] += (r * 0.72 + l * 0.28) * gain;
        outL[jR] += (l * 0.52 + r * 0.18) * gain * 0.58;
      }
    }
  }
  return [outL, outR];
}

function encodeWav(left, right) {
  const samples = left.length;
  const bytesPerSample = 2;
  const blockAlign = CHANNELS * bytesPerSample;
  const dataSize = samples * blockAlign;
  const out = Buffer.alloc(44 + dataSize);
  let offset = 0;

  function writeString(value) {
    out.write(value, offset, 'ascii');
    offset += value.length;
  }

  writeString('RIFF');
  out.writeUInt32LE(36 + dataSize, offset); offset += 4;
  writeString('WAVE');
  writeString('fmt ');
  out.writeUInt32LE(16, offset); offset += 4;
  out.writeUInt16LE(1, offset); offset += 2;
  out.writeUInt16LE(CHANNELS, offset); offset += 2;
  out.writeUInt32LE(SAMPLE_RATE, offset); offset += 4;
  out.writeUInt32LE(SAMPLE_RATE * blockAlign, offset); offset += 4;
  out.writeUInt16LE(blockAlign, offset); offset += 2;
  out.writeUInt16LE(16, offset); offset += 2;
  writeString('data');
  out.writeUInt32LE(dataSize, offset); offset += 4;

  for (let i = 0; i < samples; i++) {
    const l = clampSample(left[i]);
    const r = clampSample(right[i]);
    out.writeInt16LE(l < 0 ? l * 0x8000 : l * 0x7fff, offset); offset += 2;
    out.writeInt16LE(r < 0 ? r * 0x8000 : r * 0x7fff, offset); offset += 2;
  }
  return out;
}

for (let i = 0; i < CHORDS.length; i++) {
  scheduleChord(CHORDS[i], i * CHORD_BLOCK_SECONDS);
}

const [revL, revR] = applyReverb(wetL, wetR);
const left = new Float64Array(totalSamples);
const right = new Float64Array(totalSamples);

let peak = 0;
for (let i = 0; i < totalSamples; i++) {
  const master = 0.22;
  left[i] = master * (dryL[i] * 0.5 + revL[i] * 0.5);
  right[i] = master * (dryR[i] * 0.5 + revR[i] * 0.5);

  // Gentle asset fade-out over only the reverb tail, so the complete take ends cleanly.
  const t = i / SAMPLE_RATE;
  if (t > PROGRESSION_SECONDS) {
    const fade = Math.max(0, 1 - (t - PROGRESSION_SECONDS) / REVERB_TAIL_SECONDS);
    left[i] *= fade;
    right[i] *= fade;
  }
  peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
}

// Preserve the game mix shape while giving the archival asset healthy headroom.
const assetGain = peak > 0 ? 0.78 / peak : 1;
for (let i = 0; i < totalSamples; i++) {
  left[i] *= assetGain;
  right[i] *= assetGain;
}

await mkdir(OUT_DIR, { recursive: true });
await writeFile(WAV_PATH, encodeWav(left, right));
await writeFile(RECIPE_PATH, JSON.stringify({
  title: 'Tic-Tac-Toe Theme - Canonical Take',
  role: 'Founder-approved original Tic-Tac-Toe background music preservation asset.',
  sourceGame: 'One Day Games - Tic-Tac-Toe',
  sourceImplementation: 'index.html WebAudio background music block',
  seed: SEED,
  renderedAt: '2026-05-28T06:08:07.762Z',
  renderer: 'tools/render-ttt-theme-asset.mjs',
  format: {
    wav: 'assets/audio/ttt-theme-canonical-take.wav',
    mp3: 'assets/audio/ttt-theme-canonical-take.mp3',
    sampleRate: SAMPLE_RATE,
    channels: CHANNELS,
    bitDepth: 16,
    durationSeconds: Number(DURATION_SECONDS.toFixed(6)),
  },
  composition: {
    bpm: BPM,
    progression: CHORDS.map(chord => chord.name),
    chordBlock: '2 bars per chord',
    arpPattern: [0,1,2,3,2,1,0,2,1,3,2,1,0,2,1,3],
    arpRate: '8th notes',
    melody: 'Seeded canonical take from the same chord melody pools used by the live WebAudio implementation.',
    liveNote: 'The game implementation remains procedural; this file freezes one approved canonical take for reuse.',
  },
  chords: CHORDS,
  melodyEvents,
  mastering: {
    sourceMasterGain: 0.22,
    dryGain: 0.5,
    wetGain: 0.5,
    normalizedPeak: 0.78,
    preNormalizePeak: Number(peak.toFixed(8)),
    assetGain: Number(assetGain.toFixed(8)),
  },
}, null, 2) + '\n');

console.log(`Wrote ${WAV_PATH}`);
console.log(`Wrote ${RECIPE_PATH}`);
