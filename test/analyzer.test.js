import test from "node:test";
import assert from "node:assert/strict";
import { analyzeComments } from "../lib/analyzer.js";
import { extractVideoId } from "../lib/video-id.js";
import { normalizePublicComment } from "../lib/youtube-public.js";
import { normalizePayload, metadataFromSources, resolveVideoMetadata, fetchYouTubeWithRetry, fetchFastVideoAndComments } from "../lib/youtube-fast.js";
import { analyzeVideo } from "../lib/analyze-video.js";
import { streamAnalysis } from "../lib/analysis-stream.js";
import vercelAnalyze from "../api/analyze.js";
import vercelHealth from "../api/health.js";
import { collect } from "../api/collect.js";

test("extractVideoId handles common YouTube URLs", () => {
  assert.equal(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(extractVideoId("https://youtu.be/dQw4w9WgXcQ?t=2"), "dQw4w9WgXcQ");
  assert.equal(extractVideoId("https://youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(extractVideoId("not a url"), null);
});

test("analyzeComments counts sentiment and repeated spam", () => {
  const base = { parentId: null, author: "tester", authorChannelId: "a", likeCount: 0, publishedAt: new Date().toISOString() };
  const comments = [
    { ...base, id: "1", text: "정말 좋은 영상 감사합니다" },
    { ...base, id: "2", authorChannelId: "b", text: "최악이고 너무 실망입니다" },
    { ...base, id: "3", authorChannelId: "c", text: "무료 수익 확인 https://spam.example" },
    { ...base, id: "4", authorChannelId: "d", text: "무료 수익 확인 https://spam.example" },
    { ...base, id: "5", authorChannelId: "e", text: "무료 수익 확인 https://spam.example" }
  ];
  const result = analyzeComments(comments);
  assert.equal(result.summary.total, 5);
  assert.equal(result.summary.sentiment.positive, 1);
  assert.equal(result.summary.sentiment.negative, 1);
  assert.equal(result.summary.suspicious, 3);
  assert.equal(result.opinions.length, 0);
  assert.equal(result.comments.filter(c => c.suspicious.label).length, 3);
});

test('opinion groups exclude suspected automation but retain genuine repeated viewpoints', () => {
  const genuine = '설명이 자세해서 내용을 이해하는 데 도움이 되었습니다';
  const spam = '무료 수익 확인 https://spam.example';
  const comments = [genuine, genuine, spam, spam, spam].map((text, i) => ({
    id: String(i), author: `author${i}`, authorChannelId: `channel${i}`, text, likeCount: i >= 2 ? 100 : 0
  }));
  const result = analyzeComments(comments);
  assert.equal(result.summary.total, 5);
  assert.equal(result.summary.suspicious, 3);
  assert.equal(result.opinions.length, 1);
  assert.equal(result.opinions[0].count, 2);
  assert.deepEqual(new Set(result.opinions[0].commentIds), new Set(['0', '1']));
  assert.equal(result.opinions[0].representative, genuine);
});

test('account mentions are excluded from opinion topics', () => {
  const result = analyzeComments([
    { id: 'a', author: '@a', text: '@wayne-se6r 충분한 자료와 출처가 필요합니다' },
    { id: 'b', author: '@b', text: '@wayne-se6r 충분한 자료와 출처가 필요합니다' }
  ]);
  assert.equal(result.opinions.length, 1);
  assert.doesNotMatch(result.opinions[0].summary, /wayne|se6r/);
  assert.ok(result.topics.every(t => !/wayne|se6r/.test(t.term)));
});

test("normalizePublicComment keeps reply and author metadata", () => {
  const comment = normalizePublicComment({
    id: "reply-1",
    parent: "top-1",
    text: "답글입니다",
    author: "작성자",
    author_id: "channel-1",
    like_count: 3,
    timestamp: 1_700_000_000
  });
  assert.equal(comment.parentId, "top-1");
  assert.equal(comment.authorChannelId, "channel-1");
  assert.equal(comment.likeCount, 3);
  assert.equal(comment.text, "답글입니다");
});

test("fast YouTube comments retain the published time shown by YouTube", () => {
  const comment = normalizePayload({
    properties: { commentId: "top-1", content: { content: "댓글" }, publishedTime: "2 days ago" },
    author: { displayName: "작성자" },
    toolbar: { likeCountNotliked: "1" }
  });
  assert.equal(comment.publishedText, "2 days ago");
  assert.equal(comment.publishedAt, null);
});

test("video metadata falls back to watch-page renderers and keyless oEmbed", async () => {
  const initialData = { contents: {
    videoPrimaryInfoRenderer: { title: { runs: [{ text: "영상 제목" }] } },
    videoOwnerRenderer: { title: { runs: [{ text: "채널 이름" }] } }
  } };
  const fromPage = metadataFromSources(null, initialData, "dQw4w9WgXcQ", 12);
  assert.equal(fromPage.title, "영상 제목");
  assert.equal(fromPage.channel, "채널 이름");

  const requests = [];
  const fromEmbed = await resolveVideoMetadata(null, {}, "dQw4w9WgXcQ", 12, async (url) => {
    requests.push(String(url));
    return { ok: true, json: async () => ({ title: "대체 제목", author_name: "대체 채널" }) };
  });
  assert.equal(fromEmbed.title, "대체 제목");
  assert.equal(fromEmbed.channel, "대체 채널");
  assert.match(requests[0], /youtube\.com\/oembed/);
  assert.doesNotMatch(requests[0], /googleapis/);
});

test("YouTube requests retry a transient limit only once", async () => {
  let attempts = 0;
  const response = await fetchYouTubeWithRetry(async () => {
    attempts += 1;
    return { ok: attempts === 2, status: attempts === 2 ? 200 : 429 };
  }, "https://www.youtube.com/watch?v=dQw4w9WgXcQ", {});
  assert.equal(response.status, 200);
  assert.equal(attempts, 2);

  attempts = 0;
  await fetchYouTubeWithRetry(async () => {
    attempts += 1;
    return { ok: false, status: 404 };
  }, "https://www.youtube.com/watch?v=dQw4w9WgXcQ", {});
  assert.equal(attempts, 1);
});

test("blocked watch HTML falls back to keyless public data and retains metadata and progress", async () => {
  const requests = [];
  const progress = [];
  const result = await fetchFastVideoAndComments({
    videoId: "dQw4w9WgXcQ", maxComments: 100,
    onProgress: (count, comments) => progress.push({ count, comments }),
    fetchImpl: async (url, options) => {
      const address = new URL(url);
      if (address.pathname === "/watch") return new Response("", { status: 429 });
      assert.equal(address.origin, "https://www.youtube.com");
      assert.equal(address.searchParams.has("key"), false);
      const body = JSON.parse(options.body);
      requests.push(body);
      if (body.videoId) return Response.json({
        responseContext: { visitorData: "test-visitor" },
        contents: [
          { itemSectionRenderer: { sectionIdentifier: "related-videos", contents: [] } },
          { itemSectionRenderer: { targetId: "comments-section", contents: [{ continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: "comments-token" } } } }] } },
          { videoPrimaryInfoRenderer: { title: { simpleText: "테스트 영상" } } },
          { videoOwnerRenderer: { title: { simpleText: "테스트 채널" }, navigationEndpoint: { browseEndpoint: { browseId: "channel-1" } } } }
        ]
      });
      assert.equal(body.continuation, "comments-token");
      assert.equal(body.context.client.visitorData, "test-visitor");
      assert.equal(options.headers["x-goog-visitor-id"], "test-visitor");
      return Response.json({ frameworkUpdates: { entityBatchUpdate: { mutations: [
        { payload: { commentEntityPayload: { properties: { commentId: "c1", content: { content: "실제 응답 형식 댓글" } }, author: { displayName: "작성자" } } } }
      ] } } });
    }
  });
  assert.equal(requests.length, 2);
  assert.equal(result.comments.length, 1);
  assert.equal(result.video.title, "테스트 영상");
  assert.equal(result.video.channel, "테스트 채널");
  assert.equal(result.video.channelId, "channel-1");
  assert.equal(progress[0].count, 1);
  assert.equal(progress[0].comments[0].id, "c1");
});

