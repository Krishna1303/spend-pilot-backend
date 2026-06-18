'use strict';

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const SupportTicket = require('../models/SupportTicket');
const chatbotService = require('../services/chatbot.service');

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

module.exports = { ask, createTicket, listMyTickets };
