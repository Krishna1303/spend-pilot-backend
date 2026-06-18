'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const Card = require('../models/Card');
const User = require('../models/User');
const { syncUserCards } = require('../services/cardSync.service');

const EDITABLE_FIELDS = [
  'source', 'cardType', 'bankName', 'cardName', 'last4', 'balance', 'statementBalance',
  'minimumPayment', 'dueDate', 'apr', 'creditLimit',
];

function pickFields(body) {
  const out = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) out[field] = body[field];
  }
  return out;
}

/**
 * GET /api/cards
 * Optional ?type=credit|debit filter to power the Cards screen sub-tabs.
 */
const listCards = asyncHandler(async (req, res) => {
  const filter = { userId: req.user.id };
  const { type } = req.query;
  if (type !== undefined) {
    if (!['credit', 'debit'].includes(type)) {
      throw ApiError.badRequest('type must be "credit" or "debit"');
    }
    filter.cardType = type;
  }
  const cards = await Card.find(filter).sort({ createdAt: -1 });
  res.json({ cards });
});

/** POST /api/cards */
const createCard = asyncHandler(async (req, res) => {
  const card = await Card.create({ ...pickFields(req.body), userId: req.user.id });
  res.status(201).json({ card });
});

/** GET /api/cards/:id */
const getCard = asyncHandler(async (req, res) => {
  const card = await Card.findOne({ _id: req.params.id, userId: req.user.id });
  if (!card) throw ApiError.notFound('Card not found');
  res.json({ card });
});

/** PATCH /api/cards/:id */
const updateCard = asyncHandler(async (req, res) => {
  const card = await Card.findOne({ _id: req.params.id, userId: req.user.id });
  if (!card) throw ApiError.notFound('Card not found');
  Object.assign(card, pickFields(req.body));
  await card.save();
  res.json({ card });
});

/** DELETE /api/cards/:id */
const deleteCard = asyncHandler(async (req, res) => {
  const card = await Card.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
  if (!card) throw ApiError.notFound('Card not found');
  res.json({ deleted: true, id: req.params.id });
});

/**
 * POST /api/cards/sync
 * Manually pull the latest balances for the user's Plaid-connected cards.
 * Respects the once-a-day idempotency guard; pass ?force=true to override
 * (useful for the demo).
 */
const syncCards = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('+plaidAccessToken');
  const force = req.query.force === 'true' || req.body.force === true;
  const result = await syncUserCards(user, { force });
  res.json(result);
});

module.exports = { listCards, createCard, getCard, updateCard, deleteCard, syncCards };