test("remote collection follows pages, deduplicates replies and streams real progress", async () => {
  const progress = [];
  const calls = [];
  const payload = (id) => ({ commentEntityPayload: { properties: { commentId: id, content: { content: id } } } });
  const result = await fetchFastVideoAndComments({
    videoId: "dQw4w9WgXcQ", maxComments: 100, collectorUrl: "https://collector.example/api/collect",
    onProgress: (done, recent) => progress.push({ done, ids: recent.map((comment) => comment.id) }),
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://collector.example/api/collect");
      const body = JSON.parse(options.body);
      calls.push(body.action);
      if (body.action === "session") return Response.json({
        video: { id: "dQw4w9WgXcQ", title: "영상", channel: "채널" },
        client: { clientVersion: "2.20260623.01.00" }, firstToken: "first"
      });
      if (body.action === "pages") {
        assert.deepEqual(body.tokens, ["second", "third"]);
        return Response.json([
          { mutations: [payload("c1"), payload("c1.reply"), payload("c2")] },
          { mutations: [payload("c3")] }
        ]);
      }
      if (body.token === "first") return Response.json({
        mutations: [payload("c1")],
        appendContinuationItemsAction: { targetId: "comments-section", continuationItems: [
          { continuationEndpoint: { continuationCommand: { token: "second" } } },
          { continuationEndpoint: { continuationCommand: { token: "third" } } }
        ] }
      });
      assert.fail(`Unexpected collector action: ${body.action}`);
    }
  });
  assert.deepEqual(calls, ["session", "page", "pages"]);
  assert.deepEqual(progress, [{ done: 1, ids: ["c1"] }, { done: 4, ids: ["c1.reply", "c2", "c3"] }]);
  assert.equal(result.comments[1].parentId, "c1");
  assert.equal(result.video.title, "영상");
  assert.equal(result.video.commentCount, 4);
  assert.equal(result.truncated, false);
});

