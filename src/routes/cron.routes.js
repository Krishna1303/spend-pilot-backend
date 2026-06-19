'use strict';

const express = require('express');
const { cardSync, alertsDigest } = require('../controllers/cron.controller');

// Cron endpoints authenticate with CRON_SECRET (not JWT).
const router = express.Router();

router.get('/card-sync', cardSync);
router.get('/alerts-digest', alertsDigest);

module.exports = router;
