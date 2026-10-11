import { regionInfo, requestRegion } from './region.js';

// Empty in dev (Vite proxies /api). Set VITE_API_URL when the API lives on another origin.
export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

async function request(path, options = {}) {
  const res = await fetch(API_URL + path, {
    ...options,
    // Every call names the region once it is known; before that the server
    // picks one from the visitor's country.
    headers: { 'Content-Type': 'application/json', ...(requestRegion() ? { 'X-Region': requestRegion() } : {}), ...options.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export const api = {
  getState: () => request('/api/state'),
  getLegends: ({ sort, offset }) => request(`/api/legends?sort=${sort}&offset=${offset}&limit=24`),
  getCrowns: () => request('/api/crowns?limit=30'),
  getGeo: () => request('/api/geo'),
  createBid: (bid) => request('/api/bids', { method: 'POST', body: JSON.stringify(bid) }),
  // Raw MP4/MOV body; returns { videoToken, seconds }.
  uploadVideo: (file) => request('/api/uploads/video', { method: 'POST', headers: { 'Content-Type': file.type }, body: file }),
  adminReviews: (token) => request('/api/admin/reviews', { headers: { Authorization: `Bearer ${token}` } }),
  demoPay: (bidId) => request(`/api/bids/${bidId}/demo-pay`, { method: 'POST' }),
  bidStatus: (bidId) => request(`/api/bids/${bidId}/status`),
  createBooking: (booking) => request('/api/bookings', { method: 'POST', body: JSON.stringify(booking) }),
  relegationOffer: (bidId, ownerToken) => request(`/api/relegations/${bidId}`, { headers: { 'X-Owner-Token': ownerToken } }),
  relegate: (fromBidId, ownerToken, email) =>
    request('/api/relegations', { method: 'POST', body: JSON.stringify({ fromBidId, ownerToken, email }) }),
  getLink: (bidId) => request(`/api/go/${bidId}`),
  report: (bidId, reason, details) => request('/api/reports', { method: 'POST', body: JSON.stringify({ bidId, reason, details }) }),
  adminHealth: (token) => request('/api/admin/health', { headers: { Authorization: `Bearer ${token}` } }),
  adminReports: (token) => request('/api/admin/reports', { headers: { Authorization: `Bearer ${token}` } }),
  adminAction: (token, bidId, action, body = {}) =>
    request(`/api/admin/bids/${bidId}/${action}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
  visit: (bidId) => request(`/api/go/${bidId}`, { method: 'POST' }),
  // The live feed counts each viewer in the edition they watch (for ad reach).
  eventsUrl: () => `${API_URL}/api/events${requestRegion() ? `?region=${requestRegion()}` : ''}`,
  myAds: (ads) => request('/api/my-ads', { method: 'POST', body: JSON.stringify({ ads }) }),
};

// Money is in minor units (cents / kobo). Naira shows whole amounts (₦2,500);
// dollars keep cents ($5.00).
export function formatMoney(cents, region) {
  const { currency, locale } = regionInfo(region);
  const whole = currency === 'NGN';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(cents / 100);
}

export function formatDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export const formatClock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

// The smallest amount a visitor can actually pay. Naira is typed in whole
// naira, so a minimum like ₦5,156.25 (10% of an odd price) becomes ₦5,157;
// anything below it would be refused by the browser's input or the server.
export function payableMinimum(cents, region) {
  return regionInfo(region).currency === 'NGN' ? Math.ceil(cents / 100) * 100 : cents;
}

// Amount input helpers. Naira is typed in whole naira (rounded up, so a
// prefilled minimum is never below the real one); dollars keep cents.
export function amountToText(cents, region) {
  return regionInfo(region).currency === 'NGN' ? String(Math.ceil(cents / 100)) : (cents / 100).toFixed(2);
}
export const textToCents = (text) => Math.round(Number(text) * 100) || 0;

// Compact money for big totals: $1,240 / $12.4k / ₦1.2M.
export function formatMoneyShort(cents, region) {
  const { symbol, currency } = regionInfo(region);
  const units = cents / 100;
  if (units >= 1e6) return `${symbol}${(units / 1e6).toFixed(1)}M`;
  if (units >= 1e4) return `${symbol}${(units / 1e3).toFixed(1)}k`;
  const decimals = currency === 'NGN' || units >= 100 ? 0 : 2;
  return `${symbol}${units.toLocaleString(undefined, { maximumFractionDigits: decimals })}`;
}
