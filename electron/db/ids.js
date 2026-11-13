/**
 * ID generation for the POS database.
 * Primary keys are TEXT UUIDs so rows can be created offline on any terminal
 * and synced to the cloud later without collision.
 *
 * Uses UUIDv7 (time-ordered) when available (Node >= 20 has crypto.randomUUID
 * only for v4), so we build v7 manually: 48-bit ms timestamp + randomness.
 * Time-ordered keys keep B-tree inserts sequential and make created_at ranges
 * cheap to scan.
 */
const crypto = require('node:crypto');

/**
 * @returns {string} UUIDv7, e.g. "0192f4c3-8a1b-7c2d-9e3f-0123456789ab"
 */
function newId() {
  const bytes = crypto.randomBytes(16);
  const ms = BigInt(Date.now());

  // 48-bit big-endian timestamp (bytes 0..5)
  bytes[0] = Number((ms >> 40n) & 0xffn);
  bytes[1] = Number((ms >> 32n) & 0xffn);
  bytes[2] = Number((ms >> 24n) & 0xffn);
  bytes[3] = Number((ms >> 16n) & 0xffn);
  bytes[4] = Number((ms >> 8n) & 0xffn);
  bytes[5] = Number(ms & 0xffn);

  // Version 7 (bytes 6 high nibble)
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  // RFC 4122 variant (bytes 8 top two bits)
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Human-readable document number, e.g. nextDocNo('INV', 'P1', 41) -> 'P1-INV-000041'.
 * Sequencing is done inside the caller's transaction against a counter row.
 * @param {string} prefix   e.g. 'P1'
 * @param {string} kind     e.g. 'INV' | 'RET' | 'PO'
 * @param {number} seq      1-based sequence
 * @param {number} [pad]
 */
function formatDocNo(prefix, kind, seq, pad = 6) {
  return `${prefix}-${kind}-${String(seq).padStart(pad, '0')}`;
}

module.exports = { newId, formatDocNo };
