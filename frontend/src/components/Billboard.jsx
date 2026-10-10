import { ArrowUpRight } from 'lucide-react';
import { formatMoney } from '../lib/api.js';
import Shape from './Shape.jsx';

// The ad mounted as a real billboard, built only from Bauhaus geometry:
// triangle lamps above; catwalk, pole and semicircle base below.
function Structure({ children }) {
  return (
    <div className="relative">
      <div className="flex justify-around px-[12%]" aria-hidden="true">
        {['red', 'blue', 'red'].map((color, i) => (
          <span key={i} className="flex flex-col items-center">
            <span className="h-3 w-1 bg-ink" />
            <Shape kind="square" color={color} className="h-3 w-8 border-2 border-ink" />
            <Shape kind="triangle" color="yellow" className="h-4 w-8 rotate-180" />
          </span>
        ))}
      </div>
      {children}
      <div aria-hidden="true">
        {/* Catwalk with running lights. */}
        <div className="mx-[4%] flex h-4 items-center justify-around border-x-4 border-b-4 border-ink bg-white">
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
        The throne
        <br />
        is empty
      </p>
      <p className="label relative mt-4">Claim it before anyone else does</p>
    </section>
  );
}

function AdFace({ throne }) {
  return (
    <>
      {throne.imageUrl ? (
        // Paid ads stay in full color; grayscale is reserved for the fallen in the archive.
        <img src={throne.imageUrl} alt={throne.tagline || throne.name} className="h-full w-full object-contain" />
      ) : (
        <div className="relative flex h-full items-center justify-center overflow-hidden bg-bh-red p-8">
          {/* Solid primaries only: translucent shapes on red would mix into off-palette hues. */}
          <Shape kind="circle" color="yellow" className="absolute -right-16 -top-16 h-40 w-40 border-4 border-ink" />
          <Shape kind="square" color="blue" className="absolute -bottom-14 -left-14 h-32 w-32 rotate-45 border-4 border-ink" />
          <p className="display relative text-center text-3xl text-white sm:text-5xl lg:text-6xl">
            {throne.tagline || throne.name}
          </p>
        </div>
      )}
      {throne.imageUrl && throne.tagline && (
        <p className="absolute inset-x-0 bottom-0 border-t-2 border-ink bg-white px-4 py-3 text-lg font-bold uppercase tracking-tight sm:text-2xl">
          {throne.tagline}
        </p>
      )}
    </>
  );
}

// practice: no outbound link (practice ads are not real).
export default function Billboard({ throne, practice = false }) {
  if (!throne) {
    return (
      <Structure>
        <EmptyThrone />
      </Structure>
    );
  }

  const faceClass = 'group relative block aspect-video overflow-hidden bg-ink';

  return (
    <Structure>
      <section key={throne.id} className="card animate-slam">
        <div className="flex items-center justify-between gap-3 border-b-2 border-ink bg-ink px-4 py-2 text-white lg:border-b-4">
          <span className="label flex items-center gap-2">
            <Shape kind="circle" color="red" className="h-2.5 w-2.5 animate-pulse" />
            Now reigning
          </span>
          <span className="label text-white/70">{practice ? 'Practice ad' : 'Paid ad'}</span>
        </div>

        {practice ? (
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

        <div className="flex flex-wrap items-stretch justify-between border-t-2 border-ink lg:border-t-4">
          <div className="flex min-w-0 items-center gap-3 px-4 py-3">
            <Shape kind="square" color="yellow" className="h-4 w-4 rotate-45 border-2 border-ink" />
            <p className="truncate text-xl font-black uppercase tracking-tight sm:text-2xl">{throne.name}</p>
          </div>
          <div className="flex items-center gap-3 border-l-2 border-ink bg-bh-yellow px-5 py-3 lg:border-l-4">
            <span className="label">Paid</span>
            <span className="text-2xl font-black tabular-nums sm:text-3xl">{formatMoney(throne.amountCents)}</span>
          </div>
        </div>
      </section>
    </Structure>
  );
}
