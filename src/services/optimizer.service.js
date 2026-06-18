'use strict';

const { round2, toMoney } = require('../utils/money');
const { daysUntil } = require('../utils/dates');

/**
 * Deterministic payment optimizer. The backend — NOT the AI — decides the plan.
 *
 * Rules (from the build spec):
 *   1. Cover minimum payments first.
 *   2. If max payment can't cover all minimums, allocate to the nearest due
 *      dates first (protect near-term due dates / late-fee risk).
 *   3. After minimums, send extra to the highest-APR card (debt avalanche).
 *   4. Tie-break close APRs by nearer due date.
 *   5. Produce a per-card risk score (APR + due-date urgency + balance).
 */
function optimizePayments(cards, maxPayment) {
  let remaining = toMoney(maxPayment);

  const normalized = cards.map((c) => ({
    id: c.id || c._id ? String(c.id || c._id) : undefined,
    bankName: c.bankName,
    cardName: c.cardName,
    balance: toMoney(c.balance),
    minimumPayment: toMoney(c.minimumPayment),
    apr: Number(c.apr) || 0,
    dueDate: c.dueDate || null,
    recommendedPayment: 0,
    reason: '',
  }));

  const totalMinimum = round2(normalized.reduce((sum, c) => sum + c.minimumPayment, 0));
  const riskScores = normalized.map((c) => ({
    cardId: c.id,
    cardName: c.cardName || c.bankName || 'Card',
    ...computeRiskScore(c),
  }));

  // Case A: not enough to cover all minimums -> protect nearest due dates.
  if (remaining < totalMinimum) {
    const byDueDate = [...normalized].sort(byNearestDueDate);
    for (const card of byDueDate) {
      if (remaining <= 0) break;
      const pay = Math.min(card.minimumPayment, remaining);
      card.recommendedPayment = round2(pay);
      card.reason = 'Prioritized because minimums cannot all be covered and this card is due sooner.';
      remaining = round2(remaining - pay);
    }
    return {
      strategy: 'Minimum Payment Protection',
      warning: 'Not enough to cover all minimum payments. Allocated to the cards due soonest.',
      totalMinimum,
      remaining: round2(Math.max(0, remaining)),
      plan: byDueDate,
      riskScores,
    };
  }

  // Case B: cover every minimum first.
  for (const card of normalized) {
    card.recommendedPayment = card.minimumPayment;
    card.reason = 'Minimum payment covered first.';
    remaining = round2(remaining - card.minimumPayment);
  }

  // Then send extra to highest APR (tie-break: nearer due date, then higher balance).
  const byApr = [...normalized].sort((a, b) => {
    if (b.apr !== a.apr) return b.apr - a.apr;
    const due = byNearestDueDate(a, b);
    if (due !== 0) return due;
    return b.balance - a.balance;
  });

  for (const card of byApr) {
    if (remaining <= 0) break;
    const headroom = Math.max(0, round2(card.balance - card.recommendedPayment));
    const extra = round2(Math.min(remaining, headroom));
    if (extra > 0) {
      card.recommendedPayment = round2(card.recommendedPayment + extra);
      card.reason = 'Extra payment added because this card has the highest APR (debt avalanche).';
      remaining = round2(remaining - extra);
    }
  }

  return {
    strategy: 'Debt Avalanche + Due Date Safety',
    warning: null,
    totalMinimum,
    remaining: round2(Math.max(0, remaining)),
    plan: normalized,
    riskScores,
  };
}

/** Sort comparator: cards with the nearest due date come first; nulls last. */
function byNearestDueDate(a, b) {
  const da = daysUntil(a.dueDate);
  const db = daysUntil(b.dueDate);
  if (da === null && db === null) return 0;
  if (da === null) return 1;
  if (db === null) return -1;
  return da - db;
}

/**
 * Risk score (0-100) combining APR pressure, due-date urgency, and balance.
 * Judge-friendly visual metric; not used to change payment amounts.
 */
function computeRiskScore(card) {
  // APR component: 0-40, saturates around 30% APR.
  const aprScore = Math.min(40, (card.apr / 30) * 40);

  // Due-date urgency: 0-35, higher as the due date approaches/passes.
  const days = daysUntil(card.dueDate);
  let dueScore = 10;
  if (days !== null) {
    if (days <= 0) dueScore = 35;
    else if (days <= 3) dueScore = 30;
    else if (days <= 7) dueScore = 22;
    else if (days <= 14) dueScore = 14;
    else dueScore = 6;
  }

  // Balance component: 0-25, saturates at 5000.
  const balanceScore = Math.min(25, (card.balance / 5000) * 25);

  const score = Math.round(aprScore + dueScore + balanceScore);
  let level = 'low';
  if (score >= 70) level = 'high';
  else if (score >= 40) level = 'medium';

  return { score, level };
}

module.exports = { optimizePayments, computeRiskScore };
