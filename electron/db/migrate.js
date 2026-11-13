/**
 * Forward-only migration runner.
 *
 * State = SQLite's built-in `PRAGMA user_version` (an integer stored in the DB
 * header). Each .sql file in ./migrations is applied once, in filename order,
 * inside its own transaction, then user_version is bumped to that file's number.
 *
 * Rules enforced here:
 *  - Filenames must be `NNN_name.sql` with a strictly increasing 3-digit number.
 *  - A gap between user_version and the next file number is an error (prevents
 *    "version 3 DB, runner thinks it applied 1 and 2" silent divergence).
 *  - Never edit an applied migration; add a new file instead.
 */
const fs = require('node:fs');
const path = require('node:path');
const { getDb, getDbPath } = require('./connection');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const FILE_RE = /^(\d{3})_([a-z0-9_]+)\.sql$/i;

/** @returns {{ version: number, name: string, file: string, sql: string }[]} */
function loadMigrations(dir = MIGRATIONS_DIR) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => FILE_RE.test(f)).sort();

  return files.map((file, index) => {
    const [, num, name] = file.match(FILE_RE);
    const version = Number(num);
    if (version !== index + 1) {
      throw new Error(
        `Migration numbering gap: expected ${String(index + 1).padStart(3, '0')}_*.sql, found ${file}`
      );
    }
    return {
      version,
      name,
      file,
      sql: fs.readFileSync(path.join(dir, file), 'utf8'),
    };
  });
}

function getUserVersion() {
  return getDb().pragma('user_version', { simple: true });
}

/**
 * Apply all pending migrations.
 * @param {{ log?: (msg: string, ...args: any[]) => void }} [opts]
 * @returns {{ from: number, to: number, applied: string[] }}
 */
function runMigrations({ log = console.log } = {}) {
  const db = getDb();
  const all = loadMigrations();
  const from = getUserVersion();
  const pending = all.filter((m) => m.version > from);

  if (pending.length === 0) {
    log(`[db] schema up to date (version ${from}) at ${getDbPath()}`);
    return { from, to: from, applied: [] };
  }

  const applied = [];
  for (const migration of pending) {
    if (migration.version !== getUserVersion() + 1) {
      throw new Error(
        `Cannot apply ${migration.file}: database is at version ${getUserVersion()}, expected ${migration.version - 1}.`
      );
    }

    const apply = db.transaction(() => {
      // `foreign_keys` cannot be toggled inside a transaction; SET DEFAULT off
      // is set per-connection already. Migrations that rebuild tables must use
      // PRAGMA `defer_foreign_keys` themselves.
      db.exec(migration.sql);
      db.pragma(`user_version = ${migration.version}`);
    });

    const started = Date.now();
    try {
      apply();
    } catch (err) {
      err.message = `Migration ${migration.file} failed: ${err.message}`;
      throw err;
    }
    applied.push(migration.file);
    log(`[db] applied ${migration.file} in ${Date.now() - started}ms -> version ${migration.version}`);
  }

  return { from, to: getUserVersion(), applied };
}

/** Fail fast if the schema is behind the code (used before starting the server). */
function assertSchemaCurrent() {
  const latest = loadMigrations().length;
  const current = getUserVersion();
  if (current !== latest) {
    throw new Error(
      `Database schema is at version ${current} but the app expects ${latest}. Run migrations before opening a window.`
    );
  }
}

module.exports = { runMigrations, getUserVersion, loadMigrations, assertSchemaCurrent, MIGRATIONS_DIR };
