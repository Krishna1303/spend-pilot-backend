'use strict';

const express = require('express');
const { ask } = require('../controllers/chatbot.controller');
const { protect } = require('../middleware/authMiddleware');
const { aiLimiter } = require('../middleware/rateLimiter');
const { validateBody } = require('../middleware/validate');

const router = express.Router();

router.post(
  '/ask',
  protect,
  aiLimiter,
  validateBody({ question: { type: 'string', required: true, min: 1, max: 1000 } }),
  ask
);

module.exports = router;
