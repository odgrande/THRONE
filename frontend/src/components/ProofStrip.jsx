import { BarChart3 } from 'lucide-react';
import { t } from '../lib/i18n.js';

// Real numbers from this edition, shown before anyone pays: who visits, how
// many clicks ads get, and what a throne ad typically reaches. Hidden until
// there is traffic to report (we never show made-up numbers).
export default function ProofStrip({ performance, compact = false }) {
  if (!performance || !performance.visitors7d) return null;
  const n = (x) => Number(x ?? 0).toLocaleString();
  return (
    <div className={`border-2 border-ink bg-bh-cream ${compact ? 'p-2.5' : 'p-3'}`}>
      <p className="label mb-1.5 flex items-center gap-1.5 text-bh-blue">
        <BarChart3 className="h-3.5 w-3.5" strokeWidth={3} /> {t('proof.title')}
      </p>
      <ul className="space-y-0.5 text-xs font-medium leading-snug">
        <li>
          <span className="font-black tabular-nums">{n(performance.visitors7d)}</span> {t('proof.visitors')}
        </li>
        <li>
          <span className="font-black tabular-nums">{n(performance.clicks7d)}</span> {t('proof.clicks', { ads: n(performance.ads7d) })}
        </li>
        {performance.avgThroneReach > 0 && (
          <li>
            {t('proof.throne', { reach: n(performance.avgThroneReach), clicks: n(performance.avgThroneClicks) })}
          </li>
        )}
      </ul>
      <p className="mt-1.5 text-[10px] text-ink/60">{t('proof.note')}</p>
    </div>
  );
}
