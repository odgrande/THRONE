import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Eye, EyeOff, Gift, Loader2, ShieldAlert, ShieldCheck, Users } from 'lucide-react';
import { api, formatMoney } from '../lib/api.js';
import { adoptProcessor, adoptRegion, needsEmail } from '../lib/region.js';
import { createWallet, formatCode, formatMs, gameMemory, markBackedUp, restoreWallet, setCoinRules, useWallet, walletApi, walletToken } from '../lib/wallet.js';
import { EmailField } from './AdFields.jsx';
import PayStep from './PayStep.jsx';
import Turnstile, { TURNSTILE_SITE_KEY } from './Turnstile.jsx';

export const coinFmt = (n) => Number(n ?? 0).toLocaleString();

// The "Saved" badge: green once the backup code is safe, amber until then.
export function SavedBadge({ wallet, className = '' }) {
  if (!wallet) return null;
  return wallet.backedUp ? (
    <span className={`inline-flex items-center gap-1 border-2 border-ink bg-bh-green px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-ink ${className}`} title="Your wallet is backed up: your backup code opens it on any browser or phone.">
      <ShieldCheck className="h-3 w-3" strokeWidth={3} /> Saved
    </span>
  ) : (
    <span className={`inline-flex items-center gap-1 border-2 border-ink bg-bh-yellow px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-ink ${className}`} title="Save your backup code so you never lose your coins.">
      <ShieldAlert className="h-3 w-3" strokeWidth={3} /> Back up
    </span>
  );
}

const REASONS = {
  welcome: 'Welcome bonus',
  daily: 'Daily coins',
  attempt: 'Extra try',
  takeover: 'Took the Throne',
  'king-of-day': 'King of the Day',
  referral: 'Invite reward',
  commission: 'Invite commission',
  adtime: 'Free ad time (invites)',
  purchase: 'Coin pack',
  ad: 'Ad booked',
  refund: 'Refund (coins)',
  shield: 'Crown Shield',
  admin: 'Adjustment by support',
};

