'use strict';

const express = require('express');
const {
  recommend, rescue, simulateScenarios, evaluateBalanceTransfer,
} = require('../controllers/optimizer.controller');
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

router.post(
  '/simulate',
  protect,
  validateBody({
    scenarios: { type: 'array', required: true, min: 1 },
    monthlyPayment: { type: 'number', min: 0 },
  }),
  simulateScenarios
);

router.post(
  '/balance-transfer',
  protect,
  validateBody({ monthlyPayment: { type: 'number', required: true, min: 0 } }),
  evaluateBalanceTransfer
);

module.exports = router;
