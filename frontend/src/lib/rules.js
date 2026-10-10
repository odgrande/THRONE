// Copy of backend/src/rules.js so the price drops the moment a shield breaks,
// without waiting for a round trip. The server re-checks every bid anyway.

export function shieldSecondsFor(amountCents, rules) {
  const extraSteps = Math.max(0, amountCents - rules.startingPriceCents) / rules.shieldStepCents;
  const seconds = rules.shieldBaseSeconds + Math.floor(extraSteps * rules.shieldSecondsPerStep);
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
