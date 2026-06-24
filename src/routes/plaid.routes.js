'use strict';

const express = require('express');
const {
  createLinkToken, exchangePublicToken, sandboxConnect, getAccounts, getTransactions,
} = require('../controllers/plaid.controller');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.post('/create-link-token', createLinkToken);
router.post('/exchange-public-token', exchangePublicToken);
router.post('/sandbox/connect', sandboxConnect);
router.get('/accounts', getAccounts);
router.get('/transactions', getTransactions);

module.exports = router;
