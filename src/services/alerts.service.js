'use strict';

const Card = require('../models/Card');
const Transaction = require('../models/Transaction');
const { daysUntil, toISODate } = require('../utils/dates');
const { round2 } = require('../utils/money');

const DUE_SOON_DAYS = 7;
const PAYDAY_SOON_DAYS = 3;
const UTIL_WARN = 70;
const UTIL_CRIT = 90;

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

function money(n) {
  const v = Number(n);
  return Number.isFinite(v) ? `$${v.toFixed(2)}` : '$0.00';
}

function mkCardAlert(type, severity, title, message, card, days) {
  return {
    type,
    severity,
    title,
    message,
    cardId: card ? String(card._id) : undefined,
    cardName: card ? card.cardName || card.bankName : undefined,
    dueDate: card && card.dueDate ? toISODate(card.dueDate) : undefined,
    daysUntil: days,
  };
}

/** Estimate the next payday from recent income transactions (inferred cadence). */
function estimateNextPayday(incomeTxns) {
  if (!incomeTxns.length) return null;
  const sorted = [...incomeTxns].sort((a, b) => new Date(b.date) - new Date(a.date));
  const last = sorted[0];
  let interval = 30;
  if (sorted.length >= 2) {
    let gap = 0;
    for (let i = 0; i < sorted.length - 1; i += 1) {
      gap += (new Date(sorted[i].date) - new Date(sorted[i + 1].date)) / 86400000;
    }
    interval = Math.max(7, Math.round(gap / (sorted.length - 1)));
  }
  const next = new Date(new Date(last.date).getTime() + interval * 86400000);
  return {
    lastAmount: round2(Math.abs(Number(last.amount) || 0)),
    nextPaydayEstimate: toISODate(next),
    daysUntil: daysUntil(next),
  };
}

/**
 * Build the alert list for a user from their cards + income history.
 * Deterministic; severity drives sort order and the digest's actionability.
 */
async function buildAlerts(userId) {
  const [cards, incomeTxns] = await Promise.all([
    Card.find({ userId }),
    Transaction.find({ userId, type: 'income' }).sort({ date: -1 }).limit(6).lean(),
  ]);

  const alerts = [];

  for (const card of cards) {
    const name = card.cardName || card.bankName || 'Card';

    // Due-date alerts (credit cards with a due date).
    if (card.cardType === 'credit' && card.dueDate) {
      const d = daysUntil(card.dueDate);
      if (d !== null) {
        if (d < 0) {
          alerts.push(mkCardAlert('past-due', 'critical', `${name} payment is past due`,
            `The payment for ${name} was due ${toISODate(card.dueDate)}. Pay at least the ${money(card.minimumPayment)} minimum now to limit fees.`, card, d));
        } else if (d === 0) {
          alerts.push(mkCardAlert('due-today', 'critical', `${name} is due today`,
            `The ${money(card.minimumPayment)} minimum payment for ${name} is due today.`, card, d));
        } else if (d <= 3) {
          alerts.push(mkCardAlert('due-soon', 'warning', `${name} due in ${d} day${d === 1 ? '' : 's'}`,
            `The ${money(card.minimumPayment)} minimum payment for ${name} is due ${toISODate(card.dueDate)}.`, card, d));
        } else if (d <= DUE_SOON_DAYS) {
          alerts.push(mkCardAlert('due-soon', 'info', `${name} due in ${d} days`,
            `Heads up: ${name} payment is due ${toISODate(card.dueDate)}.`, card, d));
        }
      }
    }

    // Utilization alerts.
    if (card.cardType === 'credit' && typeof card.utilization === 'number' && card.utilization > 0) {
      if (card.utilization >= UTIL_CRIT) {
        alerts.push(mkCardAlert('high-utilization', 'critical', `${name} utilization is very high`,
          `${name} is at ${card.utilization}% of its credit limit — this can hurt your credit score. Paying it down helps.`, card));
      } else if (card.utilization >= UTIL_WARN) {
        alerts.push(mkCardAlert('high-utilization', 'warning', `${name} utilization is high`,
          `${name} is at ${card.utilization}% of its credit limit.`, card));
      }
    }
  }

  // Payday-coming alert.
  const payday = estimateNextPayday(incomeTxns);
  if (payday && payday.daysUntil !== null && payday.daysUntil >= 0 && payday.daysUntil <= PAYDAY_SOON_DAYS) {
    alerts.push({
      type: 'payday-coming',
      severity: 'info',
      title: payday.daysUntil === 0 ? 'Payday is today' : `Payday in ${payday.daysUntil} day${payday.daysUntil === 1 ? '' : 's'}`,
      message: `Your next paycheck (about ${money(payday.lastAmount)}) is expected around ${payday.nextPaydayEstimate} — a good time to run your payment plan.`,
      date: payday.nextPaydayEstimate,
      daysUntil: payday.daysUntil,
    });
  }

  alerts.sort((a, b) =>
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
    (a.daysUntil == null ? 99 : a.daysUntil) - (b.daysUntil == null ? 99 : b.daysUntil)
  );

  const counts = { critical: 0, warning: 0, info: 0 };
  for (const a of alerts) counts[a.severity] += 1;

  return { alerts, counts };
}

module.exports = { buildAlerts };
