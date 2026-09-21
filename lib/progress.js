// Progress is a short-lived hint for the polling UI. Entries expire and the map
// is capped, so a long-running server cannot accumulate one record per job for
// the life of the process.
export const PROGRESS_TTL_MS = 10 * 60 * 1000;
export const PROGRESS_LIMIT = 50;

export function createProgressStore({ ttlMs = PROGRESS_TTL_MS, limit = PROGRESS_LIMIT, now = () => Date.now() } = {}) {
  const jobs = new Map();

  function evict(currentTime) {
    for (const [id, entry] of jobs) {
      if (currentTime - entry.updatedAt > ttlMs) jobs.delete(id);
    }
    while (jobs.size > limit) jobs.delete(jobs.keys().next().value);
  }

  return {
    set(jobId, value) {
      const currentTime = now();
      jobs.delete(jobId);
      jobs.set(jobId, { ...value, updatedAt: currentTime });
      evict(currentTime);
    },
    get(jobId) {
      const entry = jobs.get(jobId);
      if (!entry) return null;
      if (now() - entry.updatedAt > ttlMs) {
        jobs.delete(jobId);
        return null;
      }
      return entry;
    },
    get size() {
      return jobs.size;
    }
  };
}
