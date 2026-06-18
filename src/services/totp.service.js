'use strict';

const otplib = require('otplib');
const QRCode = require('qrcode');
const { env } = require('../config/env');

/**
 * TOTP helpers (otplib v13 functional API). A verification window of 1 allows
 * +/- one 30s time step of clock drift between server and authenticator app.
 */

/** Generate a new base32 TOTP secret. */
function generateSecret() {
  return otplib.generateSecret();
}

/** Build the otpauth:// URI an authenticator app imports (via QR or manual). */
function keyuri(accountName, secret) {
  return otplib.generateURI({ secret, label: accountName, issuer: env.TOTP_ISSUER });
}

/** Render the otpauth URI as a QR-code data URL for display. */
function qrDataUrl(otpauthUri) {
  return QRCode.toDataURL(otpauthUri);
}

/** Verify a 6-digit token against the secret. Returns a boolean. */
function verifyToken(token, secret) {
  const result = otplib.verifySync({ token: String(token).trim(), secret, window: 1 });
  return !!(result && result.valid);
}

module.exports = { generateSecret, keyuri, qrDataUrl, verifyToken };
