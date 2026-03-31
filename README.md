<p align="center">
  <img src="assets/agist-logo.svg" width="80" alt="Agist - AI Agent Orchestration Platform Logo" />
</p>

<h1 align="center">Agist</h1>

<p align="center">
  <strong>The control plane for your AI agent team.</strong><br/>
  Schedule, monitor, and chain Claude and GPT agents — with budget limits,
  approval gates, and a live dashboard. No Postgres. No Redis. No cloud.
</p>

<p align="center">
  <a href="#get-running-in-30-seconds"><strong>Get running in 30 seconds</strong></a>
  &nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="#screenshots">See the dashboard</a>
  &nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="#features">Features</a>
  &nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="#api">API</a>
  &nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/github/stars/tahakotil/agist?style=social" alt="GitHub Stars" />
  &nbsp;
  <img src="https://github.com/tahakotil/agist/actions/workflows/ci.yml/badge.svg" alt="CI" />
  &nbsp;
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" />
  &nbsp;
  <img src="https://img.shields.io/badge/node-20%2B-green.svg" alt="Node.js 20+" />
  &nbsp;
  <img src="https://img.shields.io/badge/typescript-strict-blue.svg" alt="TypeScript Strict" />
  &nbsp;
  <img src="https://img.shields.io/badge/database-SQLite%20%E2%80%94%20zero%20config-orange.svg" alt="SQLite — zero config" />
  &nbsp;
  <img src="https://img.shields.io/github/last-commit/tahakotil/agist" alt="Last Commit" />
</p>

<p align="center">
  <img src="assets/screenshot-dashboard.png" alt="Agist dashboard — agent fleet, cost chart, recent runs" width="100%" />
  <sub>Dashboard — live agent fleet, cost breakdown, and recent runs</sub>
</p>

---

## Get Running in 30 Seconds

```bash
npx agist setup   # interactive wizard — sets ports, API keys, data directory
npx agist start   # starts backend + frontend
```

Open **http://localhost:3004**. Done.

> **Requirements:** Node.js 20+, pnpm 9+

**Other options:**

```bash
# Git clone
git clone https://github.com/tahakotil/agist.git && cd agist
pnpm install && pnpm seed && pnpm dev

# Docker (production-ready with automatic TLS via Caddy)
git clone https://github.com/tahakotil/agist.git && cd agist
docker compose up -d
# Custom domain: DOMAIN=agents.yourdomain.com docker compose up -d
```

---

## Why Agist?

If you are running more than two AI agents, you already have a management problem.

One agent writes content on a schedule. Another monitors competitors. Another drafts outreach. They run in separate cron jobs, log to separate files, and you have no idea what they spent last Tuesday or whether one of them silently failed at 3am.

Agist is the operations layer you add on top of your existing agents:

- **One dashboard** — see every agent, every run, and every dollar spent in real time
- **Approval gates** — define which actions require a human yes before they execute
- **Budget guardrails** — per-agent monthly/daily/per-run cost caps with auto-pause
- **Signal bus** — one agent's output triggers the next, without a message broker
- **Context capsules** — per-agent knowledge blocks agents read before each run
- **Audit log** — every state change, approval decision, and budget event, permanently recorded
- **Multi-adapter** — works with Claude CLI, Anthropic API, OpenAI, or a mock adapter for testing

All of this runs on SQLite. One Node.js process. One Docker container.

---

## Agist vs CrewAI, AutoGen, Paperclip, and Claude Squad

| | Agist | CrewAI | AutoGen | Paperclip | Claude Squad |
|---|---|---|---|---|---|
| Self-hosted | Yes | Partial | Yes | Yes (complex) | Yes |
| Visual dashboard | Yes | No | No | Yes | Terminal TUI |
| Zero-config database | SQLite | Python deps | — | PostgreSQL | — |
| Budget tracking per agent | Yes | No | No | Text only | No |
| Approval gates | Yes | No | No | No | No |
| Multi-adapter (Claude + OpenAI) | Yes | Limited | Yes | No | No |
| Audit log | Yes | No | No | No | No |
| Single Docker deploy | Yes | No | No | No | No |
| Works without writing code | Yes | No | No | No | No |
| Price | Free & open source | Free / $99+/mo SaaS | Free | Free | Free |

The single differentiator no competitor has simultaneously: **production-ready dashboard + zero infrastructure + budget enforcement + approval gates**.

---

## Use Cases

