'use strict';

const assert = require('node:assert/strict');
const { expectStatus } = require('../helpers/http');
const totp = require('../../../src/services/totp.service');

module.exports = [
  {
    name: 'POST /api/chatbot/ask',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/chatbot/ask', 200, {
        method: 'POST',
        token: mainUser.token,
        body: { question: 'How does the debt optimizer choose a card?' },
      });
      assert.ok(body.answer);
      assert.equal(typeof body.escalatable, 'boolean');
    },
  },
  {
    name: 'POST /api/chatbot/ask rejects empty question',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/chatbot/ask', 400, {
        method: 'POST',
        token: mainUser.token,
        body: { question: '' },
      });
      assert.ok(Array.isArray(body.details));
    },
  },
  {
    name: 'POST /api/support/tickets',
    run: async (context) => {
      const { client, mainUser } = context;
      const { body } = await expectStatus(client, '/api/support/tickets', 201, {
        method: 'POST',
        token: mainUser.token,
        body: {
          subject: 'Need help with optimizer',
          message: 'Why is my highest APR card prioritized?',
        },
      });
      context.supportTicketId = body.ticket.id;
      assert.equal(body.ticket.subject, 'Need help with optimizer');
    },
  },
  {
    name: 'POST /api/support/tickets rejects invalid payload',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/support/tickets', 400, {
        method: 'POST',
        token: mainUser.token,
        body: { subject: '', message: '' },
      });
      assert.ok(Array.isArray(body.details));
    },
  },
  {
    name: 'GET /api/support/tickets',
    run: async ({ client, mainUser, supportTicketId }) => {
      const { body } = await expectStatus(client, '/api/support/tickets', 200, {
        token: mainUser.token,
      });
      assert.ok(Array.isArray(body.tickets));
      assert.ok(body.tickets.some((ticket) => ticket.id === supportTicketId));
    },
  },
  {
    name: 'POST /api/support/escalate',
    run: async (context) => {
      const { client, mainUser } = context;
      const { body } = await expectStatus(client, '/api/support/escalate', 201, {
        method: 'POST',
        token: mainUser.token,
        body: {
          subject: 'Need human review',
          message: 'Please review my plan.',
          transcript: [
            { sender: 'bot', body: 'I can help explain the plan.' },
            { sender: 'user', body: 'I still need a person.' },
          ],
        },
      });
      context.escalatedTicketId = body.ticket.id;
      assert.equal(body.adminNotified, false);
      assert.equal(body.fallback, true);
    },
  },
  {
    name: 'POST /api/support/escalate rejects invalid payload',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/support/escalate', 400, {
        method: 'POST',
        token: mainUser.token,
        body: { subject: '', message: '' },
      });
      assert.ok(Array.isArray(body.details));
    },
  },
  {
    name: 'GET /api/support/tickets/:id',
    run: async ({ client, mainUser, supportTicketId }) => {
      const { body } = await expectStatus(client, `/api/support/tickets/${supportTicketId}`, 200, {
        token: mainUser.token,
      });
      assert.equal(body.ticket.id, supportTicketId);
    },
  },
  {
    name: 'GET /api/support/tickets/:id enforces ownership',
    run: async ({ client, altUser, supportTicketId }) => {
      const { body } = await expectStatus(client, `/api/support/tickets/${supportTicketId}`, 404, {
        token: altUser.token,
      });
      assert.equal(body.error, 'Ticket not found');
    },
  },
  {
    name: 'POST /api/support/tickets/:id/messages',
    run: async ({ client, mainUser, supportTicketId }) => {
      const { body } = await expectStatus(client, `/api/support/tickets/${supportTicketId}/messages`, 200, {
        method: 'POST',
        token: mainUser.token,
        body: { message: 'Following up on the optimizer behavior.' },
      });
      assert.ok(body.ticket.messages.length >= 2);
      assert.equal(body.adminNotified, false);
    },
  },
  {
    name: 'POST /api/support/tickets/:id/messages rejects invalid payload',
    run: async ({ client, mainUser, supportTicketId }) => {
      const { body } = await expectStatus(client, `/api/support/tickets/${supportTicketId}/messages`, 400, {
        method: 'POST',
        token: mainUser.token,
        body: { message: '' },
      });
      assert.ok(Array.isArray(body.details));
    },
  },
  {
    name: 'POST /api/support/tickets/:id/messages rejects unknown ticket',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/support/tickets/000000000000000000000001/messages', 404, {
        method: 'POST',
        token: mainUser.token,
        body: { message: 'Hello?' },
      });
      assert.equal(body.error, 'Ticket not found');
    },
  },
  {
    name: 'GET /api/admin/totp/status',
    run: async ({ client, adminUser }) => {
      const { body } = await expectStatus(client, '/api/admin/totp/status', 200, {
        token: adminUser.token,
      });
      assert.equal(body.required, true);
    },
  },
  {
    name: 'GET /api/admin/users rejects non-admin user',
    run: async ({ client, mainUser }) => {
      const { body } = await expectStatus(client, '/api/admin/users', 403, {
        token: mainUser.token,
      });
      assert.equal(body.error, 'Admin access required');
    },
  },
  {
    name: 'POST /api/admin/totp/setup',
    run: async (context) => {
      const { client, adminUser } = context;
      const { body } = await expectStatus(client, '/api/admin/totp/setup', 200, {
        method: 'POST',
        token: adminUser.token,
      });
      context.totpSecret = body.secret;
      assert.ok(body.otpauthUrl);
    },
  },
  {
    name: 'POST /api/admin/totp/verify rejects before enable',
    run: async ({ client, adminUser, totpSecret }) => {
      const { body } = await expectStatus(client, '/api/admin/totp/verify', 400, {
        method: 'POST',
        token: adminUser.token,
        body: { token: totp.generate(totpSecret) },
      });
      assert.equal(body.error, 'TOTP is not set up');
    },
  },
  {
    name: 'POST /api/admin/totp/enable rejects invalid token',
    run: async ({ client, adminUser }) => {
      const { body } = await expectStatus(client, '/api/admin/totp/enable', 401, {
        method: 'POST',
        token: adminUser.token,
        body: { token: '000000' },
      });
      assert.equal(body.error, 'Invalid authenticator code');
    },
  },
  {
    name: 'POST /api/admin/totp/enable',
    run: async ({ client, adminUser, totpSecret }) => {
      const { body } = await expectStatus(client, '/api/admin/totp/enable', 200, {
        method: 'POST',
        token: adminUser.token,
        body: { token: totp.generate(totpSecret) },
      });
      assert.equal(body.enabled, true);
    },
  },
  {
    name: 'GET /api/admin/users requires CRM step-up',
    run: async ({ client, adminUser }) => {
      const { body } = await expectStatus(client, '/api/admin/users', 401, {
        token: adminUser.token,
      });
      assert.match(body.error, /CRM step-up required/);
    },
  },
  {
    name: 'POST /api/admin/totp/verify',
    run: async (context) => {
      const { client, adminUser, totpSecret } = context;
      const { body } = await expectStatus(client, '/api/admin/totp/verify', 200, {
        method: 'POST',
        token: adminUser.token,
        body: { token: totp.generate(totpSecret) },
      });
      context.crmToken = body.crmToken;
      assert.ok(body.crmToken);
    },
  },
  {
    name: 'GET /api/admin/users',
    run: async ({ client, crmToken, mainUser }) => {
      const { body } = await expectStatus(client, '/api/admin/users', 200, {
        token: crmToken,
      });
      assert.ok(Array.isArray(body.users));
      assert.ok(body.users.some((user) => user.id === mainUser.user.id));
    },
  },
  {
    name: 'GET /api/admin/users/:id',
    run: async ({ client, crmToken, mainUser }) => {
      const { body } = await expectStatus(client, `/api/admin/users/${mainUser.user.id}`, 200, {
        token: crmToken,
      });
      assert.equal(body.user.id, mainUser.user.id);
    },
  },
  {
    name: 'GET /api/admin/users/:id rejects invalid id format',
    run: async ({ client, crmToken }) => {
      const { body } = await expectStatus(client, '/api/admin/users/not-an-id', 400, {
        token: crmToken,
      });
      assert.match(body.error, /Invalid/);
    },
  },
  {
    name: 'PATCH /api/admin/users/:id',
    run: async ({ client, crmToken, mainUser }) => {
      const { body } = await expectStatus(client, `/api/admin/users/${mainUser.user.id}`, 200, {
        method: 'PATCH',
        token: crmToken,
        body: { mobile: '555-0199', subscriptionPlan: 'enterprise' },
      });
      assert.equal(body.user.subscriptionPlan, 'enterprise');
    },
  },
  {
    name: 'PATCH /api/admin/users/:id rejects duplicate email',
    run: async ({ client, crmToken, mainUser, adminUser }) => {
      const { body } = await expectStatus(client, `/api/admin/users/${mainUser.user.id}`, 409, {
        method: 'PATCH',
        token: crmToken,
        body: { email: adminUser.user.email },
      });
      assert.match(body.error, /already exists/);
    },
  },
  {
    name: 'PATCH /api/admin/users/:id blocks self-demotion',
    run: async ({ client, crmToken, adminUser }) => {
      const { body } = await expectStatus(client, `/api/admin/users/${adminUser.user.id}`, 403, {
        method: 'PATCH',
        token: crmToken,
        body: { role: 'user' },
      });
      assert.equal(body.error, 'You cannot remove your own admin role');
    },
  },
  {
    name: 'DELETE /api/admin/users/:id',
    run: async ({ client, crmToken, altUser }) => {
      const { body } = await expectStatus(client, `/api/admin/users/${altUser.user.id}`, 200, {
        method: 'DELETE',
        token: crmToken,
      });
      assert.equal(body.deleted, true);
    },
  },
  {
    name: 'DELETE /api/admin/users/:id blocks self-delete',
    run: async ({ client, crmToken, adminUser }) => {
      const { body } = await expectStatus(client, `/api/admin/users/${adminUser.user.id}`, 403, {
        method: 'DELETE',
        token: crmToken,
      });
      assert.match(body.error, /Delete your own account/);
    },
  },
  {
    name: 'GET /api/admin/tickets',
    run: async ({ client, crmToken, escalatedTicketId }) => {
      const { body } = await expectStatus(client, '/api/admin/tickets', 200, {
        token: crmToken,
      });
      assert.ok(Array.isArray(body.tickets));
      assert.ok(body.tickets.some((ticket) => ticket.id === escalatedTicketId));
    },
  },
  {
    name: 'PATCH /api/admin/tickets/:id',
    run: async ({ client, crmToken, escalatedTicketId }) => {
      const { body } = await expectStatus(client, `/api/admin/tickets/${escalatedTicketId}`, 200, {
        method: 'PATCH',
        token: crmToken,
        body: { status: 'pending', reply: 'We are reviewing your account now.' },
      });
      assert.equal(body.ticket.status, 'pending');
      assert.equal(body.userNotified, false);
    },
  },
  {
    name: 'PATCH /api/admin/tickets/:id rejects invalid status',
    run: async ({ client, crmToken, escalatedTicketId }) => {
      const { body } = await expectStatus(client, `/api/admin/tickets/${escalatedTicketId}`, 400, {
        method: 'PATCH',
        token: crmToken,
        body: { status: 'closed' },
      });
      assert.match(body.error, /status must be open, pending, or resolved/);
    },
  },
  {
    name: 'PATCH /api/admin/tickets/:id rejects unknown ticket',
    run: async ({ client, crmToken }) => {
      const { body } = await expectStatus(client, '/api/admin/tickets/000000000000000000000001', 404, {
        method: 'PATCH',
        token: crmToken,
        body: { status: 'pending' },
      });
      assert.equal(body.error, 'Ticket not found');
    },
  },
  {
    name: 'GET /api/cron/card-sync rejects missing secret',
    run: async ({ client }) => {
      const { body } = await expectStatus(client, '/api/cron/card-sync', 401);
      assert.equal(body.error, 'Invalid cron credentials');
    },
  },
  {
    name: 'GET /api/cron/card-sync',
    run: async ({ client }) => {
      const { body } = await expectStatus(client, '/api/cron/card-sync', 200, {
        headers: { authorization: 'Bearer test-cron-secret' },
      });
      assert.equal(body.ok, true);
    },
  },
  {
    name: 'GET /api/cron/alerts-digest rejects wrong secret',
    run: async ({ client }) => {
      const { body } = await expectStatus(client, '/api/cron/alerts-digest', 401, {
        headers: { authorization: 'Bearer wrong-secret' },
      });
      assert.equal(body.error, 'Invalid cron credentials');
    },
  },
  {
    name: 'GET /api/cron/alerts-digest',
    run: async ({ client }) => {
      const { body } = await expectStatus(client, '/api/cron/alerts-digest', 200, {
        headers: { authorization: 'Bearer test-cron-secret' },
      });
      assert.equal(body.ok, true);
    },
  },
];
