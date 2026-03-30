# Agist

Open-source AI agent orchestration platform. Manage multi-agent teams from a single dashboard.

## Project Overview

- **Name:** Agist
- **Repo:** github.com/tahakotil/agist
- **License:** MIT
- **Status:** v0.3.0 — governance (approval gates, audit log), templates, multi-adapter, webhooks, CLI
- **Author:** Taha Kotil (github.com/tahakotil)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router, Turbopack), shadcn/ui, Tremor charts, React Flow |
| Backend | Hono (TypeScript), WebSocket (ws), SSE |
| Database | SQLite via sql.js (WAL mode, zero native deps) |
| Real-time | WebSocket (live logs) + SSE (status updates) |
| Scheduler | cron-parser v5 + 30s interval check + run TTL cleanup |
| Auth | API key (X-Api-Key header) + RBAC (admin/readonly) |
| Adapters | Claude CLI, Anthropic API, OpenAI, Mock |
| CLI | Commander.js (npx agist setup/start/status/logs) |
| Testing | Vitest (505 tests), Playwright (59 E2E tests) |
| CI/CD | GitHub Actions, ESLint, Prettier |
| Deploy | Docker + Docker Compose + Caddy reverse proxy |
| Package Manager | pnpm workspaces (monorepo) |
| Runtime | Node.js 20+ |

## Monorepo Structure

```
packages/
  shared/    — TypeScript types, Zod validators, constants
  db/        — SQLite schema, migrations, queries, seed data
  server/    — Hono API (port 4400), WebSocket, SSE, scheduler, adapters, webhooks
  web/       — Next.js dashboard (port 3004), shadcn/ui, dark mode, pagination
  cli/       — npx agist setup/start/status/logs
```

## Running Locally

```bash
pnpm install
pnpm seed    # optional: load demo data
pnpm dev     # starts backend:4400 + frontend:3004
```

- Backend API: http://localhost:4400
- Dashboard: http://localhost:3004
- OpenAPI Docs: http://localhost:4400/api/docs
- WebSocket: ws://localhost:4400/ws
- SSE events: http://localhost:4400/api/events
- Prometheus metrics: http://localhost:4400/api/metrics
- DB file: ~/.agist/data.db

## Environment Variables

| Var | Default | Description |
|-----|---------|-------------|
| AGIST_AUTH_DISABLED | true | Set false to require API keys |
| CORS_ORIGINS | http://localhost:3004 | Comma-separated allowed origins |
| LOG_LEVEL | info | debug/info/warn/error |
| ANTHROPIC_API_KEY | — | For anthropic-api adapter |
| OPENAI_API_KEY | — | For openai adapter |
| RUN_TTL_DAYS | — | Auto-delete runs older than N days |
| SLACK_WEBHOOK_URL | — | Slack notification webhook |
| GITHUB_TOKEN | — | GitHub issue creation on failures |
| GITHUB_REPO | — | owner/repo format |

## API Endpoints

All list endpoints support `?page=&limit=` pagination. Mutating endpoints require admin API key.

### Auth
- `POST   /api/api-keys` — create API key (admin only, returns raw key once)
- `GET    /api/api-keys` — list keys (admin only, hash never exposed)
- `DELETE /api/api-keys/:id` — revoke key (admin only)

### Companies
- `GET    /api/companies` — list (paginated, ?search=, ?status=, ?sort=)
- `POST   /api/companies` — create {name, description?, budgetMonthlyCents?}
- `GET    /api/companies/:id` — get one
- `PATCH  /api/companies/:id` — update
- `DELETE /api/companies/:id` — delete

### Agents
- `GET    /api/agents` — list all (paginated, ?status=, ?model=, ?role=, ?search=, ?sort=)
- `GET    /api/companies/:companyId/agents` — list by company
- `POST   /api/companies/:companyId/agents` — create {name, role, model?, workingDirectory?, adapterType?}
- `GET    /api/agents/:id` — get one
- `PATCH  /api/agents/:id` — update
- `DELETE /api/agents/:id` — delete
- `POST   /api/agents/:id/wake` — manual wake {prompt?} (rate limited: 10s cooldown)
- `DELETE /api/agents/:id/runs` — bulk delete runs (?olderThan=30d, ?status=failed)
- `GET    /api/agents/:id/context` — get context capsule (markdown string)
- `PUT    /api/agents/:id/context` — update context capsule {capsule} (max 10,000 chars)

### Projects
- `GET    /api/companies/:companyId/projects` — list
- `POST   /api/companies/:companyId/projects` — create {name, description?, workingDirectory?}
- `GET    /api/projects/:id` — get one
- `PATCH  /api/projects/:id` — update
- `DELETE /api/projects/:id` — delete

