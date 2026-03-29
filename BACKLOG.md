# Agist Backlog

Findings from full codebase audit conducted 2026-03-30. Items are grounded in actual source code — no speculation.

---

## Bugs

- [ ] [BUG-001] **Run status "timeout" not in shared RunStatus type** — `adapter.ts` sets `status = 'timeout'` on process timeout, but `packages/shared/src/types.ts` only enumerates `queued | running | succeeded | failed | cancelled`. Frontend will receive an unexpected status value and may render it incorrectly.

- [ ] [BUG-002] **Run status mismatch between backend and shared types** — Backend writes `'success'` and `'failed'` to the DB, but `packages/shared/src/types.ts` defines `RunStatus` as `"succeeded" | "failed"`. The frontend `api.ts` uses `"success"` separately. All three disagree; DB values never match the shared enum.

- [ ] [BUG-003] **CompanyStatus enum mismatch** — `packages/shared/src/types.ts` defines `CompanyStatus = "active" | "paused" | "archived"`, but `packages/server/src/routes/companies.ts` accepts `active | inactive | suspended`. Same table, incompatible enums.

- [ ] [BUG-004] **IssueStatus mismatch** — Shared types define `IssueStatus = "backlog" | "todo" | "in_progress" | "in_review" | "done"`, but `packages/server/src/routes/issues.ts` only allows `open | in_progress | resolved | closed | wont_fix`. DB can contain either set depending on which path wrote it.

- [ ] [BUG-005] **`wakeRateLimit` map is never pruned** — The in-memory rate limit map grows unbounded if many unique agents are woken. Over days/weeks of uptime this is a minor memory leak.

- [ ] [BUG-006] **Double `UPDATE agents SET spent_monthly_cents`** — In `adapter.ts` the close handler runs two separate UPDATE statements that both write `spent_monthly_cents + costCents` for the same `agentId` on lines ~291–298. The second update doubles the agent-level spend.

- [ ] [BUG-007] **`dashboard/stats` silently swallows all DB errors** — The entire try block in `health.ts` catches and discards exceptions, returning zeros for all metrics. Errors are invisible to operators.

- [ ] [BUG-008] **DB auto-save interval never cleared on shutdown** — `packages/server/src/db.ts` line 48 creates a `setInterval` for DB saves but the handle is not stored and cannot be cleared. After `shutdown()` is called, the interval continues firing until Node exits.

---

## Missing Features

- [ ] [FEAT-001] **No API authentication** — All endpoints are public. Any client on the network can create companies, wake agents, read logs, and delete data. Minimum viable: API key header check (`X-Api-Key`) before any mutating route.

- [ ] [FEAT-002] **No pagination on list endpoints** — `GET /api/companies`, `GET /api/agents`, `GET /api/companies/:id/routines`, `GET /api/companies/:id/issues` return all rows unbounded. Under load (1000+ agents) this will OOM the process.

- [ ] [FEAT-003] **No sort/filter on agents list** — `GET /api/agents` only orders by `created_at DESC`. No filter by status, model, or role — important for the dashboard "running agents" view.

- [ ] [FEAT-004] **No DB backup mechanism** — The SQLite file at `~/.agist/data.db` has no backup rotation. A single corrupted write loses all data. Should support scheduled copy to `data.db.bak` at minimum.

- [ ] [FEAT-005] **No log rotation or size cap on `log_excerpt`** — `logLines.slice(-200)` caps the in-memory buffer, but old run records with large `log_excerpt` text can grow the SQLite file without bound. No TTL or cleanup job exists.

- [ ] [FEAT-006] **No WebSocket connection limit** — `packages/server/src/ws.ts` accepts unlimited WebSocket clients. A single misbehaving client can exhaust file descriptors.

- [ ] [FEAT-007] **Scheduler does not track running spawns** — If the scheduler fires while a previous tick's `spawnClaudeLocal` promise is still in flight (e.g. a slow Claude run overlapping the 30s interval), a second spawn fires for the same routine. The `agent.status === 'running'` guard helps but only if the first spawn has updated the DB in time.

