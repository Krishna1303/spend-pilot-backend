'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const Card = require('../models/Card');
const OptimizerRecommendation = require('../models/OptimizerRecommendation');
const { optimizePayments } = require('../services/optimizer.service');
const { buildRescuePlan } = require('../services/rescue.service');

/**
 * POST /api/optimizer/recommend
 * Body: { cards?, maxPayment }
 * If `cards` is omitted, the user's stored CREDIT cards are used (debit cards
 * carry no APR/debt and are excluded from the payment plan).
 */
const recommend = asyncHandler(async (req, res) => {
  const { maxPayment } = req.body;
  let cards = req.body.cards;

  if (!Array.isArray(cards) || cards.length === 0) {
    cards = await Card.find({ userId: req.user.id, cardType: 'credit' });
  }

  if (!cards || cards.length === 0) {
    throw ApiError.badRequest('No credit cards available to optimize. Add a credit card first.');
  }

  const result = optimizePayments(cards, maxPayment);

  // Best-effort history log; never block the response on it.
  OptimizerRecommendation.create({
    userId: req.user.id,
    maxPayment: Number(maxPayment),
    strategy: result.strategy,
    cardsSnapshot: cards.map((c) => (c.toJSON ? c.toJSON() : c)),
    plan: result.plan,
    riskScores: result.riskScores,
    warning: result.warning,
  }).catch(() => {});

  res.json({
    strategy: result.strategy,
    plan: result.plan,
    riskScores: result.riskScores,
    warning: result.warning,
    totalMinimum: result.totalMinimum,
    remaining: result.remaining,
  });
});

/**
 * POST /api/optimizer/rescue
 * Body: { paycheckDate, paycheckAmount, cashBuffer?, currentCash?, lateFeePerCard?, cards? }
 * Produces a date-by-date Payday Rescue Plan. Uses the user's stored credit
 * cards when `cards` is omitted.
 */
const rescue = asyncHandler(async (req, res) => {
  const { paycheckDate, paycheckAmount, cashBuffer, currentCash, lateFeePerCard } = req.body;
  let cards = req.body.cards;

  if (!Array.isArray(cards) || cards.length === 0) {
    cards = await Card.find({ userId: req.user.id, cardType: 'credit' });
  }
  if (!cards || cards.length === 0) {
    throw ApiError.badRequest('No credit cards available. Add a credit card first.');
  }

  const plan = buildRescuePlan(cards, {
    paycheckDate,
    paycheckAmount,
    cashBuffer,
    currentCash,
    lateFeePerCard,
  });

  res.json(plan);
});

module.exports = { recommend, rescue };
