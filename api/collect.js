import { fetchCollectorSession, fetchCollectorPage, fetchCollectorPages } from '../lib/youtube-fast.js';
import { rejectUnauthorized } from '../lib/access.js';
import { localeError, messageFor, publicMessage, requestLanguage } from '../lib/messages.js';

// A bounded public-comment operation, not a general URL proxy. Never accept
// cookies, authorization headers, arbitrary hosts, or arbitrary client contexts.
export async function collect(body, fetchImpl = fetch) {
  const invalid = () => { throw localeError('invalid_collect_request', { status: 400 }); };
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid();
  if (JSON.stringify(body).length > 60000) invalid();
  if (body.action === 'session') {
    if (typeof body.videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(body.videoId)) invalid();
    return fetchCollectorSession(body.videoId, fetchImpl, body.language === "en" ? "en" : "ko");
  }
  if (body.action === 'page') {
    if (typeof body.token !== 'string' || !/^[A-Za-z0-9_+/%=.-]{1,32768}$/.test(body.token)) invalid();
    if (typeof body.clientVersion !== 'string' || !/^\d{1,3}\.\d{8}\.\d{2}\.\d{2}$/.test(body.clientVersion)) invalid();
    if (body.visitorData !== undefined && (typeof body.visitorData !== 'string' || !/^[A-Za-z0-9_+/%=.-]{0,8192}$/.test(body.visitorData))) invalid();
    return fetchCollectorPage({ token: body.token, clientVersion: body.clientVersion, visitorData: body.visitorData }, fetchImpl);
  }
  if (body.action === 'pages') {
    if (!Array.isArray(body.tokens) || body.tokens.length < 1 || body.tokens.length > 16) invalid();
    if (body.tokens.some((token) => typeof token !== 'string' || !/^[A-Za-z0-9_+/%=.-]{1,32768}$/.test(token))) invalid();
    if (typeof body.clientVersion !== 'string' || !/^\d{1,3}\.\d{8}\.\d{2}\.\d{2}$/.test(body.clientVersion)) invalid();
    if (body.visitorData !== undefined && (typeof body.visitorData !== 'string' || !/^[A-Za-z0-9_+/%=.-]{0,8192}$/.test(body.visitorData))) invalid();
    return fetchCollectorPages({ tokens: body.tokens, clientVersion: body.clientVersion, visitorData: body.visitorData }, fetchImpl);
  }
  invalid();
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  const language = requestLanguage(request);
  if (request.method !== 'POST') return response.status(405).json({ error: messageFor('method_not_allowed', language) });
  if (rejectUnauthorized(request, response)) return;
  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    return response.status(200).json(await collect(body));
  } catch (error) {
    if (error instanceof SyntaxError) return response.status(400).json({ error: messageFor('invalid_collect_request', language) });
    console.warn(`Collect request failed: ${error.message}`);
    return response.status(error.status || 502).json({ error: publicMessage(error, language) });
  }
}
