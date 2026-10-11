import { randomUUID } from 'node:crypto';
import { BOARD_IDS } from '../rules.js';
import { extendedCrownEndMs, minNextBidCents, nextCrownCutoffMs } from '../rules.js';

const LEGEND_SORTS = {
  recent: (a, b) => b.deposedAt.localeCompare(a.deposedAt),
  longest: (a, b) => b.reignSeconds - a.reignSeconds,
  priciest: (a, b) => b.amountCents - a.amountCents,
};

const REGIONS = ['global', 'ng'];
const iso = (ms) => new Date(ms).toISOString();

// Mirrors est_fee() in schema.sql: USD via Stripe, NGN via Paystack.
const estFee = (region, charge) =>
  region === 'ng' ? Math.min(200000, Math.ceil(charge * 0.015) + (charge >= 250000 ? 10000 : 0)) : 30 + Math.ceil(charge * 0.029);

// In-process store for local development. Resets on restart.
// Node runs each method synchronously up to its return, so settlement is
// atomic without locks. Mirrors the SQL in supabase/schema.sql: two fully
// separate regions (global in USD, ng in NGN) sharing one ads table.
export function createMemoryStore() {
  const bids = new Map();
  const daily = new Map(); // `${region}:${day}` -> { visitors, peak }
  const legends = [];
  const hypeJobs = [];
  const rounds = [];
  const reports = [];
  const adminLog = [];
  const contacts = [];
  // --- Ads Game (mirrors the wallets / coin_ledger / coin_orders / ad_cards /
  // game_attempts tables and their SQL functions) ---
  const wallets = new Map(); // id -> wallet
  const ledger = [];
  const coinOrders = new Map();
  const cards = new Map(); // wallet id -> card
  const attempts = new Map();
  const paused = Object.fromEntries(REGIONS.map((r) => [r, false]));
  const regionState = Object.fromEntries(
    REGIONS.map((r) => [r, { throneBidId: null, takeovers: 0, volumeCents: 0, boardsBookedUntil: Object.fromEntries(BOARD_IDS.map((id) => [id, null])) }]),
  );
  const stateOf = (region) => {
    const s = regionState[region];
    if (!s) throw new Error(`unknown region ${region}`);
    return s;
  };

  // Mirrors the archive_deposed_king trigger. winner = null means retired.
  const archive = (deposed, winner, nowIso) => {
    legends.push({
      id: legends.length + 1,
      region: deposed.region,
      bidId: deposed.id,
      name: deposed.name,
      tagline: deposed.tagline,
      imageUrl: deposed.imageUrl,
      targetUrl: deposed.targetUrl,
      amountCents: deposed.amountCents,
      scoreMs: deposed.scoreMs ?? null,
      crownedAt: deposed.settledAt,
      deposedAt: nowIso,
      deposedByName: winner?.name ?? null,
      retired: !winner,
      reignSeconds: Math.floor((Date.parse(nowIso) - Date.parse(deposed.settledAt)) / 1000),
      survivedShield: nowIso >= deposed.shieldEndsAt,
    });
  };

  // Mirrors tick_throne(): close the region's King of the Day round when its
  // clock hits zero, then retire a king whose term is over.
  const tick = (region, rules, now) => {
    const s = stateOf(region);
    const king = s.throneBidId ? bids.get(s.throneBidId) : null;
    const termEnd = king ? Date.parse(king.settledAt) + rules.throneTermSeconds * 1000 : null;

    let open = rounds.find((r) => r.region === region && !r.closedAt);
    let crowned = null;
    if (open && now >= Date.parse(open.endsAt)) {
      const winner = termEnd !== null && termEnd > Date.parse(open.endsAt) ? s.throneBidId : null;
      open.closedAt = iso(now);
      open.winnerBidId = winner;
      crowned = { roundId: open.id, bidId: winner };
      open = null;
    }
    if (!open) {
      const base = iso(nextCrownCutoffMs(now, rules));
      open = { id: rounds.length + 1, region, baseEndsAt: base, endsAt: base, closedAt: null, winnerBidId: null, takeovers: 0 };
      rounds.push(open);
    }

    let retired = null;
    if (termEnd !== null && now >= termEnd) {
      archive(king, null, iso(now));
      s.throneBidId = null;
      retired = { bidId: king.id };
    }
    return { round: open, crowned, retired };
  };

  const liveAds = (region) => [...bids.values()].filter((b) => b.region === region && b.status === 'won' && !b.removedAt);

  return {
    kind: 'memory',

    // --- Ads (throne bids and board bookings) ---
    async createBid({ region, board, amountCents, addonCents = 0, address = null, shieldSeconds = 0, days = null, relegatedFrom = null, ownerHash, name, tagline, imageUrl, videoUrl = null, targetUrl, termsVersion = null, scoreMs = null, walletId = null, coins = 0 }) {
      stateOf(region);
      const bid = {
        id: randomUUID(),
        region,
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
        videoUrl,
        termsVersion,
        termsAcceptedAt: termsVersion ? new Date().toISOString() : null,
        scoreMs,
        gameRoundId: null,
        walletId,
        coins,
        reviewSince: null,
        targetUrl,
        paymentRef: null,
        clicks: 0,
        views: 0,
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

    // `rules` must be the rules of the bid's own region.
    async settleBid(id, paymentRef, rules) {
      const bid = bids.get(id);
      if (!bid) return { status: 'missing' };
      if (bid.status !== 'pending') return { status: 'duplicate', bid: { ...bid } };
      if (rules.region !== bid.region) throw new Error(`rules for region ${rules.region} passed for a ${bid.region} ad`);

      const s = stateOf(bid.region);
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
        const bookedUntil = s.boardsBookedUntil[bid.board];
        const start = Math.max(now, bookedUntil ? Date.parse(bookedUntil) : 0);
        const end = start + bid.days * 86400_000;
        s.boardsBookedUntil[bid.board] = iso(end);
        Object.assign(bid, { status: 'won', startsAt: iso(start), endsAt: iso(end) });
        s.volumeCents += bid.amountCents;
        return { status: 'won', bid: { ...bid } };
      }

      // ---- Throne bid ----
      // Close an expired round and retire an expired king first, so a late
      // payment can never steal a crown that was already decided.
      const { round, crowned, retired } = tick(bid.region, rules, now);
      const previous = s.throneBidId ? bids.get(s.throneBidId) : null;

      // Game entries: the fastest time today wins (10% faster during a Crown
      // Shield); a king from an earlier day is beaten by any time today.
      if (bid.scoreMs !== null && bid.scoreMs !== undefined) {
        if (previous && previous.scoreMs != null && previous.gameRoundId === round.id) {
          const toBeat = now < Date.parse(previous.shieldEndsAt ?? 0) ? Math.floor(previous.scoreMs * 0.9) : previous.scoreMs;
          if (bid.scoreMs >= toBeat) {
            bid.status = 'outbid';
            return { status: 'outbid', bid: { ...bid }, crowned, retired };
          }
        }
        bid.gameRoundId = round.id;
      } else if (bid.amountCents < minNextBidCents(previous, now, rules)) {
        bid.status = 'outbid';
        return { status: 'outbid', bid: { ...bid }, crowned, retired };
      }

      bid.status = 'won';
      bid.shieldEndsAt = iso(now + bid.shieldSeconds * 1000);
      if (previous) archive(previous, bid, bid.settledAt);
      s.throneBidId = bid.id;
      s.takeovers += 1;
      s.volumeCents += bid.amountCents;
      round.takeovers += 1;
      round.endsAt = iso(extendedCrownEndMs(round, now, rules));
      return { status: 'won', bid: { ...bid }, previous: previous ? { ...previous } : null, crowned, retired, round: { ...round } };
    },

    // Video ads: paid, waiting for a human. Not live, not counted anywhere.
    async markReview(id, paymentRef) {
      const bid = bids.get(id);
      if (!bid || bid.status !== 'pending') return;
      Object.assign(bid, { status: 'review', paymentRef, reviewSince: new Date().toISOString() });
    },
    async listReviews() {
      return [...bids.values()].filter((b) => b.status === 'review').sort((a, b) => a.reviewSince.localeCompare(b.reviewSince)).map((b) => ({ ...b }));
    },
    // Approved: back to pending so the normal settlement (with its race checks) runs.
    async reviewToPending(id) {
      const bid = bids.get(id);
      if (!bid || bid.status !== 'review') return false;
      bid.status = 'pending';
      return true;
    },
    async rejectReview(id, reason) {
      const bid = bids.get(id);
      if (!bid || bid.status !== 'review') return false;
      Object.assign(bid, { status: 'refunded', removedAt: new Date().toISOString(), removedReason: reason, removedBy: 'admin', videoUrl: null });
      return true;
    },

    async setStatus(id, status) {
      const bid = bids.get(id);
      if (bid) bid.status = status;
    },

    async recordClick(id) {
      const bid = bids.get(id);
      if (bid) bid.clicks += 1;
    },

    async getThrone(region) {
      const s = stateOf(region);
      const bid = s.throneBidId ? bids.get(s.throneBidId) : null;
      const recordCents = Math.max(
        0,
        ...[...bids.values()].filter((b) => b.region === region && b.board === 'throne' && b.status === 'won').map((b) => b.amountCents),
      );
      return { bid: bid ? { ...bid } : null, takeovers: s.takeovers, volumeCents: s.volumeCents, recordCents };
    },

    // Live booking (if any) plus queue state for each small board in a region.
    async getBoards(region, nowMs) {
      const s = stateOf(region);
      const nowIso = iso(nowMs);
      const out = {};
      for (const board of Object.keys(s.boardsBookedUntil)) {
        const booked = [...bids.values()]
          .filter((b) => b.region === region && b.board === board && b.status === 'won' && b.endsAt > nowIso)
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
        const current = booked.find((b) => b.startsAt <= nowIso) ?? null;
        out[board] = {
          current: current ? { ...current } : null,
          nextStartsAt: booked.find((b) => b.startsAt > nowIso)?.startsAt ?? null,
          upcoming: booked.filter((b) => b.startsAt > nowIso).length,
          bookedUntil: s.boardsBookedUntil[board],
        };
      }
      return out;
    },

    // Throne kings dethroned recently (not retired): the free "Recently
    // dethroned" strip, and the relegation offer window.
    async getRecentlyDethroned(region, sinceIso) {
      return legends
        .filter((l) => l.region === region && !l.retired && l.deposedAt >= sinceIso)
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
    async getTopAdvertisers(region, limit) {
      const byName = new Map();
      for (const b of liveAds(region)) {
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
    async countAdvertisers(region) {
      const ads = liveAds(region);
      return { advertisers: new Set(ads.map((b) => b.name.trim().toLowerCase())).size, ads: ads.length };
    },

    async getLegends({ region, sort, limit, offset }) {
      const mine = legends.filter((l) => l.region === region);
      const sorted = [...mine].sort(LEGEND_SORTS[sort] ?? LEGEND_SORTS.recent);
      return {
        total: mine.length,
        items: sorted.slice(offset, offset + limit).map((l) => {
          const bid = bids.get(l.bidId);
          return { ...l, clicks: bid.clicks, views: bid.views, removedAt: bid.removedAt };
        }),
      };
    },

    // --- King of the Day (per region) ---
    async tickThrone(region, rules) {
      const { round, crowned, retired } = tick(region, rules, Date.now());
      return { round: { ...round }, crowned, retired };
    },

    async getDayKings(region, limit) {
      return rounds
        .filter((r) => r.region === region && r.closedAt && r.winnerBidId)
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
            scoreMs: bid.scoreMs ?? null,
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
      if (bid) Object.assign(bid, { imageUrl: null, videoUrl: null });
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

    // --- Admin god mode ---
    async logAdmin({ action, bidId = null, region = null, reason = null, before = null, after = null, undoable = false }) {
      const entry = { id: adminLog.length + 1, at: new Date().toISOString(), action, bidId, region, reason, before, after, undoable, undoneAt: null };
      adminLog.push(entry);
      return { ...entry };
    },
    async listAdminLog(limit) {
      return adminLog.slice(-limit).reverse().map((e) => ({ ...e, name: e.bidId ? bids.get(e.bidId)?.name ?? null : null }));
    },
    async getAdminLog(id) {
      const e = adminLog.find((x) => x.id === Number(id));
      return e ? { ...e } : null;
    },
    async markUndone(id) {
      const e = adminLog.find((x) => x.id === Number(id));
      if (!e || e.undoneAt) return false;
      e.undoneAt = new Date().toISOString();
      return true;
    },
    async updateAdFields(id, fields) {
      const bid = bids.get(id);
      if (!bid) return null;
      Object.assign(bid, fields);
      return { ...bid };
    },
    async setAdTimes(id, { startsAt, endsAt }) {
      const bid = bids.get(id);
      if (bid) Object.assign(bid, { startsAt, endsAt });
    },
    // Ends a reign now, exactly like a term-limit retirement (archived as retired).
    async forceRetire(region, bidId) {
      const s = stateOf(region);
      if (s.throneBidId !== bidId) return false;
      archive(bids.get(bidId), null, new Date().toISOString());
      s.throneBidId = null;
      return true;
    },
    // Undo of forceRetire: only while the throne is still empty.
    async unretire(region, bidId, sinceIso) {
      const s = stateOf(region);
      if (s.throneBidId) return false;
      s.throneBidId = bidId;
      for (let i = legends.length - 1; i >= 0; i--) {
        if (legends[i].bidId === bidId && legends[i].retired && legends[i].deposedAt >= sinceIso) legends.splice(i, 1);
      }
      return true;
    },
    // --- Contact inbox (kept 90 days) ---
    async createContact(msg) {
      const entry = { id: contacts.length + 1, at: new Date().toISOString(), handledAt: null, ...msg };
      contacts.push(entry);
      return { ...entry };
    },
    async listContacts(limit) {
      return contacts.slice(-limit).reverse().map((c) => ({ ...c }));
    },
    async markContactHandled(id) {
      const c = contacts.find((x) => x.id === Number(id));
      if (c) c.handledAt = c.handledAt ? null : new Date().toISOString();
      return Boolean(c);
    },
    async deleteContact(id) {
      const i = contacts.findIndex((x) => x.id === Number(id));
      if (i >= 0) contacts.splice(i, 1);
      return i >= 0;
    },
    async purgeContacts(beforeIso) {
      for (let i = contacts.length - 1; i >= 0; i--) if (contacts[i].at < beforeIso) contacts.splice(i, 1);
    },

    // Paid ads that were not placed and still need their money back.
    async listRefundsOwed(beforeIso) {
      return [...bids.values()].filter((b) => ['outbid', 'void'].includes(b.status) && b.paymentRef && (b.settledAt ?? b.createdAt) <= beforeIso).map((b) => ({ ...b }));
    },

    // --- Ads Game: wallets and coins ---
    async createWallet({ region = 'global', tokenHash, referralCode, referredBy = null, ipHash = null, deviceHash = null }) {
      const w = { id: randomUUID(), region, banned: false, banReason: null, backedUpAt: null, tokenHash, balance: 0, playerName: null, referralCode, referredBy, referralPaid: false, createdIpHash: ipHash, createdDeviceHash: deviceHash, lastDailyAt: null, createdAt: new Date().toISOString() };
      wallets.set(w.id, w);
      return { ...w };
    },
    async getWalletByHash(tokenHash) {
      for (const w of wallets.values()) if (w.tokenHash === tokenHash) return { ...w };
      return null;
    },
    async getWallet(id) {
      const w = wallets.get(id);
      return w ? { ...w } : null;
    },
    async getWalletByReferral(code) {
      for (const w of wallets.values()) if (w.referralCode === code) return { ...w };
      return null;
    },
    async countWalletsByIp(ipHash, sinceIso, deviceHash = null) {
      return [...wallets.values()].filter((w) => (w.createdIpHash === ipHash || (deviceHash && w.createdDeviceHash === deviceHash)) && w.createdAt >= sinceIso).length;
    },
    async countWalletsByDevice(deviceHash, sinceIso) {
      return [...wallets.values()].filter((w) => w.createdDeviceHash === deviceHash && w.createdAt >= sinceIso).length;
    },
    async listReferrals(walletId) {
      return [...wallets.values()].filter((w) => w.referredBy === walletId).map((w) => ({ id: w.id, playerName: w.playerName, createdAt: w.createdAt, referralPaid: w.referralPaid, banned: w.banned }));
    },
    // Admin: find wallets by id, referral code or player name.
    async searchWallets(q, limit = 50) {
      const needle = (q ?? '').trim().toLowerCase();
      return [...wallets.values()]
        .filter((w) => !needle || w.id === needle || w.referralCode.toLowerCase() === needle || (w.playerName ?? '').toLowerCase().includes(needle))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, limit)
        .map((w) => ({ ...w }));
    },
    async listAttemptsAdmin({ region = null, walletId = null, status = null, limit = 100 }) {
      return [...attempts.values()]
        .filter((a) => (!region || a.region === region) && (!walletId || a.walletId === walletId) && (!status || a.status === status))
        .sort((x, y) => (x.startedAt < y.startedAt ? 1 : -1))
        .slice(0, limit)
        .map((a) => ({ ...a, playerName: wallets.get(a.walletId)?.playerName ?? null }));
    },
    async listCoinOrders({ walletId = null, limit = 100 }) {
      return [...coinOrders.values()]
        .filter((o) => !walletId || o.walletId === walletId)
        .sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1))
        .slice(0, limit)
        .map((o) => ({ ...o }));
    },
    // Privacy: network/device hashes are only kept for the anti-cheat window.
    async purgeAttemptHashes(beforeIso) {
      for (const a of attempts.values()) if (a.startedAt < beforeIso) Object.assign(a, { ipHash: null, deviceHash: null });
    },
    async countReferrals(walletId) {
      return [...wallets.values()].filter((w) => w.referredBy === walletId && w.referralPaid).length;
    },
    async setWalletFields(id, fields) {
      const w = wallets.get(id);
      if (w) Object.assign(w, fields);
    },
    // Mirrors apply_coins(): never below zero; a repeated (reason, ref) is a no-op.
    async applyCoins(walletId, delta, reason, ref = null) {
      const w = wallets.get(walletId);
      if (!w) throw new Error('unknown wallet');
      if (ref !== null && ledger.some((l) => l.walletId === walletId && l.reason === reason && l.ref === ref)) return w.balance;
      if (w.balance + delta < 0) throw new Error('insufficient coins');
      w.balance += delta;
      ledger.push({ walletId, delta, reason, ref, balanceAfter: w.balance, at: new Date().toISOString() });
      return w.balance;
    },
    async claimDaily(walletId, coins) {
      const w = wallets.get(walletId);
      if (w.lastDailyAt && Date.now() - Date.parse(w.lastDailyAt) < 20 * 3600_000) return -1;
      w.lastDailyAt = new Date().toISOString();
      return this.applyCoins(walletId, coins, 'daily', w.lastDailyAt.slice(0, 10));
    },
    async listLedger(walletId, limit) {
      return ledger.filter((l) => l.walletId === walletId).slice(-limit).reverse();
    },
    // --- Coin packs ---
    async createCoinOrder({ walletId, region, pack, coins, amountCents }) {
      const o = { id: randomUUID(), walletId, region, pack, coins, amountCents, status: 'pending', paymentRef: null, createdAt: new Date().toISOString(), paidAt: null };
      coinOrders.set(o.id, o);
      return { ...o };
    },
    async getCoinOrder(id) {
      const o = coinOrders.get(id);
      return o ? { ...o } : null;
    },
    async payCoinOrder(id, paymentRef) {
      const o = coinOrders.get(id);
      if (!o) return { status: 'missing' };
      if (o.status === 'paid') return { status: 'duplicate' };
      Object.assign(o, { status: 'paid', paymentRef, paidAt: new Date().toISOString() });
      const balance = await this.applyCoins(o.walletId, o.coins, 'purchase', o.id);
      return { status: 'paid', balance, coins: o.coins };
    },
    // --- Ad cards ---
    async upsertCard(walletId, card) {
      cards.set(walletId, { walletId, ...cards.get(walletId), ...card, updatedAt: new Date().toISOString() });
      return { ...cards.get(walletId) };
    },
    async getCard(walletId) {
      const c = cards.get(walletId);
      return c ? { ...c } : null;
    },
    async listCardReviews() {
      return [...cards.values()].filter((c) => c.status === 'review').map((c) => ({ ...c }));
    },
    // --- Game attempts ---
    async createAttempt({ walletId, region, roundId, seed, paidCoins = 0, ipHash = null, deviceHash = null }) {
      const a = { id: randomUUID(), walletId, region, roundId, seed, status: 'started', paidCoins, ipHash, deviceHash, startedAt: new Date().toISOString(), finishedAt: null, moves: null, durationMs: null };
      attempts.set(a.id, a);
      return { ...a };
    },
    async getAttempt(id) {
      const a = attempts.get(id);
      return a ? { ...a } : null;
    },
    // Only a 'started' attempt can be finished (once).
    async finishAttempt(id, fields) {
      const a = attempts.get(id);
      if (!a || a.status !== 'started') return false;
      Object.assign(a, fields);
      return true;
    },
    async countAttempts({ walletId = null, ipHash = null, deviceHash = null, sinceIso, paid = null }) {
      return [...attempts.values()].filter(
        (a) =>
          a.startedAt >= sinceIso &&
          (walletId === null || a.walletId === walletId) &&
          (ipHash === null || a.ipHash === ipHash) &&
          (deviceHash === null || a.deviceHash === deviceHash) &&
          (paid === null || (paid ? a.paidCoins > 0 : a.paidCoins === 0)),
      ).length;
    },
    // Newest attempts first, for one wallet / IP / device (cooldowns).
    async recentAttempts({ walletId = null, ipHash = null, deviceHash = null, limit = 10 }) {
      return [...attempts.values()]
        .filter((a) => (walletId !== null && a.walletId === walletId) || (ipHash !== null && a.ipHash === ipHash) || (deviceHash !== null && a.deviceHash === deviceHash))
        .sort((x, y) => (x.startedAt < y.startedAt ? 1 : -1))
        .slice(0, limit)
        .map((a) => ({ ...a }));
    },
    async walletRecords(walletId) {
      const mine = [...attempts.values()].filter((a) => a.walletId === walletId);
      const solved = mine.filter((a) => a.status === 'solved');
      return {
        games: mine.length,
        solves: solved.length,
        bestMs: solved.length ? Math.min(...solved.map((a) => a.durationMs)) : null,
        reigns: [...bids.values()].filter((b) => b.walletId === walletId && b.scoreMs != null && b.status === 'won').length,
      };
    },
    async voidAttempt(id) {
      const a = attempts.get(id);
      if (a) a.status = 'failed';
    },
    async countSolves(walletId) {
      return [...attempts.values()].filter((a) => a.walletId === walletId && a.status === 'solved').length;
    },
    // Mirrors game_leaderboard(): each player's best solve this round.
    async gameLeaderboard(region, roundId, limit) {
      const best = new Map();
      for (const a of attempts.values()) {
        if (a.region !== region || a.roundId !== roundId || a.status !== 'solved') continue;
        const cur = best.get(a.walletId);
        if (!cur || a.durationMs < cur.bestMs) best.set(a.walletId, { walletId: a.walletId, bestMs: a.durationMs, solves: (cur?.solves ?? 0) + 1 });
        else cur.solves += 1;
      }
      return [...best.values()]
        .sort((x, y) => x.bestMs - y.bestMs)
        .slice(0, limit)
        .map((e) => ({ ...e, playerName: wallets.get(e.walletId)?.playerName ?? null }));
    },
    async gameStats(region, roundId) {
      const today = [...attempts.values()].filter((a) => a.region === region && a.roundId === roundId);
      return { games: today.length, solves: today.filter((a) => a.status === 'solved').length, players: new Set(today.map((a) => a.walletId)).size };
    },
    async setShield(bidId, untilIso) {
      const b = bids.get(bidId);
      if (b) b.shieldEndsAt = untilIso;
    },

    async videoUsage(url) {
      const users = [...bids.values()].filter((b) => b.videoUrl === url);
      if (users.some((b) => b.status !== 'pending')) return 'paid';
      return users.length ? 'unpaid' : 'none';
    },
    async setPaused(region, value) {
      stateOf(region);
      paused[region] = Boolean(value);
    },
    async isPaused(region) {
      return paused[region] ?? false;
    },
    async searchAds({ region, q, limit }) {
      const needle = (q ?? '').trim().toLowerCase();
      return [...bids.values()]
        .filter((b) => (!region || b.region === region) && b.status !== 'pending')
        .filter((b) => !needle || b.id === needle || b.name.toLowerCase().includes(needle))
        .sort((a, b) => (b.settledAt ?? b.createdAt).localeCompare(a.settledAt ?? a.createdAt))
        .slice(0, limit)
        .map((b) => ({ ...b }));
    },

    // --- Ad performance (mirrors add_views / record_daily / ad_performance) ---
    async addViews(deltas) {
      for (const [id, n] of Object.entries(deltas)) {
        const bid = bids.get(id);
        if (bid && n > 0) bid.views += n;
      }
    },
    async recordDaily(region, day, visitors, peak) {
      const key = `${region}:${day}`;
      const cur = daily.get(key) ?? { region, day, visitors: 0, peak: 0 };
      daily.set(key, { ...cur, visitors: Math.max(cur.visitors, visitors), peak: Math.max(cur.peak, peak) });
    },
    async getPerformance(region) {
      const now = Date.now();
      const since7 = now - 7 * 86400_000;
      const days = [...daily.values()].filter((d) => d.region === region && Date.parse(d.day) > since7 - 86400_000);
      const won = [...bids.values()].filter((b) => b.region === region && b.status === 'won');
      const recent = won.filter((b) => Date.parse(b.settledAt) > since7);
      const kings = won.filter((b) => b.board === 'throne' && b.views > 0 && Date.parse(b.settledAt) > now - 30 * 86400_000);
      const avg = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
      return {
        visitors7d: days.reduce((a, d) => a + d.visitors, 0),
        days: days.length,
        clicks7d: recent.reduce((a, b) => a + b.clicks, 0),
        ads7d: recent.length,
        avgThroneReach: avg(kings.map((b) => b.views)),
        avgThroneClicks: avg(kings.map((b) => b.clicks)),
      };
    },

    // --- Admin: mirrors admin_financials() in schema.sql (one entry per region,
    // never summed across currencies) ---
    async getFinancials() {
      const paidPacks = (region) => [...coinOrders.values()].filter((o) => o.region === region && o.status === 'paid');
      const all = [...bids.values()];
      const hourAgo = iso(Date.now() - 3600_000);
      const hype = {};
      for (const j of hypeJobs) hype[j.status] = (hype[j.status] ?? 0) + 1;
      const regions = {};
      for (const region of REGIONS) {
        const mine = all.filter((b) => b.region === region);
        const won = mine.filter((b) => b.status === 'won');
        const refunded = mine.filter((b) => b.status === 'refunded');
        const total = (list) => list.reduce((s, b) => s + b.amountCents + b.addonCents, 0);
        const ads = (list) => list.reduce((s, b) => s + b.amountCents, 0);
        regions[region] = {
          wonBids: won.length,
          grossCents: total(won),
          addonCents: won.reduce((s, b) => s + b.addonCents, 0),
          throneGrossCents: ads(won.filter((b) => b.board === 'throne')),
          boardsGrossCents: ads(won.filter((b) => b.board !== 'throne')),
          bookings: won.filter((b) => b.board !== 'throne').length,
          relegations: won.filter((b) => b.relegatedFrom).length,
          estFeesCents: [...won, ...refunded]
            .filter((b) => b.paymentRef && !b.paymentRef.startsWith('demo_'))
            .reduce((s, b) => s + estFee(region, b.amountCents + b.addonCents), 0),
          refundedCents: total(refunded),
          coinPacks: paidPacks(region).length,
          coinPacksCents: paidPacks(region).reduce((s, o) => s + o.amountCents, 0),
          coinPacksFeesCents: paidPacks(region)
            .filter((o) => !String(o.paymentRef).startsWith('demo_'))
            .reduce((s, o) => s + estFee(region, o.amountCents), 0),
          coinAds: won.filter((b) => b.coins > 0).length,
        };
      }
      return {
        regions,
        stalePending: all.filter((b) => b.status === 'pending' && b.createdAt < hourAgo).length,
        hype,
      };
    },
  };
}
