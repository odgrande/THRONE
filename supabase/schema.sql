-- Project Throne schema. Run once in the Supabase SQL editor.
-- All money is stored in integer cents.

-- Anonymous credit wallets. No account: the browser holds a random secret
-- token and the server stores only its SHA-256 hash.
create table if not exists wallets (
  id                     uuid primary key default gen_random_uuid(),
  token_hash             text not null unique,
  balance_cents          integer not null default 0 check (balance_cents >= 0),
  lifetime_earned_cents  integer not null default 0,
  created_at             timestamptz not null default now()
);

create table if not exists bids (
  id             uuid primary key default gen_random_uuid(),
  status         text not null default 'pending'
                 check (status in ('pending', 'won', 'outbid', 'void', 'refunded')),
  amount_cents   integer not null check (amount_cents > 0),
  wallet_id      uuid references wallets (id),
  credits_cents  integer not null default 0 check (credits_cents >= 0),  -- paid with Throne Credits
  charge_cents   integer not null check (charge_cents >= 0),             -- paid by card / wallet
  shield_seconds integer not null check (shield_seconds >= 0),
  name           text not null check (char_length(name) <= 40),
  tagline        text check (char_length(tagline) <= 100),
  image_url      text,
  target_url     text not null,
  payment_ref    text,
  dividend_cents integer not null default 0,
  clicks         integer not null default 0,
  created_at     timestamptz not null default now(),
  settled_at     timestamptz,
  shield_ends_at timestamptz,
  -- Takedown: a removed ad's name, tagline, image and link are hidden
  -- everywhere. The bid itself stays (the slot was paid for).
  removed_at     timestamptz,
  removed_reason text,
  removed_by     text check (removed_by in ('admin', 'auto')),
  check (credits_cents + charge_cents = amount_cents)
);

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

-- Single-row table: who holds the throne, the Creator Fund tracker and
-- lifetime counters for the stats bar.
create table if not exists throne (
  id                  integer primary key default 1 check (id = 1),
  bid_id              uuid references bids (id),
  creator_fund_cents  bigint not null default 0,
  takeovers           integer not null default 0,
  volume_cents        bigint not null default 0
);
insert into throne (id) values (1) on conflict do nothing;

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

-- The History of Kings: a permanent snapshot of every deposed holder,
-- written automatically by the trigger below. Rows are never updated.
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
  deposed_by       uuid not null references bids (id),
  deposed_by_name  text not null,
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

-- Only the backend (service role) touches these tables. RLS on + no policies
-- means the public anon key can read/write nothing: an ad can only change via
-- the backend after a signature-verified Stripe webhook.
alter table wallets enable row level security;
alter table bids enable row level security;
alter table throne enable row level security;
alter table throne_legends enable row level security;
alter table hype_jobs enable row level security;
alter table reports enable row level security;
alter table crown_rounds enable row level security;

