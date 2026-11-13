// Auth / session / permission / audit integration test.
// Run: electron scripts/verify-auth.js
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

app.whenReady().then(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-auth-'));
  const { openDatabase, getDb, closeDatabase } = require('../electron/db/connection');
  const { runMigrations } = require('../electron/db/migrate');
  const auth = require('../electron/services/auth.service');
  const sessionStore = require('../electron/security/session');
  const perms = require('../electron/services/permission.service');
  const audit = require('../electron/services/audit.service');
  const { newId } = require('../electron/db/ids');
  const { hashPassword, verifyPassword } = require('../electron/security/password');

  openDatabase(tmp, { filename: 'auth.db' });
  runMigrations({ log: () => { } });
  const db = getDb();

  const results = {};
  const check = (name, cond, extra) => {
    results[name] = cond ? 'PASS' : `FAIL ${extra !== undefined ? JSON.stringify(extra) : ''}`;
    return cond;
  };

  try {
    // --- fixtures -----------------------------------------------------------
    const branchId = newId();
    db.prepare("INSERT INTO branches (id, code, name) VALUES (?, 'BR1', 'Test Branch')").run(branchId);

    const adminHash = await hashPassword('Admin1234');
    const cashierHash = await hashPassword('Cashier123');
    const adminId = newId();
    const cashierId = newId();
    db.prepare(`INSERT INTO users (id, branch_id, role_id, username, full_name, password_hash, pin_hash, must_change_password)
                VALUES (?, ?, 'role-super-admin', 'owner', 'Owner Saab', ?, ?, 0)`).run(adminId, branchId, adminHash, await auth.buildCredentialHashes({ pin: '1234' }).then((h) => h.pin_hash));
    db.prepare(`INSERT INTO users (id, branch_id, role_id, username, full_name, password_hash, pin_hash)
                VALUES (?, ?, 'role-cashier', 'counter1', 'Counter One', ?, ?)`).run(cashierId, branchId, cashierHash, await auth.buildCredentialHashes({ pin: '4321' }).then((h) => h.pin_hash));
    for (const panel of ['ADMIN', 'COUNTER', 'MANAGER', 'PHARMACIST']) {
      db.prepare('INSERT INTO user_panels (user_id, panel, is_default) VALUES (?, ?, ?)').run(adminId, panel, panel === 'ADMIN' ? 1 : 0);
    }
    db.prepare("INSERT INTO user_panels (user_id, panel, is_default, landing_route) VALUES (?, 'COUNTER', 1, 'counter/billing')").run(cashierId);

    // --- hashing ------------------------------------------------------------
    const h = await hashPassword('s3cret-Pass');
    check('hashFormat', /^scrypt\$32768\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/.test(h), h);
    check('verifyCorrect', (await verifyPassword(h, 's3cret-Pass')) === true);
    check('verifyWrong', (await verifyPassword(h, 's3cret-Pas')) === false);
    check('noPlaintextInHash', !h.includes('s3cret'));

    // --- login by PIN -------------------------------------------------------
    const adminLogin = await auth.login('owner', '1234');
    check('adminLoginToken', typeof adminLogin.token === 'string' && adminLogin.token.length > 40);
    check('adminPanels', adminLogin.panels.length === 4, adminLogin.panels);
    check('adminDefaultPanel', adminLogin.defaultPanel === 'ADMIN', adminLogin.defaultPanel);
    check('adminPermsHasUserCreate', adminLogin.effectivePerms.includes('users.create'));
    check('noHashesLeaked', !JSON.stringify(adminLogin).includes('scrypt$'), Object.keys(adminLogin));
    check('sessionPersisted', db.prepare('SELECT count(*) c FROM user_sessions WHERE id = ? AND revoked_at IS NULL').get(adminLogin.token).c === 1);

    // --- login by password --------------------------------------------------
    const cashierLogin = await auth.login('counter1', 'Cashier123');
    check('cashierLoginByPassword', Boolean(cashierLogin.token));
    check('cashierPanelsOnlyCounter', JSON.stringify(cashierLogin.panels) === '["COUNTER"]', cashierLogin.panels);
    check('cashierNoUserCreate', !cashierLogin.effectivePerms.includes('users.create'));
    check('cashierNoCompanyAnalytics', !cashierLogin.effectivePerms.includes('analytics.company'));
    check('cashierDiscountCap2pct', cashierLogin.discountCap.maxDiscountPct === 200, cashierLogin.discountCap);

    // --- permission matrix --------------------------------------------------
    const adminSession = sessionStore.get(adminLogin.token);
    const cashierSession = sessionStore.get(cashierLogin.token);
    check('canAdminCreateUser', perms.can(adminSession, 'users', 'create') === true);
    check('canCashierCreateUser', perms.can(cashierSession, 'users', 'create') === false);
    check('canCashierCreateSale', perms.can(cashierSession, 'sales', 'create') === true);
    check('canAnyAdminUsers', perms.canAny(adminSession, 'users') === true);
    check('canAnyCashierUsers', perms.canAny(cashierSession, 'users') === false);
    check('canAnyCashierSettings', perms.canAny(cashierSession, 'settings') === false);

    // precedence: explicit deny beats role grant
    const permId = db.prepare("SELECT id FROM permissions WHERE module='sales' AND action='create'").get().id;
    db.prepare("INSERT INTO user_permission_overrides (user_id, permission_id, effect) VALUES (?, ?, 'deny')").run(cashierId, permId);
    const reLogin = await auth.login('counter1', '4321');
    check('explicitDenyWins', perms.can(sessionStore.get(reLogin.token), 'sales', 'create') === false);
    check('explicitDenyRemovedFromArray', !reLogin.effectivePerms.includes('sales.create'));
    db.prepare('DELETE FROM user_permission_overrides WHERE user_id = ?').run(cashierId);

    // --- lockout ------------------------------------------------------------
    let lockoutMsg = '';
    for (let i = 0; i < 5; i += 1) {
      try { await auth.login('counter1', '0000'); } catch (e) { lockoutMsg = e.message; }
    }
    const lockedRow = db.prepare('SELECT locked_until FROM users WHERE id = ?').get(cashierId);
    check('lockoutAfter5', Boolean(lockedRow.locked_until), lockedRow);
    check('lockoutMessage', /locked/i.test(lockoutMsg), lockoutMsg);
    await auth.login('counter1', 'Cashier123').then(() => { results.lockedRejectsEvenValid = 'FAIL'; }).catch((e) => { check('lockedRejectsEvenValid', e.code === 'E_ACCOUNT_LOCKED'); });

    // clear lock for further tests
    db.prepare('UPDATE users SET locked_until = NULL, failed_logins = 0 WHERE id = ?').run(cashierId);
    await auth.login('counter1', 'Cashier123').catch(() => { });

    // --- enumeration resistance --------------------------------------------
    const unknownErr = await auth.login('nobody', '1234').catch((e) => e);
    const wrongErr = await auth.login('owner', '9999').catch((e) => e);
    check('sameCodeForUnknownAndWrong', unknownErr.code === wrongErr.code && unknownErr.message === wrongErr.message);

    // --- change password ----------------------------------------------------
    const cp = await auth.changePassword(cashierId, 'Cashier123', 'NewPass123', { keepToken: reLogin.token });
    check('changePasswordOk', cp.ok === true);
    const oldFails = await auth.login('counter1', 'Cashier123').catch((e) => e);
    check('oldPasswordRejected', oldFails.code === 'E_INVALID_CREDENTIALS');
    const newWorks = await auth.login('counter1', 'NewPass123').catch((e) => e);
    check('newPasswordWorks', Boolean(newWorks.token));
    const weakRejected = await auth.changePassword(cashierId, 'NewPass123', 'short').catch((e) => e);
    check('weakPasswordRejected', weakRejected.code === 'E_WEAK_PASSWORD');
    check('mustChangeCleared', db.prepare('SELECT must_change_password m FROM users WHERE id=?').get(cashierId).m === 0);

    // --- hydrate after restart ---------------------------------------------
    const before = sessionStore.count();
    const restored = sessionStore.hydrate();
    check('hydrateRestoresSessions', restored >= before, { restored, before });

    // --- sweep (idle expiry) ------------------------------------------------
    const s = sessionStore.get(adminLogin.token);
    s.lastSeen = Date.now() - 31 * 60 * 1000;
    const swept = sessionStore.sweep();
    check('sweepExpiresIdle', swept >= 1 && !sessionStore.get(adminLogin.token));
    check('sweepAuditedRevocation', db.prepare("SELECT revoked_reason r FROM user_sessions WHERE id=?").get(adminLogin.token).r === 'idle_timeout');

    // --- logout -------------------------------------------------------------
    const tok = newWorks.token;
    auth.logout(tok);
    check('logoutClearsMemory', sessionStore.get(tok) === undefined);
    check('logoutPersisted', db.prepare('SELECT revoked_at FROM user_sessions WHERE id=?').get(tok).revoked_at !== null);

    // --- audit chain --------------------------------------------------------
    const chain = audit.verifyChain();
    check('auditChainValid', chain.ok === true, chain);
    const actions = db.prepare('SELECT action, count(*) c FROM audit_logs GROUP BY action').all();
    check('auditHasLogin', actions.some((a) => a.action === 'LOGIN' && a.c > 0));
    check('auditHasLoginFailed', actions.some((a) => a.action === 'LOGIN_FAILED' && a.c >= 5), actions);
    check('auditHasLogout', actions.some((a) => a.action === 'LOGOUT'));
    // Only user-controlled text fields can leak a secret. Never scan UUIDs.
    const auditText = db
      .prepare('SELECT username, details_json, entity_id FROM audit_logs')
      .all()
      .map((r) => `${r.username || ''}|${r.details_json || ''}`)
      .join('\n');
    check('auditNeverStoresSecrets', !/1234|4321|Admin1234|Cashier123|NewPass123/.test(auditText), auditText.slice(0, 400));

    // tamper detection: the triggers block UPDATE/DELETE, so simulate tampering
    // the way an attacker with file access would (drop the guard, edit, re-hash).
    const tamperTarget = db.prepare("SELECT id FROM audit_logs WHERE action='LOGIN' LIMIT 1").get();
    db.exec('DROP TRIGGER trg_audit_no_update');
    db.prepare("UPDATE audit_logs SET details_json='{\"x\":1}' WHERE id=?").run(tamperTarget.id);
    const broken = audit.verifyChain();
    check('auditTamperDetected', broken.ok === false && broken.brokenAt === tamperTarget.id, broken);
  } catch (err) {
    results.exception = `FAIL ${err.stack}`;
  }

  const failed = Object.entries(results).filter(([, v]) => v !== 'PASS');
  console.log(JSON.stringify(results, null, 2));
  closeDatabase();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failed.length === 0 ? 'AUTH_OK' : `AUTH_FAIL (${failed.map(([k]) => k).join(',')})`);
  app.exit(failed.length === 0 ? 0 : 1);
});
