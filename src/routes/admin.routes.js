'use strict';

const express = require('express');
const {
  listUsers, listTickets, updateTicket, getUser, updateUser, deleteUser,
} = require('../controllers/admin.controller');
const totpController = require('../controllers/totp.controller');
const { protect, requireAdmin, requireCrmAccess } = require('../middleware/authMiddleware');
const { validateBody } = require('../middleware/validate');

const router = express.Router();

// Every admin route requires an authenticated admin.
router.use(protect, requireAdmin);

// --- TOTP enrollment + step-up (normal admin auth; these bootstrap CRM access) ---
router.get('/totp/status', totpController.status);
router.post('/totp/setup', totpController.setup);
router.post('/totp/enable', validateBody({ token: { type: 'string', required: true } }), totpController.enable);
router.post('/totp/verify', validateBody({ token: { type: 'string', required: true } }), totpController.verify);

// --- CRM data routes: require a TOTP step-up (crm token) ---
router.get('/users', requireCrmAccess, listUsers);
router.get('/users/:id', requireCrmAccess, getUser);
router.patch(
  '/users/:id',
  requireCrmAccess,
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
router.delete('/users/:id', requireCrmAccess, deleteUser);

router.get('/tickets', requireCrmAccess, listTickets);
router.patch('/tickets/:id', requireCrmAccess, updateTicket);

module.exports = router;
