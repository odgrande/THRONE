import { formatMoney } from '../lib/api.js';
import Shape from './Shape.jsx';
import { t } from '../lib/i18n.js';

export default function HowItWorks({ rules, boards = [], game = false }) {
  const termDays = Math.round(rules.throneTermSeconds / 86400);
  // The Court boards only; the Market stalls have their own section.
  const cheapestDay = Math.min(...boards.filter((b) => b.tier !== 'market').map((b) => b.prices[7] / 7));
  const from = Number.isFinite(cheapestDay) ? t('how.3from', { amount: formatMoney(Math.ceil(cheapestDay)) }) : '';
  const steps = game
    ? [1, 2, 3, 4, 5].map((n) => ({ title: t(`how.g${n}t`), body: t(`how.g${n}b`, { from }) }))
    : [
        { title: t('how.1t'), body: t('how.1b') },
        { title: t('how.2t'), body: t('how.2b', { pct: rules.shieldPremiumPct, days: termDays }) },
        {
          title: t('how.3t'),
          body: t('how.3b', { from: Number.isFinite(cheapestDay) ? t('how.3from', { amount: formatMoney(Math.ceil(cheapestDay)) }) : '' }),
        },
        { title: t('how.4t'), body: t('how.4b', { pct: rules.relegationDiscountPct }) },
        { title: t('how.5t'), body: t('how.5b', { s: rules.crownExtensionSeconds }) },
      ];

  return (
    <section className="relative overflow-hidden border-b-4 border-ink bg-bh-red text-white">
      <Shape kind="circle" color="yellow" className="absolute -right-24 -top-24 h-72 w-72 border-4 border-ink" />
      <Shape kind="square" color="blue" className="absolute -bottom-20 -right-12 hidden h-40 w-40 rotate-45 border-4 border-ink md:block" />

      <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-24">
        <p className="label">{t('how.kicker')}</p>
        <h2 className="display mt-3 text-4xl sm:text-6xl lg:text-7xl">
          {t('how.title1')}
          <br />
          {t('how.title2')}
        </h2>
        <p className="mt-4 text-lg font-medium text-white/85">{game ? t('how.gstart') : t('how.start', { amount: formatMoney(rules.startingPriceCents) })}</p>

        <ol className="mt-12 grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-5 lg:gap-8">
          {steps.map((step, i) => (
            <li key={step.title} className="how-step">
              {/* Rotated square, counter-rotated number. */}
              <span className="flex h-14 w-14 rotate-45 items-center justify-center border-4 border-ink bg-paper shadow-hard-sm">
                <span className="-rotate-45 text-2xl font-black text-ink">{i + 1}</span>
              </span>
              <h3 className="mt-6 text-2xl font-bold uppercase tracking-tight">{step.title}</h3>
              <p className="mt-2 font-medium leading-relaxed text-white/90">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
