'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { env } = require('../config/env');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    // Never selected by default so it can't accidentally leak in responses.
    passwordHash: { type: String, required: true, select: false },
    mobile: { type: String, trim: true, maxlength: 30 },
    profileImageUrl: { type: String, trim: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user', index: true },
    subscriptionPlan: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },

    // Stored only for the Plaid sandbox demo; never real bank credentials.
    plaidAccessToken: { type: String, select: false },
    plaidItemId: { type: String, select: false },

    // CRM TOTP second factor. Secret is AES-GCM encrypted at rest.
    totpSecret: { type: String, select: false },
    totpEnabled: { type: Boolean, default: false },

    lastLoginAt: { type: Date },
    lastLoginIp: { type: String },
  },
  { timestamps: true }
);

/** Hash and set the password. */
userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, env.BCRYPT_SALT_ROUNDS);
};

/** Compare a candidate password against the stored hash. */
userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

/** Public, safe representation for API responses. */
userSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this.id,
    name: this.name,
    email: this.email,
    mobile: this.mobile,
    profileImageUrl: this.profileImageUrl,
    role: this.role,
    subscriptionPlan: this.subscriptionPlan,
    createdAt: this.createdAt,
  };
};

// Strip sensitive fields from any accidental serialization.
userSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret.passwordHash;
    delete ret.plaidAccessToken;
    delete ret.plaidItemId;
    delete ret.totpSecret;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
