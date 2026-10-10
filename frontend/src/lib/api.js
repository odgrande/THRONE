// Empty in dev (Vite proxies /api). Set VITE_API_URL when the API lives on another origin.
export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

async function request(path, options = {}) {
  const res = await fetch(API_URL + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
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
  createBid: (bid) => request('/api/bids', { method: 'POST', body: JSON.stringify(bid) }),
  demoPay: (bidId) => request(`/api/bids/${bidId}/demo-pay`, { method: 'POST' }),
  bidStatus: (bidId) => request(`/api/bids/${bidId}/status`),
  getWallet: (token) => request('/api/wallet', { headers: token ? { 'X-Wallet-Token': token } : {} }),
  getLink: (bidId) => request(`/api/go/${bidId}`),
  adminHealth: (token) => request('/api/admin/health', { headers: { Authorization: `Bearer ${token}` } }),
  visit: (bidId) => request(`/api/go/${bidId}`, { method: 'POST' }),
  eventsUrl: () => `${API_URL}/api/events`,
};

export const formatMoney = (cents) => `$${(cents / 100).toFixed(2)}`;

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

// Compact money for big totals: $1,240 / $12.4k / $1.2M.
export function formatMoneyShort(cents) {
  const dollars = cents / 100;
  if (dollars >= 1e6) return `$${(dollars / 1e6).toFixed(1)}M`;
  if (dollars >= 1e4) return `$${(dollars / 1e3).toFixed(1)}k`;
  return `$${dollars.toLocaleString(undefined, { maximumFractionDigits: dollars < 100 ? 2 : 0 })}`;
}
