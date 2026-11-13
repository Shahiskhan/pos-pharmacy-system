-- ============================================================================
-- 002_seed_roles.sql — roles, permission catalogue, matrix, numeric caps
--
-- Seeds ONLY configuration. No users, no passwords, no branches: those are
-- created by the first-run wizard (electron/services/firstrun.service.js).
--
-- IDs are deterministic so seeding is idempotent across upgrades and so the
-- application code can reference stable role ids without a lookup.
-- ============================================================================

-- ---------------------------------------------------------------- roles -----
INSERT INTO roles (id, code, name, description, is_system, rank) VALUES
  ('role-super-admin', 'SUPER_ADMIN', 'Super Admin',  'Owner / full company control', 1, 100),
  ('role-manager',     'MANAGER',     'Manager',      'Branch operations and staff',  1,  60),
  ('role-mini-admin',  'MINI_ADMIN',  'Mini Admin',   'Shift supervisor, narrow scope', 1, 50),
  ('role-pharmacist',  'PHARMACIST',  'Pharmacist',   'Dispensing and compliance',    1,  40),
  ('role-cashier',     'CASHIER',     'Cashier',      'Counter billing only',         1,  10);

-- ---------------------------------------------------------- permissions -----
INSERT INTO permissions (id, module, action, label) VALUES
  ('perm-dashboard-view',        'dashboard', 'view',   'View dashboard'),
  ('perm-dashboard-company',     'dashboard', 'company','View company-wide KPIs'),

  ('perm-sales-view',            'sales',     'view',   'View sales'),
  ('perm-sales-create',          'sales',     'create', 'Create a sale'),
  ('perm-sales-edit',            'sales',     'edit',   'Edit a sale'),
  ('perm-sales-void',            'sales',     'approve','Void a sale'),
  ('perm-sales-hold',            'sales',     'hold',   'Hold / resume bills'),
  ('perm-sales-return-request',  'sales',     'return_request', 'Raise a return request'),
  ('perm-sales-return-approve',  'sales',     'return_approve', 'Approve a return'),
  ('perm-sales-discount-cap',    'sales',     'discount_cap',   'Discount above role cap'),
  ('perm-sales-price-override',  'sales',     'price_override', 'Override unit price'),

  ('perm-inventory-view',        'inventory', 'view',   'View inventory'),
  ('perm-inventory-create',      'inventory', 'create', 'Create product'),
  ('perm-inventory-edit',        'inventory', 'edit',   'Edit product'),
  ('perm-inventory-delete',      'inventory', 'delete', 'Delete product'),
  ('perm-inventory-price-edit',  'inventory', 'price_edit', 'Change MRP / price'),
  ('perm-inventory-adjust',      'inventory', 'adjust', 'Stock adjustment'),
  ('perm-inventory-adjust-approve','inventory','adjust_approve', 'Approve adjustment'),
  ('perm-inventory-writeoff',    'inventory', 'writeoff', 'Write off stock'),
  ('perm-inventory-count',       'inventory', 'stocktake', 'Physical stock count'),

  ('perm-purchases-view',        'purchases', 'view',   'View purchases'),
  ('perm-purchases-create',      'purchases', 'create', 'Create a purchase'),
  ('perm-purchases-edit',        'purchases', 'edit',   'Edit a purchase'),
  ('perm-purchases-approve',     'purchases', 'approve','Approve a purchase'),
  ('perm-purchases-delete',      'purchases', 'delete', 'Delete a purchase'),

  ('perm-suppliers-view',        'suppliers', 'view',   'View suppliers'),
  ('perm-suppliers-create',      'suppliers', 'create', 'Create supplier'),
  ('perm-suppliers-edit',        'suppliers', 'edit',   'Edit supplier'),
  ('perm-suppliers-delete',      'suppliers', 'delete', 'Delete supplier'),

  ('perm-drugs-view',            'drugs',     'view',   'View controlled drug register'),
  ('perm-drugs-dispense',        'drugs',     'dispense','Dispense controlled drugs'),
  ('perm-drugs-prescription',    'drugs',     'prescription', 'Record prescriptions'),

  ('perm-shifts-view',           'shifts',    'view',   'View shifts'),
  ('perm-shifts-own',            'shifts',    'own',    'View own shift only'),
  ('perm-shifts-open',           'shifts',    'create', 'Open a shift'),
  ('perm-shifts-close',          'shifts',    'close',  'Close / reconcile a shift'),
  ('perm-shifts-view-all',       'shifts',    'view_all', 'View all shifts'),

  ('perm-users-view',            'users',     'view',   'View users'),
  ('perm-users-create',          'users',     'create', 'Create user'),
  ('perm-users-edit',            'users',     'edit',   'Edit user'),
  ('perm-users-delete',          'users',     'delete', 'Deactivate user'),
  ('perm-users-reset-pin',       'users',     'reset_pin', 'Reset a user PIN'),

  ('perm-roles-view',            'roles',     'view',   'View roles'),
  ('perm-roles-edit',            'roles',     'edit',   'Edit roles / permission matrix'),

  ('perm-panels-view',           'panels',    'view',   'View panel assignments'),
  ('perm-panels-assign',         'panels',    'assign', 'Assign panels to users'),

  ('perm-branches-view',         'branches',  'view',   'View branches'),
  ('perm-branches-create',       'branches',  'create', 'Create branch'),
  ('perm-branches-edit',         'branches',  'edit',   'Edit branch'),
  ('perm-branches-delete',       'branches',  'delete', 'Delete branch'),

  ('perm-settings-view',         'settings',  'view',   'View settings'),
  ('perm-settings-edit',         'settings',  'edit',   'Edit settings'),
  ('perm-settings-printer',      'settings',  'printer','Printer / hardware settings'),

  ('perm-fbr-view',              'fbr',       'view',   'View FBR settings'),
  ('perm-fbr-edit',              'fbr',       'edit',   'Edit FBR settings'),

  ('perm-backups-view',          'backups',   'view',   'View backups'),
  ('perm-backups-restore',       'backups',   'restore','Backup / restore'),

  ('perm-audit-view',            'audit',     'view',   'View audit log'),
  ('perm-audit-export',          'audit',     'export', 'Export audit log'),

  ('perm-analytics-company',     'analytics', 'company',    'Company analytics'),
  ('perm-analytics-branch',      'analytics', 'branch',     'Branch analytics'),
  ('perm-analytics-dispensing',  'analytics', 'dispensing', 'Dispensing analytics'),
  ('perm-analytics-self',        'analytics', 'self',       'Own-shift analytics'),
  ('perm-analytics-export',      'analytics', 'export',     'Export analytics'),

  ('perm-license-manage',        'license',   'manage', 'Manage licence / activation'),
  ('perm-system-health',         'system',    'health', 'View system health'),
  ('perm-system-migrate',        'system',    'migrate','Run legacy data import');

