'use strict';

const express = require('express');
const {
  listUsers, listTickets, updateTicket, getUser, updateUser, deleteUser,
} = require('../controllers/admin.controller');
const { protect, requireAdmin } = require('../middleware/authMiddleware');
const { validateBody } = require('../middleware/validate');

const router = express.Router();

// Every CRM route requires an authenticated admin.
router.use(protect, requireAdmin);

router.get('/users', listUsers);
router.get('/users/:id', getUser);
router.patch(
  '/users/:id',
  validateBody({
    name: { type: 'string', max: 120 },
    mobile: { type: 'string', max: 30 },
    profileImageUrl: { type: 'string', max: 500 },
    email: { type: 'email' },
    role: { type: 'string', max: 20 },
    subscriptionPlan: { type: 'string', max: 20 },
  }),
  updateUser
);
router.delete('/users/:id', deleteUser);

router.get('/tickets', listTickets);
router.patch('/tickets/:id', updateTicket);

module.exports = router;
