'use strict';

const express = require('express');
const { explain } = require('../controllers/ai.controller');
const { protect } = require('../middleware/authMiddleware');
const { aiLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post('/explain', protect, aiLimiter, explain);

module.exports = router;
