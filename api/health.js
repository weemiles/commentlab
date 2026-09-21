export default function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (request.method !== 'GET') return response.status(405).json({ error: '허용되지 않은 요청입니다.' });
  return response.status(200).json({ ok: true, collectionMode: 'fast-public-page', sentimentEngine: process.env.TYPESAFE_API_KEY ? 'jev-with-local-fallback' : 'local-rules', progressMode: 'serverless', maxComments: 3000 });
}
