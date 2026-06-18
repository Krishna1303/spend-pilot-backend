'use strict';

const express = require('express');
const { getTerms, getPrivacy, getHelp } = require('../controllers/content.controller');

// Public content — no auth so terms/privacy/help can show before login too.
const router = express.Router();

router.get('/legal/terms', getTerms);
router.get('/legal/privacy', getPrivacy);
router.get('/help', getHelp);

module.exports = router;
