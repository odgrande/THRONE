import { CalendarClock, Crown, Shield, Swords } from 'lucide-react';
import { formatClock, formatDuration, formatMoney } from '../lib/api.js';
import { openSeasonPriceCents } from '../lib/rules.js';
import { t } from '../lib/i18n.js';

// Numbers live inside geometric badges, cycling circle / square / rotated square.
const BADGES = [
  { shape: 'rounded-full bg-bh-red text-white', inner: '' },
  { shape: 'bg-bh-blue text-white', inner: '' },
  { shape: 'rotate-45 bg-paper text-ink', inner: '-rotate-45' },
];

function Stat({ index, icon: Icon, label, value, children }) {
  const badge = BADGES[index % BADGES.length];
  return (
    // Cells sit on an ink background with a 4px gap, so every divider is a
    // uniform black line at 1, 2 or 3 columns with no per-cell border logic.
    <div className="bg-bh-yellow p-6 lg:p-8">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 items-center justify-center border-2 border-ink ${badge.shape}`}>
          <Icon className={`h-5 w-5 ${badge.inner}`} strokeWidth={2.5} />
        </span>
        <span className="label">{label}</span>
      </div>
      <p className="mt-4 text-4xl font-black tabular-nums tracking-tighter lg:text-5xl">{value}</p>
      {children}
    </div>
  );
}

// The time multiplier made visible (shield), plus the throne's lifetime numbers.
// `stats` is optional: practice mode passes its own.
export default function StatsStrip({ throne, minNextBidCents, stats, rules, now }) {
  const termLeft = throne?.termEndsAt ? Date.parse(throne.termEndsAt) - now : null;
  const shieldEnd = throne ? Date.parse(throne.shieldEndsAt) : 0;
  const start = throne ? Date.parse(throne.startedAt) : 0;
  const remaining = shieldEnd - now;
  const shielded = throne && remaining > 0;
  const finalSeconds = shielded && remaining <= 10_000;
  const pctLeft = shielded ? Math.max(0, 100 - ((now - start) / (shieldEnd - start)) * 100) : 0;
  const premium = throne && minNextBidCents > openSeasonPriceCents(throne, rules);

  return (
    // Yellow runs edge to edge; the grid itself is framed in ink on wide screens.
    <section className="border-b-4 border-ink bg-bh-yellow" aria-label="Throne status">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-1 bg-ink sm:grid-cols-2 lg:grid-cols-4 xl:border-x-4 xl:border-ink">
        <Stat index={0} icon={Crown} label={t('stats.reigning')} value={throne ? formatDuration(now - start) : '—'}>
          <p className="mt-1 text-sm font-medium">{throne ? t('stats.since', { name: throne.name }) : t('stats.nobody')}</p>
        </Stat>

        <Stat index={1} icon={Swords} label={t('stats.overthrow')} value={formatMoney(minNextBidCents)}>
          <p className="mt-1 text-sm font-medium">
            {shielded && premium
              ? t('stats.premium', { pct: rules.shieldPremiumPct })
              : throne
                ? t('stats.beat', { step: formatMoney(rules.minIncrementCents), pct: rules.minRaisePct })
                : t('stats.start')}
          </p>
        </Stat>

        <Stat index={2} icon={Shield} label={t('stats.shield')} value={shielded ? formatClock(remaining) : throne ? t('stats.broken') : '—'}>
          {shielded ? (
            <>
              <div
                className="mt-3 h-4 border-2 border-ink bg-paper"
                role="progressbar"
                aria-label="Shield remaining"
                aria-valuenow={Math.round(pctLeft)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={`h-full transition-[width] duration-200 ease-out ${finalSeconds ? 'animate-pulse bg-bh-red' : 'bg-bh-blue'}`}
                  style={{ width: `${pctLeft}%` }}
                />
              </div>
              <p className="mt-1 text-sm font-medium">
                {premium
                  ? t('stats.drops', { amount: formatMoney(openSeasonPriceCents(throne, rules)) })
                  : t('stats.crowned')}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm font-medium">{throne ? t('stats.strike') : t('stats.bigger')}</p>
          )}
        </Stat>

        {/* Term limit: an unchallenged king retires and the throne reopens. */}
        <Stat index={3} icon={CalendarClock} label={t('stats.term')} value={termLeft !== null ? formatDuration(termLeft) : '—'}>
          <p className="mt-1 text-sm font-medium">
            {throne
              ? t('stats.retire', { days: Math.round(rules.throneTermSeconds / 86400) })
              : t('stats.serve', { days: Math.round(rules.throneTermSeconds / 86400) })}
          </p>
        </Stat>
      </div>
    </section>
  );
}