-- ============================================================ MATRIX ========
-- SUPER_ADMIN: everything.
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'role-super-admin', id FROM permissions;

-- MANAGER: branch operations, no pricing authority, no FBR/licence/backup control.
INSERT INTO role_permissions (role_id, permission_id) VALUES
  ('role-manager', 'perm-dashboard-view'),
  ('role-manager', 'perm-sales-view'),
  ('role-manager', 'perm-sales-create'),
  ('role-manager', 'perm-sales-edit'),
  ('role-manager', 'perm-sales-void'),
  ('role-manager', 'perm-sales-hold'),
  ('role-manager', 'perm-sales-return-request'),
  ('role-manager', 'perm-sales-return-approve'),
  ('role-manager', 'perm-sales-discount-cap'),
  ('role-manager', 'perm-inventory-view'),
  ('role-manager', 'perm-inventory-create'),
  ('role-manager', 'perm-inventory-edit'),
  ('role-manager', 'perm-inventory-adjust'),
  ('role-manager', 'perm-inventory-adjust-approve'),
  ('role-manager', 'perm-inventory-writeoff'),
  ('role-manager', 'perm-inventory-count'),
  ('role-manager', 'perm-purchases-view'),
  ('role-manager', 'perm-purchases-create'),
  ('role-manager', 'perm-purchases-edit'),
  ('role-manager', 'perm-purchases-approve'),
  ('role-manager', 'perm-suppliers-view'),
  ('role-manager', 'perm-suppliers-create'),
  ('role-manager', 'perm-suppliers-edit'),
  ('role-manager', 'perm-drugs-view'),
  ('role-manager', 'perm-shifts-view'),
  ('role-manager', 'perm-shifts-view-all'),
  ('role-manager', 'perm-shifts-open'),
  ('role-manager', 'perm-shifts-close'),
  ('role-manager', 'perm-users-view'),
  ('role-manager', 'perm-users-reset-pin'),
  ('role-manager', 'perm-branches-view'),
  ('role-manager', 'perm-settings-view'),
  ('role-manager', 'perm-settings-printer'),
  ('role-manager', 'perm-audit-view'),
  ('role-manager', 'perm-analytics-branch'),
  ('role-manager', 'perm-analytics-self'),
  ('role-manager', 'perm-analytics-export');

