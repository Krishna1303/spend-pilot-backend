'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { getDashboard } = require('../services/dashboard.service');

/**
 * GET /api/dashboard
 * Optional ?rangeDays=N (1-365, default 30) for the summary/category window.
 */
const dashboard = asyncHandler(async (req, res) => {
  let rangeDays = parseInt(req.query.rangeDays, 10);
  if (!Number.isFinite(rangeDays) || rangeDays < 1 || rangeDays > 365) rangeDays = 30;

  const data = await getDashboard(req.user.id, { rangeDays });
  res.json(data);
});

module.exports = { dashboard };
