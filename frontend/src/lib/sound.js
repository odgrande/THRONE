// Twist #3: the live audio blast. Browsers block audio until the visitor
// interacts with the page, so sound is opt-in via the "Sound on" button,
// which also unlocks the AudioContext inside that click.
let ctx = null;

export function unlockAudio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
}

function fanfare() {
  if (!ctx) return;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = ctx.currentTime + i * 0.11;
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  });
}

export function announceCrowned(name) {
  fanfare();
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(`All hail ${name}, King of the Day!`);
  setTimeout(() => window.speechSynthesis.speak(utterance), 500);
}

// Reads the (already moderated) name and tagline aloud on every screen.
export function announceTakeover({ throne, previousName }, price) {
  fanfare();
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const intro = previousName
    ? `${throne.name} just knocked ${previousName} off the throne for ${price}.`
    : `${throne.name} claimed the throne for ${price}.`;
  const utterance = new SpeechSynthesisUtterance(`${intro} ${throne.tagline || ''}`);
  utterance.rate = 1.05;
  setTimeout(() => window.speechSynthesis.speak(utterance), 500);
}
