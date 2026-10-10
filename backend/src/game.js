import {
  BOARD_IDS,
  BOOKING_DAYS,
  bookingPriceCents,
  minNextBidCents,
  pickRelegationBoard,
  relegationPriceCents,
  shieldSecondsFor,
  termEndsAtMs,
} from './rules.js';
import { isOwner } from './services/owners.js';

// A taken-down ad keeps its place in history (price, times) but its content is
// gone: no name, tagline, image or link reaches any visitor.
export function maskRemoved(entry) {
  if (!entry) return entry;
  if (!entry.removedAt) return { ...entry, removed: false };
  return { ...entry, name: 'Removed ad', tagline: null, imageUrl: null, targetUrl: null, address: null, removed: true };
}

// Core rules: the throne auction, board bookings, relegation, King of the Day.
export function createGame({ store, payments, realtime, hype, rules }) {
  // Never expose payment references or owner hashes to the browser.
  const publicBid = (b) =>
    b &&
    maskRemoved({
      id: b.id,
      board: b.board,
      name: b.name,
      tagline: b.tagline,
      imageUrl: b.imageUrl,
      targetUrl: b.targetUrl,
      amountCents: b.amountCents,
      // Only ads that paid for the map add-on carry an address.
      address: b.addonCents > 0 || b.relegatedFrom ? b.address : null,
      clicks: b.clicks,
      removedAt: b.removedAt,
      ...(b.board === 'throne'
        ? {
            startedAt: b.settledAt,
            shieldEndsAt: b.shieldEndsAt,
            termEndsAt: b.settledAt ? new Date(termEndsAtMs(b, rules)).toISOString() : null,
          }
        : { days: b.days, startsAt: b.startsAt, endsAt: b.endsAt }),
    });

  const publicRound = (r) => r && { id: r.id, baseEndsAt: r.baseEndsAt, endsAt: r.endsAt, takeovers: r.takeovers };

  const boardPrices = (board) => Object.fromEntries(BOOKING_DAYS.map((d) => [d, bookingPriceCents(board, d, rules)]));

  async function getState() {
    const now = Date.now();
    const recentSince = new Date(now - rules.recentlyDethronedHours * 3600_000).toISOString();
    const [{ bid, takeovers, volumeCents, recordCents }, boards, recent, recentlyDethroned, { round }, [lastKing], { advertisers, ads }, topAdvertisers] = await Promise.all([
      store.getThrone(),
      store.getBoards(now),
      store.getLegends({ sort: 'recent', limit: 15, offset: 0 }),
      store.getRecentlyDethroned(recentSince),
      store.tickThrone(rules),
      store.getDayKings(1),
      store.countAdvertisers(),
      store.getTopAdvertisers(8),
    ]);
    crownDueAt = Math.min(Date.parse(round.endsAt), bid ? termEndsAtMs(bid, rules) : Infinity);

    return {
      throne: publicBid(bid),
      minNextBidCents: minNextBidCents(bid, now, rules),
      boards: BOARD_IDS.map((id) => {
        const b = boards[id];
        const nextFreeAt = new Date(Math.max(now, b.bookedUntil ? Date.parse(b.bookedUntil) : 0)).toISOString();
        return {
          id,
          name: rules.boards[id].name,
          prices: boardPrices(id),
          current: publicBid(b.current),
          nextStartsAt: b.nextStartsAt,
          upcoming: b.upcoming,
          nextFreeAt,
        };
      }),
      // Free bonus exposure for kings who were just overthrown.
      recentlyDethroned: recentlyDethroned
        .filter((l) => !l.removedAt)
        .slice(0, 8)
        .map((l) => maskRemoved(l)),
      stats: { takeovers, volumeCents, recordCents, advertisers, ads },
      // Public already (every price is shown on the boards); summed per advertiser.
      topAdvertisers,
      crown: { round: publicRound(round), lastKing: maskRemoved(lastKing) ?? null },
      recentLegends: recent.items.map(maskRemoved),
      rules,
      paymentsMode: payments.mode,
      serverTime: new Date(now).toISOString(),
    };
  }

  async function getMinNextBidCents() {
    const { bid } = await store.getThrone();
    return minNextBidCents(bid, Date.now(), rules);
  }

  // How far ahead a board is booked; refuse bookings beyond the horizon.
  async function bookingStartEstimate(board) {
    const now = Date.now();
    const b = (await store.getBoards(now))[board];
    const start = Math.max(now, b.bookedUntil ? Date.parse(b.bookedUntil) : 0);
    return { start, tooFar: start - now > rules.maxBookingAheadDays * 86400_000 };
  }

  // --- King of the Day + term limit ---
  // The ticker runs every second but only asks the database when something is
  // due (or every 30 s, in case another API instance changed it).
  let crownDueAt = 0;
  let crownCheckedAt = 0;

  async function announce({ crowned, retired }) {
    if (crowned?.bidId) {
      const king = maskRemoved(await store.getBid(crowned.bidId));
      realtime.broadcast('crowned', { roundId: crowned.roundId, name: king.name, amountCents: king.amountCents });
    }
    if (retired?.bidId) {
      const king = maskRemoved(await store.getBid(retired.bidId));
      realtime.broadcast('retired', { name: king.name });
    }
  }

  async function tick() {
    const now = Date.now();
    if (now < crownDueAt && now - crownCheckedAt < 30_000) return;
    crownCheckedAt = now;
    const result = await store.tickThrone(rules);
    const { bid } = await store.getThrone();
    crownDueAt = Math.min(Date.parse(result.round.endsAt), bid ? termEndsAtMs(bid, rules) : Infinity);
    await announce(result);
  }

  const getDayKings = async (limit) => (await store.getDayKings(limit)).map(maskRemoved);

  // --- Relegation: a dethroned king moves the same ad to the Prince Board ---
  async function getRelegationOffer(bidId, ownerToken) {
    const bid = await store.getBid(bidId);
    if (!bid || bid.board !== 'throne' || !isOwner(bid, ownerToken)) return { eligible: false, reason: 'not-owner' };
    if (bid.removedAt) return { eligible: false, reason: 'removed' };
    const legend = await store.getLegend(bidId);
    if (!legend || legend.retired) return { eligible: false, reason: 'not-dethroned' };
    const expiresAt = Date.parse(legend.deposedAt) + rules.relegationWindowHours * 3600_000;
    if (Date.now() > expiresAt) return { eligible: false, reason: 'expired' };
    if (await store.hasRelegation(bidId)) return { eligible: false, reason: 'used' };
    const now = Date.now();
    const boards = await store.getBoards(now);
    const board = pickRelegationBoard(boards, now);
    const startsAt = Math.max(now, boards[board].bookedUntil ? Date.parse(boards[board].bookedUntil) : 0);
    return {
      eligible: true,
      bid,
      board,
      boardName: rules.boards[board].name,
      priceCents: relegationPriceCents(board, rules),
      // An estimate: the slot is fixed when payment clears.
      startsAt: new Date(startsAt).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  // --- Settlement ---
  // Called once a payment has cleared (Stripe webhook or demo button).
  // Idempotent: a retried webhook for an already-settled ad is a no-op.
  async function settle(bidId, paymentRef) {
    const result = await store.settleBid(bidId, paymentRef, rules);
    await announce(result);
    if (result.round) crownDueAt = Date.parse(result.round.endsAt);

    // 'outbid': another throne payment cleared first, or the shield premium applied.
    // 'void': a relegation that was already used. Either way: full refund.
    if (result.status === 'outbid' || result.status === 'void') {
      try {
        // Refund everything that was charged, including any map add-on.
        if (paymentRef) await payments.refund(paymentRef, result.bid.amountCents + (result.bid.addonCents ?? 0), `${result.status}-${bidId}`);
        await store.setStatus(bidId, 'refunded');
      } catch (err) {
        console.error(`[game] REFUND FAILED for ${result.status} ad ${bidId}; refund manually.`, err);
      }
      return result;
    }
    if (result.status !== 'won') return result;

    const { bid, previous } = result;
    if (bid.board !== 'throne') {
      realtime.broadcast('booked', { board: bid.board, startsAt: bid.startsAt });
      return result;
    }

    realtime.broadcast('takeover', {
      throne: publicBid(bid),
      previousName: previous ? maskRemoved(previous).name : null,
      // The dethroned king's browser recognizes its own ad and offers relegation.
      previousBidId: previous?.id ?? null,
      round: publicRound(result.round),
    });
    await hype.enqueue({ bid, previous });
    return result;
  }

  return {
    getState,
    getMinNextBidCents,
    bookingStartEstimate,
    shieldSecondsFor: (amountCents) => shieldSecondsFor(amountCents, rules),
    getRelegationOffer,
    settle,
    tick,
    getDayKings,
  };
}
