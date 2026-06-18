'use strict';

const mongoose = require('mongoose');
const { env } = require('./env');
const logger = require('./logger');

// Avoid leaking query operators; strict query keeps undefined fields out.
mongoose.set('strictQuery', true);

/**
 * Cached connection so serverless invocations (Vercel) reuse a single Mongo
 * connection across warm function calls instead of reconnecting per request.
 * Also works fine for the long-running server (connects once).
 */
let cached = global.__spendpilotMongoose;
if (!cached) {
  cached = global.__spendpilotMongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) return cached.conn;

  const uri = env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in environment variables');
  }

  if (!cached.promise) {
    mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
    mongoose.connection.on('error', (err) => logger.error('MongoDB connection error', { error: err.message }));
    mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));

    cached.promise = mongoose
      .connect(uri, {
        serverSelectionTimeoutMS: 10000,
        maxPoolSize: 5, // keep the pool small for serverless
      })
      .then((m) => m.connection);
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null; // allow a retry on the next invocation
    throw err;
  }
  return cached.conn;
}

module.exports = connectDB;
