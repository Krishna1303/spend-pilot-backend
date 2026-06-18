'use strict';

const { getAIClient } = require('../config/ai');
const { env } = require('../config/env');
const logger = require('../config/logger');
const { round2 } = require('../utils/money');

/**
 * Help articles for the Help center page (consumed by content.controller).
 * Kept separate from the chatbot's preset Q&A knowledge base below.
 */
const HELP_ARTICLES = [
  { id: 'add-card', title: 'Adding a card', body: 'Go to the Cards screen and tap "Add Card". You can enter a card manually, upload a PDF statement, or connect a bank with Plaid.' },
  { id: 'upload-statement', title: 'Uploading a statement', body: 'On the upload screen, choose a text-based PDF statement. We extract the statement balance, minimum payment, and due date for you to confirm.' },
  { id: 'optimizer', title: 'How the optimizer works', body: 'Enter your maximum payment. We cover minimum payments first, then send any extra to your highest-APR card to reduce interest. Near-term due dates are protected when funds are tight.' },
  { id: 'plaid', title: 'Connecting a bank', body: 'Use "Connect Bank" to link an account via Plaid Sandbox. Your dashboard then shows accounts and recent transactions.' },
  { id: 'security', title: 'Security', body: 'Passwords are hashed and never stored in plain text. We never ask for your bank username or password — bank connections go through Plaid.' },
];

/**
 * Preset question/answer knowledge base for the RAG chatbot. Answers are
 * curated; the bot only ever responds from this set (or escalates). `tags`
 * boost retrieval for phrasings that don't reuse the question's wording.
 */
const PRESET_QA = [
  { id: 'add-card', question: 'How do I add a card?', tags: 'add create new card manual', answer: 'Open the Cards screen and tap "Add Card". You can enter a card manually, upload a PDF statement, or connect a bank through Plaid.' },
  { id: 'card-types', question: 'What is the difference between the credit and debit tabs?', tags: 'credit debit tab difference type', answer: 'The Cards screen separates your cards into Credit and Debit sub-tabs. Only credit cards are used by the payment optimizer, since debit cards carry no balance or APR.' },
  { id: 'upload-statement', question: 'How do I upload a statement?', tags: 'upload pdf statement parse extract', answer: 'On the upload screen, choose a text-based PDF statement. We extract the statement balance, minimum payment, and due date for you to review and confirm.' },
  { id: 'optimizer', question: 'How does the optimizer decide my payments?', tags: 'optimizer optimize payment plan how much pay suggest', answer: 'Enter your maximum payment. We cover every card\'s minimum payment first, then send any extra to your highest-APR card to cut interest. If you cannot cover all minimums, we protect the cards due soonest.' },
  { id: 'apr', question: 'What is APR and why does it matter?', tags: 'apr interest rate cost', answer: 'APR is the annual interest rate on a card\'s balance. The optimizer pays down the highest-APR card first because that reduces the most interest over time.' },
  { id: 'risk-score', question: 'What is the risk score on a card?', tags: 'risk score level high medium low', answer: 'The risk score (0-100) combines a card\'s APR, how soon it is due, and its balance into a single indicator so you can quickly see which cards need attention.' },
  { id: 'plaid', question: 'How do I connect my bank?', tags: 'bank connect plaid link account', answer: 'Tap "Connect Bank" to link an account through Plaid. Once connected, your dashboard shows accounts and recent transactions.' },
  { id: 'sync', question: 'How often is my card data updated?', tags: 'sync update daily refresh balance pull', answer: 'Connected cards are refreshed automatically once per day. You can also trigger a manual refresh, and we never pull the same day\'s data twice.' },
  { id: 'security', question: 'Is my data secure? Do you store my bank password?', tags: 'secure security safe password data privacy', answer: 'Passwords are stored only as salted hashes, never in plain text. We never ask for or store your bank username or password — bank connections go through Plaid.' },
  { id: 'update-profile', question: 'How do I update my email or profile details?', tags: 'profile update email mobile photo subscription change', answer: 'Open My Profile to edit your name, mobile number, profile photo, email, or subscription plan. Email changes are checked to make sure the address is not already in use.' },
  { id: 'delete-account', question: 'How do I delete my account?', tags: 'delete remove account close cancel', answer: 'From the profile screen you can delete your account. You will confirm with your password, and this permanently removes your cards, transactions, and support history.' },
  { id: 'dashboard', question: 'What does the dashboard show?', tags: 'dashboard graph spending earning category due payday', answer: 'The dashboard shows your spending vs. earning and spending by category, plus details like upcoming due dates and your next estimated payday.' },
];

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'do', 'does', 'did', 'i', 'my', 'me', 'to', 'of', 'and',
  'or', 'for', 'in', 'on', 'with', 'how', 'what', 'why', 'can', 'you', 'your', 'it', 'this',
  'that', 'be', 'will', 'would', 'should', 'about', 'get', 'have', 'has', 'if', 'so', 'we',
]);

