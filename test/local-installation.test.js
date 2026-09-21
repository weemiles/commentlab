import test from 'node:test';
import assert from 'node:assert/strict';
import { localInstallationKey } from '../lib/access.js';
const env = { TYPESAFE_API_KEY: 'test-local-key-123', HOST: '127.0.0.1' };
const req = { headers: { host: '127.0.0.1:4173', origin: 'http://127.0.0.1:4173' }, socket: { remoteAddress: '127.0.0.1' } };
test('local installer key is restricted to loopback and same-origin requests', () => {
  assert.equal(localInstallationKey(req, env), env.TYPESAFE_API_KEY);
  for (const change of [{ VERCEL: '1' }, { RENDER: 'true' }, { HOST: '0.0.0.0' }]) assert.equal(localInstallationKey(req, { ...env, ...change }), null);
  assert.equal(localInstallationKey({ ...req, socket: { remoteAddress: '192.168.0.2' } }, env), null);
  assert.equal(localInstallationKey({ ...req, headers: { ...req.headers, origin: 'https://example.com' } }, env), null);
  assert.equal(localInstallationKey({ ...req, headers: { host: 'evil.example:4173' } }, env), null);
  assert.equal(localInstallationKey({ ...req, headers: { ...req.headers, 'sec-fetch-site': 'cross-site' } }, env), null);
});
