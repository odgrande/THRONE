import { t } from '../lib/i18n.js';

// People on the site right now, and unique visitors today. Real numbers from
// the server (see backend/src/services/realtime.js), never padded.
export default function LiveAudience({ online, visitsToday }) {
  return (
    <p className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-paper px-3 py-1.5 text-xs font-black uppercase tracking-wider" aria-live="off">
      <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bh-red opacity-60" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-bh-red" />
      </span>
      <span className="tabular-nums">{t('aud.online', { n: online.toLocaleString() })}</span>
      {visitsToday > 0 && (
        <>
          <span className="text-ink/30" aria-hidden="true">·</span>
          <span className="tabular-nums text-ink/60">{t('aud.today', { n: visitsToday.toLocaleString() })}</span>
        </>
      )}
    </p>
  );
}