const CONFIDENCE_THRESHOLD = 0.25;

/** Tokenize: lowercase, drop punctuation + stopwords, naive singularize. */
function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t))
    .map((t) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t));
}

/**
 * Retrieve preset Q&A entries ranked by relevance to the question.
 * Score weights question/tag token hits higher than answer hits, normalized to
 * [0,1] so it doubles as a confidence value.
 */
function retrieve(question) {
  const qTokens = Array.from(new Set(tokenize(question)));
  if (qTokens.length === 0) return { matches: [], confidence: 0 };

  const scored = PRESET_QA.map((qa) => {
    const strong = new Set(tokenize(`${qa.question} ${qa.tags || ''}`));
    const weak = new Set(tokenize(qa.answer));
    let score = 0;
    for (const tok of qTokens) {
      if (strong.has(tok)) score += 2;
      else if (weak.has(tok)) score += 1;
    }
    return { ...qa, score: round2(score / (qTokens.length * 2)) };
  })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);

  return { matches: scored, confidence: scored.length ? scored[0].score : 0 };
}

/**
 * Answer a help question using retrieval-augmented generation over PRESET_QA.
 * Returns { answer, escalatable, sources, confidence }. The model is grounded
 * strictly in retrieved presets; if the AI is unavailable we return the top
 * preset answer verbatim. Low confidence → escalatable.
 */
async function ask(question) {
  const { matches, confidence } = retrieve(question);
  const top = matches[0];

  if (!top || confidence < CONFIDENCE_THRESHOLD) {
    return {
      answer:
        "I couldn't find a confident answer to that. Would you like to connect with a support agent?",
      escalatable: true,
      sources: [],
      confidence,
    };
  }

  const retrieved = matches.slice(0, 3);
  const sources = retrieved.map((m) => m.id);
  const client = getAIClient();

  if (!client) {
    return { answer: top.answer, escalatable: false, sources, confidence };
  }

  try {
    const context = retrieved.map((m) => `Q: ${m.question}\nA: ${m.answer}`).join('\n\n');
    const response = await client.messages.create({
      model: env.AI_MODEL,
      max_tokens: 400,
      system:
        "You are SpendPilot's help assistant. Answer ONLY using the preset Q&A context " +
        'provided. Do not invent features, steps, or facts that are not in the context. If ' +
        'the context does not contain the answer, say you are not sure and suggest contacting ' +
        'support. Be concise and friendly.',
      messages: [{ role: 'user', content: `Preset Q&A context:\n${context}\n\nUser question: ${question}` }],
    });
    const text = (response.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return { answer: text || top.answer, escalatable: false, sources, confidence };
  } catch (err) {
    logger.warn('Chatbot RAG generation failed; returning top preset answer', { error: err.message });
    return { answer: top.answer, escalatable: false, sources, confidence };
  }
}

module.exports = { ask, retrieve, HELP_ARTICLES, PRESET_QA };
