-- Project Throne schema. Run once in the Supabase SQL editor (safe to re-run).
-- All money is stored in integer cents.
--
-- Three boards:
--   throne  The big billboard. Auction: outbid the king. Max term, then retire.
--   b2, b3  Smaller boards. Fixed-price bookings with guaranteed time (1/3/7 days),
--           queued one after another. Never knocked off.

-- Every ad: throne bids and board bookings alike. Reports, takedowns, clicks
-- and the link-warning page work the same for all of them.
create table if not exists bids (
  id             uuid primary key default gen_random_uuid(),
  board          text not null default 'throne' check (board in ('throne', 'b2', 'b3')),
  status         text not null default 'pending'
                 check (status in ('pending', 'won', 'outbid', 'void', 'refunded')),
  amount_cents   integer not null check (amount_cents > 0),
  -- Throne only.
  shield_seconds integer not null default 0 check (shield_seconds >= 0),
  shield_ends_at timestamptz,
  -- Bookings only: length and the scheduled slot (set when payment clears).
  days           integer check (days in (1, 3, 7)),
  starts_at      timestamptz,
  ends_at        timestamptz,
  -- A discounted relegation booking points at the throne bid it came from.
  relegated_from uuid references bids (id),
  -- SHA-256 of a private code held by the buyer's browser (no accounts).
  owner_hash     text,
  name           text not null check (char_length(name) <= 40),
  tagline        text check (char_length(tagline) <= 100),
  image_url      text,
  target_url     text not null,
  payment_ref    text,
  clicks         integer not null default 0,
  created_at     timestamptz not null default now(),
  settled_at     timestamptz,
  -- Takedown: a removed ad's name, tagline, image and link are hidden
  -- everywhere. The bid itself stays (the slot was paid for).
  removed_at     timestamptz,
  removed_reason text,
  removed_by     text check (removed_by in ('admin', 'auto')),
  check ((board = 'throne') = (days is null))
);
create index if not exists bids_board_live_idx on bids (board, starts_at) where status = 'won' and board <> 'throne';
create index if not exists bids_relegated_idx on bids (relegated_from) where relegated_from is not null;
create index if not exists bids_throne_record_idx on bids (amount_cents desc) where board = 'throne' and status = 'won';

-- Visitor reports against an ad. Reporters are anonymous; we keep only a
-- salted hash of their IP, enough to count each person once per ad.
create table if not exists reports (
  id             bigint generated always as identity primary key,
  bid_id         uuid not null references bids (id),
  reason         text not null check (reason in ('scam', 'adult', 'hate', 'violence', 'copyright', 'impersonation', 'other')),
  details        text check (char_length(details) <= 500),
  reporter_hash  text not null,
  status         text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at     timestamptz not null default now(),
  unique (bid_id, reporter_hash)
);
create index if not exists reports_open_idx on reports (bid_id) where status = 'open';

-- Single-row table: who holds the throne, plus lifetime counters.
create table if not exists throne (
  id            integer primary key default 1 check (id = 1),
  bid_id        uuid references bids (id),
  takeovers     integer not null default 0,
  volume_cents  bigint not null default 0
);
insert into throne (id) values (1) on conflict do nothing;

-- One row per small board: how far ahead it is booked. Row-locked while a
-- booking is placed, so two payments can never get the same days.
create table if not exists boards (
  id            text primary key check (id in ('b2', 'b3')),
  booked_until  timestamptz
);
insert into boards (id) values ('b2'), ('b3') on conflict do nothing;

-- King of the Day: one row per round. Whoever holds the throne when a round
-- ends is crowned (winner_bid_id). ends_at can move past base_ends_at by
-- overtime: takeovers in the final seconds extend the round.
create table if not exists crown_rounds (
  id             bigint generated always as identity primary key,
  base_ends_at   timestamptz not null unique,
  ends_at        timestamptz not null,
  closed_at      timestamptz,
  winner_bid_id  uuid references bids (id),
  takeovers      integer not null default 0
);
create index if not exists crown_rounds_open_idx on crown_rounds (id) where closed_at is null;
create index if not exists crown_rounds_kings_idx on crown_rounds (closed_at desc) where winner_bid_id is not null;

