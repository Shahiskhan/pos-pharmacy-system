// Schema smoke test. Run: npx electron scripts/verify-schema.js
// Creates a throwaway DB, applies all migrations, asserts integrity,
// then re-runs migrations to prove idempotency.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const { app } = require('electron');

app.whenReady().then(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-schema-'));
  const { openDatabase, getDb, closeDatabase } = require('../electron/db/connection');
  const { runMigrations, getUserVersion } = require('../electron/db/migrate');

  openDatabase(tmp, { filename: 'test.db' });
  const r1 = runMigrations({ log: () => { } });
  const r2 = runMigrations({ log: () => { } });

  const db = getDb();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
  const indexes = db.prepare("SELECT count(*) c FROM sqlite_master WHERE type='index'").get().c;
  const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_audit%'").all().map((r) => r.name);

  const roles = db.prepare('SELECT code, rank FROM roles ORDER BY rank DESC').all();
  const permCount = db.prepare('SELECT count(*) c FROM permissions').get().c;
  const matrix = db.prepare('SELECT r.code, count(*) c FROM role_permissions rp JOIN roles r ON r.id = rp.role_id GROUP BY r.code ORDER BY c DESC').all();
  const limits = db.prepare('SELECT r.code, l.max_discount_pct FROM role_limits l JOIN roles r ON r.id=l.role_id').all();
  const users = db.prepare('SELECT count(*) c FROM users').get().c;

  const fk = db.pragma('foreign_keys', { simple: true });
  const integrity = db.pragma('integrity_check', { simple: true });
  const fkCheck = db.pragma('foreign_key_check');

  // audit_logs must reject UPDATE and DELETE
  db.prepare("INSERT INTO audit_logs (user_id, module, action, row_hash) VALUES ('u','TEST','X','h')").run();
  const auditId = db.prepare('SELECT last_insert_rowid() id').get().id;
  let updateBlocked = false;
  let deleteBlocked = false;
  try { db.prepare("UPDATE audit_logs SET action='Y' WHERE id=?").run(auditId); } catch (e) { updateBlocked = /append-only/.test(e.message); }
  try { db.prepare('DELETE FROM audit_logs WHERE id=?').run(auditId); } catch (e) { deleteBlocked = /append-only/.test(e.message); }

  // FK must actually bite
  let fkBlocked = false;
  try { db.prepare("INSERT INTO terminals (id,branch_id,code) VALUES ('t1','nope','T')").run(); } catch { fkBlocked = true; }

  const required = ['branches', 'users', 'roles', 'permissions', 'role_permissions', 'user_panels', 'user_sessions', 'audit_logs',
    'products', 'batches', 'stock_movements', 'suppliers', 'purchases', 'purchase_items', 'sales', 'sale_items', 'returns',
    'return_items', 'shifts', 'cash_drawer', 'settings', 'fbr_sync_queue', 'customers', 'prescriptions', 'controlled_dispense_log'];
  const missing = required.filter((t) => !tables.includes(t));

  const report = {
    migrationsAppliedFirstRun: r1.applied.length,
    secondRunApplied: r2.applied.length,
    schemaVersion: getUserVersion(),
    tables: tables.length,
    missingTables: missing,
    indexes,
    auditTriggers: triggers.length,
    roles,
    permissionRows: permCount,
    matrix,
    limits,
    usersSeeded: users,
    pragmas: { fk, integrity, fkViolations: fkCheck.length },
    guards: { updateBlocked, deleteBlocked, fkBlocked },
  };
  console.log(JSON.stringify(report, null, 2));

  const ok =
    missing.length === 0 && r1.applied.length === 2 && r2.applied.length === 0 &&
    triggers.length === 2 && users === 0 && permCount > 60 && matrix.length === 5 &&
    fk === 1 && integrity === 'ok' && fkCheck.length === 0 &&
    updateBlocked && deleteBlocked && fkBlocked;

  closeDatabase();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(ok ? 'SCHEMA_OK' : 'SCHEMA_FAIL');
  app.exit(ok ? 0 : 1);
});
