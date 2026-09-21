const handle = value => String(value || '').normalize('NFKC').replace(/^@/, '').toLowerCase();
// Relative labels are buckets, not exact timestamps; equal buckets stay ambiguous.
function time(comment) {
  if (comment.publishedAt && Number.isFinite(Date.parse(comment.publishedAt))) return Date.parse(comment.publishedAt);
  const text = String(comment.publishedText || '');
  const match = text.match(/(\d+)\s*(초|분|시간|일|주|개월|년|seconds?|minutes?|hours?|days?|weeks?|months?|years?)/i);
  if (!match || /수정|edited/i.test(text)) return null;
  const unit = match[2].toLowerCase();
  const scales = {초:1,분:60,시간:3600,일:86400,주:604800,개월:2592000,년:31536000};
  const seconds = scales[unit] || ({second:1,minute:60,hour:3600,day:86400,week:604800,month:2592000,year:31536000})[unit.replace(/s$/, '')];
  return -Number(match[1]) * seconds * 1000;
}
export function buildReplyTargets(comments) {
  const threads = new Map(), result = new Map();
  for (const c of comments) {
    const id = c.parentId || c.id;
    if (!threads.has(id)) threads.set(id, []);
    threads.get(id).push(c);
  }
  for (const c of comments) {
    if (!c.parentId) continue;
    const tags = new Set((String(c.text).match(/@[\p{L}\p{N}_.\-]+/gu) || []).map(handle));
    if (!tags.size) continue;
    const candidates = (threads.get(c.parentId) || []).filter(other => other.id !== c.id && tags.has(handle(other.author)));
    const current = time(c);
    const earlier = candidates.filter(other => {
      const value = time(other);
      // Do not mix absolute timestamps with relative labels.
      return value !== null && current !== null && (value < 0) === (current < 0) && value < current;
    }).sort((a,b) => time(b)-time(a));
    const uniqueLatest = earlier.length && (earlier.length === 1 || time(earlier[0]) !== time(earlier[1]));
    result.set(c.id, { target: uniqueLatest ? earlier[0] : null, candidates, status: uniqueLatest ? 'inferred' : candidates.length ? 'ambiguous' : 'missing' });
  }
  return result;
}
