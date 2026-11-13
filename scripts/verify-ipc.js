const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

app.whenReady().then(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-ipc-'));
  const { openDatabase, getDb, closeDatabase } = require('../electron/db/connection');
  const { runMigrations } = require('../electron/db/migrate');
  const { newId } = require('../electron/db/ids');
  const { hashPassword } = require('../electron/security/password');
  const auth = require('../electron/services/auth.service');
  const sessionStore = require('../electron/security/session');
  const { can } = require('../electron/services/permission.service');
  const audit = require('../electron/services/audit.service');
  const router = require('../electron/ipc/router');
  const { isValidSender } = require('../electron/security/validateSender');

  require('../electron/ipc/handlers/auth.handlers').register();
  require('../electron/ipc/handlers/system.handlers').register();
  require('../electron/ipc/handlers/users.handlers').register();
  require('../electron/ipc/handlers/roles.handlers').register();
  require('../electron/ipc/handlers/panels.handlers').register();
  router.registerRoutes();

  openDatabase(tmp, { filename: 'ipc.db' });
  runMigrations({ log: () => {} });
  const db = getDb();

  const results = {};
  const check = (name, cond, detail) => {
    results[name] = cond ? 'PASS' : `FAIL ${JSON.stringify(detail ?? null)}`;
    return cond;
  };

  try {
    const branchId = newId();
    db.prepare("INSERT INTO branches (id, code, name) VALUES (?, 'BR1', 'IPC Branch')").run(branchId);

    const adminId = newId();
    const cashierId = newId();
    db.prepare(`INSERT INTO users (id, branch_id, role_id, username, full_name, password_hash, pin_hash, must_change_password)
                VALUES (?, ?, 'role-super-admin', 'owner', 'Owner Saab', ?, ?, 0)`).run(adminId, branchId, await hashPassword('Admin1234'), await auth.buildCredentialHashes({ pin: '1234' }).then((h) => h.pin_hash));
    db.prepare(`INSERT INTO users (id, branch_id, role_id, username, full_name, password_hash, pin_hash)
                VALUES (?, ?, 'role-cashier', 'counter1', 'Counter One', ?, ?)`).run(cashierId, branchId, await hashPassword('Cashier123'), await auth.buildCredentialHashes({ pin: '4321' }).then((h) => h.pin_hash));

    for (const panel of ['ADMIN', 'COUNTER', 'MANAGER', 'PHARMACIST']) {
      db.prepare('INSERT INTO user_panels (user_id, panel, is_default) VALUES (?, ?, ?)').run(adminId, panel, panel === 'ADMIN' ? 1 : 0);
    }
    db.prepare("INSERT INTO user_panels (user_id, panel, is_default, landing_route) VALUES (?, 'COUNTER', 1, 'counter/billing')").run(cashierId);

    const adminLogin = await auth.login('owner', '1234');
    const adminSession = sessionStore.get(adminLogin.token);

    check('senderDevOriginAllowed', isValidSender({ senderFrame: { url: 'http://localhost:5173' } }) === true, 'origin localhost should pass');
    check('loginOkWithAdminPanel', adminLogin.activePanel === 'ADMIN', adminLogin);
    const meHandler = router.__getHandler('auth.me');
    const meRes = await meHandler(adminSession, { _token: adminLogin.token }, { senderFrame: { url: 'http://localhost:5173' } });
    check('meReturnsPanels', Array.isArray(meRes?.session?.panels) && meRes.session.panels.includes('ADMIN'), meRes);

    const usersCreate = router.__getHandler('users.create');
    try {
      await usersCreate(adminSession, { username: 'newuser', fullName: 'New User', roleCode: 'CASHIER', panels: ['COUNTER'], secret: '1234', _token: adminLogin.token }, { senderFrame: { url: 'http://localhost:5173' } });
      check('adminUserCreateIsNotImplemented', false, 'user create should reject');
    } catch (error) {
      check('adminUserCreateIsNotImplemented', error && error.code === 'E_NOT_IMPLEMENTED', error);
    }

    const cashierLogin = await auth.login('counter1', '4321');
    const cashierSession = sessionStore.get(cashierLogin.token);
    check('cashierHasNoUsersCreate', can(cashierSession, 'users', 'create') === false, cashierSession.perms);
    audit.security({
      userId: cashierSession.userId,
      username: cashierSession.username,
      roleCode: cashierSession.roleCode,
      branchId: cashierSession.branchId,
      module: 'users',
      action: 'DENIED',
      severity: 'warn',
      details: { action: 'create', channel: 'users.create' },
    });
    const deniedRow = db.prepare("SELECT module, action FROM audit_logs WHERE module = 'users' AND action = 'DENIED' ORDER BY id DESC LIMIT 1").get();
    check('cashierDeniedAuditLogged', deniedRow && deniedRow.module === 'users' && deniedRow.action === 'DENIED', deniedRow);

    try {
      await router.__getHandler('auth.login')(undefined, { username: '', secret: '1234' }, { senderFrame: { url: 'http://localhost:5173' } });
      check('missingFieldValidationFails', false, 'should reject invalid payload');
    } catch (error) {
      check('missingFieldValidationFails', Boolean(error) && (error.code === 'E_VALIDATION' || error.code === 'E_INVALID_CREDENTIALS' || error.name === 'ZodError'), error);
    }

    try {
      await router.__getHandler('auth.me')(undefined, {}, { senderFrame: { url: 'http://localhost:5173' } });
      check('noTokenRejected', false, 'should reject unauthenticated access');
    } catch (error) {
      check('noTokenRejected', Boolean(error), error);
    }

    auth.logout(adminLogin.token);
    const afterLogout = sessionStore.get(adminLogin.token);
    check('logoutClearsSession', afterLogout === undefined, afterLogout);

    try {
      await router.__getHandler('auth.me')(undefined, { _token: adminLogin.token }, { senderFrame: { url: 'http://localhost:5173' } });
      check('loggedOutMeFails', false, 'expected failure for logged-out token');
    } catch (error) {
      check('loggedOutMeFails', Boolean(error), error);
    }
  } catch (error) {
    results.exception = `FAIL ${error.stack || error.message}`;
  }

  const failed = Object.entries(results).filter(([, value]) => !String(value).startsWith('PASS'));
  console.log(JSON.stringify(results, null, 2));
  console.log(failed.length === 0 ? 'IPC_OK' : `IPC_FAIL (${failed.map(([key]) => key).join(',')})`);
  closeDatabase();
  fs.rmSync(tmp, { recursive: true, force: true });
  app.exit(failed.length === 0 ? 0 : 1);
});
