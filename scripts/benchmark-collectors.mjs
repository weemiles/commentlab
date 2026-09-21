import { performance } from "node:perf_hooks";
import { extractVideoId } from "../lib/youtube.js";
import { fetchFastVideoAndComments } from "../lib/youtube-fast.js";
import { fetchPublicVideoAndComments } from "../lib/youtube-public.js";

const url = process.argv[2];
const maxComments = Number(process.argv[3] || 300);
const videoId = extractVideoId(url);
if (!videoId) throw new Error("올바른 YouTube URL이 필요합니다.");

for (const [name, collect] of [
  ["fast-continuation", () => fetchFastVideoAndComments({ videoId, maxComments, requestDelayMs: 0, concurrency: 8 })],
  ["yt-dlp", () => fetchPublicVideoAndComments({ videoId, maxComments })]
]) {
  const startedAt = performance.now();
  const result = await collect();
  const seconds = (performance.now() - startedAt) / 1000;
  console.log(JSON.stringify({ name, seconds: Number(seconds.toFixed(3)), comments: result.comments.length, commentsPerSecond: Number((result.comments.length / seconds).toFixed(1)) }));
}
