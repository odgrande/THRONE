import { minNextBidCents, shieldSecondsFor, splitPayment } from './rules.js';

// Core rules of the throne: pricing, settlement, credits and broadcasting.
export function createGame({ store, payments, realtime, hype, rules }) {
  // Never expose payment references or wallet ids to the browser.
  const publicBid = (b) =>
    b && {
      id: b.id,
      name: b.name,
      tagline: b.tagline,
      imageUrl: b.imageUrl,
      targetUrl: b.targetUrl,
      amountCents: b.amountCents,
      dividendCents: b.dividendCents,
      clicks: b.clicks,
      startedAt: b.settledAt,
      shieldEndsAt: b.shieldEndsAt,
    };

  const publicRound = (r) => r && { id: r.id, baseEndsAt: r.baseEndsAt, endsAt: r.endsAt, takeovers: r.takeovers };

  async function getState() {
    const { bid, creatorFundCents, takeovers, volumeCents } = await store.getThrone();
    const [recent, { round }, [lastKing]] = await Promise.all([
      store.getLegends({ sort: 'recent', limit: 15, offset: 0 }),
      store.tickCrown(rules),
      store.getDayKings(1),
    ]);
    crownDueAt = Date.parse(round.endsAt);
    return {
      throne: publicBid(bid),
      minNextBidCents: minNextBidCents(bid, Date.now(), rules),
      creatorFundCents,
      stats: { takeovers, volumeCents },
      crown: { round: publicRound(round), lastKing: lastKing ?? null },
      recentLegends: recent.items,
      rules,
      paymentsMode: payments.mode,
      serverTime: new Date().toISOString(),
    };
  }

  // --- King of the Day ---
  // The ticker runs every second but only asks the database when the round is
  // due (or every 30 s, in case another API instance extended it).
  let crownDueAt = 0;
  let crownCheckedAt = 0;

  async function announceCrowned(crowned) {
    if (!crowned?.bidId) return; // nobody held the throne when the round ended
    const king = await store.getBid(crowned.bidId);
    realtime.broadcast('crowned', { roundId: crowned.roundId, name: king.name, amountCents: king.amountCents });
  }

  async function tickCrown() {
    const now = Date.now();
    if (now < crownDueAt && now - crownCheckedAt < 30_000) return;
    crownCheckedAt = now;
    const { round, crowned } = await store.tickCrown(rules);
    crownDueAt = Date.parse(round.endsAt);
    await announceCrowned(crowned);
  }

  const getDayKings = (limit) => store.getDayKings(limit);

  async function getMinNextBidCents() {
    const { bid } = await store.getThrone();
    return minNextBidCents(bid, Date.now(), rules);
  }

  // Credits are only quoted here; settle_bid re-checks and spends them atomically.
  function createBid(input, wallet, useCredits) {
    const split = splitPayment(input.amountCents, useCredits ? wallet.balanceCents : 0);
    return store.createBid({
      ...input,
      ...split,
      walletId: wallet.id,
      shieldSeconds: shieldSecondsFor(input.amountCents, rules),
    });
  }

  // Called once the card portion has cleared (Stripe webhook / demo button),
  // or straight away for bids paid entirely in credits (paymentRef = null).
  // Idempotent: a retried webhook for an already-settled bid is a no-op.
  async function settle(bidId, paymentRef) {
    const result = await store.settleBid(bidId, paymentRef, rules);
    // Settlement closes an expired King of the Day round before applying the bid.
    if (result.crowned) await announceCrowned(result.crowned);
    if (result.round) crownDueAt = Date.parse(result.round.endsAt);

    // 'outbid': someone else's payment cleared first, or the shield premium applied.
    // 'void': the credits were spent elsewhere before this payment cleared.
    // Either way no credits were taken; refund the card portion in full.
    if (result.status === 'outbid' || result.status === 'void') {
      try {
        if (paymentRef && result.bid.chargeCents > 0) {
          await payments.refund(paymentRef, result.bid.chargeCents, `${result.status}-${bidId}`);
        }
        await store.setStatus(bidId, 'refunded');
      } catch (err) {
        console.error(`[game] REFUND FAILED for ${result.status} bid ${bidId}; refund manually.`, err);
      }
      return result;
    }
    if (result.status !== 'won') return result;

    const { bid, previous, dividendCents } = result;
    realtime.broadcast('takeover', {
      throne: publicBid(bid),
      previousName: previous?.name ?? null,
      dividendCents,
      round: publicRound(result.round),
    });
    await hype.enqueue({ bid, previous });
    return result;
  }

  return { getState, getMinNextBidCents, createBid, settle, tickCrown, getDayKings };
}
