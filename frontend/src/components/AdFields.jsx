import { ImagePlus, MapPin, X } from 'lucide-react';
import { formatMoney } from '../lib/api.js';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export const EMPTY_AD = { name: '', tagline: '', targetUrl: '', image: null, withMap: false, address: '' };

// What the map add-on adds to the charge for this ad.
export const addonFor = (ad, rules) => (ad.withMap ? rules.mapAddonCents : 0);

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="label mb-1.5 flex justify-between gap-2">
        {label}
        {hint && <span className="text-ink/50">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

// The ad itself: name, tagline, image (upload or paste) and link.
// Shared by the throne bid form and board bookings.
export default function AdFields({ ad, onChange, onError, idPrefix = 'ad', mapAddonCents }) {
  const set = (patch) => onChange({ ...ad, ...patch });

  const takeFile = async (file) => {
    onError(null);
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) return onError('Use a PNG, JPEG, GIF or WebP image.');
    if (file.size > MAX_IMAGE_BYTES) return onError('Image must be 2 MB or smaller.');
    set({ image: await readAsDataUrl(file) });
  };

  // Paste a screenshot or meme straight from the clipboard.
  const onPaste = (e) => {
    const file = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'));
    if (file) {
      e.preventDefault();
      takeFile(file);
    }
  };

  return (
    <div className="space-y-4" onPaste={onPaste}>
      <Field label="Name / brand">
        <input className="field" value={ad.name} onChange={(e) => set({ name: e.target.value })} maxLength={40} required />
      </Field>

      <Field label="Tagline" hint="Read aloud live">
        <input className="field" value={ad.tagline} onChange={(e) => set({ tagline: e.target.value })} maxLength={100} />
      </Field>

      <div>
        <span className="label mb-1.5 flex justify-between">
          Image <span className="text-ink/50">Optional</span>
        </span>
        {ad.image ? (
          <div className="relative border-2 border-ink">
            <img src={ad.image} alt="Your ad preview" className="aspect-video w-full bg-onyx object-contain" />
            <button type="button" onClick={() => set({ image: null })} aria-label="Remove image" className="btn-outline btn-sm absolute right-2 top-2">
              <X className="h-4 w-4" strokeWidth={3} />
            </button>
          </div>
        ) : (
          <label
            htmlFor={`${idPrefix}-image`}
            className="flex cursor-pointer flex-col items-center gap-2 border-2 border-dashed border-ink bg-canvas px-4 py-6 text-center transition duration-200 hover:bg-bh-cream focus-within:ring-2 focus-within:ring-ink focus-within:ring-offset-2"
          >
            <ImagePlus className="h-7 w-7" strokeWidth={2.5} />
            <span className="text-sm font-bold uppercase tracking-wider">Upload or paste an image</span>
            <span className="text-xs text-ink/60">PNG, JPEG, GIF, WebP · 2 MB max</span>
            <input id={`${idPrefix}-image`} type="file" accept={ACCEPTED.join(',')} onChange={(e) => takeFile(e.target.files[0])} className="sr-only" />
          </label>
        )}
      </div>

      <Field label="Link" hint="Where clicks go">
        <input className="field" type="url" placeholder="https://" value={ad.targetUrl} onChange={(e) => set({ targetUrl: e.target.value })} required />
      </Field>

      {mapAddonCents > 0 && (
        <div className={`border-2 border-ink ${ad.withMap ? 'bg-bh-cream' : 'bg-paper'}`}>
          <label className="flex cursor-pointer items-start gap-3 p-3">
            <input
              type="checkbox"
              checked={ad.withMap}
              onChange={(e) => set({ withMap: e.target.checked })}
              className="mt-0.5 h-5 w-5 shrink-0 accent-bh-blue"
            />
            <span className="text-sm font-medium leading-snug">
              <span className="flex items-center gap-1.5 font-bold uppercase tracking-wide">
                <MapPin className="h-4 w-4" strokeWidth={3} /> Add a business map · +{formatMoney(mapAddonCents)}
              </span>
              <span className="text-ink/70">Visitors see your address on a map with directions. Without it, your ad shows a faded map.</span>
            </span>
          </label>
          {ad.withMap && (
            <div className="border-t-2 border-ink p-3">
              <Field label="Business address">
                <input
                  className="field"
                  value={ad.address}
                  onChange={(e) => set({ address: e.target.value })}
                  minLength={5}
                  maxLength={160}
                  placeholder="e.g. 12 Admiralty Way, Lekki, Lagos"
                  autoComplete="street-address"
                  required
                />
              </Field>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
