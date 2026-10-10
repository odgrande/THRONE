import { createHash, timingSafeEqual } from 'node:crypto';

// Alert thresholds for the credit liability, as % of net card cash.
const CREDIT_RATIO_WARN_PCT = 15;
const CREDIT_RATIO_ALERT_PCT = 30;

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

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

// Turns raw ledger totals into the balance-sheet view and a traffic light.
//
// Why credits matter: a bid paid with credits brings in no card cash, yet it
// still mints a new dividend for the king it dethrones. Heavy credit-funded
// bidding grows the liability without growing cash; creditFundedPct shows it.
export function assessHealth(f, stripeBalance) {
  const netCashCents = f.cardGrossCents - f.estFeesCents;
  const coverageCents = netCashCents - f.outstandingCreditsCents - f.creatorFundCents;
  const creditRatioPct = pct(f.outstandingCreditsCents, netCashCents);
  const creditFundedPct = pct(f.creditsSpentCents, f.creditsSpentCents + f.cardGrossCents);

  const alerts = [];
  let status = 'green';
  const raise = (level, message) => {
    alerts.push({ level, message });
    if (level === 'red' || (level === 'amber' && status === 'green')) status = level;
  };

  if (coverageCents < 0) {
    raise('red', 'Outstanding credits plus the Creator Fund exceed net card cash.');
  }
  if (creditRatioPct === null && f.outstandingCreditsCents > 0) {
    raise('red', 'Credits are outstanding but there is no card revenue yet.');
  } else if (creditRatioPct >= CREDIT_RATIO_ALERT_PCT) {
    raise('red', `Credit liability is ${creditRatioPct}% of net cash (alert at ${CREDIT_RATIO_ALERT_PCT}%).`);
  } else if (creditRatioPct >= CREDIT_RATIO_WARN_PCT) {
    raise('amber', `Credit liability is ${creditRatioPct}% of net cash (warn at ${CREDIT_RATIO_WARN_PCT}%).`);
  }
  if (stripeBalance && stripeBalance.availableCents + stripeBalance.pendingCents < f.creatorFundCents) {
    raise('amber', 'Stripe balance is below the Creator Fund pledge (payouts to your bank also reduce it).');
  }
  if (f.stalePending > 0) {
    raise('amber', `${f.stalePending} unpaid bid(s) older than 1 hour. Schedule a cleanup job.`);
  }
  if (f.hype.failed > 0) {
    raise('amber', `${f.hype.failed} hype video render(s) failed.`);
  }

  return {
    ...f,
    netCashCents,
    coverageCents,
    creditRatioPct,
    creditFundedPct,
    stripeBalance,
    thresholds: { warnPct: CREDIT_RATIO_WARN_PCT, alertPct: CREDIT_RATIO_ALERT_PCT },
    status,
    alerts,
    generatedAt: new Date().toISOString(),
  };
}
