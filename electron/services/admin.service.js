const { getDb } = require('./../db/connection');
const { hashPassword, verifyPassword } = require('./../security/password');
const sessionStore = require('./../security/session');
const { getDb: getMainDb } = require('./../db/connection');

const DEFAULT_ADMIN = {
  username: process.env.VITE_ADMIN_USERNAME || 'admin',
  email: process.env.VITE_ADMIN_EMAIL || 'admin@pharmacy.local',
  password: process.env.VITE_ADMIN_PASSWORD || 'admin123',
  resetSecret: process.env.VITE_ADMIN_RESET_SECRET || 'change-this-secret',
};

function defaultState() {
  return {
    users: [
      {
        id: 'admin-user-default',
        name: 'Main Admin',
        username: DEFAULT_ADMIN.username,
        email: DEFAULT_ADMIN.email,
        role: 'Super Admin',
        department: 'Operations',
        status: 'Active',
        permissions: ['users', 'content', 'analytics', 'settings', 'notifications'],
      },
      {
        id: 'admin-user-counter-1',
        name: 'Ahsan Saleem',
        username: 'counter1',
        email: 'counter1@pharmacy.local',
        role: 'Counter Staff',
        department: 'Counter',
        status: 'Active',
        permissions: ['billing', 'reports'],
      },
    ],
    content: [
      {
        id: 'content-1',
        title: 'Winter flu prevention tips',
        category: 'Health Tips',
        author: 'Medical Desk',
        status: 'Published',
        tags: ['health', 'seasonal', 'care'],
      },
      {
        id: 'content-2',
        title: 'Medication safety checklist',
        category: 'Guides',
        author: 'Operations',
        status: 'Draft',
        tags: ['safety', 'training'],
      },
    ],
    notifications: [
      {
        id: 'notify-1',
        title: 'Low stock alert',
        audience: 'Pharmacist Team',
        type: 'System Alert',
        status: 'Pending',
        createdAt: '2026-11-13',
      },
    ],
    settings: {
      siteName: 'Pharmacy POS Admin',
      supportEmail: 'support@pharmacy.local',
      timezone: 'Asia/Karachi',
      maintenanceMode: false,
      twoFactor: true,
      auditLogs: true,
    },
  };
}

function rowExists(sql, params) {
  return getDb().prepare(sql).get(...params);
}

