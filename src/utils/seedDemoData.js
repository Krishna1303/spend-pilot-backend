'use strict';

const User = require('../models/User');
const Card = require('../models/Card');
const Transaction = require('../models/Transaction');
const SupportTicket = require('../models/SupportTicket');
const logger = require('../config/logger');

/**
 * Idempotently seed a demo user, an admin, cards, transactions, and a ticket so
 * the demo works even if Plaid / AI / PDF parsing fail. Safe to run repeatedly.
 */
async function seedDemoData() {
  const demoEmail = 'demo@spendpilot.app';
  const adminEmail = 'admin@spendpilot.app';

  let demo = await User.findOne({ email: demoEmail });
  if (!demo) {
    demo = new User({ name: 'Demo User', email: demoEmail, subscriptionPlan: 'pro' });
    await demo.setPassword('Demo1234!');
    await demo.save();
    logger.info('Seeded demo user', { email: demoEmail, password: 'Demo1234!' });
  }

  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    admin = new User({ name: 'Admin User', email: adminEmail, role: 'admin' });
    await admin.setPassword('Admin1234!');
    await admin.save();
    logger.info('Seeded admin user', { email: adminEmail, password: 'Admin1234!' });
  }

  const existingCards = await Card.countDocuments({ userId: demo.id });
  if (existingCards === 0) {
    const inDays = (n) => new Date(Date.now() + n * 86400000);
    await Card.create([
      {
        userId: demo.id, source: 'manual', bankName: 'Chase', cardName: 'Sapphire',
        last4: '4242', balance: 2450.75, statementBalance: 2450.75, minimumPayment: 85,
        apr: 24.99, creditLimit: 8000, dueDate: inDays(5),
      },
      {
        userId: demo.id, source: 'manual', bankName: 'Amex', cardName: 'Blue Cash',
        last4: '1005', balance: 1200, statementBalance: 1200, minimumPayment: 40,
        apr: 19.99, creditLimit: 5000, dueDate: inDays(12),
      },
      {
        userId: demo.id, source: 'pdf', bankName: 'Citi', cardName: 'Double Cash',
        last4: '7777', balance: 600, statementBalance: 600, minimumPayment: 25,
        apr: 27.49, creditLimit: 3000, dueDate: inDays(2),
      },
    ]);
    logger.info('Seeded demo cards', { count: 3 });
  }

  const existingTx = await Transaction.countDocuments({ userId: demo.id });
  if (existingTx === 0) {
    await Transaction.create([
      { userId: demo.id, amount: 54.23, merchant: 'Whole Foods', category: 'Groceries', date: new Date(), source: 'sample' },
      { userId: demo.id, amount: 12.99, merchant: 'Netflix', category: 'Subscription', date: new Date(), source: 'sample' },
      { userId: demo.id, amount: 88.4, merchant: 'Shell', category: 'Gas', date: new Date(), source: 'sample' },
    ]);
    logger.info('Seeded demo transactions', { count: 3 });
  }

  const existingTickets = await SupportTicket.countDocuments({ userId: demo.id });
  if (existingTickets === 0) {
    await SupportTicket.create({
      userId: demo.id,
      subject: 'How does the optimizer decide?',
      status: 'open',
      messages: [{ sender: 'user', body: 'Why is my Citi card prioritized?' }],
    });
    logger.info('Seeded demo support ticket');
  }
}

module.exports = seedDemoData;
