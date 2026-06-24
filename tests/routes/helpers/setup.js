'use strict';

const mongoose = require('mongoose');

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.MONGODB_URI = process.env.SPENDPILOT_TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/spend-pilot-routes-test';
process.env.SEED_DEMO_DATA = 'true';
process.env.CRON_SECRET = 'test-cron-secret';
process.env.MAIL_ENABLED = 'false';
process.env.ANTHROPIC_API_KEY = '';
process.env.PLAID_CLIENT_ID = '';
process.env.PLAID_SECRET = '';
process.env.CARD_SYNC_ENABLED = 'false';
process.env.LOG_LEVEL = 'error';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'spend-pilot-routes-test-secret';

const connectDB = require('../../../src/config/db');
const seedDemoData = require('../../../src/utils/seedDemoData');
const app = require('../../../src/app');

async function startServer() {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await seedDemoData();

  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => resolve(server));
    server.on('error', reject);
  });
}

async function stopServer(server) {
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await mongoose.connection.close();
}

module.exports = { startServer, stopServer };
