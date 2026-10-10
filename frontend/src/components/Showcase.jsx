import { useRef } from 'react';
import { SHOWCASE } from '../data/showcase.js';
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
    <li aria-hidden={duplicate || undefined} className="flex w-64 shrink-0 items-center gap-3 border-2 border-ink bg-white px-4 py-3 shadow-hard-xs">
      <BrandMark brand={brand} />
      <span className="min-w-0">
        <span className="block truncate font-black uppercase tracking-tight">{brand.name}</span>
        <span className="label block text-ink/50">{brand.category}</span>
      </span>
    </li>
  );
}

// "Businesses we've helped": live numbers from the database plus a logo wall.
export default function Showcase({ stats }) {
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
          <div className="showcase-stat flex items-end justify-between gap-4 bg-white p-6">
            <div>
              <p className="label text-ink/60">Businesses advertised</p>
              <p className="mt-2 text-6xl font-black tracking-tighter lg:text-7xl">
                <CountUp value={stats?.advertisers ?? 0} />
              </p>
            </div>
            <Shape kind="circle" color="red" className="mb-2 h-10 w-10 border-2 border-ink" />
          </div>
          <div className="showcase-stat flex items-end justify-between gap-4 bg-white p-6">
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
      </div>

      <div className="border-t-4 border-ink bg-canvas py-6">
        {isExample && (
          <p className="mx-auto mb-4 max-w-7xl px-4 sm:px-6 lg:px-8">
            <span className="label border-2 border-ink bg-white px-2 py-1">Example brands · design preview</span>
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
