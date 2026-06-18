'use strict';

const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const { env } = require('./env');
const logger = require('./logger');

/**
 * Lazily-constructed Plaid client. Returns null when credentials are missing
 * so the dashboard can fall back to seeded demo data.
 */
let plaidClient = null;

function getPlaidClient() {
  if (!env.PLAID_CLIENT_ID || !env.PLAID_SECRET) {
    return null;
  }
  if (!plaidClient) {
    const configuration = new Configuration({
      basePath: PlaidEnvironments[env.PLAID_ENV] || PlaidEnvironments.sandbox,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': env.PLAID_CLIENT_ID,
          'PLAID-SECRET': env.PLAID_SECRET,
        },
      },
    });
    plaidClient = new PlaidApi(configuration);
    logger.info('Plaid client initialized', { env: env.PLAID_ENV });
  }
  return plaidClient;
}

module.exports = { getPlaidClient };
