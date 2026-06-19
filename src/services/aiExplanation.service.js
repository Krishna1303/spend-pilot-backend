'use strict';

const { getAIClient } = require('../config/ai');
const { env } = require('../config/env');
const logger = require('../config/logger');
const { toISODate } = require('../utils/dates');

const SYSTEM_PROMPT =
  'You are a helpful assistant for a credit-card payoff app. The backend has ALREADY ' +
  'calculated the numbers below. Do NOT change any amounts, dates, or rates, and do NOT ' +
  'invent data not present in the input. Explain it in simple, friendly, plain English. ' +
  'Be concise (a short paragraph or a few bullets). End with a one-line note that this is ' +
  'not financial advice.';

const KINDS = {
  optimizer: { prompt: optimizerPrompt, fallback: optimizerFallback },
  rescue: { prompt: genericPrompt('Payday Rescue Plan'), fallback: rescueFallback },
  simulate: { prompt: genericPrompt('what-if simulation'), fallback: simulateFallback },
  balanceTransfer: { prompt: genericPrompt('balance-transfer analysis'), fallback: balanceTransferFallback },
};

/**
 * Narrate an already-calculated result in plain English. The AI only explains
 * — never changes numbers. Falls back to a deterministic narration assembled
 * from the result so the demo always shows something.
 */
