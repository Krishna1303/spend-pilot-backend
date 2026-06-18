'use strict';

const express = require('express');
const {
  createTicket, listMyTickets, escalate, getTicket, addMessage,
} = require('../controllers/chatbot.controller');
const { protect } = require('../middleware/authMiddleware');
const { validateBody } = require('../middleware/validate');

const router = express.Router();

router.use(protect);

router.post(
  '/tickets',
  validateBody({
    subject: { type: 'string', required: true, min: 1, max: 200 },
    message: { type: 'string', required: true, min: 1, max: 4000 },
  }),
  createTicket
);
router.get('/tickets', listMyTickets);

// Escalate from the chatbot to a human (emails the admin).
router.post(
  '/escalate',
  validateBody({
    subject: { type: 'string', required: true, min: 1, max: 200 },
    message: { type: 'string', required: true, min: 1, max: 4000 },
  }),
  escalate
);

// Private relay (user side): read the thread and post replies.
router.get('/tickets/:id', getTicket);
router.post(
  '/tickets/:id/messages',
  validateBody({ message: { type: 'string', required: true, min: 1, max: 4000 } }),
  addMessage
);

module.exports = router;
