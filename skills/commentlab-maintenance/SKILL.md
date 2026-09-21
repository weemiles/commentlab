---
name: commentlab-maintenance
description: Maintain Commentlab collection, contextual classification and self-hosted API security.
---

# Commentlab maintenance

Read README.md and SECURITY.md in the project root for setup and hosting boundaries.

- `lib/youtube-fast.js`: preserve IDs and parent relationships. Mark partial failures incomplete; do not bypass access restrictions.
- `lib/jev-sentiment.js`: use bounded same-thread context. Neutral includes constructive disagreement; factual arguments do not excuse personal attacks. Test quoted insults, sarcasm and ambiguous references. Bump SENTIMENT_VERSION when criteria change.
- `lib/analyzer.js`: group content rather than handles. Suspected automated comments remain inspectable but are excluded from opinion groups.
- `lib/access.js`: hosted requests must be authorized before collector/provider calls. Never load another project's keys or use the maintainer's API.
- `src/main.tsx`: rebuild generated public assets with npm run build; do not edit bundles manually.

Use synthetic fixtures and run relevant offline tests. Paid API calls, deployments,
third-party installations and production mutations require user authorization.
Keep credentials, logs, exports and backups out of Git. This skill provides no
access to the maintainer's infrastructure.
