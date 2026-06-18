'use strict';

const { randomUUID } = require('crypto');
const logger = require('../config/logger');

/**
 * Per-request logging with response timing and IP tracking.
 *
 * - Assigns a request id (echoed as X-Request-Id) for correlation.
 * - Measures response time in milliseconds.
 * - Chooses a log level based on the outcome:
 *     5xx -> error, 4xx -> warn, everything else -> http
 */
module.exports = function requestLogger(req, res, next) {
  const requestId = req.headers['x-request-id'] || randomUUID();
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;

    const meta = {
      requestId,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      responseTimeMs: Math.round(durationMs * 100) / 100,
      ip: req.ip,
      userId: req.user ? req.user.id : undefined,
      userAgent: req.headers['user-agent'],
    };

    let level = 'http';
    if (res.statusCode >= 500) level = 'error';
    else if (res.statusCode >= 400) level = 'warn';

    logger.log(level, `${req.method} ${req.originalUrl} ${res.statusCode} ${meta.responseTimeMs}ms`, meta);
  });

  next();
};
