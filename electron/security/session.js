/**
 * In-memory session store, owned by the main process.
 *
 * The renderer only ever holds an opaque token (and only hands it back to
 * preload, which attaches it to IPC). All authorization state — panels,
 * permissions, branch scope, discount cap — lives here, so a compromised
 * renderer can forge a token but cannot forge a permission: main looks the
 * token up in this Map.
 *
 * Survives a main-process crash because tokens are persisted in user_sessions
 * and re-hydrated on boot by hydrate(). Idle sessions expire after 30 minutes
 * (sweep()). The token itself is a 32-byte random value, never a user id.
 */
const crypto = require('node:crypto');
const { getDb } = require('../db/connection');
const { materializePermissions, panelsFor, roleLimitsFor, effectivePermsArray } = require('../services/permission.service');

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // absolute cap: 12 hours

/**
 * @typedef {{
 *   token: string, userId: string, username: string, fullName: string,
 *   roleId: string, roleCode: string, branchId: string, terminalId: string|null,
 *   panels: Set<string>, defaultPanel: string|null,
 *   perms: Set<string>, allowed: Set<string>, denied: Set<string>,
 *   discountCap: { maxDiscountPct: number, maxDiscountAmount: number, maxCashRefund: number, maxStockAdjustQty: number, canViewOthers: boolean },
 *   startedAt: number, lastSeen: number, mustChangePassword: boolean
 * }} Session
 */

/** @type {Map<string, Session>} */
const sessions = new Map();

function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Build a Session object from DB rows for a user.
 * @param {string} token
 * @param {object} userRow  row from users
 */
function buildSession(token, userRow) {
  const role = userRow.role_id
    ? getDb().prepare('SELECT * FROM roles WHERE id = ?').get(userRow.role_id)
    : null;
  if (!role) throw new Error('User has no valid role.');

  const { perms, allowed, denied } = materializePermissions(userRow.id, role.id);
  const panelRows = panelsFor(userRow.id);
  const limits = roleLimitsFor(role.id);
  const defaultRow = panelRows.find((p) => p.is_default) || panelRows[0] || null;

  return {
    token,
    userId: userRow.id,
    username: userRow.username,
    fullName: userRow.full_name,
    roleId: role.id,
    roleCode: role.code,
    branchId: userRow.branch_id,
    terminalId: userRow.terminal_id || null,
    panels: new Set(panelRows.map((p) => p.panel)),
    defaultPanel: defaultRow ? defaultRow.panel : null,
    perms,
    allowed,
    denied,
    discountCap: {
      maxDiscountPct: limits.max_discount_pct,
      maxDiscountAmount: limits.max_discount_amount,
      maxCashRefund: limits.max_cash_refund,
      maxStockAdjustQty: limits.max_stock_adjust_qty,
      canViewOthers: limits.can_view_other_users_data === 1,
    },
    activePanel: null,
    startedAt: Date.now(),
    lastSeen: Date.now(),
    mustChangePassword: userRow.must_change_password === 1,
  };
}

/**
 * Create and register a session, persisting it to user_sessions.
 * @param {object} userRow
 * @param {{ panel?: string, terminalId?: string|null, host?: string }} [opts]
 * @returns {{ session: Session, token: string }}
 */