**Solo developer running 5+ automation agents**

You have a Claude agent writing daily social posts, another monitoring your competitors, another handling lead research. You want to know: did they all run? What did they spend? Did any fail? Agist gives you a single dashboard instead of five separate log files and zero cost visibility.

**Small engineering team with compliance requirements**

Before agents can call external APIs, send emails, or spend more than $1, a human must approve. Agist's approval gates hold those actions in a queue with full context (what the agent wants to do, what it costs, why). One click to approve or reject. Every decision is in the audit log.

**Multi-tenant agent platform**

You are building a product where each customer gets their own agent team. Agist's company model lets you namespace agents, budgets, and routines per tenant — all sharing one SQLite database, all isolated by company ID.

---

## Features

### One Dashboard for Every Agent Run

See live status, run history, token usage, and cost per agent. The status board (`/status`) is a full-screen wall monitor view. Live logs stream over WebSocket so you watch an agent work in real time.

### Budget Enforcement That Actually Stops Agents

Set a monthly budget per company in cents. Agist tracks cumulative run cost and blocks new runs when the limit is reached — not just alerts, but hard enforcement. The dashboard shows a per-agent cost chart and daily breakdown.

### Approval Gates

```
Agent wants to execute an action → Agist creates a pending gate
                                 → You see it in /gates
                                 → Approve or reject with one click
                                 → Agent continues or stops
```

Gate types, titles, descriptions, and payloads are all stored and visible. Every decision is timestamped and logged.

### Signal Bus — Agent-to-Agent Workflows

Agents post signals (`product-update`, `market-trend`, `alert`, `kpi-change`, etc.) that other agents consume. No message broker. No Kafka. Signal state lives in SQLite. An agent calls `GET /api/companies/:id/signals/unconsumed/:agentId` before each run to pick up what it missed.

### Context Capsules

Each agent can have a persistent context capsule — a markdown string up to 10,000 characters — that is injected into the agent's prompt context before each run. Update it via the dashboard or API. Useful for brand voice, recent metrics, team instructions.

### Cron Scheduling

Attach routines to agents using standard cron expressions. The scheduler runs every 30 seconds, checks for due routines, and fires runs. Routines are per-company and can be enabled/disabled without deleting them.

### Multi-Adapter Support

| Adapter | How it works |
|---------|-------------|
| `claude-cli` | Spawns a Claude Code process with skill injection |
| `anthropic-api` | Direct Anthropic Messages API call |
| `openai` | OpenAI Chat Completions API |
| `mock` | Simulated run with fake output — useful for testing |

Default: auto-detected from the model name (`gpt-*` → openai, `claude-*` → claude-cli).

### Structured Run Outputs

Agents store typed output objects per run (`POST /api/runs/:runId/outputs`). Query the latest output per agent, the output history for a company, or outputs across an agent's full run history.

### Webhooks

Fire HTTP webhooks on `run.completed`, `run.failed`, `agent.status`, or all events (`*`). Optional HMAC signature via `X-Agist-Signature`. Configure per company.

### Templates — Import / Export Agent Teams

Export a company (agents + routines) as a JSON template. Import it into any Agist instance. Three built-in templates: Content Team, Dev Ops Team, Research Team. Available at `/templates` in the dashboard.

### Governance — Pause and Resume

Pause a company to stop all agent runs immediately. Useful for cost control incidents. Resume resumes all scheduled routines. Every pause/resume event is in the audit log.

### Observability

- Structured JSON logging with configurable `LOG_LEVEL`
- `X-Request-Id` correlation header on every API request
- Prometheus-compatible metrics at `/api/metrics` (HTTP counters, run counters, token counters)
- Run log excerpts capped at 50K characters to prevent runaway storage

---

## Screenshots

<p align="center">
  <img src="assets/screenshot-companies.png" alt="Agist companies — multi-tenant management with budgets" width="100%" />
  <br/><sub>Companies — multi-tenant agent team management with budget tracking</sub>
</p>

<p align="center">
  <img src="assets/screenshot-agents.png" alt="Agist agents — model badges, status, adapter type" width="100%" />
  <br/><sub>Agents — model badge, adapter type, status, and last run at a glance</sub>
</p>

---

## Architecture

