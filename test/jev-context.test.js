import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySentimentWithJev } from '../lib/jev-sentiment.js';

test('Jev receives video, parent, missing-context flag and closing negation independently of other comments', async () => {
  process.env.TYPESAFE_API_KEY = 'test-only';
  const comments = [
    { id: 'p', text: '참 잘한다. 또 약속 어겼네' },
    { id: 'r', parentId: 'p', text: '그러게 말이에요' },
    { id: 'orphan', parentId: 'missing', text: '정말요?' },
    { id: 'long', text: '잘했네'.repeat(1500) + '라고 할 줄 알았지? 전혀 아니다.' }
  ];
  const result = await classifySentimentWithJev(comments, {
    video: { title: '약속 불이행 논란', channel: '뉴스' },
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.state.video.title, '약속 불이행 논란');
      assert.match(body.state.context_rules, /Sarcasm needs contextual evidence/);
      assert.equal(body.questions.comment_1.instructions.parent_comment, comments[0].text);
      assert.equal(body.questions.comment_2.instructions.parent_context_missing, true);
      assert.match(body.questions.comment_3.instructions.comment, /전혀 아니다\.$/);
      assert.equal(body.questions.comment_0.instructions.parent_comment, null);
      return Response.json({ answers: Object.fromEntries(comments.map((_, i) => [`comment_${i}`, { choice: 'negative', probabilities: { negative: 0.9 } }])) });
    }
  });
  assert.equal(result.sentiments.length, comments.length);
  delete process.env.TYPESAFE_API_KEY;
});
