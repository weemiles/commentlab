import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeVideo } from "./lib/analyze-video.js";
import { streamAnalysis } from "./lib/analysis-stream.js";
import { rejectUnauthorized, requireVisitorKey, localInstallationKey } from './lib/access.js';

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const maxAllowed = Math.max(100, Number(process.env.MAX_COMMENTS || 200000));
const collectorUrl = process.env.YOUTUBE_COLLECTOR_URL || '';
const mimeTypes = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png" };
const progressJobs = new Map();

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow, noarchive" });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("요청이 너무 큽니다.");
  }
  return JSON.parse(body || "{}");
}

async function handleAnalyze(request, response) {
  const apiKey = request.headers['x-jev-api-key'] ? requireVisitorKey(request, response) : (localInstallationKey(request) || requireVisitorKey(request, response));
  if (!apiKey) return;
  try {
    const body = await readJson(request);
    if (String(request.headers.accept || "").includes("application/x-ndjson")) {
      return streamAnalysis(response, body, { maxAllowed, collectorUrl, apiKey });
    }
    const report = (value) => { if (body.jobId) progressJobs.set(body.jobId, { ...value, updatedAt: Date.now() }); };
    json(response, 200, await analyzeVideo(body, { maxAllowed, report, collectorUrl, apiKey }));
  } catch (error) {
    json(response, error.status || 500, { error: error.message || "분석 중 알 수 없는 오류가 발생했습니다." });
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (url.pathname === '/api/progress' && rejectUnauthorized(request, response)) return;
  if (request.method === "GET" && url.pathname === "/api/health") {
    return json(response, 200, { ok: true, collectionMode: "fast-public-page", sentimentEngine: "visitor-jev-key", localKeyConfigured: Boolean(localInstallationKey(request)), maxComments: maxAllowed });
  }
  if (request.method === "GET" && url.pathname === "/api/progress") return json(response, 200, progressJobs.get(url.searchParams.get("id")) || { stage: "waiting", done: 0, total: 0, percent: 0 });
  if (request.method === "POST" && url.pathname === "/api/analyze") return handleAnalyze(request, response);
  if (request.method !== "GET") return json(response, 405, { error: "허용되지 않은 요청입니다." });

  const requestedPath = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
  if (requestedPath.includes("..")) return json(response, 400, { error: "잘못된 경로입니다." });
  try {
    const file = await readFile(join(publicDir, requestedPath));
    response.writeHead(200, { "content-type": mimeTypes[extname(requestedPath)] || "application/octet-stream", "cache-control": requestedPath === "index.html" ? "no-cache" : "public, max-age=3600", "x-robots-tag": "noindex, nofollow, noarchive" });
    response.end(file);
  } catch {
    const index = await readFile(join(publicDir, "index.html"));
    response.writeHead(200, { "content-type": mimeTypes[".html"], "x-robots-tag": "noindex, nofollow, noarchive" });
    response.end(index);
  }
});

server.listen(port, host, () => {
  console.log(`Comment Lens is running at http://${host}:${port}`);
});
