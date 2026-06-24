'use strict';

const assert = require('node:assert/strict');
const { expectStatus } = require('../helpers/http');
const { uniqueEmail } = require('../helpers/fixtures');

module.exports = [
  {
    name: 'GET /api/health',
    run: async ({ client }) => {
      const { body } = await expectStatus(client, '/api/health', 200);
      assert.equal(body.ok, true);
      assert.equal(body.dependencies.db, 'connected');
      assert.equal(body.dependencies.ai, 'fallback');
      assert.equal(body.dependencies.plaid, 'fallback');
    },
  },
  {
    name: 'GET /api/health/ready',
    run: async ({ client }) => {
      const { body } = await expectStatus(client, '/api/health/ready', 200);
      assert.equal(body.ready, true);
    },
  },
  {
    name: 'GET /api/legal/terms',
    run: async ({ client }) => {
      const { body } = await expectStatus(client, '/api/legal/terms', 200);
      assert.ok(body.title);
    },
  },
  {
    name: 'GET /api/legal/privacy',
    run: async ({ client }) => {
      const { body } = await expectStatus(client, '/api/legal/privacy', 200);
      assert.ok(body.title);
    },
  },
  {
    name: 'GET /api/help',
    run: async ({ client }) => {
      const { body } = await expectStatus(client, '/api/help', 200);
      assert.ok(Array.isArray(body.articles));
      assert.ok(body.articles.length > 0);
    },
  },
  {
    name: 'GET unknown route returns structured 404',
    run: async ({ client }) => {
      const { body } = await expectStatus(client, '/api/does-not-exist', 404);
      assert.match(body.error, /Route not found/);
    },
  },
  {
    name: 'POST /api/auth/signup',
    run: async ({ client }) => {
      const email = uniqueEmail('route-signup');
      const { body } = await expectStatus(client, '/api/auth/signup', 201, {
        method: 'POST',
        body: { name: 'Route Signup', email, password: 'Manual1234!' },
      });
      assert.equal(body.user.email, email);
      assert.ok(body.token);
    },
  },
  {
    name: 'POST /api/auth/signup rejects invalid payload',
    run: async ({ client }) => {
      const { body } = await expectStatus(client, '/api/auth/signup', 400, {
        method: 'POST',
        body: { name: '', email: 'bad', password: '123' },
      });
      assert.ok(Array.isArray(body.details));
    },
  },
  {
    name: 'POST /api/auth/signup rejects duplicate email',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/auth/signup', 409, {
        method: 'POST',
        body: { name: 'Dup', email: mainUser.email, password: 'Manual1234!' },
      });
      assert.match(body.error, /already exists/);
    },
  },
  {
    name: 'POST /api/auth/login',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/auth/login', 200, {
        method: 'POST',
        body: { email: mainUser.email, password: mainUser.password },
      });
      assert.equal(body.user.email, mainUser.email);
      assert.ok(body.token);
    },
  },
  {
    name: 'POST /api/auth/login rejects bad password',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/auth/login', 401, {
        method: 'POST',
        body: { email: mainUser.email, password: 'WrongPass123!' },
      });
      assert.equal(body.error, 'Invalid email or password');
    },
  },
  {
    name: 'POST /api/auth/login rejects missing password',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/auth/login', 400, {
        method: 'POST',
        body: { email: mainUser.email },
      });
      assert.ok(Array.isArray(body.details));
    },
  },
];
