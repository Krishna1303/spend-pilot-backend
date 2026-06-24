'use strict';

const rateLimit = require('express-rate-limit');
const { env } = require('../config/env');
const logger = require('../config/logger');

const windowMs = env.RATE_LIMIT_WINDOW_MIN * 60 * 1000;

/**
 * NOTE (serverless): the default store is in-memory and therefore PER instance.
 * On Vercel/Lambda, limits are not shared across concurrent instances and reset
 * on cold start, so this is best-effort only. For real production protection,
 * plug in a shared store (e.g. `rate-limit-redis` + Upstash/Redis) by passing a
 * `store` to rateLimit() here, keyed off REDIS_URL / UPSTASH_REDIS_REST_URL.
 */
const hasSharedStore = !!(process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL);
if (env.isProduction && !hasSharedStore) {
  logger.warn(
    'Rate limiting is using an in-memory store — NOT shared across serverless instances. ' +
    'Configure a Redis/Upstash store for effective production rate limiting.'
  );
}

function build(max, message) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    // Keyed by IP (express-rate-limit reads req.ip, which honors trust proxy).
    message: { error: message || 'Too many requests, please try again later.' },
  });
}

/** Broad limiter applied to the whole API. */
const apiLimiter = build(env.RATE_LIMIT_MAX, 'Too many requests from this IP, please slow down.');

/** Tighter limiter for auth routes to slow credential stuffing. */
const authLimiter = build(env.AUTH_RATE_LIMIT_MAX, 'Too many authentication attempts, please try again later.');

/** Limiter for AI / chatbot routes to control upstream cost. */
const aiLimiter = build(env.AI_RATE_LIMIT_MAX, 'Too many AI requests, please try again shortly.');

module.exports = { apiLimiter, authLimiter, aiLimiter };
