const { z } = require('zod');
const { withToken, nonEmptyString, uuid } = require('./_common');

const listSchema = withToken(z.object({}));
const assignSchema = withToken(z.object({
  userId: uuid,
  panels: z.array(nonEmptyString).default([]),
}));

module.exports = {
  listSchema,
  assignSchema,
};