function Backup({ wallet }) {
  const [show, setShow] = useState(!wallet.backedUp);
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const code = walletToken() ?? '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setReveal(true);
    }
  };
  const download = () => {
    const blob = new Blob([`Throne wallet backup code\n\n${code}\n\nKeep it private. Anyone with this code can use your coins.\nRestore it at ${window.location.origin}/wallet\n`], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'throne-wallet-backup.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!show) {
    return (
      <div className="flex items-center justify-between gap-3 border-2 border-ink bg-bh-green/40 p-3">
        <p className="flex items-center gap-2 text-sm font-bold">
          <ShieldCheck className="h-4 w-4" strokeWidth={3} /> Wallet saved: your backup code opens it on any browser or phone.
        </p>
        <button type="button" className="label shrink-0 underline hover:text-bh-red" onClick={() => setShow(true)}>
          Show code
        </button>
      </div>
    );
  }
  return (
    <div className={`space-y-3 border-2 border-ink p-3 ${wallet.backedUp ? 'bg-paper' : 'bg-bh-yellow'}`}>
      <p className="flex items-start gap-2 text-sm font-bold">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={3} />
        {wallet.backedUp
          ? 'Your backup code. Keep it private: anyone with it can use your coins.'
          : 'Save your backup code now. It is the only way to open this wallet on another browser or phone, or after clearing this one.'}
      </p>
      <code className="block select-all break-all border-2 border-ink bg-paper px-2 py-2 font-mono text-sm" aria-label="Backup code">
        {reveal ? formatCode(code) : '•••• •••• •••• •••• •••• •••• •••• •••• •••• •••• •••'}
      </code>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-outline btn-sm" onClick={() => setReveal(!reveal)}>
          {reveal ? <EyeOff className="h-4 w-4" strokeWidth={3} /> : <Eye className="h-4 w-4" strokeWidth={3} />} {reveal ? 'Hide' : 'Show'}
        </button>
        <button type="button" className="btn-outline btn-sm" onClick={copy}>
          {copied ? <Check className="h-4 w-4" strokeWidth={3} /> : <Copy className="h-4 w-4" strokeWidth={3} />} {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className="btn-outline btn-sm" onClick={download}>
          <Download className="h-4 w-4" strokeWidth={3} /> Save file
        </button>
      </div>
      {!wallet.backedUp && (
        <button
          type="button"
          disabled={busy}
          className="btn w-full bg-onyx text-white hover:bg-onyx/90"
          onClick={async () => {
            setBusy(true);
            await markBackedUp().catch(() => {});
            setBusy(false);
            setShow(false);
          }}
        >
          I saved my backup code
        </button>
      )}
    </div>
  );
}

function Daily({ wallet }) {
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const readyIn = Date.parse(wallet.dailyReadyAt) - now;
  const hms = (ms) => {
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
  };
  return (
    <div className="flex items-center justify-between gap-3 border-2 border-ink bg-paper p-3">
      <div>
        <p className="label flex items-center gap-1.5">
          <Gift className="h-4 w-4" strokeWidth={3} /> Daily coins
        </p>
        <p className="text-sm text-ink/70">{msg ?? `+${coinFmt(wallet.dailyCoins)} every day you come back.`}</p>
      </div>
      <button
        type="button"
        disabled={readyIn > 0 || busy}
        className="btn-sm btn shrink-0 bg-bh-red text-white disabled:bg-muted disabled:text-ink/60"
        onClick={async () => {
          setBusy(true);
          try {
            const r = await walletApi.claimDaily();
            setMsg(`+${coinFmt(r.coins)} coins claimed!`);
          } catch (err) {
            setMsg(err.message);
          }
          setBusy(false);
        }}
      >
        {readyIn > 0 ? hms(readyIn) : 'Claim'}
      </button>
    </div>
  );
}

function BuyCoins({ wallet }) {
  const [pack, setPack] = useState(null);
  const [email, setEmail] = useState('');
  const [checkout, setCheckout] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [botToken, setBotToken] = useState(null);
  const turnstileRef = useRef(null);
  const packs = wallet.coins?.packs ?? [];

  const order = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await walletApi.createOrder(pack.id, { turnstileToken: botToken, ...(needsEmail() ? { email } : {}) });
      setCheckout({ ...res, bidId: res.orderId });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      turnstileRef.current?.reset();
    }
  };
  const waitPaid = async (tries = 60, every = 1000) => {
    for (let i = 0; i < tries; i++) {
      const r = await walletApi.orderStatus(checkout.orderId);
      if (r.status === 'paid') return r;
      await new Promise((res) => setTimeout(res, every));
    }
    return { status: 'pending' };
  };

  if (done) {
    return (
      <div className="space-y-2 border-2 border-ink bg-bh-yellow p-3">
        <p className="font-black uppercase">{done.status === 'paid' ? `+${coinFmt(checkout.coins)} coins added` : 'Payment received, adding your coins…'}</p>
        <button type="button" className="label underline" onClick={() => (setDone(null), setCheckout(null), setPack(null))}>
          Done
        </button>
      </div>
    );
  }
  if (checkout) {
    return (
      <PayStep
        checkout={checkout}
        intro={
          <>
            Pay <span className="font-black">{formatMoney(checkout.amountCents)}</span> for <span className="font-black">{coinFmt(checkout.coins)} coins</span>.
          </>
        }
        nonRefundable="Coins have no cash value and can't be cashed out. Coin packs are non-refundable once credited."
        demoPay={() => walletApi.demoPayOrder(checkout.orderId).then(() => waitPaid(5, 300))}
        waitFor={waitPaid}
        onDone={async (r) => {
          setDone(r);
          const { refreshWallet } = await import('../lib/wallet.js');
          refreshWallet();
        }}
        onCancel={() => setCheckout(null)}
      />
    );
  }
  return (
    <form onSubmit={order} className="space-y-3">
      <p className="label">Top up coins</p>
      <div className="grid grid-cols-3 gap-2">
        {packs.map((p) => (
          <label key={p.id} className={`cursor-pointer border-2 border-ink p-2 text-center transition duration-200 ${pack?.id === p.id ? 'bg-bh-yellow shadow-hard-xs' : 'bg-paper hover:bg-bh-cream'}`}>
            <input type="radio" name="pack" className="sr-only" checked={pack?.id === p.id} onChange={() => setPack(p)} />
            <span className="block text-lg font-black tabular-nums">{coinFmt(p.coins)}</span>
            <span className="block text-xs font-bold uppercase">coins</span>
            <span className="mt-1 block text-sm font-bold tabular-nums">{formatMoney(p.priceCents)}</span>
          </label>
        ))}
      </div>
      {pack && needsEmail() && <EmailField value={email} onChange={setEmail} idPrefix="coins" />}
      {pack && <Turnstile ref={turnstileRef} onToken={setBotToken} />}
      {error && <p role="alert" className="border-2 border-ink bg-bh-red px-3 py-2 text-sm font-bold text-white">{error}</p>}
      <button type="submit" disabled={!pack || busy || (Boolean(TURNSTILE_SITE_KEY) && !botToken)} className="btn-blue w-full">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={3} /> : pack ? `Buy ${coinFmt(pack.coins)} coins · ${formatMoney(pack.priceCents)}` : 'Choose a pack'}
      </button>
      <p className="text-xs text-ink/60">Coins are play money for ads and the game: no cash value, can't be cashed out or transferred.</p>
    </form>
  );
}

