'use strict';

/**
 * Vercel serverless entry point.
 *
 * Vercel runs the app as a function (no app.listen). We ensure the env is
 * valid and the (cached) Mongo connection is established before delegating to
 * the Express app. The in-process daily scheduler is NOT started here — on
 * Vercel that job runs via Vercel Cron hitting /api/cron/card-sync.
 */
const { validateEnv } = require('../src/config/env');
const connectDB = require('../src/config/db');
const app = require('../src/app');

let bootstrap;
function ensureReady() {
  if (!bootstrap) {
    validateEnv();
    bootstrap = connectDB().catch((err) => {
      bootstrap = null; // let the next invocation retry
      throw err;
    });
  }
  return bootstrap;
}

module.exports = async (req, res) => {
  try {
    await ensureReady();
  } catch (err) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Service unavailable (startup/database error)' }));
    return;
  }
  app(req, res);
};
