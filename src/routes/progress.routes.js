'use strict';

const express = require('express');
const { progress } = require('../controllers/progress.controller');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', protect, progress);

module.exports = router;
