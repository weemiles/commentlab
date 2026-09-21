import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeVideo } from '../lib/analyze-video.js';

test('a configured Jev failure is never published as local neutral results', async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = 'offline-test-only';
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({}, { status: 401 }); };
  try {
    await assert.rejects(analyzeVideo({ demo: true }), /Jev 분석을 완료하지 못했습니다/);
    assert.ok(calls > 0 && calls <= 4, 'authentication failures do not trigger extra retries');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previousKey;
  }
});
