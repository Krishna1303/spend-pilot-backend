'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { env } = require('../config/env');
const logger = require('../config/logger');
const User = require('../models/User');
const { syncAllUsers } = require('../services/cardSync.service');
const { buildAlerts } = require('../services/alerts.service');
const { sendAlertDigest } = require('../services/email.service');

/** Verify the Vercel Cron secret (Authorization: Bearer <CRON_SECRET>). */
function assertCronAuth(req) {
  const secret = env.CRON_SECRET;
  if (!secret) throw ApiError.forbidden('CRON_SECRET is not configured');
  if ((req.headers.authorization || '') !== `Bearer ${secret}`) {
    throw ApiError.unauthorized('Invalid cron credentials');
  }
}

/**
 * GET /api/cron/card-sync
 * Daily card-usage sync entry point for Vercel Cron (the in-process scheduler
 * can't run on serverless).
 */
const cardSync = asyncHandler(async (req, res) => {
  assertCronAuth(req);
  const result = await syncAllUsers();
  logger.info('Cron card sync complete', result);
  res.json({ ok: true, ...result });
});

/**
 * GET /api/cron/alerts-digest
 * Daily alert digest: email each user whose alerts include something actionable
 * (a critical or warning). Info-only alerts don't trigger an email.
 */
const alertsDigest = asyncHandler(async (req, res) => {
  assertCronAuth(req);

  const users = await User.find().select('name email');
  let usersProcessed = 0;
  let emailsSent = 0;

  for (const user of users) {
    try {
      const { alerts, counts } = await buildAlerts(user.id);
      usersProcessed += 1;
      if (counts.critical + counts.warning > 0) {
        const actionable = alerts.filter((a) => a.severity !== 'info');
        const mail = await sendAlertDigest(user, actionable);
        if (mail.delivered) emailsSent += 1;
      }
    } catch (err) {
      logger.warn('Alert digest failed for user', { userId: String(user._id), error: err.message });
    }
  }

  const result = { usersProcessed, emailsSent };
  logger.info('Cron alert digest complete', result);
  res.json({ ok: true, ...result });
});

module.exports = { cardSync, alertsDigest };
