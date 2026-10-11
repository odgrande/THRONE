import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pause, Play, RotateCcw, Search } from 'lucide-react';
import { api, formatMoney } from '../lib/api.js';

const timeFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const EDITIONS = [
  { id: 'global', name: 'Global' },
  { id: 'ng', name: 'Nigeria' },
];

const ACTION_LABEL = {
  remove: 'Took down',
  restore: 'Restored',
  edit: 'Edited',
  end: 'Ended',
  refund: 'Refunded',
  pause: 'Paused new ads',
  resume: 'Resumed new ads',
  'approve-video': 'Approved video',
  'reject-video': 'Rejected video',
};

// One ad with every admin action. Each action asks for what it needs
// (a reason, a confirmation) inline; nothing happens on a single stray click.
function AdRow({ ad, token, onChanged }) {
  const [mode, setMode] = useState(null); // edit | end | remove | refund
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async (action, body) => {
    setBusy(true);
    setError(null);
    try {
      await api.adminAction(token, ad.id, action, body);
      setMode(null);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const open = (m, initial = {}) => {
    setMode(m);
    setForm(initial);
    setError(null);
  };
  const reasonField = (
    <label className="block">
      <span className="label mb-1 block">Reason (kept in the log)</span>
      <input className="field" value={form.reason ?? ''} onChange={(e) => setForm({ ...form, reason: e.target.value })} minLength={3} maxLength={200} required />
    </label>
  );

  return (
    <li className="card p-4">
      <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
        <div className="aspect-video overflow-hidden border-2 border-ink bg-onyx">
          {ad.imageUrl ? (
            <img src={ad.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center bg-bh-red p-1 text-center text-[10px] font-black uppercase text-white">{ad.tagline || ad.name}</div>
          )}
        </div>
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="truncate text-lg font-black uppercase tracking-tight">{ad.name}</span>
            {ad.live && <span className="label border-2 border-ink bg-bh-yellow px-1.5">Live</span>}
            {ad.removed && <span className="label border-2 border-ink bg-muted px-1.5">Removed</span>}
            {ad.status !== 'won' && <span className="label border-2 border-ink bg-muted px-1.5">{ad.status}</span>}
            {ad.videoUrl && <span className="label border-2 border-ink px-1.5">Video</span>}
          </p>
          <p className="text-sm text-ink/70">
            {ad.boardName} · {ad.region === 'ng' ? 'Nigeria' : 'Global'} · paid {formatMoney(ad.paidCents, ad.region)} · reach {ad.views.toLocaleString()} · clicks{' '}
            {ad.clicks.toLocaleString()}
            {ad.settledAt && <> · {timeFmt.format(new Date(ad.settledAt))}</>}
          </p>
          <p className="truncate text-xs text-ink/60">{ad.targetUrl}</p>
          {!mode && (
            <div className="flex flex-wrap gap-2 pt-2">
              <button type="button" className="btn-outline btn-sm" onClick={() => open('edit', { name: ad.name, tagline: ad.tagline ?? '', targetUrl: ad.targetUrl })}>
                Edit
              </button>
              {ad.status === 'won' && ad.live && (
                <button type="button" className="btn-outline btn-sm" onClick={() => open('end')}>
                  End now
                </button>
              )}
              {ad.removed ? (
                <button type="button" className="btn-outline btn-sm" disabled={busy} onClick={() => run('restore')}>
                  Restore
                </button>
              ) : (
                <button type="button" className="btn-outline btn-sm" onClick={() => open('remove')}>
                  Take down
                </button>
              )}
              {['won', 'review'].includes(ad.status) && (
                <button type="button" className="btn-sm border-2 border-ink bg-bh-red px-3 font-bold uppercase text-white" onClick={() => open('refund')}>
                  Refund
                </button>
              )}
            </div>
          )}
          {mode && (
            <form
              className="mt-2 space-y-2 border-2 border-ink bg-bh-cream p-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (mode === 'edit') run('edit', { name: form.name, tagline: form.tagline, targetUrl: form.targetUrl });
                if (mode === 'end') run('end', { reason: form.reason });
                if (mode === 'remove') run('remove', { reason: form.reason, purgeMedia: Boolean(form.purge) });
                if (mode === 'refund') run('refund', { reason: form.reason, confirm: Boolean(form.confirm) });
              }}
            >
              {mode === 'edit' && (
                <>
                  <input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={40} required aria-label="Name" />
                  <input className="field" value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} maxLength={100} aria-label="Tagline" />
                  <input className="field" value={form.targetUrl} onChange={(e) => setForm({ ...form, targetUrl: e.target.value })} aria-label="Link" required />
                </>
              )}
              {mode === 'end' && (
                <>
                  <p className="text-sm font-medium">Takes it off now. No refund (use Refund for that). You can undo this from the log.</p>
                  {reasonField}
                </>
              )}
              {mode === 'remove' && (
                <>
                  {reasonField}
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" checked={Boolean(form.purge)} onChange={(e) => setForm({ ...form, purge: e.target.checked })} className="mt-0.5 h-4 w-4 accent-bh-red" />
                    <span>
                      <span className="font-bold">Also delete the picture/video files permanently</span> (required for illegal content; can't be undone).
                    </span>
                  </label>
                </>
              )}
              {mode === 'refund' && (
                <>
                  <p className="text-sm font-bold text-bh-red">
                    Refunds {formatMoney(ad.paidCents, ad.region)} to the buyer and takes the ad down. This cannot be undone.
                  </p>
                  {reasonField}
                  <label className="flex items-center gap-2 text-sm font-bold">
                    <input type="checkbox" checked={Boolean(form.confirm)} onChange={(e) => setForm({ ...form, confirm: e.target.checked })} className="h-4 w-4 accent-bh-red" required />
                    Yes, refund this ad
                  </label>
                </>
              )}
              <div className="flex gap-2">
                <button type="submit" disabled={busy} className="btn-blue btn-sm">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={3} /> : 'Confirm'}
                </button>
                <button type="button" className="btn-outline btn-sm" onClick={() => setMode(null)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
          {error && <p role="alert" className="border-2 border-ink bg-bh-red px-3 py-2 text-sm font-bold text-white">{error}</p>}
        </div>
      </div>
    </li>
  );
}

// God mode: full control over every ad and edition, with an undoable log.
export default function GodMode({ token }) {
  const [region, setRegion] = useState('');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [log, setLog] = useState([]);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [ads, history] = await Promise.all([api.adminAds(token, region, q), api.adminLog(token)]);
      setData(ads);
      setLog(history.items);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [token, region, q]);

  useEffect(() => {
    const id = setTimeout(load, 250); // debounce typing
    return () => clearTimeout(id);
  }, [load]);

  const togglePause = async (id) => {
    try {
      await api.adminPause(token, id, !data.paused[id]);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const undo = async (id) => {
    try {
      await api.adminUndo(token, id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="mt-8 space-y-8">
      <div>
        <h2 className="display text-4xl">God mode</h2>
        <p className="mt-2 max-w-2xl font-medium text-ink/70">
          Every ad, every edition. Edits, endings, takedowns and pauses can be undone from the log; refunds and permanent deletions cannot.
        </p>
      </div>

      {data && (
        <div className="grid gap-3 sm:grid-cols-2">
          {EDITIONS.map((e) => (
            <div key={e.id} className={`card flex items-center justify-between gap-3 p-4 ${data.paused[e.id] ? 'bg-bh-red text-white' : ''}`}>
              <div>
                <p className="label">{e.name} edition</p>
                <p className="text-lg font-black uppercase">{data.paused[e.id] ? 'New ads paused' : 'Open for ads'}</p>
              </div>
              <button type="button" onClick={() => togglePause(e.id)} className={data.paused[e.id] ? 'btn-yellow btn-sm' : 'btn-outline btn-sm'}>
                {data.paused[e.id] ? (
                  <>
                    <Play className="h-4 w-4" strokeWidth={3} /> Resume
                  </>
                ) : (
                  <>
                    <Pause className="h-4 w-4" strokeWidth={3} /> Pause
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <label className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" strokeWidth={3} />
          <input className="field pl-9" placeholder="Search by business name or ad id" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search ads" />
        </label>
        <select className="field w-auto" value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Edition">
          <option value="">All editions</option>
          {EDITIONS.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p role="alert" className="border-2 border-ink bg-bh-red px-3 py-2 text-sm font-bold text-white">{error}</p>}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <ul className="space-y-3">
          {!data ? (
            <li className="label flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={3} /> Loading
            </li>
          ) : data.items.length === 0 ? (
            <li className="card p-4 font-bold">No ads match.</li>
          ) : (
            data.items.map((ad) => <AdRow key={ad.id} ad={ad} token={token} onChanged={load} />)
          )}
        </ul>

        <aside>
          <h3 className="label mb-2">Activity log</h3>
          <ol className="space-y-2">
            {log.length === 0 && <li className="text-sm text-ink/60">Nothing yet.</li>}
            {log.map((e) => (
              <li key={e.id} className={`border-2 border-ink bg-paper p-2 text-sm ${e.undoneAt ? 'opacity-50' : ''}`}>
                <p className="font-bold">
                  {ACTION_LABEL[e.action] ?? e.action.replace('undo-', 'Undid: ')} {e.name ? <span className="uppercase">{e.name}</span> : e.region ? `(${e.region})` : ''}
                </p>
                {e.reason && <p className="text-ink/70">“{e.reason}”</p>}
                <p className="flex items-center justify-between gap-2 text-xs text-ink/60">
                  {timeFmt.format(new Date(e.at))}
                  {e.undoable && !e.undoneAt && (
                    <button type="button" onClick={() => undo(e.id)} className="label inline-flex items-center gap-1 text-bh-blue hover:text-bh-red">
                      <RotateCcw className="h-3 w-3" strokeWidth={3} /> Undo
                    </button>
                  )}
                  {e.undoneAt && <span className="label">Undone</span>}
                </p>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </section>
  );
}
