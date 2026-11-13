const { z } = require('zod');
const { withToken, nonEmptyString, uuid, pagination } = require('./_common');

const listSchema = withToken(z.object({
  branchId: z.string().optional(),
  pagination: pagination.optional(),
}));

const createSchema = withToken(z.object({
  username: nonEmptyString,
  fullName: nonEmptyString,
  roleCode: nonEmptyString,
  panels: z.array(nonEmptyString).min(1),
  branchId: z.string().optional(),
  secret: nonEmptyString,
}));

const updateSchema = withToken(z.object({
  id: uuid,
  fullName: nonEmptyString.optional(),
  roleCode: z.string().optional(),
  branchId: z.string().optional(),
  isActive: z.boolean().optional(),
}));

const resetPinSchema = withToken(z.object({
  id: uuid,
  newSecret: nonEmptyString,
}));

const deactivateSchema = withToken(z.object({
  id: uuid,
}));

const assignPanelsSchema = withToken(z.object({
  userId: uuid,
  panels: z.array(nonEmptyString).default([]),
}));

module.exports = {
  listSchema,
  createSchema,
  updateSchema,
  resetPinSchema,
  deactivateSchema,
  assignPanelsSchema,
};
