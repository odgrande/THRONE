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
export function createGame({ store, payments, realtime, hype, regions, storage = null }) {
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
      videoUrl: b.videoUrl ?? null,
      targetUrl: b.targetUrl,
      amountCents: b.amountCents,
      // Ads Game: the winning time, and coin-paid ads.
      scoreMs: b.scoreMs ?? null,
      paidWithCoins: (b.coins ?? 0) > 0,
      // Only ads that paid for the map add-on carry an address.
      address: b.addonCents > 0 || b.relegatedFrom ? b.address : null,
      clicks: b.clicks,
      views: b.views ?? 0,
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
      // Real numbers an advertiser can check before paying (see ad_performance()).
      performance: await performanceOf(region),
      // Public already (every price is shown on the boards); summed per advertiser.
      topAdvertisers,
      crown: { round: publicRound(round), lastKing: maskRemoved(lastKing) ?? null },
      recentLegends: recent.items.map(maskRemoved),
      rules,
      paymentsMode: payments.modeFor(region),
      serverTime: new Date(now).toISOString(),
    };
  }

  // The proof numbers are a few aggregates: cache them so a burst of page
  // loads can't turn into a burst of heavy queries.
  const perfCache = {};
  async function performanceOf(region) {
    const hit = perfCache[region];
    if (hit && Date.now() - hit.at < 60_000) return hit.value;
    const value = await store.getPerformance(region);
    perfCache[region] = { at: Date.now(), value };
    return value;
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

  // Hooks for the Ads Game (King of the Day reward). Set by the arcade.
  const hooks = { onCrowned: null };

  // Gives back what an ad was paid with: nothing for a game entry (it was
  // won, not bought), coins for a coin-paid ad, money otherwise.
  async function refundAd(bid, key) {
    const ref = bid.paymentRef ?? '';
    if (ref.startsWith('game:')) return;
    if (ref.startsWith('coins:')) {
      await store.applyCoins(bid.walletId, bid.coins, 'refund', bid.id);
      return;
    }
    await payments.refund(bid.region, ref, bid.amountCents + (bid.addonCents ?? 0), key);
  }

  async function announce(region, { crowned, retired }) {
    if (crowned?.bidId) {
      const raw = await store.getBid(crowned.bidId);
      if (hooks.onCrowned) await hooks.onCrowned(raw, crowned).catch((err) => console.error('[game] crown hook failed', err));
      const king = maskRemoved(raw);
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
  async function settle(bidId, paymentRef, { approved = false } = {}) {
    const pending = await store.getBid(bidId);
    if (!pending) return { status: 'missing' };
    const region = pending.region;

    // Ads that never go live on payment alone (a relegated ad was already
    // vetted): videos wait for a person; in an edition with a review hold
    // (Nigeria, ARCON) every ad waits there first and goes live once the
    // hold passes unless an admin rejects it.
    const holdSeconds = rulesOf(region).reviewHoldSeconds ?? 0;
    // A game entry carries the player's ad card, which was already screened
    // (and held for review in Nigeria) when it was saved.
    const isGameEntry = pending.scoreMs !== null && pending.scoreMs !== undefined;
    const needsReview = (pending.videoUrl || holdSeconds > 0) && !pending.relegatedFrom && !isGameEntry && !approved;
    if (needsReview && pending.status === 'pending') {
      await store.markReview(bidId, paymentRef);
      return { status: 'review' };
    }
    if (pending.status === 'review' && !approved) return { status: 'review' };
    const result = await store.settleBid(bidId, paymentRef, rulesOf(region));
    await announce(region, result);
    if (result.round) dueAt[region] = Date.parse(result.round.endsAt);

    // 'outbid': another throne payment cleared first, or the shield premium applied.
    // 'void': a relegation that was already used. Either way: full refund.
    if (result.status === 'outbid' || result.status === 'void') {
      try {
        // Refund everything that was charged, including any map add-on.
        if (paymentRef) await refundAd({ ...result.bid, paymentRef }, `${result.status}-${bidId}`);
        await store.setStatus(bidId, 'refunded');
      } catch (err) {
        // Stays 'outbid'/'void' = refund owed; retryRefunds() keeps trying.
        console.error(`[game] refund failed for ${result.status} ad ${bidId}; will retry automatically.`, err.message);
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

  // --- Video review (admin) ---
  async function approveVideo(bidId) {
    const bid = await store.getBid(bidId);
    if (!bid || bid.status !== 'review') return { status: bid?.status ?? 'missing' };
    if (!(await store.reviewToPending(bidId))) return { status: 'changed' };
    // Normal settlement from here: a throne bid that has since been outbid is
    // refunded in full, a booking takes the next free slot.
    return settle(bidId, bid.paymentRef, { approved: true });
  }

  async function rejectVideo(bidId, reason) {
    const bid = await store.getBid(bidId);
    if (!bid || bid.status !== 'review') return { status: bid?.status ?? 'missing' };
    if (!(await store.rejectReview(bidId, reason))) return { status: 'changed' };
    try {
      await refundAd(bid, `rejected-${bidId}`);
    } catch (err) {
      // Mark it owed ('void'); retryRefunds() keeps trying until it succeeds.
      await store.setStatus(bidId, 'void');
      console.error(`[game] refund failed for rejected ad ${bidId}; will retry automatically.`, err.message);
    }
    // The rejected file is deleted; the poster image stays for the record.
    if (storage && bid.videoUrl) await storage.remove(bid.videoUrl).catch((err) => console.error('[game] video delete failed', err));
    return { status: 'refunded' };
  }

  // The review queue, checked every few seconds:
  //  - picture ads in an edition with a review hold go live once the hold has
  //    passed and no admin rejected them;
  //  - paid videos nobody reviewed within 24 hours are refunded, so a buyer's
  //    money is never stuck.
  const REVIEW_WINDOW_MS = 24 * 3600_000;
  let reviewsCheckedAt = 0;
  async function expireReviews() {
    if (Date.now() - reviewsCheckedAt < 5_000) return;
    reviewsCheckedAt = Date.now();
    for (const bid of await store.listReviews()) {
      const waited = Date.now() - Date.parse(bid.reviewSince);
      if (bid.videoUrl) {
        if (waited > REVIEW_WINDOW_MS) await rejectVideo(bid.id, 'Not reviewed within 24 hours (automatic refund)');
      } else if (waited >= (rulesOf(bid.region).reviewHoldSeconds ?? 0) * 1000) {
        await approveVideo(bid.id);
      }
    }
  }

  // --- Reach: distinct visitors on the site while each ad was live ---
  // Every 15 s, every visitor watching an edition is credited to every ad
  // live there (each visitor counted once per ad per day; the visitor id is a
  // daily-salted hash, never stored). Batched to the database every 30 s.
  const seenBy = new Map(); // bidId -> Set(visitor hash)
  let pendingViews = {};
  let lastFlush = 0;
  async function trackReach(realtime) {
    const now = Date.now();
    for (const region of REGION_IDS) {
      const viewers = realtime.viewersIn(region);
      if (viewers.size === 0) continue;
      const [{ bid }, boards] = await Promise.all([store.getThrone(region), store.getBoards(region, now)]);
      const live = [bid, ...Object.values(boards).map((b) => b.current)].filter((b) => b && !b.removedAt);
      for (const ad of live) {
        let seen = seenBy.get(ad.id);
        if (!seen) seenBy.set(ad.id, (seen = new Set()));
        for (const v of viewers) {
          if (seen.has(v)) continue;
          seen.add(v);
          pendingViews[ad.id] = (pendingViews[ad.id] ?? 0) + 1;
        }
      }
      const { day, visitsToday, peakToday } = realtime.dailyStats(region);
      if (now - lastFlush >= 30_000) await store.recordDaily(region, day, visitsToday, peakToday);
    }
    if (now - lastFlush >= 30_000) {
      lastFlush = now;
      const batch = pendingViews;
      pendingViews = {};
      await store.addViews(batch);
      // Ads that are no longer live don't need their visitor sets.
      if (seenBy.size > 500) seenBy.clear();
    }
  }

  // Refunds that failed (e.g. the processor balance had not settled yet) are
  // kept as owed and retried until they go through. Nobody is left unpaid.
  async function retryRefunds() {
    const owed = await store.listRefundsOwed(new Date(Date.now() - 2 * 60_000).toISOString());
    for (const bid of owed) {
      try {
        await refundAd(bid, `retry-${bid.id}`);
        await store.setStatus(bid.id, 'refunded');
        console.log(`[game] owed refund paid for ad ${bid.id}`);
      } catch (err) {
        console.error(`[game] owed refund for ad ${bid.id} still failing: ${err.message}`);
      }
    }
    return owed.length;
  }

  return {
    hooks,
    publicBid,
    retryRefunds,
    trackReach,
    approveVideo,
    rejectVideo,
    expireReviews,
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
