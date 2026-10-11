import { useEffect, useState } from 'react';
import { Music } from 'lucide-react';
import { onSoundPrefs, setSoundPrefs, soundPrefs } from '../lib/sound.js';

// Phones: the header has no room for the sound controls, so the music
// on/off switch floats bottom-right, one tap away. (Desktop has it in the header.)
export default function MusicButton() {
  const [prefs, setPrefs] = useState(soundPrefs);
  useEffect(() => onSoundPrefs(setPrefs), []);
  const on = prefs.music;
  return (
    <button
      type="button"
      onClick={() => setSoundPrefs({ music: !on })}
      aria-pressed={on}
      aria-label={on ? 'Turn music off' : 'Turn music on'}
      className={`fixed bottom-4 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full border-2 border-ink shadow-hard-sm transition duration-200 active:translate-y-0.5 md:hidden ${
        on ? 'bg-bh-yellow text-ink' : 'bg-paper text-ink'
      }`}
    >
      <Music className={`h-5 w-5 ${on ? '' : 'opacity-40'}`} strokeWidth={3} />
      {!on && <span className="absolute h-0.5 w-7 rotate-45 bg-ink" aria-hidden="true" />}
    </button>
  );
}
