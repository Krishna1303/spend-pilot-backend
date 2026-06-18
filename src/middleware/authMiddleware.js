'use strict';

const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const User = require('../models/User');

/** Sign a short-lived access token for a user document. */
function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );
}

/** Extract a bearer token from the Authorization header. */
function getToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

/** Require a valid JWT; attaches the user document to req.user. */
const protect = asyncHandler(async (req, res, next) => {
  const token = getToken(req);
  if (!token) throw ApiError.unauthorized('Authentication token missing');

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch (err) {
    throw ApiError.unauthorized('Invalid or expired token');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('User no longer exists');

  req.user = user;
  next();
});

/** Require the authenticated user to be an admin. Use after `protect`. */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return next(ApiError.forbidden('Admin access required'));
  }
  next();
}

module.exports = { protect, requireAdmin, signToken };
