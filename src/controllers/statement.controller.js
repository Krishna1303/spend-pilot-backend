'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { parseStatement } = require('../services/pdfParser.service');

/** POST /api/statements/upload  (multipart/form-data, field: statement) */
const uploadStatement = asyncHandler(async (req, res) => {
  // upload.any() puts files on req.files; accept "statement" or "pdf".
  const file = req.file || (Array.isArray(req.files) ? req.files[0] : null);
  if (!file) throw ApiError.badRequest('No PDF file uploaded (expected field "statement" or "pdf")');
  if (file.mimetype !== 'application/pdf') {
    throw ApiError.badRequest('Only PDF files are supported');
  }

  try {
    const payload = await parseStatement(file.buffer);
    res.json(payload);
  } catch (err) {
    // Parsing failure should still return a reviewable state, not a 500.
    throw ApiError.badRequest('Could not parse the PDF. Please enter the values manually.');
  }
});

module.exports = { uploadStatement };
