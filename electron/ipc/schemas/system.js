const { z } = require('zod');
const { withToken } = require('./_common');

const infoSchema = withToken(z.object({}));
const firstRunStatusSchema = z.object({});
const firstRunCreateSchema = z.object({});

module.exports = {
  infoSchema,
  firstRunStatusSchema,
  firstRunCreateSchema,
};
