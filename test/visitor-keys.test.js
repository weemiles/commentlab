import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySentimentWithJev } from '../lib/jev-sentiment.js';
import { analyzeVideo } from '../lib/analyze-video.js';

test('visitor key takes precedence and never contaminates another request', async () => {
  const seen = [];
  const fetchImpl = async (_url, options) => {
    seen.push(options.headers.authorization);
    return Response.json({ answers: { comment_0: { choice: 'negative' }, reason_0: { choice: 'abuse' } } });
  };
  const comments = [{ id: 'c', text: 'Synthetic example' }];
  await Promise.all(['visitor-one-key', 'visitor-two-key'].map(apiKey => classifySentimentWithJev(comments, { apiKey, fetchImpl })));
  assert.deepEqual(new Set(seen), new Set(['Bearer visitor-one-key', 'Bearer visitor-two-key']));
});

test('visitor jobs do not share cached results or in-flight provider credentials', async () => {
  const original = globalThis.fetch;
  const seen = new Set();
  globalThis.fetch = async (_url, options) => {
    seen.add(options.headers.authorization);
    const body = JSON.parse(options.body);
    return Response.json({ answers: Object.fromEntries(Object.keys(body.questions).map(key => [key, { choice: key.startsWith('reason_') ? 'information' : 'neutral' }])) });
  };
  try {
    await Promise.all(['visitor-a-key', 'visitor-b-key'].map(apiKey => analyzeVideo({ demo: true, maxComments: 100 }, { apiKey })));
    assert.deepEqual(seen, new Set(['Bearer visitor-a-key', 'Bearer visitor-b-key']));
  } finally { globalThis.fetch = original; }
});
