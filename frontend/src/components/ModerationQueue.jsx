import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { api, formatMoney } from '../lib/api.js';
import { REPORT_REASONS } from './ReportDialog.jsx';
import Shape from './Shape.jsx';

const REASON_LABEL = Object.fromEntries(REPORT_REASONS.map((r) => [r.key, r.label]));
const timeFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const BOARD_LABEL = { throne: 'The Throne', b2: 'Prince Board', b3: 'Herald Board', ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`m${i + 1}`, `Market Stall ${i + 1}`])) };

// Admin sees the unmasked ad (that's the point of reviewing it), never reporter identities.
function AdPreview({ bid }) {
  return (
    <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
      <div className="aspect-video overflow-hidden border-2 border-ink bg-onyx">
        {bid.imageUrl ? (
          <img src={bid.imageUrl} alt="" className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center bg-bh-red p-2 text-center text-sm font-black uppercase text-white">
            {bid.tagline || bid.name}
          </div>
        )}
      </div>
      <div className="min-w-0 space-y-1">
        <p className="truncate text-xl font-black uppercase tracking-tight">{bid.name}</p>
        {bid.tagline && <p className="font-medium text-ink/80">{bid.tagline}</p>}
        <a href={bid.targetUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-1 break-all text-sm font-bold text-bh-blue underline">
          {bid.targetUrl} <ExternalLink className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
        </a>
        <p className="text-sm text-ink/60">
          <span className="font-bold text-ink">{BOARD_LABEL[bid.board] ?? bid.board}</span> · Paid {formatMoney(bid.amountCents, bid.region)} ·{' '}
          {bid.settledAt ? timeFmt.format(new Date(bid.settledAt)) : '—'}
          {bid.paymentRef && <> · payment <span className="font-mono">{bid.paymentRef}</span></>}
        </p>
      </div>
    </div>
  );
}

function RemoveForm({ onSubmit, busy }) {
  const [reason, setReason] = useState('');
  const [purge, setPurge] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(reason.trim(), purge);
      }}
      className="mt-4 space-y-3 border-2 border-ink bg-bh-cream p-4"
    >
      <label className="block">
        <span className="label mb-1.5 block">Reason (kept in the admin log)</span>
        <input className="field" value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={200} required />
      </label>
      <label className="flex items-start gap-3 text-sm font-medium">
        <input type="checkbox" checked={purge} onChange={(e) => setPurge(e.target.checked)} className="mt-0.5 h-4 w-4 accent-bh-red" />
        <span>
          <span className="font-bold">Also delete the image file permanently.</span> Required for illegal content. Can't be undone:
          a restored ad comes back without its image.
        </span>
      </label>
      <button type="submit" disabled={busy} className="btn-red btn-sm">
        {busy && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={3} />} Confirm takedown
      </button>
    </form>
  );
}

function QueueItem({ item, act, busy }) {
  const [removing, setRemoving] = useState(false);
  const counts = {};
  for (const r of item.reports) counts[r.reason] = (counts[r.reason] ?? 0) + 1;
  const autoHidden = item.bid.removedBy === 'auto';
  const isBusy = busy === item.bid.id;

  return (
    <li className="card p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="border-2 border-ink bg-bh-red px-2 py-0.5 text-sm font-black text-white">
          {item.reports.length} report{item.reports.length === 1 ? '' : 's'}
        </span>
        {Object.entries(counts).map(([reason, n]) => (
          <span key={reason} className="border-2 border-ink bg-paper px-2 py-0.5 text-xs font-bold uppercase tracking-wider">
            {REASON_LABEL[reason] ?? reason} ×{n}
          </span>
        ))}
        {autoHidden && (
          <span className="border-2 border-ink bg-bh-yellow px-2 py-0.5 text-xs font-bold uppercase tracking-wider">Auto-hidden</span>
        )}
      </div>

      <AdPreview bid={item.bid} />

      {item.reports.some((r) => r.details) && (
        <ul className="mt-4 space-y-1 border-l-4 border-ink pl-4 text-sm">
          {item.reports
            .filter((r) => r.details)
            .slice(0, 5)
            .map((r) => (
              <li key={r.id}>
                <span className="font-bold">{REASON_LABEL[r.reason] ?? r.reason}:</span> {r.details}
              </li>
            ))}
        </ul>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={() => setRemoving(!removing)} className="btn-red btn-sm" disabled={isBusy}>
          {autoHidden ? 'Keep down' : 'Take down'}
        </button>
        {autoHidden ? (
          <button type="button" onClick={() => act(item.bid.id, 'restore')} className="btn-outline btn-sm" disabled={isBusy}>
            Restore (false alarm)
          </button>
        ) : (
          <button type="button" onClick={() => act(item.bid.id, 'dismiss')} className="btn-outline btn-sm" disabled={isBusy}>
            Dismiss reports
          </button>
        )}
      </div>
      {removing && <RemoveForm busy={isBusy} onSubmit={(reason, purgeMedia) => act(item.bid.id, 'remove', { reason, purgeMedia })} />}
    </li>
  );
}

export default function ModerationQueue({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await api.adminReports(token));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [token]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const act = async (bidId, action, body) => {
    setBusy(bidId);
    try {
      await api.adminAction(token, bidId, action, body);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  if (!data) {
    return (
      <p className="label flex items-center gap-2 py-16">
        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={3} /> {error ?? 'Loading reports'}
      </p>
    );
  }

  return (
    <div className="mt-10 space-y-12">
      {error && <p role="alert" className="border-2 border-ink bg-bh-red px-4 py-3 font-bold text-white">{error}</p>}

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="display text-4xl">Report queue</h2>
          <p className="text-sm text-ink/60">
            {data.autoHideThreshold > 0
              ? `Ads are auto-hidden after ${data.autoHideThreshold} reports from different people.`
              : 'Auto-hiding is off.'}
          </p>
        </div>
        {data.open.length === 0 ? (
          <div className="card mt-6 flex items-center gap-4 p-6">
            <Shape kind="circle" color="blue" className="h-8 w-8 border-2 border-ink" />
            <p className="text-lg font-bold">No open reports. All clear.</p>
          </div>
        ) : (
          <ul className="mt-6 space-y-6">
            {data.open.map((item) => (
              <QueueItem key={item.bid.id} item={item} act={act} busy={busy} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="display text-4xl">Taken down</h2>
        {data.removed.length === 0 ? (
          <p className="mt-4 font-medium text-ink/60">Nothing has been taken down.</p>
        ) : (
          <ul className="card mt-6 divide-y-2 divide-ink">
            {data.removed.map((bid) => (
              <li key={bid.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-black uppercase tracking-tight">{bid.name}</span>
                  <span className="text-sm text-ink/60">
                    {bid.removedReason} · {bid.removedBy === 'auto' ? 'auto-hidden' : 'by admin'} · {timeFmt.format(new Date(bid.removedAt))}
                  </span>
                </span>
                <button type="button" onClick={() => act(bid.id, 'restore')} disabled={busy === bid.id} className="btn-outline btn-sm">
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
