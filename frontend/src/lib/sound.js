// The sound engine. Every sound is synthesized with the Web Audio API: no audio
// files to license or download.
// Background music is ON by default (effects stay off); the visitor can stop
// it and the choice is remembered. Browsers only allow sound after the
// visitor taps, clicks or presses a key, so music starts at the first
// interaction (or at once where the browser allows it). It pauses whenever
// the tab is hidden and resumes when the visitor comes back.

const PREF_KEY = 'throne.sound';
const listeners = new Set();
let prefs = { effects: false, music: true };
try {
  prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') };
} catch {
  // Storage blocked: sound simply starts off.
}

let ctx = null;
let master = null;
let musicGain = null;

function ensureContext() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    // A gentle limiter keeps overlapping effects from clipping.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(limiter).connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export const soundPrefs = () => ({ ...prefs });
export function onSoundPrefs(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setSoundPrefs(next) {
  prefs = { ...prefs, ...next };
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {
    // Not fatal: the choice just won't be remembered.
  }
  if (prefs.effects || prefs.music) ensureContext(); // called from a click: allowed to start audio
  if (prefs.music && visible()) startMusic();
  else stopMusic();
  if (!prefs.effects && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  listeners.forEach((fn) => fn(soundPrefs()));
}

// Sound may only start after a user gesture: the first tap, click or key
// press anywhere unlocks it.
const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible';
if (typeof window !== 'undefined') {
  const GESTURES = ['pointerdown', 'keydown', 'touchstart'];
  const unlock = () => {
    GESTURES.forEach((g) => window.removeEventListener(g, unlock, true));
    if (prefs.effects || prefs.music) ensureContext();
    if (prefs.music && visible()) startMusic();
  };
  GESTURES.forEach((g) => window.addEventListener(g, unlock, { capture: true, passive: true }));

  // Some browsers let a site the visitor uses often play straight away.
  if (prefs.music && visible()) {
    try {
      ensureContext();
      ctx.resume().then(() => {
        if (ctx.state === 'running' && prefs.music && visible()) startMusic();
      }, () => {});
    } catch {
      // Not allowed yet: the first interaction starts it.
    }
  }

  // Only plays while the visitor is on the tab: hidden = paused, back = resumes.
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.visibilityState === 'hidden') {
      stopMusic();
      ctx.suspend().catch(() => {});
    } else if (prefs.music || prefs.effects) {
      ctx.resume().then(() => {
        if (prefs.music && ctx.state === 'running') startMusic();
      }, () => {});
    }
  });
}

// --- Building blocks ---
function tone({ freq, to, type = 'square', at = 0, dur = 0.2, vol = 0.08, out = master }) {
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise({ at = 0, dur = 0.3, vol = 0.15, cutoff = 1200 }) {
  const t = ctx.currentTime + at;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const gain = ctx.createGain();
  gain.gain.value = vol;
  src.connect(filter).connect(gain).connect(master);
  src.start(t);
}

const effectsOn = () => prefs.effects && ctx && ctx.state === 'running';

// --- Effects, timed to the GSAP animations they accompany ---
export const sfx = {
  // Every button and link press.
  click() {
    if (!effectsOn()) return;
    tone({ freq: 1400, to: 900, dur: 0.05, vol: 0.035 });
  },
  // A new king lands: the stamp thud matches the billboard drop animation.
  takeover() {
    if (!effectsOn()) return;
    tone({ freq: 140, to: 45, type: 'sine', dur: 0.25, vol: 0.5 });
    noise({ dur: 0.12, vol: 0.12, cutoff: 600 });
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone({ freq: f, at: 0.18 + i * 0.09, dur: 0.22, vol: 0.06 }));
  },
  // The old king falls: crash + falling slide.
  dethrone() {
    if (!effectsOn()) return;
    noise({ dur: 0.45, vol: 0.18, cutoff: 2500 });
    tone({ freq: 440, to: 70, type: 'triangle', dur: 0.6, vol: 0.12 });
  },
  // King of the Day: a full brass-like chord with a bell on top.
  crowned() {
    if (!effectsOn()) return;
    [261.63, 329.63, 392.0].forEach((f) => tone({ freq: f, type: 'sawtooth', dur: 1.1, vol: 0.05 }));
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone({ freq: f, at: 0.1 + i * 0.1, dur: 0.35, vol: 0.06 }));
    tone({ freq: 2093, type: 'sine', at: 0.7, dur: 1.2, vol: 0.05 });
  },
  // A board booking goes live: two-note chime.
  booked() {
    if (!effectsOn()) return;
    tone({ freq: 880, type: 'sine', dur: 0.3, vol: 0.08 });
    tone({ freq: 1318.5, type: 'sine', at: 0.12, dur: 0.45, vol: 0.08 });
  },
  // A king retires at the end of his term: soft falling bells.
  retired() {
    if (!effectsOn()) return;
    [784, 659.25, 523.25].forEach((f, i) => tone({ freq: f, type: 'sine', at: i * 0.18, dur: 0.6, vol: 0.06 }));
  },
};