function NameEdit({ wallet }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(wallet.playerName ?? '');
  const [err, setErr] = useState(null);
  if (!edit) {
    return (
      <button type="button" className="label underline hover:text-bh-red" onClick={() => setEdit(true)}>
        {wallet.playerName ? 'Change name' : 'Set player name'}
      </button>
    );
  }
  return (
    <form
      className="flex w-full gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await walletApi.setName(name);
          setEdit(false);
          setErr(null);
        } catch (er) {
          setErr(er.message);
        }
      }}
    >
      <input className="field min-w-0 flex-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} minLength={2} placeholder="Player name" aria-label="Player name" />
      <button className="btn-sm btn bg-onyx text-white" type="submit">
        Save
      </button>
      {err && <p className="text-xs font-bold text-bh-red">{err}</p>}
    </form>
  );
}

function Start() {
  const { coinRules } = useWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [code, setCode] = useState('');
  const [botToken, setBotToken] = useState(null);
  const turnstileRef = useRef(null);
  return (
    <div className="space-y-5">
      <div className="border-2 border-ink bg-bh-yellow p-4">
        <p className="display text-2xl">Play free. Win the Throne.</p>
        <p className="mt-1 font-medium">
          Get {coinRules ? <span className="font-black">{coinFmt(coinRules.welcome)} free coins</span> : 'free coins'} to start. No signup, no email: your wallet lives in this browser with a backup code.
        </p>
      </div>
      <Turnstile ref={turnstileRef} onToken={setBotToken} />
      <button
        type="button"
        disabled={busy || (Boolean(TURNSTILE_SITE_KEY) && !botToken)}
        className="btn w-full bg-bh-red text-lg text-white"
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await createWallet(botToken);
          } catch (err) {
            setError(err.message);
          }
          setBusy(false);
          turnstileRef.current?.reset();
        }}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" strokeWidth={3} /> : 'Start free'}
      </button>
      <form
        className="space-y-2 border-t-2 border-ink pt-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            await restoreWallet(code);
          } catch (err) {
            setError(err.message);
          }
        }}
      >
        <label htmlFor="restore-code" className="label block">
          Have a wallet already? Enter your backup code
        </label>
        <div className="flex gap-2">
          <input id="restore-code" className="field min-w-0 flex-1 font-mono" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} />
          <button type="submit" className="btn-outline btn-sm shrink-0" disabled={code.replace(/\s/g, '').length < 40}>
            Restore
          </button>
        </div>
      </form>
      {error && <p role="alert" className="border-2 border-ink bg-bh-red px-3 py-2 text-sm font-bold text-white">{error}</p>}
    </div>
  );
}

