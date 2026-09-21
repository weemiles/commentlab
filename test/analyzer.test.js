import test from "node:test";
import assert from "node:assert/strict";
import { analyzeComments } from "../lib/analyzer.js";
import { extractVideoId } from "../lib/video-id.js";
import { normalizePublicComment } from "../lib/youtube-public.js";
import { normalizePayload } from "../lib/youtube-fast.js";
import { analyzeVideo } from "../lib/analyze-video.js";
import vercelAnalyze from "../api/analyze.js";
import vercelHealth from "../api/health.js";

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
  assert.equal(result.opinions[0].count, 3);
  assert.match(result.opinions[0].representative, /무료 수익 확인/);
  assert.match(result.opinions[0].summary, /반복됩니다/);
  assert.doesNotMatch(result.opinions[0].summary, /https?:\/\//);
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

  const invalid = response();
  await vercelAnalyze({ method: "POST", body: { url: "invalid" } }, invalid);
  assert.equal(invalid.statusCode, 400);
  await assert.rejects(analyzeVideo({ url: "invalid" }), /YouTube/);
});
