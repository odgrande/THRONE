import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Clock, Crown, Loader2, Pencil, Play, Shield, Trophy, Users } from 'lucide-react';
import { useWallet, walletApi, formatMs, refreshWallet } from '../lib/wallet.js';
import AdFields, { EMPTY_AD, adPayload } from './AdFields.jsx';
import AcceptRules, { termsVersion } from './AcceptRules.jsx';
import Turnstile, { TURNSTILE_SITE_KEY } from './Turnstile.jsx';
import { WalletDialog } from './WalletChip.jsx';
import { coinFmt } from './WalletPanel.jsx';
import { CornerMark } from './Shape.jsx';

const GameDialog = lazy(() => import('./GameDialog.jsx'));

const clock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
  return s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
};

// The player's ad card: what the Throne shows when their time wins.
function CardForm({ card, onSaved, onCancel }) {
  const [ad, setAd] = useState(card ? { ...EMPTY_AD, name: card.name, tagline: card.tagline ?? '', targetUrl: card.targetUrl } : EMPTY_AD);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [botToken, setBotToken] = useState(null);
  const turnstileRef = useRef(null);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = await adPayload({ ...ad, withMap: false, withVideo: false });
      const r = await walletApi.saveCard({ ...payload, keepImage: !ad.image && Boolean(card?.imageUrl), acceptedTerms: termsVersion(), turnstileToken: botToken });
      await refreshWallet();
      onSaved(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      turnstileRef.current?.reset();
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4 border-4 border-ink bg-paper p-4 text-ink">
      <p className="display text-xl">Your ad card</p>
      <p className="text-sm text-ink/70">This is what shows on the Throne when your time wins. Free: no payment.</p>
      <AdFields ad={ad} onChange={setAd} onError={setError} idPrefix="card" mapAddonCents={0} videoAddonCents={0} />
      {card?.imageUrl && !ad.image && <p className="text-xs text-ink/60">Your current picture is kept unless you choose a new one.</p>}
      <Turnstile ref={turnstileRef} onToken={setBotToken} />
      <AcceptRules kind="game" checked={accepted} onChange={setAccepted} idPrefix="card" />
      {error && <p role="alert" className="border-2 border-ink bg-bh-red px-3 py-2 text-sm font-bold text-white">{error}</p>}
      <button type="submit" disabled={busy || !accepted || (Boolean(TURNSTILE_SITE_KEY) && !botToken)} className="btn-red w-full">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" strokeWidth={3} /> : 'Save my ad card'}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} className="label w-full py-1 text-ink/60 hover:text-bh-red">
          Cancel
        </button>
      )}
    </form>
  );
}

