'use strict';

const express = require('express');
const { listUsers, listTickets, updateTicket } = require('../controllers/admin.controller');
const { protect, requireAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect, requireAdmin);

router.get('/users', listUsers);
router.get('/tickets', listTickets);
router.patch('/tickets/:id', updateTicket);

module.exports = router;
