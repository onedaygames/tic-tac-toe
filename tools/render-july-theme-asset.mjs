import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (error) {
  throw new Error('Playwright is required to render July with browser WebAudio. Run with NODE_PATH pointing at a Playwright install, or use `npx playwright` tooling first.', { cause: error });
}

const OUT_DIR = path.resolve('assets/audio');
const WAV_PATH = path.join(OUT_DIR, 'july.wav');
const MP3_PATH = path.join(OUT_DIR, 'july.mp3');
const TAIL_WAV_PATH = path.join(OUT_DIR, 'july-with-tail.wav');
const TAIL_MP3_PATH = path.join(OUT_DIR, 'july-with-tail.mp3');
const LONG_MP3_PATH = path.join(OUT_DIR, 'july-long-12min.mp3');
const RECIPE_PATH = path.join(OUT_DIR, 'july.recipe.json');
const NOTES_PATH = path.join(OUT_DIR, 'july.notes.txt');
const LONG_VERSION_SECONDS = 12 * 60;

const renderResult = await renderJulyInBrowser();
await mkdir(OUT_DIR, { recursive: true });
await writeFile(WAV_PATH, Buffer.from(renderResult.loopWavBase64, 'base64'));
await writeFile(TAIL_WAV_PATH, Buffer.from(renderResult.tailWavBase64, 'base64'));
await writeFile(RECIPE_PATH, JSON.stringify(renderResult.recipe, null, 2) + '\n');
await writeFile(NOTES_PATH, [
  'July',
  '',
  'Purpose:',
  'Preserve the founder-approved original Tic-Tac-Toe background music as a reusable project asset.',
  '',
  'Files:',
  '- july.wav: exact game-cycle loop, archival 16-bit stereo WAV.',
  '- july.mp3: exact game-cycle loop, portable 192 kbps MP3.',
  '- july-with-tail.wav: one July cycle plus reverb tail for standalone playback.',
  '- july-with-tail.mp3: portable tail render.',
  '- july-long-12min.mp3: long listening version built from the exact July loop.',
  '- july.recipe.json: source recipe, July metadata, chord pools, melody events, and render details.',
  '',
  'Source:',
  'Rendered with the browser WebAudio API from the Tic-Tac-Toe music design in index.html: 74 BPM, C-G-Am-F, two bars per chord, harp-like plucks, soft bass pad, and the approved TTT melody behavior. The game schedules each chord block 200ms before the prior block nominally ends; the loop files preserve that timing.',
  '',
  'Important:',
  'Do not delete or replace these files casually. This is an early One Day Games / Tic-Tac-Toe creative artifact that CJ directed, approved, and named July.',
  '',
].join('\n'));

const ffmpeg = spawnSync('ffmpeg', [
  '-y',
  '-hide_banner',
  '-loglevel',
  'error',
  '-i',
  WAV_PATH,
  '-codec:a',
  'libmp3lame',
  '-b:a',
  '192k',
  MP3_PATH,
], { stdio: 'inherit' });

if (ffmpeg.status !== 0) {
  throw new Error('ffmpeg failed while creating july.mp3');
}

const tailFfmpeg = spawnSync('ffmpeg', [
  '-y',
  '-hide_banner',
  '-loglevel',
  'error',
  '-i',
  TAIL_WAV_PATH,
  '-codec:a',
  'libmp3lame',
  '-b:a',
  '192k',
  TAIL_MP3_PATH,
], { stdio: 'inherit' });

if (tailFfmpeg.status !== 0) {
  throw new Error('ffmpeg failed while creating july-with-tail.mp3');
}

const longFfmpeg = spawnSync('ffmpeg', [
  '-y',
  '-hide_banner',
  '-loglevel',
  'error',
  '-stream_loop',
  '-1',
  '-i',
  WAV_PATH,
  '-t',
  String(LONG_VERSION_SECONDS),
  '-codec:a',
  'libmp3lame',
  '-b:a',
  '192k',
  LONG_MP3_PATH,
], { stdio: 'inherit' });

