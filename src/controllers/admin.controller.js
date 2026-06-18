'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const User = require('../models/User');
const Card = require('../models/Card');
const SupportTicket = require('../models/SupportTicket');
const { notifyUserOfReply } = require('../services/email.service');

/** GET /api/admin/users — list users with card counts. */
const listUsers = asyncHandler(async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 }).limit(200);

  const counts = await Card.aggregate([
    { $group: { _id: '$userId', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));

  const result = users.map((u) => ({
    ...u.toPublicJSON(),
    cardCount: countMap.get(u.id) || 0,
  }));
  res.json({ users: result });
});

/** GET /api/admin/tickets — all tickets, optional ?status= filter. */
const listTickets = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const tickets = await SupportTicket.find(filter)
    .sort({ updatedAt: -1 })
    .populate('userId', 'name email')
    .limit(200);
  res.json({ tickets });
});

/** PATCH /api/admin/tickets/:id  Body: { status?, reply? } */
const updateTicket = asyncHandler(async (req, res) => {
  const { status, reply } = req.body;
  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) throw ApiError.notFound('Ticket not found');

  if (status) {
    if (!['open', 'pending', 'resolved'].includes(status)) {
      throw ApiError.badRequest('status must be open, pending, or resolved');
    }
    ticket.status = status;
  }
  if (reply) {
    ticket.messages.push({ sender: 'admin', body: reply });
    ticket.assignedAdminId = req.user.id;
  }
  await ticket.save();

  // Relay (admin side): email the user that an agent replied.
  let userNotified = false;
  if (reply) {
    const ticketUser = await User.findById(ticket.userId);
    const mail = await notifyUserOfReply(ticket, ticketUser);
    userNotified = mail.delivered;
  }

  res.json({ ticket, userNotified });
});

module.exports = { listUsers, listTickets, updateTicket };
