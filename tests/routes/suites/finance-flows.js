'use strict';

const assert = require('node:assert/strict');
const { expectStatus } = require('../helpers/http');
const { buildStatementPdf } = require('../helpers/fixtures');

module.exports = [
  {
    name: 'POST /api/statements/upload',
    run: async ({ client, mainUser }) => {
      const form = new FormData();
      const pdf = buildStatementPdf([
        'Statement Balance $1234.56',
        'Minimum Payment Due $78.90',
        'Payment Due Date 07/15/2026',
        'Purchase APR 24.99%',
      ]);
      form.append('statement', new Blob([pdf], { type: 'application/pdf' }), 'statement.pdf');
      const { body } = await expectStatus(client, '/api/statements/upload', 200, {
        method: 'POST',
        token: mainUser.token,
        formData: form,
      });
      assert.equal(body.extracted.statementBalance, 1234.56);
      assert.equal(body.extracted.minimumPayment, 78.9);
      assert.equal(body.extracted.apr, 24.99);
    },
  },
  {
    name: 'POST /api/statements/upload rejects missing file',
    run: async ({ client, mainUser }) => {
      const form = new FormData();
      const { body } = await expectStatus(client, '/api/statements/upload', 400, {
        method: 'POST',
        token: mainUser.token,
        formData: form,
      });
      assert.match(body.error, /No PDF file uploaded/);
    },
  },
  {
    name: 'POST /api/statements/upload rejects non-pdf',
    run: async ({ client, mainUser }) => {
      const form = new FormData();
      form.append('statement', new Blob(['plain text'], { type: 'text/plain' }), 'statement.txt');
      const { body } = await expectStatus(client, '/api/statements/upload', 400, {
        method: 'POST',
        token: mainUser.token,
        formData: form,
      });
      assert.equal(body.error, 'Only PDF files are supported');
    },
  },
  {
    name: 'POST /api/optimizer/recommend',
    run: async (context) => {
      const { client, mainUser } = context;
      const { body } = await expectStatus(client, '/api/optimizer/recommend', 200, {
        method: 'POST',
        token: mainUser.token,
        body: { maxPayment: 200 },
      });
      context.optimizerResult = body;
      assert.ok(Array.isArray(body.plan));
      assert.ok(body.plan.length > 0);
    },
  },
  {
    name: 'POST /api/optimizer/recommend rejects users with no cards',
    run: async ({ client, noCardsUser }) => {
      const { body } = await expectStatus(client, '/api/optimizer/recommend', 400, {
        method: 'POST',
        token: noCardsUser.token,
        body: { maxPayment: 100 },
      });
      assert.match(body.error, /No credit cards available/);
    },
  },
  {
    name: 'POST /api/optimizer/recommend rejects missing maxPayment',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/optimizer/recommend', 400, {
        method: 'POST',
        token: mainUser.token,
        body: {},
      });
      assert.ok(Array.isArray(body.details));
    },
  },
  {
    name: 'POST /api/optimizer/rescue',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/optimizer/rescue', 200, {
        method: 'POST',
        token: mainUser.token,
        body: {
          paycheckDate: '2026-06-30',
          paycheckAmount: 1800,
          currentCash: 200,
          cashBuffer: 100,
          lateFeePerCard: 35,
        },
      });
      assert.ok(Array.isArray(body.actions));
      assert.ok(body.summary);
    },
  },
  {
    name: 'POST /api/optimizer/rescue rejects missing paycheckDate',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/optimizer/rescue', 400, {
        method: 'POST',
        token: mainUser.token,
        body: { paycheckAmount: 1800 },
      });
      assert.ok(Array.isArray(body.details));
    },
  },
  {
    name: 'POST /api/optimizer/simulate',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/optimizer/simulate', 200, {
        method: 'POST',
        token: mainUser.token,
        body: {
          monthlyPayment: 200,
          scenarios: [
            { name: 'Extra 50', extraMonthly: 50 },
            { name: 'Lump Sum', lumpSum: 300 },
          ],
        },
      });
      assert.ok(Array.isArray(body.scenarios));
      assert.ok(body.bestScenario);
    },
  },
  {
    name: 'POST /api/optimizer/simulate rejects empty scenarios',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/optimizer/simulate', 400, {
        method: 'POST',
        token: mainUser.token,
        body: { scenarios: [] },
      });
      assert.ok(Array.isArray(body.details));
    },
  },
  {
    name: 'POST /api/optimizer/balance-transfer',
    run: async ({ client, mainUser, primaryCardId }) => {
      const { body } = await expectStatus(client, '/api/optimizer/balance-transfer', 200, {
        method: 'POST',
        token: mainUser.token,
        body: {
          sourceCardId: primaryCardId,
          monthlyPayment: 200,
          offer: {
            promoApr: 0,
            promoMonths: 12,
            postPromoApr: 19.99,
            transferFeePct: 3,
          },
        },
      });
      assert.ok(typeof body.savings === 'number');
      assert.ok(body.recommendation);
    },
  },
  {
    name: 'POST /api/optimizer/balance-transfer rejects missing offer',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/optimizer/balance-transfer', 400, {
        method: 'POST',
        token: mainUser.token,
        body: { monthlyPayment: 200 },
      });
      assert.equal(body.error, 'offer is required');
    },
  },
  {
    name: 'POST /api/optimizer/balance-transfer rejects unknown sourceCardId',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/optimizer/balance-transfer', 404, {
        method: 'POST',
        token: mainUser.token,
        body: {
          sourceCardId: '000000000000000000000001',
          monthlyPayment: 200,
          offer: {
            promoApr: 0,
            promoMonths: 12,
            postPromoApr: 19.99,
            transferFeePct: 3,
          },
        },
      });
      assert.equal(body.error, 'Source card not found');
    },
  },
  {
    name: 'POST /api/ai/explain',
    run: async ({ client, mainUser, optimizerResult }) => {
      const { body } = await expectStatus(client, '/api/ai/explain', 200, {
        method: 'POST',
        token: mainUser.token,
        body: { kind: 'optimizer', result: optimizerResult },
      });
      assert.ok(body.explanation);
      assert.equal(body.source, 'fallback');
    },
  },
  {
    name: 'POST /api/ai/explain rejects invalid kind',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/ai/explain', 400, {
        method: 'POST',
        token: mainUser.token,
        body: { kind: 'not-real', result: { foo: 'bar' } },
      });
      assert.match(body.error, /kind must be one of/);
    },
  },
  {
    name: 'POST /api/ai/explain rejects missing result when kind is provided',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/ai/explain', 400, {
        method: 'POST',
        token: mainUser.token,
        body: { kind: 'optimizer' },
      });
      assert.equal(body.error, 'result is required when kind is provided');
    },
  },
  {
    name: 'POST /api/plaid/create-link-token',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/plaid/create-link-token', 200, {
        method: 'POST',
        token: mainUser.token,
      });
      assert.equal(body.demo, true);
    },
  },
  {
    name: 'POST /api/plaid/exchange-public-token',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/plaid/exchange-public-token', 200, {
        method: 'POST',
        token: mainUser.token,
        body: { public_token: 'demo-public-token' },
      });
      assert.equal(body.connected, true);
    },
  },
  {
    name: 'POST /api/plaid/exchange-public-token rejects missing token',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/plaid/exchange-public-token', 400, {
        method: 'POST',
        token: mainUser.token,
        body: {},
      });
      assert.equal(body.error, 'public_token is required');
    },
  },
  {
    name: 'GET /api/plaid/accounts',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/plaid/accounts', 200, {
        token: mainUser.token,
      });
      assert.ok(Array.isArray(body.accounts));
      assert.equal(body.demo, true);
    },
  },
  {
    name: 'GET /api/plaid/transactions',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/plaid/transactions', 200, {
        token: mainUser.token,
      });
      assert.ok(Array.isArray(body.transactions));
      assert.equal(body.demo, true);
    },
  },
  {
    name: 'GET /api/plaid/accounts requires auth',
    run: async ({ client }) => {
      const { body } = await expectStatus(client, '/api/plaid/accounts', 401);
      assert.equal(body.error, 'Authentication token missing');
    },
  },
  {
    name: 'GET /api/dashboard',
    run: async ({ client, demoUser }) => {
      const { body } = await expectStatus(client, '/api/dashboard', 200, {
        token: demoUser.token,
      });
      assert.ok(body.summary);
      assert.ok(Array.isArray(body.spendingVsEarning));
    },
  },
  {
    name: 'GET /api/dashboard tolerates invalid rangeDays',
    run: async ({ client, demoUser }) => {
      const { body } = await expectStatus(client, '/api/dashboard?rangeDays=9999', 200, {
        token: demoUser.token,
      });
      assert.ok(body.summary);
      assert.ok(Array.isArray(body.categorizedSpending));
    },
  },
  {
    name: 'GET /api/alerts',
    run: async ({ client, demoUser }) => {
      const { body } = await expectStatus(client, '/api/alerts', 200, {
        token: demoUser.token,
      });
      assert.ok(Array.isArray(body.alerts));
      assert.ok(body.counts);
    },
  },
  {
    name: 'GET /api/progress',
    run: async ({ client, demoUser }) => {
      const { body } = await expectStatus(client, '/api/progress', 200, {
        token: demoUser.token,
      });
      assert.ok(Array.isArray(body.history));
      assert.ok(body.history.length > 0);
    },
  },
];
