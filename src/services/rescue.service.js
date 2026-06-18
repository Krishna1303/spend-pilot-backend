'use strict';

const { toMoney, round2 } = require('../utils/money');
const { parseDate, daysUntil, toISODate } = require('../utils/dates');

const DEFAULT_LATE_FEE = 39; // typical credit-card late fee
const MAX_PROJECTION_MONTHS = 600; // 50-year cap to avoid infinite loops

/**
 * Payday Rescue Plan — the deterministic engine, made executable.
 *
 * Given a user's credit cards plus their next paycheck (date + amount), an
 * optional cash buffer to hold back, and any cash on hand today, produce a
 * date-by-date action list:
 *   1. Protect due dates BEFORE payday using today's cash (avoid late fees).
 *   2. On payday, cover the remaining minimums, then send extra to the
 *      highest-APR card (debt avalanche).
 * Also projects late fees avoided, interest saved vs. minimums-only, and a
 * debt-free date. The AI never sees this — it's pure deterministic math.
 */
function buildRescuePlan(cards, opts = {}) {
  const paycheckDate = parseDate(opts.paycheckDate);
  const paycheckAmount = toMoney(opts.paycheckAmount);
  const cashBuffer = toMoney(opts.cashBuffer);
  const currentCash = toMoney(opts.currentCash);
  const lateFee = Number.isFinite(Number(opts.lateFeePerCard)) ? Number(opts.lateFeePerCard) : DEFAULT_LATE_FEE;

  const normalized = cards.map((c) => ({
    cardId: c.id || c._id ? String(c.id || c._id) : undefined,
    cardName: c.cardName || c.bankName || 'Card',
    balance: toMoney(c.balance),
    minimumPayment: toMoney(c.minimumPayment),
    apr: Number(c.apr) || 0,
    dueDate: c.dueDate || null,
    dueIso: toISODate(c.dueDate),
    daysToDue: daysUntil(c.dueDate),
    dueBeforePayday:
      paycheckDate && c.dueDate ? parseDate(c.dueDate) < paycheckDate : false,
    scheduled: 0,
  }));

  // Cash pools: what we can deploy today vs. on payday.
  const pool = {
    today: currentCash,
    payday: Math.max(0, round2(paycheckAmount - cashBuffer)),
  };

  const actions = [];
  const warnings = [];
  const todayIso = toISODate(new Date());
  const paydayIso = toISODate(paycheckDate) || null;
  let lateFeesAvoided = 0;

  const addAction = (card, amount, dateIso, when, type, reason) => {
    if (amount <= 0) return;
    card.scheduled = round2(card.scheduled + amount);
    actions.push({
      cardId: card.cardId,
      cardName: card.cardName,
      amount: round2(amount),
      date: dateIso,
      when, // 'today' | 'payday'
      type, // 'avoid-late-fee' | 'minimum' | 'late-minimum' | 'extra'
      reason,
    });
  };

  // --- Phase 1: cover minimums due BEFORE payday, from today's cash ---
  const byDueDate = [...normalized].sort((a, b) => {
    const da = a.daysToDue;
    const db = b.daysToDue;
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });

  for (const card of byDueDate) {
    if (!card.dueBeforePayday || card.minimumPayment <= 0) continue;

    const fromToday = Math.min(card.minimumPayment, pool.today);
    if (fromToday > 0) {
      pool.today = round2(pool.today - fromToday);
      addAction(
        card,
        fromToday,
        card.dueIso || todayIso,
        'today',
        'avoid-late-fee',
        `Due ${card.dueIso || 'soon'} (before payday) — pay now to avoid a $${lateFee} late fee.`
      );
    }

    const shortfall = round2(card.minimumPayment - card.scheduled);
    if (shortfall > 0.005) {
      // Not enough cash today; pay the rest on payday (likely late) and warn.
      const fromPayday = Math.min(shortfall, pool.payday);
      if (fromPayday > 0) {
        pool.payday = round2(pool.payday - fromPayday);
        addAction(
          card,
          fromPayday,
          paydayIso || todayIso,
          'payday',
          'late-minimum',
          `Remaining minimum paid on payday — this is after the ${card.dueIso} due date and may incur a late fee.`
        );
      }
      warnings.push(
        `${card.cardName}: not enough cash today to fully cover the $${card.minimumPayment} minimum due ${card.dueIso}. Add cash now if possible to avoid a late fee.`
      );
    } else {
      lateFeesAvoided += 1;
    }
  }

  // --- Phase 2a: cover remaining minimums (cards due on/after payday) ---
  for (const card of byDueDate) {
    const remainingMin = round2(card.minimumPayment - card.scheduled);
    if (remainingMin <= 0.005) continue;

    let paid = 0;
    const fromPayday = Math.min(remainingMin, pool.payday);
    if (fromPayday > 0) {
      pool.payday = round2(pool.payday - fromPayday);
      paid = round2(paid + fromPayday);
    }
    const stillShort = round2(remainingMin - paid);
    if (stillShort > 0.005) {
      const fromToday = Math.min(stillShort, pool.today);
      if (fromToday > 0) {
        pool.today = round2(pool.today - fromToday);
        paid = round2(paid + fromToday);
      }
    }
    if (paid > 0) {
      addAction(
        card,
        paid,
        paydayIso || todayIso,
        'payday',
        'minimum',
        'Minimum payment covered on payday.'
      );
    }
    if (round2(card.minimumPayment - card.scheduled) > 0.005) {
      warnings.push(`${card.cardName}: paycheck can't fully cover its $${card.minimumPayment} minimum.`);
    }
  }

  // --- Phase 2b: extra to highest-APR card (debt avalanche) ---
  let extraPool = round2(pool.payday + pool.today);
  const totalMinimum = round2(normalized.reduce((s, c) => s + c.minimumPayment, 0));
  const byApr = [...normalized].sort((a, b) => b.apr - a.apr);
  for (const card of byApr) {
    if (extraPool <= 0.005) break;
    const headroom = Math.max(0, round2(card.balance - card.scheduled));
    const extra = Math.min(extraPool, headroom);
    if (extra > 0.005) {
      extraPool = round2(extraPool - extra);
      addAction(
        card,
        extra,
        paydayIso || todayIso,
        'payday',
        'extra',
        `Extra payment to your highest-APR card (${card.apr}% APR) to cut interest fastest.`
      );
    }
  }

  // Sort actions chronologically, "today" before "payday".
  actions.sort((a, b) => {
    if (a.when !== b.when) return a.when === 'today' ? -1 : 1;
    return String(a.date).localeCompare(String(b.date));
  });

  const totalScheduled = round2(actions.reduce((s, a) => s + a.amount, 0));
  const monthlyPlanAmount = totalScheduled; // recurring amount used for projection

  // --- Projections: this plan vs. minimums-only ---
  const planProjection = projectPayoff(normalized, monthlyPlanAmount);
  const minOnlyProjection = projectPayoff(normalized, totalMinimum);

  const interestSaved =
    planProjection.paidOff && minOnlyProjection.paidOff
      ? round2(minOnlyProjection.totalInterest - planProjection.totalInterest)
      : null;
  const monthsSaved =
    planProjection.paidOff && minOnlyProjection.paidOff
      ? minOnlyProjection.months - planProjection.months
      : null;

  const debtFreeDate = planProjection.paidOff
    ? toISODate(addMonths(new Date(), planProjection.months))
    : null;

  return {
    strategy: 'Payday Rescue Plan',
    inputs: {
      paycheckDate: paydayIso,
      paycheckAmount,
      cashBuffer,
      currentCash,
      lateFeePerCard: lateFee,
    },
    pools: { availableToday: currentCash, availableOnPayday: Math.max(0, round2(paycheckAmount - cashBuffer)) },
    actions,
    warnings,
    summary: {
      totalScheduled,
      totalMinimum,
      extraTowardPrincipal: round2(Math.max(0, totalScheduled - totalMinimum)),
      unallocated: round2(Math.max(0, extraPool)),
      lateFeesAvoided,
      lateFeeAmountAvoided: round2(lateFeesAvoided * lateFee),
      monthlyPlanAmount,
      debtFreeDate,
      monthsToDebtFree: planProjection.paidOff ? planProjection.months : null,
      interestSavedVsMinimums: interestSaved,
      monthsSavedVsMinimums: monthsSaved,
      projectedInterestRemaining: planProjection.paidOff ? planProjection.totalInterest : null,
    },
  };
}

