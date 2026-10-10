import { useCallback, useEffect, useRef, useState } from 'react';
import { minNextBidCents, shieldSecondsFor } from './rules.js';

// Practice mode: a private, in-browser simulation of the throne. Play money,
// computer rivals, nothing sent to the server. Bots are clearly labelled and
// exist ONLY here: never let simulated bidders touch the real throne (that
// would be shill bidding).

export const START_PLAY_MONEY_CENTS = 50_000;

const BOTS = [
  { name: 'PixelPirate', tagline: 'Follow me for alpha strategies' },
  { name: 'MemeLord9000', tagline: 'This billboard is mine now' },
  { name: 'Nova Coffee', tagline: 'Fuel for builders. 20% off this week.' },
  { name: 'GridRunner', tagline: 'Speedruns every Friday' },
  { name: 'Lagos Sneaker Co', tagline: 'Fresh drops, no queue' },
  { name: 'Captain Crypto', tagline: 'Not financial advice' },
];

// Delay between bot attempts, in ms.
export const BOT_SPEEDS = {
  off: null,
  slow: [7000, 14000],
  fast: [2000, 5000],
};

const random = (min, max) => min + Math.random() * (max - min);

let nextId = 1;
const makeKing = ({ name, tagline, amountCents, you }, rules, now) => ({
  id: `practice-${nextId++}`,
  name,
  tagline,
  imageUrl: null,
  amountCents,
  you,
  startedAt: new Date(now).toISOString(),
  shieldEndsAt: new Date(now + shieldSecondsFor(amountCents, rules) * 1000).toISOString(),
});

export function usePracticeSim(rules, speed) {
  const [sim, setSim] = useState(() => ({
    throne: null,
    log: [],
    stats: { takeovers: 0, volumeCents: 0 },
    playMoneyCents: START_PLAY_MONEY_CENTS,
    timesCrowned: 0,
  }));
  const simRef = useRef(sim);
  simRef.current = sim;

  const crown = useCallback(
    (bidder) =>
      setSim((s) => {
        const king = makeKing(bidder, rules, Date.now());
        return {
          ...s,
          throne: king,
          log: [{ ...king, previousName: s.throne?.name ?? null, youLost: Boolean(s.throne?.you && !bidder.you) }, ...s.log].slice(0, 12),
          stats: { takeovers: s.stats.takeovers + 1, volumeCents: s.stats.volumeCents + bidder.amountCents },
          timesCrowned: s.timesCrowned + (bidder.you ? 1 : 0),
        };
      }),
    [rules],
  );

  const playerBid = useCallback(
    ({ name, tagline, amountCents }) => {
      const s = simRef.current;
      const min = minNextBidCents(s.throne, Date.now(), rules);
      if (amountCents < min) return `Bid at least $${(min / 100).toFixed(2)}.`;
      if (amountCents > s.playMoneyCents) return 'Not enough play money. Reset to start over.';
      setSim((cur) => ({ ...cur, playMoneyCents: cur.playMoneyCents - amountCents }));
      crown({ name: name || 'You', tagline, amountCents, you: true });
      return null;
    },
    [crown, rules],
  );

  // Bot loop. Each attempt a rival picks a private ceiling; if the price is
  // still under it, it takes the throne, sometimes with a jump bid.
  useEffect(() => {
    const range = BOT_SPEEDS[speed];
    if (!range) return;
    let timer;
    const schedule = () => {
      timer = setTimeout(() => {
        const s = simRef.current;
        const min = minNextBidCents(s.throne, Date.now(), rules);
        const rivals = BOTS.filter((b) => b.name !== s.throne?.name);
        const bot = rivals[Math.floor(Math.random() * rivals.length)];
        const ceiling = random(1500, 12000) + s.stats.takeovers * 150;
        if (min <= ceiling) {
          const jump = Math.random() < 0.3 ? Math.round(random(100, 500) / 50) * 50 : 0;
          crown({ ...bot, amountCents: min + jump, you: false });
        }
        schedule();
      }, random(...range));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [speed, rules, crown]);

  const reset = useCallback(
    () =>
      setSim({
        throne: null,
        log: [],
        stats: { takeovers: 0, volumeCents: 0 },
        playMoneyCents: START_PLAY_MONEY_CENTS,
        timesCrowned: 0,
      }),
    [],
  );

  return { sim, playerBid, reset };
}
