-- Project Throne schema. Run once in the Supabase SQL editor (safe to re-run).
-- All money is stored in integer minor units (cents for USD, kobo for NGN).
--
-- Two regions, fully separate games in one database:
--   global  priced in USD     ng  priced in NGN (Nigeria)
-- Bids are only ever compared within a region, never across currencies.
--
-- Three boards per region:
--   throne  The big billboard. Auction: outbid the king. Max term, then retire.
--   b2, b3  Smaller boards (the Court), p1-p10 (the Spotlight), m1-m12 (the
--           Market). Fixed-price bookings with guaranteed time (1/3/7 days),
--           queued one after another. Never knocked off.

-- Every ad: throne bids and board bookings alike. Reports, takedowns, clicks
-- and the link-warning page work the same for all of them.
create table if not exists bids (
  id             uuid primary key default gen_random_uuid(),
  region         text not null default 'global' check (region in ('global', 'ng')),
  board          text not null default 'throne' check (board in ('throne', 'b2', 'b3', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12')),
  status         text not null default 'pending'
                 check (status in ('pending', 'won', 'outbid', 'void', 'refunded')),
  amount_cents   integer not null check (amount_cents >= 0),
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
  -- Map add-on: business address shown on a map. addon_cents is charged on top
  -- of amount_cents and never used to compare throne bids.
  address        text check (char_length(address) between 5 and 160),
  addon_cents    integer not null default 0 check (addon_cents >= 0),
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
create index if not exists bids_board_live_idx on bids (region, board, starts_at) where status = 'won' and board <> 'throne';
create index if not exists bids_relegated_idx on bids (relegated_from) where relegated_from is not null;
create index if not exists bids_throne_record_idx on bids (region, amount_cents desc) where board = 'throne' and status = 'won';

-- Visitor reports against an ad. Reporters are anonymous; we keep only a
-- salted hash of their IP, enough to count each person once per ad.
create table if not exists reports (
  id             bigint generated always as identity primary key,
  bid_id         uuid not null references bids (id),
  reason         text not null check (reason in ('scam', 'adult', 'hate', 'violence', 'copyright', 'impersonation', 'political', 'other')),
  details        text check (char_length(details) <= 500),
  reporter_hash  text not null,
  status         text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at     timestamptz not null default now(),
  unique (bid_id, reporter_hash)
);
create index if not exists reports_open_idx on reports (bid_id) where status = 'open';

-- One row per region: who holds the throne, plus lifetime counters.
create table if not exists throne (
  region        text primary key check (region in ('global', 'ng')),
  bid_id        uuid references bids (id),
  takeovers     integer not null default 0,
  volume_cents  bigint not null default 0
);
insert into throne (region) values ('global'), ('ng') on conflict do nothing;

-- One row per small board per region: how far ahead it is booked. Row-locked
-- while a booking is placed, so two payments can never get the same days.
create table if not exists boards (
  region        text not null check (region in ('global', 'ng')),
  id            text not null check (id in ('b2', 'b3', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12')),
  booked_until  timestamptz,
  primary key (region, id)
);
-- Admin "god mode": every admin action, with what it changed, so it can be
-- reviewed and (where possible) undone. Never readable by the public.
create table if not exists admin_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  action      text not null,
  bid_id      uuid references bids (id),
  region      text,
  reason      text,
  before      jsonb,
  after       jsonb,
  undoable    boolean not null default false,
  undone_at   timestamptz
);
create index if not exists admin_log_at_idx on admin_log (at desc);
alter table admin_log enable row level security;

-- Emergency switch per edition: while paused, no new ads are accepted.
alter table throne add column if not exists paused boolean not null default false;

-- Ad performance: reach = distinct visitors on the site while the ad was live
-- (counted by the API from live connections; no personal data stored).
alter table bids add column if not exists views integer not null default 0;

-- Site traffic per edition per day (unique visitors, peak online), for the
-- proof shown to advertisers before they pay.
create table if not exists daily_stats (
  region    text not null check (region in ('global', 'ng')),
  day       date not null,
  visitors  integer not null default 0,
  peak      integer not null default 0,
  primary key (region, day)
);
alter table daily_stats enable row level security;

-- The buyer's acceptance of the rules: which version, and when.
alter table bids add column if not exists terms_version text;
alter table bids add column if not exists terms_accepted_at timestamptz;

-- Messages from the contact and partners forms. Kept only to answer them,
-- deleted automatically after 90 days. Never readable by the public.
create table if not exists contact_messages (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  topic       text not null check (topic in ('ad', 'payment', 'abuse', 'legal', 'data', 'partner', 'investor', 'press', 'other')),
  name        text check (char_length(name) <= 80),
  email       text not null check (char_length(email) <= 254),
  company     text check (char_length(company) <= 120),
  message     text not null check (char_length(message) between 10 and 4000),
  ad_id       uuid,
  region      text,
  handled_at  timestamptz
);
create index if not exists contact_messages_at_idx on contact_messages (at desc);
alter table contact_messages enable row level security;

-- Video ads: stored file, and when the paid ad started waiting for review.
alter table bids add column if not exists video_url text;
alter table bids add column if not exists review_since timestamptz;
-- 'review': paid video ad waiting for a human; never live until approved.
alter table bids drop constraint if exists bids_status_check;
alter table bids add constraint bids_status_check check (status in ('pending', 'review', 'won', 'outbid', 'void', 'refunded'));

-- Political ads are not allowed: visitors can report them.
alter table reports drop constraint if exists reports_reason_check;
alter table reports add constraint reports_reason_check check (reason in ('scam', 'adult', 'hate', 'violence', 'copyright', 'impersonation', 'political', 'other'));

-- ============================================================
-- The Ads Game: coins (no cash value, no cash-out), wallets with no signup,
-- ad cards, and the Throne puzzle race.
-- ============================================================

-- A player's wallet. The browser keeps a random secret code; we store only
-- its SHA-256. Balance can never go below zero.
create table if not exists wallets (
  id               uuid primary key default gen_random_uuid(),
  token_hash       text not null unique,
  balance          bigint not null default 0 check (balance >= 0),
  player_name      text check (char_length(player_name) between 2 and 24),
  referral_code    text not null unique,
  referred_by      uuid references wallets (id),
  referral_paid    boolean not null default false,
  created_ip_hash  text,
  last_daily_at    timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists wallets_ip_idx on wallets (created_ip_hash, created_at);
alter table wallets enable row level security;

-- Every coin in and out. (wallet, reason, ref) is unique when ref is set, so
-- a retried payment webhook or reward can never credit twice.
create table if not exists coin_ledger (
  id             bigint generated always as identity primary key,
  wallet_id      uuid not null references wallets (id),
  delta          integer not null,
  reason         text not null,
  ref            text,
  balance_after  bigint not null,
  at             timestamptz not null default now()
);
create unique index if not exists coin_ledger_once_idx on coin_ledger (wallet_id, reason, ref) where ref is not null;
create index if not exists coin_ledger_wallet_idx on coin_ledger (wallet_id, at desc);
alter table coin_ledger enable row level security;

-- Coin packs bought with real money (Paystack / Flutterwave). Paid once.
create table if not exists coin_orders (
  id            uuid primary key default gen_random_uuid(),
  wallet_id     uuid not null references wallets (id),
  region        text not null check (region in ('global', 'ng')),
  pack          text not null,
  coins         integer not null check (coins > 0),
  amount_cents  integer not null check (amount_cents > 0),
  status        text not null default 'pending' check (status in ('pending', 'paid')),
  payment_ref   text,
  created_at    timestamptz not null default now(),
  paid_at       timestamptz
);
alter table coin_orders enable row level security;

-- The ad a player shows on the Throne when they win. Screened like any ad;
-- in the Nigeria edition it waits in the review queue (ARCON) first.
create table if not exists ad_cards (
  wallet_id     uuid primary key references wallets (id),
  region        text not null check (region in ('global', 'ng')),
  name          text not null check (char_length(name) between 1 and 40),
  tagline       text check (char_length(tagline) <= 100),
  target_url    text not null,
  image_url     text,
  status        text not null default 'review' check (status in ('review', 'approved', 'rejected')),
  reason        text,
  terms_version text,
  review_since  timestamptz,
  updated_at    timestamptz not null default now()
);
alter table ad_cards enable row level security;

-- One row per puzzle attempt. The seed (and so the board) is server-side;
-- times are measured by the server.
create table if not exists game_attempts (
  id           uuid primary key default gen_random_uuid(),
  wallet_id    uuid not null references wallets (id),
  region       text not null check (region in ('global', 'ng')),
  round_id     bigint,
  seed         text not null,
  status       text not null default 'started' check (status in ('started', 'solved', 'failed', 'too_fast')),
  paid_coins   integer not null default 0,
  ip_hash      text,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  moves        integer,
  duration_ms  integer
);
create index if not exists game_attempts_board_idx on game_attempts (region, round_id, duration_ms) where status = 'solved';
create index if not exists game_attempts_wallet_idx on game_attempts (wallet_id, started_at desc);
create index if not exists game_attempts_ip_idx on game_attempts (ip_hash, started_at desc);
alter table game_attempts enable row level security;

-- Throne entries won in the game carry a time instead of a price (amount 0).
alter table bids drop constraint if exists bids_amount_cents_check;
alter table bids add constraint bids_amount_cents_check check (amount_cents >= 0);
alter table bids add column if not exists score_ms integer;
alter table bids add column if not exists game_round_id bigint;
alter table bids add column if not exists wallet_id uuid references wallets (id);

-- Anti-farming: a hashed device id (from the browser, salted daily on the
-- server) so caps hold across fresh wallets, private windows and restores.
alter table wallets add column if not exists created_device_hash text;
alter table game_attempts add column if not exists device_hash text;
create index if not exists game_attempts_device_idx on game_attempts (device_hash, started_at desc);
create index if not exists wallets_device_idx on wallets (created_device_hash, created_at);
-- A scrambled browser signature (screen, time zone, graphics...), which
-- survives private windows and cleared storage. Used only for the reset timer
-- and welcome coins (where two identical phones sharing it costs little),
-- never for daily free tries. Erased after 30 days like the other hashes.
alter table wallets add column if not exists created_fp_hash text;
alter table game_attempts add column if not exists fp_hash text;
create index if not exists game_attempts_fp_idx on game_attempts (fp_hash, started_at desc);
create index if not exists wallets_fp_idx on wallets (created_fp_hash, created_at);
-- Moderation and the "Saved" badge.
alter table wallets add column if not exists banned boolean not null default false;
alter table wallets add column if not exists ban_reason text;
alter table wallets add column if not exists backed_up_at timestamptz;
create index if not exists wallets_referred_idx on wallets (referred_by);
-- A wallet belongs to the edition it was made in (coins are priced per
-- edition, so they never cross over).
alter table wallets add column if not exists region text not null default 'global' check (region in ('global', 'ng'));
-- Ads paid with coins: amount_cents stays 0 (no money), the coins are here.
alter table bids add column if not exists coins integer not null default 0;

-- Adds or spends coins atomically. Returns the new balance; raises
-- 'insufficient coins' rather than going below zero. A repeated
-- (wallet, reason, ref) is a no-op that returns the current balance.
create or replace function apply_coins(p_wallet uuid, p_delta integer, p_reason text, p_ref text) returns bigint
language plpgsql
as $$
declare
  v_balance bigint;
begin
  select balance into v_balance from wallets where id = p_wallet for update;
  if not found then
    raise exception 'unknown wallet';
  end if;
  if p_ref is not null and exists (select 1 from coin_ledger where wallet_id = p_wallet and reason = p_reason and ref = p_ref) then
    return v_balance;
  end if;
  if v_balance + p_delta < 0 then
    raise exception 'insufficient coins';
  end if;
  update wallets set balance = balance + p_delta where id = p_wallet returning balance into v_balance;
  insert into coin_ledger (wallet_id, delta, reason, ref, balance_after) values (p_wallet, p_delta, p_reason, p_ref, v_balance);
  return v_balance;
end;
$$;

-- The daily bonus: at most once every 20 hours. Coming back within 48 hours
-- keeps a streak going, and the bonus grows with it (day 7 and on = double).
alter table wallets add column if not exists streak_days integer not null default 0;
drop function if exists claim_daily(uuid, integer);
create function claim_daily(p_wallet uuid, p_coins integer) returns json
language plpgsql
as $$
declare
  v_last timestamptz;
  v_streak integer;
  v_coins integer;
  v_balance bigint;
begin
  select last_daily_at, streak_days into v_last, v_streak from wallets where id = p_wallet for update;
  if v_last is not null and v_last > now() - interval '20 hours' then
    return json_build_object('balance', -1);
  end if;
  v_streak := case when v_last is not null and v_last > now() - interval '48 hours' then v_streak + 1 else 1 end;
  v_coins := p_coins + (p_coins * (least(v_streak, 7) - 1)) / 6;
  update wallets set last_daily_at = now(), streak_days = v_streak where id = p_wallet;
  -- One ledger ref per claim (the 20-hour row lock above stops doubles; a
  -- date ref would swallow a second claim that lands on the same UTC date).
  v_balance := apply_coins(p_wallet, v_coins, 'daily', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US'));
  return json_build_object('balance', v_balance, 'coins', v_coins, 'streak', v_streak);
end;
$$;

-- Marks a coin order paid and credits it, once.
create or replace function pay_coin_order(p_order uuid, p_payment_ref text) returns json
language plpgsql
as $$
declare
  v_order coin_orders%rowtype;
  v_balance bigint;
begin
  select * into v_order from coin_orders where id = p_order for update;
  if not found then
    return json_build_object('status', 'missing');
  end if;
  if v_order.status = 'paid' then
    return json_build_object('status', 'duplicate');
  end if;
  update coin_orders set status = 'paid', payment_ref = p_payment_ref, paid_at = now() where id = p_order;
  v_balance := apply_coins(v_order.wallet_id, v_order.coins, 'purchase', p_order::text);
  return json_build_object('status', 'paid', 'balance', v_balance, 'coins', v_order.coins);
end;
$$;

-- Today's leaderboard: each player's best solve in this round.
create or replace function game_leaderboard(p_region text, p_round bigint, p_limit integer) returns table (wallet_id uuid, player_name text, best_ms integer, solves bigint)
language sql
stable
as $$
  select a.wallet_id, w.player_name, min(a.duration_ms)::integer, count(*)
    from game_attempts a join wallets w on w.id = a.wallet_id
   where a.region = p_region and a.round_id = p_round and a.status = 'solved'
   group by a.wallet_id, w.player_name
   order by min(a.duration_ms)
   limit p_limit;
$$;

revoke execute on function apply_coins(uuid, integer, text, text) from public, anon, authenticated;
revoke execute on function claim_daily(uuid, integer) from public, anon, authenticated;
revoke execute on function pay_coin_order(uuid, text) from public, anon, authenticated;
revoke execute on function game_leaderboard(text, bigint, integer) from public, anon, authenticated;

-- Upgrade path for databases created before the Market stalls existed.
alter table bids drop constraint if exists bids_board_check;
alter table bids add constraint bids_board_check check (board in ('throne', 'b2', 'b3', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12'));
alter table boards drop constraint if exists boards_id_check;
alter table boards add constraint boards_id_check check (id in ('b2', 'b3', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12'));
insert into boards (region, id)
select r, b
  from unnest(array['global', 'ng']) as r,
       unnest(array['b2', 'b3', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12']) as b
on conflict do nothing;

-- King of the Day: one row per round. Whoever holds the throne when a round
-- ends is crowned (winner_bid_id). ends_at can move past base_ends_at by
-- overtime: takeovers in the final seconds extend the round.
create table if not exists crown_rounds (
  id             bigint generated always as identity primary key,
  region         text not null check (region in ('global', 'ng')),
  base_ends_at   timestamptz not null,
  ends_at        timestamptz not null,
  closed_at      timestamptz,
  winner_bid_id  uuid references bids (id),
  takeovers      integer not null default 0,
  unique (region, base_ends_at)
);
create index if not exists crown_rounds_open_idx on crown_rounds (region, id) where closed_at is null;
create index if not exists crown_rounds_kings_idx on crown_rounds (region, closed_at desc) where winner_bid_id is not null;

-- The History of Kings: a snapshot of every king when they leave the throne,
-- either overthrown (deposed_by set) or retired at the end of their term.
create table if not exists throne_legends (
  id               bigint generated always as identity primary key,
  region           text not null check (region in ('global', 'ng')),
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
create index if not exists legends_deposed_idx on throne_legends (region, deposed_at desc);
create index if not exists legends_reign_idx on throne_legends (region, reign_seconds desc);
create index if not exists legends_amount_idx on throne_legends (region, amount_cents desc);

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

-- Archive engine: whenever a region's throne changes hands (or empties because
-- the king retired), snapshot the old king.
create or replace function archive_deposed_king() returns trigger
language plpgsql
as $$
begin
  if old.bid_id is not null and new.bid_id is distinct from old.bid_id then
    insert into throne_legends (
      region, bid_id, name, tagline, image_url, target_url, amount_cents, crowned_at, deposed_at,
      deposed_by, deposed_by_name, retired, reign_seconds, survived_shield
    )
    select d.region, d.id, d.name, d.tagline, d.image_url, d.target_url, d.amount_cents, d.settled_at, now(),
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

-- Time-based housekeeping for one region, run by the API every few seconds
-- and at the start of every throne settlement:
--   1. close the King of the Day round once its clock hits zero;
--   2. retire a king whose term is over (the throne reopens at the start price).
-- Locks the region's throne first, then its round (same order as settle_bid),
-- so it is safe with many API instances. A free-tier host may sleep through
-- both deadlines: a king whose term ended before the round did is not crowned.
drop function if exists tick_throne(jsonb);
create or replace function tick_throne(p_region text, p_rules jsonb) returns json
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
  select * into v_throne from throne where region = p_region for update;
  if not found then
    raise exception 'unknown region %', p_region;
  end if;
  if v_throne.bid_id is not null then
    select settled_at + make_interval(secs => (p_rules->>'throneTermSeconds')::integer)
      into v_term_end from bids where id = v_throne.bid_id;
  end if;

  select * into v_round from crown_rounds
   where region = p_region and closed_at is null order by id desc limit 1 for update;
  v_open := found;

  if v_open and now() >= v_round.ends_at then
    v_winner := case when v_term_end > v_round.ends_at then v_throne.bid_id end;
    update crown_rounds set closed_at = now(), winner_bid_id = v_winner where id = v_round.id;
    v_crowned := json_build_object('roundId', v_round.id, 'bidId', v_winner);
    v_open := false;
  end if;

  if not v_open then
    v_base := next_crown_cutoff(now(), (p_rules->>'crownRoundSeconds')::integer, (p_rules->>'crownCutoffHourUtc')::integer);
    insert into crown_rounds (region, base_ends_at, ends_at) values (p_region, v_base, v_base)
      on conflict (region, base_ends_at) do nothing;
    select * into v_round from crown_rounds where region = p_region and base_ends_at = v_base;
  end if;

  if v_term_end is not null and now() >= v_term_end then
    update throne set bid_id = null where region = p_region;  -- the trigger archives him as retired
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
-- Everything happens inside the ad's own region; prices are never compared
-- across regions (they are in different currencies).
--
-- Throne: locks the region's throne, so two payments that clear at once are
--   serialized; the second sees the first as the new price and comes back
--   'outbid' (the backend refunds it). Mirrors backend/src/rules.js.
-- Bookings: locks the board row and appends the booking to the board's queue:
--   it starts when the board is next free, so days can never be double-sold.
--   A relegation booking is voided (and refunded) if that king already used it.
-- p_rules is that region's rules from the backend config.
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
  if p_rules->>'region' is distinct from v_bid.region then
    raise exception 'rules for region % passed for a % ad', p_rules->>'region', v_bid.region;
  end if;

  -- ---- Board booking ----
  if v_bid.board <> 'throne' then
    -- Lock the original throne ad first: two relegations of the same ad may
    -- target different boards, so the board lock alone can't serialize them.
    if v_bid.relegated_from is not null then
      perform 1 from bids where id = v_bid.relegated_from for update;
    end if;
    select * into v_board from boards where region = v_bid.region and id = v_bid.board for update;
    if v_bid.relegated_from is not null
       and exists (select 1 from bids where relegated_from = v_bid.relegated_from and status = 'won') then
      update bids set status = 'void', payment_ref = p_payment_ref, settled_at = now() where id = p_bid_id;
      return json_build_object('status', 'void');
    end if;
    v_start := greatest(now(), v_board.booked_until);
    v_end := v_start + make_interval(days => v_bid.days);
    update boards set booked_until = v_end where region = v_bid.region and id = v_bid.board;
    update bids
       set status = 'won', payment_ref = p_payment_ref, settled_at = now(), starts_at = v_start, ends_at = v_end
     where id = p_bid_id;
    update throne set volume_cents = volume_cents + v_bid.amount_cents where region = v_bid.region;
    return json_build_object('status', 'won', 'board', v_bid.board, 'startsAt', v_start, 'endsAt', v_end);
  end if;

  -- ---- Throne bid ----
  perform 1 from throne where region = v_bid.region for update;
  -- Close an expired King of the Day round and retire an expired king first,
  -- so a late payment can never steal a crown that was already decided.
  v_tick := tick_throne(v_bid.region, p_rules);
  v_round_id := (v_tick->'round'->>'id')::bigint;
  select * into v_throne from throne where region = v_bid.region;

  -- Game entries (score_ms set): the fastest time today wins. A king from an
  -- earlier day is beaten by any time today. During a Crown Shield the
  -- challenger must be 10% faster.
  if v_bid.score_ms is not null then
    if v_throne.bid_id is not null then
      select * into v_king from bids where id = v_throne.bid_id;
      -- Time to beat (10% faster while the king's Crown Shield is up).
      v_step := v_king.score_ms;
      if now() < v_king.shield_ends_at then
        v_step := floor(v_king.score_ms * 0.9)::integer;
      end if;
      if v_king.score_ms is not null and v_king.game_round_id = v_round_id and v_bid.score_ms >= v_step then
        update bids set status = 'outbid', settled_at = now() where id = p_bid_id;
        return json_build_object('status', 'outbid', 'crowned', v_tick->'crowned', 'retired', v_tick->'retired');
      end if;
    end if;
    v_min := 0;
  elsif v_throne.bid_id is null then
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
         game_round_id = case when score_ms is not null then v_round_id else game_round_id end,
         shield_ends_at = now() + make_interval(secs => shield_seconds)
   where id = p_bid_id;

  update throne
     set bid_id = p_bid_id,
         takeovers = takeovers + 1,
         volume_cents = volume_cents + v_bid.amount_cents
   where region = v_bid.region;

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

-- Distinct advertisers, and ads published on any board (not removed), per region.
-- Mirrors countAdvertisers() in backend/src/store/memoryStore.js.
drop function if exists count_advertisers();
drop function if exists count_advertisers(text);
create function count_advertisers(p_region text) returns json
language sql
stable
as $$
  select json_build_object('advertisers', count(distinct lower(trim(name))), 'ads', count(*))
    from bids where region = p_region and status = 'won' and removed_at is null;
$$;

-- Leaderboard: total spent per advertiser in one region (grouped by ad name,
-- case-insensitive), across all boards, excluding removed ads. Shows the name
-- from their latest ad. Mirrors getTopAdvertisers() in memoryStore.js.
drop function if exists top_advertisers(integer);
create or replace function top_advertisers(p_region text, p_limit integer)
returns table (name text, total_cents bigint, ads bigint, last_at timestamptz)
language sql
stable
as $$
  select (array_agg(trim(b.name) order by b.settled_at desc))[1],
         sum(b.amount_cents + b.addon_cents),
         count(*),
         max(b.settled_at)
    from bids b
   where b.region = p_region and b.status = 'won' and b.removed_at is null
   group by lower(trim(b.name))
   order by 2 desc, 3 desc
   limit least(greatest(p_limit, 1), 50);
$$;

create or replace function record_click(p_bid_id uuid) returns void
language sql
as $$
  update bids set clicks = clicks + 1 where id = p_bid_id;
$$;

-- Adds reach to many ads at once (the API batches it every ~30 s).
create or replace function add_views(p_ids uuid[], p_counts integer[]) returns void
language sql
as $$
  update bids b set views = b.views + v.n
    from unnest(p_ids, p_counts) as v(id, n)
   where b.id = v.id and v.n > 0;
$$;

-- Daily traffic only ever grows within a day (several API instances may report).
create or replace function record_daily(p_region text, p_day date, p_visitors integer, p_peak integer) returns void
language sql
as $$
  insert into daily_stats (region, day, visitors, peak) values (p_region, p_day, p_visitors, p_peak)
  on conflict (region, day) do update
     set visitors = greatest(daily_stats.visitors, excluded.visitors),
         peak = greatest(daily_stats.peak, excluded.peak);
$$;

-- What an advertiser sees before paying: real traffic and real results.
create or replace function ad_performance(p_region text) returns json
language sql
stable
as $$
  select json_build_object(
    'visitors7d', (select coalesce(sum(visitors), 0) from daily_stats where region = p_region and day > current_date - 7),
    'days', (select count(*) from daily_stats where region = p_region and day > current_date - 7),
    'clicks7d', (select coalesce(sum(clicks), 0) from bids where region = p_region and status = 'won' and settled_at > now() - interval '7 days'),
    'ads7d', (select count(*) from bids where region = p_region and status = 'won' and settled_at > now() - interval '7 days'),
    'avgThroneReach', (select coalesce(round(avg(views)), 0) from bids where region = p_region and board = 'throne' and status = 'won' and views > 0 and settled_at > now() - interval '30 days'),
    'avgThroneClicks', (select coalesce(round(avg(clicks)), 0) from bids where region = p_region and board = 'throne' and status = 'won' and views > 0 and settled_at > now() - interval '30 days')
  );
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

-- Estimated processor fee for one charge, in that currency's minor units.
--   USD (Stripe):   30c + 2.9%
--   NGN (Paystack): 1.5% + ₦100, the ₦100 waived under ₦2,500, capped at ₦2,000
-- Estimates only: the processor dashboards are the source of truth.
create or replace function est_fee(p_region text, p_charge integer) returns integer
language sql
immutable
as $$
  select case p_region
    when 'ng' then least(200000, ceil(p_charge * 0.015)::integer + case when p_charge >= 250000 then 10000 else 0 end)
    else 30 + ceil(p_charge * 0.029)::integer
  end;
$$;

-- Admin revenue snapshot, one object per region (never summed across
-- currencies). Mirrored by getFinancials() in backend/src/store/memoryStore.js.
create or replace function admin_financials() returns json
language sql
stable
as $$
  select json_build_object(
    'regions', (
      select json_object_agg(r.region, json_build_object(
        'won_bids',           (select count(*) from bids where region = r.region and status = 'won'),
        'gross_cents',        (select coalesce(sum(amount_cents + addon_cents), 0) from bids where region = r.region and status = 'won'),
        'addon_cents',        (select coalesce(sum(addon_cents), 0) from bids where region = r.region and status = 'won'),
        'throne_gross_cents', (select coalesce(sum(amount_cents), 0) from bids where region = r.region and status = 'won' and board = 'throne'),
        'boards_gross_cents', (select coalesce(sum(amount_cents), 0) from bids where region = r.region and status = 'won' and board <> 'throne'),
        'bookings',           (select count(*) from bids where region = r.region and status = 'won' and board <> 'throne'),
        'relegations',        (select count(*) from bids where region = r.region and status = 'won' and relegated_from is not null),
        'est_fees_cents',     (select coalesce(sum(est_fee(region, amount_cents + addon_cents)), 0)
                                 from bids where region = r.region and status in ('won', 'refunded') and payment_ref not like 'demo_%'),
        'refunded_cents',     (select coalesce(sum(amount_cents + addon_cents), 0) from bids where region = r.region and status = 'refunded'),
        'coin_packs',         (select count(*) from coin_orders where region = r.region and status = 'paid'),
        'coin_packs_cents',   (select coalesce(sum(amount_cents), 0) from coin_orders where region = r.region and status = 'paid'),
        'coin_packs_fees_cents', (select coalesce(sum(est_fee(region, amount_cents)), 0) from coin_orders
                                    where region = r.region and status = 'paid' and payment_ref not like 'demo_%'),
        'coin_ads',           (select count(*) from bids where region = r.region and status = 'won' and coins > 0)
      ))
      from throne r
    ),
    'stale_pending', (select count(*) from bids where status = 'pending' and created_at < now() - interval '1 hour'),
    'hype',          (select coalesce(json_object_agg(status, n), '{}'::json)
                        from (select status, count(*) n from hype_jobs group by status) s)
  );
$$;

revoke execute on function settle_bid(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function tick_throne(text, jsonb) from public, anon, authenticated;
revoke execute on function report_bid(uuid, text, text, text, integer) from public, anon, authenticated;
revoke execute on function record_click(uuid) from public, anon, authenticated;
revoke execute on function add_views(uuid[], integer[]) from public, anon, authenticated;
revoke execute on function record_daily(text, date, integer, integer) from public, anon, authenticated;
revoke execute on function ad_performance(text) from public, anon, authenticated;
revoke execute on function count_advertisers(text) from public, anon, authenticated;
revoke execute on function top_advertisers(text, integer) from public, anon, authenticated;
revoke execute on function claim_hype_job() from public, anon, authenticated;
revoke execute on function admin_financials() from public, anon, authenticated;
revoke execute on function archive_deposed_king() from public, anon, authenticated;