- [ ] [FEAT-008] **No `GET /api/routines` (all routines across companies)** — The dashboard `/routines` page must work around this by fetching per company. A global list endpoint is needed for the routines management page.

- [ ] [FEAT-009] **No DELETE for runs** — Old runs accumulate with no way to clear them via API. A `DELETE /api/agents/:id/runs` bulk-delete or TTL-based cleanup job is missing.

- [ ] [FEAT-010] **Skill injection writes to `/tmp` with no max size guard** — `buildSkillDir` in `adapter.ts` creates temp dirs with no disk usage check. Rapid agent waking can fill `/tmp`.

---

## Tech Debt

- [ ] [DEBT-001] **CORS hardcodes localhost origins** — `packages/server/src/index.ts` only allows `localhost:3004`, `localhost:3000`, and `localhost:4400`. Deploying to any other host requires source changes. Should be driven by `CORS_ORIGINS` env var.

- [ ] [DEBT-002] **`packages/db/` is an unused parallel implementation** — `packages/db/src/queries.ts` defines a complete query layer (makeCompanyQueries, makeAgentQueries, etc.) that is never imported by `packages/server/`. The server has its own inline `db.ts`. This dead code adds confusion about which layer is canonical.

- [ ] [DEBT-003] **`computeNextRunAt` duplicated in two files** — Identical function exists in both `packages/server/src/scheduler.ts` and `packages/server/src/routes/routines.ts`. Should be extracted to a shared utility.

- [ ] [DEBT-004] **`packages/shared/src/validators.ts` is unused in server routes** — The server defines its own Zod schemas inline in each route file rather than importing from the shared package. Two schema sets for the same entities.

- [ ] [DEBT-005] **No structured logging** — All server output uses raw `console.log/error`. No log levels, no JSON output, no request-ID correlation. Impossible to parse logs programmatically.

---

## Security

- [ ] [SEC-001] **No authentication on any API endpoint** — Full CRUD access to all resources without any credentials. Critical for any network-exposed deployment.

- [ ] [SEC-002] **No rate limiting on non-wake endpoints** — Only `POST /api/agents/:id/wake` has a 10s cooldown. All other write endpoints (`POST /api/companies`, `POST /api/companies/:id/agents`, etc.) have no rate limiting.

- [ ] [SEC-003] **`adapterConfig` stored as raw JSON without sanitization** — Arbitrary key-value pairs from API callers are stored in `adapter_config` and injected into the Claude CLI process environment. A malicious caller can inject config keys like `defaultPrompt` with harmful content.

- [ ] [SEC-004] **No input sanitization on `prompt` field in wake endpoint** — The prompt is passed directly to Claude CLI via `-p`. While Claude CLI handles this, extremely large prompts or prompts with shell-special characters could cause unexpected behavior. Should add max length validation.

- [ ] [SEC-005] **Temp directories in `/tmp` readable by all users** — `buildSkillDir` in `adapter.ts` creates world-readable temp dirs containing agent context (name, role, company info). On multi-user hosts this leaks agent configuration.

---

## Performance

- [ ] [PERF-001] **No DB index on `runs.finished_at`** — The `dashboard/stats` endpoint queries `runs WHERE created_at > ?` (covered by index), but agent run history queries do full scans on large tables. `finished_at` and `source` have no indexes.

- [ ] [PERF-002] **`sql.js` (WebAssembly SQLite) is single-threaded** — All DB reads/writes block the Node.js event loop. Under high concurrency (many simultaneous agent runs) DB operations serialize. Should evaluate `better-sqlite3` for true synchronous non-blocking ops, or at minimum document this constraint.

- [ ] [PERF-003] **SSE heartbeat timer per connection not cleared on server shutdown** — Each SSE client spawns its own `setInterval` that is only cleared when the client disconnects. If many clients connect before a restart, shutdown can be slow.
