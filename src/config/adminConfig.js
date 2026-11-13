const toHex = (bytes) => Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');

const hashText = async (value) => {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return toHex(new Uint8Array(digest));
};

export const getAdminCredentials = () => ({
  username: import.meta.env.VITE_ADMIN_USERNAME || 'admin',
  email: import.meta.env.VITE_ADMIN_EMAIL || 'admin@pharmacy.local',
  mobile: import.meta.env.VITE_ADMIN_MOBILE || '+92-300-0000000',
  password: import.meta.env.VITE_ADMIN_PASSWORD || 'admin123',
  resetSecret: import.meta.env.VITE_ADMIN_RESET_SECRET || 'change-this-secret',
});

export const getStoredAdminPasswordHash = async () => {
  if (typeof window === 'undefined') {
    return await hashText(getAdminCredentials().password);
  }

  return window.localStorage.getItem('pharmacy-admin-password-hash') || (await hashText(getAdminCredentials().password));
};

export const setStoredAdminPasswordHash = async (password) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('pharmacy-admin-password-hash', await hashText(password));
};

export const issueAdminPasswordResetCode = async (deliveryTarget, secret) => {
  const adminCreds = getAdminCredentials();
  const normalizedTarget = String(deliveryTarget || '').trim().toLowerCase();
  const validTargets = [adminCreds.email, adminCreds.mobile, adminCreds.username].map((item) => String(item || '').trim().toLowerCase());

  if (!normalizedTarget) {
    throw new Error('Registration email or mobile number is required.');
  }

  if (secret !== adminCreds.resetSecret) {
    throw new Error('Reset secret does not match the environment value.');
  }

  if (!validTargets.includes(normalizedTarget)) {
    throw new Error('This email or mobile number is not registered for the admin account.');
  }

  const payload = `${normalizedTarget}:${adminCreds.username}:${secret}:${Date.now()}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  const code = String(Number.parseInt(toHex(new Uint8Array(digest)).slice(0, 6), 16) % 1000000).padStart(6, '0');
  const request = { target: normalizedTarget, code, expiresAt: Date.now() + 10 * 60 * 1000 };

  if (typeof window !== 'undefined') {
    window.localStorage.setItem('pharmacy-admin-reset-request', JSON.stringify(request));
  }

  return code;
};

export const completeAdminPasswordReset = async ({ deliveryTarget, secret, code, newPassword }) => {
  const adminCreds = getAdminCredentials();
  const normalizedTarget = String(deliveryTarget || '').trim().toLowerCase();
  const validTargets = [adminCreds.email, adminCreds.mobile, adminCreds.username].map((item) => String(item || '').trim().toLowerCase());

  if (!normalizedTarget || !validTargets.includes(normalizedTarget)) {
    throw new Error('The registered target is invalid.');
  }

  if (secret !== adminCreds.resetSecret) {
    throw new Error('Reset secret does not match the environment value.');
  }

  if (typeof newPassword !== 'string' || newPassword.trim().length < 6) {
    throw new Error('The new password must be at least 6 characters long.');
  }

  if (typeof window === 'undefined') {
    throw new Error('Password reset is only available in the app runtime.');
  }

  const savedRequest = JSON.parse(window.localStorage.getItem('pharmacy-admin-reset-request') || 'null');
  if (!savedRequest || savedRequest.target !== normalizedTarget || savedRequest.code !== String(code)) {
    throw new Error('The reset code is invalid or expired.');
  }

  if (Date.now() > savedRequest.expiresAt) {
    window.localStorage.removeItem('pharmacy-admin-reset-request');
    throw new Error('The reset code has expired. Please request a new one.');
  }

  await setStoredAdminPasswordHash(newPassword.trim());
  window.localStorage.removeItem('pharmacy-admin-reset-request');
  return true;
};

export const verifyAdminLogin = async (username, password) => {
  const adminCreds = getAdminCredentials();
  const providedHash = await hashText(password);
  const storedHash = await getStoredAdminPasswordHash();

  if (username !== adminCreds.username) {
    return false;
  }

  return providedHash === storedHash || providedHash === (await hashText(adminCreds.password));
};
