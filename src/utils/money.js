'use strict';

/** Money helpers. All amounts are plain numbers in major currency units. */

/** Coerce to a finite, non-negative number rounded to 2 decimals. */
function toMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.max(0, n) * 100) / 100;
}

/** Round to 2 decimals (allows negatives). */
function round2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

module.exports = { toMoney, round2 };
