'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const SupportTicket = require('../models/SupportTicket');
const chatbotService = require('../services/chatbot.service');
const {
  notifyAdminOfEscalation,
  notifyAdminOfUserMessage,
} = require('../services/email.service');

const VALID_SENDERS = ['user', 'bot', 'admin'];

/** POST /api/chatbot/ask  Body: { question } */
const ask = asyncHandler(async (req, res) => {
  const { question } = req.body;
  if (!question || !String(question).trim()) throw ApiError.badRequest('question is required');

  const result = await chatbotService.ask(String(question).trim());
  res.json({
    answer: result.answer,
    escalatable: result.escalatable,
    sources: result.sources,
    confidence: result.confidence,
  });
});

/** POST /api/support/tickets  Body: { subject, message } */
const createTicket = asyncHandler(async (req, res) => {
  const { subject, message } = req.body;
  if (!subject || !message) throw ApiError.badRequest('subject and message are required');

  const ticket = await SupportTicket.create({
    userId: req.user.id,
    subject,
    status: 'open',
    messages: [{ sender: 'user', body: message }],
  });

  res.status(201).json({ ticket });
});

/** GET /api/support/tickets — current user's tickets */
const listMyTickets = asyncHandler(async (req, res) => {
  const tickets = await SupportTicket.find({ userId: req.user.id }).sort({ updatedAt: -1 });
  res.json({ tickets });
});

/**
 * POST /api/support/escalate
 * Body: { subject, message, transcript? }
 * Opens a support ticket (optionally seeded with the chatbot transcript) and
 * emails the admin so they can join the private relay.
 */
const escalate = asyncHandler(async (req, res) => {
  const { subject, message, transcript } = req.body;
  if (!subject || !message) throw ApiError.badRequest('subject and message are required');

  const messages = [];
  if (Array.isArray(transcript)) {
    for (const turn of transcript.slice(0, 30)) {
      if (turn && turn.body) {
        messages.push({
          sender: VALID_SENDERS.includes(turn.sender) ? turn.sender : 'user',
          body: String(turn.body).slice(0, 4000),
        });
      }
    }
  }
  messages.push({ sender: 'user', body: String(message).slice(0, 4000) });

  const ticket = await SupportTicket.create({
    userId: req.user.id,
    subject,
    status: 'open',
    messages,
  });

  const mail = await notifyAdminOfEscalation(ticket, req.user);
  res.status(201).json({ ticket, adminNotified: mail.delivered, fallback: mail.fallback });
});

/** GET /api/support/tickets/:id — the user's own ticket thread (private relay). */
const getTicket = asyncHandler(async (req, res) => {
  const ticket = await SupportTicket.findOne({ _id: req.params.id, userId: req.user.id });
  if (!ticket) throw ApiError.notFound('Ticket not found');
  res.json({ ticket });
});

/**
 * POST /api/support/tickets/:id/messages
 * Body: { message }
 * User side of the relay: append a message and notify the admin. A new message
 * on a resolved ticket reopens it.
 */
const addMessage = asyncHandler(async (req, res) => {
  const { message } = req.body;
  if (!message || !String(message).trim()) throw ApiError.badRequest('message is required');

  const ticket = await SupportTicket.findOne({ _id: req.params.id, userId: req.user.id });
  if (!ticket) throw ApiError.notFound('Ticket not found');

  ticket.messages.push({ sender: 'user', body: String(message).slice(0, 4000) });
  if (ticket.status === 'resolved') ticket.status = 'open';
  await ticket.save();

  const mail = await notifyAdminOfUserMessage(ticket, req.user, String(message));
  res.json({ ticket, adminNotified: mail.delivered });
});

module.exports = { ask, createTicket, listMyTickets, escalate, getTicket, addMessage };