### Routines
- `GET    /api/routines` — global list (paginated, ?enabled=, ?agentId=)
- `GET    /api/companies/:companyId/routines` — list by company
- `POST   /api/companies/:companyId/routines` — create {agentId, title, cronExpression, timezone?}
- `PATCH  /api/routines/:id` — update
- `DELETE /api/routines/:id` — delete

### Runs
- `GET    /api/runs` — list all (paginated, ?status=, ?source=, ?agentId=, ?from=, ?to=, ?sort=)
- `GET    /api/runs/recent` — last 20 (alias)
- `GET    /api/agents/:agentId/runs` — runs by agent (paginated)
- `GET    /api/runs/:id` — run detail with log excerpt

### Issues
- `GET    /api/companies/:companyId/issues` — list (paginated, ?status=, ?priority=, ?agentId=, ?sort=)
- `POST   /api/companies/:companyId/issues` — create {title, description?, priority?, agentId?}
- `PATCH  /api/issues/:id` — update
- `DELETE /api/issues/:id` — delete

### Webhooks
- `GET    /api/companies/:companyId/webhooks` — list
- `POST   /api/companies/:companyId/webhooks` — create {url, events?, secret?}
- `PATCH  /api/webhooks/:id` — update
- `DELETE /api/webhooks/:id` — delete

### Approval Gates (Governance)
- `GET    /api/companies/:cid/gates` — list gates (paginated, ?status=pending|approved|rejected)
- `GET    /api/companies/:cid/gates/pending` — pending gates only (max 100)
- `POST   /api/companies/:cid/gates` — create gate {agentId, gateType, title, description?, payload?}
- `POST   /api/companies/:cid/gates/:id/approve` — approve {decidedBy}
- `POST   /api/companies/:cid/gates/:id/reject` — reject {decidedBy}

### Audit Log
- `GET    /api/companies/:cid/audit` — list audit entries (paginated, ?action=, ?agent_id=, ?limit=200)

### Templates (Import/Export)
- `GET    /api/companies/:cid/export` — export company as AgistTemplate JSON
- `POST   /api/companies/import` — import AgistTemplate JSON, creates company + agents + routines

### Signals (Cross-Agent Synergy Bus)
- `POST   /api/companies/:companyId/signals` — create signal {source_agent_id, signal_type, title, payload?}
- `GET    /api/companies/:companyId/signals` — list signals (?type=, ?since=, ?limit=)
- `GET    /api/companies/:companyId/signals/unconsumed/:agentId` — get signals not yet consumed by agent (last 24h, max 10)
- `POST   /api/companies/:companyId/signals/:id/consume` — mark signal consumed {agent_id}

Signal types: `product-update` | `social-proof` | `seo-tactic` | `market-trend` | `alert` | `kpi-change`

### Workspace
- `GET    /api/companies/:companyId/workspace/reports` — list all agent report directories
- `GET    /api/companies/:companyId/workspace/reports/:agentSlug` — list files in agent report dir
- `GET    /api/companies/:companyId/workspace/reports/:agentSlug/:filename` — read a report file
- `GET    /api/companies/:companyId/workspace/synergy` — read synergy signals (last 50 JSONL lines)
- `GET    /api/companies/:companyId/workspace/context/:agentSlug` — read context capsule file
- `PUT    /api/companies/:companyId/workspace/context/:agentSlug` — write context capsule file {content}

### Run Outputs
- `POST   /api/runs/:runId/outputs` — store parsed output {output_type, data}
- `GET    /api/runs/:runId/outputs` — list outputs for a run (ordered by creation ASC)
- `GET    /api/agents/:agentId/outputs` — list outputs for agent (paginated, newest first DESC, ?limit=50)
- `GET    /api/agents/:agentId/outputs/latest` — most recent output for agent (or null)
- `GET    /api/companies/:cid/outputs/summary` — latest output per agent in company (agentId, agentName, status, createdAt)

### System
- `GET    /api/health` — server health (no auth required)
- `GET    /api/dashboard/stats` — KPIs (agents, running, success rate, cost)
- `GET    /api/dashboard/costs?days=7` — daily cost breakdown by agent
- `GET    /api/events` — SSE stream (agent.status, run.completed, run.started, signal.created)
- `GET    /api/metrics` — Prometheus-compatible counters
- `GET    /api/openapi.json` — OpenAPI 3.1 spec
- `GET    /api/docs` — Swagger UI

## Dashboard Pages

