'use strict';

const express = require('express');
const { signup, login } = require('../controllers/auth.controller');
const { validateBody } = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post(
  '/signup',
  authLimiter,
  validateBody({
    name: { type: 'string', required: true, min: 1, max: 120 },
    email: { type: 'email', required: true },
    password: { type: 'string', required: true, min: 6, max: 128 },
  }),
  signup
);

router.post(
  '/login',
  authLimiter,
  validateBody({
    email: { type: 'email', required: true },
    password: { type: 'string', required: true },
  }),
  login
);

module.exports = router;
