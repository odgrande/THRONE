import { randomUUID } from 'node:crypto';
import { extendedCrownEndMs, minNextBidCents, nextCrownCutoffMs } from '../rules.js';

const LEGEND_SORTS = {
  recent: (a, b) => b.deposedAt.localeCompare(a.deposedAt),
  longest: (a, b) => b.reignSeconds - a.reignSeconds,
  priciest: (a, b) => b.amountCents - a.amountCents,
};

// In-process store for local development. Resets on restart.
// Node runs each method synchronously up to its return, so settleBid is
// atomic without locks. Mirrors the SQL in supabase/schema.sql.
export function createMemoryStore() {
  const bids = new Map();
  const wallets = new Map();
  const walletIdByHash = new Map();
  const legends = [];
  const hypeJobs = [];
  const rounds = [];
  const reports = [];
  let throneBidId = null;
  let creatorFundCents = 0;
  let takeovers = 0;
  let volumeCents = 0;

  // Mirrors tick_crown() in schema.sql: closes the King of the Day round once
  // its time is up (crowning whoever holds the throne) and opens the next one.
  const tickCrown = (rules, now) => {
    let open = rounds.find((r) => !r.closedAt);
    let crowned = null;
    if (open && now >= Date.parse(open.endsAt)) {
      open.closedAt = new Date(now).toISOString();
      open.winnerBidId = throneBidId;
      crowned = { roundId: open.id, bidId: throneBidId };
      open = null;
    }
    if (!open) {
      const base = new Date(nextCrownCutoffMs(now, rules)).toISOString();
      open = { id: rounds.length + 1, baseEndsAt: base, endsAt: base, closedAt: null, winnerBidId: null, takeovers: 0 };
      rounds.push(open);
    }
    return { round: open, crowned };
  };

  // Mirrors the archive_deposed_king trigger.
  const archive = (deposed, winner, nowIso) => {
    legends.push({
      id: legends.length + 1,
      bidId: deposed.id,
      name: deposed.name,
      tagline: deposed.tagline,
      imageUrl: deposed.imageUrl,
      targetUrl: deposed.targetUrl,
      amountCents: deposed.amountCents,
      crownedAt: deposed.settledAt,
      deposedAt: nowIso,
      deposedByName: winner.name,
      reignSeconds: Math.floor((Date.parse(nowIso) - Date.parse(deposed.settledAt)) / 1000),
      survivedShield: nowIso >= deposed.shieldEndsAt,
    });
  };

  return {
    kind: 'memory',

    // --- Wallets (Throne Credits) ---
    async createWallet(tokenHash) {
      const wallet = { id: randomUUID(), balanceCents: 0, lifetimeEarnedCents: 0, createdAt: new Date().toISOString() };
      wallets.set(wallet.id, wallet);
      walletIdByHash.set(tokenHash, wallet.id);
      return { ...wallet };
    },

    async getWalletByHash(tokenHash) {
      const id = walletIdByHash.get(tokenHash);
      return id ? { ...wallets.get(id) } : null;
    },

    // --- Bids ---
    async createBid({ amountCents, shieldSeconds, walletId, creditsCents, chargeCents, name, tagline, imageUrl, targetUrl }) {
      const bid = {
        id: randomUUID(),
        status: 'pending',
        amountCents,
        shieldSeconds,
        walletId,
        creditsCents,
        chargeCents,
        name,
        tagline,
        imageUrl,
        targetUrl,
        paymentRef: null,
        dividendCents: 0,
        clicks: 0,
        createdAt: new Date().toISOString(),
        settledAt: null,
        shieldEndsAt: null,
        removedAt: null,
        removedReason: null,
        removedBy: null,
      };
      bids.set(bid.id, bid);
      return { ...bid };
    },

    async getBid(id) {
      const bid = bids.get(id);
      return bid ? { ...bid } : null;
    },

    async settleBid(id, paymentRef, rules) {
      const bid = bids.get(id);
      if (!bid) return { status: 'missing' };
      if (bid.status !== 'pending') return { status: 'duplicate', bid: { ...bid } };

      const now = Date.now();
      const nowIso = new Date(now).toISOString();
      // Close an expired King of the Day round first, so a late payment can
      // never steal a crown that was already decided.
      const { round, crowned } = tickCrown(rules, now);
      const previous = throneBidId ? bids.get(throneBidId) : null;
      const wallet = bid.walletId ? wallets.get(bid.walletId) : null;

      bid.paymentRef = paymentRef;
      bid.settledAt = nowIso;

      if (bid.amountCents < minNextBidCents(previous, now, rules)) {
        bid.status = 'outbid';
        return { status: 'outbid', bid: { ...bid }, crowned };
      }
      // Credits were spent elsewhere between quote and payment.
      if (bid.creditsCents > 0 && (!wallet || wallet.balanceCents < bid.creditsCents)) {
        bid.status = 'void';
        return { status: 'void', bid: { ...bid }, crowned };
      }

      if (bid.creditsCents > 0) wallet.balanceCents -= bid.creditsCents;
      bid.status = 'won';
      bid.shieldEndsAt = new Date(now + bid.shieldSeconds * 1000).toISOString();

      let dividendCents = 0;
      if (previous) {
        archive(previous, bid, nowIso);
        const prevWallet = previous.walletId ? wallets.get(previous.walletId) : null;
        if (prevWallet) {
          dividendCents = Math.floor((bid.amountCents * rules.dividendPct) / 100);
          prevWallet.balanceCents += dividendCents;
          prevWallet.lifetimeEarnedCents += dividendCents;
          previous.dividendCents += dividendCents;
        }
      }
      throneBidId = bid.id;
      creatorFundCents += Math.floor((bid.amountCents * rules.creatorFundPct) / 100);
      takeovers += 1;
      volumeCents += bid.amountCents;
      round.takeovers += 1;
      round.endsAt = new Date(extendedCrownEndMs(round, now, rules)).toISOString();
      return {
        status: 'won',
        bid: { ...bid },
        previous: previous ? { ...previous } : null,
        dividendCents,
        crowned,
        round: { ...round },
      };
    },

    // --- King of the Day ---
    async tickCrown(rules) {
      const { round, crowned } = tickCrown(rules, Date.now());
      return { round: { ...round }, crowned };
    },

    async getDayKings(limit) {
      return rounds
        .filter((r) => r.closedAt && r.winnerBidId)
        .sort((a, b) => b.closedAt.localeCompare(a.closedAt))
        .slice(0, limit)
        .map((r) => {
          const bid = bids.get(r.winnerBidId);
          return {
            roundId: r.id,
            crownedAt: r.closedAt,
            takeovers: r.takeovers,
            bidId: bid.id,
            name: bid.name,
            tagline: bid.tagline,
            imageUrl: bid.imageUrl,
            amountCents: bid.amountCents,
            removedAt: bid.removedAt,
          };
        });
    },

    // --- Reports & takedowns: mirrors report_bid() in schema.sql ---
    async reportBid({ bidId, reason, details, reporterHash, threshold }) {
      const bid = bids.get(bidId);
      if (!bid || bid.status !== 'won') return { status: 'missing' };
      if (reports.some((r) => r.bidId === bidId && r.reporterHash === reporterHash)) return { status: 'duplicate' };
      reports.push({ id: reports.length + 1, bidId, reason, details, reporterHash, status: 'open', createdAt: new Date().toISOString() });
      const open = reports.filter((r) => r.bidId === bidId && r.status === 'open').length;
      let autoHidden = false;
      if (threshold > 0 && open >= threshold && !bid.removedAt) {
        Object.assign(bid, {
          removedAt: new Date().toISOString(),
          removedReason: 'Hidden after multiple reports, pending review',
          removedBy: 'auto',
        });
        autoHidden = true;
      }
      return { status: 'filed', autoHidden };
    },

    async listReports() {
      const open = reports.filter((r) => r.status === 'open');
      return [...new Set(open.map((r) => r.bidId))].map((bidId) => ({
        bid: { ...bids.get(bidId) },
        reports: open.filter((r) => r.bidId === bidId).map(({ reporterHash, ...r }) => r),
      }));
    },

    async listRemoved(limit) {
      return [...bids.values()]
        .filter((b) => b.removedAt)
        .sort((a, b) => b.removedAt.localeCompare(a.removedAt))
        .slice(0, limit)
        .map((b) => ({ ...b }));
    },

    async removeBid(id, reason) {
      const bid = bids.get(id);
      if (!bid) return null;
      Object.assign(bid, { removedAt: new Date().toISOString(), removedReason: reason, removedBy: 'admin' });
      for (const r of reports) if (r.bidId === id && r.status === 'open') r.status = 'actioned';
      return { ...bid };
    },

    async restoreBid(id) {
      const bid = bids.get(id);
      if (!bid) return null;
      Object.assign(bid, { removedAt: null, removedReason: null, removedBy: null });
      for (const r of reports) if (r.bidId === id && r.status === 'open') r.status = 'dismissed';
      return { ...bid };
    },

    async dismissReports(id) {
      for (const r of reports) if (r.bidId === id && r.status === 'open') r.status = 'dismissed';
    },

    // After the file itself is deleted: drop every reference to it, including
    // the archive's snapshot copy.
    async clearImage(id) {
      const bid = bids.get(id);
      if (bid) bid.imageUrl = null;
      for (const l of legends) if (l.bidId === id) l.imageUrl = null;
    },

    async setStatus(id, status) {
      const bid = bids.get(id);
      if (bid) bid.status = status;
    },

    async recordClick(id) {
      const bid = bids.get(id);
      if (bid) bid.clicks += 1;
    },

    async getThrone() {
      const bid = throneBidId ? bids.get(throneBidId) : null;
      return { bid: bid ? { ...bid } : null, creatorFundCents, takeovers, volumeCents };
    },

    async getLegends({ sort, limit, offset }) {
      const sorted = [...legends].sort(LEGEND_SORTS[sort] ?? LEGEND_SORTS.recent);
      return {
        total: legends.length,
        items: sorted.slice(offset, offset + limit).map((l) => {
          const bid = bids.get(l.bidId);
          return { ...l, dividendCents: bid.dividendCents, clicks: bid.clicks, removedAt: bid.removedAt };
        }),
      };
    },

    // --- Hype video jobs ---
    async enqueueHypeJob(payload) {
      hypeJobs.push({ id: hypeJobs.length + 1, status: 'pending', payload, videoUrl: null, error: null });
    },

    async claimHypeJob() {
      const job = hypeJobs.find((j) => j.status === 'pending');
      if (!job) return null;
      job.status = 'rendering';
      return { ...job };
    },

    async finishHypeJob(id, { status, videoUrl = null, error = null }) {
      const job = hypeJobs.find((j) => j.id === id);
      if (job) Object.assign(job, { status, videoUrl, error });
    },

    async listHypeJobs(limit) {
      return hypeJobs.slice(-limit).reverse().map((j) => ({ ...j }));
    },

    // --- Admin: mirrors admin_financials() in schema.sql ---
    async getFinancials() {
      const all = [...bids.values()];
      const sum = (list, key) => list.reduce((s, x) => s + x[key], 0);
      const won = all.filter((b) => b.status === 'won');
      const refunded = all.filter((b) => b.status === 'refunded');
      const charged = [...won, ...refunded].filter((b) => b.chargeCents > 0);
      const hourAgo = new Date(Date.now() - 3600_000).toISOString();
      const hype = {};
      for (const j of hypeJobs) hype[j.status] = (hype[j.status] ?? 0) + 1;
      return {
        outstandingCreditsCents: sum([...wallets.values()], 'balanceCents'),
        creditsIssuedCents: sum([...wallets.values()], 'lifetimeEarnedCents'),
        creditsSpentCents: sum(won, 'creditsCents'),
        walletsWithBalance: [...wallets.values()].filter((w) => w.balanceCents > 0).length,
        wonBids: won.length,
        cardGrossCents: sum(won, 'chargeCents'),
        estFeesCents: charged.reduce((s, b) => s + 30 + Math.ceil(b.chargeCents * 0.029), 0),
        refundedCents: sum(refunded, 'chargeCents'),
        stalePending: all.filter((b) => b.status === 'pending' && b.createdAt < hourAgo).length,
        creatorFundCents,
        hype,
      };
    },
  };
}
