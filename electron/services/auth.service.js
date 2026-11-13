/**
 * Authentication: credential verification, lockout, session lifecycle.
 *
 * Login accepts username + PIN (primary flow at a retail counter: fast, typed
 * on a numeric pad) and falls back to username + password for admin accounts.
 * The `secret` field is tried as a PIN first, then as a password — the caller
 * does not need to say which, because both are scrypt hashes and both are
 * verified constant-time.
 *
 * Security properties enforced here:
 *  - No user enumeration: a missing user and a wrong secret take a comparable
 *    code path and return the same error code (E_INVALID_CREDENTIALS).
 *  - 5 consecutive failures lock the account for 15 minutes (persisted, so it
 *    survives an app restart; in-memory-only lockouts are trivially bypassed).
 *  - Locked/disabled users are rejected even with a valid secret.
 *  - On success the failure counter is reset and a session is created.
 *  - The PIN/password never appears in logs or audit rows.
 */
const { getDb } = require('../db/connection');
const { hashPassword, verifyPassword, hashPin, verifyPin } = require('../security/password');
const sessionStore = require('../security/session');
const audit = require('./audit.service');
const { effectivePermsArray } = require('./permission.service');

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

/** Error carrying a stable machine code the IPC layer maps to `details.code`. */
class AuthError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

function nowSql() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function findUserByUsername(username) {
  return getDb()
    .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE AND deleted_at IS NULL')
    .get(String(username || '').trim());
}

function daysFromNowSql(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Verify a login attempt.
 *
 * @param {string} username
 * @param {string} secret  PIN (4-6 digits) or password
 * @param {{ terminalId?: string|null, host?: string }} [opts]
 * @returns {Promise<{
 *   token: string, user: object, panels: string[], activePanel: string|null,
 *   defaultPanel: string|null, effectivePerms: string[], discountCap: object,
 *   mustChangePassword: boolean
 * }>}
 */
async function login(username, secret, opts = {}) {
  const normalizedUser = String(username || '').trim();
  if (!normalizedUser || !secret) throw new AuthError('E_INVALID_CREDENTIALS', 'Invalid username or PIN.');

  const user = findUserByUsername(normalizedUser);

  if (!user) {
    // Burn comparable time so a missing username is not obviously faster.
    await verifyPassword(
      'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      String(secret)
    );
    audit.security({
      module: 'AUTH',
      action: 'LOGIN_FAILED',
      severity: 'warn',
      details: { username: normalizedUser, reason: 'unknown_user' },
    });
    throw new AuthError('E_INVALID_CREDENTIALS', 'Invalid username or PIN.');
  }

  if (user.status === 'locked') {
    audit.security({
      userId: user.id, username: user.username, roleCode: null, branchId: user.branch_id,
      module: 'AUTH', action: 'LOGIN_BLOCKED', severity: 'warn',
      details: { reason: 'account_locked' },
    });
    throw new AuthError('E_ACCOUNT_LOCKED', 'Account is locked. Contact an administrator.');
  }

  if (user.status === 'disabled') {
    audit.security({
      userId: user.id, username: user.username, branchId: user.branch_id,
      module: 'AUTH', action: 'LOGIN_BLOCKED', severity: 'warn',
      details: { reason: 'account_disabled' },
    });
    throw new AuthError('E_ACCOUNT_DISABLED', 'Account is disabled.');
  }

  if (user.locked_until && user.locked_until > nowSql()) {
    audit.security({
      userId: user.id, username: user.username, branchId: user.branch_id,
      module: 'AUTH', action: 'LOGIN_BLOCKED', severity: 'warn',
      details: { reason: 'temporarily_locked', until: user.locked_until },
    });
    throw new AuthError('E_ACCOUNT_LOCKED', `Too many failed attempts. Try again after ${user.locked_until} UTC.`);
  }

  const secretStr = String(secret);
  let valid = false;
  if (user.pin_hash && /^\d{4,8}$/.test(secretStr.replace(/\s/g, ''))) {
    valid = await verifyPin(user.pin_hash, secretStr);
  }
  if (!valid) {
    valid = await verifyPassword(user.password_hash, secretStr);
  }

  if (!valid) {
    const failures = Number(user.failed_logins || 0) + 1;
    const lock = failures >= MAX_FAILED_LOGINS;
    getDb()
      .prepare('UPDATE users SET failed_logins = ?, locked_until = ?, updated_at = ? WHERE id = ?')
      .run(lock ? 0 : failures, lock ? daysFromNowSql(LOCK_MINUTES) : user.locked_until || null, nowSql(), user.id);

    audit.security({
      userId: user.id, username: user.username, branchId: user.branch_id,
      module: 'AUTH', action: 'LOGIN_FAILED', severity: 'warn',
      details: { reason: 'bad_secret', attempt: failures, locked: lock },
    });

    throw new AuthError(
      'E_INVALID_CREDENTIALS',
      lock ? `Too many failed attempts. Account locked for ${LOCK_MINUTES} minutes.` : 'Invalid username or PIN.'
    );
  }

  // Success: reset the counter, then create the session.
  getDb()
    .prepare("UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?")
    .run(nowSql(), nowSql(), user.id);

  const { session, token } = sessionStore.create(user, {
    terminalId: opts.terminalId || null,
    host: opts.host || null,
  });

  audit.log({
    userId: user.id,
    username: user.username,
    roleCode: session.roleCode,
    branchId: session.branchId,
    terminalId: session.terminalId,
    module: 'AUTH',
    action: 'LOGIN',
    details: { panel: session.activePanel, panels: [...session.panels] },
  });

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      roleCode: session.roleCode,
      branchId: session.branchId,
      phone: user.phone,
      pmpcLicense: user.pmpc_license,
    },
    panels: [...session.panels],
    activePanel: session.activePanel,
    defaultPanel: session.defaultPanel,
    effectivePerms: effectivePermsArray(session),
    discountCap: session.discountCap,
    mustChangePassword: session.mustChangePassword,
  };
}

