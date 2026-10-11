import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (value) => createHash('sha256').update(value).digest();

// Bearer-token guard. Comparing fixed-length digests keeps the check
// constant-time regardless of what the caller sends.
export function requireAdmin(token) {
  const expected = digest(token);
  return (req, res, next) => {
    const sent = (req.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!sent || !timingSafeEqual(digest(sent), expected)) {
      return res.status(401).json({ error: 'Invalid admin token.' });
    }
    next();
  };
}

// Revenue view per region (each in its own currency, never summed together)
// plus operational alerts. Pure ad sales: no balances are owed to anyone.
export function assessHealth(financials, balances, regions, modeFor) {
  const alerts = [];
  if (financials.stalePending > 0) {
    alerts.push({ level: 'amber', message: `${financials.stalePending} unpaid ad(s) older than 1 hour. Schedule a cleanup job.` });
  }
  if (financials.hype.failed > 0) alerts.push({ level: 'amber', message: `${financials.hype.failed} hype video render(s) failed.` });

  const perRegion = {};
  for (const [id, region] of Object.entries(regions)) {
    const f = financials.regions[id];
    perRegion[id] = {
      ...f,
      name: region.name,
      currency: region.currency,
      locale: region.locale,
      processor: modeFor(id),
      netCents: f.grossCents - f.estFeesCents,
      // VAT included in the prices (Nigeria 7.5%): the part of revenue owed as VAT.
      vatPct: region.rules.vatPct ?? 0,
      vatCents: region.rules.vatPct ? Math.round((f.grossCents * region.rules.vatPct) / (100 + region.rules.vatPct)) : 0,
      balance: balances[id] ?? null,
    };
  }

  return {
    regions: perRegion,
    stalePending: financials.stalePending,
    hype: financials.hype,
    status: alerts.length ? 'amber' : 'green',
    alerts,
    generatedAt: new Date().toISOString(),
  };
}
