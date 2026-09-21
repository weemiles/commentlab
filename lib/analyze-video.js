import { analyzeComments } from './analyzer.js';
import { demoComments, demoVideo } from './demo.js';
import { extractVideoId } from './video-id.js';
import { fetchFastVideoAndComments } from './youtube-fast.js';
import { fetchPublicVideoAndComments } from './youtube-public.js';
import { classifySentimentWithJev } from './jev-sentiment.js';

export async function analyzeVideo(body, { maxAllowed = 200000, report = () => {}, allowPublicFallback = true } = {}) {
  const requestStartedAt = performance.now();
  const analysisLanguage = body.analysisLanguage === 'en' ? 'en' : 'ko';
  const requestedMax = Math.max(100, Number(body.maxComments || maxAllowed));
  const maxComments = Math.min(maxAllowed, requestedMax);
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
        onProgress: (done, recent) => report({ stage: 'collecting', done, total: 0, percent: 5, recent: recent.slice(-12).map(({ id, author, text }) => ({ id, author, text })) })
      });
    } catch (fastError) {
      if (!allowPublicFallback) throw fastError;
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