/**
 * Revoke a session.
 * @param {string} token
 * @param {{ reason?: string }} [opts]
 */
function logout(token, opts = {}) {
  const session = sessionStore.get(token);
  sessionStore.revoke(token, opts.reason || 'logout');
  if (session) {
    audit.log({
      userId: session.userId,
      username: session.username,
      roleCode: session.roleCode,
      branchId: session.branchId,
      module: 'AUTH',
      action: 'LOGOUT',
      details: { reason: opts.reason || 'logout' },
    });
  }
  return { ok: true };
}

/** Validate password policy: >= 8 chars, at least one letter and one digit. */
function assertPasswordPolicy(password) {
  const pw = String(password || '');
  if (pw.length < 8) throw new AuthError('E_WEAK_PASSWORD', 'Password must be at least 8 characters.');
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) {
    throw new AuthError('E_WEAK_PASSWORD', 'Password must contain at least one letter and one digit.');
  }
  if (pw.length > 200) throw new AuthError('E_WEAK_PASSWORD', 'Password is too long.');
}

/** Validate PIN policy: 4-8 digits. */
function assertPinPolicy(pin) {
  const digits = String(pin || '').replace(/\D/g, '');
  if (!/^\d{4,8}$/.test(digits)) throw new AuthError('E_WEAK_PIN', 'PIN must be 4 to 8 digits.');
}

/**
 * Change a user's password (self-service, requires the old secret).
 * Revokes every other session for the user as a safety measure.
 *
 * @param {string} userId
 * @param {string} oldPassword
 * @param {string} newPassword
 * @param {{ keepToken?: string, actorSession?: object }} [opts]
 */
