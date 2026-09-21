# Commentlab

Self-hosted YouTube comment and conversation analysis, powered by your own Jev/TypeSafe account.

**No maintainer API access, credentials or hosted-service entitlement is included. Every installation must use its own keys and infrastructure.**

## Install

Requires Node.js 22.16+ or current LTS and npm.

```sh
git clone <YOUR-FORK-URL> commentlab
cd commentlab
npm ci
npm run setup
```

Review `.env` and choose `TYPESAFE_MODEL`. Then:

```sh
npm run build
npm start
```

Open http://127.0.0.1:4173. Choose the comment language, paste a YouTube URL, and submit. Enter your own Jev API key in the password-style field. It is held in browser memory only and sent to this server over HTTPS, then to TypeSafe for your request. Refreshing clears the key. Do not enter a key into an instance you do not trust.

## Features and interpretation

- Public comment/reply collection without a YouTube Data API key.
- Positive: praise, congratulations, gratitude and support.
- Negative: personal abuse, belittling and malicious mockery.
- Neutral: constructive criticism, serious disagreement, information and questions.
- Mixed: sincere support and hostility in the same comment.
- Jev receives bounded parent and same-thread tagged-account context. Missing and ambiguous references remain marked. Account names are not opinion topics.
- Repeated-posting signals identify comments for review, not proof of automation. Suspected automated comments are excluded from common-opinion groups.
- Author filters, thread inspection, assessment reasons and CSV export.

Opinion grouping and summaries are heuristic/keyword-based. Classification can be wrong. Web requests always require the visitor's own key. Invalid keys and provider failures stop analysis after a bounded retry; they never silently use the owner's credentials or replace AI results with local labels. Inspect `sentimentEngine` and `sentimentFallbackReason` in the response. Local results are not cached. Author percentages exclude mixed comments; mixed-only authors have no three-way dominant tendency.

## Configuration and deployment

See `.env.example`. Keys are server-side only. The app never searches neighboring projects for credentials. `JEV_ENV_PATH` is an explicit opt-in path to your own environment file.

Deploy YOUR fork to Vercel, or run the Node server on your own host. Build with `npm ci && npm run build`; Node hosts start with `npm start`. GitHub Pages cannot run the backend.

Web analysis uses **bring your own key (BYOK)**. Do NOT configure an owner `TYPESAFE_API_KEY` for the public web service. Every `/api/analyze` request must include the visitor's `x-jev-api-key` header. Missing keys are rejected before collection. Keys are request-scoped, not logged by the app, persisted, returned, or shared across jobs. Visitor jobs bypass shared caches and in-flight deduplication. An invalid key never falls back to owner credentials.

Use HTTPS and configure your hosting logs to redact `x-jev-api-key` and Authorization headers. Hosting operators can technically access keys while processing requests; self-host if you do not trust an operator. Static assets and health remain public.

The optional `/api/collect` service remains private: set `COMMENTLAB_ACCESS_TOKEN` to a strong random token to use it, or leave it unset to keep it disabled on hosted deployments. This is separate from visitor Jev keys and is not shown in the web UI.

`MAX_COMMENTS` caps each job; start at 3000. `YOUTUBE_FETCH_CONCURRENCY` defaults to 16. Reduce it or increase `YOUTUBE_REQUEST_DELAY_MS` when YouTube restricts requests. Collection uses unofficial public endpoints and can fail or change. Respect applicable terms and access controls. Optional `yt-dlp` fallback is separately installed and only works on the Node server.

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

When Jev is enabled, comments, parent/tag context and video metadata are sent to TypeSafe. Review its terms before processing data. Visitor requests are not cached across jobs; no database is configured. Browser results are in memory; downloaded CSV files are controlled by users. Hosting providers may retain logs. No maintainer API connection or telemetry is bundled.

## License

MIT; see [LICENSE](LICENSE). Use, modification and commercial reuse are permitted under its terms. The license grants no access to anyone else's API, credentials, infrastructure or branding and does not prevent reuse of ideas. Third-party UI notices are retained in `src/components/ui/`.
