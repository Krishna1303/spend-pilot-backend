'use strict';

const crypto = require('crypto');
const { env } = require('../config/env');

/**
 * Symmetric encryption for secrets at rest (the TOTP secret).
 * AES-256-GCM with a key derived via scrypt from TOTP_ENCRYPTION_KEY
 * (falls back to a JWT_SECRET-derived key). Output: iv:tag:ciphertext (base64).
 */
const keyMaterial = env.TOTP_ENCRYPTION_KEY || env.JWT_SECRET;
const KEY = crypto.scryptSync(keyMaterial, 'spendpilot-totp-salt', 32);

function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

function decrypt(payload) {
  const [ivB, tagB, dataB] = String(payload).split(':');
  const iv = Buffer.from(ivB, 'base64');
  const tag = Buffer.from(tagB, 'base64');
  const data = Buffer.from(dataB, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Heuristic: does this look like our iv:tag:ciphertext format? */
function isEncrypted(value) {
  return typeof value === 'string' && /^[^:]+:[^:]+:[^:]+$/.test(value);
}

/**
 * Decrypt, but pass through values that aren't in our format (legacy plaintext
 * or demo tokens) and never throw — used by transparent model getters.
 */
function decryptSafe(value) {
  if (value == null) return value;
  try {
    return isEncrypted(value) ? decrypt(value) : value;
  } catch {
    return value;
  }
}

module.exports = { encrypt, decrypt, decryptSafe, isEncrypted };
