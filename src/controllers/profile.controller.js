'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const User = require('../models/User');
const Card = require('../models/Card');
const Transaction = require('../models/Transaction');
const OptimizerRecommendation = require('../models/OptimizerRecommendation');
const SupportTicket = require('../models/SupportTicket');
const logger = require('../config/logger');

/** GET /api/profile */
const getProfile = asyncHandler(async (req, res) => {
  res.json({ user: req.user.toPublicJSON() });
});

/** PATCH /api/profile */
const updateProfile = asyncHandler(async (req, res) => {
  const { name, mobile, profileImageUrl } = req.body;
  if (name !== undefined) req.user.name = name;
  if (mobile !== undefined) req.user.mobile = mobile;
  if (profileImageUrl !== undefined) req.user.profileImageUrl = profileImageUrl;
  await req.user.save();
  res.json({ user: req.user.toPublicJSON() });
});

/**
 * DELETE /api/profile
 * Permanently deletes the account and all data owned by the user.
 * Requires the current password as confirmation (re-auth for a destructive,
 * irreversible action).
 */
const deleteAccount = asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!password) throw ApiError.badRequest('Password confirmation is required to delete your account');

  // protect() strips passwordHash (select:false) — re-fetch to verify.
  const user = await User.findById(req.user.id).select('+passwordHash');
  if (!user) throw ApiError.notFound('Account not found');

  const ok = await user.comparePassword(password);
  if (!ok) throw ApiError.unauthorized('Password is incorrect');

  const userId = req.user.id;

  // Cascade delete owned data before removing the user record.
  await Promise.all([
    Card.deleteMany({ userId }),
    Transaction.deleteMany({ userId }),
    OptimizerRecommendation.deleteMany({ userId }),
    SupportTicket.deleteMany({ userId }),
  ]);
  await User.deleteOne({ _id: userId });

  logger.info('Account deleted', { userId });
  res.json({ deleted: true });
});

module.exports = { getProfile, updateProfile, deleteAccount };
