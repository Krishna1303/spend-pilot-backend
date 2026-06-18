'use strict';

const express = require('express');
const { createTicket, listMyTickets } = require('../controllers/chatbot.controller');
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

module.exports = router;
