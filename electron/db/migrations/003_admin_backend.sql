-- ==========================================================================
-- 003_admin_backend.sql — Admin panel DB backend
-- --------------------------------------------------------------------------
-- Stores admin dashboard configuration separately from the core POS tables so
-- the admin console can manage users, content, notifications, and settings in a
-- production-friendly way without forcing the rest of the pharmacy workflow to
-- depend on localStorage or browser-only state.
-- ==========================================================================

CREATE TABLE admin_users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  full_name     TEXT NOT NULL,
  email         TEXT,
  role          TEXT NOT NULL,
  department    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive','Pending')),
  permissions   TEXT NOT NULL DEFAULT '[]',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE admin_content (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  category      TEXT NOT NULL,
  author        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Published','Scheduled')),
  tags          TEXT NOT NULL DEFAULT '[]',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE admin_notifications (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  audience      TEXT NOT NULL,
  type          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Sent','Read')),
  message       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE admin_settings (
  key           TEXT PRIMARY KEY,
  value         TEXT NOT NULL,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO permissions (id, module, action, label) VALUES
  ('perm-admin-view', 'admin', 'view', 'View admin panel'),
  ('perm-admin-edit', 'admin', 'edit', 'Edit admin records'),
  ('perm-admin-manage', 'admin', 'manage', 'Manage admin settings and access');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 'role-super-admin', id FROM permissions WHERE module = 'admin';

INSERT INTO role_permissions (role_id, permission_id)
SELECT 'role-manager', id FROM permissions WHERE module = 'admin';

INSERT INTO role_permissions (role_id, permission_id)
SELECT 'role-mini-admin', id FROM permissions WHERE module = 'admin';
