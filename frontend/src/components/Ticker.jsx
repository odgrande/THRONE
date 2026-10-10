import { formatDuration, formatMoney } from '../lib/api.js';
import Shape from './Shape.jsx';

// Square = reigning, circle = crowned (survived the shield), triangle = shield broken.
function Row({ marker, name, outcome, dividendCents, amountCents }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 lg:px-6">
      <span className="flex min-w-0 items-center gap-3">
        {marker}
        <span className="truncate font-bold uppercase tracking-tight">{name}</span>
      </span>
      <span className="flex items-center gap-4 text-sm">
        {outcome}
        {dividendCents > 0 && <span className="font-bold text-bh-blue">+{formatMoney(dividendCents)} credits</span>}
        <span className="text-lg font-black tabular-nums">{formatMoney(amountCents)}</span>
      </span>
    </li>
  );
}

export default function Ticker({ throne, legends, now }) {
  return (
    <section className="card">
      <div className="flex items-center justify-between border-b-2 border-ink px-4 py-4 lg:border-b-4 lg:px-6">
        <h2 className="text-2xl font-black uppercase tracking-tighter sm:text-3xl">Battle log</h2>
        <span className="label hidden text-ink/60 sm:inline">Latest first</span>
      </div>
      {!throne ? (
        <p className="px-6 py-10 text-center font-medium text-ink/60">No battles yet. The first king writes history.</p>
      ) : (
        <ul className="divide-y-2 divide-ink">
          <Row
            marker={<Shape kind="square" color="yellow" className="h-3.5 w-3.5 border-2 border-ink" />}
            name={throne.name}
            amountCents={throne.amountCents}
            dividendCents={0}
            outcome={<span className="label">Reigning {formatDuration(now - Date.parse(throne.startedAt))}</span>}
          />
          {legends.map((l) => (
            <Row
              key={l.id}
              marker={
                l.survivedShield ? (
                  <Shape kind="circle" color="blue" className="h-3.5 w-3.5" />
                ) : (
                  <Shape kind="triangle" color="red" className="h-3.5 w-4" />
                )
              }
              name={l.name}
              amountCents={l.amountCents}
              dividendCents={l.dividendCents}
              outcome={
                <span className="text-ink/70">
                  {l.survivedShield ? 'Crowned' : 'Shield broken'} · {formatDuration(l.reignSeconds * 1000)}
                </span>
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}
