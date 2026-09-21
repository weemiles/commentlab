# Security

Never post keys, passwords, raw comment datasets or private logs in issues. Use GitHub private vulnerability reporting when available; otherwise request a private contact channel without publishing exploit details.

The public analysis API requires the visitor's own Jev key. Missing keys are rejected before collection; provider failures never fall back to owner credentials. Visitor keys pass through the server to TypeSafe and are not persisted by the app. Configure header redaction in hosting logs. Use only trusted hosts. Optional collector/progress endpoints remain protected by a separate site token. A fork uses its own infrastructure; hosting resources still incur costs. Use HTTPS, provider spending limits and hosting rate limits. This is not a distributed quota platform.

If credentials leak, revoke or rotate them immediately. Deleting a file or commit cannot invalidate copies. Check branches, tags, artifacts and logs. Keep backups outside Git. No audit guarantees the absence of vulnerabilities.
