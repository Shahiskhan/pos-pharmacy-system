const { ipcMain } = require('electron');
const log = require('electron-log');
const { can } = require('../services/permission.service');
const sessionStore = require('../security/session');
const audit = require('../services/audit.service');
const { isValidSender } = require('../security/validateSender');

const routes = new Map();

function err(code, message, details) {
  return {
    ok: false,
    error: {
      code,
      message,
      details: details === undefined ? null : details,
    },
  };
}

function route(channel, definition) {
  if (typeof channel !== 'string' || channel.length === 0) {
    throw new Error('Channel must be a non-empty string.');
  }
  if (channel.startsWith('system.internal.')) {
    throw new Error(`Blocked internal channel: ${channel}`);
  }
  if (!/^[a-z0-9]+(?:\.[A-Za-z0-9_]+)+$/.test(channel)) {
    throw new Error(`Route channel "${channel}" must use module.action format.`);
  }

  const parts = channel.split('.');
  const moduleName = parts.shift();
  const actionName = parts.join('.');
  const resolved = {
    channel,
    module: definition?.module || moduleName,
    action: definition?.action || actionName,
    schema: definition?.schema || null,
    handler: definition?.handler || null,
    requiresAuth: definition?.requiresAuth ?? true,
  };

  if (`${resolved.module}.${resolved.action}` !== channel) {
    throw new Error(`Route channel ${channel} must match module.action naming.`);
  }

  routes.set(channel, resolved);
  return resolved;
}

function listChannels() {
  return [...routes.keys()].sort();
}

function __getHandler(channel) {
  return routes.get(channel)?.handler || null;
}

function toIssueList(zodError) {
  if (!zodError || !Array.isArray(zodError.issues)) return [];
  return zodError.issues.map((issue) => ({
    path: issue.path || [],
    message: issue.message,
  }));
}

function typedError(error) {
  if (!error || typeof error !== 'object') return null;
  if (typeof error.code === 'string') {
    return {
      code: error.code,
      message: error.message || 'Request failed',
      details: error.details || null,
    };
  }
  return null;
}

function registerRoutes() {
  for (const [channel, def] of routes.entries()) {
    ipcMain.handle(channel, async (event, payload) => {
      const data = payload ?? {};

      if (!isValidSender(event)) {
        return err('E_FORBIDDEN', 'Forbidden sender.', { channel });
      }

      if (def.schema && typeof def.schema.safeParse === 'function') {
        const parsed = def.schema.safeParse(data);
        if (!parsed.success) {
          return err('E_VALIDATION', 'Validation failed.', toIssueList(parsed.error));
        }
        data.__parsed = parsed.data;
      }

      const parsedData = data.__parsed !== undefined ? data.__parsed : data;

      if (def.requiresAuth) {
        const token = parsedData?._token || data?._token;
        if (!token || typeof token !== 'string') {
          return err('E_UNAUTHENTICATED', 'Authentication required.', { channel });
        }

        const session = sessionStore.get(token);
        if (!session) {
          return err('E_UNAUTHENTICATED', 'Session is invalid or expired.', { channel });
        }

        sessionStore.touch(token);

        if (!can(session, def.module, def.action)) {
          audit.security({
            userId: session.userId,
            username: session.username,
            roleCode: session.roleCode,
            branchId: session.branchId,
            module: def.module,
            action: 'DENIED',
            severity: 'warn',
            details: { channel, module: def.module, action: def.action },
          });
          return err('E_FORBIDDEN', 'Forbidden action.', { channel, module: def.module, action: def.action });
        }

        try {
          return await def.handler(session, parsedData, event);
        } catch (error) {
          const e = typedError(error);
          if (e) return err(e.code, e.message, e.details);
          log.error(`IPC handler failed: ${channel}`, error);
          return err('E_INTERNAL', 'Internal error.', { channel });
        }
      }

      try {
        return await def.handler(undefined, parsedData, event);
      } catch (error) {
        const e = typedError(error);
        if (e) return err(e.code, e.message, e.details);
        log.error(`IPC handler failed: ${channel}`, error);
        return err('E_INTERNAL', 'Internal error.', { channel });
      }
    });
  }

  return routes;
}

module.exports = {
  route,
  registerRoutes,
  listChannels,
  __getHandler,
  err,
};
