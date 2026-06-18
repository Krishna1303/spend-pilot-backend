'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const Card = require('../models/Card');
const OptimizerRecommendation = require('../models/OptimizerRecommendation');
const { optimizePayments } = require('../services/optimizer.service');

/**
 * POST /api/optimizer/recommend
 * Body: { cards?, maxPayment }
 * If `cards` is omitted, the user's stored cards are used.
 */
const recommend = asyncHandler(async (req, res) => {
  const { maxPayment } = req.body;
  let cards = req.body.cards;

  if (!Array.isArray(cards) || cards.length === 0) {
    cards = await Card.find({ userId: req.user.id });
  }

  if (!cards || cards.length === 0) {
    throw ApiError.badRequest('No cards available to optimize. Add a card first.');
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

module.exports = { recommend };
