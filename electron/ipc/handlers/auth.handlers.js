const authService = require('../../services/auth.service');
const sessionStore = require('../../security/session');
const { loginSchema, logoutSchema, meSchema, changePasswordSchema } = require('../schemas/auth');
const router = require('../router');

function register() {
  router.route('auth.login', {
    module: 'auth',
    action: 'login',
    schema: loginSchema,
    requiresAuth: false,
    handler: async (_session, data) => authService.login(data.username, data.secret),
  });

  router.route('auth.logout', {
    module: 'auth',
    action: 'logout',
    schema: logoutSchema,
    requiresAuth: true,
    handler: async (session, data) => authService.logout(data._token, { reason: 'logout' }),
  });

  router.route('auth.me', {
    module: 'auth',
    action: 'me',
    schema: meSchema,
    requiresAuth: true,
    handler: async (session) => ({
      session: sessionStore.toPublic(session),
      user: sessionStore.toPublic(session),
    }),
  });

  router.route('auth.changePassword', {
    module: 'auth',
    action: 'changePassword',
    schema: changePasswordSchema,
    requiresAuth: true,
    handler: async (session, data) => authService.changePassword(session.userId, data.oldPassword, data.newPassword, { keepToken: data._token }),
  });

  return router;
}

module.exports = { register };
