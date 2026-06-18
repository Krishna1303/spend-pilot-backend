'use strict';

const { TERMS, PRIVACY } = require('../config/legalContent');
const { HELP_ARTICLES } = require('../services/chatbot.service');

/** GET /api/legal/terms */
const getTerms = (req, res) => res.json(TERMS);

/** GET /api/legal/privacy */
const getPrivacy = (req, res) => res.json(PRIVACY);

/** GET /api/help — Help center articles (shared with the chatbot's knowledge base). */
const getHelp = (req, res) => {
  res.json({
    title: 'Help Center',
    articles: HELP_ARTICLES.map((a) => ({ id: a.id, title: a.title, body: a.body })),
  });
};

module.exports = { getTerms, getPrivacy, getHelp };
