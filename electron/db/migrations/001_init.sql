-- ============================================================================
-- 001_init.sql — POS core schema
-- Conventions:
--   * All money is INTEGER paisa (1 PKR = 100 paisa). Never REAL.
--   * All primary keys are TEXT (UUIDv7 from electron/db/ids.js).
--   * All timestamps are TEXT ISO-8601 UTC ('YYYY-MM-DD HH:MM:SS').
--   * Business rows use deleted_at soft delete; audit_logs is append-only.
--   * Quantities are INTEGER in the product's base unit.
-- ============================================================================

-- ---------------------------------------------------------------- org -------
CREATE TABLE branches (
  id                TEXT PRIMARY KEY,
  code              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  address           TEXT,
  city              TEXT,
  phone             TEXT,
  ntn               TEXT,
  strn              TEXT,
  is_pharmacy       INTEGER NOT NULL DEFAULT 1 CHECK (is_pharmacy IN (0,1)),
  druggist_license  TEXT,
  pharmacist_incharge TEXT,
  pos_id_prefix     TEXT NOT NULL DEFAULT 'P1',
  is_active         INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT,
  deleted_at        TEXT
);

CREATE TABLE terminals (
  id              TEXT PRIMARY KEY,
  branch_id       TEXT NOT NULL REFERENCES branches(id),
  code            TEXT NOT NULL,
  name            TEXT,
  machine_id      TEXT,
  invoice_counter INTEGER NOT NULL DEFAULT 0,
  printer_name    TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (branch_id, code)
);

-- ----------------------------------------------------------- identity -------
CREATE TABLE roles (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  is_system   INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0,1)),
  rank        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE permissions (
  id       TEXT PRIMARY KEY,
  module   TEXT NOT NULL,
  action   TEXT NOT NULL,
  label    TEXT,
  UNIQUE (module, action)
);

CREATE TABLE role_permissions (
  role_id       TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- Numeric caps per role. Kept separate from boolean permissions because a
-- limit ("discount up to 5%") is not expressible as module.action.
CREATE TABLE role_limits (
  role_id                    TEXT PRIMARY KEY REFERENCES roles(id) ON DELETE CASCADE,
  max_discount_pct           INTEGER NOT NULL DEFAULT 0,   -- basis points: 500 = 5.00%
  max_discount_amount        INTEGER NOT NULL DEFAULT 0,   -- paisa, per invoice
  max_cash_refund            INTEGER NOT NULL DEFAULT 0,   -- paisa
  max_stock_adjust_qty       INTEGER NOT NULL DEFAULT 0,
  can_view_other_users_data  INTEGER NOT NULL DEFAULT 0 CHECK (can_view_other_users_data IN (0,1))
);

CREATE TABLE users (
  id                   TEXT PRIMARY KEY,
  branch_id            TEXT NOT NULL REFERENCES branches(id),
  role_id              TEXT NOT NULL REFERENCES roles(id),
  username             TEXT NOT NULL UNIQUE,
  full_name            TEXT NOT NULL,
  phone                TEXT,
  email                TEXT,
  cnic                 TEXT,
  pmpc_license         TEXT,
  password_hash        TEXT NOT NULL,
  pin_hash             TEXT,
  status               TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','disabled','locked')),
  failed_logins        INTEGER NOT NULL DEFAULT 0,
  locked_until         TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0,1)),
  last_login_at        TEXT,
  created_by           TEXT REFERENCES users(id),
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT,
  deleted_at           TEXT
);

CREATE INDEX idx_users_branch ON users (branch_id, status);

-- Which panel(s) a user sees after login. This is the missing piece in the
-- legacy app (everyone saw every module).
CREATE TABLE user_panels (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  panel         TEXT NOT NULL CHECK (panel IN ('ADMIN','MANAGER','PHARMACIST','COUNTER')),
  is_default    INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  landing_route TEXT,
  granted_by    TEXT REFERENCES users(id),
  granted_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, panel)
);

CREATE TABLE user_permission_overrides (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  effect        TEXT NOT NULL CHECK (effect IN ('allow','deny')),
  granted_by    TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, permission_id)
);

CREATE TABLE user_sessions (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id),
  terminal_id    TEXT REFERENCES terminals(id),
  branch_id      TEXT NOT NULL,
  panel          TEXT NOT NULL,
  shift_id       TEXT,
  host           TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at   TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at     TEXT NOT NULL,
  revoked_at     TEXT,
  revoked_reason TEXT
);

CREATE INDEX idx_sessions_user ON user_sessions (user_id, revoked_at);

