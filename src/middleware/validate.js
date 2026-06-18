'use strict';

const ApiError = require('../utils/ApiError');

/**
 * Lightweight, dependency-free body validation. Keeps the hackathon scope
 * small while still rejecting malformed input with a consistent error shape.
 *
 * Usage:
 *   validateBody({
 *     email: { type: 'email', required: true },
 *     password: { type: 'string', required: true, min: 6 },
 *   })
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkField(name, value, rule) {
  const errors = [];

  if (value === undefined || value === null || value === '') {
    if (rule.required) errors.push(`${name} is required`);
    return errors;
  }

  switch (rule.type) {
    case 'string':
      if (typeof value !== 'string') errors.push(`${name} must be a string`);
      else {
        if (rule.min && value.length < rule.min) errors.push(`${name} must be at least ${rule.min} characters`);
        if (rule.max && value.length > rule.max) errors.push(`${name} must be at most ${rule.max} characters`);
      }
      break;
    case 'email':
      if (typeof value !== 'string' || !EMAIL_RE.test(value)) errors.push(`${name} must be a valid email`);
      break;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) errors.push(`${name} must be a number`);
      else {
        if (rule.min !== undefined && value < rule.min) errors.push(`${name} must be >= ${rule.min}`);
        if (rule.max !== undefined && value > rule.max) errors.push(`${name} must be <= ${rule.max}`);
      }
      break;
    case 'array':
      if (!Array.isArray(value)) errors.push(`${name} must be an array`);
      else if (rule.min !== undefined && value.length < rule.min) errors.push(`${name} must have at least ${rule.min} item(s)`);
      break;
    default:
      break;
  }
  return errors;
}

function validateBody(schema) {
  return function validator(req, res, next) {
    const errors = [];
    for (const [name, rule] of Object.entries(schema)) {
      errors.push(...checkField(name, req.body ? req.body[name] : undefined, rule));
    }
    if (errors.length) {
      return next(ApiError.badRequest('Validation failed', errors));
    }
    next();
  };
}

module.exports = { validateBody };
