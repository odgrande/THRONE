import { isIP } from 'node:net';

const MAX_URL_LENGTH = 500;

// Returns a normalized http(s) URL, or throws with a user-facing message.
// Only http/https survive, which rules out javascript:, data:, vbscript: and
// file: links: the only ways an href itself can run script.
export function normalizeTargetUrl(raw) {
  let url;
  try {
    url = new URL(String(raw ?? '').trim());
  } catch {
    throw new Error('Link must be a valid http(s) URL.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Link must start with http:// or https://');
  // "https://paypal.com@evil.example" style tricks.
  if (url.username || url.password) throw new Error('Links with embedded usernames or passwords are not allowed.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) || host === 'localhost' || !host.includes('.')) {
    throw new Error('Link must point to a public domain name.');
  }
  const href = url.toString();
  if (href.length > MAX_URL_LENGTH) throw new Error('Link is too long.');
  return href;
}

// Google Web Risk lookup (the commercial-use counterpart of Safe Browsing).
// Fails closed: if the check cannot run, the bid is not accepted.
export function createLinkChecker(apiKey) {
  if (!apiKey) {
    console.warn('[links] WEB_RISK_API_KEY not set: malware/phishing link checks are OFF (dev only).');
    return { enabled: false, check: async () => ({ ok: true }) };
  }

  return {
    enabled: true,
    async check(url) {
      const params = new URLSearchParams({ uri: url, key: apiKey });
      for (const type of ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE']) params.append('threatTypes', type);
      const res = await fetch(`https://webrisk.googleapis.com/v1/uris:search?${params}`, {
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) throw new Error(`Web Risk lookup failed (${res.status})`);
      const body = await res.json();
      return body.threat ? { ok: false, threats: body.threat.threatTypes } : { ok: true };
    },
  };
}
