'use strict';

const Card = require('../models/Card');
const ProgressSnapshot = require('../models/ProgressSnapshot');
const OptimizerRecommendation = require('../models/OptimizerRecommendation');
const { round2 } = require('../utils/money');
const { toISODate } = require('../utils/dates');
const { projectPayoff } = require('./rescue.service');

function round1(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : 0;
}

function startOfDayUTC(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Summarize the user's current credit-card position. */
async function currentPosition(userId) {
  const cards = await Card.find({ userId, cardType: 'credit' });
  const totalBalance = round2(cards.reduce((s, c) => s + (c.balance || 0), 0));
  const totalCreditLimit = round2(cards.reduce((s, c) => s + (c.creditLimit || 0), 0));
  const utilization = totalCreditLimit > 0 ? round1((totalBalance / totalCreditLimit) * 100) : 0;
  return { cards, totalBalance, totalCreditLimit, utilization };
}

/** Idempotently record today's snapshot (one row per user per day). */
async function recordSnapshot(userId) {
  const { cards, totalBalance, totalCreditLimit, utilization } = await currentPosition(userId);
  const date = startOfDayUTC();
  await ProgressSnapshot.updateOne(
    { userId, date },
    { $set: { totalBalance, totalCreditLimit, utilization, creditCardCount: cards.length } },
    { upsert: true }
  );
  return { date, totalBalance, utilization };
}

/** Full progress payload: history, debt change, milestones, interest saved. */
async function getProgress(userId) {
  await recordSnapshot(userId); // ensure today's point exists

  const [{ cards, totalBalance, totalCreditLimit, utilization }, snapshots, lastRec] = await Promise.all([
    currentPosition(userId),
    ProgressSnapshot.find({ userId }).sort({ date: 1 }).lean(),
    OptimizerRecommendation.findOne({ userId }).sort({ createdAt: -1 }).lean(),
  ]);

  const history = snapshots.map((s) => ({
    date: toISODate(s.date),
    totalBalance: s.totalBalance,
    utilization: s.utilization,
  }));

  const first = snapshots[0];
  const ago30 = new Date(Date.now() - 30 * 86400000);
  const ref30 = snapshots.find((s) => new Date(s.date) >= ago30) || first;

  const debtChange = {
    sinceStart: first ? round2(first.totalBalance - totalBalance) : 0,
    sinceStartDate: first ? toISODate(first.date) : null,
    last30Days: ref30 ? round2(ref30.totalBalance - totalBalance) : 0,
    peakBalance: first ? round2(Math.max(...snapshots.map((s) => s.totalBalance))) : totalBalance,
  };

  // --- Interest saved (projected) ---
  const projCards = cards.map((c) => ({ balance: c.balance, apr: c.apr, minimumPayment: c.minimumPayment }));
  const totalMinimum = round2(cards.reduce((s, c) => s + (c.minimumPayment || 0), 0));
  const optimizedMonthly = lastRec && lastRec.maxPayment
    ? Math.max(lastRec.maxPayment, totalMinimum)
    : round2(totalMinimum * 1.5);

  const minProj = projectPayoff(projCards, totalMinimum);
  const optProj = projectPayoff(projCards, optimizedMonthly);
  const projectedInterestSaved =
    minProj.paidOff && optProj.paidOff ? round2(minProj.totalInterest - optProj.totalInterest) : null;

  // --- Milestones ---
  const paidOffCount = cards.filter((c) => (c.balance || 0) <= 0.005).length;
  const milestones = [
    {
      type: 'first-card-paid-off',
      title: 'First card paid off',
      achieved: paidOffCount >= 1,
      detail: `${paidOffCount} credit card${paidOffCount === 1 ? '' : 's'} at $0 balance.`,
    },
    {
      type: 'utilization-under-30',
      title: 'Utilization under 30%',
      achieved: totalCreditLimit > 0 && utilization < 30,
      detail: `Overall utilization is ${utilization}%.`,
    },
    {
      type: 'utilization-under-10',
      title: 'Utilization under 10%',
      achieved: totalCreditLimit > 0 && utilization < 10,
      detail: `Overall utilization is ${utilization}%.`,
    },
    {
      type: 'debt-halved',
      title: 'Debt cut in half',
      achieved: !!first && first.totalBalance > 0 && totalBalance <= first.totalBalance / 2,
      detail: first ? `Started at $${first.totalBalance.toFixed(2)}, now $${totalBalance.toFixed(2)}.` : 'Not enough history yet.',
    },
    {
      type: 'debt-free',
      title: 'Debt free',
      achieved: cards.length > 0 && totalBalance <= 0.005,
      detail: totalBalance <= 0.005 ? 'No credit-card debt — congratulations!' : `$${totalBalance.toFixed(2)} to go.`,
    },
  ];

  return {
    currentDebt: totalBalance,
    totalCreditLimit,
    overallUtilization: utilization,
    history,
    debtChange,
    milestones,
    interestSaved: {
      projectedVsMinimums: projectedInterestSaved,
      assumptions: {
        minimumsMonthly: totalMinimum,
        optimizedMonthly,
        source: lastRec && lastRec.maxPayment ? 'your last optimizer plan' : 'illustrative (minimums + 50%)',
      },
    },
  };
}

module.exports = { recordSnapshot, getProgress };
