import { createClient } from '@supabase/supabase-js';

const LEGEND_SORTS = {
  recent: 'deposed_at',
  longest: 'reign_seconds',
  priciest: 'amount_cents',
};

// Postgres-backed store. Settlement runs inside the settle_bid() SQL function
// (see supabase/schema.sql), which row-locks the throne so concurrent winners
// cannot both take it. Deposed kings are archived by a trigger.
export function createSupabaseStore({ url, serviceRoleKey }) {
  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  const fromRow = (r) =>
    r && {
      id: r.id,
      status: r.status,
      amountCents: r.amount_cents,
      walletId: r.wallet_id,
      creditsCents: r.credits_cents,
      chargeCents: r.charge_cents,
      shieldSeconds: r.shield_seconds,
      name: r.name,
      tagline: r.tagline,
      imageUrl: r.image_url,
      targetUrl: r.target_url,
      paymentRef: r.payment_ref,
      dividendCents: r.dividend_cents,
      clicks: r.clicks,
      createdAt: r.created_at,
      settledAt: r.settled_at,
      shieldEndsAt: r.shield_ends_at,
      removedAt: r.removed_at,
      removedReason: r.removed_reason,
      removedBy: r.removed_by,
    };

  const walletFromRow = (r) =>
    r && { id: r.id, balanceCents: r.balance_cents, lifetimeEarnedCents: r.lifetime_earned_cents, createdAt: r.created_at };

  const legendFromRow = (r) => ({
    id: r.id,
    bidId: r.bid_id,
    name: r.name,
    tagline: r.tagline,
    imageUrl: r.image_url,
    targetUrl: r.target_url,
    amountCents: r.amount_cents,
    crownedAt: r.crowned_at,
    deposedAt: r.deposed_at,
    deposedByName: r.deposed_by_name,
    reignSeconds: r.reign_seconds,
    survivedShield: r.survived_shield,
    dividendCents: r.bid?.dividend_cents ?? 0,
    clicks: r.bid?.clicks ?? 0,
    removedAt: r.bid?.removed_at ?? null,
  });

  const jobFromRow = (r) =>
    r && { id: r.id, status: r.status, payload: r.payload, videoUrl: r.video_url, error: r.error, createdAt: r.created_at };

  const check = ({ data, error, count }) => {
    if (error) throw new Error(`Supabase: ${error.message}`);
    return count === undefined || count === null ? data : { data, count };
  };

  const getBid = async (id) => fromRow(check(await db.from('bids').select('*').eq('id', id).maybeSingle()));

  return {
    kind: 'supabase',

    // --- Wallets (Throne Credits) ---
    async createWallet(tokenHash) {
      return walletFromRow(check(await db.from('wallets').insert({ token_hash: tokenHash }).select().single()));
    },

    async getWalletByHash(tokenHash) {
      return walletFromRow(check(await db.from('wallets').select('*').eq('token_hash', tokenHash).maybeSingle()));
    },

    // --- Bids ---
    async createBid({ amountCents, shieldSeconds, walletId, creditsCents, chargeCents, name, tagline, imageUrl, targetUrl }) {
      const row = check(
        await db
          .from('bids')
          .insert({
            amount_cents: amountCents,
            shield_seconds: shieldSeconds,
            wallet_id: walletId,
            credits_cents: creditsCents,
            charge_cents: chargeCents,
            name,
            tagline,
            image_url: imageUrl,
            target_url: targetUrl,
          })
          .select()
          .single(),
      );
      return fromRow(row);
    },

    getBid,

    async settleBid(id, paymentRef, rules) {
      const result = check(await db.rpc('settle_bid', { p_bid_id: id, p_payment_ref: paymentRef, p_rules: rules }));
      if (result.status === 'missing') return result;
      const bid = await getBid(id);
      const previous = result.previous_bid_id ? await getBid(result.previous_bid_id) : null;
      return {
        status: result.status,
        bid,
        previous,
        dividendCents: result.dividend_cents ?? 0,
        crowned: result.crowned ?? null,
        round: result.round ?? null,
      };
    },

    // --- King of the Day ---
    async tickCrown(rules) {
      return check(await db.rpc('tick_crown', { p_rules: rules }));
    },

    async getDayKings(limit) {
      const rows = check(
        await db
          .from('crown_rounds')
          .select('id, closed_at, takeovers, bid:bids!crown_rounds_winner_bid_id_fkey(id, name, tagline, image_url, amount_cents, removed_at)')
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
        removedAt: r.bid.removed_at,
      }));
    },

    // --- Reports & takedowns ---
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
      check(await db.from('bids').update({ image_url: null }).eq('id', id));
      check(await db.from('throne_legends').update({ image_url: null }).eq('bid_id', id));
    },

    async setStatus(id, status) {
      check(await db.from('bids').update({ status }).eq('id', id));
    },

    async recordClick(id) {
      check(await db.rpc('record_click', { p_bid_id: id }));
    },

    async getThrone() {
      const row = check(
        await db.from('throne').select('bid_id, creator_fund_cents, takeovers, volume_cents').eq('id', 1).single(),
      );
      return {
        bid: row.bid_id ? await getBid(row.bid_id) : null,
        creatorFundCents: Number(row.creator_fund_cents),
        takeovers: Number(row.takeovers),
        volumeCents: Number(row.volume_cents),
      };
    },

    async getLegends({ sort, limit, offset }) {
      const { data, count } = check(
        await db
          .from('throne_legends')
          // Two FKs point at bids (bid_id, deposed_by), so name the one we join on.
          .select('*, bid:bids!throne_legends_bid_id_fkey(dividend_cents, clicks, removed_at)', { count: 'exact' })
          .order(LEGEND_SORTS[sort] ?? LEGEND_SORTS.recent, { ascending: false })
          .range(offset, offset + limit - 1),
      );
      return { total: count, items: data.map(legendFromRow) };
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

    // --- Admin ---
    async getFinancials() {
      const f = check(await db.rpc('admin_financials'));
      return {
        outstandingCreditsCents: Number(f.outstanding_credits_cents),
        creditsIssuedCents: Number(f.credits_issued_cents),
        creditsSpentCents: Number(f.credits_spent_cents),
        walletsWithBalance: Number(f.wallets_with_balance),
        wonBids: Number(f.won_bids),
        cardGrossCents: Number(f.card_gross_cents),
        estFeesCents: Number(f.est_fees_cents),
        refundedCents: Number(f.refunded_cents),
        stalePending: Number(f.stale_pending),
        creatorFundCents: Number(f.creator_fund_cents),
        hype: f.hype ?? {},
      };
    },
  };
}
