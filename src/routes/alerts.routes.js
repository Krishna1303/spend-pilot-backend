'use strict';

const express = require('express');
const { getAlerts } = require('../controllers/alerts.controller');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', protect, getAlerts);

module.exports = router;
