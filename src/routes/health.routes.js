'use strict';

const express = require('express');
const mongoose = require('mongoose');
const { env } = require('../config/env');
const { getAIClient } = require('../config/ai');
const { getPlaidClient } = require('../config/plaid');

const router = express.Router();

const STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

/** GET /api/health — liveness + dependency status for monitoring. */
router.get('/', (req, res) => {
  const dbState = mongoose.connection.readyState;
  res.json({
    ok: true,
    service: 'SpendPilot API',
    status: 'ok',
    env: env.NODE_ENV,
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    dependencies: {
      db: STATES[dbState] || 'unknown',
      ai: getAIClient() ? 'configured' : 'fallback',
      plaid: getPlaidClient() ? 'configured' : 'fallback',
    },
    memory: {
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
  });
});

/** GET /api/health/ready — readiness probe (503 until DB connects). */
router.get('/ready', (req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ ready });
});

module.exports = router;
