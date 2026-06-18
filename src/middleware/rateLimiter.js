'use strict';

const rateLimit = require('express-rate-limit');
const { env } = require('../config/env');

const windowMs = env.RATE_LIMIT_WINDOW_MIN * 60 * 1000;

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
