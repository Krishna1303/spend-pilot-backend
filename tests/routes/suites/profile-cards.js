'use strict';

const assert = require('node:assert/strict');
const { expectStatus } = require('../helpers/http');

module.exports = [
  {
    name: 'GET /api/profile',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/profile', 200, {
        token: mainUser.token,
      });
      assert.equal(body.user.email, mainUser.email);
    },
  },
  {
    name: 'GET /api/profile requires auth',
    run: async ({ client }) => {
      const { body } = await expectStatus(client, '/api/profile', 401);
      assert.equal(body.error, 'Authentication token missing');
    },
  },
  {
    name: 'GET /api/profile rejects malformed token',
    run: async ({ client }) => {
      const { body } = await expectStatus(client, '/api/profile', 401, {
        headers: { authorization: 'Bearer not-a-real-jwt' },
      });
      assert.equal(body.error, 'Invalid or expired token');
    },
  },
  {
    name: 'PATCH /api/profile',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/profile', 200, {
        method: 'PATCH',
        token: mainUser.token,
        body: { name: 'Route Main Updated', mobile: '555-0100', subscriptionPlan: 'pro' },
      });
      assert.equal(body.user.name, 'Route Main Updated');
      assert.equal(body.user.subscriptionPlan, 'pro');
    },
  },
  {
    name: 'PATCH /api/profile rejects duplicate email',
    run: async ({ client, mainUser, altUser }) => {
      const { body } = await expectStatus(client, '/api/profile', 409, {
        method: 'PATCH',
        token: mainUser.token,
        body: { email: altUser.email },
      });
      assert.match(body.error, /already exists/);
    },
  },
  {
    name: 'DELETE /api/profile rejects wrong password',
    run: async ({ client, deleteUser }) => {
      const { body } = await expectStatus(client, '/api/profile', 401, {
        method: 'DELETE',
        token: deleteUser.token,
        body: { password: 'WrongPass123!' },
      });
      assert.equal(body.error, 'Password is incorrect');
    },
  },
  {
    name: 'DELETE /api/profile rejects missing password',
    run: async ({ client, deleteUser }) => {
      const { body } = await expectStatus(client, '/api/profile', 400, {
        method: 'DELETE',
        token: deleteUser.token,
        body: {},
      });
      assert.ok(Array.isArray(body.details));
    },
  },
  {
    name: 'DELETE /api/profile',
    run: async ({ client, deleteUser }) => {
      const { body } = await expectStatus(client, '/api/profile', 200, {
        method: 'DELETE',
        token: deleteUser.token,
        body: { password: deleteUser.password },
      });
      assert.equal(body.deleted, true);
    },
  },
  {
    name: 'GET /api/cards',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/cards', 200, {
        token: mainUser.token,
      });
      assert.ok(Array.isArray(body.cards));
    },
  },
  {
    name: 'POST /api/cards creates credit and debit cards',
    run: async (context) => {
      const { client, mainUser } = context;
      const creditResponse = await expectStatus(client, '/api/cards', 201, {
        method: 'POST',
        token: mainUser.token,
        body: {
          bankName: 'Test Bank',
          cardName: 'Primary Credit',
          cardType: 'credit',
          balance: 1200,
          apr: 21.99,
          minimumPayment: 65,
          creditLimit: 4000,
        },
      });
      context.primaryCardId = creditResponse.body.card.id;
      assert.equal(creditResponse.body.card.cardType, 'credit');

      const debitResponse = await expectStatus(client, '/api/cards', 201, {
        method: 'POST',
        token: mainUser.token,
        body: {
          bankName: 'Test Bank',
          cardName: 'Primary Debit',
          cardType: 'debit',
          balance: 75,
          minimumPayment: 0,
        },
      });
      context.debitCardId = debitResponse.body.card.id;
      assert.equal(debitResponse.body.card.cardType, 'debit');
    },
  },
  {
    name: 'POST /api/cards rejects negative balance',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/cards', 400, {
        method: 'POST',
        token: mainUser.token,
        body: {
          cardName: 'Bad Card',
          balance: -1,
        },
      });
      assert.ok(Array.isArray(body.details));
    },
  },
  {
    name: 'GET /api/cards filters by type',
    run: async ({ client, mainUser, primaryCardId }) => {
      const { body } = await expectStatus(client, '/api/cards?type=credit', 200, {
        token: mainUser.token,
      });
      assert.ok(body.cards.some((card) => card.id === primaryCardId));
      assert.ok(body.cards.every((card) => card.cardType === 'credit'));
    },
  },
  {
    name: 'GET /api/cards rejects invalid type filter',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/cards?type=prepaid', 400, {
        token: mainUser.token,
      });
      assert.match(body.error, /type must be/);
    },
  },
  {
    name: 'POST /api/cards/sync',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/cards/sync', 200, {
        method: 'POST',
        token: mainUser.token,
        body: {},
      });
      assert.equal(body.reason, 'no-plaid-connection');
    },
  },
  {
    name: 'GET /api/cards/:id rejects invalid id format',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/cards/not-an-id', 400, {
        token: mainUser.token,
      });
      assert.match(body.error, /Invalid/);
    },
  },
  {
    name: 'GET /api/cards/:id',
    run: async ({ client, mainUser, primaryCardId }) => {
      const { body } = await expectStatus(client, `/api/cards/${primaryCardId}`, 200, {
        token: mainUser.token,
      });
      assert.equal(body.card.id, primaryCardId);
    },
  },
  {
    name: 'GET /api/cards/:id enforces ownership',
    run: async ({ client, altUser, primaryCardId }) => {
      const { body } = await expectStatus(client, `/api/cards/${primaryCardId}`, 404, {
        token: altUser.token,
      });
      assert.equal(body.error, 'Card not found');
    },
  },
  {
    name: 'PATCH /api/cards/:id',
    run: async ({ client, mainUser, primaryCardId }) => {
      const { body } = await expectStatus(client, `/api/cards/${primaryCardId}`, 200, {
        method: 'PATCH',
        token: mainUser.token,
        body: { balance: 950, apr: 18.5, cardName: 'Primary Credit Updated' },
      });
      assert.equal(body.card.balance, 950);
      assert.equal(body.card.cardName, 'Primary Credit Updated');
    },
  },
  {
    name: 'PATCH /api/cards/:id rejects negative APR',
    run: async ({ client, mainUser, primaryCardId }) => {
      const { body } = await expectStatus(client, `/api/cards/${primaryCardId}`, 400, {
        method: 'PATCH',
        token: mainUser.token,
        body: { apr: -10 },
      });
      assert.match(body.error, /Validation failed/);
    },
  },
  {
    name: 'DELETE /api/cards/:id',
    run: async ({ client, mainUser, debitCardId }) => {
      const { body } = await expectStatus(client, `/api/cards/${debitCardId}`, 200, {
        method: 'DELETE',
        token: mainUser.token,
      });
      assert.equal(body.deleted, true);
    },
  },
];
