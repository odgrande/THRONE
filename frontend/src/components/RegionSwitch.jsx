import { useSyncExternalStore } from 'react';
import { Globe } from 'lucide-react';
import { REGIONS, activeRegion, subscribeRegion, switchRegion } from '../lib/region.js';

// Drawn, not emoji: Windows has no flag emoji and would show "NG".
function Mark({ id }) {
  if (id === 'ng') {
    return (
      <svg viewBox="0 0 3 2" className="h-3 w-[18px] border border-ink" aria-hidden="true">
        <rect width="3" height="2" fill="#008751" />
        <rect x="1" width="1" height="2" fill="#fff" />
      </svg>
    );
  }
  return <Globe className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />;
}

// Global $ / Nigeria ₦. Each is its own throne; switching reloads the page.
export default function RegionSwitch() {
  const current = useSyncExternalStore(subscribeRegion, activeRegion);
  return (
    <div role="group" aria-label="Edition" className="flex border-2 border-ink bg-paper shadow-hard-xs">
      {Object.values(REGIONS).map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => r.id !== current && switchRegion(r.id)}
          aria-pressed={r.id === current}
          title={`${r.name} throne (${r.currency})`}
          aria-label={`${r.name} edition, prices in ${r.currency}`}
          className={`flex items-center gap-1.5 px-2 py-1.5 text-xs font-black uppercase tracking-wider transition duration-200 ${
            r.id === current ? 'bg-bh-yellow text-ink' : 'hover:bg-bh-cream'
          }`}
        >
          <Mark id={r.id} />
          <span>{r.code}</span>
          <span className="hidden sm:inline">{r.symbol}</span>
        </button>
      ))}
    </div>
  );
}
