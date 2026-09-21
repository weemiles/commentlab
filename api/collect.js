import { fetchCollectorSession, fetchCollectorPage, fetchCollectorPages } from '../lib/youtube-fast.js';

// A bounded public-comment operation, not a general URL proxy. Never accept
// cookies, authorization headers, arbitrary hosts, or arbitrary client contexts.
export async function collect(body, fetchImpl = fetch) {
  const invalid = () => { const error = new Error('올바른 댓글 수집 요청이 아닙니다.'); error.status = 400; throw error; };
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid();
  if (JSON.stringify(body).length > 60000) invalid();
  if (body.action === 'session') {
    if (typeof body.videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(body.videoId)) invalid();
    return fetchCollectorSession(body.videoId, fetchImpl);
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
  if (request.method !== 'POST') return response.status(405).json({ error: '허용되지 않은 요청입니다.' });
  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    return response.status(200).json(await collect(body));
  } catch (error) {
    return response.status(error instanceof SyntaxError ? 400 : error.status || 502).json({ error: error.message });
  }
}