function speak(text) {
  if (!prefs.effects || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.05;
  setTimeout(() => window.speechSynthesis.speak(utterance), 600);
}

// Reads the (already moderated) name and tagline aloud on every screen.
export function announceTakeover({ throne, previousName }, price) {
  if (previousName) sfx.dethrone();
  setTimeout(() => sfx.takeover(), previousName ? 250 : 0);
  speak(`${previousName ? `${throne.name} just knocked ${previousName} off the throne for ${price}.` : `${throne.name} claimed the throne for ${price}.`} ${throne.tagline || ''}`);
}

export function announceCrowned(name) {
  sfx.crowned();
  speak(`All hail ${name}, King of the Day!`);
}

// --- Background music: Lagos grooves, synthesized live ---
// A 16-step sequencer that rotates three Nigerian-flavoured grooves every 16
// bars: amapiano (log drum), afrobeats (syncopated kick + talking drum) and
// highlife (plucked guitar). One minor progression throughout, so the changes
// feel like one DJ set. Nothing is downloaded and there's nothing to license.
const A3 = 220;
const hz = (semi) => A3 * 2 ** (semi / 12);
// Am9 - Dm9 - Fmaj7 - E7sus (semitones from A3).
const CHORDS = [
  [0, 3, 7, 10, 14],
  [5, 8, 12, 15, 19],
  [-4, 0, 3, 7, 12],
  [-5, 0, 2, 5, 10],
];
const ROOTS = [-24, -19, -28, -29];

let noiseBuf = null;
function noiseBuffer() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

let driveCurve = null;
function drive() {
  if (!driveCurve) {
    driveCurve = new Float32Array(256);
    for (let i = 0; i < 256; i++) driveCurve[i] = Math.tanh((i / 128 - 1) * 2.2);
  }
  return driveCurve;
}

function env(gain, t, peak, attack, release) {
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
}

const inst = {
  kick(t, vol = 0.9) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(125, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    env(g, t, vol, 0.004, 0.28);
    o.connect(g).connect(musicGain);
    o.start(t);
    o.stop(t + 0.35);
  },
  // The amapiano log drum: a pitched, gliding, slightly overdriven bass hit.
  logDrum(t, semi, len = 0.35) {
    const o = ctx.createOscillator();
    const shaper = ctx.createWaveShaper();
    shaper.curve = drive();
    const g = ctx.createGain();
    const f = hz(semi);
    o.frequency.setValueAtTime(f * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    env(g, t, 0.55, 0.006, len);
    o.connect(shaper).connect(g).connect(musicGain);
    o.start(t);
    o.stop(t + len + 0.05);
  },
  bass(t, semi, len) {
    const o = ctx.createOscillator();
    const lp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = hz(semi);
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    env(g, t, 0.5, 0.01, len);
    o.connect(lp).connect(g).connect(musicGain);
    o.start(t);
    o.stop(t + len + 0.05);
  },
  noiseHit(t, { vol, type, freq, q = 1, len }) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    env(g, t, vol, 0.002, len);
    src.connect(f).connect(g).connect(musicGain);
    src.start(t);
    src.stop(t + len + 0.02);
  },
  shaker(t, vol = 0.05) {
    inst.noiseHit(t, { vol, type: 'highpass', freq: 7000, len: 0.045 });
  },
  clap(t) {
    [0, 0.012, 0.024].forEach((d) => inst.noiseHit(t + d, { vol: 0.22, type: 'bandpass', freq: 1600, q: 1.2, len: 0.09 }));
  },
  // Electric-piano chord: sine carriers with a bell-like FM modulator.
  keys(t, chord, len, vol = 0.035) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    const g = ctx.createGain();
    env(g, t, vol, 0.02, len);
    lp.connect(g).connect(musicGain);
    for (const semi of chord) {
      const carrier = ctx.createOscillator();
      const mod = ctx.createOscillator();
      const depth = ctx.createGain();
      carrier.frequency.value = hz(semi);
      mod.frequency.value = hz(semi) * 2;
      depth.gain.setValueAtTime(hz(semi) * 0.8, t);
      depth.gain.exponentialRampToValueAtTime(1, t + len);
      mod.connect(depth).connect(carrier.frequency);
      carrier.connect(lp);
      carrier.start(t);
      mod.start(t);
      carrier.stop(t + len + 0.05);
      mod.stop(t + len + 0.05);
    }
  },
  pluck(t, semi, vol = 0.06) {
    const o = ctx.createOscillator();
    const lp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.value = hz(semi);
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(400, t + 0.25);
    env(g, t, vol, 0.003, 0.3);
    o.connect(lp).connect(g).connect(musicGain);
    o.start(t);
    o.stop(t + 0.35);
  },
  // Talking drum: a hit whose pitch bends like speech.
  talkingDrum(t, up) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(up ? 180 : 260, t);
    o.frequency.exponentialRampToValueAtTime(up ? 270 : 170, t + 0.14);
    env(g, t, 0.18, 0.004, 0.18);
    o.connect(g).connect(musicGain);
    o.start(t);
    o.stop(t + 0.25);
  },
};

