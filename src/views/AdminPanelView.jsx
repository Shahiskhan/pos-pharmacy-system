import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bell,
  Building2,
  CheckCircle2,
  ChevronRight,
  FileText,
  KeyRound,
  LogOut,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
  BarChart3,
  Settings2,
  Search,
  UserRound,
} from 'lucide-react';
import { getAdminCredentials, verifyAdminLogin, getStoredAdminPasswordHash, setStoredAdminPasswordHash } from '../config/adminConfig';
import { defaultContent, defaultNotifications, defaultSettings, defaultUsers, ensureAdminBootstrap, loadAdminState, saveAdminState } from '../services/adminService';
import { getMedicines } from '../services/localDb';
import ExcelImportView from './ExcelImportView';
import SuppliersView from './SuppliersView';
import ReportsView from './ReportsView';
import SettingsView from './SettingsView';

const permissionOptions = ['billing', 'inventory', 'reports', 'users', 'content', 'settings', 'notifications'];

const sectionConfig = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'users', label: 'User Management', icon: Users },
  { id: 'content', label: 'Content Management', icon: FileText },
  { id: 'excel-import', label: 'Excel Import', icon: FileText },
  { id: 'suppliers', label: 'Suppliers', icon: Building2 },
  { id: 'analytics', label: 'Reports & Analytics', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings2 },
  { id: 'notifications', label: 'Notifications', icon: Bell },
];

