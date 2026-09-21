# Security

Never post keys, passwords, raw comment datasets or private logs in issues. Use GitHub private vulnerability reporting when available; otherwise request a private contact channel without publishing exploit details.

Hosted APIs require a site password before collection or provider calls. Keep provider keys server-side. A fork must use its own infrastructure and credentials. Use HTTPS, random passwords, provider spending limits and hosting rate limits. Do not expose an unprotected development server. Password holders can consume credits; this is not a multi-user authentication or quota platform.

If credentials leak, revoke or rotate them immediately. Deleting a file or commit cannot invalidate copies. Check branches, tags, artifacts and logs. Keep backups outside Git. No audit guarantees the absence of vulnerabilities.
