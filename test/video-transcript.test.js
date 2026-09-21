import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchVideoTranscript, transcriptContext } from '../lib/video-transcript.js';
import { analyzeVideo } from '../lib/analyze-video.js';
import { collect } from '../api/collect.js';

const videoId = 'dQw4w9WgXcQ';
const page = tracks => new Response(`var ytInitialPlayerResponse = ${JSON.stringify({ captions: { playerCaptionsTracklistRenderer: { captionTracks: tracks } } })};`);

test('captions prefer the requested language and manual track, retaining all speech segments', async () => {
  const calls = [];
  const result = await fetchVideoTranscript({ videoId, fetchImpl: async url => {
    calls.push(String(url));
    if (calls.length === 1) return page([
      { languageCode: 'en', baseUrl: 'https://www.youtube.com/api/timedtext?v=en' },
      { languageCode: 'ko', kind: 'asr', baseUrl: 'https://www.youtube.com/api/timedtext?v=auto' },
      { languageCode: 'ko', baseUrl: 'https://www.youtube.com/api/timedtext?v=manual' }
    ]);
    return Response.json({ events: [{ segs: [{ utf8: '영상 속 ' }, { utf8: '발언입니다.' }] }, { segs: [{ utf8: '끝의 반전입니다.' }] }] });
  } });
  assert.match(calls[1], /v=manual/);
  assert.equal(result.text, '영상 속 발언입니다. 끝의 반전입니다.');
  assert.equal(result.automatic, false);
  assert.equal(result.partial, false);
});

test('blocked, absent and unsafe captions are unavailable without arbitrary requests', async () => {
  for (const first of [() => new Response('', { status: 403 }), () => page([]), () => page([{ baseUrl: 'http://127.0.0.1/private' }]), () => { throw new Error('timeout'); }]) {
    let calls = 0;
    const result = await fetchVideoTranscript({ videoId, fetchImpl: async () => { calls++; return first(); } });
    assert.equal(result.status, 'unavailable');
    assert.equal(calls, 1);
  }
  await assert.rejects(collect({ action: 'transcript', videoId: 'http://localhost' }, () => assert.fail()), error => error.status === 400);
});

test('empty caption responses try another track and long transcripts disclose omissions', async () => {
  let calls = 0;
  const result = await fetchVideoTranscript({ videoId, fetchImpl: async () => {
    calls++;
    if (calls === 1) return page(['one', 'two'].map(v => ({ languageCode: 'ko', kind: 'asr', baseUrl: `https://www.youtube.com/api/timedtext?v=${v}` })));
    return Response.json({ events: calls === 2 ? [] : [{ segs: [{ utf8: '자동 자막' }] }] });
  } });
  assert.equal(result.text, '자동 자막');
  assert.equal(result.automatic, true);
  const long = transcriptContext('시작' + '내용'.repeat(20000) + '마지막 반전');
  assert.ok(long.text.length <= 24000);
  assert.equal(long.partial, true);
  assert.ok(long.text.endsWith('마지막 반전'));
});

test('analysis reads transcript before collection, passes it to Jev and never exposes it in progress or results', async () => {
  const original = globalThis.fetch;
  try {
    for (const available of [true, false]) {
      const actions = [], progress = [];
      globalThis.fetch = async (url, options) => {
        const body = JSON.parse(options.body);
        if (String(url).includes('typesafe.ai')) {
          actions.push('classify');
          assert.equal(body.state.video_content.status, available ? 'available' : 'unavailable');
          assert.equal(body.state.video_content.transcript, available ? '내부 전사문 비공개 테스트' : null);
          return Response.json({ answers: { comment_0: { choice: 'neutral' }, reason_0: { choice: 'information' } } });
        }
        actions.push(body.action);
        if (body.action === 'transcript') {
          if (!available) throw new Error('captions blocked');
          return Response.json({ status: 'available', text: '내부 전사문 비공개 테스트', language: 'ko', automatic: true });
        }
        if (body.action === 'session') return Response.json({ video: { id: videoId, title: '테스트 영상' }, client: { clientVersion: '2.20260623.01.00' }, firstToken: 'first' });
        return Response.json({ mutations: [{ commentEntityPayload: { properties: { commentId: 'c1', content: { content: '그렇군요' } } } }] });
      };
      const result = await analyzeVideo({ url: `https://www.youtube.com/watch?v=${videoId}` }, { collectorUrl: 'https://collector.example/api/collect', apiKey: `test-transcript-${available}`, report: value => progress.push(value) });
      assert.deepEqual(actions, ['transcript', 'session', 'page', 'classify']);
      assert.equal(progress[0].stage, 'video_context');
      assert.equal(result.summary.total, 1);
      assert.doesNotMatch(JSON.stringify({ progress, result }), /내부 전사문|"video_content"|"transcript"/);
    }
  } finally { globalThis.fetch = original; }
});
