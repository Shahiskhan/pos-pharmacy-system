const { z } = require('zod');
const { withToken } = require('./_common');

const adminLoginSchema = z.object({
  username: z.string().trim().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

const adminResetPasswordSchema = withToken(z.object({
  secret: z.string().trim().min(1, 'Secret is required'),
  newPassword: z.string().trim().min(6, 'New password must be at least 6 characters'),
}));

const adminLoadSchema = withToken(z.object({}));

const adminSaveSchema = withToken(z.object({
  users: z.array(z.any()).default([]),
  content: z.array(z.any()).default([]),
  notifications: z.array(z.any()).default([]),
  settings: z.any().default({}),
}));

const adminLogoutSchema = withToken(z.object({}));

module.exports = {
  adminLoginSchema,
  adminResetPasswordSchema,
  adminLoadSchema,
  adminSaveSchema,
  adminLogoutSchema,
};
