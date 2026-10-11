import { createClient } from '@supabase/supabase-js';

const LEGEND_SORTS = {
  recent: 'deposed_at',
  longest: 'reign_seconds',
  priciest: 'amount_cents',
};

// Postgres-backed store. Settlement runs inside the settle_bid() SQL function
// (see supabase/schema.sql), which row-locks the region's throne or board so
// concurrent payments are serialized. Deposed kings are archived by a trigger.
// Every query that reads game state is scoped to one region.
export function createSupabaseStore({ url, serviceRoleKey }) {
  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  const fromRow = (r) =>
    r && {
      id: r.id,
      region: r.region,
      board: r.board,
      status: r.status,
      amountCents: r.amount_cents,
      addonCents: r.addon_cents,
      address: r.address,
      shieldSeconds: r.shield_seconds,
      shieldEndsAt: r.shield_ends_at,
      days: r.days,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      relegatedFrom: r.relegated_from,
      ownerHash: r.owner_hash,
      name: r.name,
      tagline: r.tagline,
      imageUrl: r.image_url,
      videoUrl: r.video_url,
      reviewSince: r.review_since,
      termsVersion: r.terms_version,
      termsAcceptedAt: r.terms_accepted_at,
      scoreMs: r.score_ms,
      gameRoundId: r.game_round_id,
      walletId: r.wallet_id,
      coins: r.coins ?? 0,
      targetUrl: r.target_url,
      paymentRef: r.payment_ref,
      clicks: r.clicks,
      views: r.views ?? 0,
      createdAt: r.created_at,
      settledAt: r.settled_at,
      removedAt: r.removed_at,
      removedReason: r.removed_reason,
      removedBy: r.removed_by,
    };

  const legendFromRow = (r) => ({
    id: r.id,
    region: r.region,
    bidId: r.bid_id,
    name: r.name,
    tagline: r.tagline,
    imageUrl: r.image_url,
    targetUrl: r.target_url,
    amountCents: r.amount_cents,
    crownedAt: r.crowned_at,
    deposedAt: r.deposed_at,
    deposedByName: r.deposed_by_name,
    retired: r.retired,
    reignSeconds: r.reign_seconds,
    survivedShield: r.survived_shield,
    clicks: r.bid?.clicks ?? 0,
    views: r.bid?.views ?? 0,
    removedAt: r.bid?.removed_at ?? null,
    scoreMs: r.bid?.score_ms ?? null,
  });

  const contactFromRow = (r) =>
    r && { id: r.id, at: r.at, topic: r.topic, name: r.name, email: r.email, company: r.company, message: r.message, adId: r.ad_id, region: r.region, handledAt: r.handled_at };

  const logFromRow = (r) =>
    r && {
      id: r.id,
      at: r.at,
      action: r.action,
      bidId: r.bid_id,
      region: r.region,
      reason: r.reason,
      before: r.before,
      after: r.after,
      undoable: r.undoable,
      undoneAt: r.undone_at,
    };

  const jobFromRow = (r) =>
    r && { id: r.id, status: r.status, payload: r.payload, videoUrl: r.video_url, error: r.error, createdAt: r.created_at };

  const check = ({ data, error, count }) => {
    if (error) throw new Error(`Supabase: ${error.message}`);
    return count === undefined || count === null ? data : { data, count };
  };

  const walletFrom = (r) =>
    r && {
      id: r.id,
      tokenHash: r.token_hash,
      balance: Number(r.balance),
      playerName: r.player_name,
      referralCode: r.referral_code,
      referredBy: r.referred_by,
      referralPaid: r.referral_paid,
      createdIpHash: r.created_ip_hash,
      createdDeviceHash: r.created_device_hash,
      region: r.region,
      banned: r.banned,
      banReason: r.ban_reason,
      backedUpAt: r.backed_up_at,
      lastDailyAt: r.last_daily_at,
      streakDays: r.streak_days ?? 0,
      createdAt: r.created_at,
    };
  const orderFrom = (r) =>
    r && { id: r.id, walletId: r.wallet_id, region: r.region, pack: r.pack, coins: r.coins, amountCents: r.amount_cents, status: r.status, paymentRef: r.payment_ref, createdAt: r.created_at, paidAt: r.paid_at };
  const CARD_COLS = { region: 'region', name: 'name', tagline: 'tagline', targetUrl: 'target_url', imageUrl: 'image_url', status: 'status', reason: 'reason', termsVersion: 'terms_version', reviewSince: 'review_since' };
  const cardFrom = (r) => {
    if (!r) return null;
    const c = { walletId: r.wallet_id, updatedAt: r.updated_at };
    for (const [k, col] of Object.entries(CARD_COLS)) c[k] = r[col];
    return c;
  };
  const attemptFrom = (r) =>
    r && {
      id: r.id,
      walletId: r.wallet_id,
      region: r.region,
      roundId: r.round_id === null ? null : Number(r.round_id),
      seed: r.seed,
      status: r.status,
      paidCoins: r.paid_coins,
      ipHash: r.ip_hash,
      deviceHash: r.device_hash,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      moves: r.moves,
      durationMs: r.duration_ms,
    };

  const getBid = async (id) => fromRow(check(await db.from('bids').select('*').eq('id', id).maybeSingle()));
  // Two FKs point at bids (bid_id, deposed_by), so name the one we join on.
  const LEGEND_SELECT = '*, bid:bids!throne_legends_bid_id_fkey(clicks, views, removed_at, score_ms)';

  return {
    kind: 'supabase',

    // --- Ads (throne bids and board bookings) ---
    async createBid({ region, board, amountCents, addonCents = 0, address = null, shieldSeconds = 0, days = null, relegatedFrom = null, ownerHash, name, tagline, imageUrl, videoUrl = null, targetUrl, termsVersion = null, scoreMs = null, walletId = null, coins = 0 }) {
      const row = check(
        await db
          .from('bids')
          .insert({
            region,
            board,
            amount_cents: amountCents,
            addon_cents: addonCents,
            address,
            shield_seconds: shieldSeconds,
            days,
            relegated_from: relegatedFrom,
            owner_hash: ownerHash,
            name,
            tagline,
            image_url: imageUrl,
            video_url: videoUrl,
            target_url: targetUrl,
            terms_version: termsVersion,
            terms_accepted_at: termsVersion ? new Date().toISOString() : null,
            score_ms: scoreMs,
            wallet_id: walletId,
            coins,
          })
          .select()
          .single(),
      );
      return fromRow(row);
    },

    getBid,

    // `rules` must be the rules of the bid's own region (settle_bid checks).
    async settleBid(id, paymentRef, rules) {
      const result = check(await db.rpc('settle_bid', { p_bid_id: id, p_payment_ref: paymentRef, p_rules: rules }));
      if (result.status === 'missing') return result;
      const bid = await getBid(id);
      const previous = result.previous_bid_id ? await getBid(result.previous_bid_id) : null;
      return {
        status: result.status,
        bid,
        previous,
        crowned: result.crowned ?? null,
        retired: result.retired ?? null,
        round: result.round ?? null,
      };
    },

    // Video ads: paid, waiting for a human. Not live, not counted anywhere.
    async markReview(id, paymentRef) {
      check(await db.from('bids').update({ status: 'review', payment_ref: paymentRef, review_since: new Date().toISOString() }).eq('id', id).eq('status', 'pending'));
    },
    async listReviews() {
      return check(await db.from('bids').select('*').eq('status', 'review').order('review_since')).map(fromRow);
    },
    // Approved: back to pending so settle_bid (with its race checks) runs.
    async reviewToPending(id) {
      const rows = check(await db.from('bids').update({ status: 'pending' }).eq('id', id).eq('status', 'review').select('id'));
      return rows.length > 0;
    },
    async rejectReview(id, reason) {
      const rows = check(
        await db
          .from('bids')
          .update({ status: 'refunded', removed_at: new Date().toISOString(), removed_reason: reason, removed_by: 'admin', video_url: null })
          .eq('id', id)
          .eq('status', 'review')
          .select('id'),
      );
      return rows.length > 0;
    },

    async setStatus(id, status) {
      check(await db.from('bids').update({ status }).eq('id', id));
    },

    // --- Admin god mode ---
    async logAdmin({ action, bidId = null, region = null, reason = null, before = null, after = null, undoable = false }) {
      const row = check(await db.from('admin_log').insert({ action, bid_id: bidId, region, reason, before, after, undoable }).select().single());
      return logFromRow(row);
    },
    async listAdminLog(limit) {
      const rows = check(await db.from('admin_log').select('*, bid:bids(name)').order('at', { ascending: false }).limit(limit));
      return rows.map((r) => ({ ...logFromRow(r), name: r.bid?.name ?? null }));
    },
    async getAdminLog(id) {
      return logFromRow(check(await db.from('admin_log').select('*').eq('id', id).maybeSingle()));
    },
    async markUndone(id) {
      const rows = check(await db.from('admin_log').update({ undone_at: new Date().toISOString() }).eq('id', id).is('undone_at', null).select('id'));
      return rows.length > 0;
    },
    async updateAdFields(id, { name, tagline, targetUrl }) {
      return fromRow(check(await db.from('bids').update({ name, tagline, target_url: targetUrl }).eq('id', id).select().maybeSingle()));
    },
    async setAdTimes(id, { startsAt, endsAt }) {
      check(await db.from('bids').update({ starts_at: startsAt, ends_at: endsAt }).eq('id', id));
    },
    // The archive trigger records it as a retirement (bid_id -> null).
    async forceRetire(region, bidId) {
      const rows = check(await db.from('throne').update({ bid_id: null }).eq('region', region).eq('bid_id', bidId).select('region'));
      return rows.length > 0;
    },
    async unretire(region, bidId, sinceIso) {
      const rows = check(await db.from('throne').update({ bid_id: bidId }).eq('region', region).is('bid_id', null).select('region'));
      if (!rows.length) return false;
      check(await db.from('throne_legends').delete().eq('bid_id', bidId).eq('retired', true).gte('deposed_at', sinceIso));
      return true;
    },
    // --- Contact inbox (kept 90 days) ---
    async createContact({ topic, name, email, company, message, adId, region }) {
      const row = check(await db.from('contact_messages').insert({ topic, name, email, company, message, ad_id: adId, region }).select().single());
      return contactFromRow(row);
    },
    async listContacts(limit) {
      return check(await db.from('contact_messages').select('*').order('at', { ascending: false }).limit(limit)).map(contactFromRow);
    },
    async markContactHandled(id) {
      const row = check(await db.from('contact_messages').select('handled_at').eq('id', id).maybeSingle());
      if (!row) return false;
      check(await db.from('contact_messages').update({ handled_at: row.handled_at ? null : new Date().toISOString() }).eq('id', id));
      return true;
    },
    async deleteContact(id) {
      return check(await db.from('contact_messages').delete().eq('id', id).select('id')).length > 0;
    },
    async purgeContacts(beforeIso) {
      check(await db.from('contact_messages').delete().lt('at', beforeIso));
    },

    // Paid ads that were not placed and still need their money back.
    async listRefundsOwed(beforeIso) {
      return check(await db.from('bids').select('*').in('status', ['outbid', 'void']).not('payment_ref', 'is', null).lte('created_at', beforeIso).limit(100)).map(fromRow);
    },

    // --- Ads Game: wallets and coins (see apply_coins & co. in schema.sql) ---
    async createWallet({ region = 'global', tokenHash, referralCode, referredBy = null, ipHash = null, deviceHash = null }) {
      return walletFrom(
        check(
          await db
            .from('wallets')
            .insert({ region, token_hash: tokenHash, referral_code: referralCode, referred_by: referredBy, created_ip_hash: ipHash, created_device_hash: deviceHash })
            .select()
            .single(),
        ),
      );
    },
    async getWalletByHash(tokenHash) {
      return walletFrom(check(await db.from('wallets').select('*').eq('token_hash', tokenHash).maybeSingle()));
    },
    async getWallet(id) {
      return walletFrom(check(await db.from('wallets').select('*').eq('id', id).maybeSingle()));
    },
    async getWalletByReferral(code) {
      return walletFrom(check(await db.from('wallets').select('*').eq('referral_code', code).maybeSingle()));
    },
    async countWalletsByIp(ipHash, sinceIso, deviceHash = null) {
      let q = db.from('wallets').select('id', { count: 'exact', head: true }).gte('created_at', sinceIso);
      q = deviceHash ? q.or(`created_ip_hash.eq.${ipHash},created_device_hash.eq.${deviceHash}`) : q.eq('created_ip_hash', ipHash);
      const { count, error } = await q;
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async countWalletsByDevice(deviceHash, sinceIso) {
      const { count, error } = await db.from('wallets').select('id', { count: 'exact', head: true }).eq('created_device_hash', deviceHash).gte('created_at', sinceIso);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async listReferrals(walletId) {
      const rows = check(await db.from('wallets').select('id, player_name, created_at, referral_paid, banned').eq('referred_by', walletId).order('created_at', { ascending: false }).limit(1000));
      return rows.map((w) => ({ id: w.id, playerName: w.player_name, createdAt: w.created_at, referralPaid: w.referral_paid, banned: w.banned }));
    },
    async searchWallets(q, limit = 50) {
      const needle = (q ?? '').trim();
      let query = db.from('wallets').select('*').order('created_at', { ascending: false }).limit(limit);
      if (/^[0-9a-f-]{36}$/i.test(needle)) query = query.eq('id', needle);
      else if (/^[A-Z0-9]{8}$/i.test(needle)) query = query.or(`referral_code.eq.${needle.toUpperCase()},player_name.ilike.%${needle}%`);
      else if (needle) query = query.ilike('player_name', `%${needle.replace(/[%_\\,()]/g, '')}%`);
      return check(await query).map(walletFrom);
    },
    async listAttemptsAdmin({ region = null, walletId = null, status = null, limit = 100 }) {
      let q = db.from('game_attempts').select('*, wallet:wallets(player_name)').order('started_at', { ascending: false }).limit(limit);
      if (region) q = q.eq('region', region);
      if (walletId) q = q.eq('wallet_id', walletId);
      if (status) q = q.eq('status', status);
      return check(await q).map((r) => ({ ...attemptFrom(r), playerName: r.wallet?.player_name ?? null }));
    },
    async listCoinOrders({ walletId = null, limit = 100 }) {
      let q = db.from('coin_orders').select('*').order('created_at', { ascending: false }).limit(limit);
      if (walletId) q = q.eq('wallet_id', walletId);
      return check(await q).map(orderFrom);
    },
    async purgeAttemptHashes(beforeIso) {
      check(await db.from('game_attempts').update({ ip_hash: null, device_hash: null }).lt('started_at', beforeIso).not('ip_hash', 'is', null));
    },
    async countReferrals(walletId) {
      const { count, error } = await db.from('wallets').select('id', { count: 'exact', head: true }).eq('referred_by', walletId).eq('referral_paid', true);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async setWalletFields(id, fields) {
      const row = {};
      if ('playerName' in fields) row.player_name = fields.playerName;
      if ('referralPaid' in fields) row.referral_paid = fields.referralPaid;
      if ('tokenHash' in fields) row.token_hash = fields.tokenHash;
      if ('banned' in fields) row.banned = fields.banned;
      if ('banReason' in fields) row.ban_reason = fields.banReason;
      if ('backedUpAt' in fields) row.backed_up_at = fields.backedUpAt;
      check(await db.from('wallets').update(row).eq('id', id));
    },
    async applyCoins(walletId, delta, reason, ref = null) {
      return Number(check(await db.rpc('apply_coins', { p_wallet: walletId, p_delta: delta, p_reason: reason, p_ref: ref })));
    },
    async claimDaily(walletId, coins) {
      const r = check(await db.rpc('claim_daily', { p_wallet: walletId, p_coins: coins }));
      return { balance: Number(r.balance), coins: r.coins, streak: r.streak };
    },
    async listLedger(walletId, limit) {
      const rows = check(await db.from('coin_ledger').select('*').eq('wallet_id', walletId).order('id', { ascending: false }).limit(limit));
      return rows.map((l) => ({ walletId: l.wallet_id, delta: l.delta, reason: l.reason, ref: l.ref, balanceAfter: Number(l.balance_after), at: l.at }));
    },
    async createCoinOrder({ walletId, region, pack, coins, amountCents }) {
      return orderFrom(check(await db.from('coin_orders').insert({ wallet_id: walletId, region, pack, coins, amount_cents: amountCents }).select().single()));
    },
    async getCoinOrder(id) {
      return orderFrom(check(await db.from('coin_orders').select('*').eq('id', id).maybeSingle()));
    },
    async payCoinOrder(id, paymentRef) {
      return check(await db.rpc('pay_coin_order', { p_order: id, p_payment_ref: paymentRef }));
    },
    async upsertCard(walletId, card) {
      const row = { wallet_id: walletId, updated_at: new Date().toISOString() };
      for (const [k, col] of Object.entries(CARD_COLS)) if (k in card) row[col] = card[k];
      return cardFrom(check(await db.from('ad_cards').upsert(row).select().single()));
    },
    async getCard(walletId) {
      return cardFrom(check(await db.from('ad_cards').select('*').eq('wallet_id', walletId).maybeSingle()));
    },
    async listCardReviews() {
      return check(await db.from('ad_cards').select('*').eq('status', 'review').order('review_since')).map(cardFrom);
    },
    async createAttempt({ walletId, region, roundId, seed, paidCoins = 0, ipHash = null, deviceHash = null }) {
      return attemptFrom(
        check(
          await db
            .from('game_attempts')
            .insert({ wallet_id: walletId, region, round_id: roundId, seed, paid_coins: paidCoins, ip_hash: ipHash, device_hash: deviceHash })
            .select()
            .single(),
        ),
      );
    },
    async getAttempt(id) {
      return attemptFrom(check(await db.from('game_attempts').select('*').eq('id', id).maybeSingle()));
    },
    // Only a 'started' attempt can be finished, once (the status filter makes
    // two simultaneous finishes race safely).
    async finishAttempt(id, fields) {
      const row = {};
      if ('status' in fields) row.status = fields.status;
      if ('finishedAt' in fields) row.finished_at = fields.finishedAt;
      if ('moves' in fields) row.moves = fields.moves;
      if ('durationMs' in fields) row.duration_ms = fields.durationMs;
      return check(await db.from('game_attempts').update(row).eq('id', id).eq('status', 'started').select('id')).length > 0;
    },
    async countAttempts({ walletId = null, ipHash = null, deviceHash = null, sinceIso, paid = null }) {
      let q = db.from('game_attempts').select('id', { count: 'exact', head: true }).gte('started_at', sinceIso);
      if (walletId) q = q.eq('wallet_id', walletId);
      if (ipHash) q = q.eq('ip_hash', ipHash);
      if (deviceHash) q = q.eq('device_hash', deviceHash);
      if (paid === true) q = q.gt('paid_coins', 0);
      if (paid === false) q = q.eq('paid_coins', 0);
      const { count, error } = await q;
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async recentAttempts({ walletId = null, ipHash = null, deviceHash = null, limit = 10 }) {
      const ors = [];
      if (walletId) ors.push(`wallet_id.eq.${walletId}`);
      if (ipHash) ors.push(`ip_hash.eq.${ipHash}`);
      if (deviceHash) ors.push(`device_hash.eq.${deviceHash}`);
      if (!ors.length) return [];
      return check(await db.from('game_attempts').select('*').or(ors.join(',')).order('started_at', { ascending: false }).limit(limit)).map(attemptFrom);
    },
    async voidAttempt(id) {
      check(await db.from('game_attempts').update({ status: 'failed' }).eq('id', id));
    },
    async countSolves(walletId) {
      const { count, error } = await db.from('game_attempts').select('id', { count: 'exact', head: true }).eq('wallet_id', walletId).eq('status', 'solved');
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async walletRecords(walletId) {
      const all = check(await db.from('game_attempts').select('status, duration_ms').eq('wallet_id', walletId).limit(5000));
      const solved = all.filter((a) => a.status === 'solved');
      const { count } = await db.from('bids').select('id', { count: 'exact', head: true }).eq('wallet_id', walletId).not('score_ms', 'is', null).eq('status', 'won');
      return { games: all.length, solves: solved.length, bestMs: solved.length ? Math.min(...solved.map((a) => a.duration_ms)) : null, reigns: count ?? 0 };
    },
    async gameLeaderboard(region, roundId, limit) {
      const rows = check(await db.rpc('game_leaderboard', { p_region: region, p_round: roundId, p_limit: limit }));
      return rows.map((r) => ({ walletId: r.wallet_id, playerName: r.player_name, bestMs: r.best_ms, solves: Number(r.solves) }));
    },
    async gameStats(region, roundId) {
      const rows = check(await db.from('game_attempts').select('wallet_id, status').eq('region', region).eq('round_id', roundId).limit(20000));
      return { games: rows.length, solves: rows.filter((r) => r.status === 'solved').length, players: new Set(rows.map((r) => r.wallet_id)).size };
    },
    async setShield(bidId, untilIso) {
      check(await db.from('bids').update({ shield_ends_at: untilIso }).eq('id', bidId));
    },

    async videoUsage(url) {
      const rows = check(await db.from('bids').select('status').eq('video_url', url));
      if (rows.some((r) => r.status !== 'pending')) return 'paid';
      return rows.length ? 'unpaid' : 'none';
    },
    async setPaused(region, value) {
      check(await db.from('throne').update({ paused: Boolean(value) }).eq('region', region));
    },
    async isPaused(region) {
      return Boolean(check(await db.from('throne').select('paused').eq('region', region).single()).paused);
    },
    async searchAds({ region, q, limit }) {
      let query = db.from('bids').select('*').neq('status', 'pending').order('created_at', { ascending: false }).limit(limit);
      if (region) query = query.eq('region', region);
      const needle = (q ?? '').trim();
      if (/^[0-9a-f-]{36}$/i.test(needle)) query = query.eq('id', needle);
      else if (needle) query = query.ilike('name', `%${needle.replace(/[%_\\]/g, '')}%`);
      return check(await query).map(fromRow);
    },

    // --- Ad performance ---
    async addViews(deltas) {
      const ids = Object.keys(deltas);
      if (!ids.length) return;
      check(await db.rpc('add_views', { p_ids: ids, p_counts: ids.map((id) => deltas[id]) }));
    },
    async recordDaily(region, day, visitors, peak) {
      check(await db.rpc('record_daily', { p_region: region, p_day: day, p_visitors: visitors, p_peak: peak }));
    },
    async getPerformance(region) {
      return check(await db.rpc('ad_performance', { p_region: region }));
    },

    async recordClick(id) {
      check(await db.rpc('record_click', { p_bid_id: id }));
    },

    async getThrone(region) {
      const [throneRes, recordRes] = await Promise.all([
        db.from('throne').select('bid_id, takeovers, volume_cents').eq('region', region).single(),
        // Highest price ever paid for this region's throne (index-friendly: one row).
        db.from('bids').select('amount_cents').eq('region', region).eq('board', 'throne').eq('status', 'won').order('amount_cents', { ascending: false }).limit(1),
      ]);
      const row = check(throneRes);
      const record = check(recordRes);
      return {
        bid: row.bid_id ? await getBid(row.bid_id) : null,
        takeovers: Number(row.takeovers),
        volumeCents: Number(row.volume_cents),
        recordCents: record[0]?.amount_cents ?? 0,
      };
    },

    async getBoards(region, nowMs) {
      const nowIso = new Date(nowMs).toISOString();
      const [rows, boards] = await Promise.all([
        db.from('bids').select('*').eq('region', region).eq('status', 'won').neq('board', 'throne').gt('ends_at', nowIso).order('starts_at'),
        db.from('boards').select('id, booked_until').eq('region', region),
      ]);
      const booked = check(rows).map(fromRow);
      const out = {};
      for (const b of check(boards)) {
        const mine = booked.filter((x) => x.board === b.id);
        const current = mine.find((x) => Date.parse(x.startsAt) <= nowMs) ?? null;
        const upcoming = mine.filter((x) => Date.parse(x.startsAt) > nowMs);
        out[b.id] = { current, nextStartsAt: upcoming[0]?.startsAt ?? null, upcoming: upcoming.length, bookedUntil: b.booked_until };
      }
      return out;
    },

    async getRecentlyDethroned(region, sinceIso) {
      const rows = check(
        await db
          .from('throne_legends')
          .select(LEGEND_SELECT)
          .eq('region', region)
          .eq('retired', false)
          .gte('deposed_at', sinceIso)
          .order('deposed_at', { ascending: false })
          .limit(50),
      );
      return rows.map(legendFromRow);
    },

    async getLegend(bidId) {
      const row = check(await db.from('throne_legends').select(LEGEND_SELECT).eq('bid_id', bidId).maybeSingle());
      return row ? legendFromRow(row) : null;
    },

    async hasRelegation(bidId) {
      const rows = check(await db.from('bids').select('id').eq('relegated_from', bidId).eq('status', 'won').limit(1));
      return rows.length > 0;
    },

    async getTopAdvertisers(region, limit) {
      const rows = check(await db.rpc('top_advertisers', { p_region: region, p_limit: limit }));
      return rows.map((r) => ({ name: r.name, totalCents: Number(r.total_cents), ads: Number(r.ads), lastAt: r.last_at }));
    },

    async countAdvertisers(region) {
      const r = check(await db.rpc('count_advertisers', { p_region: region }));
      return { advertisers: Number(r.advertisers), ads: Number(r.ads) };
    },

    async getLegends({ region, sort, limit, offset }) {
      const { data, count } = check(
        await db
          .from('throne_legends')
          .select(LEGEND_SELECT, { count: 'exact' })
          .eq('region', region)
          .order(LEGEND_SORTS[sort] ?? LEGEND_SORTS.recent, { ascending: false })
          .range(offset, offset + limit - 1),
      );
      return { total: count, items: data.map(legendFromRow) };
    },

    // --- King of the Day (per region) ---
    async tickThrone(region, rules) {
      return check(await db.rpc('tick_throne', { p_region: region, p_rules: rules }));
    },

    async getDayKings(region, limit) {
      const rows = check(
        await db
          .from('crown_rounds')
          .select('id, closed_at, takeovers, bid:bids!crown_rounds_winner_bid_id_fkey(id, name, tagline, image_url, amount_cents, removed_at, score_ms)')
          .eq('region', region)
          .not('winner_bid_id', 'is', null)
          .order('closed_at', { ascending: false })
          .limit(limit),
      );
      return rows.map((r) => ({
        roundId: r.id,
        crownedAt: r.closed_at,
        takeovers: r.takeovers,
        bidId: r.bid.id,
        name: r.bid.name,
        tagline: r.bid.tagline,
        imageUrl: r.bid.image_url,
        amountCents: r.bid.amount_cents,
        scoreMs: r.bid.score_ms ?? null,
        removedAt: r.bid.removed_at,
      }));
    },

    // --- Reports & takedowns (all regions; ads carry their region) ---
    async reportBid({ bidId, reason, details, reporterHash, threshold }) {
      return check(
        await db.rpc('report_bid', {
          p_bid_id: bidId,
          p_reason: reason,
          p_details: details,
          p_reporter_hash: reporterHash,
          p_threshold: threshold,
        }),
      );
    },

    async listReports() {
      const rows = check(
        await db
          .from('reports')
          .select('id, bid_id, reason, details, status, created_at, bid:bids(*)')
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .limit(500),
      );
      const byBid = new Map();
      for (const r of rows) {
        if (!byBid.has(r.bid_id)) byBid.set(r.bid_id, { bid: fromRow(r.bid), reports: [] });
        byBid.get(r.bid_id).reports.push({ id: r.id, bidId: r.bid_id, reason: r.reason, details: r.details, status: r.status, createdAt: r.created_at });
      }
      return [...byBid.values()];
    },

    async listRemoved(limit) {
      const rows = check(
        await db.from('bids').select('*').not('removed_at', 'is', null).order('removed_at', { ascending: false }).limit(limit),
      );
      return rows.map(fromRow);
    },

    async removeBid(id, reason) {
      const row = check(
        await db
          .from('bids')
          .update({ removed_at: new Date().toISOString(), removed_reason: reason, removed_by: 'admin' })
          .eq('id', id)
          .select()
          .maybeSingle(),
      );
      check(await db.from('reports').update({ status: 'actioned' }).eq('bid_id', id).eq('status', 'open'));
      return fromRow(row);
    },

    async restoreBid(id) {
      const row = check(
        await db
          .from('bids')
          .update({ removed_at: null, removed_reason: null, removed_by: null })
          .eq('id', id)
          .select()
          .maybeSingle(),
      );
      check(await db.from('reports').update({ status: 'dismissed' }).eq('bid_id', id).eq('status', 'open'));
      return fromRow(row);
    },

    async dismissReports(id) {
      check(await db.from('reports').update({ status: 'dismissed' }).eq('bid_id', id).eq('status', 'open'));
    },

    // After the file itself is deleted: drop every reference to it, including
    // the archive's snapshot copy.
    async clearImage(id) {
      check(await db.from('bids').update({ image_url: null, video_url: null }).eq('id', id));
      check(await db.from('throne_legends').update({ image_url: null }).eq('bid_id', id));
    },

    // --- Hype video jobs ---
    async enqueueHypeJob(payload) {
      check(await db.from('hype_jobs').insert({ payload }));
    },

    async claimHypeJob() {
      const rows = check(await db.rpc('claim_hype_job'));
      return rows.length ? jobFromRow(rows[0]) : null;
    },

    async finishHypeJob(id, { status, videoUrl = null, error = null }) {
      check(
        await db
          .from('hype_jobs')
          .update({ status, video_url: videoUrl, error, updated_at: new Date().toISOString() })
          .eq('id', id),
      );
    },

    async listHypeJobs(limit) {
      const rows = check(await db.from('hype_jobs').select('*').order('id', { ascending: false }).limit(limit));
      return rows.map(jobFromRow);
    },

    // --- Admin: one entry per region, never summed across currencies ---
    async getFinancials() {
      const f = check(await db.rpc('admin_financials'));
      const regions = {};
      for (const [region, r] of Object.entries(f.regions ?? {})) {
        regions[region] = {
          wonBids: Number(r.won_bids),
          grossCents: Number(r.gross_cents),
          addonCents: Number(r.addon_cents),
          throneGrossCents: Number(r.throne_gross_cents),
          boardsGrossCents: Number(r.boards_gross_cents),
          bookings: Number(r.bookings),
          relegations: Number(r.relegations),
          estFeesCents: Number(r.est_fees_cents),
          refundedCents: Number(r.refunded_cents),
          coinPacks: Number(r.coin_packs ?? 0),
          coinPacksCents: Number(r.coin_packs_cents ?? 0),
          coinPacksFeesCents: Number(r.coin_packs_fees_cents ?? 0),
          coinAds: Number(r.coin_ads ?? 0),
        };
      }
      return { regions, stalePending: Number(f.stale_pending), hype: f.hype ?? {} };
    },
  };
}
