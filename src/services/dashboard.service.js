'use strict';

const Transaction = require('../models/Transaction');
const Card = require('../models/Card');
const { round2 } = require('../utils/money');
const { daysUntil, toISODate } = require('../utils/dates');

const DUE_SOON_DAYS = 14;
const SERIES_MONTHS = 6;

/**
 * Build the dashboard payload:
 *  - summary + spendingVsEarning series (graph 1)
 *  - categorizedSpending (graph 2)
 *  - upcomingDueDates and payday (scroll-down details)
 *
 * @param {string} userId
 * @param {object} opts  { rangeDays }  window for the summary/categories
 */
async function getDashboard(userId, { rangeDays = 30 } = {}) {
  const now = new Date();
  const rangeStart = new Date(now.getTime() - rangeDays * 86400000);

  // Series window: first day of the month, SERIES_MONTHS-1 months back.
  const seriesStart = new Date(now.getFullYear(), now.getMonth() - (SERIES_MONTHS - 1), 1);

  const [txns, cards] = await Promise.all([
    Transaction.find({ userId, date: { $gte: seriesStart } }).lean(),
    Card.find({ userId, cardType: 'credit' }).lean(),
  ]);

  const isIncome = (t) => t.type === 'income';
  const inRange = txns.filter((t) => new Date(t.date) >= rangeStart);

  // --- Summary over the range ---
  const income = sumAmount(inRange.filter(isIncome));
  const spending = sumAmount(inRange.filter((t) => !isIncome(t)));
  const summary = {
    income,
    spending,
    net: round2(income - spending),
    rangeDays,
    startDate: toISODate(rangeStart),
    endDate: toISODate(now),
  };

  // --- Graph 1: spending vs earning, monthly buckets ---
  const spendingVsEarning = buildMonthlySeries(txns, now, isIncome);

  // --- Graph 2: categorized spending over the range ---
  const categorizedSpending = buildCategoryBreakdown(inRange.filter((t) => !isIncome(t)), spending);

  // --- Scroll-down: due dates coming soon ---
  const upcomingDueDates = cards
    .map((c) => ({
      cardId: String(c._id),
      cardName: c.cardName || c.bankName || 'Card',
      bankName: c.bankName,
      dueDate: toISODate(c.dueDate),
      daysUntil: daysUntil(c.dueDate),
      minimumPayment: c.minimumPayment || 0,
      balance: c.balance || 0,
    }))
    .filter((c) => c.daysUntil !== null && c.daysUntil <= DUE_SOON_DAYS)
    .sort((a, b) => a.daysUntil - b.daysUntil);

  // --- Scroll-down: payday coming up ---
  const payday = estimatePayday(txns.filter(isIncome));

  const creditCardDebt = round2(cards.reduce((s, c) => s + (c.balance || 0), 0));

  return {
    summary,
    spendingVsEarning,
    categorizedSpending,
    upcomingDueDates,
    payday,
    totals: {
      creditCardDebt,
      cardsDueSoon: upcomingDueDates.length,
    },
  };
}

function sumAmount(list) {
  return round2(list.reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0));
}

/** Monthly income/spending buckets across the last SERIES_MONTHS months. */
function buildMonthlySeries(txns, now, isIncome) {
  const buckets = new Map();
  for (let i = SERIES_MONTHS - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets.set(key, { month: key, income: 0, spending: 0 });
  }
  for (const t of txns) {
    const d = new Date(t.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const bucket = buckets.get(key);
    if (!bucket) continue;
    const amt = Math.abs(Number(t.amount) || 0);
    if (isIncome(t)) bucket.income = round2(bucket.income + amt);
    else bucket.spending = round2(bucket.spending + amt);
  }
  return Array.from(buckets.values());
}

/** Spending grouped by category, with each slice's percent of total. */
function buildCategoryBreakdown(expenses, total) {
  const byCategory = new Map();
  for (const t of expenses) {
    const cat = t.category || 'Uncategorized';
    byCategory.set(cat, round2((byCategory.get(cat) || 0) + Math.abs(Number(t.amount) || 0)));
  }
  return Array.from(byCategory.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      percent: total > 0 ? Math.round((amount / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Estimate the next payday from income history. Cadence is inferred from the
 * average gap between paychecks (falls back to ~30 days with a single record).
 */
function estimatePayday(incomeTxns) {
  if (!incomeTxns.length) return null;

  const sorted = [...incomeTxns].sort((a, b) => new Date(b.date) - new Date(a.date));
  const last = sorted[0];

  let intervalDays = 30;
  if (sorted.length >= 2) {
    let totalGap = 0;
    for (let i = 0; i < sorted.length - 1; i += 1) {
      totalGap += (new Date(sorted[i].date) - new Date(sorted[i + 1].date)) / 86400000;
    }
    intervalDays = Math.max(7, Math.round(totalGap / (sorted.length - 1)));
  }

  const nextDate = new Date(new Date(last.date).getTime() + intervalDays * 86400000);

  return {
    lastPaydayDate: toISODate(last.date),
    lastAmount: round2(Math.abs(Number(last.amount) || 0)),
    intervalDays,
    nextPaydayEstimate: toISODate(nextDate),
    daysUntil: daysUntil(nextDate),
  };
}

module.exports = { getDashboard };
