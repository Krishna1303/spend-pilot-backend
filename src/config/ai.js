'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { env } = require('./env');
const logger = require('./logger');

/**
 * Lazily-constructed Anthropic (Claude) client.
 * Returns null when no API key is configured so callers can fall back to a
 * deterministic explanation instead of crashing the demo.
 */
let client = null;

function getAIClient() {
  if (!env.ANTHROPIC_API_KEY) {
    return null;
  }
  if (!client) {
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    logger.info('Anthropic AI client initialized', { model: env.AI_MODEL });
  }
  return client;
}

module.exports = { getAIClient };
