// The Throne Credits wallet is a secret token kept in this browser.
// Storage can be blocked (private mode), so every access is guarded.
const KEY = 'throne.walletToken';

export function getWalletToken() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setWalletToken(token) {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    // Credits still work for this page view; they just won't survive a reload.
  }
}
