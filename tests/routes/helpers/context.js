'use strict';

const { expectStatus } = require('./http');
const { uniqueEmail } = require('./fixtures');

async function signupUser(client, prefix, password = 'Manual1234!') {
  const email = uniqueEmail(prefix);
  const response = await expectStatus(client, '/api/auth/signup', 201, {
    method: 'POST',
    body: { name: prefix, email, password },
  });
  return {
    email,
    password,
    token: response.body.token,
    user: response.body.user,
  };
}

async function loginUser(client, email, password) {
  const response = await expectStatus(client, '/api/auth/login', 200, {
    method: 'POST',
    body: { email, password },
  });
  return {
    token: response.body.token,
    user: response.body.user,
  };
}

async function buildContext(client) {
  const mainUser = await signupUser(client, 'route-main');
  const altUser = await signupUser(client, 'route-alt');
  const noCardsUser = await signupUser(client, 'route-no-cards');
  const deleteUser = await signupUser(client, 'route-delete');
  const demoUser = await loginUser(client, 'demo@spendpilot.app', 'Demo1234!');
  const adminUser = await loginUser(client, 'admin@spendpilot.app', 'Admin1234!');

  return {
    client,
    mainUser,
    altUser,
    noCardsUser,
    deleteUser,
    demoUser,
    adminUser,
    optimizerResult: null,
    primaryCardId: null,
    debitCardId: null,
    supportTicketId: null,
    escalatedTicketId: null,
    totpSecret: null,
    crmToken: null,
  };
}

module.exports = { signupUser, loginUser, buildContext };