/**
 * Fixed-payment amortization with the debt-avalanche rule: each month accrue
 * interest, cover minimums, then send the remainder to the highest-APR balance.
 * Returns months to payoff and total interest paid (an estimate).
 */
function projectPayoff(cards, monthlyPayment) {
  const balances = cards
    .filter((c) => c.balance > 0)
    .map((c) => ({ balance: c.balance, apr: c.apr, min: c.minimumPayment }));

  if (monthlyPayment <= 0 || balances.length === 0) {
    return { months: 0, totalInterest: 0, paidOff: balances.length === 0 };
  }

  let months = 0;
  let totalInterest = 0;

  while (balances.some((b) => b.balance > 0.005) && months < MAX_PROJECTION_MONTHS) {
    months += 1;

    // Accrue one month of interest.
    for (const b of balances) {
      if (b.balance > 0) {
        const interest = round2(b.balance * (b.apr / 100 / 12));
        b.balance = round2(b.balance + interest);
        totalInterest = round2(totalInterest + interest);
      }
    }

    let pay = monthlyPayment;

    // Cover minimums first (capped at the balance).
    for (const b of balances) {
      if (pay <= 0) break;
      if (b.balance <= 0) continue;
      const m = Math.min(b.min, b.balance, pay);
      b.balance = round2(b.balance - m);
      pay = round2(pay - m);
    }

    // Extra to the highest-APR balance.
    if (pay > 0) {
      const byApr = balances.filter((b) => b.balance > 0).sort((a, b) => b.apr - a.apr);
      for (const b of byApr) {
        if (pay <= 0) break;
        const x = Math.min(pay, b.balance);
        b.balance = round2(b.balance - x);
        pay = round2(pay - x);
      }
    }
  }

  return {
    months,
    totalInterest: round2(totalInterest),
    paidOff: months < MAX_PROJECTION_MONTHS,
  };
}

function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

module.exports = { buildRescuePlan, projectPayoff };
