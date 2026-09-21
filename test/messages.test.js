import test from 'node:test';
import assert from 'node:assert/strict';
import { localeError, messageFor, publicMessage, requestLanguage } from '../lib/messages.js';
import { createProgressStore } from '../lib/progress.js';
import { resolveMaxComments, DEFAULT_MAX_COMMENTS, MAX_COMMENTS_CEILING } from '../lib/limits.js';
import analyze from '../api/analyze.js';

test('upstream error text never reaches the client', () => {
  const upstream = new Error('Quota exceeded for project 1234 at collector https://internal.example/x');
  assert.equal(publicMessage(upstream, 'ko'), messageFor('unknown', 'ko'));
  assert.equal(publicMessage(upstream, 'en'), messageFor('unknown', 'en'));
  // An unrecognised code is treated the same as no code at all.
  const spoofed = Object.assign(new Error('internal detail'), { code: 'not_a_real_code' });
  assert.equal(publicMessage(spoofed, 'en'), messageFor('unknown', 'en'));
});

test('known codes keep their message and interpolate parameters', () => {
  const error = localeError('youtube_request_failed', { status: 429, params: { status: 429 } });
  assert.equal(error.status, 429);
  assert.match(publicMessage(error, 'ko'), /429/);
  assert.match(publicMessage(error, 'en'), /The YouTube request failed \(429\)/);
});

test('language follows the requested analysis language, then Accept-Language', () => {
  assert.equal(requestLanguage({ headers: {} }, { analysisLanguage: 'en' }), 'en');
  assert.equal(requestLanguage({ headers: { 'accept-language': 'en-US,en;q=0.9' } }, { analysisLanguage: 'ko' }), 'ko');
  assert.equal(requestLanguage({ headers: { 'accept-language': 'en-US,en;q=0.9' } }), 'en');
  assert.equal(requestLanguage({ headers: { 'accept-language': 'ko-KR,ko;q=0.9' } }), 'ko');
  assert.equal(requestLanguage({ headers: {} }), 'ko');
});

test('an English visitor gets English errors from the hosted endpoint', async () => {
  const response = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
  await analyze({
    method: 'POST',
    headers: { 'x-jev-api-key': 'visitor-test-key', 'accept-language': 'en-GB,en;q=0.9' },
    body: { url: 'not-a-youtube-link', analysisLanguage: 'en' }
  }, response);
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error, messageFor('invalid_url', 'en'));
});

test('the visitor key prompt follows Accept-Language', async () => {
  const response = { headers: {}, setHeader(name, value) { this.headers[name] = value; }, end(body) { this.body = body; } };
  await analyze({ method: 'POST', headers: { 'accept-language': 'fr-FR,fr;q=0.9' } }, response);
  assert.equal(response.statusCode, 401);
  assert.equal(JSON.parse(response.body).error, messageFor('visitor_key_required', 'en'));
});

test('progress entries expire and the store stays bounded', () => {
  let clock = 0;
  const store = createProgressStore({ ttlMs: 1000, limit: 3, now: () => clock });
  store.set('job-1', { percent: 10 });
  assert.equal(store.get('job-1').percent, 10);

  clock = 1001;
  assert.equal(store.get('job-1'), null, 'an expired entry is not returned');

  clock = 2000;
  for (const id of ['a', 'b', 'c', 'd', 'e']) store.set(id, { percent: 1 });
  assert.equal(store.size, 3, 'the store never grows past its limit');
  assert.equal(store.get('a'), null, 'the oldest entries are dropped first');
  assert.equal(store.get('e').percent, 1);

  // Re-reporting the same job must not create a second entry.
  store.set('e', { percent: 2 });
  assert.equal(store.size, 3);
  assert.equal(store.get('e').percent, 2);
});

test('the comment cap defaults to the documented value and is bounded', () => {
  assert.equal(resolveMaxComments({}), DEFAULT_MAX_COMMENTS);
  assert.equal(resolveMaxComments({ MAX_COMMENTS: 'not-a-number' }), DEFAULT_MAX_COMMENTS);
  assert.equal(resolveMaxComments({ MAX_COMMENTS: '500' }), 500);
  assert.equal(resolveMaxComments({ MAX_COMMENTS: '5' }), 100);
  assert.equal(resolveMaxComments({ MAX_COMMENTS: '999999999' }), MAX_COMMENTS_CEILING);
});
