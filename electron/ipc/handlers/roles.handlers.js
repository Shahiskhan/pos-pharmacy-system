const { z } = require('zod');
const router = require('../router');
const { listSchema, createSchema, updateSchema, permissionMatrixSchema } = require('../schemas/roles');
const { ErrorCode, withToken } = require('../schemas/_common');

function register() {
  router.route('roles.list', {
    module: 'roles',
    action: 'list',
    schema: listSchema,
    requiresAuth: true,
    handler: async () => ({ rows: [], total: 0 }),
  });

  router.route('roles.create', {
    module: 'roles',
    action: 'create',
    schema: createSchema,
    requiresAuth: true,
    handler: async () => {
      const error = new Error('Role creation is implemented in Step 5.');
      error.code = ErrorCode.E_NOT_IMPLEMENTED;
      throw error;
    },
  });

  router.route('roles.update', {
    module: 'roles',
    action: 'update',
    schema: updateSchema,
    requiresAuth: true,
    handler: async () => {
      const error = new Error('Role update is implemented in Step 5.');
      error.code = ErrorCode.E_NOT_IMPLEMENTED;
      throw error;
    },
  });

  router.route('roles.setPermissions', {
    module: 'roles',
    action: 'setPermissions',
    schema: withToken(z.object({
      roleId: z.string().trim().min(1),
      permissions: z.array(z.object({
        module: z.string().trim().min(1),
        action: z.string().trim().min(1),
      })).default([]),
    })),
    requiresAuth: true,
    handler: async () => {
      const error = new Error('Role permission updates are implemented in Step 5.');
      error.code = ErrorCode.E_NOT_IMPLEMENTED;
      throw error;
    },
  });

  router.route('roles.getMatrix', {
    module: 'roles',
    action: 'getMatrix',
    schema: permissionMatrixSchema,
    requiresAuth: true,
    handler: async () => ({ rows: [], cols: [], roleLimits: [] }),
  });

  return router;
}

module.exports = { register };
