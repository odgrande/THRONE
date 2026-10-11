import { useCallback, useEffect, useState } from 'react';
import { Loader2, LogOut, RefreshCw } from 'lucide-react';
import { api, formatMoney } from '../lib/api.js';
import VideoReviews from '../components/VideoReviews.jsx';
import GodMode from '../components/GodMode.jsx';
import Inbox from '../components/Inbox.jsx';
import Logo from '../components/Logo.jsx';
import Shape from '../components/Shape.jsx';
import ModerationQueue from '../components/ModerationQueue.jsx';

const TOKEN_KEY = 'throne.adminToken';
const REFRESH_MS = 30_000;

// Per-tab only: the admin token is gone when the tab closes.
const session = {
  get: () => {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (v) => {
    try {
      v ? sessionStorage.setItem(TOKEN_KEY, v) : sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // Token then lives only in memory for this page view.
    }
  },
};

// Bauhaus has no green: blue = healthy, yellow = watch, red = alert.
const STATUS = {
  green: { label: 'Healthy', block: 'bg-bh-blue text-white', shape: 'circle' },
  amber: { label: 'Watch', block: 'bg-bh-yellow text-ink', shape: 'triangle' },
  red: { label: 'Alert', block: 'bg-bh-red text-white', shape: 'square' },
};

function Metric({ label, value, note, tone = 'bg-paper' }) {
  return (
    <div className={`card p-5 ${tone}`}>
      <p className="label opacity-70">{label}</p>
      <p className="mt-2 text-3xl font-black tabular-nums tracking-tighter lg:text-4xl">{value}</p>
      {note && <p className="mt-1 text-sm font-medium opacity-80">{note}</p>}
    </div>
  );
}

function Row({ label, value, hint }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-3">
      <dt className="font-medium">
        {label}
        {hint && <span className="block text-xs text-ink/60">{hint}</span>}
      </dt>
      <dd className="text-right font-black tabular-nums">{value}</dd>
    </div>
  );
}

function SignIn({ onSubmit, error }) {
  const [token, setToken] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(token.trim());
      }}
      className="card mx-auto mt-16 w-full max-w-md p-6"
    >
      <p className="label text-bh-red">Restricted</p>
      <h1 className="display mt-1 text-4xl">Treasury</h1>
      <label className="mt-6 block">
        <span className="label mb-1.5 block">Admin token</span>
        <input
          className="field font-mono text-sm"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
        />
      </label>
      {error && <p role="alert" className="mt-4 border-2 border-ink bg-bh-red px-3 py-2 text-sm font-bold text-white">{error}</p>}
      <button type="submit" className="btn-blue mt-6 w-full">Open treasury</button>
    </form>
  );
}

