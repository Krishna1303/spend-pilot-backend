'use strict';

const { getPlaidClient } = require('../config/plaid');
const { env } = require('../config/env');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');

/**
 * Turn a Plaid SDK error into a clean ApiError instead of a raw 500.
 * Plaid client errors carry { error_code, error_message } on response.data.
 */
function toApiError(err, action) {
  const data = err && err.response && err.response.data;
  const code = data && data.error_code;
  const message = (data && data.error_message) || err.message;
  logger.error(`Plaid ${action} failed`, { error_code: code, message });
  // Bad input (invalid/expired token, bad request) -> 400; upstream issues -> 502.
  if (code && /^(INVALID_|MISSING_|ITEM_LOGIN_REQUIRED)/.test(code)) {
    return ApiError.badRequest(`Plaid: ${message}`);
  }
  return new ApiError(502, `Plaid request failed: ${message}`);
}

/** Seeded fallback accounts so the dashboard still works without Plaid. */
const DEMO_ACCOUNTS = [
  { account_id: 'demo-checking', name: 'Demo Checking', type: 'depository', subtype: 'checking', balances: { available: 2450.12, current: 2510.0, iso_currency_code: 'USD' } },
  { account_id: 'demo-credit', name: 'Demo Rewards Card', type: 'credit', subtype: 'credit card', balances: { available: 3200.0, current: 1800.0, limit: 5000.0, iso_currency_code: 'USD' } },
];

const DEMO_TRANSACTIONS = [
  { transaction_id: 'demo-tx-1', account_id: 'demo-credit', amount: 54.23, name: 'Whole Foods', category: ['Food and Drink', 'Groceries'], date: '2026-06-15' },
  { transaction_id: 'demo-tx-2', account_id: 'demo-credit', amount: 12.99, name: 'Netflix', category: ['Service', 'Subscription'], date: '2026-06-12' },
  { transaction_id: 'demo-tx-3', account_id: 'demo-checking', amount: 1500.0, name: 'Payroll', category: ['Transfer', 'Payroll'], date: '2026-06-10' },
];

async function createLinkToken(userId) {
  const client = getPlaidClient();
  if (!client) {
    return { link_token: null, demo: true };
  }
  try {
    const resp = await client.linkTokenCreate({
      user: { client_user_id: String(userId) },
      client_name: 'SpendPilot',
      products: env.PLAID_PRODUCTS,
      country_codes: env.PLAID_COUNTRY_CODES,
      language: 'en',
    });
    return { link_token: resp.data.link_token, demo: false };
  } catch (err) {
    throw toApiError(err, 'linkTokenCreate');
  }
}

async function exchangePublicToken(publicToken) {
  const client = getPlaidClient();
  if (!client) {
    return { accessToken: 'demo-access-token', itemId: 'demo-item', demo: true };
  }
  try {
    const resp = await client.itemPublicTokenExchange({ public_token: publicToken });
    return { accessToken: resp.data.access_token, itemId: resp.data.item_id, demo: false };
  } catch (err) {
    throw toApiError(err, 'itemPublicTokenExchange');
  }
}

/**
 * Sandbox-only: mint a public_token directly (no Plaid Link UI), so the connect
 * flow can be tested/demoed end-to-end. Default institution is Plaid's
 * "First Platypus Bank" (ins_109508).
 */
async function createSandboxPublicToken(institutionId) {
  const client = getPlaidClient();
  if (!client) throw ApiError.badRequest('Plaid is not configured');
  if (env.PLAID_ENV !== 'sandbox') {
    throw ApiError.badRequest('Sandbox token creation is only available in sandbox mode');
  }
  try {
    const resp = await client.sandboxPublicTokenCreate({
      institution_id: institutionId || 'ins_109508',
      initial_products: env.PLAID_PRODUCTS,
    });
    return resp.data.public_token;
  } catch (err) {
    throw toApiError(err, 'sandboxPublicTokenCreate');
  }
}

async function getAccounts(accessToken) {
  const client = getPlaidClient();
  if (!client || !accessToken || accessToken === 'demo-access-token') {
    return { accounts: DEMO_ACCOUNTS, demo: true };
  }
  try {
    const resp = await client.accountsGet({ access_token: accessToken });
    return { accounts: resp.data.accounts, demo: false };
  } catch (err) {
    logger.warn('Plaid accountsGet failed; using demo data', { error: err.message });
    return { accounts: DEMO_ACCOUNTS, demo: true };
  }
}

async function getTransactions(accessToken, { startDate, endDate } = {}) {
  const client = getPlaidClient();
  if (!client || !accessToken || accessToken === 'demo-access-token') {
    return { transactions: DEMO_TRANSACTIONS, demo: true };
  }
  try {
    const end = endDate || new Date().toISOString().slice(0, 10);
    const start = startDate || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const resp = await client.transactionsGet({
      access_token: accessToken,
      start_date: start,
      end_date: end,
      options: { count: 50, offset: 0 },
    });
    return { transactions: resp.data.transactions, demo: false };
  } catch (err) {
    logger.warn('Plaid transactionsGet failed; using demo data', { error: err.message });
    return { transactions: DEMO_TRANSACTIONS, demo: true };
  }
}

module.exports = {
  createLinkToken,
  exchangePublicToken,
  createSandboxPublicToken,
  getAccounts,
  getTransactions,
  DEMO_ACCOUNTS,
  DEMO_TRANSACTIONS,
};
