import { useSyncExternalStore } from 'react';
import { Languages } from 'lucide-react';
import { LANGUAGES, currentLang, setLang, t } from '../lib/i18n.js';
import { activeRegion, subscribeRegion } from '../lib/region.js';

// Nigerian languages for the Naira edition. Also shown anywhere once a
// visitor has picked a language other than English, so they can switch back.
export default function LanguagePicker() {
  const region = useSyncExternalStore(subscribeRegion, activeRegion);
  if (region !== 'ng' && currentLang() === 'en') return null;
  return (
    <label className="relative flex items-center border-2 border-ink bg-paper shadow-hard-xs">
      <span className="sr-only">{t('lang.label')}</span>
      <Languages className="pointer-events-none absolute left-1.5 h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
      <select
        value={currentLang()}
        onChange={(e) => setLang(e.target.value)}
        className="cursor-pointer appearance-none bg-transparent py-1.5 pl-6 pr-2 text-xs font-black uppercase tracking-wider text-ink"
      >
        {LANGUAGES.map((l) => (
          <option key={l.id} value={l.id} title={l.name}>
            {l.code}
          </option>
        ))}
      </select>
    </label>
  );
}
