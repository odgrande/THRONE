import { useEffect, useState } from 'react';
import { Music, Volume2, VolumeX } from 'lucide-react';
import { onSoundPrefs, setSoundPrefs, soundPrefs } from '../lib/sound.js';

// Two toggles: effects (+ voice announcements) and background music.
export default function SoundControls() {
  const [prefs, setPrefs] = useState(soundPrefs);
  useEffect(() => onSoundPrefs(setPrefs), []);

  return (
    <div className="flex shrink-0 gap-2">
      <button
        type="button"
        onClick={() => setSoundPrefs({ effects: !prefs.effects })}
        aria-pressed={prefs.effects}
        title="Sound effects and live announcements"
        className={`${prefs.effects ? 'btn-yellow' : 'btn-outline'} btn-sm`}
      >
        {prefs.effects ? <Volume2 className="h-4 w-4" strokeWidth={3} /> : <VolumeX className="h-4 w-4" strokeWidth={3} />}
        <span className="hidden whitespace-nowrap xl:inline">{prefs.effects ? 'Sound on' : 'Sound off'}</span>
      </button>
      <button
        type="button"
        onClick={() => setSoundPrefs({ music: !prefs.music })}
        aria-pressed={prefs.music}
        aria-label={prefs.music ? 'Turn music off' : 'Turn music on'}
        title="Background music"
        className={`${prefs.music ? 'btn-yellow' : 'btn-outline'} btn-sm`}
      >
        <Music className={`h-4 w-4 ${prefs.music ? '' : 'opacity-40'}`} strokeWidth={3} />
      </button>
    </div>
  );
}
