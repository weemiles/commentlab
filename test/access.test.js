import test from 'node:test';
import assert from 'node:assert/strict';
import { accessStatus } from '../lib/access.js';
import analyze from '../api/analyze.js';
import collect from '../api/collect.js';
test('hosted handlers reject before reading a body or calling providers', async () => {
  const previous = process.env.COMMENTLAB_ACCESS_TOKEN;
  process.env.COMMENTLAB_ACCESS_TOKEN = 'offline-test-only';
  try {
    for (const handler of [analyze, collect]) {
      const request = { method: 'POST', headers: {}, get body() { assert.fail('unauthorized body must not be read'); } };
      const response = { setHeader() {}, end(body) { this.body = body; } };
      await handler(request, response);
      assert.equal(response.statusCode, 401);
    }
  } finally {
    if (previous === undefined) delete process.env.COMMENTLAB_ACCESS_TOKEN;
    else process.env.COMMENTLAB_ACCESS_TOKEN = previous;
  }
});
test('hosted APIs fail closed and require the configured site password', () => {
  const request = { headers: {} };
  assert.equal(accessStatus(request, {}), 0);
  for (const env of [{ VERCEL: '1' }, { RENDER: 'true' }, { HOST: '0.0.0.0' }, { NODE_ENV: 'production' }]) {
    assert.equal(accessStatus(request, env), 503);
    const configured = { ...env, COMMENTLAB_ACCESS_TOKEN: 'test-secret' };
    assert.equal(accessStatus(request, configured), 401);
    assert.equal(accessStatus({ headers: { authorization: 'Bearer wrong' } }, configured), 401);
    assert.equal(accessStatus({ headers: { authorization: 'Bearer test-secret' } }, configured), 0);
  }
});
