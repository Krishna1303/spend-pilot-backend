'use strict';

const assert = require('node:assert/strict');

function createClient(baseUrl) {
  async function request(path, options = {}) {
    const {
      method = 'GET',
      token,
      headers = {},
      body,
      formData,
    } = options;

    const finalHeaders = { ...headers };
    const init = { method, headers: finalHeaders };

    if (token) finalHeaders.authorization = `Bearer ${token}`;

    if (formData) {
      init.body = formData;
    } else if (body !== undefined) {
      finalHeaders['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    const response = await fetch(`${baseUrl}${path}`, init);
    const text = await response.text();
    let payload = text;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    return { status: response.status, body: payload, headers: response.headers };
  }

  return { request };
}

async function expectStatus(client, path, expectedStatus, options = {}) {
  const response = await client.request(path, options);
  assert.equal(
    response.status,
    expectedStatus,
    `Expected ${expectedStatus} for ${options.method || 'GET'} ${path}, received ${response.status}: ${JSON.stringify(response.body)}`
  );
  return response;
}

module.exports = { createClient, expectStatus };
