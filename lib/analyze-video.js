import { analyzeComments } from './analyzer.js';
import { demoComments, demoVideo } from './demo.js';
import { extractVideoId } from './video-id.js';
import { fetchFastVideoAndComments } from './youtube-fast.js';
import { fetchPublicVideoAndComments } from './youtube-public.js';
import { classifySentimentWithJev, SENTIMENT_VERSION } from './jev-sentiment.js';
import { DEFAULT_MAX_COMMENTS } from './limits.js';
import { localeError } from './messages.js';

import { createPrivateCache } from './private-cache.js';
const privateCache = createPrivateCache();

export async function analyzeVideo(body, { maxAllowed = DEFAULT_MAX_COMMENTS, report = () => {}, allowPublicFallback = true, collectorUrl = '', apiKey } = {}) {
  const requestStartedAt = performance.now();
  const analysisLanguage = body.analysisLanguage === 'en' ? 'en' : 'ko';
  const requestedMax = Math.max(100, Number(body.maxComments || maxAllowed));
  const maxComments = Math.min(maxAllowed, requestedMax);
  const cacheId = privateCache.key(apiKey, [extractVideoId(body.url), body.demo === true, analysisLanguage, maxComments, collectorUrl, allowPublicFallback, SENTIMENT_VERSION, process.env.TYPESAFE_MODEL || 'jev-preview']);
  const cached = privateCache.get(cacheId);
  if (cached) {
    report({ stage: 'complete', done: cached.summary.total, total: cached.summary.total, percent: 100 });
    return { ...cached, cache: { hit: true, ttlSeconds: 600 } };
  }
  const result = await runAnalysis(body, { maxComments, analysisLanguage, report, allowPublicFallback, collectorUrl, requestStartedAt, apiKey });
  privateCache.set(cacheId, result);
  return { ...result, cache: { hit: false } };
}

async function runAnalysis(body, { maxComments, analysisLanguage, report, allowPublicFallback, collectorUrl, requestStartedAt, apiKey }) {
  report({ stage: 'collecting', done: 0, total: 0, percent: 5 });

  const collectionStartedAt = performance.now();
  let source;
  if (body.demo === true) {
    source = { video: demoVideo, comments: demoComments.slice(0, maxComments), truncated: false };
  } else {
    const videoId = extractVideoId(body.url);
    if (!videoId) throw localeError('invalid_url', { status: 400 });
    try {
      source = await fetchFastVideoAndComments({
        videoId,
        language: analysisLanguage,
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
          throw localeError('youtube_rate_limited', { status: fastError.status, cause: fastError });
        }
        throw fallbackError;
      }
      source.fallbackReason = fastError.message;
    }
  }

  const collectionMs = performance.now() - collectionStartedAt;
  report({ stage: 'classifying', done: 0, total: source.comments.length, percent: 45 });
  const analysisStartedAt = performance.now();
  let sentimentResult;
  try {
    sentimentResult = await classifySentimentWithJev(source.comments, {
      apiKey,
      video: source.video,
      language: analysisLanguage,
      onProgress: (done, total) => report({ stage: 'classifying', done, total, percent: Math.round(45 + done / total * 50) })
    });
  } catch (error) {
    // There is no local-rule fallback here on purpose: a provider failure must
    // never be published as neutral labels the model did not produce.
    console.warn(`Jev analysis failed: ${error.message}`);
    throw localeError('jev_failed', { status: error.status, cause: error });
  }

  const analysis = analyzeComments(source.comments, sentimentResult.sentiments);
  report({ stage: 'finalizing', done: source.comments.length, total: source.comments.length, percent: 99 });
  const analysisMs = performance.now() - analysisStartedAt;
  const result = {
    video: source.video,
    truncated: source.truncated,
    analyzedAt: new Date().toISOString(),
    analysisLanguage,
    method: source.collectionMethod || (body.demo === true ? 'demo' : 'fast-public-page'),
    sentimentEngine: 'jev',
    sentimentVersion: SENTIMENT_VERSION,
    sentimentModel: sentimentResult.model,
    sentimentRequests: sentimentResult.requestCount,
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