if (longFfmpeg.status !== 0) {
  throw new Error('ffmpeg failed while creating july-long-12min.mp3');
}

console.log(`Wrote ${WAV_PATH}`);
console.log(`Wrote ${MP3_PATH}`);
console.log(`Wrote ${TAIL_WAV_PATH}`);
console.log(`Wrote ${TAIL_MP3_PATH}`);
console.log(`Wrote ${LONG_MP3_PATH}`);
console.log(`Wrote ${RECIPE_PATH}`);
console.log(`Wrote ${NOTES_PATH}`);

async function renderJulyInBrowser() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('about:blank');
  const result = await page.evaluate(async () => {
    const TITLE = 'July';
    const TAKE_ID = 'JULY-TTT-WEBAUDIO-APPROVED-001';
    const SAMPLE_RATE = 44100;
    const BPM = 74;
    const BEAT = 60 / BPM;
    const BAR = BEAT * 4;
    const CHORD_BLOCK_SECONDS = BAR * 2;
    const GAME_SCHEDULE_LEAD_SECONDS = 0.2;
    const CHORD_START_INTERVAL_SECONDS = CHORD_BLOCK_SECONDS - GAME_SCHEDULE_LEAD_SECONDS;
    const LOOP_SECONDS = CHORD_START_INTERVAL_SECONDS * 4;
    const REVERB_TAIL_SECONDS = 3.5;
    const RENDER_CYCLES = 3;
    const RENDER_SECONDS = LOOP_SECONDS * RENDER_CYCLES + REVERB_TAIL_SECONDS;
    const LONG_VERSION_SECONDS = 12 * 60;
    const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;

    if (!OfflineCtx) {
      throw new Error('OfflineAudioContext is not available in this browser context.');
    }

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

    const ctx = new OfflineCtx(2, Math.ceil(RENDER_SECONDS * SAMPLE_RATE), SAMPLE_RATE);
    const rev = ctx.createConvolver();
    const impulseLength = SAMPLE_RATE * 3.5;
    const impulse = ctx.createBuffer(2, impulseLength, SAMPLE_RATE);
    const reverbRandom = mulberry32(xmur3(TAKE_ID + ':reverb')());
    for (let c = 0; c < 2; c++) {
      const data = impulse.getChannelData(c);
      for (let i = 0; i < impulseLength; i++) {
        data[i] = (reverbRandom() * 2 - 1) * Math.pow(1 - i / impulseLength, 2.4);
      }
    }
    rev.buffer = impulse;

    const master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);

    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    rev.connect(wet);
    wet.connect(master);

    const dry = ctx.createGain();
    dry.gain.value = 0.5;
    dry.connect(master);

    const melodyEvents = [];
    const blockMelodyPlans = CHORDS.map((chord, chordIndex) => {
      const melodyRandom = mulberry32(xmur3(`${TAKE_ID}:melody:${chord.name}:${chordIndex}`)());
      const events = [];
      let mt = BEAT * 0.5;
      while (mt < BAR * 2 - BEAT) {
        const frequency = chord.m[Math.floor(melodyRandom() * chord.m.length)];
        const dur = BEAT * (melodyRandom() > 0.5 ? 2 : 1.5);
        events.push({
          offset: mt,
          frequency,
          duration: dur,
        });
        mt += BEAT * (1 + Math.floor(melodyRandom() * 2));
      }
      return events;
    });

    function pluck(freq, when, dur, vol, dest) {
      [1, 2].forEach((mult, i) => {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq * mult;
        const v = i === 0 ? vol : vol * 0.18;
        env.gain.setValueAtTime(0, when);
        env.gain.linearRampToValueAtTime(v, when + 0.008);
        env.gain.exponentialRampToValueAtTime(v * 0.3, when + dur * 0.25);
        env.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        osc.connect(env);
        env.connect(dest);
        osc.start(when);
        osc.stop(when + dur + 0.1);
      });
    }

    function pad(freq, when, dur, vol, dest) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      env.gain.setValueAtTime(0, when);
      env.gain.linearRampToValueAtTime(vol, when + 0.8);
      env.gain.setValueAtTime(vol * 0.7, when + dur - 1.0);
      env.gain.linearRampToValueAtTime(0, when + dur);
      osc.connect(env);
      env.connect(dest);
      osc.start(when);
      osc.stop(when + dur + 0.1);
    }

    function scheduleChord(chord, startTime, chordIndex, cycleIndex) {
      const { b, a, m } = chord;
      const bars = 2;
      const beats = bars * 4;
      const arpStep = BEAT * 0.5;
      const arpPat = [0,1,2,3,2,1,0,2, 1,3,2,1,0,2,1,3];

      pad(b, startTime, BAR * bars, 0.055, dry);
      pad(b * 2, startTime, BAR * bars, 0.028, dry);
      pad(b, startTime, BAR * bars, 0.030, rev);

      for (let i = 0; i < beats * 2; i++) {
        const t = startTime + i * arpStep;
        const note = a[arpPat[i % arpPat.length]];
        const vol = i % 8 === 0 ? 0.11 : 0.07;
        pluck(note, t, BEAT * 1.4, vol, dry);
        pluck(note, t, BEAT * 2.0, vol * 0.4, rev);
      }

      for (const event of blockMelodyPlans[chordIndex]) {
        const mt = startTime + event.offset;
        const frequency = event.frequency;
        const dur = event.duration;
        melodyEvents.push({
          chord: chord.name,
          cycle: cycleIndex,
          time: Number(mt.toFixed(4)),
          frequency,
          duration: Number(dur.toFixed(4)),
        });
        pluck(frequency, mt, dur + 0.6, 0.09, dry);
        pluck(frequency, mt, dur + 1.2, 0.06, rev);
      }
    }

    for (let cycle = 0; cycle < RENDER_CYCLES; cycle++) {
      CHORDS.forEach((chord, index) => {
        scheduleChord(chord, cycle * LOOP_SECONDS + index * CHORD_START_INTERVAL_SECONDS, index, cycle);
      });
    }

    const buffer = await ctx.startRendering();
    const loopStartSeconds = LOOP_SECONDS;
    const loopEndSeconds = LOOP_SECONDS * 2;
    const tailStartSeconds = LOOP_SECONDS;
    const tailEndSeconds = LOOP_SECONDS * 2 + REVERB_TAIL_SECONDS;
    const peak = findPeak(buffer, loopStartSeconds, loopEndSeconds);
    const normalizedPeak = 0.78;
    const assetGain = peak > 0 ? normalizedPeak / peak : 1;
    const loopWav = encodeWav(buffer, assetGain, loopStartSeconds, loopEndSeconds);
    const tailWav = encodeWav(buffer, assetGain, tailStartSeconds, tailEndSeconds);

    function findPeak(audioBuffer, startSeconds, endSeconds) {
      let peak = 0;
      const start = Math.max(0, Math.floor(startSeconds * audioBuffer.sampleRate));
      const end = Math.min(audioBuffer.length, Math.ceil(endSeconds * audioBuffer.sampleRate));
      for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
        const data = audioBuffer.getChannelData(ch);
        for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(data[i]));
      }
      return peak;
    }

    function encodeWav(audioBuffer, gain, startSeconds, endSeconds) {
      const channels = audioBuffer.numberOfChannels;
      const start = Math.max(0, Math.floor(startSeconds * audioBuffer.sampleRate));
      const end = Math.min(audioBuffer.length, Math.ceil(endSeconds * audioBuffer.sampleRate));
      const samples = end - start;
      const bytesPerSample = 2;
      const blockAlign = channels * bytesPerSample;
      const dataSize = samples * blockAlign;
      const out = new ArrayBuffer(44 + dataSize);
      const view = new DataView(out);
      let offset = 0;

      function writeString(value) {
        for (let i = 0; i < value.length; i++) view.setUint8(offset++, value.charCodeAt(i));
      }

      writeString('RIFF');
      view.setUint32(offset, 36 + dataSize, true); offset += 4;
      writeString('WAVE');
      writeString('fmt ');
      view.setUint32(offset, 16, true); offset += 4;
      view.setUint16(offset, 1, true); offset += 2;
      view.setUint16(offset, channels, true); offset += 2;
      view.setUint32(offset, audioBuffer.sampleRate, true); offset += 4;
      view.setUint32(offset, audioBuffer.sampleRate * blockAlign, true); offset += 4;
      view.setUint16(offset, blockAlign, true); offset += 2;
      view.setUint16(offset, 16, true); offset += 2;
      writeString('data');
      view.setUint32(offset, dataSize, true); offset += 4;

      const channelData = Array.from({ length: channels }, (_, ch) => audioBuffer.getChannelData(ch));
      for (let i = 0; i < samples; i++) {
        const sourceIndex = start + i;
        for (let ch = 0; ch < channels; ch++) {
          const x = Math.max(-1, Math.min(1, channelData[ch][sourceIndex] * gain));
          view.setInt16(offset, x < 0 ? x * 0x8000 : x * 0x7fff, true);
          offset += 2;
        }
      }
      return out;
    }

    function arrayBufferToBase64(buffer) {
      const bytes = new Uint8Array(buffer);
      const chunkSize = 0x8000;
      let binary = '';
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
      }
      return btoa(binary);
    }

    return {
      loopWavBase64: arrayBufferToBase64(loopWav),
      tailWavBase64: arrayBufferToBase64(tailWav),
      recipe: {
        title: TITLE,
        role: 'Founder-approved original Tic-Tac-Toe background music preservation asset.',
        sourceGame: 'One Day Games - Tic-Tac-Toe',
        sourceImplementation: 'index.html WebAudio background music block',
        takeId: TAKE_ID,
        renderedAt: '2026-05-28T06:30:00.000Z',
        renderer: 'tools/render-july-theme-asset.mjs',
        format: {
          wav: 'assets/audio/july.wav',
          mp3: 'assets/audio/july.mp3',
          wavWithTail: 'assets/audio/july-with-tail.wav',
          mp3WithTail: 'assets/audio/july-with-tail.mp3',
          mp3Long12Minute: 'assets/audio/july-long-12min.mp3',
          sampleRate: SAMPLE_RATE,
          channels: 2,
          bitDepth: 16,
          loopDurationSeconds: Number(LOOP_SECONDS.toFixed(6)),
          withTailDurationSeconds: Number((LOOP_SECONDS + REVERB_TAIL_SECONDS).toFixed(6)),
          longVersionDurationSeconds: LONG_VERSION_SECONDS,
        },
        composition: {
          bpm: BPM,
          progression: CHORDS.map(chord => chord.name),
          chordBlock: '2 bars per chord',
          chordBlockSeconds: Number(CHORD_BLOCK_SECONDS.toFixed(6)),
          gameScheduleLeadSeconds: GAME_SCHEDULE_LEAD_SECONDS,
          chordStartIntervalSeconds: Number(CHORD_START_INTERVAL_SECONDS.toFixed(6)),
          arpPattern: [0,1,2,3,2,1,0,2,1,3,2,1,0,2,1,3],
          arpRate: '8th notes',
          instruments: ['sine pluck fundamental', 'soft octave overtone', 'triangle bass pad', 'browser convolver reverb'],
          identity: 'The approved Tic-Tac-Toe theme music, named July.',
        },
        chords: CHORDS,
        melodyEvents,
        mastering: {
          sourceMasterGain: 0.22,
          dryGain: 0.5,
          wetGain: 0.5,
          normalizedPeak,
          preNormalizePeak: Number(peak.toFixed(8)),
          assetGain: Number(assetGain.toFixed(8)),
        },
      },
    };
  });
  await browser.close();
  return result;
}