-- The History of Kings: a snapshot of every king when they leave the throne,
-- either overthrown (deposed_by set) or retired at the end of their term.
create table if not exists throne_legends (
  id               bigint generated always as identity primary key,
  bid_id           uuid not null unique references bids (id),
  name             text not null,
  tagline          text,
  image_url        text,
  target_url       text not null,
  amount_cents     integer not null,
  crowned_at       timestamptz not null,
  deposed_at       timestamptz not null,
  deposed_by       uuid references bids (id),
  deposed_by_name  text,
  retired          boolean not null default false,
  reign_seconds    integer not null,
  survived_shield  boolean not null
);
create index if not exists legends_deposed_idx on throne_legends (deposed_at desc);
create index if not exists legends_reign_idx on throne_legends (reign_seconds desc);
create index if not exists legends_amount_idx on throne_legends (amount_cents desc);

-- Queue for the takeover video worker (backend/src/workers/videoWorker.js).
create table if not exists hype_jobs (
  id          bigint generated always as identity primary key,
  status      text not null default 'pending' check (status in ('pending', 'rendering', 'done', 'failed')),
  payload     jsonb not null,
  video_url   text,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists hype_jobs_pending_idx on hype_jobs (id) where status = 'pending';

-- Public bucket for ad images and takeover videos. Anyone can read; only the
-- backend (service role) can write, because storage.objects has no policies
-- granting insert to anon/authenticated.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 52428800,
        array['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'video/mp4'])
on conflict (id) do nothing;

-- Only the backend (service role) touches these tables. RLS on + no policies
-- means the public anon key can read/write nothing: an ad can only change via
-- the backend after a signature-verified payment webhook.
alter table bids enable row level security;
alter table reports enable row level security;
alter table throne enable row level security;
alter table boards enable row level security;
alter table crown_rounds enable row level security;
alter table throne_legends enable row level security;
alter table hype_jobs enable row level security;

-- Archive engine: whenever the throne changes hands (or empties because the
-- king retired), snapshot the old king.
create or replace function archive_deposed_king() returns trigger
language plpgsql
as $$
begin
  if old.bid_id is not null and new.bid_id is distinct from old.bid_id then
    insert into throne_legends (
      bid_id, name, tagline, image_url, target_url, amount_cents, crowned_at, deposed_at,
      deposed_by, deposed_by_name, retired, reign_seconds, survived_shield
    )
    select d.id, d.name, d.tagline, d.image_url, d.target_url, d.amount_cents, d.settled_at, now(),
           w.id, w.name, new.bid_id is null,
           floor(extract(epoch from now() - d.settled_at))::integer,
           now() >= d.shield_ends_at
      from bids d
      left join bids w on w.id = new.bid_id
     where d.id = old.bid_id;
  end if;
  return new;
end;
$$;

drop trigger if exists throne_archive on throne;
create trigger throne_archive
  after update of bid_id on throne
  for each row execute function archive_deposed_king();

-- King of the Day rounds sit on a fixed grid: they end every p_round_seconds,
-- offset so the default daily round ends at p_cutoff_hour (UTC).
-- Mirrors nextCrownCutoffMs() in backend/src/rules.js.
create or replace function next_crown_cutoff(p_now timestamptz, p_round_seconds integer, p_cutoff_hour integer)
returns timestamptz
language sql
immutable
as $$
  select to_timestamp(
    floor((extract(epoch from p_now) - ((p_cutoff_hour * 3600) % p_round_seconds)) / p_round_seconds) * p_round_seconds
    + ((p_cutoff_hour * 3600) % p_round_seconds) + p_round_seconds
  );
$$;

-- Time-based housekeeping, run by the API every few seconds and at the start
-- of every throne settlement:
--   1. close the King of the Day round once its clock hits zero;
--   2. retire a king whose term is over (the throne reopens at the start price).
-- Locks the throne first, then the round (same order as settle_bid), so it is
-- safe with many API instances. A free-tier host may sleep through both
-- deadlines: a king whose term ended before the round did is not crowned.
create or replace function tick_throne(p_rules jsonb) returns json
language plpgsql
as $$
declare
  v_throne    throne%rowtype;
  v_round     crown_rounds%rowtype;
  v_open      boolean;
  v_term_end  timestamptz;
  v_winner    uuid;
  v_crowned   json := null;
  v_retired   json := null;
  v_base      timestamptz;
begin
  select * into v_throne from throne where id = 1 for update;
  if v_throne.bid_id is not null then
    select settled_at + make_interval(secs => (p_rules->>'throneTermSeconds')::integer)
      into v_term_end from bids where id = v_throne.bid_id;
  end if;

  select * into v_round from crown_rounds where closed_at is null order by id desc limit 1 for update;
  v_open := found;

  if v_open and now() >= v_round.ends_at then
    v_winner := case when v_term_end > v_round.ends_at then v_throne.bid_id end;
    update crown_rounds set closed_at = now(), winner_bid_id = v_winner where id = v_round.id;
    v_crowned := json_build_object('roundId', v_round.id, 'bidId', v_winner);
    v_open := false;
  end if;

  if not v_open then
    v_base := next_crown_cutoff(now(), (p_rules->>'crownRoundSeconds')::integer, (p_rules->>'crownCutoffHourUtc')::integer);
    insert into crown_rounds (base_ends_at, ends_at) values (v_base, v_base) on conflict (base_ends_at) do nothing;
    select * into v_round from crown_rounds where base_ends_at = v_base;
  end if;

  if v_term_end is not null and now() >= v_term_end then
    update throne set bid_id = null where id = 1;  -- the trigger archives him as retired
    v_retired := json_build_object('bidId', v_throne.bid_id);
  end if;

  return json_build_object(
    'round', json_build_object('id', v_round.id, 'baseEndsAt', v_round.base_ends_at, 'endsAt', v_round.ends_at, 'takeovers', v_round.takeovers),
    'crowned', v_crowned,
    'retired', v_retired
  );
end;
$$;

-- Atomically settle a paid ad. Idempotent: a retried webhook is a no-op.
--
-- Throne: locks the throne, so two payments that clear at once are serialized;
--   the second sees the first as the new price and comes back 'outbid' (the
--   backend refunds it). The minimum-price logic mirrors backend/src/rules.js.
-- Bookings: locks the board row and appends the booking to the board's queue:
--   it starts when the board is next free, so days can never be double-sold.
--   A relegation booking is voided (and refunded) if that king already used it.
-- p_rules is config.rules from the backend.
create or replace function settle_bid(p_bid_id uuid, p_payment_ref text, p_rules jsonb) returns json
language plpgsql
as $$
declare
  v_bid      bids%rowtype;
  v_throne   throne%rowtype;
  v_king     bids%rowtype;
  v_board    boards%rowtype;
  v_min      integer;
  v_step     integer;
  v_tick     json;
  v_round    json;
  v_round_id bigint;
  v_start    timestamptz;
  v_end      timestamptz;
begin
  select * into v_bid from bids where id = p_bid_id for update;
  if not found then
    return json_build_object('status', 'missing');
  end if;
  if v_bid.status <> 'pending' then
    return json_build_object('status', 'duplicate');
  end if;

  -- ---- Board booking ----
  if v_bid.board <> 'throne' then
    -- Lock the original throne ad first: two relegations of the same ad may
    -- target different boards, so the board lock alone can't serialize them.
    if v_bid.relegated_from is not null then
      perform 1 from bids where id = v_bid.relegated_from for update;
    end if;
    select * into v_board from boards where id = v_bid.board for update;
    if v_bid.relegated_from is not null
       and exists (select 1 from bids where relegated_from = v_bid.relegated_from and status = 'won') then
      update bids set status = 'void', payment_ref = p_payment_ref, settled_at = now() where id = p_bid_id;
      return json_build_object('status', 'void');
    end if;
    v_start := greatest(now(), v_board.booked_until);
    v_end := v_start + make_interval(days => v_bid.days);
    update boards set booked_until = v_end where id = v_bid.board;
    update bids
       set status = 'won', payment_ref = p_payment_ref, settled_at = now(), starts_at = v_start, ends_at = v_end
     where id = p_bid_id;
    update throne set volume_cents = volume_cents + v_bid.amount_cents where id = 1;
    return json_build_object('status', 'won', 'board', v_bid.board, 'startsAt', v_start, 'endsAt', v_end);
  end if;

  -- ---- Throne bid ----
  perform 1 from throne where id = 1 for update;
  -- Close an expired King of the Day round and retire an expired king first,
  -- so a late payment can never steal a crown that was already decided.
  v_tick := tick_throne(p_rules);
  v_round_id := (v_tick->'round'->>'id')::bigint;
  select * into v_throne from throne where id = 1;

  if v_throne.bid_id is null then
    v_min := (p_rules->>'startingPriceCents')::integer;
  else
    select * into v_king from bids where id = v_throne.bid_id;
    v_step := greatest((p_rules->>'minIncrementCents')::integer,
                       ceil(v_king.amount_cents * (p_rules->>'minRaisePct')::integer / 100.0)::integer);
    if now() < v_king.shield_ends_at then
      v_step := greatest(v_step, ceil(v_king.amount_cents * (p_rules->>'shieldPremiumPct')::integer / 100.0)::integer);
    end if;
    v_min := v_king.amount_cents + v_step;
  end if;

  if v_bid.amount_cents < v_min then
    update bids set status = 'outbid', payment_ref = p_payment_ref, settled_at = now() where id = p_bid_id;
    return json_build_object('status', 'outbid', 'crowned', v_tick->'crowned', 'retired', v_tick->'retired');
  end if;

  update bids
     set status = 'won',
         payment_ref = p_payment_ref,
         settled_at = now(),
         shield_ends_at = now() + make_interval(secs => shield_seconds)
   where id = p_bid_id;

  update throne
     set bid_id = p_bid_id,
         takeovers = takeovers + 1,
         volume_cents = volume_cents + v_bid.amount_cents
   where id = 1;

  -- Overtime: a takeover in the round's final window pushes its end out, capped.
  update crown_rounds
     set takeovers = takeovers + 1,
         ends_at = case
           when now() < ends_at
            and now() >= ends_at - make_interval(secs => (p_rules->>'crownOvertimeWindowSeconds')::integer)
           then least(base_ends_at + make_interval(secs => (p_rules->>'crownMaxOvertimeSeconds')::integer),
                      ends_at + make_interval(secs => (p_rules->>'crownExtensionSeconds')::integer))
           else ends_at
         end
   where id = v_round_id
  returning json_build_object('id', id, 'baseEndsAt', base_ends_at, 'endsAt', ends_at, 'takeovers', takeovers)
  into v_round;

  return json_build_object(
    'status', 'won',
    'board', 'throne',
    'previous_bid_id', v_throne.bid_id,
    'crowned', v_tick->'crowned',
    'retired', v_tick->'retired',
    'round', v_round
  );
end;
$$;

-- Files a report (once per reporter per ad). If enough different people report
-- the same ad, it is hidden at once ('auto') pending admin review; the admin
-- can restore it. p_threshold <= 0 disables auto-hiding.
create or replace function report_bid(
  p_bid_id uuid,
  p_reason text,
  p_details text,
  p_reporter_hash text,
  p_threshold integer
) returns json
language plpgsql
as $$
declare
  v_open   integer;
  v_hidden boolean := false;
begin
  perform 1 from bids where id = p_bid_id and status = 'won' for update;
  if not found then
    return json_build_object('status', 'missing');
  end if;

  insert into reports (bid_id, reason, details, reporter_hash)
  values (p_bid_id, p_reason, p_details, p_reporter_hash)
  on conflict (bid_id, reporter_hash) do nothing;
  if not found then
    return json_build_object('status', 'duplicate');
  end if;

  select count(*) into v_open from reports where bid_id = p_bid_id and status = 'open';
  if p_threshold > 0 and v_open >= p_threshold then
    update bids
       set removed_at = now(), removed_reason = 'Hidden after multiple reports, pending review', removed_by = 'auto'
     where id = p_bid_id and removed_at is null;
    v_hidden := found;
  end if;

  return json_build_object('status', 'filed', 'autoHidden', v_hidden);
end;
$$;

-- Distinct advertisers, and ads published on any board (not removed).
-- Mirrors countAdvertisers() in backend/src/store/memoryStore.js.
drop function if exists count_advertisers();
create function count_advertisers() returns json
language sql
stable
as $$
  select json_build_object('advertisers', count(distinct lower(trim(name))), 'ads', count(*))
    from bids where status = 'won' and removed_at is null;
$$;

create or replace function record_click(p_bid_id uuid) returns void
language sql
as $$
  update bids set clicks = clicks + 1 where id = p_bid_id;
$$;

-- Hands one pending job to one worker, even with several workers polling.
create or replace function claim_hype_job() returns setof hype_jobs
language sql
as $$
  update hype_jobs
     set status = 'rendering', updated_at = now()
   where id = (
     select id from hype_jobs where status = 'pending'
      order by id
      limit 1
      for update skip locked
   )
  returning *;
$$;

-- Admin revenue snapshot. Fees are an estimate (US card pricing: 30c + 2.9%);
-- refunded charges keep their fee. Mirrored by getFinancials() in
-- backend/src/store/memoryStore.js.
create or replace function admin_financials() returns json
language sql
stable
as $$
  select json_build_object(
    'won_bids',            (select count(*) from bids where status = 'won'),
    'gross_cents',         (select coalesce(sum(amount_cents), 0) from bids where status = 'won'),
    'throne_gross_cents',  (select coalesce(sum(amount_cents), 0) from bids where status = 'won' and board = 'throne'),
    'boards_gross_cents',  (select coalesce(sum(amount_cents), 0) from bids where status = 'won' and board <> 'throne'),
    'bookings',            (select count(*) from bids where status = 'won' and board <> 'throne'),
    'relegations',         (select count(*) from bids where status = 'won' and relegated_from is not null),
    'est_fees_cents',      (select coalesce(sum(30 + ceil(amount_cents * 0.029)), 0)
                              from bids where status in ('won', 'refunded') and payment_ref not like 'demo_%'),
    'refunded_cents',      (select coalesce(sum(amount_cents), 0) from bids where status = 'refunded'),
    'stale_pending',       (select count(*) from bids
                             where status = 'pending' and created_at < now() - interval '1 hour'),
    'hype',                (select coalesce(json_object_agg(status, n), '{}'::json)
                              from (select status, count(*) n from hype_jobs group by status) s)
  );
$$;

revoke execute on function settle_bid(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function tick_throne(jsonb) from public, anon, authenticated;
revoke execute on function report_bid(uuid, text, text, text, integer) from public, anon, authenticated;
revoke execute on function record_click(uuid) from public, anon, authenticated;
revoke execute on function count_advertisers() from public, anon, authenticated;
revoke execute on function claim_hype_job() from public, anon, authenticated;
revoke execute on function admin_financials() from public, anon, authenticated;
revoke execute on function archive_deposed_king() from public, anon, authenticated;
