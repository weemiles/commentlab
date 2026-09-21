import { messageFor, requestLanguage } from '../lib/messages.js';
import { resolveMaxComments } from '../lib/limits.js';

export default function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (request.method !== 'GET') return response.status(405).json({ error: messageFor('method_not_allowed', requestLanguage(request)) });
  return response.status(200).json({ ok: true, collectionMode: 'fast-public-page', sentimentEngine: 'visitor-jev-key', progressMode: 'serverless', maxComments: resolveMaxComments() });
}
