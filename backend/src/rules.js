// Pricing rules shared by both stores and the API. supabase/schema.sql
// (settle_bid) mirrors minNextBidCents; keep them in sync.
// frontend/src/lib/rules.js is a copy for the live UI.

// b2/b3: the Court (mid-price boards). p1-p10: the Spotlight, ten featured
// spaces. m1-m12: the Market, small low-cost stalls for tight budgets.
// All are fixed-price, guaranteed-time bookings.
export const COURT_IDS = ['b2', 'b3'];
export const SPOTLIGHT_IDS = Array.from({ length: 10 }, (_, i) => `p${i + 1}`);
export const MARKET_IDS = Array.from({ length: 12 }, (_, i) => `m${i + 1}`);
export const BOARD_IDS = [...COURT_IDS, ...SPOTLIGHT_IDS, ...MARKET_IDS];
export const BOOKING_DAYS = [1, 3, 7];
// Longer bookings are cheaper per day.
const PACKAGE_FACTOR = { 1: 1, 3: 2.5, 7: 5 };

// The shield grows by shieldSecondsPerStep for every shieldStepCents bid above
// the starting price (e.g. 30 s per extra $1, or per extra ₦100).
export function shieldSecondsFor(amountCents, rules) {
  const extraSteps = Math.max(0, amountCents - rules.startingPriceCents) / rules.shieldStepCents;
  const seconds = rules.shieldBaseSeconds + Math.floor(extraSteps * rules.shieldSecondsPerStep);
  return Math.min(rules.shieldMaxSeconds, seconds);
}

// A king who goes unchallenged for the full term retires; until then he holds.
export function termEndsAtMs(throneBid, rules) {
  return Date.parse(throneBid.settledAt ?? throneBid.startedAt) + rules.throneTermSeconds * 1000;
}

// Every overthrow must beat the holder by a flat floor or a percentage,
// whichever is larger, so each payment clears the processor's fee.
// While shielded, the shield premium applies if it is larger still.
export function minNextBidCents(throneBid, nowMs, rules) {
  if (!throneBid) return rules.startingPriceCents;
  const amount = throneBid.amountCents;
  let step = Math.max(rules.minIncrementCents, Math.ceil((amount * rules.minRaisePct) / 100));
  if (nowMs < Date.parse(throneBid.shieldEndsAt)) {
    step = Math.max(step, Math.ceil((amount * rules.shieldPremiumPct) / 100));
  }
  return amount + step;
}

// Fixed-price bookings on the smaller boards.
export function bookingPriceCents(board, days, rules) {
  const cfg = rules.boards[board];
  if (!cfg || !PACKAGE_FACTOR[days]) return null;
  return Math.round(cfg.dayPriceCents * PACKAGE_FACTOR[days]);
}

// A dethroned king may move the same ad to a smaller board for one day at a discount.
export function relegationPriceCents(board, rules) {
  return Math.round((bookingPriceCents(board, 1, rules) * (100 - rules.relegationDiscountPct)) / 100);
}

// Relegation should keep the ad visible now, so it goes to whichever Court
// board is free first (the bigger board on a tie). Never to a Market stall.
export function pickRelegationBoard(boardsState, nowMs) {
  const startOf = (id) => Math.max(nowMs, boardsState[id].bookedUntil ? Date.parse(boardsState[id].bookedUntil) : 0);
  return COURT_IDS.reduce((best, id) => (startOf(id) < startOf(best) ? id : best), COURT_IDS[0]);
}

// King of the Day rounds are aligned to a fixed grid: they end every
// crownRoundSeconds, offset so the default daily round ends at the cutoff hour.
// Mirrors next_crown_cutoff() in schema.sql.
export function nextCrownCutoffMs(nowMs, rules) {
  const length = rules.crownRoundSeconds * 1000;
  const offset = ((rules.crownCutoffHourUtc * 3600) % rules.crownRoundSeconds) * 1000;
  return Math.floor((nowMs - offset) / length) * length + offset + length;
}

// A takeover inside the overtime window pushes the round's end out, capped.
export function extendedCrownEndMs(round, nowMs, rules) {
  const endsAt = Date.parse(round.endsAt);
  const inWindow = nowMs < endsAt && nowMs >= endsAt - rules.crownOvertimeWindowSeconds * 1000;
  if (!inWindow) return endsAt;
  const cap = Date.parse(round.baseEndsAt) + rules.crownMaxOvertimeSeconds * 1000;
  return Math.min(cap, endsAt + rules.crownExtensionSeconds * 1000);
}
