import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./lib/env-file.js";
import { SENTIMENT_VERSION } from './lib/jev-sentiment.js';
import { analyzeVideo } from "./lib/analyze-video.js";
import { streamAnalysis } from "./lib/analysis-stream.js";
import { rejectUnauthorized, requireVisitorKey, localInstallationKey } from './lib/access.js';
import { messageFor, publicMessage, requestLanguage, localeError } from './lib/messages.js';
import { resolveMaxComments } from './lib/limits.js';
import { createProgressStore } from './lib/progress.js';

loadEnvFile();

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const maxAllowed = resolveMaxComments();
const collectorUrl = process.env.YOUTUBE_COLLECTOR_URL || '';
const mimeTypes = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png" };

// The browser bundle is a build output, not a checked-in file. Fail loudly
// instead of serving an index that loads a script which is not there.
if (!existsSync(join(publicDir, "ui.js"))) {
  console.error("public/ui.js is missing. Run `npm run build` before `npm start`.");
  process.exit(1);
}

const progressJobs = createProgressStore();

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow, noarchive" });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw localeError("request_too_large", { status: 413 });
  }
  return JSON.parse(body || "{}");
}

async function handleAnalyze(request, response) {
  const apiKey = request.headers['x-jev-api-key'] ? requireVisitorKey(request, response) : (localInstallationKey(request) || requireVisitorKey(request, response));
  if (!apiKey) return;
  let language = requestLanguage(request);
  try {
    const body = await readJson(request);
    language = requestLanguage(request, body);
    if (String(request.headers.accept || "").includes("application/x-ndjson")) {
      return streamAnalysis(response, body, { maxAllowed, collectorUrl, apiKey, language });
    }
    const report = (value) => { if (body.jobId) progressJobs.set(body.jobId, value); };
    json(response, 200, await analyzeVideo(body, { maxAllowed, report, collectorUrl, apiKey }));
  } catch (error) {
    if (!(error instanceof SyntaxError)) console.warn(`Analysis request failed: ${error.message}`);
    json(response, error.status || 500, { error: publicMessage(error, language) });
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (url.pathname === '/api/progress' && rejectUnauthorized(request, response)) return;
  if (request.method === "GET" && url.pathname === "/api/health") {
    return json(response, 200, { ok: true, sentimentVersion: SENTIMENT_VERSION, opinionVersion: 'topics-v2', videoContextEnabled: true, collectionMode: "fast-public-page", sentimentEngine: "visitor-jev-key", localKeyConfigured: Boolean(localInstallationKey(request)), maxComments: maxAllowed });
  }
  if (request.method === "GET" && url.pathname === "/api/progress") return json(response, 200, progressJobs.get(url.searchParams.get("id")) || { stage: "waiting", done: 0, total: 0, percent: 0 });
  if (request.method === "POST" && url.pathname === "/api/analyze") return handleAnalyze(request, response);
  const language = requestLanguage(request);
  if (request.method !== "GET") return json(response, 405, { error: messageFor("method_not_allowed", language) });
  if (url.pathname.startsWith("/api/")) return json(response, 404, { error: messageFor("invalid_path", language) });

  const requestedPath = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
  if (requestedPath.includes("..")) return json(response, 400, { error: messageFor("invalid_path", language) });
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
  console.log(`Commentlab is running at http://${host}:${port}`);
});
