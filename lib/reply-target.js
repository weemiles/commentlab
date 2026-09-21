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
function terms(text) {
  const words = String(text || '').normalize('NFKC').toLowerCase().replace(/@[\p{L}\p{N}_.\-]+/gu, '').match(/[\p{L}\p{N}]+/gu) || [];
  const result = new Set();
  for (const word of words) {
    if (word.length < 2) continue;
    result.add(word);
    if (/[가-힣]/.test(word)) for (let i=0; i<word.length-1; i++) result.add(word.slice(i,i+2));
  }
  return result;
}
function contentTarget(comment, candidates) {
  const query = terms(comment.text);
  const documents = candidates.map(candidate => ({ candidate, words: terms(candidate.text) }));
  const frequency = new Map();
  for (const { words } of documents) for (const word of words) frequency.set(word, (frequency.get(word)||0)+1);
  const ranked = documents.map(({ candidate, words }) => {
    const matches = [...words].filter(word => query.has(word));
    const score = matches.reduce((sum,word)=>sum+Math.log(1+documents.length/frequency.get(word)),0)/Math.sqrt(Math.max(1,words.size));
    return { candidate, matches, score };
  }).sort((a,b)=>b.score-a.score);
  const best = ranked[0];
  if (!best || best.matches.length<2 || best.score<0.3 || (ranked[1] && best.score<ranked[1].score*1.25)) return null;
  return best;
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
    const eligible = candidates.filter(other => {
      const value = time(other);
      return value === null || current === null || (value < 0) !== (current < 0) || value <= current;
    });
    const match = contentTarget(c, eligible);
    result.set(c.id, { target: match?.candidate || null, evidence: match?.matches.filter(w=>w.length>2).slice(0,3) || [], candidates: eligible,
      status: match ? 'content' : eligible.length ? 'ambiguous' : 'missing' });
  }
  return result;
}
