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

Edit `.env`: set your own `TYPESAFE_API_KEY` and `TYPESAFE_MODEL`. Then:

```sh
npm run build
npm start
```

Open http://127.0.0.1:4173. Choose the comment language, paste a YouTube URL, and submit. Expand **Site access password** if your installation requires one. This is the site's password, NOT your Jev API key.

## Features and interpretation

- Public comment/reply collection without a YouTube Data API key.
- Positive: praise, congratulations, gratitude and support.
- Negative: personal abuse, belittling and malicious mockery.
- Neutral: constructive criticism, serious disagreement, information and questions.
- Mixed: sincere support and hostility in the same comment.
- Jev receives bounded parent and same-thread tagged-account context. Missing and ambiguous references remain marked. Account names are not opinion topics.
- Repeated-posting signals identify comments for review, not proof of automation. Suspected automated comments are excluded from common-opinion groups.
- Author filters, thread inspection, assessment reasons and CSV export.

Opinion grouping and summaries are heuristic/keyword-based. Classification can be wrong. Missing Jev configuration uses limited local word rules. A configured provider failure stops analysis after a bounded retry; it never silently replaces AI results with local labels. Inspect `sentimentEngine` and `sentimentFallbackReason` in the response. Local results are not cached. Author percentages exclude mixed comments; mixed-only authors have no three-way dominant tendency.

## Configuration and deployment

See `.env.example`. Keys are server-side only. The app never searches neighboring projects for credentials. `JEV_ENV_PATH` is an explicit opt-in path to your own environment file.

Deploy YOUR fork to Vercel, or run the Node server on your own host. Build with `npm ci && npm run build`; Node hosts start with `npm start`. GitHub Pages cannot run the backend.

Before hosting, set `COMMENTLAB_ACCESS_TOKEN` to a long random password and configure your own `TYPESAFE_API_KEY` and `TYPESAFE_MODEL` in server-side secrets. Generate a password:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Hosted analysis and collector routes reject requests without that password; missing configuration fails closed. Local loopback development may omit it. Static assets and health remain public. Use HTTPS. Programmatic clients send `Authorization: Bearer <YOUR-SITE-PASSWORD>`. Never put keys or the site password in source code or URLs.

`MAX_COMMENTS` caps each job; start at 3000. `YOUTUBE_FETCH_CONCURRENCY` defaults to 16. Reduce it or increase `YOUTUBE_REQUEST_DELAY_MS` when YouTube restricts requests. Collection uses unofficial public endpoints and can fail or change. Respect applicable terms and access controls. Optional `yt-dlp` fallback is separately installed and only works on the Node server.

Optional `YOUTUBE_COLLECTOR_URL` must point to a collector you own or are authorized to use. Set its `YOUTUBE_COLLECTOR_TOKEN`. Never point installations to the maintainer's deployment.

Password holders can consume credits. Configure provider spending limits, hosting firewall/rate limits and monitoring. This project has no multi-user identity or distributed quota system.

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

When Jev is enabled, comments, parent/tag context and video metadata are sent to TypeSafe. Review its terms before processing data. Results are cached in bounded process memory for up to ten minutes; no database is configured. Browser results are in memory; downloaded CSV files are controlled by users. Hosting providers may retain logs. No maintainer API connection or telemetry is bundled.

## License

MIT; see [LICENSE](LICENSE). Use, modification and commercial reuse are permitted under its terms. The license grants no access to anyone else's API, credentials, infrastructure or branding and does not prevent reuse of ideas. Third-party UI notices are retained in `src/components/ui/`.
