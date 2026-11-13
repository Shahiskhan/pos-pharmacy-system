const router = require('../router');
const { listSchema, assignSchema } = require('../schemas/panels');
const { ErrorCode } = require('../schemas/_common');

function register() {
  router.route('panels.list', {
    module: 'panels',
    action: 'list',
    schema: listSchema,
    requiresAuth: true,
    handler: async () => ({ panels: [] }),
  });

  router.route('panels.assign', {
    module: 'panels',
    action: 'assign',
    schema: assignSchema,
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
