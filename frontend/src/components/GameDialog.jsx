import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Crown, Flag, Loader2, Timer, X } from 'lucide-react';
import { useModal } from '../lib/useModal.js';
import { applyMove, clearProgress, isSolved, loadProgress, saveProgress } from '../lib/puzzle.js';
import { formatMs, refreshWallet, rememberGame, useWallet, walletApi } from '../lib/wallet.js';
import { sfx } from '../lib/sound.js';
import ShareButtons from './ShareButtons.jsx';

const Puzzle3D = lazy(() => import('./Puzzle3D.jsx'));

function useTicker(active) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 50);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

// One ranked try: the server deals a fresh board and keeps the time.
export default function GameDialog({ toBeatMs, onClose, onFinished, onNeedCard }) {
  const dialog = useModal(onClose);
  const { wallet } = useWallet();
  const [phase, setPhase] = useState('loading'); // loading | confirmPay | wait | playing | finishing | result | error
  const [game, setGame] = useState(null);
  const [board, setBoard] = useState(null);
  const [moves, setMoves] = useState([]);
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [waitUntil, setWaitUntil] = useState(null);
  const [payCoins, setPayCoins] = useState(null);
  const finishing = useRef(false);
  // The parent re-renders every tick; keep its callbacks in refs so the deal
  // happens exactly once per Play press.
  const onNeedCardRef = useRef(onNeedCard);
  const onFinishedRef = useRef(onFinished);
  onNeedCardRef.current = onNeedCard;
  onFinishedRef.current = onFinished;
  const now = useTicker(phase === 'playing' || phase === 'wait');

  const begin = useCallback(
    async (pay = false) => {
      setPhase('loading');
      setError(null);
      try {
        const g = await walletApi.start(pay);
        setOffset(Date.parse(g.serverTime) - Date.now());
        // Resumed after a reload: replay this browser's saved moves.
        let b = g.board;
        const saved = g.resumed ? loadProgress(g.attemptId) : [];
        const kept = [];
        for (const m of saved) {
          const next = applyMove(b, m);
          if (!next) break;
          b = next;
          kept.push(m);
        }
        if (!g.resumed) clearProgress();
        setGame(g);
        setBoard(b);
        setMoves(kept);
        finishing.current = false;
        setPhase('playing');
        refreshWallet();
      } catch (err) {
        const body = err.body ?? {};
        if (body.needsCard) {
          onNeedCardRef.current?.();
          dialog.current?.close();
          return;
        }
        if (body.needsPay) {
          setPayCoins(body.status?.extraAttemptCoins ?? null);
          setPhase('confirmPay');
          return;
        }
        if (err.status === 429 && body.status?.readyAt && Date.parse(body.status.readyAt) > Date.now()) {
          setWaitUntil(Date.parse(body.status.readyAt));
          setError(err.message);
          setPhase('wait');
          return;
        }
        setError(err.message);
        setPhase('error');
      }
    },
    [dialog],
  );

  // Once per open (React's dev double-mount would otherwise deal twice).
  const dealt = useRef(false);
  useEffect(() => {
    if (dealt.current) return;
    dealt.current = true;
    begin(false);
  }, [begin]);

  const finish = useCallback(
    async (allMoves) => {
      if (finishing.current) return;
      finishing.current = true;
      setPhase('finishing');
      try {
        const r = await walletApi.finish(game.attemptId, allMoves);
        clearProgress();
        rememberGame(r);
        setResult(r);
        setPhase('result');
        if (r.crowned) sfx.takeover();
        refreshWallet();
        onFinishedRef.current?.(r);
      } catch (err) {
        clearProgress();
        rememberGame({ ok: false });
        setError(err.message);
        setPhase('error');
        onFinishedRef.current?.(null);
      }
    },
    [game],
  );

  const move = useCallback(
    (index) => {
      if (phase !== 'playing') return;
      const next = applyMove(board, index);
      if (!next) return;
      const all = [...moves, index];
      setBoard(next);
      setMoves(all);
      saveProgress(game.attemptId, all);
      sfx.tick();
      if (isSolved(next)) finish(all);
    },
    [phase, board, moves, game, finish],
  );

  const giveUp = async () => {
    if (game) await walletApi.abandon(game.attemptId).catch(() => {});
    clearProgress();
    rememberGame({ ok: false });
    onFinishedRef.current?.(null);
    dialog.current.close();
  };

  const elapsed = game ? now + offset - Date.parse(game.startedAt) : 0;
  const waitLeft = waitUntil ? Math.max(0, Math.ceil((waitUntil - now) / 1000)) : 0;

  return (
    <dialog
      ref={dialog}
      aria-labelledby="game-title"
      className="m-auto max-h-[96vh] w-[calc(100%-1rem)] max-w-xl overflow-y-auto border-4 border-ink bg-paper p-0 text-ink shadow-hard-lg backdrop:bg-ink/70"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b-4 border-ink bg-bh-red px-4 py-3 text-white">
        <h2 id="game-title" className="flex items-center gap-2 font-black uppercase tracking-wider">
          <Crown className="h-5 w-5" strokeWidth={3} /> Throne race
        </h2>
        {phase === 'playing' ? (
          <button type="button" onClick={giveUp} className="label flex items-center gap-1 hover:opacity-80">
            <Flag className="h-4 w-4" strokeWidth={3} /> Give up
          </button>
        ) : (
          <button type="button" onClick={() => dialog.current.close()} aria-label="Close" className="hover:opacity-80">
            <X className="h-5 w-5" strokeWidth={3} />
          </button>
        )}
      </div>

      <div className="p-3 sm:p-5">
        {(phase === 'loading' || phase === 'finishing') && (
          <p className="label flex items-center justify-center gap-2 py-16">
            <Loader2 className="h-5 w-5 animate-spin" strokeWidth={3} /> {phase === 'loading' ? 'Dealing your board' : 'Checking your solve'}
          </p>
        )}

        {phase === 'confirmPay' && (
          <div className="space-y-4 py-4 text-center">
            <p className="text-lg font-bold">Your free tries for today are used.</p>
            <button type="button" className="btn w-full bg-bh-red text-white" disabled={wallet && payCoins && wallet.balance < payCoins} onClick={() => begin(true)}>
              Play again for {payCoins ?? '?'} coins
            </button>
            {wallet && payCoins && wallet.balance < payCoins && <p className="text-sm font-bold text-bh-red">Not enough coins. Claim your daily coins or invite a friend.</p>}
            <p className="text-sm text-ink/60">Free tries come back when the daily race resets.</p>
          </div>
        )}

        {phase === 'wait' && (
          <div className="space-y-4 py-6 text-center">
            <p className="font-bold">{error}</p>
            <p className="display text-6xl tabular-nums">{waitLeft}s</p>
            <button type="button" className="btn w-full bg-onyx text-white" disabled={waitLeft > 0} onClick={() => begin(false)}>
              {waitLeft > 0 ? 'Next try opens soon' : 'Play'}
            </button>
            <p className="text-xs text-ink/60">Fair play: a short reset timer after every try, and a longer one after several unfinished tries. It follows your wallet and device, not just this browser.</p>
          </div>
        )}

        {phase === 'playing' && board && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-2xl font-black tabular-nums sm:text-3xl" aria-live="off">
                <Timer className="h-6 w-6" strokeWidth={3} /> {formatMs(elapsed)}
              </p>
              <div className="text-right text-xs font-bold uppercase tracking-wider">
                <p>{moves.length} moves</p>
                {toBeatMs ? <p className={elapsed > toBeatMs ? 'text-ink/50' : 'text-bh-red'}>To beat {formatMs(toBeatMs)}</p> : <p className="text-bh-red">Throne is open</p>}
              </div>
            </div>
            <Suspense fallback={<div className="flex aspect-square w-full items-center justify-center border-4 border-ink bg-onyx"><Loader2 className="h-8 w-8 animate-spin text-white" /></div>}>
              <Puzzle3D board={board} onMove={move} />
            </Suspense>
            <p className="text-center text-xs text-ink/60">Put the tiles in order, 1 to 15, gap last. Tap a tile next to the gap, swipe, or use the arrow keys. Each row has its own color.</p>
            {game?.resumed && <p className="text-center text-xs font-bold">Game resumed: the clock kept running.</p>}
          </div>
        )}

        {phase === 'result' && result && (
          <div className="space-y-4 text-center">
            <div className={`border-4 border-ink p-5 ${result.crowned ? 'bg-bh-yellow' : 'bg-bh-cream'}`}>
              {result.crowned ? (
                <>
                  <Crown className="mx-auto h-12 w-12" strokeWidth={2.5} />
                  <p className="display text-3xl">You took the Throne!</p>
                  <p className="mt-1 font-medium">Your ad is live on the big billboard right now. +{result.takeoverCoins} coins.</p>
                </>
              ) : (
                <>
                  <p className="display text-3xl">Solved!</p>
                  <p className="mt-1 font-medium">{result.rank ? `You're #${result.rank} today.` : 'Nice run.'} {result.cardApproved ? 'Beat the king to take the Throne.' : ''}</p>
                </>
              )}
              <p className="mt-3 text-5xl font-black tabular-nums">{formatMs(result.durationMs)}</p>
              <p className="label text-ink/60">{result.moves} moves</p>
            </div>
            <ShareButtons ms={result.durationMs} crowned={result.crowned} rank={result.rank} referralCode={wallet?.referralCode} />
            <button type="button" className="btn w-full bg-bh-red text-white" onClick={() => begin(false)}>
              Play again
            </button>
          </div>
        )}

        {phase === 'error' && (
          <div className="space-y-4 py-6 text-center">
            <p role="alert" className="border-2 border-ink bg-bh-red px-3 py-2 font-bold text-white">
              {error}
            </p>
            <button type="button" className="btn-outline w-full" onClick={() => dialog.current.close()}>
              Close
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
}
