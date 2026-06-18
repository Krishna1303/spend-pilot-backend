'use strict';

const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    cardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Card' },
    accountId: { type: String },

    amount: { type: Number, required: true },
    merchant: { type: String, trim: true },
    category: { type: String, trim: true },
    date: { type: Date, required: true },
    source: { type: String, enum: ['plaid', 'sample', 'manual'], default: 'sample' },
  },
  { timestamps: true }
);

transactionSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Transaction', transactionSchema);
