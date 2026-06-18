'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { explainPlan } = require('../services/aiExplanation.service');

/**
 * POST /api/ai/explain
 * Body: { cards?, optimizerResult }
 */
const explain = asyncHandler(async (req, res) => {
  const { cards, optimizerResult } = req.body;
  if (!optimizerResult) throw ApiError.badRequest('optimizerResult is required');

  const { explanation, source, model } = await explainPlan({ cards, optimizerResult });
  res.json({ explanation, source, model });
});

module.exports = { explain };
