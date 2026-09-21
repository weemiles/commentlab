import { createHash, timingSafeEqual } from 'node:crypto';
import { messageFor, requestLanguage } from './messages.js';

export function visitorApiKey(request) {
  const value = request.headers?.['x-jev-api-key'];
  if (typeof value !== 'string' || !/^[\x21-\x7e]{12,512}$/.test(value)) return null;
  return value;
}

export function requireVisitorKey(request, response) {
  const key = visitorApiKey(request);
  if (key) return key;
  response.statusCode = 401;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify({ error: messageFor('visitor_key_required', requestLanguage(request)) }));
  return null;
}

// Public deployments fail closed. Local loopback development may omit a password.
export function accessStatus(request, env = process.env) {
  const secret = env.COMMENTLAB_ACCESS_TOKEN;
  const deployed = Boolean(env.VERCEL || env.RENDER || env.NODE_ENV === 'production' ||
    (env.HOST && !['127.0.0.1', 'localhost', '::1'].includes(env.HOST)));
  if (!secret) return deployed ? 503 : 0;
  const supplied = String(request.headers?.authorization || '');
  const digest = value => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(supplied), digest(`Bearer ${secret}`)) ? 0 : 401;
}

export function rejectUnauthorized(request, response) {
  const status = accessStatus(request);
  if (!status) return false;
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify({ error: messageFor(status === 401 ? 'access_required' : 'access_unconfigured', requestLanguage(request)) }));
  return true;
}

// Only the loopback Node server may use the installer's environment key.
export function localInstallationKey(request, env = process.env) {
  if (env.VERCEL || env.RENDER || !['127.0.0.1', 'localhost', '::1'].includes(env.HOST || '127.0.0.1')) return null;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket?.remoteAddress)) return null;
  try {
    const host = new URL(`http://${request.headers.host}`);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(host.hostname)) return null;
    if (request.headers.origin && request.headers.origin !== host.origin) return null;
    if (request.headers['sec-fetch-site'] === 'cross-site') return null;
  } catch { return null; }
  return visitorApiKey({ headers: { 'x-jev-api-key': env.TYPESAFE_API_KEY } });
}
