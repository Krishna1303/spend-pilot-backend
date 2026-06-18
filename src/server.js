'use strict';

const { env, validateEnv } = require('./config/env');
const logger = require('./config/logger');
const connectDB = require('./config/db');
const seedDemoData = require('./utils/seedDemoData');

let server;

async function start() {
  // Fail fast on a bad/insecure environment before opening any ports.
  validateEnv();

  await connectDB();

  if (env.SEED_DEMO_DATA) {
    try {
      await seedDemoData();
    } catch (err) {
      logger.warn('Demo seeding failed (continuing without it)', { error: err.message });
    }
  }

  // Require the app only after env is validated and config is ready.
  const app = require('./app');

  server = app.listen(env.PORT, () => {
    logger.info(`SpendPilot API listening on port ${env.PORT}`, { env: env.NODE_ENV });
  });
}

function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully`);
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
    // Force-exit if it hangs.
    setTimeout(() => process.exit(1), 10000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: reason && reason.message ? reason.message : String(reason) });
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

start().catch((err) => {
  logger.error('Failed to start server', { error: err.message, stack: err.stack });
  process.exit(1);
});