-- ------------------------------------------------------- shifts / cash ------
CREATE TABLE shifts (
  id            TEXT PRIMARY KEY,
  branch_id     TEXT NOT NULL REFERENCES branches(id),
  terminal_id   TEXT NOT NULL REFERENCES terminals(id),
  user_id       TEXT NOT NULL REFERENCES users(id),
  opened_at     TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at     TEXT,
  opening_float INTEGER NOT NULL DEFAULT 0,
  expected_cash INTEGER,
  counted_cash  INTEGER,
  variance      INTEGER,
  variance_note TEXT,
  closed_by     TEXT REFERENCES users(id),
  status        TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','closed','reconciled')),
  z_report_json TEXT
);

CREATE INDEX idx_shifts_user   ON shifts (user_id, opened_at);
CREATE INDEX idx_shifts_branch ON shifts (branch_id, status);

CREATE TABLE cash_drawer (
  id           TEXT PRIMARY KEY,
  shift_id     TEXT NOT NULL REFERENCES shifts(id),
  type         TEXT NOT NULL
               CHECK (type IN ('OPEN_FLOAT','SALE','REFUND','DROP','PETTY_OUT','PAID_IN','ADJUST')),
  amount       INTEGER NOT NULL,
  reference_id TEXT,
  reason       TEXT,
  user_id      TEXT NOT NULL REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_cash_shift ON cash_drawer (shift_id, created_at);

-- ------------------------------------------------------------- catalog ------
CREATE TABLE suppliers (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  company            TEXT,
  ntn                TEXT,
  strn               TEXT,
  phone              TEXT,
  address            TEXT,
  payment_terms_days INTEGER NOT NULL DEFAULT 0,
  balance            INTEGER NOT NULL DEFAULT 0,
  is_active          INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT,
  deleted_at         TEXT
);

CREATE TABLE products (
  id                    TEXT PRIMARY KEY,
  sku                   TEXT UNIQUE,
  barcode               TEXT,
  name                  TEXT NOT NULL,
  generic_name          TEXT,
  salt_strength         TEXT,
  company               TEXT,
  category              TEXT,
  form                  TEXT,
  pack_size             INTEGER NOT NULL DEFAULT 1,
  base_unit             TEXT NOT NULL DEFAULT 'TAB',
  is_controlled         INTEGER NOT NULL DEFAULT 0 CHECK (is_controlled IN (0,1)),
  controlled_schedule   TEXT,
  requires_prescription INTEGER NOT NULL DEFAULT 0 CHECK (requires_prescription IN (0,1)),
  is_weighed            INTEGER NOT NULL DEFAULT 0 CHECK (is_weighed IN (0,1)),
  mrp                   INTEGER NOT NULL DEFAULT 0,
  retail_price          INTEGER NOT NULL DEFAULT 0,
  wholesale_price       INTEGER NOT NULL DEFAULT 0,
  reorder_level         INTEGER NOT NULL DEFAULT 0,
  tax_rate_bps          INTEGER NOT NULL DEFAULT 0,
  tax_category          TEXT NOT NULL DEFAULT 'STANDARD'
                        CHECK (tax_category IN ('STANDARD','ZERO','EXEMPT')),
  fbr_item_code         TEXT,
  shelf_location        TEXT,
  is_active             INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_by            TEXT REFERENCES users(id),
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT,
  deleted_at            TEXT
);

CREATE INDEX idx_products_barcode ON products (barcode);
CREATE INDEX idx_products_generic ON products (generic_name);
CREATE INDEX idx_products_active  ON products (is_active, deleted_at);

CREATE TABLE product_price_history (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES products(id),
  old_mrp     INTEGER,
  new_mrp     INTEGER,
  old_retail  INTEGER,
  new_retail  INTEGER,
  changed_by  TEXT NOT NULL REFERENCES users(id),
  reason      TEXT,
  changed_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE batches (
  id           TEXT PRIMARY KEY,
  product_id   TEXT NOT NULL REFERENCES products(id),
  branch_id    TEXT NOT NULL REFERENCES branches(id),
  batch_no     TEXT NOT NULL,
  mfg_date     TEXT,
  expiry_date  TEXT NOT NULL,
  cost_price   INTEGER NOT NULL DEFAULT 0,
  mrp          INTEGER NOT NULL,
  qty_on_hand  INTEGER NOT NULL DEFAULT 0,
  qty_reserved INTEGER NOT NULL DEFAULT 0,
  supplier_id  TEXT REFERENCES suppliers(id),
  purchase_id  TEXT,
  status       TEXT NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','quarantine','expired','damaged','depleted')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT,
  UNIQUE (product_id, branch_id, batch_no, expiry_date)
);

CREATE INDEX idx_batches_product ON batches (product_id);
CREATE INDEX idx_batches_expiry  ON batches (expiry_date);
CREATE INDEX idx_batches_fefo    ON batches (branch_id, product_id, expiry_date, status);

CREATE TABLE stock_movements (
  id             TEXT PRIMARY KEY,
  branch_id      TEXT NOT NULL,
  product_id     TEXT NOT NULL REFERENCES products(id),
  batch_id       TEXT REFERENCES batches(id),
  type           TEXT NOT NULL
                 CHECK (type IN ('PURCHASE','SALE','RETURN_IN','RETURN_OUT','ADJUST',
                                 'WRITE_OFF','TRANSFER_IN','TRANSFER_OUT','STOCKTAKE')),
  qty            INTEGER NOT NULL,
  unit_cost      INTEGER,
  reference_type TEXT,
  reference_id   TEXT,
  reason         TEXT,
  user_id        TEXT NOT NULL REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_movements_ref    ON stock_movements (reference_type, reference_id);
CREATE INDEX idx_movements_batch  ON stock_movements (batch_id);
CREATE INDEX idx_movements_product ON stock_movements (product_id, created_at);

-- ---------------------------------------------------------- purchasing ------
CREATE TABLE purchases (
  id                  TEXT PRIMARY KEY,
  branch_id           TEXT NOT NULL REFERENCES branches(id),
  supplier_id         TEXT NOT NULL REFERENCES suppliers(id),
  po_number           TEXT,
  supplier_invoice_no TEXT,
  invoice_date        TEXT,
  subtotal            INTEGER NOT NULL DEFAULT 0,
  discount            INTEGER NOT NULL DEFAULT 0,
  tax                 INTEGER NOT NULL DEFAULT 0,
  total               INTEGER NOT NULL DEFAULT 0,
  paid                INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','ordered','received','partially_received','cancelled')),
  received_at         TEXT,
  created_by          TEXT NOT NULL REFERENCES users(id),
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at          TEXT
);

CREATE TABLE purchase_items (
  id          TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id  TEXT NOT NULL REFERENCES products(id),
  batch_id    TEXT REFERENCES batches(id),
  batch_no    TEXT,
  expiry_date TEXT,
  qty         INTEGER NOT NULL,
  free_qty    INTEGER NOT NULL DEFAULT 0,
  cost_price  INTEGER NOT NULL,
  mrp         INTEGER NOT NULL,
  discount    INTEGER NOT NULL DEFAULT 0,
  tax         INTEGER NOT NULL DEFAULT 0,
  line_total  INTEGER NOT NULL
);

CREATE TABLE supplier_payments (
  id          TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  amount      INTEGER NOT NULL,
  mode        TEXT NOT NULL CHECK (mode IN ('CASH','BANK','EASYPAISA','JAZZCASH','CHEQUE')),
  reference   TEXT,
  paid_at     TEXT NOT NULL DEFAULT (datetime('now')),
  user_id     TEXT NOT NULL REFERENCES users(id)
);

-- ----------------------------------------------------------- customers ------
CREATE TABLE customers (
  id           TEXT PRIMARY KEY,
  phone        TEXT UNIQUE,
  name         TEXT,
  cnic         TEXT,
  address      TEXT,
  credit_limit INTEGER NOT NULL DEFAULT 0,
  balance      INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT,
  deleted_at   TEXT
);

-- ----------------------------------------------------------------- DRAP -----
CREATE TABLE prescriptions (
  id            TEXT PRIMARY KEY,
  customer_cnic TEXT,
  customer_name TEXT,
  doctor_name   TEXT NOT NULL,
  doctor_pmdc   TEXT,
  hospital      TEXT,
  prescribed_on TEXT,
  scan_path     TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------- sales ----
CREATE TABLE sales (
  id                TEXT PRIMARY KEY,
  branch_id         TEXT NOT NULL REFERENCES branches(id),
  terminal_id       TEXT NOT NULL REFERENCES terminals(id),
  invoice_no        TEXT NOT NULL,
  invoice_seq       INTEGER NOT NULL,
  fiscal_year       TEXT,
  shift_id          TEXT NOT NULL REFERENCES shifts(id),
  cashier_id        TEXT NOT NULL REFERENCES users(id),
  customer_id       TEXT REFERENCES customers(id),
  customer_name     TEXT,
  customer_phone    TEXT,
  customer_cnic     TEXT,
  prescription_no   TEXT,
  doctor_name       TEXT,
  prescription_id   TEXT REFERENCES prescriptions(id),
  subtotal          INTEGER NOT NULL DEFAULT 0,
  item_discount     INTEGER NOT NULL DEFAULT 0,
  bill_discount     INTEGER NOT NULL DEFAULT 0,
  discount_pct_bps  INTEGER NOT NULL DEFAULT 0,
  tax_total         INTEGER NOT NULL DEFAULT 0,
  total             INTEGER NOT NULL DEFAULT 0,
  cost_total        INTEGER NOT NULL DEFAULT 0,
  gross_profit      INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'completed'
                    CHECK (status IN ('held','completed','voided','partially_returned','fully_returned')),
  void_reason       TEXT,
  voided_by         TEXT REFERENCES users(id),
  fbr_invoice_no    TEXT,
  fbr_qr_payload    TEXT,
  fbr_status        TEXT NOT NULL DEFAULT 'not_required'
                    CHECK (fbr_status IN ('not_required','queued','submitted','failed','verified')),
  fbr_submitted_at  TEXT,
  fbr_response_json TEXT,
  fbr_retry_count   INTEGER NOT NULL DEFAULT 0,
  is_pharmacy_sale  INTEGER NOT NULL DEFAULT 0 CHECK (is_pharmacy_sale IN (0,1)),
  dispensed_by      TEXT REFERENCES users(id),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at        TEXT,
  UNIQUE (branch_id, terminal_id, invoice_no)
);

CREATE INDEX idx_sales_created  ON sales (created_at);
CREATE INDEX idx_sales_cashier  ON sales (cashier_id, created_at);
CREATE INDEX idx_sales_branch   ON sales (branch_id, created_at);
CREATE INDEX idx_sales_shift    ON sales (shift_id);
CREATE INDEX idx_sales_fbr      ON sales (fbr_status) WHERE fbr_status = 'queued';

CREATE TABLE sale_items (
  id               TEXT PRIMARY KEY,
  sale_id          TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id       TEXT NOT NULL REFERENCES products(id),
  batch_id         TEXT NOT NULL REFERENCES batches(id),
  product_name     TEXT NOT NULL,
  generic_name     TEXT,
  batch_no         TEXT,
  expiry_date      TEXT,
  qty              INTEGER NOT NULL,
  unit             TEXT NOT NULL DEFAULT 'STRIP',
  unit_factor      INTEGER NOT NULL DEFAULT 1,
  mrp              INTEGER NOT NULL DEFAULT 0,
  unit_price       INTEGER NOT NULL DEFAULT 0,
  cost_price       INTEGER NOT NULL DEFAULT 0,
  discount         INTEGER NOT NULL DEFAULT 0,
  discount_pct_bps INTEGER NOT NULL DEFAULT 0,
  tax_rate_bps     INTEGER NOT NULL DEFAULT 0,
  tax_amount       INTEGER NOT NULL DEFAULT 0,
  line_total       INTEGER NOT NULL DEFAULT 0,
  is_controlled    INTEGER NOT NULL DEFAULT 0 CHECK (is_controlled IN (0,1)),
  returned_qty     INTEGER NOT NULL DEFAULT 0,
  override_reason  TEXT
);

CREATE INDEX idx_sale_items_sale    ON sale_items (sale_id);
CREATE INDEX idx_sale_items_product ON sale_items (product_id);
CREATE INDEX idx_sale_items_batch   ON sale_items (batch_id);

CREATE TABLE payments (
  id         TEXT PRIMARY KEY,
  sale_id    TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  mode       TEXT NOT NULL
             CHECK (mode IN ('CASH','CARD','EASYPAISA','JAZZCASH','BANK','CREDIT')),
  amount     INTEGER NOT NULL,
  tendered   INTEGER,
  change_due INTEGER NOT NULL DEFAULT 0,
  txn_ref    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_payments_sale ON payments (sale_id);

CREATE TABLE held_bills (
  id          TEXT PRIMARY KEY,
  branch_id   TEXT NOT NULL,
  terminal_id TEXT NOT NULL,
  cashier_id  TEXT NOT NULL REFERENCES users(id),
  label       TEXT,
  cart_json   TEXT NOT NULL,
  total       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_held_cashier ON held_bills (cashier_id, created_at);

-- --------------------------------------------------------------- returns ----
CREATE TABLE returns (
  id            TEXT PRIMARY KEY,
  branch_id     TEXT NOT NULL,
  return_no     TEXT NOT NULL UNIQUE,
  sale_id       TEXT REFERENCES sales(id),
  invoice_no    TEXT,
  shift_id      TEXT NOT NULL REFERENCES shifts(id),
  type          TEXT NOT NULL DEFAULT 'REFUND' CHECK (type IN ('REFUND','EXCHANGE')),
  reason_code   TEXT NOT NULL,
  reason_note   TEXT,
  subtotal      INTEGER NOT NULL DEFAULT 0,
  tax_total     INTEGER NOT NULL DEFAULT 0,
  total         INTEGER NOT NULL DEFAULT 0,
  refund_mode   TEXT NOT NULL,
  requested_by  TEXT NOT NULL REFERENCES users(id),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected','completed')),
  approved_by   TEXT REFERENCES users(id),
  approved_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_returns_sale   ON returns (sale_id);
CREATE INDEX idx_returns_status ON returns (status, created_at);

CREATE TABLE return_items (
  id           TEXT PRIMARY KEY,
  return_id    TEXT NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  sale_item_id TEXT NOT NULL REFERENCES sale_items(id),
  product_id   TEXT NOT NULL,
  batch_id     TEXT NOT NULL,
  qty          INTEGER NOT NULL,
  unit_price   INTEGER NOT NULL,
  line_total   INTEGER NOT NULL,
  restock      INTEGER NOT NULL DEFAULT 1 CHECK (restock IN (0,1)),
  disposition  TEXT NOT NULL DEFAULT 'RESTOCK'
               CHECK (disposition IN ('RESTOCK','QUARANTINE','DESTROY'))
);

CREATE TABLE controlled_dispense_log (
  id              TEXT PRIMARY KEY,
  sale_id         TEXT NOT NULL REFERENCES sales(id),
  sale_item_id    TEXT REFERENCES sale_items(id),
  product_id      TEXT NOT NULL,
  product_name    TEXT NOT NULL,
  schedule        TEXT NOT NULL,
  qty             INTEGER NOT NULL,
  customer_name   TEXT,
  customer_cnic   TEXT NOT NULL,
  doctor_name     TEXT,
  prescription_id TEXT REFERENCES prescriptions(id),
  pharmacist_id   TEXT NOT NULL REFERENCES users(id),
  dispensed_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_cdl_product ON controlled_dispense_log (product_id, dispensed_at);

CREATE TABLE batch_recalls (
  id          TEXT PRIMARY KEY,
  batch_id    TEXT NOT NULL REFERENCES batches(id),
  batch_no    TEXT NOT NULL,
  reason      TEXT NOT NULL,
  source      TEXT,
  flagged_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

-- ------------------------------------------------------------- FBR queue ----
CREATE TABLE fbr_sync_queue (
  id              TEXT PRIMARY KEY,
  sale_id         TEXT NOT NULL REFERENCES sales(id),
  invoice_no      TEXT NOT NULL,
  payload_json    TEXT NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_error      TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','sending','done','dead_letter')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_fbr_due ON fbr_sync_queue (status, next_attempt_at);

-- ------------------------------------------------------------- audit --------
CREATE TABLE audit_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at  TEXT NOT NULL DEFAULT (datetime('now')),
  user_id      TEXT,
  username     TEXT,
  role_code    TEXT,
  branch_id    TEXT,
  terminal_id  TEXT,
  module       TEXT NOT NULL,
  action       TEXT NOT NULL,
  entity_type  TEXT,
  entity_id    TEXT,
  severity     TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warn','critical')),
  details_json TEXT,
  prev_hash    TEXT,
  row_hash     TEXT NOT NULL
);

CREATE INDEX idx_audit_created ON audit_logs (occurred_at);
CREATE INDEX idx_audit_user    ON audit_logs (user_id, occurred_at);
CREATE INDEX idx_audit_module  ON audit_logs (module, occurred_at);

CREATE TRIGGER trg_audit_no_update BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is append-only');
END;

CREATE TRIGGER trg_audit_no_delete BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is append-only');
END;

-- ---------------------------------------------------------- settings --------
CREATE TABLE settings (
  branch_id  TEXT NOT NULL DEFAULT '*',
  key        TEXT NOT NULL,
  value      TEXT,
  value_type TEXT NOT NULL DEFAULT 'string',
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (branch_id, key)
);

CREATE TABLE sync_outbox (
  id           TEXT PRIMARY KEY,
  entity_type  TEXT NOT NULL,
  entity_id    TEXT NOT NULL,
  op           TEXT NOT NULL CHECK (op IN ('insert','update','delete')),
  payload_json TEXT NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  synced_at    TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sync_pending ON sync_outbox (synced_at) WHERE synced_at IS NULL;