export default function AdminPanelView({ onNavigate, onLogout }) {
  const adminCreds = getAdminCredentials();
  const [authenticated, setAuthenticated] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('pharmacy-admin-session') === 'active';
  });
  const [activeSection, setActiveSection] = useState('overview');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [resetPasswordForm, setResetPasswordForm] = useState({ secret: '', newPassword: '' });
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');
  const bootstrapState = ensureAdminBootstrap();
  const [users, setUsers] = useState(bootstrapState.users);
  const [contentItems, setContentItems] = useState(bootstrapState.content);
  const [notifications, setNotifications] = useState(bootstrapState.notifications);
  const [inventoryAlerts, setInventoryAlerts] = useState([]);
  const [inventoryAlertError, setInventoryAlertError] = useState('');
  const [settings, setSettings] = useState(bootstrapState.settings);
  const [userForm, setUserForm] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    role: 'Counter Staff',
    department: 'Counter',
    status: 'Active',
    permissions: ['billing'],
    canLogin: true,
  });
  const [editingUserId, setEditingUserId] = useState(null);
  const [contentForm, setContentForm] = useState({
    title: '',
    category: 'Health Tips',
    author: 'Admin',
    status: 'Draft',
    tags: 'news, updates',
  });
  const [editingContentId, setEditingContentId] = useState(null);
  const [notifyForm, setNotifyForm] = useState({
    title: '',
    audience: 'All Admins',
    type: 'Admin Update',
    message: '',
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      saveAdminState({ users, content: contentItems, notifications, settings });
    }
  }, [users, contentItems, notifications, settings]);

  useEffect(() => {
    if (!authenticated) return undefined;

    let cancelled = false;
    const loadInventoryAlerts = async () => {
      try {
        const medicines = await getMedicines();
        if (cancelled) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const alerts = [];

        medicines.forEach((medicine) => {
          const quantity = Number(medicine.quantity) || 0;
          const name = medicine.productName || 'Unnamed medicine';

          if (quantity <= 0) {
            alerts.push({
              id: `${medicine.id || medicine.barcode || name}-out-of-stock`,
              title: 'Out of stock',
              productName: name,
              detail: `Batch ${medicine.batchNo || '—'} has no remaining units.`,
              severity: 'critical',
            });
          } else if (quantity <= 15) {
            alerts.push({
              id: `${medicine.id || medicine.barcode || name}-low-stock`,
              title: 'Low stock',
              productName: name,
              detail: `Only ${quantity} units left · Batch ${medicine.batchNo || '—'}.`,
              severity: 'warning',
            });
          }

          if (medicine.expiryDate) {
            const expiryDate = new Date(`${String(medicine.expiryDate).slice(0, 10)}T00:00:00`);
            if (!Number.isNaN(expiryDate.getTime())) {
              const daysRemaining = Math.ceil((expiryDate.getTime() - today.getTime()) / 86400000);
              if (daysRemaining < 0) {
                alerts.push({
                  id: `${medicine.id || medicine.barcode || name}-expired`,
                  title: 'Expired product',
                  productName: name,
                  detail: `Batch ${medicine.batchNo || '—'} expired on ${String(medicine.expiryDate).slice(0, 10)}.`,
                  severity: 'critical',
                });
              } else if (daysRemaining <= 30) {
                alerts.push({
                  id: `${medicine.id || medicine.barcode || name}-expiring`,
                  title: daysRemaining === 0 ? 'Expires today' : `Expires in ${daysRemaining} days`,
                  productName: name,
                  detail: `Batch ${medicine.batchNo || '—'} · Expiry ${String(medicine.expiryDate).slice(0, 10)}.`,
                  severity: 'warning',
                });
              }
            }
          }
        });

        setInventoryAlerts(alerts);
        setInventoryAlertError('');
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load inventory alerts:', error);
        setInventoryAlertError('Inventory warnings could not be loaded. Please try again.');
      }
    };

    loadInventoryAlerts();
    window.addEventListener('pharmacydbchange', loadInventoryAlerts);
    const refreshTimer = window.setInterval(loadInventoryAlerts, 60000);

    return () => {
      cancelled = true;
      window.removeEventListener('pharmacydbchange', loadInventoryAlerts);
      window.clearInterval(refreshTimer);
    };
  }, [authenticated]);

  const metrics = useMemo(() => {
    const activityCount = users.filter((user) => user.status === 'Active').length;
    const publishedCount = contentItems.filter((item) => item.status === 'Published').length;
    const pendingNotifications = notifications.filter((item) => item.status === 'Pending').length;
    const monthlyGrowth = Math.min(92, 42 + publishedCount * 7 + activityCount * 3);

    return [
      { label: 'Active users', value: String(activityCount), detail: 'Live staff accounts' },
      { label: 'Published content', value: String(publishedCount), detail: 'Website and updates' },
      { label: 'Pending alerts', value: String(pendingNotifications), detail: 'Admin notifications' },
      { label: 'Growth this month', value: `${monthlyGrowth}%`, detail: 'Content and usage' },
    ];
  }, [contentItems, notifications, users]);

  const handleLogin = async (event) => {
    event.preventDefault();

    try {
      const verified = await verifyAdminLogin(loginForm.username, loginForm.password);

      if (verified) {
        setAuthenticated(true);
        setLoginError('');
        window.localStorage.setItem('pharmacy-admin-session', 'active');
        return;
      }

      setLoginError('Invalid admin username or password. Check the .env values.');
    } catch (error) {
      console.error('Admin login failed:', error);
      setLoginError('Login failed due to a security check error.');
    }
  };

  const handleLogout = () => {
    setAuthenticated(false);
    setLoginForm({ username: '', password: '' });
    window.localStorage.removeItem('pharmacy-admin-session');
    onLogout?.();
  };

  const handlePasswordReset = async (event) => {
    event.preventDefault();
    if (resetPasswordForm.secret !== adminCreds.resetSecret) {
      setResetError('Reset secret does not match the environment value.');
      setResetMessage('');
      return;
    }

    if (resetPasswordForm.newPassword.trim().length < 6) {
      setResetError('New password must be at least 6 characters.');
      setResetMessage('');
      return;
    }

    try {
      await setStoredAdminPasswordHash(resetPasswordForm.newPassword.trim());
      setResetMessage('Password reset successful. Use the new password on your next login.');
      setResetError('');
      setResetPasswordForm({ secret: '', newPassword: '' });
    } catch (error) {
      console.error('Password reset failed:', error);
      setResetError('Password reset failed due to a security check error.');
      setResetMessage('');
    }
  };

  const handleUserSubmit = (event) => {
    event.preventDefault();

    const existingUser = editingUserId ? users.find((user) => user.id === editingUserId) : null;
    const nextUser = {
      ...(existingUser || {}),
      id: editingUserId || `user-${Date.now()}`,
      name: userForm.name,
      username: userForm.username,
      email: userForm.email,
      ...(userForm.password ? { password: userForm.password } : {}),
      role: userForm.role,
      department: userForm.department,
      status: userForm.status,
      permissions: userForm.permissions,
      canLogin: userForm.canLogin,
    };

    if (editingUserId) {
      setUsers((currentUsers) => currentUsers.map((user) => (user.id === editingUserId ? nextUser : user)));
    } else {
      setUsers((currentUsers) => [nextUser, ...currentUsers]);
    }

    setUserForm({
      name: '',
      username: '',
      email: '',
      password: '',
      role: 'Counter Staff',
      department: 'Counter',
      status: 'Active',
      permissions: ['billing'],
      canLogin: true,
    });
    setEditingUserId(null);
  };

  const handleEditUser = (user) => {
    setEditingUserId(user.id);
    setUserForm({
      name: user.name,
      username: user.username,
      email: user.email,
      password: user.password || '',
      role: user.role,
      department: user.department,
      status: user.status,
      permissions: user.permissions || ['billing'],
      canLogin: user.canLogin !== false,
    });
    setActiveSection('users');
  };

  const handleDeleteUser = (userId) => {
    setUsers((currentUsers) => currentUsers.filter((user) => user.id !== userId));
  };

  const handlePermissionToggle = (permission) => {
    setUserForm((currentForm) => ({
      ...currentForm,
      permissions: currentForm.permissions.includes(permission)
        ? currentForm.permissions.filter((item) => item !== permission)
        : [...currentForm.permissions, permission],
    }));
  };

  const handleContentSubmit = (event) => {
    event.preventDefault();
    const nextItem = {
      id: editingContentId || `content-${Date.now()}`,
      title: contentForm.title,
      category: contentForm.category,
      author: contentForm.author,
      status: contentForm.status,
      tags: contentForm.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
    };

    if (editingContentId) {
      setContentItems((current) => current.map((item) => (item.id === editingContentId ? nextItem : item)));
    } else {
      setContentItems((current) => [nextItem, ...current]);
    }

    setContentForm({
      title: '',
      category: 'Health Tips',
      author: 'Admin',
      status: 'Draft',
      tags: 'news, updates',
    });
    setEditingContentId(null);
  };

  const handleEditContent = (item) => {
    setEditingContentId(item.id);
    setContentForm({
      title: item.title,
      category: item.category,
      author: item.author,
      status: item.status,
      tags: item.tags.join(', '),
    });
    setActiveSection('content');
  };

  const handleDeleteContent = (itemId) => {
    setContentItems((current) => current.filter((item) => item.id !== itemId));
  };

  const handleNotificationSubmit = (event) => {
    event.preventDefault();
    if (!notifyForm.title.trim()) return;

    setNotifications((current) => [
      {
        id: `notify-${Date.now()}`,
        title: notifyForm.title,
        audience: notifyForm.audience,
        type: notifyForm.type,
        status: 'Pending',
        createdAt: new Date().toISOString().slice(0, 10),
      },
      ...current,
    ]);

    setNotifyForm({ title: '', audience: 'All Admins', type: 'Admin Update', message: '' });
  };

  if (!authenticated) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-slate-100 p-6">
        <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
          <div className="grid lg:grid-cols-2">
            <div className="bg-gradient-to-br from-emerald-700 via-emerald-800 to-teal-900 p-10 text-white">
              <button
                type="button"
                onClick={() => onNavigate?.('login')}
                className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to POS login
              </button>
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-2xl font-black shadow-inner">Rx</div>
              <p className="mb-2 text-sm uppercase tracking-[0.2em] text-emerald-100">Secure Admin Access</p>
              <h1 className="text-3xl font-extrabold">Pharmacy Admin Console</h1>
              <p className="mt-4 max-w-md text-sm text-emerald-50/90 leading-6">
                Main admin credentials are configured from environment variables. This keeps the primary account locked to the configured environment and lets higher-level staff manage users, content, reports, notifications, and system settings.
              </p>

              <div className="mt-8 space-y-3 rounded-2xl border border-emerald-300/30 bg-emerald-950/20 p-4 text-sm">
                <div className="flex justify-between gap-3 border-b border-emerald-400/20 pb-2">
                  <span>Username</span>
                  <span className="font-semibold">{adminCreds.username}</span>
                </div>
                <div className="flex justify-between gap-3 border-b border-emerald-400/20 pb-2">
                  <span>Email</span>
                  <span className="font-semibold">{adminCreds.email}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>Reset secret</span>
                  <span className="font-semibold">Configured in .env</span>
                </div>
              </div>
            </div>

            <div className="p-10">
              <div className="mb-6 flex items-center gap-3">
                <ShieldCheck className="h-6 w-6 text-emerald-600" />
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Sign in</h2>
                  <p className="text-sm text-slate-500">Use your admin environment credentials.</p>
                </div>
              </div>

              <form onSubmit={handleLogin} className="space-y-5">
                <label className="block text-sm font-medium text-slate-700">
                  Username
                  <input
                    type="text"
                    value={loginForm.username}
                    onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))}
                    className="mt-2 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                    placeholder="admin"
                    required
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Password
                  <input
                    type="password"
                    value={loginForm.password}
                    onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                    className="mt-2 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                    placeholder="••••••••"
                    required
                  />
                </label>

                {loginError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{loginError}</div>
                )}

                <button
                  type="submit"
                  className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-500"
                >
                  Login to admin panel
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate?.('admin-forgot-password')}
                  className="mt-3 w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                >
                  Forgot password?
                </button>
              </form>

              <form onSubmit={handlePasswordReset} className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <KeyRound className="h-4 w-4 text-emerald-600" />
                  Reset admin password
                </div>

                <div className="space-y-3">
                  <input
                    type="text"
                    value={resetPasswordForm.secret}
                    onChange={(event) => setResetPasswordForm((current) => ({ ...current, secret: event.target.value }))}
                    className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    placeholder="Reset secret from .env"
                  />
                  <input
                    type="password"
                    value={resetPasswordForm.newPassword}
                    onChange={(event) => setResetPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                    className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    placeholder="New password"
                  />
                </div>

                {resetError && <div className="mt-3 text-xs text-rose-700">{resetError}</div>}
                {resetMessage && <div className="mt-3 text-xs text-emerald-700">{resetMessage}</div>}

                <button
                  type="submit"
                  className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Update password
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const renderSection = () => {
    switch (activeSection) {
      case 'users':
        return (
          <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
            <div className="rounded-2xl border border-emerald-100 bg-gradient-to-r from-white to-emerald-50 p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">User Management</h3>
                  <p className="text-sm text-slate-500">Add, edit, and control staff access.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingUserId(null);
                    setUserForm({
                      name: '',
                      username: '',
                      email: '',
                      password: '',
                      role: 'Counter Staff',
                      department: 'Counter',
                      status: 'Active',
                      permissions: ['billing'],
                      canLogin: true,
                    });
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add user
                </button>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 font-semibold text-slate-600">Name</th>
                      <th className="px-3 py-2 font-semibold text-slate-600">Role</th>
                      <th className="px-3 py-2 font-semibold text-slate-600">Department</th>
                      <th className="px-3 py-2 font-semibold text-slate-600">Access</th>
                      <th className="px-3 py-2 font-semibold text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td className="px-3 py-3">
                          <div className="font-medium text-slate-800">{user.name}</div>
                          <div className="text-xs text-slate-500">{user.email}</div>
                        </td>
                        <td className="px-3 py-3 text-slate-700">{user.role}</td>
                        <td className="px-3 py-3 text-slate-700">{user.department}</td>
                        <td className="px-3 py-3 text-slate-700">
                          <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                            {user.status}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex gap-2">
                            <button type="button" onClick={() => handleEditUser(user)} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-700 hover:bg-slate-100">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={() => handleDeleteUser(user.id)} className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-600 hover:bg-rose-100">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-bold text-slate-800">{editingUserId ? 'Edit user' : 'Add new user'}</h3>
              <form onSubmit={handleUserSubmit} className="mt-4 space-y-4">
                <input value={userForm.name} onChange={(event) => setUserForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500" placeholder="Full name" required />
                <input value={userForm.username} onChange={(event) => setUserForm((current) => ({ ...current, username: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500" placeholder="Username" required />
                <input type="email" value={userForm.email} onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500" placeholder="Email" required />
                <input type="password" value={userForm.password} onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500" placeholder={editingUserId ? 'Leave blank to keep current password' : 'Set staff login password'} required={!editingUserId} />
                <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <span>Allow login</span>
                  <input type="checkbox" checked={userForm.canLogin} onChange={(event) => setUserForm((current) => ({ ...current, canLogin: event.target.checked }))} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <select value={userForm.role} onChange={(event) => setUserForm((current) => ({ ...current, role: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500">
                    <option>Super Admin</option>
                    <option>Manager</option>
                    <option>Pharmacist</option>
                    <option>Counter Staff</option>
                    <option>Customer Relation</option>
                  </select>
                  <select value={userForm.department} onChange={(event) => setUserForm((current) => ({ ...current, department: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500">
                    <option>Operations</option>
                    <option>Counter</option>
                    <option>Dispensing</option>
                    <option>Warehouse</option>
                  </select>
                </div>
                <select value={userForm.status} onChange={(event) => setUserForm((current) => ({ ...current, status: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500">
                  <option>Active</option>
                  <option>Inactive</option>
                  <option>Pending</option>
                </select>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Permissions</p>
                  <div className="grid grid-cols-2 gap-2">
                    {permissionOptions.map((permission) => (
                      <label key={permission} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={userForm.permissions.includes(permission)}
                          onChange={() => handlePermissionToggle(permission)}
                        />
                        {permission}
                      </label>
                    ))}
                  </div>
                </div>

                <button type="submit" className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
                  {editingUserId ? 'Save changes' : 'Create user'}
                </button>
              </form>
            </div>
          </div>
        );
      case 'content':
        return (
          <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Content Management</h3>
                  <p className="text-sm text-slate-500">Publish or manage content, categories, and tags.</p>
                </div>
                <button type="button" onClick={() => { setEditingContentId(null); setContentForm({ title:'', category:'Health Tips', author:'Admin', status:'Draft', tags:'news, updates' }); }} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">
                  <Plus className="h-3.5 w-3.5" />
                  Add content
                </button>
              </div>

              <div className="space-y-3">
                {contentItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div>
                      <div className="font-semibold text-slate-800">{item.title}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-slate-500">
                        <span className="rounded-full bg-white px-2 py-0.5">{item.category}</span>
                        {item.tags.map((tag) => (
                          <span key={tag} className="rounded-full border border-slate-200 bg-white px-2 py-0.5">#{tag}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">{item.status}</span>
                      <button type="button" onClick={() => handleEditContent(item)} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700"><Pencil className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => handleDeleteContent(item.id)} className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-bold text-slate-800">{editingContentId ? 'Edit article' : 'Create content'}</h3>
              <form onSubmit={handleContentSubmit} className="mt-4 space-y-3">
                <input value={contentForm.title} onChange={(event) => setContentForm((current) => ({ ...current, title: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500" placeholder="Title" required />
                <div className="grid grid-cols-2 gap-3">
                  <input value={contentForm.category} onChange={(event) => setContentForm((current) => ({ ...current, category: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500" placeholder="Category" />
                  <input value={contentForm.author} onChange={(event) => setContentForm((current) => ({ ...current, author: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500" placeholder="Author" />
                </div>
                <select value={contentForm.status} onChange={(event) => setContentForm((current) => ({ ...current, status: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500">
                  <option>Draft</option>
                  <option>Published</option>
                  <option>Scheduled</option>
                </select>
                <input value={contentForm.tags} onChange={(event) => setContentForm((current) => ({ ...current, tags: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500" placeholder="Tags (comma separated)" />
                <button type="submit" className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">{editingContentId ? 'Save changes' : 'Publish content'}</button>
              </form>
            </div>
          </div>
        );
      case 'excel-import':
        return <ExcelImportView onNavigate={onNavigate || (() => {})} />;
      case 'suppliers':
        return <SuppliersView onNavigate={onNavigate || (() => {})} />;
      case 'analytics':
        return <ReportsView onNavigate={onNavigate || (() => {})} />;
      case 'settings':
        return (
          <div className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800">System settings</h3>
                <div className="mt-4 space-y-4">
                  <label className="block text-sm text-slate-700">
                    Site name
                    <input value={settings.siteName} onChange={(event) => setSettings((current) => ({ ...current, siteName: event.target.value }))} className="mt-2 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500" />
                  </label>
                  <label className="block text-sm text-slate-700">
                    Support email
                    <input value={settings.supportEmail} onChange={(event) => setSettings((current) => ({ ...current, supportEmail: event.target.value }))} className="mt-2 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500" />
                  </label>
                  <label className="block text-sm text-slate-700">
                    Timezone
                    <input value={settings.timezone} onChange={(event) => setSettings((current) => ({ ...current, timezone: event.target.value }))} className="mt-2 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500" />
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800">Security controls</h3>
                <div className="mt-4 space-y-4">
                  {[
                    ['maintenanceMode', 'Maintenance mode'],
                    ['twoFactor', 'Two-factor verification'],
                    ['auditLogs', 'Audit logs'],
                  ].map(([key, label]) => (
                    <label key={key} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                      <span>{label}</span>
                      <input
                        type="checkbox"
                        checked={Boolean(settings[key])}
                        onChange={(event) => setSettings((current) => ({ ...current, [key]: event.target.checked }))}
                      />
                    </label>
                  ))}
                </div>

                <form onSubmit={handlePasswordReset} className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <KeyRound className="h-4 w-4 text-emerald-600" />
                    Reset admin password
                  </div>

                  <div className="space-y-3">
                    <input
                      type="text"
                      value={resetPasswordForm.secret}
                      onChange={(event) => setResetPasswordForm((current) => ({ ...current, secret: event.target.value }))}
                      className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
                      placeholder="Reset secret from .env"
                    />
                    <input
                      type="password"
                      value={resetPasswordForm.newPassword}
                      onChange={(event) => setResetPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                      className="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
                      placeholder="New password"
                    />
                  </div>

                  {resetError && <div className="mt-3 text-xs text-rose-700">{resetError}</div>}
                  {resetMessage && <div className="mt-3 text-xs text-emerald-700">{resetMessage}</div>}

                  <button type="submit" className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
                    Save new password
                  </button>
                </form>
              </div>
            </div>
            <SettingsView />
          </div>
        );
      case 'notifications':
        return (
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6">
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-center justify-between gap-4 bg-gradient-to-r from-rose-50 via-amber-50 to-white p-5">
                      <div>
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-amber-600" />
                          <h3 className="text-lg font-bold text-slate-800">Inventory warnings</h3>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">Live stock and expiry checks from your medicine inventory.</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${inventoryAlerts.length ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {inventoryAlerts.length} active
                      </span>
                    </div>

                    <div className="space-y-3 p-5">
                      {inventoryAlertError && (
                        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                          {inventoryAlertError}
                        </div>
                      )}
                      {inventoryAlerts.length === 0 && !inventoryAlertError && (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                          Inventory is clear: no out-of-stock, low-stock, or near-expiry products found.
                        </div>
                      )}
                      {inventoryAlerts.map((alert) => {
                        const critical = alert.severity === 'critical';
                        return (
                          <div
                            key={alert.id}
                            role={critical ? 'alert' : undefined}
                            className={`flex items-start gap-3 rounded-xl border p-4 ${critical ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}
                          >
                            <span className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${critical ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                              <AlertTriangle className="h-4 w-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <h4 className={`text-sm font-bold ${critical ? 'text-rose-800' : 'text-amber-800'}`}>{alert.title}</h4>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${critical ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                                  {critical ? 'Urgent' : 'Warning'}
                                </span>
                              </div>
                              <p className="mt-1 truncate text-sm font-semibold text-slate-800">{alert.productName}</p>
                              <p className="mt-0.5 text-xs leading-5 text-slate-600">{alert.detail}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-lg font-bold text-slate-800">Admin notifications</h3>
                    <div className="mt-4 space-y-3">
                      {notifications.map((item) => (
                        <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="font-semibold text-slate-800">{item.title}</div>
                              <div className="text-xs text-slate-500">{item.audience}</div>
                            </div>
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">{item.status}</span>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                            <span>{item.type}</span>
                            <span>{item.createdAt}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
              </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-bold text-slate-800">Send notification</h3>
              <form onSubmit={handleNotificationSubmit} className="mt-4 space-y-3">
                <input value={notifyForm.title} onChange={(event) => setNotifyForm((current) => ({ ...current, title: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500" placeholder="Notification title" required />
                <select value={notifyForm.audience} onChange={(event) => setNotifyForm((current) => ({ ...current, audience: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500">
                  <option>All Admins</option>
                  <option>Pharmacist Team</option>
                  <option>Warehouse Team</option>
                  <option>Counter Team</option>
                </select>
                <select value={notifyForm.type} onChange={(event) => setNotifyForm((current) => ({ ...current, type: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500">
                  <option>Admin Update</option>
                  <option>System Alert</option>
                  <option>Security</option>
                  <option>Reminder</option>
                </select>
                <textarea value={notifyForm.message} onChange={(event) => setNotifyForm((current) => ({ ...current, message: event.target.value }))} className="min-h-[100px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500" placeholder="Notification message" />
                <button type="submit" className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">Send message</button>
              </form>
            </div>
          </div>
        );
      default:
        return (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">{metrics.map((metric) => (<div key={metric.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{metric.label}</div><div className="mt-3 text-3xl font-extrabold text-slate-900">{metric.value}</div><div className="mt-1 text-xs text-slate-500">{metric.detail}</div></div>))}</div>

            <div className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-800">Admin operations</h3>
                  <button type="button" onClick={() => setActiveSection('users')} className="flex items-center gap-1 text-xs font-semibold text-emerald-600">Open module <ChevronRight className="h-3.5 w-3.5" /></button>
                </div>
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">User management and access controls remain centralized from one place.</div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">Content publication and categories can be managed without leaving the admin console.</div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">Reports and notifications help staff shift and counter operations remain coordinated.</div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800">Recent updates</h3>
                <div className="mt-4 space-y-3">
                  {notifications.slice(0, 3).map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div>
                        <div className="font-medium text-slate-800">{item.title}</div>
                        <div className="text-xs text-slate-500">{item.type}</div>
                      </div>
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">
              <Building2 className="h-4 w-4" />
              Admin control center
            </div>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">Welcome back, {adminCreds.username}</h2>
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={handleLogout} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[260px_1fr]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Sections</div>
          <div className="space-y-2">
            {sectionConfig.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveSection(id)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${activeSection === id ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/15' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'}`}
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {label}
                  {id === 'notifications' && inventoryAlerts.length > 0 && (
                    <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold leading-none text-rose-700">
                      {inventoryAlerts.length}
                    </span>
                  )}
                </span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        </aside>

        <main className="space-y-6">{renderSection()}</main>
      </div>
    </div>
  );
}
