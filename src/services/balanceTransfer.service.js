'use strict';

const { toMoney, round2 } = require('../utils/money');

const MAX_MONTHS = 600;

/**
 * Balance-transfer / consolidation evaluator — pure deterministic math.
 *
 * Compares keeping a balance on its current card vs. moving it to a promo
 * offer (e.g. 0% APR for N months) that charges a transfer fee, then a
 * post-promo APR on whatever remains. Reports interest under each option, the
 * net savings (after the fee), the break-even month, and whether the balance
 * clears before the promo ends. Transparent by design — no hidden assumptions.
 */
function evaluateTransfer({ amount, sourceApr, monthlyPayment, offer = {} }) {
  const principal = toMoney(amount);
  const apr = Number(sourceApr) || 0;
  const monthly = toMoney(monthlyPayment);

  const transferFeePct = offer.transferFeePct != null ? Number(offer.transferFeePct) : 3;
  const promoApr = offer.promoApr != null ? Number(offer.promoApr) : 0;
  const promoMonths = Math.max(0, parseInt(offer.promoMonths, 10) || 0);
  const postPromoApr = offer.postPromoApr != null ? Number(offer.postPromoApr) : apr;

  const transferFee = round2(principal * (transferFeePct / 100));
  const transferredBalance = round2(principal + transferFee);

  // Option A: stay on the current card at its APR.
  const stay = amortize(principal, monthly, [{ months: Infinity, apr }]);

  // Option B: transfer — promo APR for promoMonths, then post-promo APR.
  const transfer = amortize(transferredBalance, monthly, [
    { months: promoMonths, apr: promoApr },
    { months: Infinity, apr: postPromoApr },
  ]);

  const stayCost = stay.totalInterest; // interest only (principal is the same)
  const transferCost = round2(transferFee + transfer.totalInterest); // fee + interest
  const savings = round2(stayCost - transferCost);
  const paidOffWithinPromo = transfer.paidOff && transfer.months <= promoMonths;
  const breakEvenMonths = computeBreakEven(principal, monthly, apr, transferFee);

  const warnings = [];
  if (!stay.paidOff || !transfer.paidOff) {
    warnings.push('At this monthly payment the balance does not fully pay off within 50 years — increase the monthly payment.');
  }
  if (transfer.paidOff && !paidOffWithinPromo) {
    warnings.push(
      `You won't clear the balance before the ${promoMonths}-month promo ends; the post-promo APR of ${postPromoApr}% then applies to the remaining balance.`
    );
  }
  if (savings <= 0) {
    warnings.push('At this monthly payment the transfer fee outweighs the interest saved — staying is cheaper.');
  }
  if (breakEvenMonths == null && savings > 0) {
    warnings.push('The balance is paid off quickly; savings come mostly from the promo rate rather than recovering the fee over time.');
  }

  return {
    inputs: {
      amount: principal,
      sourceApr: apr,
      monthlyPayment: monthly,
      offer: { promoApr, promoMonths, transferFeePct, postPromoApr },
    },
    transferFee,
    transferredBalance,
    stay: {
      apr,
      totalInterest: stay.paidOff ? stay.totalInterest : null,
      months: stay.paidOff ? stay.months : null,
      totalCost: stay.paidOff ? stayCost : null,
    },
    transfer: {
      promoApr,
      promoMonths,
      postPromoApr,
      promoInterest: transfer.paidOff ? transfer.phaseInterest[0] : null,
      postPromoInterest: transfer.paidOff ? transfer.phaseInterest[1] : null,
      totalInterest: transfer.paidOff ? transfer.totalInterest : null,
      months: transfer.paidOff ? transfer.months : null,
      totalCost: transfer.paidOff ? transferCost : null,
      paidOffWithinPromo,
    },
    savings: stay.paidOff && transfer.paidOff ? savings : null,
    breakEvenMonths,
    recommendation: savings > 0 ? 'transfer' : 'stay',
    warnings,
  };
}

/**
 * Amortize a single balance through one or more APR phases (applied in order),
 * tracking interest per phase. monthlyPayment is fixed.
 */
function amortize(startBalance, monthlyPayment, phases) {
  let balance = startBalance;
  let months = 0;
  let totalInterest = 0;
  const phaseInterest = phases.map(() => 0);

  let phaseIdx = 0;
  let phaseMonthsLeft = phases[0].months;

  if (monthlyPayment <= 0) return { months: 0, totalInterest: 0, phaseInterest, paidOff: balance <= 0.005 };

  while (balance > 0.005 && months < MAX_MONTHS) {
    months += 1;
    const apr = phases[phaseIdx].apr;
    const interest = round2(balance * (apr / 100 / 12));
    balance = round2(balance + interest);
    totalInterest = round2(totalInterest + interest);
    phaseInterest[phaseIdx] = round2(phaseInterest[phaseIdx] + interest);

    const pay = Math.min(monthlyPayment, balance);
    balance = round2(balance - pay);

    phaseMonthsLeft -= 1;
    if (phaseMonthsLeft <= 0 && phaseIdx < phases.length - 1) {
      phaseIdx += 1;
      phaseMonthsLeft = phases[phaseIdx].months;
    }
  }

  return {
    months,
    totalInterest: round2(totalInterest),
    phaseInterest: phaseInterest.map(round2),
    paidOff: balance <= 0.005,
  };
}

/**
 * Break-even: the month by which the interest you'd have paid on the original
 * card (and thus avoided) equals the transfer fee.
 */
function computeBreakEven(principal, monthlyPayment, sourceApr, fee) {
  if (fee <= 0) return 0;
  let balance = principal;
  let cumulativeInterest = 0;
  let months = 0;
  while (balance > 0.005 && months < MAX_MONTHS) {
    months += 1;
    const interest = round2(balance * (sourceApr / 100 / 12));
    cumulativeInterest = round2(cumulativeInterest + interest);
    balance = round2(balance + interest - Math.min(monthlyPayment, balance + interest));
    if (cumulativeInterest >= fee) return months;
  }
  return null; // paid off before recovering the fee
}

module.exports = { evaluateTransfer };
