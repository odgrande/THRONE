import { useState } from 'react';
import { Film, ImagePlus, Loader2, MapPin, X } from 'lucide-react';
import { api, formatMoney } from '../lib/api.js';
import { inspectVideo } from '../lib/video.js';
import { t } from '../lib/i18n.js';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export const EMPTY_AD = { name: '', tagline: '', targetUrl: '', image: null, withMap: false, address: '', withVideo: false, video: null };

// What the map add-on adds to the charge for this ad.
export const addonFor = (ad, rules, { map = true, video = true } = {}) =>
  (map && ad.withMap ? rules.mapAddonCents : 0) + (video && ad.withVideo ? rules.videoAddonCents ?? 0 : 0);

// What the API receives: a video is uploaded first and sent as a signed token
// plus its sampled frames (for the AI pre-screen). The File itself never goes
// into the JSON.
export async function adPayload(ad) {
  const { video, withVideo, image, ...rest } = ad;
  if (!withVideo) return { ...rest, image };
  if (!video?.file) throw new Error('Choose a video, or switch back to a picture.');
  const { videoToken } = await api.uploadVideo(video.file);
  return { ...rest, image: null, withVideo: true, videoToken, videoFrames: video.frames };
}

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
export default function AdFields({ ad, onChange, onError, idPrefix = 'ad', mapAddonCents, videoAddonCents = 0 }) {
  const set = (patch) => onChange({ ...ad, ...patch });
  const [checkingVideo, setCheckingVideo] = useState(false);

  const takeVideo = async (file) => {
    onError(null);
    if (!file) return;
    setCheckingVideo(true);
    try {
      const { seconds, frames, previewUrl } = await inspectVideo(file);
      set({ withVideo: true, video: { file, seconds, frames, previewUrl } });
    } catch (err) {
      onError(err.message);
    } finally {
      setCheckingVideo(false);
    }
  };

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
      <Field label={t('ad.name')}>
        <input className="field" value={ad.name} onChange={(e) => set({ name: e.target.value })} maxLength={40} required />
      </Field>

      <Field label={t('ad.tagline')} hint={t('ad.taglineHint')}>
        <input className="field" value={ad.tagline} onChange={(e) => set({ tagline: e.target.value })} maxLength={100} />
      </Field>

      {videoAddonCents > 0 && (
        <div className="grid grid-cols-2 border-2 border-ink" role="group" aria-label={t('media.label')}>
          <button
            type="button"
            aria-pressed={!ad.withVideo}
            onClick={() => set({ withVideo: false })}
            className={`flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-black uppercase tracking-wider ${!ad.withVideo ? 'bg-bh-yellow text-ink' : 'bg-paper hover:bg-bh-cream'}`}
          >
            <ImagePlus className="h-4 w-4" strokeWidth={2.5} /> {t('media.picture')}
          </button>
          <button
            type="button"
            aria-pressed={Boolean(ad.withVideo)}
            onClick={() => set({ withVideo: true })}
            className={`flex items-center justify-center gap-1.5 border-l-2 border-ink px-2 py-2 text-xs font-black uppercase tracking-wider ${ad.withVideo ? 'bg-bh-yellow text-ink' : 'bg-paper hover:bg-bh-cream'}`}
          >
            <Film className="h-4 w-4" strokeWidth={2.5} /> {t('media.video', { amount: formatMoney(videoAddonCents) })}
          </button>
        </div>
      )}

      {ad.withVideo ? (
        <div>
          <span className="label mb-1.5 flex justify-between">
            {t('media.videoLabel')} <span className="text-ink/50">{t('media.videoLimits')}</span>
          </span>
          {ad.video ? (
            <div className="relative border-2 border-ink">
              <video src={ad.video.previewUrl} className="aspect-video w-full bg-onyx object-contain" controls muted playsInline />
              <button type="button" onClick={() => set({ video: null })} aria-label={t('media.remove')} className="btn-outline btn-sm absolute right-2 top-2">
                <X className="h-4 w-4" strokeWidth={3} />
              </button>
            </div>
          ) : (
            <label
              htmlFor={`${idPrefix}-video`}
              className="flex cursor-pointer flex-col items-center gap-2 border-2 border-dashed border-ink bg-canvas px-4 py-6 text-center transition duration-200 hover:bg-bh-cream focus-within:ring-2 focus-within:ring-ink focus-within:ring-offset-2"
            >
              {checkingVideo ? <Loader2 className="h-7 w-7 animate-spin" strokeWidth={2.5} /> : <Film className="h-7 w-7" strokeWidth={2.5} />}
              <span className="text-sm font-bold uppercase tracking-wider">{t('media.upload')}</span>
              <input id={`${idPrefix}-video`} type="file" accept="video/mp4,video/quicktime" onChange={(e) => takeVideo(e.target.files[0])} className="sr-only" />
            </label>
          )}
          <p className="mt-1.5 text-xs leading-snug text-ink/70">{t('media.review')}</p>
        </div>
      ) : (
        <div>
          <span className="label mb-1.5 flex justify-between">
            {t('ad.image')} <span className="text-ink/50">{t('ad.optional')}</span>
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
              <span className="text-sm font-bold uppercase tracking-wider">{t('ad.upload')}</span>
              <span className="text-xs text-ink/60">PNG, JPEG, GIF, WebP · 2 MB max</span>
              <input id={`${idPrefix}-image`} type="file" accept={ACCEPTED.join(',')} onChange={(e) => takeFile(e.target.files[0])} className="sr-only" />
            </label>
          )}
        </div>
      )}

      <Field label={t('ad.link')} hint={t('ad.linkHint')}>
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
                <MapPin className="h-4 w-4" strokeWidth={3} /> {t('ad.map', { amount: formatMoney(mapAddonCents) })}
              </span>
              <span className="text-ink/70">{t('ad.mapBody')}</span>
            </span>
          </label>
          {ad.withMap && (
            <div className="border-t-2 border-ink p-3">
              <Field label={t('ad.address')}>
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

// Paystack needs an email for the receipt. It goes straight to Paystack with
// the payment and is not stored by us.
export function EmailField({ value, onChange, idPrefix = 'ad' }) {
  return (
    <Field label={t('ad.email')} hint={t('ad.emailHint')}>
      <input
        id={`${idPrefix}-email`}
        className="field"
        type="email"
        autoComplete="email"
        inputMode="email"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={254}
        required
      />
    </Field>
  );
}