```
┌──────────────────────────────────────────────┐
│                  Frontend                     │
│          Next.js 16 + shadcn/ui              │
│          http://localhost:3004                │
│                                              │
│  Dashboard  Agents  Runs  Gates  Templates   │
└─────────────────────┬────────────────────────┘
                      │ REST + WebSocket + SSE
┌─────────────────────┴────────────────────────┐
│                   Backend                     │
│            Hono + TypeScript                 │
│          http://localhost:4400                │
│                                              │
│  REST API  │  WebSocket  │  SSE  │ Scheduler │
└─────────────────────┬────────────────────────┘
                      │
┌─────────────────────┴────────────────────────┐
│                  Database                     │
│          SQLite (sql.js, WAL mode)           │
│             ~/.agist/data.db                  │
│                                              │
│  companies  agents  runs  gates  audit_log   │
└─────────────────────┬────────────────────────┘
                      │
┌─────────────────────┴────────────────────────┐
│           Agent Adapter Layer                 │
│                                              │
│  Claude CLI  │  Anthropic API  │  OpenAI     │
│  Mock — streams logs → WebSocket → Dashboard │
└──────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 16, shadcn/ui, Tremor, React Flow | Fast, typed, component-rich |
| Backend | Hono | 14KB, fastest Node.js framework |
| Database | SQLite via sql.js | Zero config, zero native compilation |
| Real-time | WebSocket + SSE | Bidirectional logs + unidirectional status events |
| Scheduler | cron-parser + setInterval | No external deps, runs every 30s |
| IDs | nanoid | URL-safe, 21 chars |
| Testing | Vitest (505 tests) + Playwright (59 E2E tests) | Full coverage |

### Monorepo Layout

```
packages/
  cli/       — npx agist setup/start/status/logs
  shared/    — TypeScript types, Zod validators, constants
  db/        — SQLite schema, migrations, queries, seed data
  server/    — Hono API (port 4400), WebSocket, SSE, scheduler, adapters
  web/       — Next.js dashboard (port 3004)
```

---

## CLI Reference

```bash
npx agist setup              # interactive wizard — ports, API keys, data dir
npx agist start              # start backend + frontend
npx agist status             # server health, agent fleet, KPIs
npx agist logs <agentId>     # stream live logs for one agent (WebSocket)
npx agist logs "*"           # stream all agent logs
```

---

## API

Full OpenAPI spec at `http://localhost:4400/api/docs` once running. Core endpoints:

### Companies
```
GET    /api/companies                   list (paginated, ?search=, ?status=)
POST   /api/companies                   create
PATCH  /api/companies/:id               update
DELETE /api/companies/:id               delete
GET    /api/companies/:id/export        export as AgistTemplate JSON
POST   /api/companies/import            import AgistTemplate JSON
```

### Agents
```
GET    /api/agents                      list all (paginated, ?status=, ?model=, ?search=)
POST   /api/companies/:cid/agents       create
PATCH  /api/agents/:id                  update
DELETE /api/agents/:id                  delete
POST   /api/agents/:id/wake             manual wake {prompt?}
GET    /api/agents/:id/context          get context capsule
PUT    /api/agents/:id/context          update context capsule
```

### Runs
```
GET    /api/runs                        list (paginated, ?status=, ?agentId=, ?from=, ?to=)
GET    /api/runs/:id                    run detail with log excerpt
GET    /api/agents/:id/runs             runs for one agent
DELETE /api/agents/:id/runs             bulk delete (?olderThan=30d, ?status=failed)
```

### Approval Gates
```
GET    /api/companies/:cid/gates        list gates (?status=pending)
GET    /api/companies/:cid/gates/pending  pending gates only
POST   /api/companies/:cid/gates        create gate
POST   /api/companies/:cid/gates/:id/approve  approve
POST   /api/companies/:cid/gates/:id/reject   reject
```

### Signals
```
POST   /api/companies/:cid/signals      emit signal
GET    /api/companies/:cid/signals      list signals
GET    /api/companies/:cid/signals/unconsumed/:agentId  unconsumed signals for agent
POST   /api/companies/:cid/signals/:id/consume  mark consumed
```

### Audit Log
```
GET    /api/companies/:cid/audit        list entries (paginated, ?action=, ?agent_id=)
```

### System
```
GET    /api/health                      health check (no auth)
GET    /api/dashboard/stats             KPIs: agents, running, success rate, cost
GET    /api/dashboard/costs?days=7      daily cost breakdown by agent
GET    /api/metrics                     Prometheus-compatible counters
GET    /api/events                      SSE stream (agent.status, run.completed, ...)
WS     ws://localhost:4400/ws           live agent log stream
```

