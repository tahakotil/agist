# Agist Roadmap

---

## v0.1.0 — Current MVP (released)

Core infrastructure for local multi-agent orchestration.

**Completed:**
- Hono HTTP API (companies, agents, routines, runs, issues)
- SQLite persistence via sql.js (WAL mode, auto-save every 30s)
- Scheduler: cron-based routine heartbeats (cron-parser v5, 30s check interval)
- Claude CLI adapter: spawn, stream stdout, parse stream-json tokens, estimate cost
- WebSocket live log viewer (subscribe per agent or wildcard `*`)
- SSE events for agent status and run completion
- Next.js 16 dashboard (shadcn/ui, Tremor charts, React Flow org chart)
- Skill injection: agent context written to temp `.claude/skills/SKILL.md` and passed via `--add-dir`
- Seed script with Acme Corp demo data

---

## v0.2.0 — Stability & Security (next)

Fix bugs found in audit, add minimum viable auth and hardening.

**Planned:**
- [ ] API key authentication (`X-Api-Key` header, configurable via env var)
- [ ] Fix RunStatus / CompanyStatus / IssueStatus enum mismatches between shared types and server
- [ ] Fix double `spent_monthly_cents` update in adapter
- [ ] Add `timeout` to shared RunStatus; update frontend badges
- [ ] Rate limiting on all mutating endpoints (not just wake)
- [ ] CORS configurable via `CORS_ORIGINS` env var
- [ ] Input length validation on prompt field in wake endpoint
- [ ] Prune expired entries from `wakeRateLimit` map
- [ ] Fix DB auto-save interval not cleared on shutdown

---

## v0.3.0 — Pagination & Filtering

Make the API production-usable at scale.

**Planned:**
- [ ] Pagination on all list endpoints (`?page=&limit=` or cursor-based)
- [ ] Filter agents by status, model, role
- [ ] Filter runs by status, source, date range
- [ ] `GET /api/routines` — global routines list
- [ ] `DELETE /api/agents/:id/runs` — bulk run cleanup
- [ ] Run TTL: configurable auto-delete runs older than N days
- [ ] Sort options on agents and runs lists

---

## v0.4.0 — Observability

Structured logs, metrics, and operational visibility.

**Planned:**
- [ ] Structured JSON logging with log levels (debug/info/warn/error)
- [ ] Request-ID correlation header (`X-Request-Id`)
- [ ] `GET /api/metrics` — Prometheus-compatible counters (runs total, runs by status, tokens used)
- [ ] Log rotation: cap `log_excerpt` size per run; purge old run logs on a schedule
- [ ] Dashboard: cost-over-time chart with per-agent breakdown (currently per-model)
- [ ] Dashboard: failed run alerts panel

---

## v0.5.0 — Multi-Adapter Support

Allow agents to use adapters other than Claude CLI.

**Planned:**
- [ ] Adapter interface: define `RunAdapter` interface in shared package
- [ ] `openai` adapter (GPT-4o, GPT-4-mini)
- [ ] `anthropic-api` adapter (direct API, no CLI dependency)
- [ ] `mock` adapter for testing (immediate success/failure, no subprocess)
- [ ] Adapter config validation at agent creation time
- [ ] Hot-swap adapter without deleting agent

---

## v0.6.0 — DB & Backup Hardening

Replace sql.js with better-sqlite3 and add backup strategy.

**Planned:**
- [ ] Migrate from sql.js (WebAssembly) to better-sqlite3 (native, synchronous, non-blocking)
- [ ] Scheduled DB backup: copy `data.db` to `data.db.bak.YYYY-MM-DD` daily
- [ ] `GET /api/admin/backup` — manual trigger for DB snapshot download
- [ ] DB migration system: versioned SQL migration files instead of idempotent CREATE IF NOT EXISTS
- [ ] Extract `packages/db/` query layer as the canonical DB interface (eliminate inline queries in server routes)

---

## v0.7.0 — CLI & npx Setup

Make Agist installable in one command.

**Planned:**
- [ ] `packages/cli/` — `npx agist` command
- [ ] `npx agist setup` — interactive wizard (creates `~/.agist/config.json`, asks for API keys)
- [ ] `npx agist start` — starts backend and opens dashboard
- [ ] `npx agist status` — show running agents and last run times
- [ ] `npx agist logs <agentId>` — tail live logs in terminal
- [ ] Published to npm as `agist`

---

## v0.8.0 — Projects & Hierarchies

Multi-team, multi-project support.

**Planned:**
- [ ] Projects table (a company can have multiple projects)
- [ ] Agent `reportsTo` hierarchy enforced in API (currently only stored, not validated)
- [ ] Issue `projectId` field is stored but no project CRUD exists — implement full project endpoints
- [ ] Agent groups / teams (label-based grouping within a company)
- [ ] Project-scoped routines

---

## v0.9.0 — Webhooks & Integrations

Push events to external systems.

**Planned:**
- [ ] Webhooks: POST to user-configured URL on run events (run.completed, agent.error)
- [ ] Slack integration: post run summaries to a channel
- [ ] GitHub integration: create issues on agent failure
- [ ] Email notifications on critical agent errors
- [ ] Zapier/n8n compatible webhook format

---

## v1.0.0 — Production-Ready

General availability release with full documentation and test coverage.

**Planned:**
- [ ] End-to-end test suite (Playwright for dashboard, HTTP tests for API)
- [ ] Unit tests for scheduler, adapter, DB queries (80%+ coverage)
- [ ] Full OpenAPI 3.1 spec (`GET /api/openapi.json`)
- [ ] Docker image: `ghcr.io/tahakotil/agist:latest`
- [ ] Docker Compose: agist + optional Caddy reverse proxy
- [ ] HTTPS support in standalone mode (Let's Encrypt via Caddy)
- [ ] Role-based access: admin vs read-only API keys
- [ ] Complete user-facing documentation (docs site)
- [ ] Changelog maintained in `CHANGELOG.md`
- [ ] GitHub Releases with signed tarballs
