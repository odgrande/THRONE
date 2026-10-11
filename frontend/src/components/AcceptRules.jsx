import { ShieldCheck } from 'lucide-react';
import { t } from '../lib/i18n.js';
import { activeRegion } from '../lib/region.js';

// The rules version a buyer accepts, from the live state (getState rules).
let version = null;
export const setTermsVersion = (v) => {
  version = v ?? version;
};
export const termsVersion = () => version;

// What the buyer is getting into, in plain words, plus a required checkbox.
// The server refuses any ad without acceptance of the current version and
// saves the version and time with the ad.
// kind: 'throne' | 'booking' | 'relegation' | 'game' (the player's ad card)
export default function AcceptRules({ kind, checked, onChange, idPrefix = 'rules' }) {
  const points = [
    t('rules.accept.age'),
    t('rules.accept.policy'),
    ...(kind === 'game' ? [t('rules.accept.game'), t('rules.accept.fair')] : [kind === 'throne' ? t('rules.accept.throne') : t('rules.accept.booking')]),
    activeRegion() === 'ng' ? t('rules.accept.reviewNg') : t('rules.accept.reviewVideo'),
    t('rules.accept.results'),
    t('rules.accept.removal'),
  ];
  return (
    <div className="border-2 border-ink bg-paper">
      <p className="label flex items-center gap-1.5 border-b-2 border-ink bg-bh-yellow px-3 py-2 text-ink">
        <ShieldCheck className="h-4 w-4" strokeWidth={3} /> {t('rules.accept.title')}
      </p>
      <p className="border-b-2 border-ink bg-bh-red px-3 py-2 text-xs font-black uppercase tracking-wide text-white">{kind === 'game' ? t('rules.accept.gameBanner') : t('rules.accept.nonRefundable')}</p>
      <ul className="space-y-1 px-3 py-2.5 text-xs font-medium leading-snug">
        {points.map((p) => (
          <li key={p} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rotate-45 bg-ink" aria-hidden="true" />
            {p}
          </li>
        ))}
      </ul>
      <label htmlFor={`${idPrefix}-accept`} className="flex cursor-pointer items-start gap-2.5 border-t-2 border-ink px-3 py-2.5 text-sm font-bold">
        <input
          id={`${idPrefix}-accept`}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          required
          className="mt-0.5 h-5 w-5 shrink-0 accent-bh-red"
        />
        <span>
          {t('rules.accept.check')}{' '}
          <a href="/legal#terms" target="_blank" rel="noopener" className="underline hover:text-bh-red">
            {t('legal.terms')}
          </a>{' '}
          {t('legal.and')}{' '}
          <a href="/legal#ad-policy" target="_blank" rel="noopener" className="underline hover:text-bh-red">
            {t('legal.policy')}
          </a>
          .
        </span>
      </label>
      <p className="border-t-2 border-ink px-3 py-1.5 text-[10px] text-ink/60">{t('rules.accept.recorded')}</p>
    </div>
  );
}
