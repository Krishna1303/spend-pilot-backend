'use strict';

const express = require('express');
const {
  listCards, createCard, getCard, updateCard, deleteCard,
} = require('../controllers/card.controller');
const { protect } = require('../middleware/authMiddleware');
const { validateBody } = require('../middleware/validate');

const router = express.Router();

router.use(protect);

router.get('/', listCards);
router.post(
  '/',
  validateBody({
    bankName: { type: 'string', max: 120 },
    cardName: { type: 'string', max: 120 },
    balance: { type: 'number', min: 0 },
    apr: { type: 'number', min: 0 },
    minimumPayment: { type: 'number', min: 0 },
  }),
  createCard
);
router.get('/:id', getCard);
router.patch('/:id', updateCard);
router.delete('/:id', deleteCard);

module.exports = router;
