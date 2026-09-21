const LIMIT = 24000;
const SIZE = 1000;
const terms = text => new Set(String(text || '').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []);

// Keep whole short transcripts. For long videos, combine distributed coverage
// with relevant middle passages, without sending the entire video every batch.
export function selectTranscriptContext(context = {}, comments = []) {
  const text = String(context.text || '');
  if (text.length <= LIMIT) return { text, partial: Boolean(context.partial) };
  const excerpts = [];
  for (let start = 0; start < text.length; start += SIZE) {
    const begin = Math.max(0, Math.min(start, text.length - SIZE) - 150);
    excerpts.push({ start: begin, text: text.slice(begin, start + SIZE), index: excerpts.length });
  }
  const queries = comments.map(comment => terms(`${comment.text || ''} ${comment.parentText || ''}`));
  const scored = excerpts.map(excerpt => {
    const body = excerpt.text.toLowerCase();
    const scores = queries.map(query => [...query].reduce((sum, term) => sum + (body.includes(term) ? Math.min(term.length, 8) : 0), 0));
    return { ...excerpt, scores, score: Math.max(0, ...scores) };
  });
  const selected = new Map();
  let used = 0;
  const add = excerpt => {
    if (selected.has(excerpt.index)) return;
    const rendered = `[Source offset ${excerpt.start}] ${excerpt.text}`;
    if (used + rendered.length + 2 > LIMIT) return;
    selected.set(excerpt.index, { ...excerpt, rendered });
    used += rendered.length + 2;
  };
  // Reserve coverage throughout the video, not just its opening and ending.
  for (let i = 0; i < 8; i++) add(scored[Math.round(i * (scored.length - 1) / 7)]);
  // Give each comment a chance to retrieve evidence before filling by score.
  for (let q = 0; q < queries.length; q++) {
    const best = scored.reduce((a, b) => b.scores[q] > a.scores[q] ? b : a);
    if (best.scores[q] > 0) add(best);
  }
  for (const excerpt of [...scored].sort((a, b) => b.score - a.score || a.start - b.start)) {
    if (excerpt.score > 0) add(excerpt);
  }
  return { text: [...selected.values()].sort((a, b) => a.start - b.start).map(item => item.rendered).join('\n\n'), partial: true };
}
