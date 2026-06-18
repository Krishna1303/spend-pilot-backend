'use strict';

const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    sender: { type: String, enum: ['user', 'admin', 'bot'], required: true },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const supportTicketSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    status: { type: String, enum: ['open', 'pending', 'resolved'], default: 'open', index: true },
    messages: { type: [messageSchema], default: [] },
    assignedAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

supportTicketSchema.set('toJSON', {
  virtuals: true,
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
