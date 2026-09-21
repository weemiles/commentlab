import { createHash, timingSafeEqual } from 'node:crypto';

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
  response.end(JSON.stringify({ error: status === 401 ? 'Access password required or incorrect.' : 'Deployment access is not configured.' }));
  return true;
}
