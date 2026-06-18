'use strict';

/** Standalone seeding script: `npm run seed`. */
const { validateEnv } = require('../config/env');
const logger = require('../config/logger');
const connectDB = require('../config/db');
const seedDemoData = require('../utils/seedDemoData');
const mongoose = require('mongoose');

(async () => {
  try {
    validateEnv();
    await connectDB();
    await seedDemoData();
    logger.info('Seeding complete');
  } catch (err) {
    logger.error('Seeding failed', { error: err.message });
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
})();
