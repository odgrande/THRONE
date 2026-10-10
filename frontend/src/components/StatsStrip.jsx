import { CalendarClock, Crown, Shield, Swords } from 'lucide-react';
import { formatClock, formatDuration, formatMoney } from '../lib/api.js';
import { openSeasonPriceCents } from '../lib/rules.js';

// Numbers live inside geometric badges, cycling circle / square / rotated square.
const BADGES = [
  { shape: 'rounded-full bg-bh-red text-white', inner: '' },
  { shape: 'bg-bh-blue text-white', inner: '' },
  { shape: 'rotate-45 bg-white text-ink', inner: '-rotate-45' },
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
        <Stat index={0} icon={Crown} label="Reigning for" value={throne ? formatDuration(now - start) : '—'}>
          <p className="mt-1 text-sm font-medium">{throne ? `Since ${throne.name} took it` : 'Nobody yet'}</p>
        </Stat>

        <Stat index={1} icon={Swords} label="To overthrow" value={formatMoney(minNextBidCents)}>
          <p className="mt-1 text-sm font-medium">
            {shielded && premium
              ? `Includes the +${rules.shieldPremiumPct}% shield premium`
              : throne
                ? `Beat it by ${formatMoney(rules.minIncrementCents)} or ${rules.minRaisePct}%, whichever is more`
                : 'Starting price'}
          </p>
        </Stat>

        <Stat index={2} icon={Shield} label="Shield" value={shielded ? formatClock(remaining) : throne ? 'Broken' : '—'}>
          {shielded ? (
            <>
              <div
                className="mt-3 h-4 border-2 border-ink bg-white"
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
                  ? `Then the price drops to ${formatMoney(openSeasonPriceCents(throne, rules))}`
                  : 'When it breaks, the king is crowned'}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm font-medium">{throne ? 'Cheapest it gets. Strike now.' : 'Bigger bids buy longer shields'}</p>
          )}
        </Stat>

        {/* Term limit: an unchallenged king retires and the throne reopens. */}
        <Stat index={3} icon={CalendarClock} label="Term ends in" value={termLeft !== null ? formatDuration(termLeft) : '—'}>
          <p className="mt-1 text-sm font-medium">
            {throne
              ? `Unchallenged kings retire after ${Math.round(rules.throneTermSeconds / 86400)} days`
              : `Kings serve up to ${Math.round(rules.throneTermSeconds / 86400)} days`}
          </p>
        </Stat>
      </div>
    </section>
  );
}
