'use strict';

const { getAIClient } = require('../config/ai');
const { env } = require('../config/env');
const logger = require('../config/logger');

/**
 * Lightweight help articles. Keyword-matched, then optionally passed to the AI
 * for a friendlier answer. No vector DB needed for the hackathon.
 */
const HELP_ARTICLES = [
  {
    id: 'add-card',
    keywords: ['add', 'card', 'create', 'new card'],
    title: 'Adding a card',
    body: 'Go to the Cards screen and tap "Add Card". You can enter a card manually, upload a PDF statement, or connect a bank with Plaid.',
  },
  {
    id: 'upload-statement',
    keywords: ['upload', 'statement', 'pdf', 'parse'],
    title: 'Uploading a statement',
    body: 'On the upload screen, choose a text-based PDF statement. We extract the statement balance, minimum payment, and due date for you to confirm.',
  },
  {
    id: 'optimizer',
    keywords: ['optimize', 'optimizer', 'payment', 'plan', 'how much', 'pay'],
    title: 'How the optimizer works',
    body: 'Enter your maximum payment. We cover minimum payments first, then send any extra to your highest-APR card to reduce interest. Near-term due dates are protected when funds are tight.',
  },
  {
    id: 'plaid',
    keywords: ['bank', 'connect', 'plaid', 'link', 'sync'],
    title: 'Connecting a bank',
    body: 'Use "Connect Bank" to link an account via Plaid Sandbox. Your dashboard then shows accounts and recent transactions.',
  },
  {
    id: 'security',
    keywords: ['secure', 'security', 'password', 'safe', 'data'],
    title: 'Security',
    body: 'Passwords are hashed and never stored in plain text. We never ask for your bank username or password — bank connections go through Plaid.',
  },
];

/** Score an article against the question by keyword overlap. */
function scoreArticle(question, article) {
  const q = question.toLowerCase();
  return article.keywords.reduce((score, kw) => (q.includes(kw) ? score + 1 : score), 0);
}

function findBestArticle(question) {
  let best = null;
  let bestScore = 0;
  for (const article of HELP_ARTICLES) {
    const score = scoreArticle(question, article);
    if (score > bestScore) {
      best = article;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

/**
 * Answer a help question. Returns { answer, escalatable, articleId }.
 * escalatable=true means we couldn't confidently answer and the user may open
 * a support ticket.
 */
async function ask(question) {
  const article = findBestArticle(question);

  if (!article) {
    return {
      answer:
        "I couldn't find a help article for that. You can open a support ticket and our team will help you.",
      escalatable: true,
      articleId: null,
    };
  }

  const client = getAIClient();
  if (!client) {
    return { answer: article.body, escalatable: false, articleId: article.id };
  }

  try {
    const response = await client.messages.create({
      model: env.AI_MODEL,
      max_tokens: 400,
      system:
        'You are SpendPilot\'s in-app help assistant. Answer ONLY using the provided help ' +
        'article context. Be concise and friendly. If the context does not answer the ' +
        'question, say you are not sure and suggest opening a support ticket.',
      messages: [
        {
          role: 'user',
          content: `Help article: "${article.title}"\n${article.body}\n\nUser question: ${question}`,
        },
      ],
    });
    const text = (response.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return { answer: text || article.body, escalatable: false, articleId: article.id };
  } catch (err) {
    logger.warn('Chatbot AI failed; returning article body', { error: err.message });
    return { answer: article.body, escalatable: false, articleId: article.id };
  }
}

module.exports = { ask, HELP_ARTICLES };
