const { z } = require('zod');
const { withToken, nonEmptyString, uuid, pagination } = require('./_common');

const listSchema = withToken(z.object({
  pagination: pagination.optional(),
}));

const createSchema = withToken(z.object({
  code: nonEmptyString,
  name: nonEmptyString,
  rank: z.number().int().min(0).default(0),
}));

const updateSchema = withToken(z.object({
  id: uuid,
  name: nonEmptyString.optional(),
  rank: z.number().int().min(0).optional(),
}));

const permissionMatrixSchema = withToken(z.object({}));

module.exports = {
  listSchema,
  createSchema,
  updateSchema,
  permissionMatrixSchema,
};
