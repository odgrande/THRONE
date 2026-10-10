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

// Revenue view plus operational alerts. Pure ad sales: no balances are owed
// to anyone, so there is no liability to track.
export function assessHealth(f, stripeBalance) {
  const netCents = f.grossCents - f.estFeesCents;
  const alerts = [];
  if (f.stalePending > 0) alerts.push({ level: 'amber', message: `${f.stalePending} unpaid ad(s) older than 1 hour. Schedule a cleanup job.` });
  if (f.hype.failed > 0) alerts.push({ level: 'amber', message: `${f.hype.failed} hype video render(s) failed.` });

  return {
    ...f,
    netCents,
    stripeBalance,
    status: alerts.length ? 'amber' : 'green',
    alerts,
    generatedAt: new Date().toISOString(),
  };
}