async function ensureEnvironmentAdminAccount() {
  const db = getDb();
  const env = {
    username: process.env.VITE_ADMIN_USERNAME || 'admin',
    email: process.env.VITE_ADMIN_EMAIL || 'admin@pharmacy.local',
    password: process.env.VITE_ADMIN_PASSWORD || 'admin123',
    resetSecret: process.env.VITE_ADMIN_RESET_SECRET || 'change-this-secret',
  };

  let branch = db.prepare('SELECT * FROM branches WHERE code = ?').get('HQ');
  if (!branch) {
    const branchId = 'branch-main-hq';
    db.prepare(`
      INSERT INTO branches (id, code, name, address, city, phone, is_pharmacy, pos_id_prefix, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1, 'P1', 1)
    `).run(branchId, 'HQ', 'Main Branch', 'Head Office', 'Karachi', '+92-300-0000000');
    branch = db.prepare('SELECT * FROM branches WHERE code = ?').get('HQ');
  }

  const role = db.prepare('SELECT * FROM roles WHERE code = ?').get('SUPER_ADMIN');
  if (!role) {
    throw new Error('SUPER_ADMIN role is missing from the database. Run migrations before booting the admin backend.');
  }

  const existingUser = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(env.username);
  const passwordHash = await hashPassword(env.password);

  if (!existingUser) {
    const userId = `user-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    db.prepare(`
      INSERT INTO users (
        id, branch_id, role_id, username, full_name, email, password_hash,
        status, must_change_password, failed_logins, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 0, 0, datetime('now'), datetime('now'))
    `).run(userId, branch.id, role.id, env.username, 'Main Admin', env.email, passwordHash);
    db.prepare(`
      INSERT OR IGNORE INTO user_panels (user_id, panel, is_default, landing_route, granted_by, granted_at)
      VALUES (?, 'ADMIN', 1, 'admin', ?, datetime('now'))
    `).run(userId, userId);
    return { username: env.username, email: env.email, userId };
  }

  db.prepare('UPDATE users SET branch_id = ?, role_id = ?, full_name = ?, email = ?, password_hash = ?, updated_at = datetime("now") WHERE id = ?').run(
    branch.id,
    role.id,
    'Main Admin',
    env.email,
    passwordHash,
    existingUser.id,
  );

  db.prepare(`
    INSERT OR IGNORE INTO user_panels (user_id, panel, is_default, landing_route, granted_by, granted_at)
    VALUES (?, 'ADMIN', 1, 'admin', ?, datetime('now'))
  `).run(existingUser.id, existingUser.id);

  return { username: env.username, email: env.email, userId: existingUser.id };
}

async function ensureAdminStateSeed() {
  const db = getDb();
  const state = defaultState();

  const userCount = db.prepare('SELECT COUNT(*) AS total FROM admin_users').get().total;
  if (userCount === 0) {
    for (const user of state.users) {
      db.prepare(`
        INSERT INTO admin_users (id, username, full_name, email, role, department, status, permissions)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        user.id,
        user.username,
        user.name,
        user.email,
        user.role,
        user.department,
        user.status,
        JSON.stringify(user.permissions || []),
      );
    }
  }

  const contentCount = db.prepare('SELECT COUNT(*) AS total FROM admin_content').get().total;
  if (contentCount === 0) {
    for (const item of state.content) {
      db.prepare(`
        INSERT INTO admin_content (id, title, category, author, status, tags)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(item.id, item.title, item.category, item.author, item.status, JSON.stringify(item.tags || []));
    }
  }

  const notificationCount = db.prepare('SELECT COUNT(*) AS total FROM admin_notifications').get().total;
  if (notificationCount === 0) {
    for (const item of state.notifications) {
      db.prepare(`
        INSERT INTO admin_notifications (id, title, audience, type, status, message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(item.id, item.title, item.audience, item.type, item.status, '', item.createdAt || new Date().toISOString().slice(0, 10));
    }
  }

  const settingsCount = db.prepare('SELECT COUNT(*) AS total FROM admin_settings').get().total;
  if (settingsCount === 0) {
    db.prepare('INSERT INTO admin_settings (key, value) VALUES (?, ?)').run('default', JSON.stringify(state.settings));
  }
}

function toJsonValue(value) {
  return JSON.stringify(value ?? []);
}

function readAdminUsers() {
  return getDb().prepare('SELECT * FROM admin_users ORDER BY created_at DESC').all().map((row) => ({
    id: row.id,
    name: row.full_name,
    username: row.username,
    email: row.email,
    role: row.role,
    department: row.department,
    status: row.status,
    permissions: JSON.parse(row.permissions || '[]'),
  }));
}

function readAdminContent() {
  return getDb().prepare('SELECT * FROM admin_content ORDER BY created_at DESC').all().map((row) => ({
    id: row.id,
    title: row.title,
    category: row.category,
    author: row.author,
    status: row.status,
    tags: JSON.parse(row.tags || '[]'),
  }));
}

function readAdminNotifications() {
  return getDb().prepare('SELECT * FROM admin_notifications ORDER BY created_at DESC').all().map((row) => ({
    id: row.id,
    title: row.title,
    audience: row.audience,
    type: row.type,
    status: row.status,
    message: row.message || '',
    createdAt: row.created_at,
  }));
}

function readAdminSettings() {
  const row = getDb().prepare('SELECT value FROM admin_settings WHERE key = ?').get('default');
  if (!row) return defaultState().settings;
  try {
    return JSON.parse(row.value || '{}');
  } catch {
    return defaultState().settings;
  }
}

async function login(username, password) {
  await ensureEnvironmentAdminAccount();
  const user = getDb().prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username);
  if (!user) {
    throw Object.assign(new Error('Invalid admin username or password.'), { code: 'E_INVALID_CREDENTIALS' });
  }

  const isMatch = await verifyPassword(user.password_hash, password);
  if (!isMatch) {
    throw Object.assign(new Error('Invalid admin username or password.'), { code: 'E_INVALID_CREDENTIALS' });
  }

  const result = await require('./auth.service').login(username, password, { host: 'admin-panel' });
  return result;
}

