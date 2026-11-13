const { app } = require('electron');
const { getDb } = require('../../db/connection');
const router = require('../router');
const { infoSchema, firstRunStatusSchema, firstRunCreateSchema } = require('../schemas/system');
const { ErrorCode } = require('../schemas/_common');

function register() {
  router.route('system.info', {
    module: 'system',
    action: 'info',
    schema: infoSchema,
    requiresAuth: true,
    handler: async () => ({
      appName: app.name,
      version: app.getVersion(),
      isPackaged: app.isPackaged,
      platform: process.platform,
      arch: process.arch,
      userDataPath: app.getPath('userData'),
    }),
  });

  router.route('system.firstRun.status', {
    module: 'system',
    action: 'firstRun.status',
    schema: firstRunStatusSchema,
    requiresAuth: false,
    handler: async () => {
      const row = getDb().prepare('SELECT COUNT(*) AS total FROM users').get();
      return { firstRun: Number(row.total) === 0 };
    },
  });

  router.route('system.firstRun.create', {
    module: 'system',
    action: 'firstRun.create',
    schema: firstRunCreateSchema,
    requiresAuth: false,
    handler: async () => {
      const error = new Error('First-run setup is implemented in Step 7.');
      error.code = ErrorCode.E_NOT_IMPLEMENTED;
      throw error;
    },
  });

  return router;
}

module.exports = { register };
