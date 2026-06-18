'use strict';

const winston = require('winston');
const { env } = require('./env');

/**
 * Application logger with configurable levels.
 *
 * Levels (winston npm levels, most→least severe):
 *   error, warn, info, http, verbose, debug, silly
 *
 * Control verbosity with LOG_LEVEL in the environment.
 */
const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  defaultMeta: { service: 'SpendPilot API' },
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    env.isProduction
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
            const rest = Object.keys(meta).filter((k) => k !== 'service').length
              ? ` ${JSON.stringify(meta)}`
              : '';
            return `${timestamp} ${level}: ${stack || message}${rest}`;
          })
        )
  ),
  transports: [new winston.transports.Console()],
});

module.exports = logger;
