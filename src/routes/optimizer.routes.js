'use strict';

const express = require('express');
const { recommend } = require('../controllers/optimizer.controller');
const { protect } = require('../middleware/authMiddleware');
const { validateBody } = require('../middleware/validate');

const router = express.Router();

router.post(
  '/recommend',
  protect,
  validateBody({ maxPayment: { type: 'number', required: true, min: 0 } }),
  recommend
);

module.exports = router;