async function logout(token) {
  return require('./auth.service').logout(token, { reason: 'admin_logout' });
}

async function loadDashboardState() {
  await ensureEnvironmentAdminAccount();
  await ensureAdminStateSeed();
  return {
    users: readAdminUsers(),
    content: readAdminContent(),
    notifications: readAdminNotifications(),
    settings: readAdminSettings(),
  };
}

async function saveDashboardState(payload = {}) {
  const db = getDb();
  const users = Array.isArray(payload.users) ? payload.users : readAdminUsers();
  const content = Array.isArray(payload.content) ? payload.content : readAdminContent();
  const notifications = Array.isArray(payload.notifications) ? payload.notifications : readAdminNotifications();
  const settings = payload.settings && typeof payload.settings === 'object' ? payload.settings : readAdminSettings();

  db.prepare('DELETE FROM admin_users').run();
  for (const user of users) {
    db.prepare(`
      INSERT INTO admin_users (id, username, full_name, email, role, department, status, permissions, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      user.id || `admin-user-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      user.username || 'admin',
      user.name || user.full_name || 'Admin',
      user.email || '',
      user.role || 'Super Admin',
      user.department || 'Operations',
      user.status || 'Active',
      JSON.stringify(user.permissions || []),
    );
  }

  db.prepare('DELETE FROM admin_content').run();
  for (const item of content) {
    db.prepare(`
      INSERT INTO admin_content (id, title, category, author, status, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      item.id || `content-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      item.title || 'Untitled',
      item.category || 'General',
      item.author || 'Admin',
      item.status || 'Draft',
      JSON.stringify(item.tags || []),
    );
  }

  db.prepare('DELETE FROM admin_notifications').run();
  for (const item of notifications) {
    db.prepare(`
      INSERT INTO admin_notifications (id, title, audience, type, status, message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      item.id || `notify-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      item.title || 'Notification',
      item.audience || 'All Admins',
      item.type || 'Admin Update',
      item.status || 'Pending',
      item.message || '',
      item.createdAt || new Date().toISOString().slice(0, 10),
    );
  }

  db.prepare('INSERT INTO admin_settings (key, value, updated_at) VALUES (?, ?, datetime("now")) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime("now")').run('default', JSON.stringify(settings));
  return loadDashboardState();
}

async function resetPassword(secret, newPassword) {
  const env = DEFAULT_ADMIN;
  if (secret !== env.resetSecret) {
    throw Object.assign(new Error('Reset secret is invalid.'), { code: 'E_FORBIDDEN' });
  }

  if (typeof newPassword !== 'string' || newPassword.trim().length < 6) {
    throw Object.assign(new Error('The new password must be at least 6 characters.'), { code: 'E_VALIDATION' });
  }

  const db = getDb();
  const adminUser = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(env.username);
  if (!adminUser) {
    await ensureEnvironmentAdminAccount();
  }

  const passwordHash = await hashPassword(newPassword.trim());
  process.env.VITE_ADMIN_PASSWORD = newPassword.trim();
  db.prepare('UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE username = ? COLLATE NOCASE').run(passwordHash, env.username);
  return { ok: true, message: 'Admin password reset successful.' };
}

module.exports = {
  ensureEnvironmentAdminAccount,
  ensureAdminStateSeed,
  login,
  logout,
  loadDashboardState,
  saveDashboardState,
  resetPassword,
  defaultState,
};
