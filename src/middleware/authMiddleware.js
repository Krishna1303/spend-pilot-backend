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

/**
 * Sign an elevated CRM token (carries crm:true), issued only after a valid
 * TOTP step-up. Short-lived so CRM access expires quickly.
 */
function signCrmToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, crm: true },
    env.JWT_SECRET,
    { expiresIn: env.CRM_TOKEN_EXPIRES_IN }
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
  req.tokenPayload = payload; // exposes claims (e.g. crm) to downstream guards
  next();
});

/** Require the authenticated user to be an admin. Use after `protect`. */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return next(ApiError.forbidden('Admin access required'));
  }
  next();
}

/**
 * Gate CRM data routes behind a TOTP step-up. Requires an admin who has
 * enrolled TOTP and is presenting an elevated CRM token (crm:true).
 * CRM_TOTP_REQUIRED=false disables the gate for demos.
 */
function requireCrmAccess(req, res, next) {
  if (!env.CRM_TOTP_REQUIRED) return next();
  if (!req.user || req.user.role !== 'admin') {
    return next(ApiError.forbidden('Admin access required'));
  }
  if (!req.user.totpEnabled) {
    return next(ApiError.forbidden('Set up an authenticator (TOTP) before accessing the CRM'));
  }
  if (!req.tokenPayload || req.tokenPayload.crm !== true) {
    return next(ApiError.unauthorized('CRM step-up required: verify your authenticator code'));
  }
  return next();
}

module.exports = { protect, requireAdmin, requireCrmAccess, signToken, signCrmToken };
