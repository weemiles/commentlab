import test from 'node:test';
import assert from 'node:assert/strict';
import { transcriptContext } from '../lib/video-transcript.js';
import { selectTranscriptContext } from '../lib/transcript-context.js';
import { classifySentimentWithJev } from '../lib/jev-sentiment.js';

test('middle evidence reaches the actual classification request within its budget', async () => {
  const text = 'Opening context. '.repeat(2200) + '중간 핵심: 식품안전처 유착 의혹은 확인된 사실이 아니라는 설명입니다.' + ' Closing context.'.repeat(2400);
  const context = transcriptContext(text);
  assert.ok(context.text.includes('식품안전처'));
  const comments = [{ id: 'c', text: '식품안전처 유착 의혹이라는 부분은 확인된 사실인가요?' }];
  await classifySentimentWithJev(comments, { apiKey: 'offline', videoContext: context, fetchImpl: async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.match(body.state.video_content.transcript, /확인된 사실이 아니라는 설명/);
    assert.ok(body.state.video_content.transcript.length <= 24000);
    assert.equal(body.state.video_content.partial, true);
    return Response.json({ answers: { comment_0: { choice: 'neutral' }, reason_0: { choice: 'information' } } });
  } });
});

test('short context stays intact and long context samples the whole timeline without matching words', () => {
  assert.deepEqual(selectTranscriptContext({ text: 'short' }), { text: 'short', partial: false });
  const source = Array.from({ length: 80 }, (_, i) => `segment-${i}:` + '가'.repeat(980)).join(' ');
  const result = selectTranscriptContext({ text: source }, [{ text: 'unrelated' }]);
  assert.ok(result.text.length <= 24000);
  assert.match(result.text, /segment-0:/);
  assert.match(result.text, /segment-79:/);
  assert.ok(result.text.includes('segment-34:') || result.text.includes('segment-35:'));
  assert.equal(result.partial, true);
  const bounded = transcriptContext('x'.repeat(1_000_001));
  assert.equal(bounded.text.length, 1_000_000);
  assert.equal(bounded.partial, true);
});
