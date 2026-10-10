import { formatDuration, formatMoney } from '../lib/api.js';
import Shape from './Shape.jsx';

// Square = reigning, circle = survived the shield, triangle = shield broken,
// rotated square = retired at the end of the term.
function Row({ marker, name, outcome, amountCents }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 lg:px-6">
      <span className="flex min-w-0 items-center gap-3">
        {marker}
        <span className="truncate font-bold uppercase tracking-tight">{name}</span>
      </span>
      <span className="flex items-center gap-4 text-sm">
        {outcome}
        <span className="text-lg font-black tabular-nums">{formatMoney(amountCents)}</span>
      </span>
    </li>
  );
}

function legendMarker(l) {
  if (l.retired) return <Shape kind="square" color="blue" className="h-3 w-3 rotate-45" />;
  if (l.survivedShield) return <Shape kind="circle" color="blue" className="h-3.5 w-3.5" />;
  return <Shape kind="triangle" color="red" className="h-3.5 w-4" />;
}

function legendOutcome(l) {
  const held = formatDuration(l.reignSeconds * 1000);
  if (l.retired) return `Retired after full term · ${held}`;
  return `${l.survivedShield ? 'Crowned' : 'Shield broken'} · ${held}`;
}

export default function Ticker({ throne, legends, now }) {
  const empty = !throne && legends.length === 0;
  return (
    <section className="card">
      <div className="flex items-center justify-between border-b-2 border-ink px-4 py-4 lg:border-b-4 lg:px-6">
        <h2 className="text-2xl font-black uppercase tracking-tighter sm:text-3xl">Battle log</h2>
        <span className="label hidden text-ink/60 sm:inline">Latest first</span>
      </div>
      {empty ? (
        <p className="px-6 py-10 text-center font-medium text-ink/60">No battles yet. The first king writes history.</p>
      ) : (
        <ul className="divide-y-2 divide-ink">
          {throne ? (
            <Row
              marker={<Shape kind="square" color="yellow" className="h-3.5 w-3.5 border-2 border-ink" />}
              name={throne.name}
              amountCents={throne.amountCents}
              outcome={<span className="label">Reigning {formatDuration(now - Date.parse(throne.startedAt))}</span>}
            />
          ) : (
            <li className="px-4 py-3 font-bold uppercase tracking-tight text-bh-red lg:px-6">The throne is empty: claim it</li>
          )}
          {legends.map((l) => (
            <Row key={l.id} marker={legendMarker(l)} name={l.name} amountCents={l.amountCents} outcome={<span className="text-ink/70">{legendOutcome(l)}</span>} />
          ))}
        </ul>
      )}
    </section>
  );
}
