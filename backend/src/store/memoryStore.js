import { randomUUID } from 'node:crypto';
import { extendedCrownEndMs, minNextBidCents, nextCrownCutoffMs } from '../rules.js';

const LEGEND_SORTS = {
  recent: (a, b) => b.deposedAt.localeCompare(a.deposedAt),
  longest: (a, b) => b.reignSeconds - a.reignSeconds,
  priciest: (a, b) => b.amountCents - a.amountCents,
};

const iso = (ms) => new Date(ms).toISOString();

// In-process store for local development. Resets on restart.
// Node runs each method synchronously up to its return, so settlement is
// atomic without locks. Mirrors the SQL in supabase/schema.sql.
export function createMemoryStore() {
  const bids = new Map();
  const legends = [];
  const hypeJobs = [];
  const rounds = [];
  const reports = [];
  const boardsBookedUntil = { b2: null, b3: null };
  let throneBidId = null;
  let takeovers = 0;
  let volumeCents = 0;

  // Mirrors the archive_deposed_king trigger. winner = null means retired.
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
      deposedByName: winner?.name ?? null,
      retired: !winner,
      reignSeconds: Math.floor((Date.parse(nowIso) - Date.parse(deposed.settledAt)) / 1000),
      survivedShield: nowIso >= deposed.shieldEndsAt,
    });
  };

  // Mirrors tick_throne(): close the King of the Day round when its clock hits
  // zero, then retire a king whose term is over.
  const tick = (rules, now) => {
    const king = throneBidId ? bids.get(throneBidId) : null;
    const termEnd = king ? Date.parse(king.settledAt) + rules.throneTermSeconds * 1000 : null;

    let open = rounds.find((r) => !r.closedAt);
    let crowned = null;
    if (open && now >= Date.parse(open.endsAt)) {
      const winner = termEnd !== null && termEnd > Date.parse(open.endsAt) ? throneBidId : null;
      open.closedAt = iso(now);
      open.winnerBidId = winner;
      crowned = { roundId: open.id, bidId: winner };
      open = null;
    }
    if (!open) {
      const base = iso(nextCrownCutoffMs(now, rules));
      open = { id: rounds.length + 1, baseEndsAt: base, endsAt: base, closedAt: null, winnerBidId: null, takeovers: 0 };
      rounds.push(open);
    }

    let retired = null;
    if (termEnd !== null && now >= termEnd) {
      archive(king, null, iso(now));
      throneBidId = null;
      retired = { bidId: king.id };
    }
    return { round: open, crowned, retired };
  };

  return {
    kind: 'memory',

    // --- Ads (throne bids and board bookings) ---
    async createBid({ board, amountCents, addonCents = 0, address = null, shieldSeconds = 0, days = null, relegatedFrom = null, ownerHash, name, tagline, imageUrl, targetUrl }) {
      const bid = {
        id: randomUUID(),
        board,
        status: 'pending',
        amountCents,
        addonCents,
        address,
        shieldSeconds,
        shieldEndsAt: null,
        days,
        startsAt: null,
        endsAt: null,
        relegatedFrom,
        ownerHash,
        name,
        tagline,
        imageUrl,
        targetUrl,
        paymentRef: null,
        clicks: 0,
        createdAt: new Date().toISOString(),
        settledAt: null,
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
      bid.paymentRef = paymentRef;
      bid.settledAt = iso(now);

      // ---- Board booking: append to the board's queue ----
      if (bid.board !== 'throne') {
        const used = bid.relegatedFrom && [...bids.values()].some((b) => b.relegatedFrom === bid.relegatedFrom && b.status === 'won');
        if (used) {
          bid.status = 'void';
          return { status: 'void', bid: { ...bid } };
        }
        const start = Math.max(now, boardsBookedUntil[bid.board] ? Date.parse(boardsBookedUntil[bid.board]) : 0);
        const end = start + bid.days * 86400_000;
        boardsBookedUntil[bid.board] = iso(end);
        Object.assign(bid, { status: 'won', startsAt: iso(start), endsAt: iso(end) });
        volumeCents += bid.amountCents;
        return { status: 'won', bid: { ...bid } };
      }

      // ---- Throne bid ----
      // Close an expired round and retire an expired king first, so a late
      // payment can never steal a crown that was already decided.
      const { round, crowned, retired } = tick(rules, now);
      const previous = throneBidId ? bids.get(throneBidId) : null;

      if (bid.amountCents < minNextBidCents(previous, now, rules)) {
        bid.status = 'outbid';
        return { status: 'outbid', bid: { ...bid }, crowned, retired };
      }

      bid.status = 'won';
      bid.shieldEndsAt = iso(now + bid.shieldSeconds * 1000);
      if (previous) archive(previous, bid, bid.settledAt);
      throneBidId = bid.id;
      takeovers += 1;
      volumeCents += bid.amountCents;
      round.takeovers += 1;
      round.endsAt = iso(extendedCrownEndMs(round, now, rules));
      return { status: 'won', bid: { ...bid }, previous: previous ? { ...previous } : null, crowned, retired, round: { ...round } };
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
      const recordCents = Math.max(0, ...[...bids.values()].filter((b) => b.board === 'throne' && b.status === 'won').map((b) => b.amountCents));
      return { bid: bid ? { ...bid } : null, takeovers, volumeCents, recordCents };
    },

    // Live booking (if any) plus queue state for each small board.
    async getBoards(nowMs) {
      const nowIso = iso(nowMs);
      const out = {};
      for (const board of Object.keys(boardsBookedUntil)) {
        const booked = [...bids.values()]
          .filter((b) => b.board === board && b.status === 'won' && b.endsAt > nowIso)
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
        const current = booked.find((b) => b.startsAt <= nowIso) ?? null;
        out[board] = {
          current: current ? { ...current } : null,
          nextStartsAt: booked.find((b) => b.startsAt > nowIso)?.startsAt ?? null,
          upcoming: booked.filter((b) => b.startsAt > nowIso).length,
          bookedUntil: boardsBookedUntil[board],
        };
      }
      return out;
    },

    // Throne bids dethroned recently (not retired, not removed): the free
    // "Recently dethroned" strip, and the relegation offer window.
    async getRecentlyDethroned(sinceIso) {
      return legends
        .filter((l) => !l.retired && l.deposedAt >= sinceIso)
        .sort((a, b) => b.deposedAt.localeCompare(a.deposedAt))
        .map((l) => ({ ...l, removedAt: bids.get(l.bidId).removedAt }));
    },

    async getLegend(bidId) {
      const l = legends.find((x) => x.bidId === bidId);
      return l ? { ...l } : null;
    },

    async hasRelegation(bidId) {
      return [...bids.values()].some((b) => b.relegatedFrom === bidId && b.status === 'won');
    },

    // Leaderboard: total spent per advertiser (grouped by ad name, case-insensitive),
    // across all boards, excluding removed ads. Mirrors top_advertisers() in schema.sql.
    async getTopAdvertisers(limit) {
      const byName = new Map();
      for (const b of bids.values()) {
        if (b.status !== 'won' || b.removedAt) continue;
        const key = b.name.trim().toLowerCase();
        const row = byName.get(key) ?? { name: b.name.trim(), totalCents: 0, ads: 0, lastAt: b.settledAt };
        row.totalCents += b.amountCents + b.addonCents;
        row.ads += 1;
        if (b.settledAt > row.lastAt) Object.assign(row, { lastAt: b.settledAt, name: b.name.trim() });
        byName.set(key, row);
      }
      return [...byName.values()].sort((a, b) => b.totalCents - a.totalCents || b.ads - a.ads).slice(0, limit);
    },

    // Distinct advertisers, and ads published on any board (not removed).
    async countAdvertisers() {
      const names = new Set();
      let ads = 0;
      for (const b of bids.values()) {
        if (b.status !== 'won' || b.removedAt) continue;
        names.add(b.name.trim().toLowerCase());
        ads += 1;
      }
      return { advertisers: names.size, ads };
    },

    async getLegends({ sort, limit, offset }) {
      const sorted = [...legends].sort(LEGEND_SORTS[sort] ?? LEGEND_SORTS.recent);
      return {
        total: legends.length,
        items: sorted.slice(offset, offset + limit).map((l) => {
          const bid = bids.get(l.bidId);
          return { ...l, clicks: bid.clicks, removedAt: bid.removedAt };
        }),
      };
    },

    // --- King of the Day ---
    async tickThrone(rules) {
      const { round, crowned, retired } = tick(rules, Date.now());
      return { round: { ...round }, crowned, retired };
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
      // Totals include the map add-on; the throne/board split counts ad prices only.
      const sum = (list) => list.reduce((s, b) => s + b.amountCents + b.addonCents, 0);
      const sumAds = (list) => list.reduce((s, b) => s + b.amountCents, 0);
      const won = all.filter((b) => b.status === 'won');
      const refunded = all.filter((b) => b.status === 'refunded');
      const charged = [...won, ...refunded].filter((b) => b.paymentRef && !b.paymentRef.startsWith('demo_'));
      const hourAgo = iso(Date.now() - 3600_000);
      const hype = {};
      for (const j of hypeJobs) hype[j.status] = (hype[j.status] ?? 0) + 1;
      return {
        wonBids: won.length,
        grossCents: sum(won),
        throneGrossCents: sumAds(won.filter((b) => b.board === 'throne')),
        boardsGrossCents: sumAds(won.filter((b) => b.board !== 'throne')),
        bookings: won.filter((b) => b.board !== 'throne').length,
        relegations: won.filter((b) => b.relegatedFrom).length,
        addonCents: won.reduce((s, b) => s + b.addonCents, 0),
        estFeesCents: charged.reduce((s, b) => s + 30 + Math.ceil((b.amountCents + b.addonCents) * 0.029), 0),
        refundedCents: sum(refunded),
        stalePending: all.filter((b) => b.status === 'pending' && b.createdAt < hourAgo).length,
        hype,
      };
    },
  };
}