const LOG_A = { 3: 0, 6: 0, 10: 7, 11: 0, 14: 12 };
const LOG_B = { 3: 0, 6: 0, 9: 7, 12: 0, 14: 10 };
const AFRO_BASS = { 0: [0, 3], 3: [0, 2], 6: [7, 2], 8: [12, 2], 11: [10, 2], 14: [7, 2] };
const HIGHLIFE_PICKS = [3, null, 2, 1, null, 2, 3, null, 1, null, 2, 3, null, 1, 2, null];
const HIGHLIFE_BASS = { 0: [0, 4], 4: [4, 2], 6: [7, 2], 8: [12, 3], 12: [7, 2], 14: [4, 2] };

const GROOVES = [
  {
    name: 'amapiano',
    bpm: 112,
    play(t, s, bar, step) {
      const chord = CHORDS[bar % 4];
      const root = ROOTS[bar % 4];
      if (s % 4 === 0) inst.kick(t, 0.75);
      if (s === 4 || s === 12) inst.clap(t);
      inst.shaker(t, s % 2 ? 0.03 : 0.055);
      // The off-beat log-drum bounce that defines the style.
      const log = (bar % 2 ? LOG_B : LOG_A)[s];
      if (log !== undefined) inst.logDrum(t, root + 12 + log, step * 2.5);
      if (s === 0) inst.keys(t, chord, step * 7);
      if (s === 10) inst.keys(t, chord.map((n) => n + 12), step * 3, 0.025);
    },
  },
  {
    name: 'afrobeats',
    bpm: 104,
    play(t, s, bar, step) {
      const chord = CHORDS[bar % 4];
      const root = ROOTS[bar % 4];
      if (s === 0 || s === 7 || s === 10 || (s === 14 && bar % 2)) inst.kick(t);
      if (s === 4 || s === 12) inst.clap(t);
      inst.shaker(t, s % 4 === 2 ? 0.08 : s % 2 ? 0.03 : 0.05);
      const bass = AFRO_BASS[s];
      if (bass) inst.bass(t, root + bass[0], step * bass[1]);
      if (s === 0) inst.keys(t, chord, step * 8, 0.03);
      if (s === 2 || s === 5 || s === 9 || s === 13) inst.pluck(t, chord[(s >> 1) % chord.length] + 12, 0.035);
      // Talking-drum fill on the last bar of every four.
      if (bar % 4 === 3 && s >= 10 && s % 2 === 0) inst.talkingDrum(t, s % 4 === 2);
    },
  },
  {
    name: 'highlife',
    bpm: 120,
    play(t, s, bar, step) {
      const chord = CHORDS[bar % 4];
      const root = ROOTS[bar % 4];
      if (s === 0 || s === 8) inst.kick(t, 0.7);
      inst.shaker(t, s % 4 === 2 ? 0.09 : 0.03);
      // Bell / clave pattern.
      if (s === 0 || s === 3 || s === 6 || s === 10 || s === 12) inst.noiseHit(t, { vol: 0.08, type: 'bandpass', freq: 3800, q: 6, len: 0.03 });
      // Highlife guitar: a rolling arpeggio over the chord.
      const pick = HIGHLIFE_PICKS[s];
      if (pick !== null) inst.pluck(t, chord[pick] + 12);
      const bass = HIGHLIFE_BASS[s];
      if (bass) inst.bass(t, root + bass[0], step * bass[1]);
      if (s === 4 || s === 12) inst.keys(t, chord, step * 2, 0.02);
    },
  },
];
const BARS_PER_GROOVE = 16;

let musicTimer = null;
let nextStepAt = 0;
let step = 0;

function scheduleMusic() {
  while (nextStepAt < ctx.currentTime + 0.25) {
    const bar = Math.floor(step / 16);
    const groove = GROOVES[Math.floor(bar / BARS_PER_GROOVE) % GROOVES.length];
    const stepLen = 60 / groove.bpm / 4; // sixteenth notes
    groove.play(nextStepAt, step % 16, bar, stepLen);
    nextStepAt += stepLen;
    step += 1;
  }
}

function startMusic() {
  if (musicTimer || !ctx || ctx.state === 'closed') return;
  nextStepAt = ctx.currentTime + 0.1;
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.setTargetAtTime(0.16, ctx.currentTime, 1.2); // fade in, under the effects
  musicTimer = setInterval(scheduleMusic, 50);
}

function stopMusic() {
  if (!musicTimer) return;
  clearInterval(musicTimer);
  musicTimer = null;
  musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.4); // fade out
}

// Click sounds for every button and link, wherever they are.
if (typeof document !== 'undefined') {
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.target.closest?.('button, a, summary, [role="button"], label[for], input[type="radio"], input[type="checkbox"]')) sfx.click();
    },
    { capture: true },
  );
}

// Development only: lets automated tests see whether music is playing.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__throneMusic = () => ({ playing: Boolean(musicTimer), state: ctx?.state ?? 'none', on: prefs.music });
}
