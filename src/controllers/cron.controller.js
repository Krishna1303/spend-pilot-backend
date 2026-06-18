'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { env } = require('../config/env');
const logger = require('../config/logger');
const { syncAllUsers } = require('../services/cardSync.service');

/**
 * GET /api/cron/card-sync
 * Daily card-usage sync entry point for Vercel Cron (the in-process scheduler
 * can't run on serverless). Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`
 * when CRON_SECRET is configured; we require it so the endpoint isn't public.
 */
const cardSync = asyncHandler(async (req, res) => {
  const secret = env.CRON_SECRET;
  if (!secret) {
    // Refuse to run an unauthenticated all-users sync.
    throw ApiError.forbidden('CRON_SECRET is not configured');
  }
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${secret}`) {
    throw ApiError.unauthorized('Invalid cron credentials');
  }

  const result = await syncAllUsers();
  logger.info('Cron card sync complete', result);
  res.json({ ok: true, ...result });
});

module.exports = { cardSync };