function create(userRow, opts = {}) {
  const token = newToken();
  const session = buildSession(token, userRow);
  if (opts.terminalId) session.terminalId = opts.terminalId;

  const panel = opts.panel && session.panels.has(opts.panel) ? opts.panel : session.defaultPanel;
  session.activePanel = panel || null;

  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_MS);

  getDb()
    .prepare(
      `INSERT INTO user_sessions (id, user_id, terminal_id, branch_id, panel, host, created_at, last_seen_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      token,
      userRow.id,
      session.terminalId,
      session.branchId,
      session.activePanel || 'NONE',
      opts.host || null,
      now.toISOString().replace('T', ' ').slice(0, 19),
      now.toISOString().replace('T', ' ').slice(0, 19),
      expires.toISOString().replace('T', ' ').slice(0, 19)
    );

  sessions.set(token, session);
  return { session, token };
}

/** @returns {Session|undefined} */
function get(token) {
  if (!token || typeof token !== 'string') return undefined;
  return sessions.get(token);
}

/** Update lastSeen (called on every authorized IPC call). */
function touch(token) {
  const s = sessions.get(token);
  if (s) s.lastSeen = Date.now();
}

/** Switch active panel (e.g. a pharmacist who also runs the counter). */
function setPanel(token, panel) {
  const s = sessions.get(token);
  if (!s) return null;
  if (!s.panels.has(panel)) throw new Error(`Panel ${panel} is not assigned to this user.`);
  s.activePanel = panel;
  getDb().prepare('UPDATE user_sessions SET panel = ? WHERE id = ?').run(panel, token);
  return s;
}

/** Revoke in memory + DB. */
function revoke(token, reason = 'logout') {
  const s = sessions.get(token);
  sessions.delete(token);
  if (token) {
    getDb()
      .prepare("UPDATE user_sessions SET revoked_at = ?, revoked_reason = ? WHERE id = ? AND revoked_at IS NULL")
      .run(new Date().toISOString().replace('T', ' ').slice(0, 19), reason, token);
  }
  return s || null;
}

/** Revoke every session for a user (deactivate user, change password). */
function revokeAllForUser(userId, reason = 'security') {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  getDb()
    .prepare('UPDATE user_sessions SET revoked_at = ?, revoked_reason = ? WHERE user_id = ? AND revoked_at IS NULL')
    .run(now, reason, userId);
  for (const [token, s] of sessions) {
    if (s.userId === userId) sessions.delete(token);
  }
}

/**
 * Rebuild in-memory sessions from DB after a main-process restart.
 * Only tokens that are unrevoked and unexpired are restored.
 */
function hydrate() {
  const rows = getDb()
    .prepare(
      `SELECT s.id AS token, s.panel, s.terminal_id, u.*
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.revoked_at IS NULL
          AND s.expires_at > datetime('now')
          AND u.status = 'active'
          AND u.deleted_at IS NULL`
    )
    .all();

  let restored = 0;
  for (const row of rows) {
    try {
      const session = buildSession(row.token, { ...row, terminal_id: row.terminal_id });
      session.activePanel = row.panel;
      sessions.set(row.token, session);
      restored += 1;
    } catch {
      // Role removed or user broken: drop the stale session.
      getDb().prepare("UPDATE user_sessions SET revoked_at = datetime('now'), revoked_reason = 'hydrate_failed' WHERE id = ?").run(row.token);
    }
  }
  return restored;
}

/**
 * Expire idle and absolute-timeout sessions. Call on an interval from main.
 * @returns {number} number of sessions removed
 */
function sweep() {
  const now = Date.now();
  let removed = 0;
  for (const [token, s] of sessions) {
    const idle = now - s.lastSeen > IDLE_TIMEOUT_MS;
    const stale = now - s.startedAt > SESSION_TTL_MS;
    if (idle || stale) {
      revoke(token, idle ? 'idle_timeout' : 'absolute_timeout');
      removed += 1;
    }
  }
  return removed;
}

/** Renderer-safe projection. Never leaks hashes or internal Sets. */
function toPublic(session) {
  return {
    userId: session.userId,
    username: session.username,
    fullName: session.fullName,
    roleCode: session.roleCode,
    branchId: session.branchId,
    terminalId: session.terminalId,
    panels: [...session.panels],
    activePanel: session.activePanel || null,
    defaultPanel: session.defaultPanel,
    permissions: effectivePermsArray(session),
    discountCap: session.discountCap,
    mustChangePassword: session.mustChangePassword,
    startedAt: new Date(session.startedAt).toISOString(),
  };
}

function count() {
  return sessions.size;
}

/** Revoke everything (app quit / logout-all). */
function clearAll(reason = 'app_exit') {
  for (const token of [...sessions.keys()]) revoke(token, reason);
}

module.exports = {
  create,
  get,
  touch,
  setPanel,
  revoke,
  revokeAllForUser,
  hydrate,
  sweep,
  toPublic,
  count,
  clearAll,
  IDLE_TIMEOUT_MS,
  SESSION_TTL_MS,
};
