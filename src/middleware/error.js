'use strict';

const logger = require('../config/logger');
const { env } = require('../config/env');
const ApiError = require('../utils/ApiError');

function notFound(req, res, next) {
  next(ApiError.notFound(`Route not found - ${req.method} ${req.originalUrl}`));
}

/**
 * Central error handler. Returns a consistent `{ error: "message" }` shape and
 * never leaks stack traces to the client. Stacks are logged server-side only.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let details;

  // Mongoose: bad ObjectId
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path}`;
  }
  // Mongoose: schema validation
  else if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => e.message);
  }
  // Mongo: duplicate key
  else if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `An account with that ${field} already exists`;
  }
  // Multer file upload errors
  else if (err.name === 'MulterError') {
    statusCode = 400;
    message = err.message;
  }

  if (err.details) details = err.details;

  // Log unexpected errors with full stack; expected ones at warn.
  if (statusCode >= 500) {
    logger.error('Unhandled error', { requestId: req.id, message: err.message, stack: err.stack });
    if (env.isProduction) message = 'Internal Server Error';
  } else {
    logger.warn('Request error', { requestId: req.id, status: statusCode, message });
  }

  const payload = { error: message };
  if (details) payload.details = details;
  res.status(statusCode).json(payload);
}

module.exports = { notFound, errorHandler };
