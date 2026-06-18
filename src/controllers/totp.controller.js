'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const User = require('../models/User');
const totp = require('../services/totp.service');
const { encrypt, decrypt } = require('../utils/crypto');
const { signCrmToken } = require('../middleware/authMiddleware');
const { env } = require('../config/env');
const logger = require('../config/logger');

/** GET /api/admin/totp/status — whether the admin has TOTP enabled. */
const status = asyncHandler(async (req, res) => {
  res.json({ enabled: !!req.user.totpEnabled, required: env.CRM_TOTP_REQUIRED });
});

/**
 * POST /api/admin/totp/setup
 * Generate a new secret and return the otpauth URI + QR. Enrollment is not
 * active until confirmed via /enable. Re-running resets any prior enrollment.
 */
const setup = asyncHandler(async (req, res) => {
  const secret = totp.generateSecret();
  const user = await User.findById(req.user.id);
  user.totpSecret = encrypt(secret);
  user.totpEnabled = false;
  await user.save();

  const otpauthUrl = totp.keyuri(user.email, secret);
  const qrDataUrl = await totp.qrDataUrl(otpauthUrl);
  logger.info('TOTP setup initiated', { userId: user.id });
  res.json({ secret, otpauthUrl, qrDataUrl });
});

/**
 * POST /api/admin/totp/enable  Body: { token }
 * Confirm enrollment by verifying a code from the authenticator.
 */
const enable = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) throw ApiError.badRequest('token is required');

  const user = await User.findById(req.user.id).select('+totpSecret');
  if (!user.totpSecret) throw ApiError.badRequest('Start TOTP setup first');

  if (!totp.verifyToken(token, decrypt(user.totpSecret))) {
    throw ApiError.unauthorized('Invalid authenticator code');
  }
  user.totpEnabled = true;
  await user.save();
  logger.info('TOTP enabled', { userId: user.id });
  res.json({ enabled: true });
});

/**
 * POST /api/admin/totp/verify  Body: { token }
 * Step-up: verify a code and issue a short-lived CRM token used to access the
 * CRM data routes.
 */
const verify = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) throw ApiError.badRequest('token is required');

  const user = await User.findById(req.user.id).select('+totpSecret');
  if (!user.totpEnabled || !user.totpSecret) throw ApiError.badRequest('TOTP is not set up');

  if (!totp.verifyToken(token, decrypt(user.totpSecret))) {
    throw ApiError.unauthorized('Invalid authenticator code');
  }

  const crmToken = signCrmToken(user);
  logger.info('CRM step-up granted', { userId: user.id });
  res.json({ crmToken, expiresIn: env.CRM_TOKEN_EXPIRES_IN });
});

module.exports = { status, setup, enable, verify };