test("collector rejects unsupported operations and invalid tokens before any network request", async () => {
  const noNetwork = () => assert.fail("Invalid requests must not perform network calls");
  for (const body of [null, { action: "proxy", url: "http://localhost" },
    { action: "session", videoId: "http://localhost" },
    { action: "page", token: "x".repeat(32769), clientVersion: "2.20260623.01.00" },
    { action: "page", token: "token", clientVersion: "invalid" },
    { action: "page", token: "token", clientVersion: "2.20260623.01.00", visitorData: "invalid\r\nheader" },
    { action: "pages", tokens: [], clientVersion: "2.20260623.01.00" },
    { action: "pages", tokens: ["valid", "invalid token"], clientVersion: "2.20260623.01.00" }
  ]) await assert.rejects(collect(body, noNetwork), (error) => error.status === 400);
});

test("remote collection falls back to separate page calls when a batch times out", async () => {
  const calls = [];
  const payload = (id) => ({ commentEntityPayload: { properties: { commentId: id, content: { content: id } } } });
  const result = await fetchFastVideoAndComments({
    videoId: "dQw4w9WgXcQ", maxComments: 100, collectorUrl: "https://collector.example/api/collect",
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push(`${body.action}:${body.token || body.tokens?.join(",") || ""}`);
      if (body.action === "session") return Response.json({
        video: { id: "dQw4w9WgXcQ", title: "영상", channel: "채널" },
        client: { clientVersion: "2.20260623.01.00" }, firstToken: "first"
      });
      if (body.action === "pages") throw new DOMException("timed out", "AbortError");
      if (body.token === "first") return Response.json({
        mutations: [payload("c1")],
        appendContinuationItemsAction: { targetId: "comments-section", continuationItems: [
          { continuationEndpoint: { continuationCommand: { token: "second" } } },
          { continuationEndpoint: { continuationCommand: { token: "third" } } }
        ] }
      });
      return Response.json({ mutations: [payload(body.token)] });
    }
  });
  assert.deepEqual(calls, ["session:", "page:first", "pages:second,third", "page:second", "page:third"]);
  assert.deepEqual(result.comments.map(({ id }) => id), ["c1", "second", "third"]);
});

