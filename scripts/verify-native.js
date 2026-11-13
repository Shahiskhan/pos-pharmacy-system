// Smoke test: must be run with the Electron binary, e.g.
//   npx electron scripts/verify-native.js
// Proves better-sqlite3 loads against Electron's ABI (NODE_MODULE_VERSION match)
// and that WAL + foreign_keys pragmas apply.
const { app } = require('electron');
const Database = require('better-sqlite3');

app.whenReady().then(() => {
  try {
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.prepare('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)').run();
    db.prepare("INSERT INTO t (v) VALUES ('ok')").run();
    const row = db.prepare('SELECT v FROM t').get();
    const fk = db.pragma('foreign_keys', { simple: true });
    console.log('ELECTRON', process.versions.electron, 'ABI', process.versions.modules);
    console.log('SQLITE', db.prepare('select sqlite_version() as v').get().v, 'ROW', row.v, 'FK', fk);
    console.log('NATIVE_OK');
    db.close();
    app.exit(0);
  } catch (err) {
    console.error('NATIVE_FAIL', err.message);
    app.exit(1);
  }
});
