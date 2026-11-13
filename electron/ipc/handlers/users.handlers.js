const router = require('../router');
const { listSchema, createSchema, updateSchema, resetPinSchema, deactivateSchema, assignPanelsSchema } = require('../schemas/users');
const { ErrorCode } = require('../schemas/_common');

function register() {
  router.route('users.list', {
    module: 'users',
    action: 'list',
    schema: listSchema,
    requiresAuth: true,
    handler: async () => [],
  });

  router.route('users.create', {
    module: 'users',
    action: 'create',
    schema: createSchema,
    requiresAuth: true,
    handler: async () => {
      const error = new Error('User creation is implemented in Step 5.');
      error.code = ErrorCode.E_NOT_IMPLEMENTED;
      throw error;
    },
  });

  router.route('users.update', {
    module: 'users',
    action: 'update',
    schema: updateSchema,
    requiresAuth: true,
    handler: async () => {
      const error = new Error('User update is implemented in Step 5.');
      error.code = ErrorCode.E_NOT_IMPLEMENTED;
      throw error;
    },
  });

  router.route('users.resetPin', {
    module: 'users',
    action: 'resetPin',
    schema: resetPinSchema,
    requiresAuth: true,
    handler: async () => {
      const error = new Error('User reset-pin is implemented in Step 5.');
      error.code = ErrorCode.E_NOT_IMPLEMENTED;
      throw error;
    },
  });

  router.route('users.deactivate', {
    module: 'users',
    action: 'deactivate',
    schema: deactivateSchema,
    requiresAuth: true,
    handler: async () => {
      const error = new Error('User deactivate is implemented in Step 5.');
      error.code = ErrorCode.E_NOT_IMPLEMENTED;
      throw error;
    },
  });

  router.route('users.assignPanels', {
    module: 'users',
    action: 'assignPanels',
    schema: assignPanelsSchema,
    requiresAuth: true,
    handler: async () => {
      const error = new Error('Panel assignment is implemented in Step 5.');
      error.code = ErrorCode.E_NOT_IMPLEMENTED;
      throw error;
    },
  });

  return router;
}

module.exports = { register };
