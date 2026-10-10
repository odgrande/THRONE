import { formatMoney } from '../lib/api.js';
import Shape from './Shape.jsx';

export default function HowItWorks({ rules }) {
  const steps = [
    { title: 'Drop your ad', body: 'Upload or paste an image, add a tagline and a link. No account, no approval queue.' },
    { title: 'Pay in one tap', body: 'Apple Pay or Google Pay. AI screens your ad first, so if it is blocked you are never charged.' },
    {
      title: 'Raise your shield',
      body: `Every bid buys a shield: ${rules.shieldBaseSeconds}s, plus more for every extra dollar. Shielded kings cost +${rules.shieldPremiumPct}% to topple.`,
    },
    {
      title: 'Fall with honor',
      body: `Knocked off? ${rules.dividendPct}% of the new bid lands in your Throne Credits for the comeback, and you are archived forever.`,
    },
    {
      title: 'Rule the day',
      body: `Hold the throne when the daily clock hits zero to be crowned King of the Day. Late takeovers add ${rules.crownExtensionSeconds}s of overtime.`,
    },
  ];

  return (
    <section className="relative overflow-hidden border-b-4 border-ink bg-bh-red text-white">
      <Shape kind="circle" color="yellow" className="absolute -right-24 -top-24 h-72 w-72 border-4 border-ink" />
      <Shape kind="square" color="blue" className="absolute -bottom-20 -right-12 hidden h-40 w-40 rotate-45 border-4 border-ink md:block" />

      <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-24">
        <p className="label">How it works</p>
        <h2 className="display mt-3 text-4xl sm:text-6xl lg:text-7xl">
          Five moves.
          <br />
          One crown.
        </h2>
        <p className="mt-4 text-lg font-medium text-white/85">The throne starts at {formatMoney(rules.startingPriceCents)}.</p>

        <ol className="mt-12 grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-5 lg:gap-8">
          {steps.map((step, i) => (
            <li key={step.title}>
              {/* Rotated square, counter-rotated number. */}
              <span className="flex h-14 w-14 rotate-45 items-center justify-center border-4 border-ink bg-white shadow-hard-sm">
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
