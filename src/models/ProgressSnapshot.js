'use strict';

const mongoose = require('mongoose');

/**
 * A daily point of the user's total credit-card debt + utilization, used to
 * draw the "debt going down" chart and detect milestones. One row per user
 * per day (idempotent upsert).
 */
const progressSnapshotSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: Date, required: true }, // truncated to the day (UTC)
    totalBalance: { type: Number, default: 0 },
    totalCreditLimit: { type: Number, default: 0 },
    utilization: { type: Number, default: 0 }, // percent
    creditCardCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

progressSnapshotSchema.index({ userId: 1, date: 1 }, { unique: true });

progressSnapshotSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('ProgressSnapshot', progressSnapshotSchema);
