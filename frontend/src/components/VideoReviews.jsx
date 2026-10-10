import { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, Loader2, X } from 'lucide-react';
import { api, formatMoney } from '../lib/api.js';
import Shape from './Shape.jsx';

const timeFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const ago = (iso) => {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return mins < 60 ? `${mins} min ago` : `${Math.floor(mins / 60)} h ${mins % 60} min ago`;
};

// Paid video ads wait here. Watch the whole video: approve puts it live (a
// throne bid that was outbid meanwhile is refunded instead); reject refunds
// the buyer in full and deletes the file. Unreviewed after 24 h = refunded.
function ReviewCard({ item, token, onDone }) {
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);

  const act = async (action, body) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.adminAction(token, item.id, action, body);
      onDone(item.id, res.status);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <article className="card p-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_1fr]">
        <video src={item.videoUrl} poster={item.imageUrl ?? undefined} controls playsInline className="aspect-video w-full border-2 border-ink bg-onyx" />
        <div className="min-w-0 space-y-2">
          <p className="label text-bh-red">
            {item.boardName} · {item.region === 'ng' ? 'Nigeria' : 'Global'} · waiting {ago(item.reviewSince)}
          </p>
          <p className="truncate text-2xl font-black uppercase tracking-tight">{item.name}</p>
          {item.tagline && <p className="font-medium text-ink/80">{item.tagline}</p>}
          <a href={item.targetUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-1 break-all text-sm font-bold text-bh-blue underline">
            {item.targetUrl} <ExternalLink className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
          </a>
          <p className="text-sm text-ink/70">
            Paid {formatMoney(item.amountCents + item.addonCents, item.region)} (incl. {formatMoney(item.addonCents, item.region)} add-ons)
            {item.days ? ` · ${item.days} day(s)` : ''} · {timeFmt.format(new Date(item.reviewSince))}
          </p>
          <p className="text-xs text-ink/60">Watch it to the end. Check for nudity, violence, hate, scams, misleading claims and other people's brands.</p>

          {rejecting ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                act('reject', { reason: reason.trim() });
              }}
              className="space-y-2 border-2 border-ink bg-bh-cream p-3"
            >
              <label className="block">
                <span className="label mb-1 block">Why? (kept in the admin log)</span>
                <input className="field" value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={200} required autoFocus />
              </label>
              <div className="flex gap-2">
                <button type="submit" disabled={busy} className="btn-red btn-sm">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={3} /> : 'Reject + refund'}
                </button>
                <button type="button" onClick={() => setRejecting(false)} className="btn-outline btn-sm">
                  Back
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2 pt-2">
              <button type="button" disabled={busy} onClick={() => act('approve')} className="btn-blue btn-sm">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={3} /> : <Check className="h-4 w-4" strokeWidth={3} />} Approve, go live
              </button>
              <button type="button" disabled={busy} onClick={() => setRejecting(true)} className="btn-outline btn-sm">
                <X className="h-4 w-4" strokeWidth={3} /> Reject
              </button>
            </div>
          )}
          {error && <p role="alert" className="border-2 border-ink bg-bh-red px-3 py-2 text-sm font-bold text-white">{error}</p>}
        </div>
      </div>
    </article>
  );
}

const OUTCOME = {
  won: 'Approved: it is live.',
  outbid: 'Approved, but it had been outbid meanwhile: refunded in full.',
  refunded: 'Rejected and refunded.',
  void: 'Not placed: refunded.',
};

export default function VideoReviews({ token, onCount }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [log, setLog] = useState([]);

  const load = useCallback(async () => {
    try {
      const res = await api.adminReviews(token);
      setItems(res.items);
      onCount?.(res.items.length);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [token, onCount]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const done = (id, status) => {
    const item = items.find((i) => i.id === id);
    setLog((l) => [{ id, name: item?.name, text: OUTCOME[status] ?? `Status: ${status}` }, ...l].slice(0, 10));
    load();
  };

  if (!items) return <p className="label flex items-center gap-2 py-10">{error ?? <><Loader2 className="h-4 w-4 animate-spin" strokeWidth={3} /> Loading videos</>}</p>;

  return (
    <section className="mt-8 space-y-6">
      <div>
        <h2 className="display text-4xl">Video review</h2>
        <p className="mt-2 max-w-2xl font-medium text-ink/70">
          Paid video ads stay hidden until you approve them. Anything not reviewed within 24 hours is refunded automatically.
        </p>
      </div>
      {log.length > 0 && (
        <ul className="space-y-1 border-2 border-ink bg-bh-cream p-3 text-sm font-medium">
          {log.map((l) => (
            <li key={l.id}>
              <span className="font-black">{l.name}</span>: {l.text}
            </li>
          ))}
        </ul>
      )}
      {items.length === 0 ? (
        <div className="card flex items-center gap-4 p-6">
          <Shape kind="circle" color="blue" className="h-8 w-8 border-2 border-ink" />
          <p className="font-bold">No videos waiting. Nice.</p>
        </div>
      ) : (
        items.map((item) => <ReviewCard key={item.id} item={item} token={token} onDone={done} />)
      )}
    </section>
  );
}
