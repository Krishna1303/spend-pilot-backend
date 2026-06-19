'use strict';

const { toMoney, round2 } = require('../utils/money');
const { toISODate } = require('../utils/dates');
const { projectPayoff } = require('./rescue.service');

/**
 * What-if simulator. Compares debt-payoff scenarios against a baseline using
 * the same deterministic amortization + avalanche engine as the optimizer.
 *
 * Each scenario can:
 *  - change the monthly payment (extraMonthly or an absolute monthlyPayment)
 *  - apply a one-time lumpSum (to the highest-APR balance)
 *  - remove cards (paid off / stop using) via removeCardIds
 *  - override a card's apr/balance/minimumPayment (e.g. a balance transfer)
 * and reports months saved, interest saved, and the new debt-free date vs base.
 */
function normalizeCards(cards) {
  return cards.map((c) => ({
    cardId: c.id || c._id ? String(c.id || c._id) : undefined,
    cardName: c.cardName || c.bankName || 'Card',
    balance: toMoney(c.balance),
    minimumPayment: toMoney(c.minimumPayment),
    apr: Number(c.apr) || 0,
  }));
}

function totalMinimums(cards) {
  return round2(cards.reduce((s, c) => s + c.minimumPayment, 0));
}

function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function summarize(cards, monthlyPayment) {
  const p = projectPayoff(cards, monthlyPayment);
  return {
    monthlyPayment: round2(monthlyPayment),
    paidOff: p.paidOff,
    monthsToDebtFree: p.paidOff ? p.months : null,
    debtFreeDate: p.paidOff ? toISODate(addMonths(new Date(), p.months)) : null,
    totalInterest: p.paidOff ? p.totalInterest : null,
  };
}

/** Apply a scenario's modifications to a fresh copy of the cards. */
function applyScenario(baseCards, scenario) {
  let cards = baseCards.map((c) => ({ ...c }));

  const removeSet = new Set((scenario.removeCardIds || []).map(String));
  if (removeSet.size) cards = cards.filter((c) => !removeSet.has(String(c.cardId)));

  const overrides = scenario.cardOverrides || {};
  for (const c of cards) {
    const ov = overrides[c.cardId];
    if (!ov) continue;
    if (ov.apr !== undefined) c.apr = Number(ov.apr) || 0;
    if (ov.balance !== undefined) c.balance = toMoney(ov.balance);
    if (ov.minimumPayment !== undefined) c.minimumPayment = toMoney(ov.minimumPayment);
  }

  // One-time lump sum applied to the highest-APR balances (avalanche order).
  let lump = toMoney(scenario.lumpSum);
  if (lump > 0) {
    const byApr = [...cards].filter((c) => c.balance > 0).sort((a, b) => b.apr - a.apr);
    for (const c of byApr) {
      if (lump <= 0) break;
      const pay = Math.min(lump, c.balance);
      c.balance = round2(c.balance - pay);
      lump = round2(lump - pay);
    }
  }

  return cards;
}

function simulate(cards, opts = {}) {
  const base = normalizeCards(cards);
  const baselineMonthly =
    opts.monthlyPayment != null ? toMoney(opts.monthlyPayment) : totalMinimums(base);

  const baseline = {
    label: 'Baseline',
    ...summarize(base, baselineMonthly),
    note: baselineMonthly <= totalMinimums(base) ? 'Paying minimums only.' : undefined,
  };

  const scenarios = (Array.isArray(opts.scenarios) ? opts.scenarios : []).map((s) => {
    const scenarioCards = applyScenario(base, s);
    const monthly =
      s.monthlyPayment != null
        ? toMoney(s.monthlyPayment)
        : round2(baselineMonthly + toMoney(s.extraMonthly));

    const summary = summarize(scenarioCards, monthly);
    const bothPaid = baseline.paidOff && summary.paidOff;

    return {
      label: s.label || 'Scenario',
      ...summary,
      lumpSum: toMoney(s.lumpSum) || 0,
      vsBaseline: {
        monthsSaved: bothPaid ? baseline.monthsToDebtFree - summary.monthsToDebtFree : null,
        interestSaved: bothPaid ? round2(baseline.totalInterest - summary.totalInterest) : null,
        paysOffWhereBaselineDoesnt: !baseline.paidOff && summary.paidOff,
      },
    };
  });

  // Surface the best scenario by interest saved (when comparable).
  let best = null;
  for (const s of scenarios) {
    if (s.vsBaseline.interestSaved != null && (!best || s.vsBaseline.interestSaved > best.interestSaved)) {
      best = { label: s.label, interestSaved: s.vsBaseline.interestSaved, monthsSaved: s.vsBaseline.monthsSaved };
    }
  }

  return { baseline, scenarios, bestScenario: best };
}

module.exports = { simulate };
