import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySentimentWithJev, prepareConversationContext } from '../lib/jev-sentiment.js';

test('tagged context stays within the thread and marks ambiguity and missing references', () => {
  const comments = [
    { id: 'root', author: '@root', text: '원문' },
    { id: 'a', parentId: 'root', author: '@alice', text: '근거를 제시해주세요' },
    { id: 'b', parentId: 'root', author: '@bob', text: '@alice 동의합니다' },
    { id: 'other', author: '@alice', text: '다른 대화 내용' },
    { id: 'c', parentId: 'root', author: '@carol', text: '@missing 어디 있나요' }
  ];
  let result = prepareConversationContext(comments);
  assert.equal(result[2].taggedContext[0].status, 'single_candidate');
  assert.deepEqual(result[2].taggedContext[0].comments.map(c => c.id), ['a']);
  assert.equal(result[4].taggedContext[0].status, 'missing');
  result = prepareConversationContext([...comments, { id: 'a2', parentId: 'root', author: '@alice', text: '또 다른 답글' }]);
  assert.equal(result[2].taggedContext[0].status, 'ambiguous');
});

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
      assert.match(body.state.classification_rules, /DO NOT cancel it/);
      assert.match(body.state.classification_rules, /laughter alone as hostility/);
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
