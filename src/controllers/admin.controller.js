'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const User = require('../models/User');
const Card = require('../models/Card');
const Transaction = require('../models/Transaction');
const OptimizerRecommendation = require('../models/OptimizerRecommendation');
const SupportTicket = require('../models/SupportTicket');
const logger = require('../config/logger');
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

/** GET /api/admin/users/:id — full detail for one user (CRM record view). */
const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  const [cardCount, ticketCount] = await Promise.all([
    Card.countDocuments({ userId: user.id }),
    SupportTicket.countDocuments({ userId: user.id }),
  ]);

  res.json({
    user: {
      ...user.toPublicJSON(),
      cardCount,
      ticketCount,
      lastLoginAt: user.lastLoginAt,
      lastLoginIp: user.lastLoginIp,
    },
  });
});

/**
 * PATCH /api/admin/users/:id  Body: { name, mobile, profileImageUrl, email,
 *                                     role, subscriptionPlan }
 * Edit a user record. Only whitelisted fields are mutable (never password or
 * Plaid tokens). An admin cannot remove their own admin role (self-lockout
 * guard); email changes are uniqueness-checked.
 */
const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  const { name, mobile, profileImageUrl, email, role, subscriptionPlan } = req.body;

  if (name !== undefined) user.name = name;
  if (mobile !== undefined) user.mobile = mobile;
  if (profileImageUrl !== undefined) user.profileImageUrl = profileImageUrl;
  if (subscriptionPlan !== undefined) user.subscriptionPlan = subscriptionPlan;

  if (role !== undefined) {
    if (!['user', 'admin'].includes(role)) throw ApiError.badRequest('role must be user or admin');
    if (String(user.id) === String(req.user.id) && role !== 'admin') {
      throw ApiError.forbidden('You cannot remove your own admin role');
    }
    user.role = role;
  }

  if (email !== undefined) {
    const normalized = String(email).toLowerCase().trim();
    if (normalized !== user.email) {
      const taken = await User.findOne({ email: normalized, _id: { $ne: user.id } });
      if (taken) throw ApiError.conflict('An account with that email already exists');
      user.email = normalized;
    }
  }

  await user.save();
  logger.info('Admin updated user', { adminId: req.user.id, userId: user.id });
  res.json({ user: user.toPublicJSON() });
});

/**
 * DELETE /api/admin/users/:id — remove a user and cascade their data.
 * An admin cannot delete their own account here (use the profile screen).
 */
const deleteUser = asyncHandler(async (req, res) => {
  if (String(req.params.id) === String(req.user.id)) {
    throw ApiError.forbidden('Delete your own account from the profile screen, not the CRM');
  }

  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  const userId = user.id;
  await Promise.all([
    Card.deleteMany({ userId }),
    Transaction.deleteMany({ userId }),
    OptimizerRecommendation.deleteMany({ userId }),
    SupportTicket.deleteMany({ userId }),
  ]);
  await User.deleteOne({ _id: userId });

  logger.info('Admin deleted user', { adminId: req.user.id, userId });
  res.json({ deleted: true, id: userId });
});

module.exports = { listUsers, listTickets, updateTicket, getUser, updateUser, deleteUser };
