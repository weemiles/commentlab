// One definition for every entry point. The documented starting point is 3000;
// the ceiling only bounds what an operator can raise MAX_COMMENTS to.
export const DEFAULT_MAX_COMMENTS = 3000;
export const MAX_COMMENTS_CEILING = 200000;

export function resolveMaxComments(env = process.env) {
  const configured = Number(env.MAX_COMMENTS || DEFAULT_MAX_COMMENTS);
  if (!Number.isFinite(configured)) return DEFAULT_MAX_COMMENTS;
  return Math.max(100, Math.min(MAX_COMMENTS_CEILING, configured));
}