| Route | Purpose |
|-------|---------|
| `/` | Dashboard — stat cards, agent fleet, failed run alerts, recent runs, per-agent cost chart |
| `/companies` | Company list with pagination and search |
| `/companies/:id` | Company detail with org chart (React Flow) and agent list |
| `/agents` | All agents — model badge, status, pagination, filters |
| `/agents/:id` | Agent detail — live log viewer, run history, wake button, workingDirectory |
| `/projects` | Project management across companies |
| `/routines` | Routine/schedule management with enable/disable toggle |
| `/runs` | Run history with pagination, status/date filters |
| `/runs/:id` | Run detail with full log and token/cost breakdown |
| `/issues` | Issue tracker with priority and status management |
| `/gates` | Approval gates review queue — approve/reject pending gates |
| `/audit` | Audit log activity feed — filterable by company and action type |
| `/templates` | Template import/export hub — 3 built-in templates + custom JSON import |
| `/settings` | Platform settings |
| `/status` | Full-screen status board (wall monitor mode, no sidebar) |

## Adapters

Agents have an `adapterType` field. Available adapters:

| Adapter | Description | Requirements |
|---------|-------------|-------------|
| `claude-cli` | Spawns Claude CLI with skill injection | Claude Code installed |
| `anthropic-api` | Direct Anthropic Messages API | ANTHROPIC_API_KEY |
| `openai` | OpenAI Chat Completions API | OPENAI_API_KEY |
| `mock` | Simulated runs for testing | None |

Default: auto-detected from model name (gpt-* → openai, claude-* → claude-cli).

## Enum Values (Source of Truth)

```typescript
RunStatus     = 'queued' | 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled'
AgentStatus   = 'idle' | 'running' | 'error' | 'paused'
CompanyStatus = 'active' | 'paused' | 'archived'
IssueStatus   = 'open' | 'in_progress' | 'resolved' | 'closed' | 'wont_fix'
IssuePriority = 'low' | 'medium' | 'high' | 'critical'
GateStatus    = 'pending' | 'approved' | 'rejected'
```

## Database

SQLite via sql.js (WebAssembly, zero native compilation).
Tables: companies, agents, projects, routines, runs, issues, api_keys, webhooks, run_outputs, signals, approval_gates, audit_log.
Auto-saves to disk every 30 seconds.
DB path: `~/.agist/data.db`

Migrations run on startup (ALTER TABLE for new columns).

## Real-time Architecture

- **WebSocket (ws://localhost:4400/ws):** Bidirectional. Client subscribes to agent logs.
  - Client sends: `{ type: "subscribe", agentId: "xxx" }` (or `"*"` for all)
  - Server pushes: `{ type: "log", agentId, runId, line, timestamp }`
  - Server pushes: `{ type: "status", agentId, status, runId }`
- **SSE (GET /api/events):** Unidirectional server→client.
  - Events: `agent.status`, `run.completed`, `run.started`
  - Dashboard SSEProvider with exponential backoff reconnect
  - 30s heartbeat ping

## Webhooks

Webhooks fire on run events. Payload format:
```json
{ "event": "run.completed", "timestamp": "...", "data": { "run": {...}, "agent": {...} } }
```
Events: `run.completed`, `run.failed`, `agent.status`, or `*` for all.
Optional HMAC signature via `X-Agist-Signature: sha256=...` header.

## Observability

- **Structured JSON logging** with configurable LOG_LEVEL
- **X-Request-Id** correlation header on all API requests
- **Prometheus metrics** at /api/metrics (HTTP counters, run counters, token counters)
- **Log rotation**: run log_excerpt capped at 50K chars

## Scripts

```bash
pnpm dev            # start backend + frontend
pnpm seed           # load demo data
pnpm clean          # delete database
pnpm test           # run 505 unit + integration tests
pnpm test:e2e       # run 59 Playwright E2E tests
pnpm test:coverage  # coverage report
pnpm typecheck      # TypeScript strict check
pnpm lint           # ESLint
pnpm format         # Prettier
```

## Conventions

- All IDs: nanoid (21 chars, URL-safe)
- All dates: ISO 8601 UTC strings
- Money: cents (integer)
- API responses: `{ companies: [...], pagination: {...} }` for lists
- Frontend: @tanstack/react-query with SSE invalidation + pagination via URL params
- UI: Dark mode default, shadcn slate palette
- Auth: X-Api-Key header, AGIST_AUTH_DISABLED=true for local dev
- Logging: Structured JSON via logger (not console.log)

## Git

- Branch: `main`
- Commits: conventional (feat/fix/docs/chore)
- Repo: github.com/tahakotil/agist
- CI: GitHub Actions (typecheck + lint + test on push/PR)
