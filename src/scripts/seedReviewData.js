'use strict';

/**
 * Hackathon review seed — provisions one fully-populated test user so reviewers
 * can exercise EVERY user-facing feature with a single login.
 *
 * Run:  npm run seed:review
 * Idempotent: re-running wipes and re-creates the reviewer's data for a clean,
 * known-good state every time.
 */

const User = require('../models/User');
const Card = require('../models/Card');
const Transaction = require('../models/Transaction');
const SupportTicket = require('../models/SupportTicket');
const ProgressSnapshot = require('../models/ProgressSnapshot');
const OptimizerRecommendation = require('../models/OptimizerRecommendation');
const { optimizePayments } = require('../services/optimizer.service');
const logger = require('../config/logger');

const REVIEWER = { name: 'Review User', email: 'reviewer@thespendpilot.com', password: 'Review1234!' };

const daysFromNow = (n) => new Date(Date.now() + n * 86400000);
const daysAgo = (n) => new Date(Date.now() - n * 86400000);

async function seedReviewData() {
  // Reset any prior reviewer data so the account is always in a known state.
  let reviewer = await User.findOne({ email: REVIEWER.email });
  if (reviewer) {
    const id = reviewer.id;
    await Promise.all([
      Card.deleteMany({ userId: id }),
      Transaction.deleteMany({ userId: id }),
      SupportTicket.deleteMany({ userId: id }),
      ProgressSnapshot.deleteMany({ userId: id }),
      OptimizerRecommendation.deleteMany({ userId: id }),
    ]);
  } else {
    reviewer = new User({ email: REVIEWER.email });
  }
  reviewer.name = REVIEWER.name;
  reviewer.mobile = '+1 555 0100';
  reviewer.profileImageUrl = 'https://api.dicebear.com/7.x/initials/svg?seed=Review%20User';
  reviewer.role = 'user';
  reviewer.subscriptionPlan = 'pro';
  await reviewer.setPassword(REVIEWER.password);
  await reviewer.save();
  const uid = reviewer.id;

  // Cards: a deliberate mix that triggers every alert/milestone path.
  const cards = await Card.create([
    // Past-due (critical alert)
    { userId: uid, source: 'pdf', cardType: 'credit', bankName: 'Citi', cardName: 'Double Cash', last4: '7777', balance: 600, statementBalance: 600, minimumPayment: 25, apr: 27.49, creditLimit: 3000, dueDate: daysAgo(1) },
    // Due soon (warning) + high utilization (critical: 92%)
    { userId: uid, source: 'manual', cardType: 'credit', bankName: 'Amex', cardName: 'Blue Cash', last4: '1005', balance: 4600, statementBalance: 4600, minimumPayment: 150, apr: 19.99, creditLimit: 5000, dueDate: daysFromNow(2) },
    // Due in a week (info)
    { userId: uid, source: 'plaid', cardType: 'credit', bankName: 'Chase', cardName: 'Sapphire', last4: '4242', balance: 2450.75, statementBalance: 2450.75, minimumPayment: 85, apr: 24.99, creditLimit: 8000, dueDate: daysFromNow(6) },
    // Paid off (milestone: first card paid off)
    { userId: uid, source: 'manual', cardType: 'credit', bankName: 'Discover', cardName: 'It Cash Back', last4: '3300', balance: 0, statementBalance: 0, minimumPayment: 0, apr: 22.99, creditLimit: 4000, dueDate: daysFromNow(20) },
    // Debit card (Cards screen "Debit" sub-tab)
    { userId: uid, source: 'plaid', cardType: 'debit', bankName: 'Wells Fargo', cardName: 'Everyday Checking', last4: '9911', balance: 3200 },
  ]);
  const creditCards = cards.filter((c) => c.cardType === 'credit');

  // Transactions: income (biweekly) + categorized spend across two months.
  await Transaction.create([
    { userId: uid, amount: 2600, merchant: 'Employer Payroll', category: 'Payroll', date: daysAgo(2), source: 'sample', type: 'income' },
    { userId: uid, amount: 2600, merchant: 'Employer Payroll', category: 'Payroll', date: daysAgo(16), source: 'sample', type: 'income' },
    { userId: uid, amount: 2600, merchant: 'Employer Payroll', category: 'Payroll', date: daysAgo(30), source: 'sample', type: 'income' },
    { userId: uid, amount: 142.5, merchant: 'Whole Foods', category: 'Groceries', date: daysAgo(3), source: 'sample', type: 'expense' },
    { userId: uid, amount: 64.2, merchant: 'Shell', category: 'Gas', date: daysAgo(5), source: 'sample', type: 'expense' },
    { userId: uid, amount: 15.99, merchant: 'Netflix', category: 'Subscription', date: daysAgo(7), source: 'sample', type: 'expense' },
    { userId: uid, amount: 230, merchant: 'Amazon', category: 'Shopping', date: daysAgo(9), source: 'sample', type: 'expense' },
    { userId: uid, amount: 48.75, merchant: 'Chipotle', category: 'Dining', date: daysAgo(11), source: 'sample', type: 'expense' },
    { userId: uid, amount: 33, merchant: 'Uber', category: 'Transport', date: daysAgo(13), source: 'sample', type: 'expense' },
    { userId: uid, amount: 188, merchant: 'Costco', category: 'Groceries', date: daysAgo(34), source: 'sample', type: 'expense' },
    { userId: uid, amount: 72, merchant: 'Delta', category: 'Travel', date: daysAgo(38), source: 'sample', type: 'expense' },
  ]);

  // Optimizer history (so /progress interestSaved uses "your last plan").
  const result = optimizePayments(creditCards, 600);
  await OptimizerRecommendation.create({
    userId: uid,
    maxPayment: 600,
    strategy: result.strategy,
    cardsSnapshot: creditCards.map((c) => c.toJSON()),
    plan: result.plan,
    riskScores: result.riskScores,
    warning: result.warning,
  });

  // Support tickets: one open relay thread + one resolved.
  await SupportTicket.create([
    {
      userId: uid,
      subject: 'Why is my Citi card prioritized?',
      status: 'pending',
      messages: [
        { sender: 'user', body: 'The optimizer keeps telling me to pay Citi first — why?' },
        { sender: 'bot', body: 'Citi has the highest APR (27.49%), so paying it first cuts the most interest.' },
        { sender: 'user', body: 'Got it, but it is also nearly due. Can a person confirm?' },
        { sender: 'admin', body: 'Yes — Citi is both highest-APR and due soonest, so it is prioritized. You are all set!' },
      ],
    },
    {
      userId: uid,
      subject: 'How do I connect my bank?',
      status: 'resolved',
      messages: [
        { sender: 'user', body: 'How do I connect a bank account?' },
        { sender: 'admin', body: 'Use Connect Bank (Plaid). In sandbox you can use the one-call sandbox connect.' },
      ],
    },
  ]);

  // Progress snapshots: weekly debt trending down to the current total.
  const currentDebt = Math.round(creditCards.reduce((s, c) => s + c.balance, 0) * 100) / 100;
  const limit = creditCards.reduce((s, c) => s + (c.creditLimit || 0), 0);
  const weekly = [9500, 9100, 8800, 8400, 8100, currentDebt];
  await ProgressSnapshot.insertMany(
    weekly.map((balance, i) => {
      const date = daysAgo((weekly.length - 1 - i) * 7);
      date.setUTCHours(0, 0, 0, 0);
      return {
        userId: uid,
        date,
        totalBalance: balance,
        totalCreditLimit: limit,
        utilization: Math.round((balance / limit) * 1000) / 10,
        creditCardCount: creditCards.length,
      };
    })
  );

  return { reviewer, currentDebt };
}