---

## Configuration

All configuration via environment variables. Auth is disabled by default for local dev.

| Variable | Default | Description |
|----------|---------|-------------|
| `AGIST_AUTH_DISABLED` | `true` | Set `false` to require API keys |
| `CORS_ORIGINS` | `http://localhost:3004` | Comma-separated allowed origins |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `ANTHROPIC_API_KEY` | — | For `anthropic-api` adapter |
| `OPENAI_API_KEY` | — | For `openai` adapter |
| `RUN_TTL_DAYS` | — | Auto-delete runs older than N days |
| `SLACK_WEBHOOK_URL` | — | Slack notification webhook |
| `GITHUB_TOKEN` | — | GitHub issue creation on failures |
| `GITHUB_REPO` | — | `owner/repo` format |

To enable auth:

```bash
AGIST_AUTH_DISABLED=false
```

Then create an API key via `POST /api/api-keys` and include it on all requests:

```bash
curl http://localhost:4400/api/agents -H "X-Api-Key: agist_<your-key>"
```

---

## Roadmap

What is shipped:

- [x] Agent registry (dashboard + API)
- [x] Cron scheduler + manual wake
- [x] Multi-adapter: Claude CLI, Anthropic API, OpenAI, Mock
- [x] Budget enforcement (monthly cap, auto-pause, audit)
- [x] Approval gates (pending queue, approve/reject, audit)
- [x] Signal bus (cross-agent event propagation)
- [x] Context capsules (per-agent markdown knowledge blocks)
- [x] Company templates (import/export, 3 built-in templates)
- [x] Webhooks (run events, HMAC signature)
- [x] Audit log
- [x] Prometheus metrics
- [x] CLI (setup, start, status, logs)
- [x] Docker + Caddy deploy
- [x] 505 unit/integration tests + 59 E2E tests

What is next:

- [ ] Visual workflow builder (drag-and-drop agent chains)
- [ ] Multi-user authentication (RBAC with invite flow)
- [ ] Capsule versioning UI
- [ ] Public agent marketplace / template registry

See [ROADMAP.md](ROADMAP.md) for the full backlog.

---

## FAQ

**Does Agist work without an Anthropic or OpenAI API key?**

Yes. Use the `mock` adapter for testing or the `claude-cli` adapter if you have Claude Code installed locally. You only need API keys when using the `anthropic-api` or `openai` adapters.

**Is SQLite production-ready here?**

For single-instance deployments managing up to hundreds of agents and thousands of daily runs — yes. SQLite in WAL mode handles concurrent reads well. We use `sql.js` (WebAssembly) which means zero native compilation, so it runs on any platform. If you need multi-writer horizontal scaling, evaluate [Turso](https://turso.tech) or [libSQL](https://github.com/tursodatabase/libsql) as a drop-in upgrade.

**Do my agent outputs or prompts get sent anywhere?**

No. Agist is self-hosted. All data stays in your local SQLite file (`~/.agist/data.db`). The only outbound traffic is what your agent adapters send directly to Anthropic or OpenAI — not routed through any Agist service.

**Can I run multiple companies (tenants) on one instance?**

Yes. Companies are the top-level namespace. Each company has its own agents, routines, budgets, approval gates, and audit log. One SQLite database, fully isolated by company ID.

**How is this different from just using cron + claude CLI directly?**

Cron gives you execution. Agist gives you visibility, cost control, approval gates, structured outputs, cross-agent signals, and a dashboard. The cron is still there — Agist wraps it with everything that makes running multiple agents in production sustainable.

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup details, coding conventions, and the PR process.

```bash
git clone https://github.com/tahakotil/agist.git
cd agist
pnpm install
pnpm dev         # backend:4400 + frontend:3004
pnpm test        # 505 tests
pnpm test:e2e    # 59 Playwright tests
```

Good first issues are labeled [`good first issue`](https://github.com/tahakotil/agist/labels/good%20first%20issue) on GitHub.

---

<p align="center">
  If Agist is useful, a star helps other developers find it.
  <br/><br/>
  <a href="https://github.com/tahakotil/agist">
    <img src="https://img.shields.io/github/stars/tahakotil/agist?style=social" alt="Star on GitHub" />
  </a>
  <br/><br/>
  Built by <a href="https://github.com/tahakotil">Taha Kotil</a>
</p>
