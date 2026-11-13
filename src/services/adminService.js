import { getAdminCredentials } from '../config/adminConfig';

const STORAGE_KEY = 'pharmacy-admin-state-v1';

export const defaultUsers = [
  {
    id: 'user-admin',
    name: 'Main Admin',
    username: 'admin',
    email: 'admin@pharmacy.local',
    role: 'Super Admin',
    department: 'Operations',
    status: 'Active',
    permissions: ['users', 'content', 'analytics', 'settings', 'notifications'],
  },
];

const DEMO_USERNAMES = new Set(['counter1', 'pharmacist1', 'customercare']);

export const defaultContent = [
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
  {
    id: 'content-3',
    title: 'New supplier onboarding',
    category: 'Operations',
    author: 'Admin',
    status: 'Published',
    tags: ['supplier', 'inventory'],
  },
];

export const defaultNotifications = [
  {
    id: 'notify-1',
    title: 'Low stock alert',
    audience: 'Pharmacist Team',
    type: 'System Alert',
    status: 'Pending',
    createdAt: '2026-11-13',
  },
  {
    id: 'notify-2',
    title: 'New supplier added',
    audience: 'Warehouse Team',
    type: 'Admin Update',
    status: 'Sent',
    createdAt: '2026-11-12',
  },
  {
    id: 'notify-3',
    title: 'Security review completed',
    audience: 'All Admins',
    type: 'Security',
    status: 'Read',
    createdAt: '2026-11-10',
  },
];

export const defaultSettings = {
  siteName: 'Pharmacy POS Admin',
  supportEmail: 'support@pharmacy.local',
  timezone: 'Asia/Karachi',
  maintenanceMode: false,
  twoFactor: true,
  auditLogs: true,
};

export function buildDefaultAdminState() {
  const adminCreds = getAdminCredentials();
  return {
    users: [
      {
        ...defaultUsers[0],
        username: adminCreds.username,
        email: adminCreds.email,
      },
      ...defaultUsers.slice(1),
    ],
    content: [...defaultContent],
    notifications: [...defaultNotifications],
    settings: { ...defaultSettings },
  };
}

export function loadAdminState() {
  if (typeof window === 'undefined') {
    return buildDefaultAdminState();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const state = buildDefaultAdminState();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return state;
    }

    const parsed = JSON.parse(raw);
    const users = Array.isArray(parsed.users)
      ? parsed.users.filter((user) => !DEMO_USERNAMES.has(String(user.username || '').toLowerCase()))
      : buildDefaultAdminState().users;
    return {
      users: users.length ? users : buildDefaultAdminState().users,
      content: Array.isArray(parsed.content) ? parsed.content : buildDefaultAdminState().content,
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : buildDefaultAdminState().notifications,
      settings: parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : buildDefaultAdminState().settings,
    };
  } catch (error) {
    console.error('Failed to read admin state from storage:', error);
    const state = buildDefaultAdminState();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return state;
  }
}

export function saveAdminState(state) {
  if (typeof window === 'undefined') return state;
  const payload = {
    users: Array.isArray(state.users)
      ? state.users.filter((user) => !DEMO_USERNAMES.has(String(user.username || '').toLowerCase()))
      : buildDefaultAdminState().users,
    content: Array.isArray(state.content) ? state.content : buildDefaultAdminState().content,
    notifications: Array.isArray(state.notifications) ? state.notifications : buildDefaultAdminState().notifications,
    settings: state.settings && typeof state.settings === 'object' ? state.settings : buildDefaultAdminState().settings,
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

  const staffUsers = payload.users
    .filter((user) => user.canLogin === true && user.status === 'Active' && typeof user.password === 'string' && user.password.length > 0)
    .map(({ id, name, username, email, role, department, status, permissions, password, canLogin }) => ({
      id,
      name,
      username,
      email,
      role,
      department,
      status,
      permissions,
      password,
      canLogin: canLogin !== false,
    }));

  window.localStorage.setItem('pharmacy-staff-users-v1', JSON.stringify(staffUsers));
  return payload;
}

export function ensureAdminBootstrap() {
  const state = loadAdminState();
  const adminCreds = getAdminCredentials();
  const adminUser = state.users.find((user) => user.username === adminCreds.username);

  if (!adminUser) {
    const nextState = {
      ...state,
      users: [
        {
          ...defaultUsers[0],
          username: adminCreds.username,
          email: adminCreds.email,
        },
        ...state.users,
      ],
    };
    return saveAdminState(nextState);
  }

  return saveAdminState(state);
}
