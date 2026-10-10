import { useEffect, useState } from 'react';
import { Crown, Loader2 } from 'lucide-react';
import { api, formatDuration, formatMoney } from '../lib/api.js';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import Shape, { CornerMark } from '../components/Shape.jsx';

const SORTS = [
  { key: 'recent', label: 'Most recent' },
  { key: 'longest', label: 'Longest reign' },
  { key: 'priciest', label: 'Highest price' },
];

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function LegendCard({ legend, index }) {
  return (
    <article className="card group flex flex-col transition duration-200 ease-out hover:-translate-y-1">
      {/* The fallen are shown in grayscale; color returns on hover. Archived ads
          still click out through the warning page. */}
      <a
        href={`/go/${legend.bidId}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Visit ${legend.name}'s ad (opens a safety check first)`}
        className="block aspect-video overflow-hidden border-b-2 border-ink bg-ink lg:border-b-4"
      >
        {legend.imageUrl ? (
          <img
            src={legend.imageUrl}
            alt={legend.tagline || legend.name}
            loading="lazy"
            className="h-full w-full object-contain grayscale transition duration-300 ease-out group-hover:grayscale-0"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-muted p-4 transition duration-300 group-hover:bg-bh-red group-hover:text-white">
            <p className="display line-clamp-3 text-center text-2xl">{legend.tagline || legend.name}</p>
          </div>
        )}
      </a>

      <div className="relative flex flex-1 flex-col p-5">
        <CornerMark index={index} />
        <div className="flex items-start justify-between gap-3 pr-6">
          <h3 className="min-w-0 truncate text-xl font-black uppercase tracking-tight">{legend.name}</h3>
        </div>
        {legend.tagline && <p className="mt-1 line-clamp-2 font-medium leading-relaxed text-ink/70">{legend.tagline}</p>}

        <div className="mt-4 flex items-center gap-3">
          <span className="border-2 border-ink bg-bh-yellow px-3 py-1 text-2xl font-black tabular-nums">
            {formatMoney(legend.amountCents)}
          </span>
          {legend.survivedShield && (
            <span className="label flex items-center gap-1.5 text-bh-blue">
              <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-ink bg-bh-blue text-white">
                <Crown className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
              Crowned
            </span>
          )}
        </div>

        <dl className="mt-auto grid grid-cols-2 gap-y-1.5 border-t-2 border-ink pt-4 text-sm [&>dd]:text-right [&>dd]:font-bold [&>dt]:text-ink/60">
          <dt>Reigned</dt>
          <dd>{formatDuration(legend.reignSeconds * 1000)}</dd>
          <dt>Crowned</dt>
          <dd>{dateFmt.format(new Date(legend.crownedAt))}</dd>
          <dt>Toppled by</dt>
          <dd className="truncate">{legend.deposedByName}</dd>
          <dt>Clicks</dt>
          <dd>{legend.clicks.toLocaleString()}</dd>
        </dl>
      </div>
    </article>
  );
}

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

