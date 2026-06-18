'use strict';

const express = require('express');
const { cardSync } = require('../controllers/cron.controller');

// Cron endpoints authenticate with CRON_SECRET (not JWT).
const router = express.Router();

router.get('/card-sync', cardSync);

module.exports = router;
