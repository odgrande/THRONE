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
  });

  const jobFromRow = (r) =>
    r && { id: r.id, status: r.status, payload: r.payload, videoUrl: r.video_url, error: r.error, createdAt: r.created_at };

  const check = ({ data, error, count }) => {
    if (error) throw new Error(`Supabase: ${error.message}`);
    return count === undefined || count === null ? data : { data, count };
  };

  const getBid = async (id) => fromRow(check(await db.from('bids').select('*').eq('id', id).maybeSingle()));
  // Two FKs point at bids (bid_id, deposed_by), so name the one we join on.
  const LEGEND_SELECT = '*, bid:bids!throne_legends_bid_id_fkey(clicks, views, removed_at)';

  return {
    kind: 'supabase',

    // --- Ads (throne bids and board bookings) ---
    async createBid({ region, board, amountCents, addonCents = 0, address = null, shieldSeconds = 0, days = null, relegatedFrom = null, ownerHash, name, tagline, imageUrl, videoUrl = null, targetUrl }) {
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
          .select('id, closed_at, takeovers, bid:bids!crown_rounds_winner_bid_id_fkey(id, name, tagline, image_url, amount_cents, removed_at)')
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
        };
      }
      return { regions, stalePending: Number(f.stale_pending), hype: f.hype ?? {} };
    },
  };
}