-- Public bucket for ad images and takeover videos. Anyone can read; only the
-- backend (service role) can write, because storage.objects has no policies
-- granting insert to anon/authenticated.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 52428800,
        array['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'video/mp4'])
on conflict (id) do nothing;

-- Archive engine: whenever the throne changes hands, snapshot the old king.
create or replace function archive_deposed_king() returns trigger
language plpgsql
as $$
begin
  if old.bid_id is not null and new.bid_id is distinct from old.bid_id then
    insert into throne_legends (
      bid_id, name, tagline, image_url, target_url, amount_cents,
      crowned_at, deposed_at, deposed_by, deposed_by_name, reign_seconds, survived_shield
    )
    select d.id, d.name, d.tagline, d.image_url, d.target_url, d.amount_cents,
           d.settled_at, now(), w.id, w.name,
           floor(extract(epoch from now() - d.settled_at))::integer,
           now() >= d.shield_ends_at
      from bids d, bids w
     where d.id = old.bid_id and w.id = new.bid_id;
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

-- Closes the open round once its time is up, crowning whoever holds the
-- throne, and makes sure the next round exists. Called by the API every few
-- seconds and at the start of every settlement. Safe with many API instances:
-- the open round is row-locked, and base_ends_at is unique.
create or replace function tick_crown(p_rules jsonb) returns json
language plpgsql
as $$
declare
  v_round    crown_rounds%rowtype;
  v_open     boolean;
  v_winner   uuid;
  v_crowned  json := null;
  v_base     timestamptz;
begin
  select * into v_round from crown_rounds where closed_at is null order by id desc limit 1 for update;
  v_open := found;

  if v_open and now() >= v_round.ends_at then
    select bid_id into v_winner from throne where id = 1;
    update crown_rounds set closed_at = now(), winner_bid_id = v_winner where id = v_round.id;
    v_crowned := json_build_object('roundId', v_round.id, 'bidId', v_winner);
    v_open := false;
  end if;

  if not v_open then
    v_base := next_crown_cutoff(now(), (p_rules->>'crownRoundSeconds')::integer, (p_rules->>'crownCutoffHourUtc')::integer);
    insert into crown_rounds (base_ends_at, ends_at) values (v_base, v_base) on conflict (base_ends_at) do nothing;
    select * into v_round from crown_rounds where base_ends_at = v_base;
  end if;

  return json_build_object(
    'round', json_build_object('id', v_round.id, 'baseEndsAt', v_round.base_ends_at, 'endsAt', v_round.ends_at, 'takeovers', v_round.takeovers),
    'crowned', v_crowned
  );
end;
$$;

-- Atomically settle a paid bid. Locks the throne row, so two payments that
-- clear at the same instant are serialized: the second one sees the first as
-- the new price and comes back 'outbid' (the backend then refunds its card
-- portion). Credit spending and the dethroned king's dividend happen in the
-- same transaction, so a retried webhook can never double-spend or double-pay.
-- p_rules is config.rules from the backend; the minimum-price logic mirrors
-- backend/src/rules.js.
create or replace function settle_bid(p_bid_id uuid, p_payment_ref text, p_rules jsonb) returns json
language plpgsql
as $$
declare
  v_throne   throne%rowtype;
  v_bid      bids%rowtype;
  v_king     bids%rowtype;
  v_min      integer;
  v_step     integer;
  v_dividend integer := 0;
  v_tick     json;
  v_crowned  json;
  v_round    json;
  v_round_id bigint;
begin
  select * into v_throne from throne where id = 1 for update;
  select * into v_bid from bids where id = p_bid_id for update;

  if not found then
    return json_build_object('status', 'missing');
  end if;
  if v_bid.status <> 'pending' then
    return json_build_object('status', 'duplicate');
  end if;

  -- Close an expired King of the Day round first, so a late payment can never
  -- steal a crown that was already decided.
  v_tick := tick_crown(p_rules);
  v_crowned := v_tick->'crowned';
  v_round_id := (v_tick->'round'->>'id')::bigint;

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
    return json_build_object('status', 'outbid', 'crowned', v_crowned);
  end if;

  if v_bid.credits_cents > 0 then
    update wallets set balance_cents = balance_cents - v_bid.credits_cents
     where id = v_bid.wallet_id and balance_cents >= v_bid.credits_cents;
    if not found then
      update bids set status = 'void', payment_ref = p_payment_ref, settled_at = now() where id = p_bid_id;
      return json_build_object('status', 'void', 'crowned', v_crowned);
    end if;
  end if;

  update bids
     set status = 'won',
         payment_ref = p_payment_ref,
         settled_at = now(),
         shield_ends_at = now() + make_interval(secs => shield_seconds)
   where id = p_bid_id;

  -- Dividend: the dethroned king earns Throne Credits, not a card refund.
  if v_throne.bid_id is not null and v_king.wallet_id is not null then
    v_dividend := v_bid.amount_cents * (p_rules->>'dividendPct')::integer / 100;
    update wallets
       set balance_cents = balance_cents + v_dividend,
           lifetime_earned_cents = lifetime_earned_cents + v_dividend
     where id = v_king.wallet_id;
    update bids set dividend_cents = dividend_cents + v_dividend where id = v_king.id;
  end if;

  update throne
     set bid_id = p_bid_id,
         creator_fund_cents = creator_fund_cents + (v_bid.amount_cents * (p_rules->>'creatorFundPct')::integer / 100),
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
    'previous_bid_id', v_throne.bid_id,
    'dividend_cents', v_dividend,
    'crowned', v_crowned,
    'round', v_round
  );
end;
$$;

-- Files a report (once per reporter per ad). If enough different people report
-- the same live ad, it is hidden at once ('auto') pending admin review; the
-- admin can restore it. p_threshold <= 0 disables auto-hiding.
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

-- Admin health snapshot: credit liability vs. card revenue. Fees are an
-- estimate (US card pricing: 30c + 2.9%); refunded charges keep their fee.
-- Mirrored by getFinancials() in backend/src/store/memoryStore.js.
create or replace function admin_financials() returns json
language sql
stable
as $$
  select json_build_object(
    'outstanding_credits_cents', (select coalesce(sum(balance_cents), 0) from wallets),
    'credits_issued_cents',      (select coalesce(sum(lifetime_earned_cents), 0) from wallets),
    'credits_spent_cents',       (select coalesce(sum(credits_cents), 0) from bids where status = 'won'),
    'wallets_with_balance',      (select count(*) from wallets where balance_cents > 0),
    'won_bids',                  (select count(*) from bids where status = 'won'),
    'card_gross_cents',          (select coalesce(sum(charge_cents), 0) from bids where status = 'won'),
    'est_fees_cents',            (select coalesce(sum(30 + ceil(charge_cents * 0.029)), 0)
                                    from bids where charge_cents > 0 and status in ('won', 'refunded')),
    'refunded_cents',            (select coalesce(sum(charge_cents), 0) from bids where status = 'refunded'),
    'stale_pending',             (select count(*) from bids
                                   where status = 'pending' and created_at < now() - interval '1 hour'),
    'creator_fund_cents',        (select creator_fund_cents from throne where id = 1),
    'hype',                      (select coalesce(json_object_agg(status, n), '{}'::json)
                                    from (select status, count(*) n from hype_jobs group by status) s)
  );
$$;

revoke execute on function admin_financials() from public, anon, authenticated;
revoke execute on function settle_bid(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function tick_crown(jsonb) from public, anon, authenticated;
revoke execute on function record_click(uuid) from public, anon, authenticated;
revoke execute on function report_bid(uuid, text, text, text, integer) from public, anon, authenticated;
revoke execute on function claim_hype_job() from public, anon, authenticated;
revoke execute on function archive_deposed_king() from public, anon, authenticated;
