import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Loader2, RotateCcw, Timer } from 'lucide-react';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import { applyMove, isSolved, practiceBoard } from '../lib/puzzle.js';
import { formatMs } from '../lib/wallet.js';
import { sfx } from '../lib/sound.js';

const Puzzle3D = lazy(() => import('../components/Puzzle3D.jsx'));

const BEST_KEY = 'throne.practiceBest';
const readBest = () => {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || null;
  } catch {
    return null;
  }
};

// Unranked practice: same 3D puzzle, boards made in the browser, no wallet,
// no limits. Learn the moves before racing for the Throne.
export default function PracticePage() {
  const [board, setBoard] = useState(() => practiceBoard());
  const [moves, setMoves] = useState(0);
  const [startedAt, setStartedAt] = useState(null);
  const [doneMs, setDoneMs] = useState(null);
  const [best, setBest] = useState(readBest);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!startedAt || doneMs) return;
    const id = setInterval(() => setNow(Date.now()), 50);
    return () => clearInterval(id);
  }, [startedAt, doneMs]);

  const reset = () => {
    setBoard(practiceBoard());
    setMoves(0);
    setStartedAt(null);
    setDoneMs(null);
  };

  const move = useCallback(
    (i) => {
      if (doneMs) return;
      const next = applyMove(board, i);
      if (!next) return;
      const t0 = startedAt ?? Date.now();
      if (!startedAt) setStartedAt(t0);
      setBoard(next);
      setMoves((m) => m + 1);
      sfx.tick();
      if (isSolved(next)) {
        const ms = Date.now() - t0;
        setDoneMs(ms);
        sfx.booked?.();
        if (!best || ms < best) {
          setBest(ms);
          try {
            localStorage.setItem(BEST_KEY, String(ms));
          } catch {
            // storage blocked
          }
        }
      }
    },
    [board, doneMs, startedAt, best],
  );

  const elapsed = doneMs ?? (startedAt ? now - startedAt : 0);

  return (
    <div className="min-h-screen bg-canvas">
      <Header />
      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-5 lg:px-8">
        <section className="lg:col-span-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-3xl font-black tabular-nums">
              <Timer className="h-7 w-7" strokeWidth={3} /> {formatMs(elapsed)}
            </p>
            <p className="label">{moves} moves</p>
          </div>
          <Suspense fallback={<div className="flex aspect-square w-full items-center justify-center border-4 border-ink bg-onyx"><Loader2 className="h-8 w-8 animate-spin text-white" /></div>}>
            <Puzzle3D board={board} onMove={move} solved={Boolean(doneMs)} />
          </Suspense>
        </section>
        <aside className="space-y-5 lg:col-span-2">
          <div>
            <p className="label text-bh-blue">Practice · unranked</p>
            <h1 className="display mt-2 text-5xl">Train for the Throne</h1>
            <p className="mt-3 font-medium text-ink/75">
              The same 3D puzzle as the daily race. Put the tiles in order, 1 to 15, gap last. The clock starts with your first move. Nothing here counts: no coins, no limits.
            </p>
          </div>
          {doneMs && (
            <div className="border-4 border-ink bg-bh-yellow p-4">
              <p className="display text-3xl">Solved in {formatMs(doneMs)}</p>
              <p className="font-medium">{best === doneMs ? 'New personal best!' : `Your best: ${formatMs(best)}`}</p>
            </div>
          )}
          <dl className="grid grid-cols-2 gap-2 text-center">
            <div className="border-2 border-ink bg-paper p-3">
              <dt className="label text-ink/60">Best (this browser)</dt>
              <dd className="text-2xl font-black tabular-nums">{formatMs(best)}</dd>
            </div>
            <div className="border-2 border-ink bg-paper p-3">
              <dt className="label text-ink/60">Moves</dt>
              <dd className="text-2xl font-black tabular-nums">{moves}</dd>
            </div>
          </dl>
          <button type="button" onClick={reset} className="btn-outline w-full">
            <RotateCcw className="h-4 w-4" strokeWidth={3} /> New board
          </button>
          <a href="/" className="btn-red w-full">
            Race for the Throne
          </a>
          <ul className="space-y-1.5 text-sm font-medium">
            <li>• Tap a tile next to the gap, swipe, or use the arrow keys.</li>
            <li>• Each row has its own color: red, blue, yellow, black.</li>
            <li>• Tip: finish the top row, then the second, then solve the last two rows together.</li>
          </ul>
        </aside>
      </main>
      <Footer />
    </div>
  );
}
