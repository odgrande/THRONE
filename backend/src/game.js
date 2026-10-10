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
// Every region (global $, ng ₦) is a separate game with its own rules; nothing
// is ever compared across regions. `regions` is config.regions.
export function createGame({ store, payments, realtime, hype, regions }) {
  const REGION_IDS = Object.keys(regions);
  const rulesOf = (region) => {
    const r = regions[region];
    if (!r) throw new Error(`unknown region ${region}`);
    return r.rules;
  };

  // Never expose payment references or owner hashes to the browser.
  const publicBid = (b) => {
    if (!b) return b;
    const rules = rulesOf(b.region);
    return maskRemoved({
      id: b.id,
      region: b.region,
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
  };

  const publicRound = (r) => r && { id: r.id, baseEndsAt: r.baseEndsAt, endsAt: r.endsAt, takeovers: r.takeovers };

  async function getState(region) {
    const rules = rulesOf(region);
    const now = Date.now();
    const recentSince = new Date(now - rules.recentlyDethronedHours * 3600_000).toISOString();
    const [{ bid, takeovers, volumeCents, recordCents }, boards, recent, recentlyDethroned, { round }, [lastKing], { advertisers, ads }, topAdvertisers] = await Promise.all([
      store.getThrone(region),
      store.getBoards(region, now),
      store.getLegends({ region, sort: 'recent', limit: 15, offset: 0 }),
      store.getRecentlyDethroned(region, recentSince),
      store.tickThrone(region, rules),
      store.getDayKings(region, 1),
      store.countAdvertisers(region),
      store.getTopAdvertisers(region, 8),
    ]);
    dueAt[region] = Math.min(Date.parse(round.endsAt), bid ? termEndsAtMs(bid, rules) : Infinity);

    return {
      region,
      regions: REGION_IDS.map((id) => ({ id, name: regions[id].name, currency: regions[id].currency })),
      throne: publicBid(bid),
      minNextBidCents: minNextBidCents(bid, now, rules),
      boards: BOARD_IDS.map((id) => {
        const b = boards[id];
        const nextFreeAt = new Date(Math.max(now, b.bookedUntil ? Date.parse(b.bookedUntil) : 0)).toISOString();
        return {
          id,
          name: rules.boards[id].name,
          tier: rules.boards[id].tier ?? 'court',
          prices: Object.fromEntries(BOOKING_DAYS.map((d) => [d, bookingPriceCents(id, d, rules)])),
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
      paymentsMode: payments.modeFor(region),
      serverTime: new Date(now).toISOString(),
    };
  }

  async function getMinNextBidCents(region) {
    const { bid } = await store.getThrone(region);
    return minNextBidCents(bid, Date.now(), rulesOf(region));
  }

  // How far ahead a board is booked; refuse bookings beyond the horizon.
  async function bookingStartEstimate(region, board) {
    const now = Date.now();
    const b = (await store.getBoards(region, now))[board];
    const start = Math.max(now, b.bookedUntil ? Date.parse(b.bookedUntil) : 0);
    return { start, tooFar: start - now > rulesOf(region).maxBookingAheadDays * 86400_000 };
  }

  // --- King of the Day + term limit, per region ---
  // The ticker runs every second but only asks the database when something is
  // due (or every 30 s, in case another API instance changed it).
  const dueAt = Object.fromEntries(REGION_IDS.map((r) => [r, 0]));
  const checkedAt = Object.fromEntries(REGION_IDS.map((r) => [r, 0]));

  async function announce(region, { crowned, retired }) {
    if (crowned?.bidId) {
      const king = maskRemoved(await store.getBid(crowned.bidId));
      realtime.broadcast('crowned', { region, roundId: crowned.roundId, name: king.name, amountCents: king.amountCents });
    }
    if (retired?.bidId) {
      const king = maskRemoved(await store.getBid(retired.bidId));
      realtime.broadcast('retired', { region, name: king.name });
    }
  }

  async function tick() {
    for (const region of REGION_IDS) {
      const now = Date.now();
      if (now < dueAt[region] && now - checkedAt[region] < 30_000) continue;
      checkedAt[region] = now;
      const rules = rulesOf(region);
      const result = await store.tickThrone(region, rules);
      const { bid } = await store.getThrone(region);
      dueAt[region] = Math.min(Date.parse(result.round.endsAt), bid ? termEndsAtMs(bid, rules) : Infinity);
      await announce(region, result);
    }
  }

  const getDayKings = async (region, limit) => (await store.getDayKings(region, limit)).map(maskRemoved);

  // --- Relegation: a dethroned king moves the same ad to a smaller board ---
  async function getRelegationOffer(bidId, ownerToken) {
    const bid = await store.getBid(bidId);
    if (!bid || bid.board !== 'throne' || !isOwner(bid, ownerToken)) return { eligible: false, reason: 'not-owner' };
    if (bid.removedAt) return { eligible: false, reason: 'removed' };
    const rules = rulesOf(bid.region);
    const legend = await store.getLegend(bidId);
    if (!legend || legend.retired) return { eligible: false, reason: 'not-dethroned' };
    const expiresAt = Date.parse(legend.deposedAt) + rules.relegationWindowHours * 3600_000;
    if (Date.now() > expiresAt) return { eligible: false, reason: 'expired' };
    if (await store.hasRelegation(bidId)) return { eligible: false, reason: 'used' };
    const now = Date.now();
    // Same region as the throne ad: the relegation is paid in that currency.
    const boards = await store.getBoards(bid.region, now);
    const board = pickRelegationBoard(boards, now);
    const startsAt = Math.max(now, boards[board].bookedUntil ? Date.parse(boards[board].bookedUntil) : 0);
    return {
      eligible: true,
      bid,
      region: bid.region,
      board,
      boardName: rules.boards[board].name,
      priceCents: relegationPriceCents(board, rules),
      currency: rules.currency,
      // An estimate: the slot is fixed when payment clears.
      startsAt: new Date(startsAt).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  // --- Settlement ---
  // Called once a payment has cleared (processor webhook or demo button).
  // Idempotent: a retried webhook for an already-settled ad is a no-op.
  async function settle(bidId, paymentRef) {
    const pending = await store.getBid(bidId);
    if (!pending) return { status: 'missing' };
    const region = pending.region;
    const result = await store.settleBid(bidId, paymentRef, rulesOf(region));
    await announce(region, result);
    if (result.round) dueAt[region] = Date.parse(result.round.endsAt);

    // 'outbid': another throne payment cleared first, or the shield premium applied.
    // 'void': a relegation that was already used. Either way: full refund.
    if (result.status === 'outbid' || result.status === 'void') {
      try {
        // Refund everything that was charged, including any map add-on.
        if (paymentRef) {
          await payments.refund(region, paymentRef, result.bid.amountCents + (result.bid.addonCents ?? 0), `${result.status}-${bidId}`);
        }
        await store.setStatus(bidId, 'refunded');
      } catch (err) {
        console.error(`[game] REFUND FAILED for ${result.status} ad ${bidId}; refund manually.`, err);
      }
      return result;
    }
    if (result.status !== 'won') return result;

    const { bid, previous } = result;
    if (bid.board !== 'throne') {
      realtime.broadcast('booked', { region, board: bid.board, startsAt: bid.startsAt });
      return result;
    }

    realtime.broadcast('takeover', {
      region,
      throne: publicBid(bid),
      previousName: previous ? maskRemoved(previous).name : null,
      // The dethroned king's browser recognizes its own ad and offers relegation.
      previousBidId: previous?.id ?? null,
      round: publicRound(result.round),
    });
    await hype.enqueue({ bid, previous, rules: rulesOf(region) });
    return result;
  }

  return {
    getState,
    getMinNextBidCents,
    bookingStartEstimate,
    shieldSecondsFor: (region, amountCents) => shieldSecondsFor(amountCents, rulesOf(region)),
    rulesOf,
    getRelegationOffer,
    settle,
    tick,
    getDayKings,
  };
}
