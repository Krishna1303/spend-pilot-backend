'use strict';

/** Date helpers used by the parser and optimizer risk scoring. */

/** Parse common statement date formats into a Date, or null. */
function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const str = String(value).trim();

  // ISO yyyy-mm-dd
  let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // mm/dd/yyyy or mm/dd/yy
  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let year = +m[3];
    if (year < 100) year += 2000;
    const d = new Date(Date.UTC(year, +m[1] - 1, +m[2]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const fallback = new Date(str);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

/** Whole days from now until the given date (negative if past). */
function daysUntil(value) {
  const d = parseDate(value);
  if (!d) return null;
  const ms = d.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

/** Normalize a date to ISO yyyy-mm-dd, or null. */
function toISODate(value) {
  const d = parseDate(value);
  return d ? d.toISOString().slice(0, 10) : null;
}

module.exports = { parseDate, daysUntil, toISODate };
