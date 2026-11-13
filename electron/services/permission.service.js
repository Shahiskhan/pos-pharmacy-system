/**
 * Permission resolution. The ONLY place that answers "may this session do X?".
 *
 * Precedence (highest first), per the audit:
 *   1. explicit user DENY      (user_permission_overrides.effect = 'deny')
 *   2. explicit user ALLOW     (user_permission_overrides.effect = 'allow')
 *   3. role grant              (role_permissions)
 *   4. module wildcard         ('module.*' inside the role grant set)
 *   5. otherwise false
 *
 * The renderer never runs this logic — it only receives the flattened array
 * of granted "module.action" strings (for hiding UI). Main re-checks every
 * IPC call. UI hiding is cosmetics; this function is the security boundary.
 */
const { getDb } = require('../db/connection');

/** @typedef {{ perms: Set<string>, denied: Set<string>, allowed: Set<string>, roleId?: string }} PermSession */

function materializePermissions(userId, roleId) {
  const db = getDb();

  const roleRows = db
    .prepare(
      `SELECT p.module, p.action
         FROM role_permissions rp
         JOIN permissions p ON p.id = rp.permission_id
        WHERE rp.role_id = ?`
    )
    .all(roleId);

  const overrides = db
    .prepare(
      `SELECT p.module, p.action, o.effect
         FROM user_permission_overrides o
         JOIN permissions p ON p.id = o.permission_id
        WHERE o.user_id = ?`
    )
    .all(userId);

  const perms = new Set(roleRows.map((r) => `${r.module}.${r.action}`));
  const allowed = new Set();
  const denied = new Set();

  for (const o of overrides) {
    const key = `${o.module}.${o.action}`;
    if (o.effect === 'deny') denied.add(key);
    else allowed.add(key);
  }

  return { perms, allowed, denied };
}

/** Panels assigned to a user, with the default one first. */
function panelsFor(userId) {
  return getDb()
    .prepare(
      `SELECT panel, is_default, landing_route
         FROM user_panels
        WHERE user_id = ?
        ORDER BY is_default DESC, panel ASC`
    )
    .all(userId);
}

function roleLimitsFor(roleId) {
  const row = getDb().prepare('SELECT * FROM role_limits WHERE role_id = ?').get(roleId);
  return (
    row || {
      role_id: roleId,
      max_discount_pct: 0,
      max_discount_amount: 0,
      max_cash_refund: 0,
      max_stock_adjust_qty: 0,
      can_view_other_users_data: 0,
    }
  );
}

/**
 * @param {PermSession} session
 * @param {string} module e.g. 'users'
 * @param {string} action e.g. 'create'
 * @returns {boolean}
 */
function can(session, module, action) {
  if (!session || !session.perms) return false;
  const key = `${module}.${action}`;

  if (session.denied && session.denied.has(key)) return false;
  if (session.allowed && session.allowed.has(key)) return true;
  if (session.perms.has(key)) return true;
  if (session.perms.has(`${module}.*`)) return true;
  return false;
}

/**
 * Any grant inside a module — used to decide whether a sidebar section exists.
 * @param {PermSession} session
 * @param {string} module
 */
function canAny(session, module) {
  if (!session || !session.perms) return false;
  const prefix = `${module}.`;
  const listed = [...session.perms].some((p) => p.startsWith(prefix));
  const explicitlyAllowed = session.allowed && [...session.allowed].some((p) => p.startsWith(prefix));
  const allDenied = [...session.perms, ...(session.allowed || [])]
    .filter((p) => p.startsWith(prefix))
    .every((p) => session.denied && session.denied.has(p));
  return (listed || explicitlyAllowed) && !allDenied;
}

/** Flattened, sorted permission array handed to the renderer. */
function effectivePermsArray(session) {
  const merged = new Set([...(session.perms || []), ...(session.allowed || [])]);
  for (const d of session.denied || []) merged.delete(d);
  return [...merged].sort();
}

module.exports = {
  materializePermissions,
  panelsFor,
  roleLimitsFor,
  can,
  canAny,
  effectivePermsArray,
};
