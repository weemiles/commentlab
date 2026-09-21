# Commentlab

Self-hosted YouTube comment and conversation analysis, powered by your own Jev/TypeSafe account.

**No maintainer API access, credentials or hosted-service entitlement is included. Every installation must use its own keys and infrastructure.**

## Install

Requires Node.js 22.16+ or current LTS and npm.

```sh
git clone https://github.com/weemiles/commentlab.git commentlab
cd commentlab
npm ci
npm run setup
```

Set your own `TYPESAFE_API_KEY` in `.env` once and choose `TYPESAFE_MODEL`. The setup script restricts `.env` permissions to your OS user; it is ignored by Git. Then:

```sh
npm run build
npm start
```

The browser bundle in `public/` is a build output and is not checked into Git, so `npm run build` must run before `npm start`; the server refuses to start without it.

Open http://127.0.0.1:4173. Choose the comment language, paste a YouTube URL, and submit. Local installations automatically use your environment key, with no key field in the UI. No maintainer website is involved. YouTube and TypeSafe internet access is still required.

### Terminal only (no browser)

After installation and key configuration:

```sh
npm run analyze -- "https://www.youtube.com/watch?v=VIDEO_ID" ko
# Save the JSON report without npm's command banner:
npm run --silent analyze -- "https://www.youtube.com/watch?v=VIDEO_ID" en > report.json
```

A frontend build or running web server is not needed for terminal use. Reports contain collected comments; keep them private unless you intend to share them.

## Features and interpretation

- Public comment/reply collection without a YouTube Data API key.
- Positive (kind comments): sincere praise, congratulations, gratitude, comfort and support.
- Negative (abusive comments): personal abuse, belittling, harassment and malicious mockery; not disagreement itself.
- Neutral: neither clearly kind nor abusive, including ordinary information/non-abusive criticism and uncertain intent. Reasons distinguish insufficient context from ordinary non-hostile content.
- Mixed: sincere support and hostility in the same comment.
- Jev receives bounded parent and same-thread tagged-account context. Missing and ambiguous references remain marked. Account names are not opinion topics.
- Repeated-posting signals identify comments for review, not proof of automation. Suspected automated comments are excluded from common-opinion groups.
- Author filters, thread inspection, assessment reasons and CSV export.

Opinion grouping and summaries are heuristic/keyword-based. Classification can be wrong. Public web requests always require the visitor's own key. Invalid keys and provider failures stop analysis after a bounded retry; they never silently use the owner's credentials or replace AI results with local labels. There is no local-label fallback path at all, so `sentimentEngine` in a successful response is always `jev`. Complete results are cached in process memory for 10 minutes, isolated by a process-salted HMAC of the API key and request parameters. People sharing an API key share that cache scope. Author percentages exclude mixed comments; mixed-only authors have no three-way dominant tendency.

## Configuration and deployment

See `.env.example`. Keys are server-side only. The app never searches neighboring projects for credentials. `JEV_ENV_PATH` is an explicit opt-in path to your own environment file; it is read once at startup and never overrides a value already set in the environment.

Error responses are returned in the visitor's language, chosen from `analysisLanguage` and then `Accept-Language`. They describe what went wrong in fixed wording; YouTube, collector and provider text is written to the server log only, never returned to the client.

Deploy YOUR fork to Vercel, or run the Node server on your own host. Build with `npm ci && npm run build`; Node hosts start with `npm start`. GitHub Pages cannot run the backend.

Public web analysis uses **bring your own key (BYOK)**. The local Node server alone can read `TYPESAFE_API_KEY` for loopback requests with a local Host and same-origin browser context. Binding to a non-loopback interface disables this convenience. Do not expose or proxy the local server publicly. Do NOT configure an owner `TYPESAFE_API_KEY` for the public web service. Every `/api/analyze` request must include the visitor's `x-jev-api-key` header. Missing keys are rejected before collection. Keys are request-scoped, not logged by the app, persisted, returned, or shared across jobs. There is no cross-key result sharing or in-flight deduplication. Cache memory is bounded to 16 MB per process and disappears on restart. An invalid key never falls back to owner credentials.

