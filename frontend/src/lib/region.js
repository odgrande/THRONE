// Which edition this visitor sees. Each region is a separate throne with its
// own currency; amounts are never compared across regions.
//
// There is no switch: the server picks from the visitor's location
// (Cloudflare's CF-IPCountry: Nigeria -> ng, everywhere else -> global) and
// getState tells us which one it chose. A ?region= link overrides it for that
// page view only (for testing and support); nothing is saved.
export const REGIONS = {
  global: { id: 'global', code: 'GL', name: 'Global', flag: '🌍', currency: 'USD', locale: 'en-US', symbol: '$' },
  ng: { id: 'ng', code: 'NG', name: 'Nigeria', flag: '🇳🇬', currency: 'NGN', locale: 'en-NG', symbol: '₦' },
};

// Forget any choice saved by the old edition switch.
try {
  localStorage.removeItem('throne.region');
} catch {
  // Storage blocked: nothing was saved anyway.
}

const fromUrl = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('region') : null;
// null until the server settles it (or a ?region= test link names it).
let active = REGIONS[fromUrl] ? fromUrl : null;

export const chosenRegion = () => (REGIONS[fromUrl] ? fromUrl : null);
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

// Region the next request should name explicitly; null lets the server decide.
export const requestRegion = () => active;

// The current region's payment processor, from getState. Paystack needs a
// receipt email at checkout; Stripe and the demo do not.
let processor = null;
export const adoptProcessor = (mode) => {
  processor = mode;
};
// Paystack and Flutterwave need a receipt email at checkout; Stripe and the demo do not.
export const needsEmail = () => processor === 'paystack' || processor === 'flutterwave';
