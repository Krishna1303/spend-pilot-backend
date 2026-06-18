'use strict';

const { getAIClient } = require('../config/ai');
const { env } = require('../config/env');
const logger = require('../config/logger');
const { toISODate } = require('../utils/dates');

/**
 * Explain an ALREADY-CALCULATED optimizer plan in plain English.
 *
 * The AI never changes amounts or invents data — it only explains. If the AI
 * is unavailable or errors, we return a deterministic explanation built from
 * the per-card reasons so the demo always shows something.
 */
async function explainPlan({ cards = [], optimizerResult }) {
  if (!optimizerResult || !Array.isArray(optimizerResult.plan)) {
    return { explanation: 'No payment plan was provided to explain.', source: 'fallback' };
  }

  const client = getAIClient();
  if (!client) {
    return { explanation: buildDeterministicExplanation(optimizerResult), source: 'fallback' };
  }

  try {
    const prompt = buildPrompt(cards, optimizerResult);
    const response = await client.messages.create({
      model: env.AI_MODEL,
      max_tokens: 700,
      system:
        'You are a helpful assistant for a credit-card payment app. The backend has ALREADY ' +
        'calculated the payment plan. Do NOT change any payment amounts. Do NOT invent APRs, ' +
        'balances, due dates, or card names. Explain the plan in simple, friendly language. ' +
        'Keep it short: a one-line summary, why one card is prioritized, any warning, and a ' +
        'one-line disclaimer that this is not financial advice.',
      messages: [{ role: 'user', content: prompt }],
    });

    const text = (response.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    if (!text) {
      return { explanation: buildDeterministicExplanation(optimizerResult), source: 'fallback' };
    }
    return { explanation: text, source: 'ai', model: env.AI_MODEL };
  } catch (err) {
    logger.warn('AI explanation failed; using deterministic fallback', { error: err.message });
    return { explanation: buildDeterministicExplanation(optimizerResult), source: 'fallback' };
  }
}

function buildPrompt(cards, optimizerResult) {
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

/** Deterministic explanation assembled from the optimizer reasons. */
function buildDeterministicExplanation(optimizerResult) {
  const lines = [];
  lines.push(`Strategy: ${optimizerResult.strategy}.`);

  if (optimizerResult.warning) {
    lines.push(`Heads up: ${optimizerResult.warning}`);
  }

  for (const card of optimizerResult.plan || []) {
    const name = card.cardName || card.bankName || 'Card';
    if (card.recommendedPayment > 0) {
      lines.push(`• ${name}: pay $${card.recommendedPayment.toFixed(2)} — ${card.reason}`);
    }
  }

  if (typeof optimizerResult.remaining === 'number' && optimizerResult.remaining > 0) {
    lines.push(`You have $${optimizerResult.remaining.toFixed(2)} left over after this plan.`);
  }

  lines.push('This is an automated suggestion, not financial advice.');
  return lines.join('\n');
}

module.exports = { explainPlan, buildDeterministicExplanation };
