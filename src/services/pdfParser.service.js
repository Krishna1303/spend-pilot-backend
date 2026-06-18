'use strict';

const { PDFParse } = require('pdf-parse');
const { toISODate } = require('../utils/dates');

/**
 * Extract key fields from a text-based credit card statement PDF.
 * Returns a review payload; the frontend confirms/edits before use.
 */
async function parseStatement(buffer) {
  // pdf-parse v2: instantiate with the buffer, then extract text.
  const parser = new PDFParse({ data: buffer });
  let data;
  try {
    data = await parser.getText();
  } finally {
    if (typeof parser.destroy === 'function') {
      await parser.destroy().catch(() => {});
    }
  }
  const rawText = data.text || '';
  const normalized = rawText.replace(/[ \t]+/g, ' ').replace(/\r/g, '');

  const statementBalance = extractMoney(normalized, [
    'new balance',
    'statement balance',
    'current balance',
    'total balance',
  ]);

  const minimumPayment = extractMoney(normalized, [
    'minimum payment due',
    'minimum payment',
    'minimum amount due',
    'min payment due',
  ]);

  const dueDate = extractDate(normalized, ['payment due date', 'due date']);
  const apr = extractApr(normalized);

  return {
    extracted: {
      statementBalance,
      minimumPayment,
      dueDate,
      apr,
    },
    rawPreview: rawText.slice(0, 500).trim(),
    needsReview: true,
  };
}

/** Find the first money amount appearing after any of the given labels. */
function extractMoney(text, labels) {
  for (const label of labels) {
    const re = new RegExp(`${escape(label)}[:\\s]*\\$?\\s*([0-9][0-9,]*\\.?[0-9]{0,2})`, 'i');
    const m = text.match(re);
    if (m) {
      const value = parseFloat(m[1].replace(/,/g, ''));
      if (Number.isFinite(value)) return value;
    }
  }
  return null;
}

/** Find the first date appearing after any of the given labels. */
function extractDate(text, labels) {
  for (const label of labels) {
    const re = new RegExp(
      `${escape(label)}[:\\s]*([0-9]{1,2}\\/[0-9]{1,2}\\/[0-9]{2,4}|[0-9]{4}-[0-9]{1,2}-[0-9]{1,2})`,
      'i'
    );
    const m = text.match(re);
    if (m) {
      const iso = toISODate(m[1]);
      if (iso) return iso;
    }
  }
  return null;
}

/** Find an APR percentage if present (e.g. "Purchase APR 24.99%"). */
function extractApr(text) {
  const m = text.match(/apr[:\s]*([0-9]{1,2}\.?[0-9]{0,2})\s*%/i);
  if (m) {
    const value = parseFloat(m[1]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function escape(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { parseStatement };
