// Ads this browser bought, with their private owner codes (no accounts).
// The code proves ownership for owner-only actions, like relegating a
// dethroned throne ad. Storage can be blocked (private mode), so every
// access is guarded; the site works without it, minus those extras.
const KEY = 'throne.ownedAds';
// Kept 90 days so advertisers can check their results on /my-ads.
const KEEP_MS = 90 * 86400_000;

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((a) => Date.now() - a.at < KEEP_MS) : [];
  } catch {
    return [];
  }
}

export function rememberOwnedAd({ bidId, ownerToken, board }) {
  if (!bidId || !ownerToken) return;
  try {
    localStorage.setItem(KEY, JSON.stringify([{ bidId, token: ownerToken, board, at: Date.now() }, ...read()].slice(0, 50)));
  } catch {
    // Not fatal: only the relegation offer and My ads depend on it.
  }
}

export const ownedAds = read;
export const ownedAd = (bidId) => read().find((a) => a.bidId === bidId) ?? null;
