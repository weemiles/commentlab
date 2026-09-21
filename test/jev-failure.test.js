import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeVideo } from '../lib/analyze-video.js';

test('a provider failure is never published as local neutral results', async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({}, { status: 401 }); };
  try {
    await assert.rejects(analyzeVideo({ demo: true }, { apiKey: 'offline-test-only' }), /Jev 분석을 완료하지 못했습니다/);
    assert.ok(calls > 0 && calls <= 4, 'authentication failures do not trigger extra retries');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('a missing key fails the request instead of falling back to keyword labels', async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({}); };
  try {
    await assert.rejects(analyzeVideo({ demo: true }), /Jev 분석을 완료하지 못했습니다/);
    assert.equal(calls, 0, 'no provider call is made without a key');
  } finally {
    globalThis.fetch = previousFetch;
  }
});
