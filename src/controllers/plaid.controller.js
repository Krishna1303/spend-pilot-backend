'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const User = require('../models/User');
const plaidService = require('../services/plaid.service');

/** POST /api/plaid/create-link-token */
const createLinkToken = asyncHandler(async (req, res) => {
  const result = await plaidService.createLinkToken(req.user.id);
  res.json(result);
});

/** POST /api/plaid/exchange-public-token  Body: { public_token } */
const exchangePublicToken = asyncHandler(async (req, res) => {
  const { public_token: publicToken } = req.body;
  if (!publicToken) throw ApiError.badRequest('public_token is required');

  const { accessToken, itemId } = await plaidService.exchangePublicToken(publicToken);

  // Store the sandbox access token (select:false fields).
  const user = await User.findById(req.user.id).select('+plaidAccessToken +plaidItemId');
  user.plaidAccessToken = accessToken;
  user.plaidItemId = itemId;
  await user.save();

  res.json({ connected: true });
});

/**
 * POST /api/plaid/sandbox/connect
 * Sandbox-only convenience: mint a sandbox public_token, exchange it, store the
 * access token, and return the linked accounts — connects a demo bank in one
 * call without the Plaid Link UI.
 */
const sandboxConnect = asyncHandler(async (req, res) => {
  const publicToken = await plaidService.createSandboxPublicToken(req.body.institution_id);
  const { accessToken, itemId } = await plaidService.exchangePublicToken(publicToken);

  const user = await User.findById(req.user.id).select('+plaidAccessToken +plaidItemId');
  user.plaidAccessToken = accessToken;
  user.plaidItemId = itemId;
  await user.save();

  const { accounts } = await plaidService.getAccounts(accessToken);
  res.json({ connected: true, accounts });
});

/** GET /api/plaid/accounts */
const getAccounts = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('+plaidAccessToken');
  const { accounts, demo } = await plaidService.getAccounts(user.plaidAccessToken);
  res.json({ accounts, demo });
});

/** GET /api/plaid/transactions */
const getTransactions = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('+plaidAccessToken');
  const { transactions, demo } = await plaidService.getTransactions(user.plaidAccessToken);
  res.json({ transactions, demo });
});

module.exports = { createLinkToken, exchangePublicToken, sandboxConnect, getAccounts, getTransactions };
