import { useCallback, useEffect, useState } from 'react';
import { Loader2, LogOut, RefreshCw } from 'lucide-react';
import { api, formatMoney } from '../lib/api.js';
import Logo from '../components/Logo.jsx';
import Shape from '../components/Shape.jsx';

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

function Metric({ label, value, note, tone = 'bg-white' }) {
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

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    document.title = 'Treasury · Project Throne';
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
      <header className="border-b-4 border-ink bg-ink text-white">
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
          <Dashboard health={health} error={error} />
        )}
      </main>
    </div>
  );
}

function Dashboard({ health: h, error }) {
  const s = STATUS[h.status];
  const ratio = h.creditRatioPct === null ? '—' : `${h.creditRatioPct}%`;

  return (
    <>
      <section className={`card relative mt-10 overflow-hidden p-6 lg:p-8 ${s.block}`} aria-live="polite">
        <Shape kind={s.shape} color="white" className="absolute -right-8 -top-8 h-28 w-28 border-4 border-ink" />
        <p className="label">Balance-sheet health</p>
        <h1 className="display mt-2 text-5xl sm:text-7xl">{s.label}</h1>
        {h.alerts.length === 0 ? (
          <p className="mt-4 max-w-2xl text-lg font-medium">
            Credit liability is within limits (warn at {h.thresholds.warnPct}%, alert at {h.thresholds.alertPct}% of net cash).
          </p>
        ) : (
          <ul className="mt-4 max-w-3xl space-y-2">
            {h.alerts.map((a) => (
              <li key={a.message} className="flex items-start gap-3 text-lg font-bold">
                <Shape kind={a.level === 'red' ? 'square' : 'triangle'} color="ink" className="mt-1.5 h-3.5 w-3.5" />
                {a.message}
              </li>
            ))}
          </ul>
        )}
        {error && <p className="mt-4 text-sm font-bold">Last refresh failed: {error}</p>}
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Net card cash" value={formatMoney(h.netCashCents)} note="Card revenue minus est. Stripe fees" />
        <Metric
          label="Unspent credits"
          value={formatMoney(h.outstandingCreditsCents)}
          note={`Held by ${h.walletsWithBalance} wallet${h.walletsWithBalance === 1 ? '' : 's'}`}
          tone="bg-bh-yellow"
        />
        <Metric
          label="Coverage"
          value={formatMoney(h.coverageCents)}
          note="Net cash − credits − Creator Fund"
          tone={h.coverageCents < 0 ? 'bg-bh-red text-white' : 'bg-white'}
        />
        <Metric label="Credit ratio" value={ratio} note="Unspent credits ÷ net cash" tone="bg-ink text-white" />
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="border-b-2 border-ink px-5 py-4 text-xl font-black uppercase tracking-tight lg:border-b-4">Cash</h2>
          <dl className="divide-y-2 divide-ink">
            <Row label="Card revenue (won bids)" value={formatMoney(h.cardGrossCents)} />
            <Row label="Est. Stripe fees" hint="30¢ + 2.9% per charge, incl. refunded ones" value={`−${formatMoney(h.estFeesCents)}`} />
            <Row label="Refunded to race losers" hint="Card portion returned; fee is kept by Stripe" value={formatMoney(h.refundedCents)} />
            <Row label="Creator Fund pledged" value={formatMoney(h.creatorFundCents)} />
            <Row
              label="Stripe balance"
              hint={h.stripeBalance ? 'Available + pending; bank payouts reduce it' : 'Demo mode: no Stripe account'}
              value={
                h.stripeBalance
                  ? `${formatMoney(h.stripeBalance.availableCents)} + ${formatMoney(h.stripeBalance.pendingCents)}`
                  : '—'
              }
            />
          </dl>
        </div>

        <div className="card">
          <h2 className="border-b-2 border-ink px-5 py-4 text-xl font-black uppercase tracking-tight lg:border-b-4">Credits &amp; ops</h2>
          <dl className="divide-y-2 divide-ink">
            <Row label="Credits issued (all time)" value={formatMoney(h.creditsIssuedCents)} />
            <Row label="Credits spent on bids" value={formatMoney(h.creditsSpentCents)} />
            <Row
              label="Bid volume paid in credits"
              hint="Credit-funded bids bring no cash but still mint new dividends"
              value={h.creditFundedPct === null ? '—' : `${h.creditFundedPct}%`}
            />
            <Row label="Won bids" value={h.wonBids.toLocaleString()} />
            <Row label="Unpaid bids > 1 hour" value={h.stalePending.toLocaleString()} />
            <Row
              label="Hype videos"
              value={['done', 'pending', 'rendering', 'failed'].map((k) => `${h.hype[k] ?? 0} ${k}`).join(' · ')}
            />
          </dl>
        </div>
      </section>

      <p className="mt-6 text-xs text-ink/60">
        Updated {new Date(h.generatedAt).toLocaleTimeString()} · refreshes every 30s. Fees are estimates; Stripe's dashboard is the
        source of truth.
      </p>
    </>
  );
}
