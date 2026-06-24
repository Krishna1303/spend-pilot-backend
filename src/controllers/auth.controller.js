'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const User = require('../models/User');
const { signToken } = require('../middleware/authMiddleware');

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwertyui', 'qwerty123', 'iloveyou', 'letmein1', 'welcome1', 'admin123', 'abc12345',
]);

/** Reject short, trivial, or well-known weak passwords. */
function isWeakPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return true;
  if (/^(.)\1+$/.test(pw)) return true; // all the same character
  if (/^\d+$/.test(pw)) return true; // digits only
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) return true;
  return false;
}

/** POST /api/auth/signup */
const signup = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (isWeakPassword(password)) {
    throw ApiError.badRequest(
      'Password is too weak. Use at least 8 characters and avoid common or all-numeric passwords.'
    );
  }

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
