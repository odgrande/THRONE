// Cloudflare Turnstile: an invisible-or-one-click bot check inside the bid
// form. Card-testing scripts can't produce a valid token, and each token is
// single-use and expires after 5 minutes.
//
// (A Cloudflare WAF "Managed Challenge" would not work here: challenges can't
// be solved inside a fetch() call, so real users' bids would just fail.)
export function createTurnstile(secret) {
  if (!secret) {
    console.warn('[turnstile] TURNSTILE_SECRET_KEY not set: bot check is OFF (dev only).');
    return { enabled: false, verify: async () => true };
  }
  return {
    enabled: true,
    async verify(token, remoteIp) {
      if (typeof token !== 'string' || !token || token.length > 2048) return false;
      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: new URLSearchParams({ secret, response: token, remoteip: remoteIp ?? '' }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`Turnstile verify failed (${res.status})`);
      const body = await res.json();
      return body.success === true;
    },
  };
}