export function Leaderboard({ board, compact = false }) {
  if (!board) return null;
  const rows = compact ? board.top.slice(0, 5) : board.top;
  return (
    <div className="border-4 border-ink bg-paper text-ink">
      <p className="label flex items-center justify-between gap-2 border-b-4 border-ink bg-bh-yellow px-3 py-2">
        <span className="flex shrink-0 items-center gap-1.5">
          <Trophy className="h-4 w-4" strokeWidth={3} /> Today's fastest
        </span>
        <span className="text-ink/70">
          {board.stats?.players ?? 0} {board.stats?.players === 1 ? 'player' : 'players'}
        </span>
      </p>
      {rows.length ? (
        <ol className="divide-y-2 divide-ink/10">
          {rows.map((e) => (
            <li key={e.rank} className={`flex items-center justify-between gap-2 px-3 py-1.5 text-sm ${e.me ? 'bg-bh-cream font-black' : ''}`}>
              <span className="flex min-w-0 items-center gap-2">
                <span className="w-6 shrink-0 font-black tabular-nums">{e.rank === 1 ? '👑' : `#${e.rank}`}</span>
                <span className="truncate">
                  {e.name}
                  {e.me ? ' (you)' : ''}
                </span>
              </span>
              <span className="shrink-0 font-bold tabular-nums">{formatMs(e.bestMs)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="px-3 py-3 text-sm text-ink/60">No solves yet today. Be the first!</p>
      )}
    </div>
  );
}

// The home page's main panel in game mode: play for the Throne.
export default function GamePanel({ now, refreshKey, onChanged, feed = [] }) {
  const { wallet } = useWallet();
  const [board, setBoard] = useState(null);
  const [status, setStatus] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [editCard, setEditCard] = useState(false);
  const [shieldMsg, setShieldMsg] = useState(null);
  const [cardNote, setCardNote] = useState(null);

  const load = useCallback(async () => {
    walletApi.leaderboard().then(setBoard, () => {});
    if (wallet) walletApi.gameStatus().then(setStatus, () => setStatus(null));
  }, [wallet]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // Cooldowns and the daily reset are timed: refresh when the next one passes.
  useEffect(() => {
    if (!status) return;
    const due = Math.min(...[status.readyAt, status.roundEndsAt].map(Date.parse).filter((t) => t > Date.now()));
    if (!Number.isFinite(due)) return;
    const id = setTimeout(load, Math.min(due - Date.now() + 500, 3600_000));
    return () => clearTimeout(id);
  }, [status, load]);

  const king = board?.king;
  const card = wallet?.card;
  const readyIn = status ? Date.parse(status.readyAt) - now : 0;
  const shieldLeft = king?.shieldEndsAt ? Date.parse(king.shieldEndsAt) - now : 0;

  const play = () => {
    if (!wallet) return setWalletOpen(true);
    if (!card || card.status === 'rejected') return setEditCard(true);
    setCardNote(null);
    setPlaying(true);
  };

  const buyShield = async (blocks) => {
    setShieldMsg(null);
    try {
      const r = await walletApi.shield(blocks);
      setShieldMsg(`Shielded for ${r.blocks * 10} more minutes (−${coinFmt(r.coins)} coins).`);
      refreshWallet();
      load();
      onChanged?.();
    } catch (err) {
      setShieldMsg(err.message);
    }
  };

  return (
    <div className="card space-y-5 p-5 sm:p-6">
      <CornerMark index={0} />
      <div>
        <p className="label text-bh-blue">Free to play · Daily race</p>
        <h2 className="display mt-1 text-3xl sm:text-4xl">Win the Throne</h2>
        <p className="mt-2 font-medium leading-snug text-ink/75">Solve the 3D puzzle faster than the king and your ad takes the big billboard, live. New race every day.</p>
      </div>

      {/* The king to beat */}
      <div className="border-2 border-ink bg-bh-cream p-3 text-ink">
        {king?.scoreMs ? (
          <>
            <p className="label flex items-center gap-1.5 text-ink/70">
              <Crown className="h-4 w-4" strokeWidth={3} /> {king.mine ? 'You are the king!' : 'Time to beat'}
            </p>
            <p className="display text-4xl normal-case tabular-nums">{formatMs(king.toBeatMs)}</p>
            <p className="truncate text-sm font-bold">{king.name}</p>
            {shieldLeft > 0 && (
              <p className="mt-1 flex items-center gap-1 text-xs font-bold text-bh-blue">
                <Shield className="h-3.5 w-3.5" strokeWidth={3} /> Crown Shield {clock(shieldLeft)}: challengers must be 10% faster
              </p>
            )}
          </>
        ) : (
          <>
            <p className="label flex items-center gap-1.5 text-ink/70">
              <Crown className="h-4 w-4" strokeWidth={3} /> The Throne is open today
            </p>
            <p className="font-bold">Any solve takes it. Go!</p>
          </>
        )}
      </div>

      {wallet?.banned ? (
        <p className="border-2 border-ink bg-bh-red px-3 py-2 text-sm font-bold text-white">This wallet is suspended. Email therone@gmail.com.</p>
      ) : (
        <button type="button" onClick={play} disabled={wallet && card?.status === 'review'} className="btn-red w-full text-xl" data-testid="play">
          <Play className="h-6 w-6" strokeWidth={3} />
          {!wallet ? 'Play free' : !card ? 'Set up your ad card' : card.status === 'review' ? 'Ad card in review…' : status?.openAttemptId ? 'Resume your game' : readyIn > 0 ? `Next try in ${clock(readyIn)}` : 'Play now'}
        </button>
      )}

      {board?.roundEndsAt && (
        <p className="text-xs font-bold uppercase tracking-wider text-bh-red">Today’s race ends in {clock(Date.parse(board.roundEndsAt) - now)}: fastest then is King of the Day</p>
      )}
      {wallet && (wallet.records?.bestMs || wallet.streak > 0) && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold">
          {wallet.records?.bestMs ? <span>Your best: {formatMs(wallet.records.bestMs)}</span> : null}
          {wallet.streak > 0 && <span>🔥 {wallet.streak}-day streak</span>}
        </p>
      )}

      {wallet && status && (
        <p className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-ink/70">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" strokeWidth={3} /> {status.freeLeft > 0 ? `${status.freeLeft} free tries left today` : `Extra tries: ${status.extraAttemptCoins} coins`}
          </span>
          {status.locked && <span className="text-bh-red">Break: {clock(readyIn)}</span>}
        </p>
      )}

      {cardNote && <p className="border-2 border-ink bg-bh-yellow px-3 py-2 text-sm font-bold text-ink">{cardNote}</p>}
      {card?.status === 'rejected' && (
        <p className="border-2 border-ink bg-bh-red px-3 py-2 text-sm font-bold text-white">Your ad card was not approved{card.reason ? `: ${card.reason}` : ''}. Edit it to play.</p>
      )}

      {editCard ? (
        <CardForm
          card={card}
          onCancel={() => setEditCard(false)}
          onSaved={(r) => {
            setEditCard(false);
            setCardNote(r.card.status === 'review' ? `Ad card saved. It is checked first (about ${r.holdMinutes} min); you can play once it's approved.` : 'Ad card saved. You are ready to play!');
            load();
          }}
        />
      ) : (
        card && (
          <div className="flex items-center justify-between gap-3 border-2 border-ink bg-canvas px-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="label block text-ink/60">Your ad card</span>
              <span className="block truncate font-bold">{card.name}</span>
            </span>
            <button type="button" className="label flex shrink-0 items-center gap-1 text-bh-blue hover:underline" onClick={() => setEditCard(true)}>
              <Pencil className="h-3.5 w-3.5" strokeWidth={3} /> Edit
            </button>
          </div>
        )
      )}

      {king?.mine && (
        <div className="space-y-2 border-4 border-ink bg-bh-yellow p-3 text-ink">
          <p className="label flex items-center gap-1.5">
            <Shield className="h-4 w-4" strokeWidth={3} /> Stay longer: Crown Shield
          </p>
          <p className="text-sm">While shielded, challengers must beat your time by 10%. {board.shield.blockCoins} coins per {board.shield.blockMinutes} min (max {board.shield.maxMinutes} min).</p>
          <div className="grid grid-cols-3 gap-2">
            {[1, 3, 6].map((b) => (
              <button key={b} type="button" className="btn-sm btn border-2 border-ink bg-paper" onClick={() => buyShield(b)}>
                {b * board.shield.blockMinutes}m · {coinFmt(b * board.shield.blockCoins)}
              </button>
            ))}
          </div>
          {shieldMsg && <p className="text-sm font-bold">{shieldMsg}</p>}
        </div>
      )}

      {feed.length > 0 && (
        <ul className="space-y-1 border-2 border-ink bg-canvas px-3 py-2 text-sm" aria-live="polite" aria-label="Live solves">
          {feed.slice(0, 4).map((e) => (
            <li key={e.at} className="flex justify-between gap-2">
              <span className="truncate">
                {e.crowned ? '👑 ' : '⚡ '}
                {e.name} {e.crowned ? 'took the Throne' : 'solved'}
              </span>
              <span className="shrink-0 font-black tabular-nums">{formatMs(e.ms)}</span>
            </li>
          ))}
        </ul>
      )}

      <Leaderboard board={board} compact />

      <div className="grid grid-cols-2 gap-2">
        <a href="/practice" className="btn-sm btn justify-center border-2 border-ink bg-paper text-ink">
          Practice free
        </a>
        <a href="/invite" className="btn-sm btn justify-center border-2 border-ink bg-paper text-ink">
          <Users className="h-4 w-4" strokeWidth={3} /> Invite & earn
        </a>
      </div>

      {playing && (
        <Suspense fallback={null}>
          <GameDialog
            toBeatMs={king?.toBeatMs ?? null}
            onClose={() => {
              setPlaying(false);
              load();
            }}
            onFinished={() => {
              load();
              onChanged?.();
            }}
            onNeedCard={() => setEditCard(true)}
          />
        </Suspense>
      )}
      {walletOpen && <WalletDialog onClose={() => setWalletOpen(false)} />}
    </div>
  );
}
