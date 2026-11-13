const { z } = require('zod');
const { withToken, nonEmptyString } = require('./_common');

const loginSchema = z.object({
  username: nonEmptyString,
  secret: nonEmptyString,
});

const logoutSchema = withToken(z.object({}));
const meSchema = withToken(z.object({}));
const changePasswordSchema = withToken(z.object({
  oldPassword: nonEmptyString,
  newPassword: nonEmptyString,
}));

module.exports = {
  loginSchema,
  logoutSchema,
  meSchema,
  changePasswordSchema,
};
