'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { narrate, KINDS } = require('../services/aiExplanation.service');

/**
 * POST /api/ai/explain
 * Body (either form):
 *   - { kind: 'optimizer'|'rescue'|'simulate'|'balanceTransfer', result, cards? }
 *   - { optimizerResult, cards? }   (legacy — equivalent to kind:'optimizer')
 * Narrates the already-calculated result in plain English (AI explains only).
 */
const explain = asyncHandler(async (req, res) => {
  const { cards, optimizerResult, kind, result } = req.body;

  let out;
  if (kind) {
    if (!KINDS[kind]) {
      throw ApiError.badRequest(`kind must be one of: ${Object.keys(KINDS).join(', ')}`);
    }
    if (!result) throw ApiError.badRequest('result is required when kind is provided');
    out = await narrate({ kind, payload: result, cards });
  } else if (optimizerResult) {
    out = await narrate({ kind: 'optimizer', payload: optimizerResult, cards });
  } else {
    throw ApiError.badRequest('Provide { kind, result } or { optimizerResult }');
  }

  res.json(out);
});

module.exports = { explain };
