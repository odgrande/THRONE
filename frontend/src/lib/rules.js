// Copy of backend/src/rules.js so the price drops the moment a shield breaks,
// without waiting for a round trip. The server re-checks every bid anyway.
export const STRIPE_MIN_CHARGE_CENTS = 50;

export function shieldSecondsFor(amountCents, rules) {
  const extraDollars = Math.max(0, amountCents - rules.startingPriceCents) / 100;
  const seconds = rules.shieldBaseSeconds + Math.floor(extraDollars * rules.shieldSecondsPerDollar);
  return Math.min(rules.shieldMaxSeconds, seconds);
}

export function minNextBidCents(throne, nowMs, rules) {
  if (!throne) return rules.startingPriceCents;
  const amount = throne.amountCents;
  let step = Math.max(rules.minIncrementCents, Math.ceil((amount * rules.minRaisePct) / 100));
  if (nowMs < Date.parse(throne.shieldEndsAt)) {
    step = Math.max(step, Math.ceil((amount * rules.shieldPremiumPct) / 100));
  }
  return amount + step;
}

// The open-season price: what the minimum drops to once the shield breaks.
export function openSeasonPriceCents(throne, rules) {
  const amount = throne.amountCents;
  return amount + Math.max(rules.minIncrementCents, Math.ceil((amount * rules.minRaisePct) / 100));
}

export function splitPayment(amountCents, availableCreditsCents) {
  let credits = Math.min(Math.max(0, availableCreditsCents), amountCents);
  const remainder = amountCents - credits;
  if (remainder > 0 && remainder < STRIPE_MIN_CHARGE_CENTS) credits = amountCents - STRIPE_MIN_CHARGE_CENTS;
  credits = Math.max(0, credits);
  return { creditsCents: credits, chargeCents: amountCents - credits };
}
