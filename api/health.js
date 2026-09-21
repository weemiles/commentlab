export default function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (request.method !== 'GET') return response.status(405).json({ error: '허용되지 않은 요청입니다.' });
  const configuredMax = Number(process.env.MAX_COMMENTS || 200000);
  const maxComments = Number.isFinite(configuredMax) ? Math.max(100, Math.min(200000, configuredMax)) : 200000;
  return response.status(200).json({ ok: true, collectionMode: 'fast-public-page', sentimentEngine: process.env.TYPESAFE_API_KEY ? 'jev-with-local-fallback' : 'local-rules', progressMode: 'serverless', maxComments });
}
