/**
 * Password / PIN hashing.
 *
 * Format: scrypt$N$r$p$salt_b64$key_b64
 *   N = CPU/memory cost (2^15 = 32768), r = 8, p = 1, salt = 16 bytes, key = 32 bytes.
 *
 * scrypt (not bcrypt) because it ships with node:crypto — no native dependency
 * to rebuild for Electron. Runtime cost at N=2^15 is ~60-100ms on a typical
 * retail PC: slow enough to matter to an attacker, fast enough that a cashier
 * logging in between customers does not notice.
 *
 * Verification is constant-time to avoid leaking hash prefixes via timing.
 */
const crypto = require('node:crypto');

const SCRYPT_N = 32768; // 2^15
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
// scrypt needs ~128 * N * r bytes = 32 MB here; must be raised from the 32MB default.
const MAX_MEM = 64 * 1024 * 1024;

function scryptAsync(password, salt, keylen, opts) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, opts, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}

/**
 * @param {string} password
 * @returns {Promise<string>} scrypt$N$r$p$salt_b64$key_b64
 */
async function hashPassword(password) {
  assertString(password, 'password');
  const salt = crypto.randomBytes(SALT_BYTES);
  const key = await scryptAsync(password, salt, KEY_BYTES, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: MAX_MEM });
  return ['scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('base64'), key.toString('base64')].join('$');
}

/**
 * @param {string} stored   the value from the DB (password_hash / pin_hash)
 * @param {string} candidate plaintext attempt
 * @returns {Promise<boolean>}
 */
async function verifyPassword(stored, candidate) {
  if (typeof stored !== 'string' || typeof candidate !== 'string' || !stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  if (salt.length === 0 || expected.length === 0) return false;

  let derived;
  try {
    derived = await scryptAsync(candidate, salt, expected.length, { N, r, p, maxmem: MAX_MEM });
  } catch {
    return false;
  }
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

/**
 * PIN hashing uses the same primitive. PINs are short (4-6 digits) so scrypt's
 * cost is the only thing preventing an offline brute force — keep N high.
 */
async function hashPin(pin) {
  const normalized = normalizePin(pin);
  return hashPassword(normalized);
}

async function verifyPin(storedHash, pin) {
  return verifyPassword(storedHash, normalizePin(pin));
}

/** PINs are digits only; strip spaces/dashes users type on numeric keypads. */
function normalizePin(pin) {
  return String(pin ?? '').replace(/\D/g, '');
}

function assertString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  hashPin,
  verifyPin,
  normalizePin,
  SCRYPT_N,
  SCRYPT_R,
  SCRYPT_P,
};
