'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const Card = require('../models/Card');
const OptimizerRecommendation = require('../models/OptimizerRecommendation');
const { optimizePayments } = require('../services/optimizer.service');
const { buildRescuePlan } = require('../services/rescue.service');
const { simulate } = require('../services/simulate.service');
const { evaluateTransfer } = require('../services/balanceTransfer.service');
const { narrate } = require('../services/aiExplanation.service');

/**
 * POST /api/optimizer/recommend
 * Body: { cards?, maxPayment, explain? }
 * If `cards` is omitted, the user's stored CREDIT cards are used (debit cards
 * carry no APR/debt and are excluded from the payment plan). Pass `explain: true`
 * to get the plain-English AI explanation in the same response, in sync with the
 * plan (so the frontend never has to stitch two calls together).
 */
const recommend = asyncHandler(async (req, res) => {
  const { maxPayment, explain } = req.body;
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

  const response = {
    strategy: result.strategy,
    plan: result.plan,
    riskScores: result.riskScores,
    warning: result.warning,
    totalMinimum: result.totalMinimum,
    remaining: result.remaining,
  };

  if (explain) {
    const ex = await narrate({ kind: 'optimizer', payload: result, cards });
    response.explanation = ex.explanation;
    response.explanationSource = ex.source;
  }

  res.json(response);
});

/**
 * POST /api/optimizer/rescue
 * Body: { paycheckDate, paycheckAmount, cashBuffer?, currentCash?, lateFeePerCard?,
 *         cards?, explain? }
 * Produces a date-by-date Payday Rescue Plan. Uses the user's stored credit
 * cards when `cards` is omitted. Pass `explain: true` for an in-sync AI
 * explanation in the same response.
 */
const rescue = asyncHandler(async (req, res) => {
  const { paycheckDate, paycheckAmount, cashBuffer, currentCash, lateFeePerCard, explain } = req.body;
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

  if (explain) {
    const ex = await narrate({ kind: 'rescue', payload: plan, cards });
    plan.explanation = ex.explanation;
    plan.explanationSource = ex.source;
  }

  res.json(plan);
});

/**
 * POST /api/optimizer/simulate
 * Body: { scenarios: [...], monthlyPayment?, cards? }
 * Compares what-if scenarios (extra payment, lump sum, balance transfer,
 * removing a card) against a baseline. Uses stored credit cards when omitted.
 */
const simulateScenarios = asyncHandler(async (req, res) => {
  const { scenarios, monthlyPayment } = req.body;
  let cards = req.body.cards;

  if (!Array.isArray(cards) || cards.length === 0) {
    cards = await Card.find({ userId: req.user.id, cardType: 'credit' });
  }
  if (!cards || cards.length === 0) {
    throw ApiError.badRequest('No credit cards available. Add a credit card first.');
  }

  const result = simulate(cards, { scenarios, monthlyPayment });
  res.json(result);
});

/**
 * POST /api/optimizer/balance-transfer
 * Body: { amount? | sourceCardId?, sourceApr?, monthlyPayment, offer }
 * Evaluates whether moving a balance to a promo offer saves money. When a
 * sourceCardId is given, the card's balance/APR fill in any missing amount/APR.
 */
const evaluateBalanceTransfer = asyncHandler(async (req, res) => {
  const { sourceCardId, monthlyPayment, offer } = req.body;
  let { amount, sourceApr } = req.body;

  if (!offer || typeof offer !== 'object') throw ApiError.badRequest('offer is required');
  if (offer.promoMonths == null) throw ApiError.badRequest('offer.promoMonths is required');

  if (sourceCardId) {
    const card = await Card.findOne({ _id: sourceCardId, userId: req.user.id });
    if (!card) throw ApiError.notFound('Source card not found');
    if (amount == null) amount = card.balance;
    if (sourceApr == null) sourceApr = card.apr;
  }

  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    throw ApiError.badRequest('amount (or a sourceCardId with a balance) is required');
  }
  if (!Number.isFinite(Number(sourceApr))) {
    throw ApiError.badRequest('sourceApr (or a sourceCardId) is required');
  }

  const result = evaluateTransfer({ amount, sourceApr, monthlyPayment, offer });
  res.json(result);
});

module.exports = { recommend, rescue, simulateScenarios, evaluateBalanceTransfer };
