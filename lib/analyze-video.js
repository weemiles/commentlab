import { analyzeComments } from './analyzer.js';
import { demoComments, demoVideo } from './demo.js';
import { extractVideoId } from './video-id.js';
import { fetchFastVideoAndComments } from './youtube-fast.js';
import { fetchPublicVideoAndComments } from './youtube-public.js';
import { classifySentimentWithJev } from './jev-sentiment.js';

const resultCache = globalThis.__commentlabResultCache ||= new Map();
const inflight = globalThis.__commentlabInflight ||= new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_LIMIT = 3;

function cacheKey(body, maxComments) {
  const videoId = body.demo === true ? 'demo' : extractVideoId(body.url);
  return videoId ? `${videoId}:${body.analysisLanguage === 'en' ? 'en' : 'ko'}:${maxComments}` : null;
}

function readCache(key) {
  const entry = key && resultCache.get(key);
  if (!entry || Date.now() - entry.createdAt > CACHE_TTL_MS) {
    if (key) resultCache.delete(key);
    return null;
  }
  resultCache.delete(key);
  resultCache.set(key, entry);
  return entry.result;
}

function writeCache(key, result) {
  if (!key) return;
  resultCache.set(key, { createdAt: Date.now(), result });
  while (resultCache.size > CACHE_LIMIT) resultCache.delete(resultCache.keys().next().value);
}

export async function analyzeVideo(body, { maxAllowed = 200000, report = () => {}, allowPublicFallback = true, collectorUrl = '' } = {}) {
  const requestStartedAt = performance.now();
  const analysisLanguage = body.analysisLanguage === 'en' ? 'en' : 'ko';
  const requestedMax = Math.max(100, Number(body.maxComments || maxAllowed));
  const maxComments = Math.min(maxAllowed, requestedMax);
  const key = cacheKey(body, maxComments);
  const cached = readCache(key);
  if (cached) {
    report({ stage: 'complete', done: cached.summary.total, total: cached.summary.total, percent: 100, cached: true });
    return { ...cached, cache: { hit: true, ttlMs: CACHE_TTL_MS } };
  }
  if (key && inflight.has(key)) {
    report({ stage: 'collecting', done: 0, total: 0, percent: 5, shared: true });
    const shared = await inflight.get(key);
    report({ stage: 'complete', done: shared.summary.total, total: shared.summary.total, percent: 100, shared: true });
    return { ...shared, cache: { hit: true, shared: true, ttlMs: CACHE_TTL_MS } };
  }

  const operation = runAnalysis(body, { maxComments, analysisLanguage, report, allowPublicFallback, collectorUrl, requestStartedAt });
  if (key) inflight.set(key, operation);
  try {
    const result = await operation;
    writeCache(key, result);
    return result;
  } finally {
    if (key) inflight.delete(key);
  }
}

async function runAnalysis(body, { maxComments, analysisLanguage, report, allowPublicFallback, collectorUrl, requestStartedAt }) {
  report({ stage: 'collecting', done: 0, total: 0, percent: 5 });

  const collectionStartedAt = performance.now();
  let source;
  if (body.demo === true) {
    source = { video: demoVideo, comments: demoComments.slice(0, maxComments), truncated: false };
  } else {
    const videoId = extractVideoId(body.url);
    if (!videoId) {
      const error = new Error('올바른 YouTube 영상 링크를 입력해주세요.');
      error.status = 400;
      throw error;
    }
    try {
      source = await fetchFastVideoAndComments({
        videoId,
        maxComments,
        collectorUrl,
        onProgress: (done, recent) => report({ stage: 'collecting', done, total: 0, percent: 5, recent: recent.slice(-12).map(({ id, author, text }) => ({ id, author, text })) })
      });
    } catch (fastError) {
      if (!allowPublicFallback || collectorUrl) throw fastError;
      console.warn(`Fast collector failed, falling back to yt-dlp: ${fastError.message}`);
      try {
        source = await fetchPublicVideoAndComments({ videoId, maxComments });
      } catch (fallbackError) {
        console.warn(`yt-dlp fallback failed: ${fallbackError.message}`);
        if (fallbackError.code === 'YT_DLP_NOT_INSTALLED') {
          throw new Error(`${fastError.message}. YouTube가 이 서버의 요청을 제한했을 수 있습니다. 잠시 후 다시 시도해주세요.`, { cause: fastError });
        }
        throw fallbackError;
      }
      source.fallbackReason = fastError.message;
    }
  }

  const collectionMs = performance.now() - collectionStartedAt;
  report({ stage: 'classifying', done: 0, total: source.comments.length, percent: 45 });
  const analysisStartedAt = performance.now();
  let sentimentResult = null;
  let sentimentFallbackReason = null;
  try {
    sentimentResult = await classifySentimentWithJev(source.comments, {
      language: analysisLanguage,
      onProgress: (done, total) => report({ stage: 'classifying', done, total, percent: Math.round(45 + done / total * 50) })
    });
  } catch (error) {
    sentimentFallbackReason = error.message;
    console.warn(`Jev sentiment failed, falling back to local rules: ${error.message}`);
  }

  const analysis = analyzeComments(source.comments, sentimentResult?.sentiments);
  report({ stage: 'finalizing', done: source.comments.length, total: source.comments.length, percent: 99 });
  const analysisMs = performance.now() - analysisStartedAt;
  const result = {
    video: source.video,
    truncated: source.truncated,
    analyzedAt: new Date().toISOString(),
    analysisLanguage,
    method: source.collectionMethod || (body.demo === true ? 'demo' : 'fast-public-page'),
    sentimentEngine: sentimentResult ? 'jev' : 'local-rules',
    sentimentModel: sentimentResult?.model || null,
    sentimentRequests: sentimentResult?.requestCount || 0,
    sentimentFallbackReason,
    timing: {
      collectionMs: Math.round(collectionMs),
      analysisMs: Math.round(analysisMs),
      totalMs: Math.round(performance.now() - requestStartedAt)
    },
    ...analysis
  };
  report({ stage: 'complete', done: source.comments.length, total: source.comments.length, percent: 100 });
  return result;
}
