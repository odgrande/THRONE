import { useState } from 'react';
import { Lock, MapPin, Navigation } from 'lucide-react';
import { formatMoney } from '../lib/api.js';
import Shape from './Shape.jsx';

// Google Maps Embed API: free with no usage limits; restrict the key to your
// domain in Google Cloud. Without a key we fall back to a directions link.
const EMBED_KEY = import.meta.env.VITE_GOOGLE_MAPS_EMBED_KEY || '';

// Official Google Maps URL scheme (no key needed): turn-by-turn directions.
export const directionsUrl = (address) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;

// A stylized Bauhaus "map": blocks, roads and a park. Used as the faded
// placeholder and as the poster behind the click-to-load button.
function MapArt({ faded }) {
  return (
    <div aria-hidden="true" className={`dot-grid-ink absolute inset-0 overflow-hidden bg-canvas ${faded ? 'opacity-40 grayscale' : ''}`}>
      <div className="absolute inset-y-0 left-[38%] w-3 bg-paper outline outline-2 outline-ink" />
      <div className="absolute inset-x-0 top-[55%] h-3 bg-paper outline outline-2 outline-ink" />
      <div className="absolute left-[8%] top-[12%] h-[30%] w-[22%] border-2 border-ink bg-muted" />
      <div className="absolute right-[10%] top-[10%] h-[34%] w-[34%] rounded-full border-2 border-ink bg-bh-yellow/70" />
      <div className="absolute bottom-[8%] left-[50%] h-[28%] w-[40%] border-2 border-ink bg-muted" />
      <Shape kind="triangle" color="blue" className="absolute bottom-[12%] left-[10%] h-8 w-10" />
    </div>
  );
}

// Full map card for an ad. Paid: address, click-to-load map, directions.
// Not paid: a faded, locked map that shows what the add-on would give.
export default function MapCard({ ad, addonCents }) {
  const [loaded, setLoaded] = useState(false);
  if (!ad) return null;

  if (!ad.address) {
    return (
      <div className="relative mt-6 h-36 overflow-hidden border-2 border-ink lg:border-4">
        <MapArt faded />
        <div className="relative flex h-full flex-col items-center justify-center gap-1.5 p-4 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-ink bg-paper">
            <Lock className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <p className="font-black uppercase tracking-tight">No map on this ad</p>
          <p className="text-xs font-medium text-ink/70">
            Advertisers can pin their business on a map for {formatMoney(addonCents)} when they bid or book.
          </p>
        </div>
      </div>
    );
  }

  const src = `https://www.google.com/maps/embed/v1/place?key=${EMBED_KEY}&q=${encodeURIComponent(ad.address)}`;
  return (
    <div className="mt-6 grid border-2 border-ink bg-paper sm:grid-cols-[1fr_1.2fr] lg:border-4">
      <div className="flex flex-col justify-between gap-3 p-4">
        <div>
          <p className="label flex items-center gap-1.5 text-bh-red">
            <MapPin className="h-4 w-4" strokeWidth={3} /> Find {ad.name}
          </p>
          <p className="mt-2 font-bold leading-snug">{ad.address}</p>
        </div>
        <a href={directionsUrl(ad.address)} target="_blank" rel="noopener noreferrer" className="btn-blue btn-sm self-start">
          <Navigation className="h-4 w-4" strokeWidth={3} /> Directions
        </a>
      </div>
      <div className="relative min-h-40 border-t-2 border-ink sm:border-l-2 sm:border-t-0 lg:border-l-4">
        {loaded && EMBED_KEY ? (
          <iframe
            title={`Map of ${ad.name}`}
            src={src}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="absolute inset-0 h-full w-full"
          />
        ) : (
          <>
            <MapArt />
            <div className="relative flex h-full min-h-40 items-center justify-center p-4">
              {EMBED_KEY ? (
                // Click to load: nothing is fetched from Google until the visitor asks.
                <button type="button" onClick={() => setLoaded(true)} className="btn-yellow btn-sm">
                  <MapPin className="h-4 w-4" strokeWidth={3} /> Show map
                </button>
              ) : (
                // No Maps key configured: an illustrated pin only; "Directions" is the one action.
                <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-ink bg-bh-red text-white shadow-hard-xs">
                  <MapPin className="h-6 w-6" strokeWidth={3} />
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