-- MINI_ADMIN: shift supervisor. Can correct stock and approve small things.
INSERT INTO role_permissions (role_id, permission_id) VALUES
  ('role-mini-admin', 'perm-dashboard-view'),
  ('role-mini-admin', 'perm-sales-view'),
  ('role-mini-admin', 'perm-sales-hold'),
  ('role-mini-admin', 'perm-sales-void'),
  ('role-mini-admin', 'perm-sales-return-approve'),
  ('role-mini-admin', 'perm-sales-discount-cap'),
  ('role-mini-admin', 'perm-inventory-view'),
  ('role-mini-admin', 'perm-inventory-adjust'),
  ('role-mini-admin', 'perm-inventory-writeoff'),
  ('role-mini-admin', 'perm-inventory-count'),
  ('role-mini-admin', 'perm-purchases-view'),
  ('role-mini-admin', 'perm-suppliers-view'),
  ('role-mini-admin', 'perm-shifts-view'),
  ('role-mini-admin', 'perm-shifts-view-all'),
  ('role-mini-admin', 'perm-shifts-open'),
  ('role-mini-admin', 'perm-shifts-close'),
  ('role-mini-admin', 'perm-users-view'),
  ('role-mini-admin', 'perm-branches-view'),
  ('role-mini-admin', 'perm-analytics-branch'),
  ('role-mini-admin', 'perm-analytics-self');

-- PHARMACIST: dispensing + compliance. Read-only on price/inventory.
INSERT INTO role_permissions (role_id, permission_id) VALUES
  ('role-pharmacist', 'perm-sales-view'),
  ('role-pharmacist', 'perm-sales-create'),
  ('role-pharmacist', 'perm-sales-hold'),
  ('role-pharmacist', 'perm-sales-return-request'),
  ('role-pharmacist', 'perm-inventory-view'),
  ('role-pharmacist', 'perm-purchases-view'),
  ('role-pharmacist', 'perm-drugs-view'),
  ('role-pharmacist', 'perm-drugs-dispense'),
  ('role-pharmacist', 'perm-drugs-prescription'),
  ('role-pharmacist', 'perm-shifts-view'),
  ('role-pharmacist', 'perm-shifts-own'),
  ('role-pharmacist', 'perm-shifts-open'),
  ('role-pharmacist', 'perm-shifts-close'),
  ('role-pharmacist', 'perm-analytics-dispensing'),
  ('role-pharmacist', 'perm-analytics-self');

-- CASHIER: counter only. Own shift only.
INSERT INTO role_permissions (role_id, permission_id) VALUES
  ('role-cashier', 'perm-sales-view'),
  ('role-cashier', 'perm-sales-create'),
  ('role-cashier', 'perm-sales-hold'),
  ('role-cashier', 'perm-sales-return-request'),
  ('role-cashier', 'perm-inventory-view'),
  ('role-cashier', 'perm-shifts-view'),
  ('role-cashier', 'perm-shifts-own'),
  ('role-cashier', 'perm-shifts-open'),
  ('role-cashier', 'perm-shifts-close'),
  ('role-cashier', 'perm-analytics-self');

-- ---------------------------------------------------------- role_limits -----
-- max_discount_pct is basis points: 200 = 2.00%, 1000 = 10.00%, 10000 = 100%.
-- max_discount_amount / max_cash_refund are paisa.
INSERT INTO role_limits
  (role_id, max_discount_pct, max_discount_amount, max_cash_refund, max_stock_adjust_qty, can_view_other_users_data)
VALUES
  ('role-super-admin', 10000, 100000000, 100000000, 1000000, 1),
  ('role-manager',      1000,   2500000,   2500000,   10000, 1),
  ('role-mini-admin',    500,    500000,    500000,    5000, 1),
  ('role-pharmacist',    300,         0,         0,       0, 0),
  ('role-cashier',       200,         0,         0,       0, 0);
