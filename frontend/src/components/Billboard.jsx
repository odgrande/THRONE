import { ArrowUpRight } from 'lucide-react';
import { adValue, formatMoney, formatMoneyShort } from '../lib/api.js';
import CountUp from './CountUp.jsx';
import ReportButton from './ReportDialog.jsx';
import Shape from './Shape.jsx';
import AdMedia from './AdMedia.jsx';
import { t } from '../lib/i18n.js';

// Every king gets a frame colour of their own, so a takeover is visible at a
// glance (and on stream). Picked from the ad id: the same ad is always the
// same colour, on every screen.
const ACCENTS = [
  { name: 'red', bar: 'bg-bh-red text-white', frame: 'border-bh-red', stroke: '#D02020' },
  { name: 'blue', bar: 'bg-bh-blue text-white', frame: 'border-bh-blue', stroke: '#1040C0' },
  { name: 'yellow', bar: 'bg-bh-yellow text-ink', frame: 'border-bh-yellow', stroke: '#F0C020' },
];
export function accentFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

// The ad mounted as a real billboard, built only from Bauhaus geometry:
// triangle lamps above; catwalk, pole and semicircle base below.
function Structure({ children, lamp = 'yellow' }) {
  return (
    <div className="relative">
      <div className="flex justify-around px-[12%]" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="flex flex-col items-center">
            <span className="h-3 w-1 bg-ink" />
            <Shape kind="square" color="ink" className="h-3 w-8" />
            <Shape kind="triangle" color={lamp} className="billboard-lamp h-4 w-8 rotate-180" />
          </span>
        ))}
      </div>
      {children}
      <div aria-hidden="true">
        {/* Catwalk with running lights. */}
        <div className="mx-[4%] flex h-4 items-center justify-around border-x-4 border-b-4 border-ink bg-paper">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className={`h-1.5 w-1.5 ${i % 3 === 2 ? 'rotate-45' : ''} bg-ink`} />
          ))}
        </div>
        <div className="mx-auto h-10 w-6 border-x-4 border-ink bg-bh-blue sm:h-14" />
        <div className="mx-auto h-12 w-24 rounded-t-full border-4 border-b-0 border-ink bg-bh-red sm:h-16 sm:w-32" />
        <div className="h-1 bg-ink" />
      </div>
    </div>
  );
}

function EmptyThrone() {
  return (
    <section className="card relative flex aspect-video flex-col items-center justify-center overflow-hidden bg-bh-yellow p-6 text-center">
      <Shape kind="circle" color="red" className="absolute -left-10 -top-10 h-40 w-40 border-4 border-ink" />
      <Shape kind="square" color="blue" className="absolute -bottom-8 -right-8 h-32 w-32 rotate-45 border-4 border-ink" />
      <p className="display relative text-4xl sm:text-6xl">
        {t('empty.title1')}
        <br />
        {t('empty.title2')}
      </p>
      <p className="label relative mt-4">{t('empty.sub')}</p>
    </section>
  );
}

// Shown in place of an ad that was taken down. The holder keeps the slot until
// outbid, but none of their content is shown.
function RemovedFace() {
  return (
    <div className="dot-grid-ink flex h-full flex-col items-center justify-center gap-3 bg-muted p-8 text-center">
      <Shape kind="square" color="red" className="h-10 w-10 rotate-45 border-4 border-ink" />
      <p className="display text-3xl sm:text-5xl">Ad removed</p>
      <p className="max-w-md font-medium">This ad broke the rules and was taken down. The throne is still up for grabs.</p>
    </div>
  );
}

