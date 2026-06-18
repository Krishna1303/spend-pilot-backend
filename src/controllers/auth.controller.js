'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const User = require('../models/User');
const { signToken } = require('../middleware/authMiddleware');

/** POST /api/auth/signup */
const signup = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) throw ApiError.conflict('An account with that email already exists');

  const user = new User({ name, email: email.toLowerCase() });
  await user.setPassword(password);
  await user.save();

  const token = signToken(user);
  res.status(201).json({ token, user: user.toPublicJSON() });
});

/** POST /api/auth/login */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Need passwordHash explicitly since it's select:false.
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user) throw ApiError.unauthorized('Invalid email or password');

  const ok = await user.comparePassword(password);
  if (!ok) throw ApiError.unauthorized('Invalid email or password');

  user.lastLoginAt = new Date();
  user.lastLoginIp = req.ip;
  await user.save();

  const token = signToken(user);
  res.json({ token, user: user.toPublicJSON() });
});

module.exports = { signup, login };
