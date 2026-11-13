const adminService = require('../../services/admin.service');
const router = require('../router');
const { adminLoginSchema, adminResetPasswordSchema, adminLoadSchema, adminSaveSchema, adminLogoutSchema } = require('../schemas/admin');

function register() {
  router.route('admin.login', {
    module: 'admin',
    action: 'manage',
    schema: adminLoginSchema,
    requiresAuth: false,
    handler: async (_session, data) => adminService.login(data.username, data.password),
  });

  router.route('admin.resetPassword', {
    module: 'admin',
    action: 'manage',
    schema: adminResetPasswordSchema,
    requiresAuth: true,
    handler: async (_session, data) => adminService.resetPassword(data.secret, data.newPassword),
  });

  router.route('admin.load', {
    module: 'admin',
    action: 'view',
    schema: adminLoadSchema,
    requiresAuth: true,
    handler: async () => adminService.loadDashboardState(),
  });

  router.route('admin.save', {
    module: 'admin',
    action: 'edit',
    schema: adminSaveSchema,
    requiresAuth: true,
    handler: async (_session, data) => adminService.saveDashboardState(data),
  });

  router.route('admin.logout', {
    module: 'admin',
    action: 'manage',
    schema: adminLogoutSchema,
    requiresAuth: true,
    handler: async (_session, data) => adminService.logout(data._token),
  });

  return router;
}

module.exports = { register };
