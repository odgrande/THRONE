// Pricing rules shared by both stores and the API. supabase/schema.sql
// (settle_bid) mirrors minNextBidCents; keep them in sync.
// frontend/src/lib/rules.js is a copy for the live UI.

// Stripe will not charge less than this.
export const STRIPE_MIN_CHARGE_CENTS = 50;

export function shieldSecondsFor(amountCents, rules) {
  const extraDollars = Math.max(0, amountCents - rules.startingPriceCents) / 100;
  const seconds = rules.shieldBaseSeconds + Math.floor(extraDollars * rules.shieldSecondsPerDollar);
  return Math.min(rules.shieldMaxSeconds, seconds);
}

// Every overthrow must beat the holder by a flat floor or a percentage,
// whichever is larger, so each payment clears Stripe's fee with room to spare.
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

// Split a bid between Throne Credits and a card charge. Any card charge must
// meet Stripe's minimum, so credits are trimmed if they would leave less.
export function splitPayment(amountCents, availableCreditsCents) {
  let credits = Math.min(Math.max(0, availableCreditsCents), amountCents);
  const remainder = amountCents - credits;
  if (remainder > 0 && remainder < STRIPE_MIN_CHARGE_CENTS) credits = amountCents - STRIPE_MIN_CHARGE_CENTS;
  credits = Math.max(0, credits);
  return { creditsCents: credits, chargeCents: amountCents - credits };
}