function AdFace({ throne }) {
  if (throne.removed) return <RemovedFace />;
  return (
    <>
      {throne.imageUrl || throne.videoUrl ? (
        // Paid ads stay in full color; grayscale is reserved for the fallen in the archive.
        <AdMedia ad={throne} />
      ) : (
        <div className="relative flex h-full items-center justify-center overflow-hidden bg-bh-red p-8">
          {/* Solid primaries only: translucent shapes on red would mix into off-palette hues. */}
          <Shape kind="circle" color="yellow" className="absolute -right-16 -top-16 h-40 w-40 border-4 border-ink" />
          <Shape kind="square" color="blue" className="absolute -bottom-14 -left-14 h-32 w-32 rotate-45 border-4 border-ink" />
          <p className="display relative text-center text-3xl text-white sm:text-5xl lg:text-6xl">{throne.tagline || throne.name}</p>
        </div>
      )}
      {throne.imageUrl && throne.tagline && (
        <p className="absolute inset-x-0 bottom-0 border-t-2 border-ink bg-paper px-4 py-3 text-lg font-bold uppercase tracking-tight sm:text-2xl">
          {throne.tagline}
        </p>
      )}
    </>
  );
}

// Circular shield countdown: the ring drains as the shield runs out.
function ShieldRing({ throne, now, accent }) {
  const start = Date.parse(throne.startedAt);
  const end = Date.parse(throne.shieldEndsAt);
  const left = Math.max(0, end - now);
  const frac = end > start ? left / (end - start) : 0;
  const r = 20;
  const c = 2 * Math.PI * r;
  const label = left > 0 ? (left >= 60_000 ? `${Math.ceil(left / 60_000)}m` : `${Math.ceil(left / 1000)}s`) : 'OPEN';
  return (
    <span className="flex items-center gap-2" title={left > 0 ? 'Shield: overthrowing costs extra until it breaks' : 'Shield down: open season'}>
      <svg viewBox="0 0 50 50" className="h-12 w-12 -rotate-90" role="img" aria-label={left > 0 ? `Shield, ${label} left` : 'Shield down'}>
        <circle cx="25" cy="25" r={r} fill="white" stroke="#121212" strokeWidth="6" />
        <circle
          cx="25"
          cy="25"
          r={r}
          fill="none"
          stroke={left > 0 ? accent.stroke : '#E0E0E0'}
          strokeWidth="6"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: 'stroke-dashoffset 250ms linear' }}
        />
        <text x="25" y="25" transform="rotate(90 25 25)" textAnchor="middle" dominantBaseline="central" className="fill-onyx text-[11px] font-black">
          {label}
        </text>
      </svg>
      <span className="label hidden leading-tight sm:block">
        {left > 0 ? 'Shield' : 'Open'}
        <br />
        {left > 0 ? 'up' : 'season'}
      </span>
    </span>
  );
}

