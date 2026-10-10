import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// No accounts: each ad gets a private 256-bit owner code that only the
// buyer's browser holds. The database stores just its SHA-256 hash. The code
// unlocks owner-only actions, like relegating a dethroned throne ad.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const hash = (token) => createHash('sha256').update(token).digest('hex');

export function newOwnerToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hash(token) };
}

export function isOwner(bid, token) {
  if (!bid?.ownerHash || typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return false;
  const a = Buffer.from(hash(token), 'hex');
  const b = Buffer.from(bid.ownerHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
