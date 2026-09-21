import { analyzeVideo } from '../lib/analyze-video.js';
import { streamAnalysis } from '../lib/analysis-stream.js';
import { requireVisitorKey } from '../lib/access.js';
import { messageFor, publicMessage, requestLanguage } from '../lib/messages.js';
import { resolveMaxComments } from '../lib/limits.js';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (request.method !== 'POST') return response.status(405).json({ error: messageFor('method_not_allowed', requestLanguage(request)) });
  const apiKey = requireVisitorKey(request, response);
  if (!apiKey) return;
  let language = requestLanguage(request);
  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body || {};
    language = requestLanguage(request, body);
    const maxAllowed = resolveMaxComments();
    if (String(request.headers?.accept || '').includes('application/x-ndjson')) {
      return streamAnalysis(response, body, { maxAllowed, allowPublicFallback: false, apiKey, language });
    }
    return response.status(200).json(await analyzeVideo(body, { maxAllowed, allowPublicFallback: false, apiKey }));
  } catch (error) {
    if (!(error instanceof SyntaxError)) console.warn(`Analysis request failed: ${error.message}`);
    return response.status(error.status || 500).json({ error: publicMessage(error, language) });
  }
}
