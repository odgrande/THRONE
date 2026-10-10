import { Crown, Timer } from 'lucide-react';
import { formatClock, formatMoney } from '../lib/api.js';
import Shape from './Shape.jsx';

// King of the Day: whoever holds the throne when this clock hits zero is
// crowned. Takeovers in the final window push the clock out (overtime).
export default function CrownBand({ crown, rules, now }) {
  if (!crown?.round) return null;
  const { round, lastKing } = crown;
  const remaining = Date.parse(round.endsAt) - now;
  const overtime = Date.parse(round.endsAt) > Date.parse(round.baseEndsAt);
  const finalWindow = remaining <= rules.crownOvertimeWindowSeconds * 1000;
  const urgent = finalWindow || overtime;

  return (
    <section
      className={`relative overflow-hidden border-b-4 border-ink ${urgent ? 'bg-bh-red' : 'bg-onyx'} text-white`}
      aria-label="King of the Day countdown"
    >
      <Shape kind="circle" color="yellow" className="absolute -left-10 -top-10 hidden h-28 w-28 border-4 border-ink sm:block" />
      <div className="relative mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="flex items-center gap-4 sm:pl-16">
          <span className="flex h-12 w-12 shrink-0 rotate-45 items-center justify-center border-2 border-white bg-bh-yellow text-ink">
            <Crown className="h-6 w-6 -rotate-45" strokeWidth={2.5} />
          </span>
          <div>
            <p className="label text-bh-yellow">{overtime ? 'Overtime!' : finalWindow ? 'Final seconds' : 'King of the Day'}</p>
            <p className="text-lg font-bold leading-tight sm:text-xl">
              {urgent
                ? `Every takeover now adds ${rules.crownExtensionSeconds}s. Hold on.`
                : 'Hold the throne when the clock hits zero to be crowned.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <p className={`flex items-center gap-3 font-black tabular-nums tracking-tighter ${urgent ? 'animate-pulse' : ''}`} aria-live="off">
            <Timer className="h-7 w-7" strokeWidth={2.5} />
            <span className="text-4xl sm:text-5xl">{formatClock(remaining)}</span>
          </p>
          {lastKing && (
            <p className="text-sm">
              <span className="label block text-white/60">Last King of the Day</span>
              <span className="font-bold">
                {lastKing.name} · {formatMoney(lastKing.amountCents)}
              </span>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