Use HTTPS and configure your hosting logs to redact `x-jev-api-key` and Authorization headers. Hosting operators can technically access keys while processing requests; self-host if you do not trust an operator. Static assets and health remain public.

The optional `/api/collect` service remains private: set `COMMENTLAB_ACCESS_TOKEN` to a strong random token to use it, or leave it unset to keep it disabled on hosted deployments. This is separate from visitor Jev keys and is not shown in the web UI.

`MAX_COMMENTS` caps each job and defaults to 200000, which is also the safety ceiling. This removes the former 3000-comment default; collection may still be limited by availability, request failures, or hosting timeouts. `YOUTUBE_FETCH_CONCURRENCY` defaults to 32. Reduce it or increase `YOUTUBE_REQUEST_DELAY_MS` when YouTube restricts requests. Collection uses unofficial public endpoints and can fail or change. Respect applicable terms and access controls. Optional `yt-dlp` fallback is separately installed and only works on the Node server.

Optional `YOUTUBE_COLLECTOR_URL` must point to a collector you own or are authorized to use. Set its `YOUTUBE_COLLECTOR_TOKEN`. Never point installations to the maintainer's deployment.

Jev charges each visitor's provider account. Hosting and YouTube collection still use the host's resources, so configure hosting firewall/rate limits and monitoring. A syntactically valid key is not validated by TypeSafe until classification. This project has no multi-user identity or distributed quota system.

## Bundled agent skill

`npm run setup` installs `skills/commentlab-maintenance/SKILL.md` into this checkout's `.agents/skills/` and `.claude/skills/`, and creates `.env` from the template. Existing files are preserved. Nothing is installed in your home directory; no external plugins, models, keys or private skills are downloaded.

Compatible coding agents can use this skill to maintain collection, conversation context and deployment security. If your agent does not discover project-local skills, open the bundled SKILL.md manually. The web application does not require an agent.

## Development

```sh
npm test
npm run build
npm run dev
```

Tests are offline. Live provider tests require your own key and incur costs. Do not commit real comment exports or credentials. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## Privacy

When Jev is enabled, comments, parent/tag context and video metadata are sent to TypeSafe. Review its terms before processing data. Complete reports may remain in the same-key memory cache for up to 10 minutes; no database is configured. Browser results are in memory; downloaded CSV files are controlled by users. Hosting providers may retain logs. No maintainer API connection or telemetry is bundled.

## License

MIT; see [LICENSE](LICENSE). Use, modification and commercial reuse are permitted under its terms. The license grants no access to anyone else's API, credentials, infrastructure or branding and does not prevent reuse of ideas. Third-party UI notices are retained in `src/components/ui/`.

### Private video context

Before collecting comments, analysis attempts to read public YouTube captions (including automatic captions). The interface shows “영상 내용 분석 중” / “Analyzing video content”; transcript text stays out of progress events and analysis results. Jev receives the available transcript as untrusted context for interpreting references, quotations and targets, not as proof or an instruction. Missing or blocked captions do not stop comment analysis. This does not transcribe audio when captions are absent. Long transcripts are explicitly marked partial and limited to 24,000 characters, retaining the opening and ending. The remote collector must support the `transcript` action; older collectors safely fall back to comment-only context.

Local installations additionally try the already-installed `yt-dlp` when direct caption retrieval fails. No package is installed and no audio/video is downloaded. Available captions are retained even if a second language fails; temporary caption files are deleted after reading. The UI keeps a short caption availability status after the initial video-content stage, without exposing the transcript. Opinion grouping normalizes common Korean particles and merges overlapping topic groups before ranking, while keeping sentiment labels and explicit negations separate. These are lexical groups, not a guarantee of semantic equivalence.
