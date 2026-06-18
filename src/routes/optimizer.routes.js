'use strict';

const express = require('express');
const { recommend, rescue } = require('../controllers/optimizer.controller');
const { protect } = require('../middleware/authMiddleware');
const { validateBody } = require('../middleware/validate');

const router = express.Router();

router.post(
  '/recommend',
  protect,
  validateBody({ maxPayment: { type: 'number', required: true, min: 0 } }),
  recommend
);

router.post(
  '/rescue',
  protect,
  validateBody({
    paycheckDate: { type: 'string', required: true },
    paycheckAmount: { type: 'number', required: true, min: 0 },
    cashBuffer: { type: 'number', min: 0 },
    currentCash: { type: 'number', min: 0 },
    lateFeePerCard: { type: 'number', min: 0 },
  }),
  rescue
);

module.exports = router;
