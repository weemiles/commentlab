import { analyzeVideo } from '../lib/analyze-video.js';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (request.method !== 'POST') return response.status(405).json({ error: '허용되지 않은 요청입니다.' });
  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body || {};
    const configuredMax = Number(process.env.MAX_COMMENTS || 3000);
    const maxAllowed = Number.isFinite(configuredMax) ? Math.max(100, Math.min(3000, configuredMax)) : 3000;
    return response.status(200).json(await analyzeVideo(body, { maxAllowed, allowPublicFallback: false }));
  } catch (error) {
    return response.status(error.status || 500).json({ error: error.message || '분석 중 알 수 없는 오류가 발생했습니다.' });
  }
}