async function changePassword(userId, oldPassword, newPassword, opts = {}) {
  const user = getDb().prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL').get(userId);
  if (!user) throw new AuthError('E_NOT_FOUND', 'User not found.');

  const ok = await verifyPassword(user.password_hash, String(oldPassword || ''));
  if (!ok) {
    const wrongOld = await verifyPin(user.pin_hash, String(oldPassword || ''));
    if (!wrongOld) {
      audit.security({
        userId: user.id, username: user.username, branchId: user.branch_id,
        module: 'AUTH', action: 'PASSWORD_CHANGE_FAILED', severity: 'warn',
        details: { reason: 'old_secret_mismatch' },
      });
      throw new AuthError('E_INVALID_CREDENTIALS', 'Current password is incorrect.');
    }
  }

  assertPasswordPolicy(newPassword);
  if (String(oldPassword) === String(newPassword)) {
    throw new AuthError('E_WEAK_PASSWORD', 'New password must differ from the current one.');
  }

  const hash = await hashPassword(String(newPassword));
  getDb()
    .prepare('UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?')
    .run(hash, nowSql(), user.id);

  audit.log({
    userId: user.id,
    username: user.username,
    roleCode: opts.actorSession ? opts.actorSession.roleCode : null,
    branchId: user.branch_id,
    module: 'AUTH',
    action: 'PASSWORD_CHANGED',
    entityType: 'user',
    entityId: user.id,
    severity: 'info',
  });

  // Changing a password invalidates all other sessions; keep the caller's.
  for (const token of listTokensForUser(user.id)) {
    if (token !== opts.keepToken) sessionStore.revoke(token, 'password_changed');
  }

  return { ok: true };
}

/**
 * Admin-initiated PIN/password reset. Requires the caller to hold users.reset_pin.
 * Never returns or logs the new secret.
 */
async function resetCredentials(actorSession, targetUserId, { newPin, newPassword, mustChange = true }) {
  const user = getDb().prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL').get(targetUserId);
  if (!user) throw new AuthError('E_NOT_FOUND', 'User not found.');

  const patch = { pin_hash: user.pin_hash, password_hash: user.password_hash };
  if (newPin !== undefined && newPin !== null && newPin !== '') {
    assertPinPolicy(newPin);
    patch.pin_hash = await hashPin(newPin);
  }
  if (newPassword !== undefined && newPassword !== null && newPassword !== '') {
    assertPasswordPolicy(newPassword);
    patch.password_hash = await hashPassword(newPassword);
  }
  if (patch.pin_hash === user.pin_hash && patch.password_hash === user.password_hash) {
    throw new AuthError('E_VALIDATION', 'Nothing to change: supply a new PIN or password.');
  }

  getDb()
    .prepare(
      `UPDATE users
          SET pin_hash = ?, password_hash = ?, must_change_password = ?,
              failed_logins = 0, locked_until = NULL, updated_at = ?
        WHERE id = ?`
    )
    .run(patch.pin_hash, patch.password_hash, mustChange ? 1 : 0, nowSql(), user.id);

  sessionStore.revokeAllForUser(user.id, 'credentials_reset');

  audit.log({
    userId: actorSession ? actorSession.userId : null,
    username: actorSession ? actorSession.username : null,
    roleCode: actorSession ? actorSession.roleCode : null,
    branchId: user.branch_id,
    module: 'USERS',
    action: 'CREDENTIALS_RESET',
    entityType: 'user',
    entityId: user.id,
    severity: 'critical',
    details: { pinChanged: Boolean(newPin), passwordChanged: Boolean(newPassword) },
  });

  return { ok: true };
}

function listTokensForUser(userId) {
  return getDb()
    .prepare('SELECT id FROM user_sessions WHERE user_id = ? AND revoked_at IS NULL')
    .all(userId)
    .map((r) => r.id);
}

/** Used by the first-run wizard: build a hash for a brand-new admin. */
async function buildCredentialHashes({ pin, password }) {
  const out = {};
  if (pin) out.pin_hash = await hashPin(pin);
  if (password) {
    assertPasswordPolicy(password);
    out.password_hash = await hashPassword(password);
  }
  return out;
}

module.exports = {
  login,
  logout,
  changePassword,
  resetCredentials,
  buildCredentialHashes,
  assertPasswordPolicy,
  assertPinPolicy,
  AuthError,
  MAX_FAILED_LOGINS,
  LOCK_MINUTES,
};