export default function AdminPage() {
  const [token, setToken] = useState(session.get);
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('treasury');

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    document.title = 'Admin · Throne';
    return () => meta.remove();
  }, []);

  const load = useCallback(async (t) => {
    setLoading(true);
    try {
      setHealth(await api.adminHealth(t));
      setError(null);
    } catch (err) {
      if (err.status === 401 || err.status === 404) {
        session.set(null);
        setToken(null);
        setHealth(null);
        setError(err.status === 404 ? 'Admin is disabled: set ADMIN_TOKEN on the backend.' : 'That token was rejected.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    load(token);
    const id = setInterval(() => load(token), REFRESH_MS);
    return () => clearInterval(id);
  }, [token, load]);

  const signIn = (t) => {
    session.set(t);
    setToken(t);
  };
  const signOut = () => {
    session.set(null);
    setToken(null);
    setHealth(null);
  };

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b-4 border-ink bg-onyx text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Logo inverted />
            <span className="label border-2 border-white px-2 py-0.5">Admin</span>
          </div>
          {token && (
            <div className="flex gap-2">
              <button onClick={() => load(token)} disabled={loading} className="btn-yellow btn-sm" aria-label="Refresh">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={3} />
              </button>
              <button onClick={signOut} className="btn-outline btn-sm" aria-label="Sign out">
                <LogOut className="h-4 w-4" strokeWidth={3} />
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        {!token ? (
          <SignIn onSubmit={signIn} error={error} />
        ) : !health ? (
          <p className="label flex items-center gap-2 py-16">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={3} /> {error ?? 'Loading treasury'}
          </p>
        ) : (
          <>
            <nav className="mt-8 flex flex-wrap gap-2 sm:gap-3" aria-label="Admin sections">
              {[
                ['treasury', 'Treasury'],
                ['moderation', 'Moderation'],
                ['videos', 'Review queue'],
                ['god', 'God mode'],
                ['inbox', 'Inbox'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  aria-pressed={tab === key}
                  className={`${tab === key ? 'btn-yellow' : 'btn-outline'} btn-sm`}
                >
                  {label}
                </button>
              ))}
            </nav>
            {tab === 'treasury' ? <Dashboard health={health} error={error} /> : tab === 'videos' ? <VideoReviews token={token} /> : tab === 'god' ? <GodMode token={token} /> : tab === 'inbox' ? <Inbox token={token} /> : <ModerationQueue token={token} />}
          </>
        )}
      </main>
    </div>
  );
}

function Dashboard({ health: h, error }) {
  const s = STATUS[h.status];

  return (
    <>
      <section className={`card relative mt-10 overflow-hidden p-6 lg:p-8 ${s.block}`} aria-live="polite">
        <Shape kind={s.shape} color="white" className="absolute -right-8 -top-8 h-28 w-28 border-4 border-ink" />
        <p className="label">Operations</p>
        <h1 className="display mt-2 text-5xl sm:text-7xl">{s.label}</h1>
        {h.alerts.length === 0 ? (
          <p className="mt-4 max-w-2xl text-lg font-medium">No unpaid ads piling up and no failed video renders.</p>
        ) : (
          <ul className="mt-4 max-w-3xl space-y-2">
            {h.alerts.map((a) => (
              <li key={a.message} className="flex items-start gap-3 text-lg font-bold">
                <Shape kind="triangle" color="ink" className="mt-1.5 h-3.5 w-3.5" />
                {a.message}
              </li>
            ))}
          </ul>
        )}
        {error && <p className="mt-4 text-sm font-bold">Last refresh failed: {error}</p>}
      </section>

      {/* One block per region, each in its own currency: never add naira to dollars. */}
      {Object.entries(h.regions).map(([id, r]) => (
        <RegionFinancials key={id} id={id} r={r} />
      ))}

      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="border-b-2 border-ink px-5 py-4 text-xl font-black uppercase tracking-tight lg:border-b-4">Operations</h2>
          <dl className="divide-y-2 divide-ink">
            <Row label="Unpaid ads > 1 hour" value={h.stalePending.toLocaleString()} />
            <Row label="Hype videos" value={['done', 'pending', 'rendering', 'failed'].map((k) => `${h.hype[k] ?? 0} ${k}`).join(' · ')} />
          </dl>
        </div>
      </section>

      <p className="mt-6 text-xs text-ink/60">
        Updated {new Date(h.generatedAt).toLocaleTimeString()} · refreshes every 30s. Fees are estimates; your payment processor's
        dashboard is the source of truth.
      </p>
    </>
  );
}

const FEE_HINT = { stripe: '30¢ + 2.9% per real charge', paystack: '1.5% + ₦100 (over ₦2,500), capped at ₦2,000', demo: 'Simulated payments' };

function RegionFinancials({ id, r }) {
  const money = (cents) => formatMoney(cents ?? 0, id);
  return (
    <section className="mt-10" aria-label={`${r.name} edition`}>
      <h2 className="label mb-3">
        {r.name} · {r.currency} · {r.processor}
      </h2>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Ad revenue" value={money(r.grossCents)} note={`${(r.wonBids ?? 0).toLocaleString()} paid ads`} />
        <Metric label="Net after fees" value={money(r.netCents)} note="Minus estimated processor fees" tone="bg-bh-yellow" />
        <Metric label="The Throne" value={money(r.throneGrossCents)} note="Auction revenue" tone="bg-bh-blue text-white" />
        <Metric label="The Court" value={money(r.boardsGrossCents)} note={`${r.bookings ?? 0} bookings · ${r.relegations ?? 0} relegations`} tone="bg-onyx text-white" />
      </div>
      <div className="card mt-6">
        <dl className="divide-y-2 divide-ink">
          <Row label="Map add-ons" hint="Included in ad revenue" value={money(r.addonCents)} />
          {r.vatPct > 0 && <Row label={`VAT (${r.vatPct}%)`} hint="Included in ad revenue; owed to the tax authority" value={money(r.vatCents)} />}
          <Row label="Est. processor fees" hint={`${FEE_HINT[r.processor] ?? ''}, incl. refunded charges`} value={`−${money(r.estFeesCents)}`} />
          <Row label="Refunded" hint="Throne race losers and duplicate relegations; the fee is kept" value={money(r.refundedCents)} />
          <Row
            label="Processor balance"
            hint={r.balance ? 'Available + pending; bank payouts reduce it' : r.processor === 'demo' ? 'Test site: payments are simulated' : 'Unavailable'}
            value={r.balance ? `${money(r.balance.availableCents)} + ${money(r.balance.pendingCents)}` : '—'}
          />
        </dl>
      </div>
    </section>
  );
}
