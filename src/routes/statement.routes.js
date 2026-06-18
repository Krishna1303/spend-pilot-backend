'use strict';

const express = require('express');
const { uploadStatement } = require('../controllers/statement.controller');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');

const router = express.Router();

// Accept the file under either "statement" or "pdf" (both appear in the spec).
router.post('/upload', protect, upload.any(), uploadStatement);

module.exports = router;
