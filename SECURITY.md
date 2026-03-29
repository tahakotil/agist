# Security Policy

## Current Security Status

Agist is currently **MVP / pre-authentication** software.

**Important: Agist v0.1.x has no authentication.** The API is fully open by design for local development use. Do not expose the backend port (4400) to the internet or untrusted networks without adding an authentication layer in front of it (e.g. a reverse proxy with Basic Auth, or waiting for v0.2.0 which adds API key authentication).

---

## Known Limitations in v0.1.x

| Area | Status |
|------|--------|
| API Authentication | Not implemented. All endpoints are public. |
| Rate Limiting | Only the `/api/agents/:id/wake` endpoint has a 10s cooldown. |
| CORS | Hardcoded to localhost origins. |
| Input Sanitization | Zod validation on all request bodies; no prompt length cap on wake endpoint. |
| Temp File Permissions | Skill temp dirs in `/tmp` inherit default OS permissions (world-readable on some systems). |
| DB Encryption | SQLite stored in plaintext at `~/.agist/data.db`. |
| HTTPS | Not supported in standalone mode. Use a reverse proxy. |

---

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes (current) |
| < 0.1   | No |

---

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

To report a security issue:

1. Email **security@agist.dev** (or open a [GitHub Security Advisory](https://github.com/tahakotil/agist/security/advisories/new) if email is unavailable).
2. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact assessment
   - Your name/handle for credit (optional)
3. You will receive an acknowledgement within **48 hours**.
4. We aim to release a fix or mitigation within **7 days** for critical issues, **30 days** for others.

We follow responsible disclosure: please give us time to patch before publishing details publicly.

---

## Recommendations for Self-Hosted Deployments

Until v0.2.0 ships authentication, take these precautions:

1. **Bind to localhost only.** The server binds to `0.0.0.0:4400` by default. Use a firewall rule or set `HOST=127.0.0.1` to restrict access.
2. **Reverse proxy with authentication.** Put Nginx or Caddy in front with Basic Auth or OAuth if you need remote access.
3. **Run as a non-root user.** Never run Agist (or the Claude CLI it spawns) as root.
4. **Protect `~/.agist/data.db`.** Set file permissions to `600` so only the running user can read the database.
5. **Rotate your Claude API key periodically.** The key is read from the environment; use a secrets manager if available.
6. **Audit `adapterConfig`.** Only trusted users should be able to call `POST /api/companies/:companyId/agents` or `PATCH /api/agents/:id`, as `adapterConfig` is passed to the Claude CLI environment.

---

## Dependency Security

Run `pnpm audit` regularly to check for known vulnerabilities in dependencies.

Key dependencies and their security surface:
- **sql.js** — runs SQLite as WebAssembly in-process. No network exposure.
- **ws** — WebSocket server. Ensure no unauthenticated write access in production.
- **hono** — HTTP framework. CORS and CSP headers configured in `packages/server/src/index.ts`.
- **nanoid** — Cryptographically secure random IDs. No concerns.

---

## Threat Model (v0.1)

Agist is designed for **single-user local development** on a trusted machine. The threat model does not currently include:

- Network-based attackers
- Multi-tenant isolation
- Data exfiltration from the database
- Prompt injection via the issues or routines description fields

These will be addressed in v0.2.0 (authentication) and v1.0.0 (full security audit).
