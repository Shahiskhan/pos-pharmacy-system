/**
 * Append-only, hash-chained audit log.
 *
 * Each row stores prev_hash (the previous row's row_hash) and row_hash =
 * sha256(canonical(row_without_hashes)). Chains are kept PER USER PER DAY,
 * rooted at 'GENESIS'; this limits write contention to one chain segment while
 * still making tampering detectable.
 *
 * Why per-user-day instead of one global chain: a single global chain forces
 * every IPC write in the app to serialize on the last audit row, which on a
 * busy counter becomes the billing bottleneck. Per-user-day keeps the
 * property that matters (nobody can edit or delete a row — enforced by SQL
 * triggers — and any re-hash breaks the chain for that actor/date).
 */
const crypto = require('node:crypto');
const { getDb } = require('../db/connection');
const { newId } = require('../db/ids');

const GENESIS = 'GENESIS';

/** Deterministic JSON: sorted keys, no undefined, stable for hashing. */
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/** UTC day bucket used to segment chains. */
function dayOf(isoOrDate) {
  const d = isoOrDate ? new Date(isoOrDate) : new Date();
  return d.toISOString().slice(0, 10);
}

/**
 * Compute the deterministic part of a row that gets hashed.
 * Intentionally excludes prev_hash / row_hash and the autoincrement id.
 * @param {object} row
 */
function hashableRow(row) {
  return {
    occurred_at: row.occurred_at,
    user_id: row.user_id ?? null,
    username: row.username ?? null,
    role_code: row.role_code ?? null,
    branch_id: row.branch_id ?? null,
    terminal_id: row.terminal_id ?? null,
    module: row.module,
    action: row.action,
    entity_type: row.entity_type ?? null,
    entity_id: row.entity_id ?? null,
    severity: row.severity || 'info',
    details_json: row.details_json ?? null,
  };
}

/**
 * Append an audit entry.
 *
 * @param {{
 *   userId?: string|null, username?: string|null, roleCode?: string|null,
 *   branchId?: string|null, terminalId?: string|null,
 *   module: string, action: string,
 *   entityType?: string|null, entityId?: string|null,
 *   severity?: 'info'|'warn'|'critical',
 *   details?: object|null
 * }} entry
 * @returns {{ id: number, row_hash: string }}
 */
function log(entry) {
  const db = getDb();
  const occurredAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const row = {
    occurred_at: occurredAt,
    user_id: entry.userId ?? null,
    username: entry.username ?? null,
    role_code: entry.roleCode ?? null,
    branch_id: entry.branchId ?? null,
    terminal_id: entry.terminalId ?? null,
    module: entry.module,
    action: entry.action,
    entity_type: entry.entityType ?? null,
    entity_id: entry.entityId ?? null,
    severity: entry.severity || 'info',
    details_json: entry.details ? canonical(entry.details) : null,
  };

  const insert = db.prepare(`
    INSERT INTO audit_logs
      (occurred_at, user_id, username, role_code, branch_id, terminal_id,
       module, action, entity_type, entity_id, severity, details_json,
       prev_hash, row_hash)
    VALUES
      (@occurred_at, @user_id, @username, @role_code, @branch_id, @terminal_id,
       @module, @action, @entity_type, @entity_id, @severity, @details_json,
       @prev_hash, @row_hash)
  `);

  const write = db.transaction(() => {
    const dayStart = `${dayOf(occurredAt)} 00:00:00`;
    const prev = db
      .prepare(
        `SELECT row_hash FROM audit_logs
          WHERE COALESCE(user_id,'') = COALESCE(?,'')
            AND occurred_at >= ?
          ORDER BY id DESC LIMIT 1`
      )
      .get(row.user_id, dayStart);

    const prevHash = prev ? prev.row_hash : GENESIS;
    const rowHash = sha256(`${prevHash}|${canonical(hashableRow(row))}`);

    const info = insert.run({ ...row, prev_hash: prevHash, row_hash: rowHash });
    return { id: Number(info.lastInsertRowid), row_hash: rowHash };
  });

  return write();
}

/**
 * Verify chain integrity for a user (or all users) between two ids.
 * Detects: modified fields, deleted rows (broken prev link), replaced hashes.
 *
 * @param {number} [fromId=1]
 * @param {number} [toId=Number.MAX_SAFE_INTEGER]
 * @param {string|null} [userId=null]  null = all users
 * @returns {{ ok: boolean, checked: number, brokenAt: number|null, reason: string|null }}
 */
function verifyChain(fromId = 1, toId = Number.MAX_SAFE_INTEGER, userId = null) {
  const db = getDb();
  const rows = userId
    ? db
      .prepare(
        `SELECT * FROM audit_logs
            WHERE id BETWEEN ? AND ? AND COALESCE(user_id,'') = COALESCE(?,'')
            ORDER BY id ASC`
      )
      .all(fromId, toId, userId)
    : db.prepare('SELECT * FROM audit_logs WHERE id BETWEEN ? AND ? ORDER BY id ASC').all(fromId, toId);

  const lastHashByUserDay = new Map();
  let checked = 0;

  for (const row of rows) {
    checked += 1;
    const key = `${row.user_id || ''}|${dayOf(row.occurred_at.replace(' ', 'T') + 'Z')}`;
    const expectedPrev = lastHashByUserDay.has(key) ? lastHashByUserDay.get(key) : GENESIS;

    if (row.prev_hash !== expectedPrev) {
      return { ok: false, checked, brokenAt: row.id, reason: 'prev_hash mismatch (row inserted or deleted)' };
    }

    const expectedHash = sha256(`${row.prev_hash}|${canonical(hashableRow(row))}`);
    if (expectedHash !== row.row_hash) {
      return { ok: false, checked, brokenAt: row.id, reason: 'row_hash mismatch (row modified)' };
    }

    lastHashByUserDay.set(key, row.row_hash);
  }

  return { ok: true, checked, brokenAt: null, reason: null };
}

/** Convenience for IPC denials / security events. */
function security(entry) {
  return log({ ...entry, severity: entry.severity || 'warn' });
}

module.exports = { log, security, verifyChain, canonical, sha256, GENESIS, newId };
