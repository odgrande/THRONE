// Which edition this visitor sees. Each region is a separate throne with its
// own currency; amounts are never compared across regions.
//
// First visit: no saved choice, so the server picks from the visitor's country
// (Cloudflare's CF-IPCountry: Nigeria -> ng, else global) and getState tells
// us which one it chose. Switching saves the choice and reloads the page, so
// every screen, price and live feed comes from the new region.
export const REGIONS = {
  global: { id: 'global', code: 'GL', name: 'Global', flag: '🌍', currency: 'USD', locale: 'en-US', symbol: '$' },
  ng: { id: 'ng', code: 'NG', name: 'Nigeria', flag: '🇳🇬', currency: 'NGN', locale: 'en-NG', symbol: '₦' },
};

const KEY = 'throne.region';

function saved() {
  try {
    const value = localStorage.getItem(KEY);
    return REGIONS[value] ? value : null;
  } catch {
    return null;
  }
}

// null until the server (or a saved choice) settles it.
let active = saved();

export const chosenRegion = () => saved();
export const activeRegion = () => active ?? 'global';
export const regionInfo = (id = activeRegion()) => REGIONS[id] ?? REGIONS.global;

// Called with the region the server answered with, so later requests and
// price formatting follow it.
const listeners = new Set();
export function adoptRegion(id) {
  if (!REGIONS[id] || id === active) return;
  active = id;
  listeners.forEach((fn) => fn());
}
// For useSyncExternalStore: re-render when the server settles the region.
export const subscribeRegion = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function switchRegion(id) {
  if (!REGIONS[id]) return;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Storage blocked: the switch still applies for this page view via the URL.
  }
  const url = new URL(window.location.href);
  url.searchParams.set('region', id);
  window.location.assign(url.toString());
}

// A ?region= link (shared, or after a switch with storage blocked) wins once.
{
  const fromUrl = new URLSearchParams(window.location.search).get('region');
  if (REGIONS[fromUrl]) {
    active = fromUrl;
    try {
      localStorage.setItem(KEY, fromUrl);
    } catch {
      // ignore
    }
  }
}

// Region the next request should name explicitly; null lets the server decide.
export const requestRegion = () => active;

// The current region's payment processor, from getState. Paystack needs a
// receipt email at checkout; Stripe and the demo do not.
let processor = null;
export const adoptProcessor = (mode) => {
  processor = mode;
};
export const needsEmail = () => processor === 'paystack';
