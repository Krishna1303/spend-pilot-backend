'use strict';

const { env } = require('../config/env');
const logger = require('../config/logger');
const { syncAllUsers } = require('../services/cardSync.service');

/**
 * Lightweight daily scheduler (no external cron dependency). Fires once at
 * CARD_SYNC_HOUR local time, then every 24h. Idempotency is enforced inside
 * the sync service, so an extra fire never causes a double-pull.
 */
let timer = null;

function msUntilHour(hour) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next - now;
}

async function runOnce() {
  try {
    const result = await syncAllUsers();
    logger.info('Daily card sync complete', result);
  } catch (err) {
    logger.error('Daily card sync failed', { error: err.message });
  }
}

function startCardSyncScheduler() {
  if (!env.CARD_SYNC_ENABLED) {
    logger.info('Daily card sync disabled (CARD_SYNC_ENABLED=false)');
    return;
  }

  const wait = msUntilHour(env.CARD_SYNC_HOUR);
  timer = setTimeout(() => {
    runOnce();
    timer = setInterval(runOnce, 24 * 3600 * 1000);
    if (timer.unref) timer.unref();
  }, wait);
  // Don't keep the event loop alive solely for this timer.
  if (timer.unref) timer.unref();

  logger.info('Daily card sync scheduled', {
    hour: env.CARD_SYNC_HOUR,
    firstRunInMinutes: Math.round(wait / 60000),
  });
}

function stopCardSyncScheduler() {
  if (timer) {
    clearTimeout(timer);
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { startCardSyncScheduler, stopCardSyncScheduler, runOnce };
