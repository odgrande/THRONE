import { useCallback, useEffect, useState } from 'react';
import { Ban, Check, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { formatMs } from '../lib/wallet.js';

const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');
const ask = (q) => {
  const v = window.prompt(q);
  return v && v.trim().length >= 3 ? v.trim() : null;
};

function Section({ title, children, action }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="display text-2xl">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Table({ head, rows, empty = 'Nothing here.' }) {
  if (!rows.length) return <p className="border-2 border-ink bg-paper px-4 py-3 text-sm text-ink/60">{empty}</p>;
  return (
    <div className="overflow-x-auto border-2 border-ink">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-bh-yellow">
          <tr>
            {head.map((h) => (
              <th key={h} className="label px-3 py-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y-2 divide-ink/10 bg-paper">{rows}</tbody>
      </table>
    </div>
  );
}

// Everything in the Ads Game is moderated here: ad cards, results, wallets,
// coins, bans, coin orders and invites. Every action is written to the admin log.
export default function GameAdmin({ token }) {
  const call = useCallback((path, body) => api.adminGame(token, path, body), [token]);
  const [cards, setCards] = useState([]);
  const [games, setGames] = useState([]);
  const [filter, setFilter] = useState('too_fast');
  const [orders, setOrders] = useState([]);
  const [q, setQ] = useState('');
  const [wallets, setWallets] = useState([]);
  const [detail, setDetail] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [c, g, o, w] = await Promise.all([call('/cards'), call(`/attempts${filter ? `?status=${filter}` : ''}`), call('/orders'), call(`/wallets?q=${encodeURIComponent(q)}`)]);
      setCards(c.items);
      setGames(g.items);
      setOrders(o.items);
      setWallets(w.items);
    } catch (err) {
      setMsg(err.message);
    }
    setBusy(false);
  }, [call, filter, q]);

  useEffect(() => {
    load();
  }, [load]);

  const open = async (id) => {
    try {
      setDetail(await call(`/wallets/${id}`));
    } catch (err) {
      setMsg(err.message);
    }
  };

  const act = async (fn, okMsg) => {
    try {
      await fn();
      setMsg(okMsg);
      await load();
      if (detail) await open(detail.wallet.id);
    } catch (err) {
      setMsg(err.message);
    }
  };

  const approveCard = (id) => act(() => call(`/cards/${id}/approve`, {}), 'Card approved.');
  const rejectCard = (id) => {
    const reason = ask('Why is this ad card rejected? (shown to the player)');
    if (reason) act(() => call(`/cards/${id}/reject`, { reason }), 'Card rejected.');
  };
  const voidGame = (id) => {
    const reason = ask('Why void this result? (logged)');
    if (reason) act(() => call(`/attempts/${id}/void`, { reason }), 'Result voided.');
  };

  return (
    <div>
      {msg && (
        <p className="mt-6 flex items-center justify-between gap-3 border-2 border-ink bg-bh-yellow px-4 py-2 font-bold">
          {msg}
          <button type="button" onClick={() => setMsg(null)} aria-label="Dismiss">
            <X className="h-4 w-4" strokeWidth={3} />
          </button>
        </p>
      )}

      <Section
        title="Ad cards waiting"
        action={
          <button type="button" className="btn-outline btn-sm" onClick={load} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" strokeWidth={3} />} Refresh
          </button>
        }
      >
        <p className="mb-2 text-sm text-ink/70">Nigeria cards are held for review (ARCON) and auto-approve after the hold unless rejected here.</p>
        <Table
          head={['Card', 'Link', 'Since', '']}
          rows={cards.map((c) => (
            <tr key={c.walletId}>
              <td className="px-3 py-2">
                <span className="font-bold">{c.name}</span>
                {c.tagline && <span className="block text-xs text-ink/60">{c.tagline}</span>}
                {c.imageUrl && <img src={c.imageUrl} alt="" className="mt-1 h-12 w-12 border-2 border-ink object-cover" />}
              </td>
              <td className="max-w-[220px] truncate px-3 py-2">
                <a href={c.targetUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline">
                  {c.targetUrl}
                </a>
              </td>
              <td className="px-3 py-2">{when(c.reviewSince)}</td>
              <td className="space-x-2 whitespace-nowrap px-3 py-2 text-right">
                <button type="button" className="btn-sm btn-blue" onClick={() => approveCard(c.walletId)}>
                  <Check className="h-4 w-4" strokeWidth={3} /> Approve
                </button>
                <button type="button" className="btn-sm btn-red" onClick={() => rejectCard(c.walletId)}>
                  Reject
                </button>
              </td>
            </tr>
          ))}
          empty="No ad cards waiting."
        />
      </Section>

      <Section
        title="Game results"
        action={
          <select className="field w-auto py-1.5 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter results">
            <option value="too_fast">Flagged (too fast)</option>
            <option value="solved">Solved</option>
            <option value="failed">Failed / given up</option>
            <option value="started">In progress</option>
            <option value="">All</option>
          </select>
        }
      >
        <Table
          head={['Player', 'Edition', 'Status', 'Time', 'Moves', 'Started', '']}
          rows={games.map((g) => (
            <tr key={g.id}>
              <td className="px-3 py-2">
                <button type="button" className="font-bold underline" onClick={() => open(g.walletId)}>
                  {g.playerName ?? g.walletId.slice(0, 8)}
                </button>
              </td>
              <td className="px-3 py-2 uppercase">{g.region}</td>
              <td className="px-3 py-2">{g.status}</td>
              <td className="px-3 py-2 tabular-nums">{formatMs(g.durationMs)}</td>
              <td className="px-3 py-2 tabular-nums">{g.moves ?? '—'}</td>
              <td className="px-3 py-2">{when(g.startedAt)}</td>
              <td className="px-3 py-2 text-right">
                {g.status === 'solved' && (
                  <button type="button" className="btn-sm btn-red" onClick={() => voidGame(g.id)}>
                    Void
                  </button>
                )}
              </td>
            </tr>
          ))}
          empty="No results for this filter."
        />
      </Section>

      <Section title="Wallets">
        <form
          className="mb-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
        >
          <input className="field" placeholder="Player name, invite code or wallet id" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn-outline btn-sm" type="submit">
            <Search className="h-4 w-4" strokeWidth={3} /> Search
          </button>
        </form>
        <Table
          head={['Player', 'Edition', 'Coins', 'Code', 'Saved', 'Status', 'Created']}
          rows={wallets.map((w) => (
            <tr key={w.id} className={detail?.wallet.id === w.id ? 'bg-bh-cream' : ''}>
              <td className="px-3 py-2">
                <button type="button" className="font-bold underline" onClick={() => open(w.id)}>
                  {w.displayName}
                </button>
              </td>
              <td className="px-3 py-2 uppercase">{w.region}</td>
              <td className="px-3 py-2 font-black tabular-nums">{w.balance.toLocaleString()}</td>
              <td className="px-3 py-2 font-mono">{w.referralCode}</td>
              <td className="px-3 py-2">{w.backedUp ? 'Yes' : 'No'}</td>
              <td className="px-3 py-2">{w.banned ? <span className="font-bold text-bh-red">Banned</span> : 'Active'}</td>
              <td className="px-3 py-2">{when(w.createdAt)}</td>
            </tr>
          ))}
        />

        {detail && (
          <div className="mt-6 space-y-5 border-4 border-ink bg-paper p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="label text-ink/60">{detail.wallet.id}</p>
                <p className="display text-3xl">{detail.wallet.displayName}</p>
                <p className="font-bold">
                  {detail.wallet.balance.toLocaleString()} coins · {detail.records.games} games · {detail.records.solves} solves · best {formatMs(detail.records.bestMs)} · {detail.records.reigns} reigns
                </p>
                {detail.wallet.banned && <p className="font-bold text-bh-red">Banned: {detail.wallet.banReason}</p>}
              </div>
              <button type="button" className="btn-outline btn-sm" onClick={() => setDetail(null)}>
                Close
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-outline btn-sm"
                onClick={() => {
                  const delta = Number.parseInt(window.prompt('Coins to add (use a minus sign to remove):') ?? '', 10);
                  if (!Number.isInteger(delta) || !delta) return;
                  const reason = ask('Reason (logged):');
                  if (reason) act(() => call(`/wallets/${detail.wallet.id}/coins`, { delta, reason }), 'Coins adjusted.');
                }}
              >
                Adjust coins
              </button>
              {detail.wallet.banned ? (
                <button type="button" className="btn-outline btn-sm" onClick={() => act(() => call(`/wallets/${detail.wallet.id}/ban`, { banned: false }), 'Wallet unbanned.')}>
                  Unban
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-sm btn-red"
                  onClick={() => {
                    const reason = ask('Why ban this wallet? (shown to the player)');
                    if (reason) act(() => call(`/wallets/${detail.wallet.id}/ban`, { banned: true, reason }), 'Wallet banned.');
                  }}
                >
                  <Ban className="h-4 w-4" strokeWidth={3} /> Ban
                </button>
              )}
              {detail.wallet.playerName && (
                <button type="button" className="btn-outline btn-sm" onClick={() => act(() => call(`/wallets/${detail.wallet.id}/name`, {}), 'Name reset.')}>
                  Reset name
                </button>
              )}
              {detail.card && detail.card.status !== 'approved' && (
                <button type="button" className="btn-sm btn-blue" onClick={() => approveCard(detail.wallet.id)}>
                  Approve card
                </button>
              )}
              {detail.card && detail.card.status !== 'rejected' && (
                <button type="button" className="btn-outline btn-sm" onClick={() => rejectCard(detail.wallet.id)}>
                  Reject card
                </button>
              )}
            </div>

            {detail.card && (
              <p className="text-sm">
                <span className="label">Ad card ({detail.card.status}):</span> {detail.card.name} · {detail.card.targetUrl}
                {detail.card.reason ? ` · ${detail.card.reason}` : ''}
              </p>
            )}
            <p className="text-sm">
              <span className="label">Invited:</span> {detail.invites.length} ({detail.invites.filter((i) => i.referralPaid).length} playing){detail.wallet.referredBy ? ` · invited by ${detail.wallet.referredBy.slice(0, 8)}` : ''}
            </p>

            <details>
              <summary className="label cursor-pointer">Coin ledger ({detail.ledger.length})</summary>
              <ul className="mt-2 max-h-64 overflow-y-auto border-2 border-ink text-sm">
                {detail.ledger.map((l, i) => (
                  <li key={i} className="flex justify-between gap-2 border-b border-ink/10 px-3 py-1">
                    <span>
                      {l.reason} <span className="text-ink/50">{l.ref}</span>
                    </span>
                    <span className="tabular-nums">
                      {l.delta > 0 ? '+' : ''}
                      {l.delta} → {l.balanceAfter} · {when(l.at)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
            <details>
              <summary className="label cursor-pointer">Games ({detail.attempts.length})</summary>
              <ul className="mt-2 max-h-64 overflow-y-auto border-2 border-ink text-sm">
                {detail.attempts.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-2 border-b border-ink/10 px-3 py-1">
                    <span>
                      {g.status} · {formatMs(g.durationMs)} · {g.moves ?? '—'} moves · {when(g.startedAt)}
                      {g.paidCoins ? ` · paid ${g.paidCoins}` : ''}
                    </span>
                    {g.status === 'solved' && (
                      <button type="button" className="label text-bh-red underline" onClick={() => voidGame(g.id)}>
                        Void
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
            <details>
              <summary className="label cursor-pointer">Coin orders ({detail.orders.length})</summary>
              <ul className="mt-2 border-2 border-ink text-sm">
                {detail.orders.map((o) => (
                  <li key={o.id} className="border-b border-ink/10 px-3 py-1">
                    {o.coins} coins · {o.status} · {when(o.createdAt)} · ref {o.paymentRef ?? '—'}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}
      </Section>

      <Section title="Coin pack orders">
        <Table
          head={['Order', 'Edition', 'Coins', 'Amount', 'Status', 'Created']}
          rows={orders.map((o) => (
            <tr key={o.id}>
              <td className="px-3 py-2">
                <button type="button" className="font-mono underline" onClick={() => open(o.walletId)}>
                  {o.id.slice(0, 8)}
                </button>
              </td>
              <td className="px-3 py-2 uppercase">{o.region}</td>
              <td className="px-3 py-2 tabular-nums">{o.coins.toLocaleString()}</td>
              <td className="px-3 py-2 tabular-nums">{(o.amountCents / 100).toLocaleString()}</td>
              <td className="px-3 py-2">{o.status}</td>
              <td className="px-3 py-2">{when(o.createdAt)}</td>
            </tr>
          ))}
          empty="No coin orders yet."
        />
      </Section>
    </div>
  );
}
