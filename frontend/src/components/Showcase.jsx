import { useRef } from 'react';
import { SHOWCASE } from '../data/showcase.js';
import { formatMoney } from '../lib/api.js';
import { gsap, reducedMotion, useGSAP } from '../lib/motion.js';
// Section entrance animation is handled by the page (ScrollTrigger.batch).
import CountUp from './CountUp.jsx';
import Shape from './Shape.jsx';

// A generated Bauhaus logo: one or two overlapping primary shapes.
function BrandMark({ brand }) {
  if (brand.src) return <img src={brand.src} alt={`${brand.name} logo`} className="h-12 w-auto object-contain" />;
  const { shapes, colors } = brand.mark;
  return (
    <span className="relative h-12 w-14 shrink-0" aria-hidden="true">
      {shapes.map((s, i) => (
        <Shape
          key={i}
          kind={s}
          color={colors[i]}
          className={`absolute h-9 w-9 ${s !== 'triangle' ? 'border-2 border-ink' : ''} ${
            shapes.length === 1 ? 'left-2.5 top-1.5' : i === 0 ? 'left-0 top-0' : 'left-4 top-3'
          }`}
        />
      ))}
    </span>
  );
}

function LogoTile({ brand, duplicate }) {
  return (
    // The second copy only exists for the seamless loop: hide it from screen readers.
    <li aria-hidden={duplicate || undefined} className="flex w-64 shrink-0 items-center gap-3 border-2 border-ink bg-paper px-4 py-3 shadow-hard-xs">
      <BrandMark brand={brand} />
      <span className="min-w-0">
        <span className="block truncate font-black uppercase tracking-tight">{brand.name}</span>
        <span className="label block text-ink/50">{brand.category}</span>
      </span>
    </li>
  );
}

const RANK_SHAPES = [
  ['circle', 'red'],
  ['square', 'blue'],
  ['triangle', 'yellow'],
];

// Top advertisers by total spend, all boards. Every price is already public on
// the boards and in the archive; this just sums them per business.
function Leaderboard({ rows }) {
  if (!rows?.length) return null;
  const top = rows[0].totalCents;
  return (
    <div className="card mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-ink px-5 py-4 lg:border-b-4">
        <h3 className="text-2xl font-black uppercase tracking-tighter">Top advertisers</h3>
        <span className="label text-ink/60">Total spent on ads, all boards</span>
      </div>
      <ol className="divide-y-2 divide-ink">
        {rows.map((r, i) => (
          <li key={r.name} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 px-5 py-3">
            <span className="flex h-8 w-8 items-center justify-center">
              {i < 3 ? (
                <Shape kind={RANK_SHAPES[i][0]} color={RANK_SHAPES[i][1]} className={`h-7 w-7 ${i < 2 ? 'border-2 border-ink' : ''}`} />
              ) : (
                <span className="font-black tabular-nums text-ink/50">{i + 1}</span>
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-black uppercase tracking-tight">{r.name}</span>
              {/* Bar shows spend relative to the top advertiser. */}
              <span className="mt-1 block h-2 border border-ink bg-canvas">
                <span className="block h-full bg-bh-blue" style={{ width: `${Math.max(4, (r.totalCents / top) * 100)}%` }} />
              </span>
            </span>
            <span className="text-right">
              <span className="block text-xl font-black tabular-nums">{formatMoney(r.totalCents)}</span>
              <span className="text-xs text-ink/60">
                {r.ads} ad{r.ads === 1 ? '' : 's'}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// "Businesses we've helped": live numbers from the database plus a logo wall.
export default function Showcase({ stats, topAdvertisers }) {
  const scope = useRef(null);
  const track = useRef(null);
  const { brands, isExample } = SHOWCASE;

  // Infinite marquee: the list is rendered twice and the track slides by
  // exactly one copy, so the loop is seamless. Hover pauses it.
  useGSAP(
    () => {
      if (reducedMotion()) return;
      const width = track.current.scrollWidth / 2;
      const loop = gsap.to(track.current, { x: -width, duration: brands.length * 3.5, ease: 'none', repeat: -1 });
      const pause = () => loop.pause();
      const play = () => loop.play();
      track.current.addEventListener('mouseenter', pause);
      track.current.addEventListener('mouseleave', play);
      return () => {
        track.current?.removeEventListener('mouseenter', pause);
        track.current?.removeEventListener('mouseleave', play);
      };
    },
    { scope },
  );

  return (
    <section ref={scope} className="overflow-hidden border-b-4 border-ink bg-bh-yellow" aria-labelledby="showcase-title">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <p className="label">Ads that work</p>
        <h2 id="showcase-title" className="display mt-2 text-4xl sm:text-6xl">
          Businesses we've helped
        </h2>

        {/* Pool, record bid and takeovers live under the billboard; this
            section counts the businesses and their ads. */}
        <div className="mt-10 grid grid-cols-1 gap-1 border-4 border-ink bg-ink sm:grid-cols-2">
          <div className="showcase-stat flex items-end justify-between gap-4 bg-paper p-6">
            <div>
              <p className="label text-ink/60">Businesses advertised</p>
              <p className="mt-2 text-6xl font-black tracking-tighter lg:text-7xl">
                <CountUp value={stats?.advertisers ?? 0} />
              </p>
            </div>
            <Shape kind="circle" color="red" className="mb-2 h-10 w-10 border-2 border-ink" />
          </div>
          <div className="showcase-stat flex items-end justify-between gap-4 bg-paper p-6">
            <div>
              <p className="label text-ink/60">Ads published</p>
              <p className="mt-2 text-6xl font-black tracking-tighter lg:text-7xl">
                <CountUp value={stats?.ads ?? 0} />
              </p>
              <p className="mt-1 text-sm font-medium text-ink/60">Across the Throne and the Court</p>
            </div>
            <Shape kind="square" color="blue" className="mb-2 h-10 w-10 rotate-45 border-2 border-ink" />
          </div>
        </div>

        <Leaderboard rows={topAdvertisers} />
      </div>

      <div className="border-t-4 border-ink bg-canvas py-6">
        {isExample && (
          <p className="mx-auto mb-4 max-w-7xl px-4 sm:px-6 lg:px-8">
            <span className="label border-2 border-ink bg-paper px-2 py-1">Example brands · design preview</span>
          </p>
        )}
        <div className="overflow-hidden" aria-label={isExample ? 'Example brands' : 'Businesses that advertised with us'}>
          <ul ref={track} className="flex w-max gap-5 px-4">
            {[...brands, ...brands].map((b, i) => (
              <LogoTile key={`${b.name}-${i}`} brand={b} duplicate={i >= brands.length} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
