import { createHash, randomBytes } from 'node:crypto';

// Anonymous Throne Credit wallets. The browser keeps a 256-bit random token;
// the database only ever sees its SHA-256 hash, so a DB leak can't be used to
// spend anyone's credits.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export async function findWallet(store, token) {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return null;
  return store.getWalletByHash(hashToken(token));
}

// Returns the caller's wallet, creating one (and a new token) if they have none.
export async function findOrCreateWallet(store, token) {
  const existing = await findWallet(store, token);
  if (existing) return { wallet: existing, newToken: null };
  const newToken = randomBytes(32).toString('base64url');
  return { wallet: await store.createWallet(hashToken(newToken)), newToken };
}
