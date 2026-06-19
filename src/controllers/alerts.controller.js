'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { buildAlerts } = require('../services/alerts.service');

/** GET /api/alerts — the user's current payment/utilization/payday alerts. */
const getAlerts = asyncHandler(async (req, res) => {
  const result = await buildAlerts(req.user.id);
  res.json(result);
});

module.exports = { getAlerts };