// The daily crown winners: a blue band of circular portraits.
function DayKings({ kings }) {
  return (
    <section className="dot-grid border-b-4 border-ink bg-bh-blue text-white" aria-labelledby="day-kings">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <p className="label text-bh-yellow">Crowned at the daily cutoff</p>
        <h2 id="day-kings" className="display mt-2 text-4xl sm:text-5xl">Kings of the Day</h2>
        <ol className="mt-8 flex gap-5 overflow-x-auto pb-3">
          {kings.map((k, i) => (
            <li key={k.roundId} className="card w-64 shrink-0 bg-white p-4 text-ink">
              <div className="flex items-center gap-3">
                <span className="relative h-16 w-16 shrink-0">
                  <span className="block h-16 w-16 overflow-hidden rounded-full border-4 border-ink bg-bh-yellow">
                    {k.imageUrl ? (
                      <img src={k.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover grayscale" />
                    ) : (
                      <span className="flex h-full items-center justify-center text-2xl font-black">{k.name[0]}</span>
                    )}
                  </span>
                  <span className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-ink bg-bh-yellow">
                    <Crown className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                </span>
                <div className="min-w-0">
                  <p className="label text-ink/60">{i === 0 ? 'Reigning champion' : dayFmt.format(new Date(k.crownedAt))}</p>
                  <p className="line-clamp-2 break-words text-lg font-black uppercase leading-tight tracking-tight">{k.name}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between border-t-2 border-ink pt-3 text-sm">
                <span className="font-black tabular-nums">{formatMoney(k.amountCents)}</span>
                <span className="text-ink/60">{k.takeovers} takeovers that day</span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default function KingsPage() {
  const [sort, setSort] = useState('recent');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async (nextSort, offset) => {
    setLoading(true);
    try {
      const page = await api.getLegends({ sort: nextSort, offset });
      setItems((cur) => (offset === 0 ? page.items : [...cur, ...page.items]));
      setTotal(page.total);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(sort, 0);
  }, [sort]);

  const [dayKings, setDayKings] = useState([]);
  useEffect(() => {
    api.getCrowns().then((r) => setDayKings(r.kings), () => {});
  }, []);

  return (
    <div className="min-h-screen bg-canvas">
      <Header />

      <section className="relative overflow-hidden border-b-4 border-ink bg-bh-red text-white">
        <Shape kind="circle" color="yellow" className="absolute -right-20 -top-24 h-80 w-80 border-4 border-ink" />
        <Shape kind="square" color="blue" className="absolute -bottom-20 right-48 hidden h-48 w-48 rotate-45 border-4 border-ink md:block" />
        <Shape kind="triangle" color="white" className="absolute bottom-10 right-16 hidden h-16 w-20 md:block" />
        <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-24">
          <p className="label">The archive</p>
          <h1 className="display mt-3 text-5xl sm:text-7xl lg:text-8xl">
            History
            <br />
            of kings
          </h1>
          <p className="mt-6 max-w-xl text-lg font-medium leading-relaxed text-white/90">
            Every ad that ever held the throne, kept forever.
          </p>
          <p className="mt-8 inline-flex items-baseline gap-3 border-4 border-ink bg-white px-5 py-3 text-ink shadow-hard-md">
            <span className="text-4xl font-black tabular-nums">{total.toLocaleString()}</span>
            <span className="label">kings fallen</span>
          </p>
        </div>
      </section>

      {dayKings.length > 0 && <DayKings kings={dayKings} />}

      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <h2 className="mb-6 text-3xl font-black uppercase tracking-tighter sm:text-4xl">Every fallen king</h2>
        <div className="flex flex-wrap gap-3" role="group" aria-label="Sort kings">
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              aria-pressed={sort === s.key}
              className={`${sort === s.key ? 'btn-yellow' : 'btn-outline'} btn-sm rounded-full px-4`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {error && <p role="alert" className="mt-8 border-2 border-ink bg-bh-red px-4 py-3 font-bold text-white">{error}</p>}

        {!loading && !error && items.length === 0 && (
          <div className="card mt-10 flex flex-col items-center gap-4 p-10 text-center">
            <span className="flex items-end gap-2" aria-hidden="true">
              <Shape kind="circle" color="red" className="h-8 w-8 border-2 border-ink" />
              <Shape kind="square" color="blue" className="h-8 w-8 border-2 border-ink" />
              <Shape kind="triangle" color="yellow" className="h-8 w-9" />
            </span>
            <p className="text-2xl font-black uppercase tracking-tight">No king has fallen yet</p>
            <p className="font-medium text-ink/70">History starts with the first overthrow.</p>
            <a href="/" className="btn-red mt-2">Go make history</a>
          </div>
        )}

        <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {items.map((l, i) => (
            <LegendCard key={l.id} legend={l} index={i} />
          ))}
        </div>

        {items.length < total && (
          <div className="mt-12 flex justify-center">
            <button onClick={() => load(sort, items.length)} disabled={loading} className="btn-outline">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={3} /> : null}
              Load more kings
            </button>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
