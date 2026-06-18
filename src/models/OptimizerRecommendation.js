'use strict';

const mongoose = require('mongoose');

const optimizerRecommendationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    maxPayment: { type: Number, required: true },
    strategy: { type: String },
    cardsSnapshot: { type: Array, default: [] },
    plan: { type: Array, default: [] },
    riskScores: { type: Array, default: [] },
    warning: { type: String, default: null },
    aiExplanation: { type: String },
  },
  { timestamps: true }
);

optimizerRecommendationSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('OptimizerRecommendation', optimizerRecommendationSchema);
