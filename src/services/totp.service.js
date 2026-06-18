'use strict';

const crypto = require('crypto');
const QRCode = require('qrcode');
const { env } = require('../config/env');

/**
 * Self-contained TOTP (RFC 6238, SHA-1, 6 digits, 30s) built on Node's crypto.
 *
 * We intentionally avoid otplib: its base32 plugin is CommonJS but requires an
 * ESM-only dependency (@scure/base), which throws ERR_REQUIRE_ESM on serverless
 * runtimes (Vercel) and Node < 22. This implementation has zero external deps
 * (qrcode is pure CJS) and is standard-compatible with Google Authenticator,
 * Authy, 1Password, etc.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(input) {
  const clean = String(input).replace(/=+$/, '').toUpperCase().replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** HOTP for a given counter (RFC 4226). */
function hotp(secretBuffer, counter) {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secretBuffer).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, '0');
}

/** Generate a new 160-bit base32 TOTP secret. */
function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

/** Compute the TOTP code for a secret at a given time (ms). */
function generate(secret, atMs = Date.now()) {
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  return hotp(base32Decode(secret), counter);
}

/** Build the otpauth:// URI an authenticator app imports (via QR or manual). */
function keyuri(accountName, secret) {
  const label = encodeURIComponent(`${env.TOTP_ISSUER}:${accountName}`);
  const params = new URLSearchParams({
    secret,
    issuer: env.TOTP_ISSUER,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Render the otpauth URI as a QR-code data URL for display. */
function qrDataUrl(otpauthUri) {
  return QRCode.toDataURL(otpauthUri);
}

/**
 * Verify a token, allowing +/- `window` time steps of clock drift (default 1
 * = +/-30s). Uses a constant-time comparison per candidate.
 */
function verifyToken(token, secret, window = 1) {
  const candidate = String(token).trim();
  if (!/^\d{6}$/.test(candidate)) return false;
  const secretBuffer = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  for (let w = -window; w <= window; w += 1) {
    const expected = hotp(secretBuffer, counter + w);
    if (expected.length === candidate.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(candidate))) {
      return true;
    }
  }
  return false;
}

module.exports = { generateSecret, generate, keyuri, qrDataUrl, verifyToken };
