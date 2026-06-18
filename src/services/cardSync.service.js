'use strict';

const User = require('../models/User');
const Card = require('../models/Card');
const { getAccounts } = require('./plaid.service');
const { env } = require('../config/env');
const logger = require('../config/logger');

/** Map a Plaid account type to our card type, or null to skip. */
function mapAccountToCardType(account) {
  if (account.type === 'credit') return 'credit';
  if (account.type === 'depository') return 'debit';
  return null; // loans, investments, etc. are not cards
}

/**
 * Pull the latest balances for one user's Plaid-connected accounts and upsert
 * the matching cards. Idempotent: a card synced within
 * CARD_SYNC_MIN_INTERVAL_HOURS is skipped unless `force` is set, so the data
 * is pulled and updated at most once per day even if triggered repeatedly.
 */
async function syncUserCards(user, { force = false } = {}) {
  if (!user || !user.plaidAccessToken) {
    return { synced: 0, skipped: 0, upserted: 0, reason: 'no-plaid-connection' };
  }

  const thresholdMs = env.CARD_SYNC_MIN_INTERVAL_HOURS * 3600 * 1000;
  const { accounts, demo } = await getAccounts(user.plaidAccessToken);

  let synced = 0;
  let skipped = 0;
  let upserted = 0;

  for (const account of accounts || []) {
    const cardType = mapAccountToCardType(account);
    if (!cardType) continue;

    let card = await Card.findOne({ userId: user._id, accountId: account.account_id });

    // Idempotency guard: already pulled within the window → skip.
    if (card && !force && card.lastSyncedAt && Date.now() - card.lastSyncedAt.getTime() < thresholdMs) {
      skipped += 1;
      continue;
    }

    if (!card) {
      card = new Card({ userId: user._id, accountId: account.account_id });
      upserted += 1;
    }

    const balances = account.balances || {};
    card.source = 'plaid';
    card.cardType = cardType;
    card.bankName = account.name || card.bankName;
    card.cardName = account.official_name || account.name || card.cardName;
    if (account.mask) card.last4 = account.mask;
    card.balance = Number(balances.current || 0);
    if (balances.limit != null) card.creditLimit = Number(balances.limit);
    card.lastSyncedAt = new Date();

    await card.save(); // triggers utilization recompute hook
    synced += 1;
  }

  return { synced, skipped, upserted, demo };
}

/**
 * Sync every user that has a Plaid connection. Used by the daily scheduler.
 * One user's failure never aborts the rest.
 */
async function syncAllUsers({ force = false } = {}) {
  const users = await User.find({ plaidAccessToken: { $exists: true, $ne: null } }).select(
    '+plaidAccessToken'
  );

  let usersProcessed = 0;
  let totalSynced = 0;
  let totalSkipped = 0;
  let totalUpserted = 0;

  for (const user of users) {
    try {
      const result = await syncUserCards(user, { force });
      totalSynced += result.synced;
      totalSkipped += result.skipped;
      totalUpserted += result.upserted;
      usersProcessed += 1;
    } catch (err) {
      logger.warn('Card sync failed for user', { userId: String(user._id), error: err.message });
    }
  }

  return { usersProcessed, totalSynced, totalSkipped, totalUpserted };
}

module.exports = { syncUserCards, syncAllUsers };