// Total pool · Highest bid · Takeovers, right under the board.
export function BillboardStats({ stats, game = false }) {
  // Ads Game: the Throne is won, not bought, so show the race instead of money.
  const cells = game
    ? [
        { label: 'Takeovers', value: <CountUp value={stats?.takeovers ?? 0} /> },
        { label: 'Advertisers', value: <CountUp value={stats?.advertisers ?? 0} /> },
        { label: 'Ads shown', value: <CountUp value={stats?.ads ?? 0} /> },
      ]
    : [
        { label: 'Total pool', value: <CountUp value={stats?.volumeCents ?? 0} format={(n) => formatMoneyShort(Math.round(n))} /> },
        { label: 'Highest bid', value: <CountUp value={stats?.recordCents ?? 0} format={(n) => formatMoney(Math.round(n))} /> },
        { label: 'Takeovers', value: <CountUp value={stats?.takeovers ?? 0} /> },
      ];
  return (
    <dl className="mt-6 grid grid-cols-3 gap-1 border-2 border-ink bg-ink lg:border-4">
      {cells.map((c) => (
        <div key={c.label} className="bg-paper px-3 py-3 text-center sm:px-4">
          <dt className="label text-[10px] text-ink/60 sm:text-xs">{c.label}</dt>
          <dd className="mt-1 text-xl font-black tracking-tighter sm:text-3xl">{c.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// practice: no outbound link (practice ads are not real).
export default function Billboard({ throne, now = Date.now(), practice = false }) {
  const accent = throne ? accentFor(throne.id) : ACCENTS[2];

  // Every new king drops in like a stamp and the lamps flash: CSS animations
  // (index.css) that replay because the card is re-mounted per king
  // (key={throne.id}). A CSS entrance can never leave the ad invisible.

  if (!throne) {
    return (
      <div>
        <Structure>
          <EmptyThrone />
        </Structure>
      </div>
    );
  }

  const faceClass = 'group relative block aspect-video overflow-hidden bg-onyx';

  return (
    <div>
      <Structure lamp={accent.name}>
        <section key={throne.id} className="billboard-card billboard-drop card">
          <div className={`flex items-center justify-between gap-3 border-b-2 border-ink px-4 py-2 lg:border-b-4 ${accent.bar}`}>
            <span className="label flex items-center gap-2">
              <Shape kind="circle" color="ink" className="h-2.5 w-2.5 animate-pulse" />
              Now reigning
            </span>
            {practice || throne.removed ? (
              <span className="label opacity-80">{practice ? 'Practice ad' : 'Removed'}</span>
            ) : (
              <span className="flex items-center gap-4">
                <span className="label hidden opacity-80 sm:inline">Paid ad</span>
                <ReportButton bidId={throne.id} adName={throne.name} className="opacity-80 hover:opacity-100" />
              </span>
            )}
          </div>

          {practice || throne.removed ? (
            <div className={faceClass}>
              <AdFace throne={throne} />
            </div>
          ) : (
            <a
              href={`/go/${throne.id}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Visit ${throne.name}'s ad (opens a safety check first)`}
              className={`${faceClass} focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-bh-yellow`}
            >
              <AdFace throne={throne} />
              <span className="btn-yellow btn-sm absolute right-3 top-3 transition duration-200 group-hover:-translate-y-0.5">
                Visit <ArrowUpRight className="h-4 w-4" strokeWidth={3} />
              </span>
            </a>
          )}
          {/* The king's frame colour, drawn over the face edge. */}
          <div aria-hidden="true" className={`pointer-events-none -mt-[6px] h-[6px] border-t-[6px] ${accent.frame}`} />

          <div className="flex flex-wrap items-stretch justify-between border-t-2 border-ink lg:border-t-4">
            {/* Phones: the name gets its own row; ring and price share the next. */}
            <div className="flex min-w-0 flex-1 basis-full items-center gap-3 border-b-2 border-ink px-4 py-3 sm:basis-auto sm:border-b-0">
              <Shape kind="square" color={accent.name} className="h-4 w-4 shrink-0 rotate-45 border-2 border-ink" />
              <div className="min-w-0">
                <p className="truncate text-xl font-black uppercase tracking-tight sm:text-2xl">{throne.name}</p>
                {!practice && (
                  <p className="text-[11px] font-bold uppercase tracking-wider text-ink/60 tabular-nums">
                    {t('perf.line', { reach: (throne.views ?? 0).toLocaleString(), clicks: (throne.clicks ?? 0).toLocaleString() })}
                  </p>
                )}
              </div>
            </div>
            {!practice && throne.shieldEndsAt && (
              <div className="flex items-center border-ink px-3 sm:border-l-2 lg:border-l-4">
                <ShieldRing throne={throne} now={now} accent={accent} />
              </div>
            )}
            <div className="flex flex-1 items-center justify-end gap-3 border-l-2 border-ink bg-bh-yellow px-5 py-3 sm:flex-none lg:border-l-4">
              <span className="label">{throne.scoreMs != null ? 'Time' : 'Paid'}</span>
              <span className="text-2xl font-black tabular-nums sm:text-3xl">{adValue(throne)}</span>
            </div>
          </div>
        </section>
      </Structure>
    </div>
  );
}