async function narrate({ kind, payload, cards = [] }) {
  const handler = KINDS[kind];
  if (!handler) {
    return { explanation: 'Nothing to explain for this request.', source: 'fallback' };
  }
  if (!payload || typeof payload !== 'object') {
    return { explanation: 'No result was provided to explain.', source: 'fallback' };
  }

  const fallback = () => ({ explanation: handler.fallback(payload), source: 'fallback' });

  const client = getAIClient();
  if (!client) return fallback();

  try {
    const userPrompt = handler.prompt(payload, cards);
    const response = await client.messages.create({
      model: env.AI_MODEL,
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const text = (response.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (!text) return fallback();
    return { explanation: text, source: 'ai', model: env.AI_MODEL };
  } catch (err) {
    logger.warn('AI narration failed; using deterministic fallback', { kind, error: err.message });
    return fallback();
  }
}

/** Backward-compatible wrapper for the original optimizer explanation. */
async function explainPlan({ cards = [], optimizerResult }) {
  if (!optimizerResult || !Array.isArray(optimizerResult.plan)) {
    return { explanation: 'No payment plan was provided to explain.', source: 'fallback' };
  }
  return narrate({ kind: 'optimizer', payload: optimizerResult, cards });
}

function money(n) {
  const v = Number(n);
  return Number.isFinite(v) ? `$${v.toFixed(2)}` : '$0.00';
}

// ---- Prompt builders ----

function genericPrompt(label) {
  return (payload) =>
    `Here is a calculated ${label} as JSON. Explain it in plain English without changing any ` +
    `numbers or inventing data.\n\n${JSON.stringify(payload, null, 2)}\n\n` +
    'Remember: do not change the amounts; this is not financial advice.';
}

function optimizerPrompt(optimizerResult, cards) {
  const safe = {
    strategy: optimizerResult.strategy,
    warning: optimizerResult.warning,
    totalMinimum: optimizerResult.totalMinimum,
    remaining: optimizerResult.remaining,
    plan: (optimizerResult.plan || []).map((c) => ({
      cardName: c.cardName || c.bankName || 'Card',
      apr: c.apr,
      balance: c.balance,
      minimumPayment: c.minimumPayment,
      dueDate: toISODate(c.dueDate),
      recommendedPayment: c.recommendedPayment,
      reason: c.reason,
    })),
  };
  return (
    'Here is the calculated payment plan as JSON. Explain it without changing any numbers.\n\n' +
    `${JSON.stringify(safe, null, 2)}\n\n` +
    'Remember: this is not financial advice. Do not change the amounts. Do not invent data.'
  );
}

// ---- Deterministic fallbacks ----

function optimizerFallback(optimizerResult) {
  const lines = [`Strategy: ${optimizerResult.strategy}.`];
  if (optimizerResult.warning) lines.push(`Heads up: ${optimizerResult.warning}`);
  for (const card of optimizerResult.plan || []) {
    const name = card.cardName || card.bankName || 'Card';
    if (card.recommendedPayment > 0) {
      lines.push(`• ${name}: pay ${money(card.recommendedPayment)} — ${card.reason}`);
    }
  }
  if (typeof optimizerResult.remaining === 'number' && optimizerResult.remaining > 0) {
    lines.push(`You have ${money(optimizerResult.remaining)} left over after this plan.`);
  }
  lines.push('This is an automated suggestion, not financial advice.');
  return lines.join('\n');
}

function rescueFallback(rescue) {
  const lines = [`${rescue.strategy || 'Payday Rescue Plan'}:`];
  for (const a of rescue.actions || []) {
    const when = a.when === 'today' ? `today (${a.date})` : `on payday (${a.date})`;
    lines.push(`• Pay ${money(a.amount)} to ${a.cardName} ${when} — ${a.reason}`);
  }
  const s = rescue.summary || {};
  const bits = [];
  if (s.lateFeesAvoided) bits.push(`avoid ${money(s.lateFeeAmountAvoided)} in late fees`);
  if (s.interestSavedVsMinimums) bits.push(`save ${money(s.interestSavedVsMinimums)} in interest`);
  if (s.debtFreeDate) {
    const sooner = s.monthsSavedVsMinimums ? ` (${s.monthsSavedVsMinimums} months sooner than minimums)` : '';
    bits.push(`be debt-free by ${s.debtFreeDate}${sooner}`);
  }
  if (bits.length) lines.push(`This plan helps you ${bits.join(', ')}.`);
  for (const w of rescue.warnings || []) lines.push(`⚠ ${w}`);
  lines.push('This is an automated suggestion, not financial advice.');
  return lines.join('\n');
}

function simulateFallback(sim) {
  const lines = [];
  const b = sim.baseline || {};
  if (b.debtFreeDate) {
    lines.push(`Baseline: paying ${money(b.monthlyPayment)}/month, you're debt-free by ${b.debtFreeDate} (${b.monthsToDebtFree} months), paying ${money(b.totalInterest)} in interest.`);
  } else {
    lines.push('Baseline: at this payment the debt does not pay off in a reasonable time.');
  }
  for (const sc of sim.scenarios || []) {
    const v = sc.vsBaseline || {};
    if (v.interestSaved != null) {
      lines.push(`• ${sc.label}: debt-free ${sc.debtFreeDate} — saves ${v.monthsSaved} months and ${money(v.interestSaved)} vs baseline.`);
    } else if (v.paysOffWhereBaselineDoesnt) {
      lines.push(`• ${sc.label}: pays off by ${sc.debtFreeDate}, where the baseline doesn't.`);
    } else {
      lines.push(`• ${sc.label}: debt-free ${sc.debtFreeDate || 'n/a'}.`);
    }
  }
  if (sim.bestScenario) {
    lines.push(`Best option: "${sim.bestScenario.label}" — saves ${money(sim.bestScenario.interestSaved)}.`);
  }
  lines.push('This is an automated comparison, not financial advice.');
  return lines.join('\n');
}

function balanceTransferFallback(bt) {
  const lines = [];
  const amt = bt.inputs ? bt.inputs.amount : null;
  lines.push(`Balance transfer${amt ? ` of ${money(amt)}` : ''}: transfer fee ${money(bt.transferFee)}.`);
  if (bt.stay && bt.stay.totalInterest != null) {
    lines.push(`Staying put: ${money(bt.stay.totalInterest)} interest over ${bt.stay.months} months.`);
  }
  if (bt.transfer && bt.transfer.totalCost != null) {
    lines.push(`Transferring: ${money(bt.transfer.totalCost)} total cost (fee + interest) over ${bt.transfer.months} months.`);
  }
  if (bt.recommendation === 'transfer' && bt.savings != null) {
    const be = bt.breakEvenMonths != null ? `, breaking even in ${bt.breakEvenMonths} months` : '';
    lines.push(`Recommendation: transfer — it saves ${money(bt.savings)}${be}.`);
  } else {
    lines.push('Recommendation: stay — the transfer fee outweighs the interest saved at this payment.');
  }
  for (const w of bt.warnings || []) lines.push(`⚠ ${w}`);
  lines.push('This is an automated analysis, not financial advice.');
  return lines.join('\n');
}

module.exports = { narrate, explainPlan, optimizerFallback, buildDeterministicExplanation: optimizerFallback, KINDS };
