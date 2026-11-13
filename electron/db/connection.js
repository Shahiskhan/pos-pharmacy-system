/**
 * Single SQLite connection owned by the Electron MAIN process.
 *
 * Nothing under src/ may import this file (or better-sqlite3) — the renderer
 * reaches data only through the validated IPC router. That is the whole point
 * of Phase 1: authorization lives below the UI.
 *
 * Pragmas are chosen for a POS that must survive power cuts mid-sale:
 *  - journal_mode = WAL      : readers never block the writer; crash-safe.
 *  - synchronous  = NORMAL   : WAL + NORMAL cannot corrupt the DB on power loss;
 *                              only the last transaction(s) may roll back.
 *                              FULL would fsync every commit (~5-10x slower
 *                              billing) and is not needed with WAL.
 *  - foreign_keys = ON       : orphaned sale_items / batches become impossible.
 *  - busy_timeout = 5000     : 5s grace instead of instant SQLITE_BUSY.
 */
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

/** @type {import('better-sqlite3').Database | null} */
let db = null;
let dbPath = null;

/**
 * Open (or create) the POS database.
 * @param {string} userDataDir  pass app.getPath('userData')
 * @param {{ filename?: string }} [opts]
 */
function openDatabase(userDataDir, opts = {}) {
  if (db) return db;

  const filename = opts.filename || 'pos.db';
  dbPath = path.join(userDataDir, filename);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('temp_store = MEMORY');
  // 64MB page cache: enough for a 5-year pharmacy history without RAM pressure.
  db.pragma('cache_size = -65536');

  return db;
}

function getDb() {
  if (!db) throw new Error('Database is not open. Call openDatabase() during app boot first.');
  return db;
}

function getDbPath() {
  return dbPath;
}

/** Run fn inside a transaction; rolls back on any throw. Supports nesting (savepoints). */
function transaction(fn) {
  return getDb().transaction(fn);
}

function closeDatabase() {
  if (!db) return;
  try {
    // Fold the WAL back into the main file so a copied pos.db is self-contained.
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.pragma('optimize');
  } catch {
    /* checkpoint is best-effort on shutdown */
  }
  db.close();
  db = null;
}

module.exports = { openDatabase, getDb, getDbPath, transaction, closeDatabase };
