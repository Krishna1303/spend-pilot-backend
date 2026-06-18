'use strict';

const express = require('express');
const { getProfile, updateProfile, deleteAccount } = require('../controllers/profile.controller');
const { protect } = require('../middleware/authMiddleware');
const { validateBody } = require('../middleware/validate');

const router = express.Router();

router.use(protect);

router.get('/', getProfile);
router.patch(
  '/',
  validateBody({
    name: { type: 'string', max: 120 },
    mobile: { type: 'string', max: 30 },
    profileImageUrl: { type: 'string', max: 500 },
  }),
  updateProfile
);
router.delete(
  '/',
  validateBody({ password: { type: 'string', required: true } }),
  deleteAccount
);

module.exports = router;