test("direct collection keeps successful pages when one continuation fails", async () => {
  const payload = (id) => ({ commentEntityPayload: { properties: { commentId: id, content: { content: id } } } });
  let failedAttempts = 0;
  const result = await fetchFastVideoAndComments({
    videoId: "dQw4w9WgXcQ", maxComments: 100,
    fetchImpl: async (url, options) => {
      const address = new URL(url);
      if (address.pathname === "/watch") return new Response("", { status: 429 });
      const body = JSON.parse(options.body);
      if (body.videoId) return Response.json({
        responseContext: { visitorData: "test-visitor" },
        contents: [{ itemSectionRenderer: { targetId: "comments-section", contents: [
          { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: "first" } } } }
        ] } }]
      });
      if (body.continuation === "first") return Response.json({
        mutations: [payload("c1")],
        appendContinuationItemsAction: { targetId: "comments-section", continuationItems: [
          { continuationEndpoint: { continuationCommand: { token: "broken" } } },
          { continuationEndpoint: { continuationCommand: { token: "working" } } }
        ] }
      });
      if (body.continuation === "broken") {
        failedAttempts += 1;
        throw new DOMException("timed out", "AbortError");
      }
      return Response.json({ mutations: [payload("c2")] });
    }
  });
  assert.equal(failedAttempts, 2);
  assert.equal(result.truncated, true);
  assert.equal(result.failedPages, 1);
  assert.deepEqual(result.comments.map(({ id }) => id), ["c1", "c2"]);
});

test("analyzeComments uses Jev sentiment results when supplied", () => {
  const comments = [{ id: "1", text: "문맥형 댓글", authorChannelId: "a" }];
  const jev = [{ label: "negative", score: 0.91, probabilities: { positive: 0.09, negative: 0.91 } }];
  const result = analyzeComments(comments, jev);
  assert.equal(result.summary.sentiment.negative, 1);
  assert.equal(result.comments[0].sentiment.score, 0.91);
});

test("Vercel endpoints expose health and validate YouTube URLs", async () => {
  const response = () => ({
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  });
  const health = response();
  vercelHealth({ method: "GET" }, health);
  assert.equal(health.statusCode, 200);
  assert.equal(health.body.ok, true);
  assert.equal(health.body.maxComments, 200000);

  const invalid = response();
  await vercelAnalyze({ method: "POST", body: { url: "invalid" } }, invalid);
  assert.equal(invalid.statusCode, 400);
  await assert.rejects(analyzeVideo({ url: "invalid" }), /YouTube/);
});

test("analysis stream sends progress and the final result in one response", async () => {
  const response = {
    headers: {}, chunks: [], ended: false,
    setHeader(name, value) { this.headers[name] = value; },
    flushHeaders() {},
    write(chunk) { this.chunks.push(chunk); },
    end() { this.ended = true; }
  };
  await streamAnalysis(response, { url: "test" }, {}, async (_body, { report }) => {
    report({ stage: "collecting", done: 1, recent: [{ id: "comment-1", author: "tester", text: "hello" }] });
    return { summary: { total: 1 } };
  });
  const events = response.chunks.map((chunk) => JSON.parse(chunk));
  assert.match(response.headers["Content-Type"], /application\/x-ndjson/);
  assert.equal(events[1].recent[0].id, "comment-1");
  assert.equal(events.at(-1).type, "result");
  assert.equal(events.at(-1).data.summary.total, 1);
  assert.equal(response.ended, true);
});
