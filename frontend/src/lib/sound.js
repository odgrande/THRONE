// The sound engine. Every sound is synthesized with the Web Audio API: no audio
// files to license or download. Off by default; the visitor's choice is
// remembered. Browsers only allow audio after a user gesture, so a remembered
// "on" takes effect at the first tap or click on the page.

const PREF_KEY = 'throne.sound';
const listeners = new Set();
let prefs = { effects: false, music: false };
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
  if (prefs.music) startMusic();
  else stopMusic();
  if (!prefs.effects && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  listeners.forEach((fn) => fn(soundPrefs()));
}

// A remembered "on" needs one user gesture before audio may start.
if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    () => {
      if (prefs.effects || prefs.music) ensureContext();
      if (prefs.music) startMusic();
    },
    { once: true, capture: true },
  );
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

// --- Background music: a calm generative loop, never the same twice ---
// 96 bpm; a bass note per bar and sparse pentatonic plucks above it.
const BASS = [130.81, 98.0, 110.0, 87.31]; // C3 G2 A2 F2
const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5]; // C major pentatonic
const STEP = 60 / 96 / 2; // eighth notes
let musicTimer = null;
let nextStepAt = 0;
let step = 0;

function scheduleMusic() {
  while (nextStepAt < ctx.currentTime + 0.25) {
    const at = nextStepAt - ctx.currentTime;
    if (step % 8 === 0) tone({ freq: BASS[(step / 8) % BASS.length], type: 'sine', at, dur: STEP * 7, vol: 0.5, out: musicGain });
    if (Math.random() < 0.35) tone({ freq: PENTA[Math.floor(Math.random() * PENTA.length)], type: 'triangle', at, dur: STEP * 1.5, vol: 0.18, out: musicGain });
    nextStepAt += STEP;
    step += 1;
  }
}

function startMusic() {
  if (musicTimer || !ctx || ctx.state === 'closed') return;
  nextStepAt = ctx.currentTime + 0.1;
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.setTargetAtTime(0.09, ctx.currentTime, 1.2); // fade in
  musicTimer = setInterval(scheduleMusic, 100);
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
