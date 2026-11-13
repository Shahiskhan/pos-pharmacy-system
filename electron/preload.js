const { contextBridge, ipcRenderer } = require('electron');

let token = null;

const rejectNotImplemented = (methodName) => Promise.reject(
  Object.assign(new Error(`${methodName} is not implemented yet.`), { code: 'E_NOT_IMPLEMENTED' })
);

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

async function __internalCall(channel, payload = {}) {
  if (typeof channel !== 'string' || !/^[a-z0-9]+\.[a-z0-9_.]+$/.test(channel)) {
    return Promise.reject(new Error(`Invalid IPC channel: ${String(channel)}`));
  }
  return ipcRenderer.invoke(channel, payload);
}

function withToken(channel, payload = {}) {
  const next = isPlainObject(payload) ? { ...payload } : {};
  next._token = token || next._token || '';
  return __internalCall(channel, next);
}

function setToken(nextToken) {
  token = typeof nextToken === 'string' && nextToken ? nextToken : null;
  return token;
}

const pos = {
  auth: {
    login: async (payload = {}) => {
      const result = await __internalCall('auth.login', payload);
      if (result && typeof result.token === 'string') setToken(result.token);
      return result;
    },
    logout: async (payload = {}) => {
      const next = isPlainObject(payload) ? { ...payload } : {};
      next._token = token || next._token || '';
      const result = await __internalCall('auth.logout', next);
      if (result && result.ok !== false) setToken(null);
      return result;
    },
    me: (payload = {}) => withToken('auth.me', payload),
    changePassword: (payload = {}) => withToken('auth.changePassword', payload),
  },
  system: {
    info: (payload = {}) => withToken('system.info', payload),
    firstRun: {
      status: (payload = {}) => __internalCall('system.firstRun.status', payload),
      create: (payload = {}) => __internalCall('system.firstRun.create', payload),
    },
  },
  admin: {
    login: async (payload = {}) => {
      const result = await __internalCall('admin.login', payload);
      if (result && typeof result.token === 'string') setToken(result.token);
      return result;
    },
    logout: async (payload = {}) => {
      const next = isPlainObject(payload) ? { ...payload } : {};
      next._token = token || next._token || '';
      const result = await __internalCall('admin.logout', next);
      if (result && result.ok !== false) setToken(null);
      return result;
    },
    load: (payload = {}) => withToken('admin.load', payload),
    save: (payload = {}) => withToken('admin.save', payload),
    resetPassword: (payload = {}) => withToken('admin.resetPassword', payload),
  },
  users: {
    list: (payload = {}) => withToken('users.list', payload),
    create: (payload = {}) => withToken('users.create', payload),
    update: (payload = {}) => withToken('users.update', payload),
    resetPin: (payload = {}) => withToken('users.resetPin', payload),
    deactivate: (payload = {}) => withToken('users.deactivate', payload),
    assignPanels: (payload = {}) => withToken('users.assignPanels', payload),
  },
  roles: {
    list: (payload = {}) => withToken('roles.list', payload),
    create: (payload = {}) => withToken('roles.create', payload),
    update: (payload = {}) => withToken('roles.update', payload),
    setPermissions: (payload = {}) => withToken('roles.setPermissions', payload),
    getMatrix: (payload = {}) => withToken('roles.getMatrix', payload),
  },
  panels: {
    list: (payload = {}) => withToken('panels.list', payload),
    assign: (payload = {}) => withToken('panels.assign', payload),
  },
  analytics: {
    list: () => rejectNotImplemented('analytics.list'),
    summary: () => rejectNotImplemented('analytics.summary'),
  },
  sales: {
    create: () => rejectNotImplemented('sales.create'),
    hold: () => rejectNotImplemented('sales.hold'),
    list: () => rejectNotImplemented('sales.list'),
  },
  inventory: {
    list: () => rejectNotImplemented('inventory.list'),
    create: () => rejectNotImplemented('inventory.create'),
  },
  purchases: {
    list: () => rejectNotImplemented('purchases.list'),
    create: () => rejectNotImplemented('purchases.create'),
  },
  returns: {
    request: () => rejectNotImplemented('returns.request'),
    list: () => rejectNotImplemented('returns.list'),
  },
  shifts: {
    open: () => rejectNotImplemented('shifts.open'),
    close: () => rejectNotImplemented('shifts.close'),
    current: () => rejectNotImplemented('shifts.current'),
  },
  settings: {
    get: () => rejectNotImplemented('settings.get'),
    save: () => rejectNotImplemented('settings.save'),
  },
  audit: {
    list: () => rejectNotImplemented('audit.list'),
    verify: () => rejectNotImplemented('audit.verify'),
  },
  backups: {
    list: () => rejectNotImplemented('backups.list'),
    create: () => rejectNotImplemented('backups.create'),
  },
  license: {
    status: () => rejectNotImplemented('license.status'),
    activate: () => rejectNotImplemented('license.activate'),
  },
  print: {
    receipt: () => rejectNotImplemented('print.receipt'),
  },
  _setToken: setToken,
  _getToken: () => token,
  /**
   * @deprecated Migration window only. Delete in Step 9.
   */
  __internalCall,
};

contextBridge.exposeInMainWorld('pos', pos);

