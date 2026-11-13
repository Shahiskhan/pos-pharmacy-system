const STORAGE_KEY = 'pharmacy-staff-users-v1';
const SESSION_KEY = 'pharmacy-active-user';

const stableHash = async (value) => {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export function getStoredStaffUsers() {
  if (typeof window === 'undefined') return [];

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Could not read staff users:', error);
    return [];
  }
}

export function saveStoredStaffUsers(users) {
  if (typeof window === 'undefined') return users;
  const normalized = Array.isArray(users) ? users : [];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function getSessionUser() {
  if (typeof window === 'undefined') return null;
  try {
    const saved = window.localStorage.getItem(SESSION_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

export function setSessionUser(user) {
  if (typeof window === 'undefined') return;
  if (!user) {
    window.localStorage.removeItem(SESSION_KEY);
    return;
  }
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export async function syncDefaultStaffUsers() {
  const demoUsernames = new Set(['counter1', 'pharmacist1', 'customercare']);
  const users = getStoredStaffUsers().filter((user) => !demoUsernames.has(String(user.username || '').toLowerCase()));
  return saveStoredStaffUsers(users);
}

export async function loginStaffUser(username, password) {
  const users = getStoredStaffUsers();
  const found = users.find((user) => user.username === username && user.canLogin !== false && user.status !== 'Inactive');

  if (!found) {
    return null;
  }

  const storedHash = await stableHash(found.password || '');
  const enteredHash = await stableHash(password || '');

  if (storedHash !== enteredHash) {
    return null;
  }

  const session = {
    id: found.id,
    name: found.name,
    username: found.username,
    email: found.email,
    role: found.role,
    department: found.department,
    status: found.status,
    permissions: found.permissions || [],
  };

  setSessionUser(session);
  return session;
}

export function logoutStaffUser() {
  setSessionUser(null);
}
