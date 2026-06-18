'use strict';

/**
 * Centralized, validated environment loading.
 *
 * - Loads .env exactly once (here), so no other file should call dotenv.
 * - Fails fast on missing *required* secrets in production.
 * - Never logs secret values.
 */
require('dotenv').config();

const REQUIRED_IN_PRODUCTION = ['JWT_SECRET', 'MONGODB_URI'];

function bool(value, fallback = false) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function int(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: int(process.env.PORT, 5000),

  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/spend-pilot',

  // Auth
  JWT_SECRET: process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  BCRYPT_SALT_ROUNDS: int(process.env.BCRYPT_SALT_ROUNDS, 10),

  // CORS
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // Rate limiting (window in minutes, max requests per window)
  RATE_LIMIT_WINDOW_MIN: int(process.env.RATE_LIMIT_WINDOW_MIN, 15),
  RATE_LIMIT_MAX: int(process.env.RATE_LIMIT_MAX, 300),
  AUTH_RATE_LIMIT_MAX: int(process.env.AUTH_RATE_LIMIT_MAX, 20),
  AI_RATE_LIMIT_MAX: int(process.env.AI_RATE_LIMIT_MAX, 30),

  // AI (Anthropic Claude)
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  AI_MODEL: process.env.AI_MODEL || 'claude-opus-4-8',

  // Plaid
  PLAID_CLIENT_ID: process.env.PLAID_CLIENT_ID || '',
  PLAID_SECRET: process.env.PLAID_SECRET || '',
  PLAID_ENV: process.env.PLAID_ENV || 'sandbox',
  PLAID_PRODUCTS: (process.env.PLAID_PRODUCTS || 'transactions').split(','),
  PLAID_COUNTRY_CODES: (process.env.PLAID_COUNTRY_CODES || 'US').split(','),

  // Demo seeding
  SEED_DEMO_DATA: bool(process.env.SEED_DEMO_DATA, false),

  // Daily card usage sync
  CARD_SYNC_ENABLED: bool(process.env.CARD_SYNC_ENABLED, true),
  CARD_SYNC_HOUR: int(process.env.CARD_SYNC_HOUR, 3), // local hour of day to run
  CARD_SYNC_MIN_INTERVAL_HOURS: int(process.env.CARD_SYNC_MIN_INTERVAL_HOURS, 20), // idempotency guard

  isProduction: (process.env.NODE_ENV || 'development') === 'production',
};

/**
 * Validate the environment. Throws in production if required secrets are
 * missing or left at their insecure defaults.
 */
function validateEnv() {
  const problems = [];

  if (env.isProduction) {
    for (const key of REQUIRED_IN_PRODUCTION) {
      if (!process.env[key]) problems.push(`${key} is required in production`);
    }
    if (process.env.JWT_SECRET === undefined || env.JWT_SECRET === 'dev-only-insecure-secret-change-me') {
      problems.push('JWT_SECRET must be set to a strong value in production');
    }
    if (env.CORS_ORIGIN === '*') {
      problems.push('CORS_ORIGIN should not be "*" in production');
    }
  }

  if (env.JWT_SECRET.length < 16 && env.isProduction) {
    problems.push('JWT_SECRET should be at least 16 characters');
  }

  if (problems.length) {
    throw new Error(`Invalid environment configuration:\n - ${problems.join('\n - ')}`);
  }
}

module.exports = { env, validateEnv };