module.exports = seedReviewData;

// ---- CLI runner ----
if (require.main === module) {
  const mongoose = require('mongoose');
  const connectDB = require('../config/db');
  const { validateEnv } = require('../config/env');
  (async () => {
    try {
      validateEnv();
      await connectDB();
      const { currentDebt } = await seedReviewData();
      /* eslint-disable no-console */
      console.log('\n========================================================');
      console.log('  SpendPilot — Hackathon Review Account');
      console.log('========================================================');
      console.log('\n  Login:');
      console.log(`    email:    ${REVIEWER.email}`);
      console.log(`    password: ${REVIEWER.password}`);
      console.log('\n  Seeded so every feature is testable:');
      console.log('    • 4 credit cards (1 past-due, 1 due-soon + 92% utilization, 1 paid off)');
      console.log('    • 1 debit card (Cards screen Debit sub-tab)');
      console.log('    • income + categorized spending across 2 months (Dashboard graphs)');
      console.log('    • optimizer history, 2 support tickets (incl. a relay thread)');
      console.log(`    • 6 weeks of debt history trending down (now $${currentDebt})`);
      console.log('\n  Try: Dashboard, Optimizer (recommend / rescue / simulate / balance-transfer),');
      console.log('       Cards (credit & debit), Statement upload, AI explain, Alerts, Progress,');
      console.log('       Profile edit, Chatbot + Support escalation.');
      console.log('\n  Plaid (optional): POST /api/plaid/sandbox/connect, then');
      console.log('       POST /api/cards/sync?force=true to import sandbox cards.');
      console.log('========================================================\n');
      /* eslint-enable no-console */
    } catch (err) {
      logger.error('Review seeding failed', { error: err.message });
      process.exitCode = 1;
    } finally {
      await mongoose.connection.close();
    }
  })();
}
