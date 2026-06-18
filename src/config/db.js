'use strict';

const mongoose = require('mongoose');
const { env } = require('./env');
const logger = require('./logger');

async function connectDB() {
  const uri = env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in environment variables');
  }

  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('error', (err) => logger.error('MongoDB connection error', { error: err.message }));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));

  // Avoid leaking query operators; strict query keeps undefined fields out.
  mongoose.set('strictQuery', true);

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
  });

  return mongoose.connection;
}

module.exports = connectDB;
