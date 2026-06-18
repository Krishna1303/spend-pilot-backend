'use strict';

const mongoose = require('mongoose');

const cardSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    source: { type: String, enum: ['manual', 'pdf', 'plaid'], default: 'manual' },
    // Drives the Cards screen sub-tabs. Only credit cards feed the optimizer.
    cardType: { type: String, enum: ['credit', 'debit'], default: 'credit', index: true },

    bankName: { type: String, trim: true, maxlength: 120 },
    cardName: { type: String, trim: true, maxlength: 120 },
    last4: { type: String, trim: true, maxlength: 4 },

    balance: { type: Number, default: 0, min: 0 },
    statementBalance: { type: Number, min: 0 },
    minimumPayment: { type: Number, default: 0, min: 0 },
    dueDate: { type: Date },
    apr: { type: Number, default: 0, min: 0 },
    creditLimit: { type: Number, min: 0 },
    utilization: { type: Number, min: 0 },

    lastSyncedAt: { type: Date },
  },
  { timestamps: true }
);

// Derive utilization when both balance and limit are present.
cardSchema.pre('save', function computeUtilization(next) {
  if (this.creditLimit && this.creditLimit > 0) {
    this.utilization = Math.round((this.balance / this.creditLimit) * 1000) / 10; // percent, 1dp
  }
  next();
});

cardSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Card', cardSchema);
