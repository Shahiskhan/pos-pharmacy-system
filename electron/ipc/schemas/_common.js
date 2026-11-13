const { z } = require('zod');

const ErrorCode = Object.freeze({
  E_UNAUTHENTICATED: 'E_UNAUTHENTICATED',
  E_FORBIDDEN: 'E_FORBIDDEN',
  E_VALIDATION: 'E_VALIDATION',
  E_NOT_FOUND: 'E_NOT_FOUND',
  E_CONFLICT: 'E_CONFLICT',
  E_INTERNAL: 'E_INTERNAL',
  E_DB_OPEN: 'E_DB_OPEN',
  E_MIGRATION_FAILED: 'E_MIGRATION_FAILED',
  E_NOT_IMPLEMENTED: 'E_NOT_IMPLEMENTED',
});

const moneyPaisa = z.number().int().nonnegative();
const uuid = z.string().trim().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, 'Invalid UUIDv7');
const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Invalid ISO date' });
const nonEmptyString = z.string().trim().min(1, 'Required');
const pagination = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

function withToken(schema) {
  const base = schema && typeof schema === 'object' && 'safeParse' in schema ? schema : z.object({});
  return base.extend({ _token: z.string().trim().min(1, 'Token is required') });
}

module.exports = {
  ErrorCode,
  moneyPaisa,
  uuid,
  isoDate,
  nonEmptyString,
  pagination,
  withToken,
};
