'use strict';

const multer = require('multer');
const ApiError = require('../utils/ApiError');

/**
 * In-memory PDF upload. Memory storage keeps the buffer for the parser without
 * writing to disk. Limited to 5 MB and PDF mime type only.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    if (file.mimetype === 'application/pdf') return cb(null, true);
    cb(ApiError.badRequest('Only PDF files are supported'));
  },
});

module.exports = upload;
