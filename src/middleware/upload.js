'use strict';

const multer = require('multer');

/**
 * In-memory PDF upload. Memory storage keeps the buffer for the parser without
 * writing to disk. Limited to 5 MB and PDF mime type only.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    if (file.mimetype === 'application/pdf') return cb(null, true);
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only PDF files are allowed'));
  },
});

module.exports = upload;