// The whole wallet: shown in the header dialog and on /wallet.
export default function WalletPanel() {
  const { wallet, loading, justCreated } = useWallet();
  const [ledger, setLedger] = useState(null);

  // Learn the edition, processor and coin rules (for pages without the live state).
  useEffect(() => {
    api.getState().then(
      (s) => {
        adoptRegion(s.region);
        adoptProcessor(s.paymentsMode);
        setCoinRules(s.rules?.coins, s.rules?.game);
      },
      () => {},
    );
  }, []);

  if (loading) return <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin" strokeWidth={3} />;
  if (!wallet) return <Start />;
  const memory = gameMemory();
  const invite = `${window.location.origin}/?ref=${wallet.referralCode}`;

  return (
    <div className="space-y-4">
      {wallet.banned && (
        <p role="alert" className="border-2 border-ink bg-bh-red px-3 py-2 text-sm font-bold text-white">
          This wallet is suspended{wallet.banReason ? `: ${wallet.banReason}` : ''}. Email therone@gmail.com if you think this is a mistake.
        </p>
      )}
      {justCreated?.welcome > 0 && (
        <p className="border-2 border-ink bg-bh-green px-3 py-2 font-bold">Welcome! +{coinFmt(justCreated.welcome)} free coins are in your wallet.</p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label flex items-center gap-2">
            {wallet.displayName} <SavedBadge wallet={wallet} />
          </p>
          <p className="display text-5xl tabular-nums">{coinFmt(wallet.balance)}</p>
          <p className="label text-ink/60">coins</p>
        </div>
        <NameEdit wallet={wallet} />
      </div>

      <Backup wallet={wallet} />
      <Daily wallet={wallet} />

      <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        {[
          ['Games', wallet.records?.games ?? 0],
          ['Solved', wallet.records?.solves ?? 0],
          ['Best', formatMs(wallet.records?.bestMs ?? memory.bestMs)],
          ['Reigns', wallet.records?.reigns ?? 0],
        ].map(([k, v]) => (
          <div key={k} className="border-2 border-ink bg-paper p-2">
            <p className="text-xl font-black tabular-nums">{v}</p>
            <p className="label text-ink/60">{k}</p>
          </div>
        ))}
      </div>

      <a href="/invite" className="flex items-center justify-between gap-3 border-2 border-ink bg-bh-blue p-3 text-white hover:opacity-90">
        <span className="flex items-center gap-2 font-bold">
          <Users className="h-5 w-5" strokeWidth={3} /> Invite friends: +{coinFmt(wallet.coins?.referral)} coins each, plus free ad time
        </span>
        <span className="label shrink-0">{wallet.invites?.total ?? 0} invited</span>
      </a>
      <p className="break-all text-xs text-ink/60">Your invite link: {invite}</p>

      <BuyCoins wallet={wallet} />

      <details
        className="border-2 border-ink"
        onToggle={(e) => {
          if (e.currentTarget.open && !ledger) walletApi.ledger().then((r) => setLedger(r.items), () => setLedger([]));
        }}
      >
        <summary className="label cursor-pointer px-3 py-2 hover:bg-bh-cream">Coin history</summary>
        <ul className="divide-y-2 divide-ink/10 border-t-2 border-ink">
          {(ledger ?? []).map((l, i) => (
            <li key={i} className="flex justify-between gap-2 px-3 py-1.5 text-sm">
              <span>{REASONS[l.reason] ?? l.reason}</span>
              <span className={`font-bold tabular-nums ${l.delta < 0 ? 'text-bh-red' : ''}`}>
                {l.delta > 0 ? '+' : ''}
                {coinFmt(l.delta)}
              </span>
            </li>
          ))}
          {ledger && !ledger.length && <li className="px-3 py-2 text-sm text-ink/60">Nothing yet.</li>}
          {!ledger && <li className="px-3 py-2 text-sm text-ink/60">Loading…</li>}
        </ul>
      </details>
    </div>
  );
}
