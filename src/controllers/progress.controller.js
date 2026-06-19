'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { getProgress } = require('../services/progress.service');

/** GET /api/progress — debt history, milestones, and projected interest saved. */
const progress = asyncHandler(async (req, res) => {
  const data = await getProgress(req.user.id);
  res.json(data);
});

module.exports = { progress };
