import { useSyncExternalStore } from 'react';
import { API_URL } from './api.js';
import { requestRegion } from './region.js';

// The coin wallet: no signup. This browser keeps a secret wallet key; the
// server keeps only its hash. The key doubles as the BACKUP CODE: entering it
// on another browser or PC opens the very same wallet (coins, records, ad
// card, invites). Everything that matters — balance, tries left, cooldowns —
// lives on the server, so switching browsers changes nothing.
//
// Storage can be blocked (private mode): every access is guarded.
const KEY = 'throne.wallet';
const DEVICE_KEY = 'throne.device';
const MEMORY_KEY = 'throne.gameMemory';
const INVITE_KEY = 'throne.invitedBy';

const safeGet = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const safeSet = (k, v) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    // Storage blocked: the wallet works for this visit; the backup code restores it later.
  }
};

// A random id for this browser (anti-farming: daily limits also count per device).
export function deviceId() {
  let id = safeGet(DEVICE_KEY);
  if (!id || !/^[A-Za-z0-9_-]{16,128}$/.test(id)) {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    id = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    safeSet(DEVICE_KEY, id);
  }
  return id;
}

// Invite links (?ref=CODE) are remembered until a wallet is made.
if (typeof window !== 'undefined') {
  const ref = new URLSearchParams(window.location.search).get('ref');
  if (ref && /^[A-Za-z0-9]{8}$/.test(ref)) safeSet(INVITE_KEY, ref.toUpperCase());
}

let token = safeGet(KEY);
let state = { wallet: null, loading: Boolean(token), error: null };
const listeners = new Set();
const emit = (patch) => {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
};
const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const useWallet = () => useSyncExternalStore(subscribe, () => state);
export const walletToken = () => token;

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Device': deviceId() };
  if (auth && token) headers['X-Wallet'] = token;
  if (requestRegion()) headers['X-Region'] = requestRegion();
  const res = await fetch(API_URL + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.body = json;
    if (json.noWallet && auth) forget();
    if (json.banned) emit({ wallet: state.wallet && { ...state.wallet, banned: true, banReason: json.error } });
    throw err;
  }
  return json;
}

function setToken(next) {
  token = next;
  safeSet(KEY, next);
}
function forget() {
  setToken(null);
  emit({ wallet: null, loading: false });
}

export async function refreshWallet() {
  if (!token) {
    emit({ wallet: null, loading: false });
    return null;
  }
  try {
    const { wallet } = await request('/api/wallet');
    emit({ wallet, loading: false, error: null });
    return wallet;
  } catch (err) {
    emit({ loading: false, error: err.status === 404 ? null : err.message });
    return null;
  }
}

// Makes a wallet (welcome coins, if this network/device hasn't had them today).
export async function createWallet(turnstileToken) {
  const res = await request('/api/wallet', { method: 'POST', auth: false, body: { ref: safeGet(INVITE_KEY), turnstileToken } });
  setToken(res.token);
  safeSet(INVITE_KEY, null);
  emit({ wallet: res.wallet, loading: false, justCreated: { welcome: res.welcome } });
  return res;
}

export async function restoreWallet(code) {
  const res = await request('/api/wallet/restore', { method: 'POST', auth: false, body: { code: code.trim() } });
  setToken(res.token);
  // Typing the code back in proves it was saved.
  await request('/api/wallet/backed-up', { method: 'POST' }).catch(() => {});
  emit({ wallet: { ...res.wallet, backedUp: true }, loading: false, error: null });
  return res.wallet;
}

export async function markBackedUp() {
  await request('/api/wallet/backed-up', { method: 'POST' });
  emit({ wallet: state.wallet && { ...state.wallet, backedUp: true } });
}

export const walletApi = {
  claimDaily: async () => {
    const r = await request('/api/wallet/daily', { method: 'POST' });
    await refreshWallet();
    return r;
  },
  setName: async (name) => {
    const { wallet } = await request('/api/wallet/name', { method: 'POST', body: { name } });
    emit({ wallet });
  },
  saveCard: (card) => request('/api/wallet/card', { method: 'POST', body: card }),
  ledger: () => request('/api/wallet/ledger'),
  affiliates: () => request('/api/wallet/affiliates'),
  gameStatus: () => request('/api/game/status'),
  start: (pay = false) => request('/api/game/start', { method: 'POST', body: { pay } }),
  finish: (attemptId, moves) => request('/api/game/finish', { method: 'POST', body: { attemptId, moves } }),
  abandon: (attemptId) => request('/api/game/abandon', { method: 'POST', body: { attemptId } }),
  leaderboard: () => request('/api/game/leaderboard'),
  shield: (blocks) => request('/api/game/shield', { method: 'POST', body: { blocks } }),
  createOrder: (pack, extra) => request('/api/coins/orders', { method: 'POST', body: { pack, ...extra } }),
  orderStatus: (id) => request(`/api/coins/orders/${id}`),
  demoPayOrder: (id) => request(`/api/coins/orders/${id}/demo-pay`, { method: 'POST' }),
  bookWithCoins: (booking) => request('/api/bookings/coins', { method: 'POST', body: booking }),
};

// The backup code, grouped for reading aloud / writing down.
export const formatCode = (code) => (code ?? '').match(/.{1,4}/g)?.join(' ') ?? '';

// --- Game memory kept in this browser (the server keeps the official record) ---
export function gameMemory() {
  try {
    return JSON.parse(safeGet(MEMORY_KEY) ?? '{}') || {};
  } catch {
    return {};
  }
}
export function rememberGame(result) {
  const m = gameMemory();
  const history = [{ at: Date.now(), ms: result.durationMs ?? null, moves: result.moves ?? null, crowned: Boolean(result.crowned), rank: result.rank ?? null, ok: result.ok !== false }, ...(m.history ?? [])].slice(0, 30);
  const best = result.durationMs && (!m.bestMs || result.durationMs < m.bestMs) ? result.durationMs : m.bestMs ?? null;
  safeSet(MEMORY_KEY, JSON.stringify({ ...m, history, bestMs: best, crowns: (m.crowns ?? 0) + (result.crowned ? 1 : 0) }));
}

export const formatMs = (ms) => (ms == null ? '—' : `${(ms / 1000).toFixed(2)}s`);

if (token) refreshWallet();

// The edition's coin rules (welcome amount, packs, prices), from /api/state,
// so they can be shown before a wallet exists.
export function setCoinRules(coins, game) {
  if (coins && JSON.stringify(coins) !== JSON.stringify(state.coinRules)) emit({ coinRules: coins, gameRules: game ?? state.gameRules });
}
export const coinsFor = (cents, coins = state.wallet?.coins ?? state.coinRules) => (coins ? Math.ceil(cents / coins.centsPerCoin) : null);
