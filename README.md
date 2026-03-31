<p align="center">
  <img src="assets/agist-logo.svg" width="80" alt="Agist Logo" />
</p>

<h1 align="center">Agist</h1>

<p align="center">
  <strong>Self-hosted AI agent orchestration platform.</strong><br/>
  Define, schedule, chain, and observe autonomous AI agents — all from a single SQLite-powered stack.
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> &bull;
  <a href="#features">Features</a> &bull;
  <a href="#screenshots">Screenshots</a> &bull;
  <a href="#architecture">Architecture</a> &bull;
  <a href="#api">API</a> &bull;
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" />
  <img src="https://img.shields.io/badge/node-20%2B-green.svg" alt="Node.js" />
  <img src="https://img.shields.io/badge/typescript-5.7-blue.svg" alt="TypeScript" />
  <img src="https://img.shields.io/badge/sqlite-WAL-orange.svg" alt="SQLite" />
</p>

---

## Why Agist?

You're running multiple AI agents. Some write content, some analyze data, some monitor systems. Right now they're scattered: separate cron jobs, no shared context, no visibility into what they actually produced.

Agist gives you:
- **One place** to define, run, and monitor all your agents
- **Structured outputs** — agent results are parsed, not just raw text dumps
- **Event-driven workflows** — agents trigger each other based on results, not blind schedules
- **Context capsules** — reusable knowledge blocks agents share, with versioning
- **Daily digest** — a single summary of what all agents did, what they spent, and what needs your attention
- **Budget guardrails** — per-agent, per-team cost limits with automatic pausing

All running on SQLite. No Postgres, no Redis, no Kubernetes. Clone, configure, run.

### Agist vs Others

| | Agist | Paperclip | CrewAI | AutoGen | Claude Squad |
|---|---|---|---|---|---|
| Self-hosted | Yes | Yes (complex) | Partial | Yes | Yes |
| SQLite (zero-config) | Yes | PostgreSQL | Python deps | - | None |
| Structured output parsing | Advanced | Basic | Basic | - | - |
| Context capsules | Yes | - | - | - | - |
| Event-driven workflows | Yes | - | Partial | - | - |
| Multi-tenant (teams) | Yes | Yes | - | - | - |
| Budget tracking per agent | Yes | Text budgets | SaaS | - | - |
| Daily digest | Yes | - | - | - | - |
| Visual dashboard | Web + PWA | Web only | SaaS only | - | Terminal TUI |
| Approval gates | Yes | - | - | - | - |
| Single Docker deploy | Yes | - | - | - | - |
| Price | Free & open source | Free | $99+/mo | Free | Free |

---

## Quickstart

### Option 1: npx (fastest)

```bash
npx agist setup   # interactive wizard — sets ports, API keys, data dir
npx agist start   # starts backend + frontend
```

Open **http://localhost:3004** — that's it.

### Option 2: Git clone

```bash
git clone https://github.com/tahakotil/agist.git
cd agist
pnpm install
pnpm seed    # load demo data (optional)
pnpm dev     # opens dashboard at localhost:3004
```

> **Requirements:** Node.js 20+, pnpm 9+

### Option 3: Docker

```bash
git clone https://github.com/tahakotil/agist.git
cd agist
docker compose up -d
```

Access at **http://localhost** (Caddy handles routing and HTTPS automatically).

For a custom domain with automatic TLS:
```bash
DOMAIN=agents.yourdomain.com docker compose up -d
```

---

## Features

### Agent Registry

Define agents with model routing, schedules, budgets, and approval rules.

```yaml
agent:
  id: "content-writer"
  name: "Content Writer"
  team: "marketing"
  model_tier: "sonnet"              # haiku | sonnet | opus
  role: "Writes social media posts based on recent analytics"

  schedule:
    type: "cron"                    # cron | event | manual
    cron: "0 */4 * * *"

  budget:
    max_per_run: 0.50               # USD
    max_daily: 2.00
    max_monthly: 40.00
    alert_threshold: 0.8

  context:
    capsules: ["brand-voice", "recent-metrics"]
    include_last_n_outputs: 3

  approval:
    required_for: ["publish", "spend > $1"]
    approver: "admin"
    timeout_minutes: 60
    auto_approve_after: 3

  health:
    max_consecutive_failures: 3
    on_failure: "pause"             # pause | alert | retry
```

### Agent Lifecycle

```
IDLE → SCHEDULED → RUNNING → AWAITING_APPROVAL → COMPLETED
                      ↓              ↓
                   FAILED         REJECTED
                      ↓
                   PAUSED
```

Every state transition is logged. Visible in real-time on the dashboard.

---

### Structured Output Parsing

Most agent platforms give you raw LLM text. Agist parses agent outputs into structured data using per-agent output schemas.

```yaml
output_schema:
  type: "content"
  fields:
    headline: { type: "string", required: true }
    body: { type: "string", required: true }
    hashtags: { type: "array", items: "string" }
    tone_score: { type: "number", min: 0, max: 1 }
```

Agist validates every output against the schema. If parsing fails, the agent retries with a stricter prompt. Parsed results are queryable via API.

```json
{
  "run_id": "run_abc123",
  "output": {
    "raw": "Here's a post about...",
    "structured": {
      "headline": "5 things you didn't know about...",
      "body": "Thread content here...",
      "hashtags": ["#ai", "#automation"],
      "tone_score": 0.82
    },
    "summary": "Generated a Twitter thread about AI automation trends",
    "confidence": 0.95
  }
}
```

---

### Signal Bus & Workflow Chains

Agents don't run in isolation. One agent's output can trigger another.

```yaml
signals:
  - name: "content-ready"
    emitter: "content-writer"
    payload_schema:
      content: string
      platform: string

workflows:
  - name: "content-pipeline"
    trigger:
      signal: "content-ready"
      filter: "payload.platform == 'twitter'"
    steps:
      - agent: "content-reviewer"
        params:
          content: "{{ trigger.payload.content }}"
      - wait_for: "review-approved"
      - agent: "content-publisher"
        params:
          content: "{{ steps[0].output.structured.reviewed_content }}"

  - name: "lead-pipeline"
    trigger:
      signal: "lead-found"
      filter: "payload.score >= 7"
    steps:
      - agent: "lead-enricher"
      - agent: "outreach-drafter"
        condition: "steps[0].output.structured.is_qualified == true"
```

Signals are SQLite-native (poll-based, no message broker needed). The scheduler checks for pending signals every cycle and triggers matching workflows.

---

### Context Capsules

Reusable knowledge blocks that agents reference. No more copy-pasting context into every prompt.

```yaml
capsules:
  - id: "brand-voice"
    type: "static"
    content: |
      We're a developer-focused SaaS. Tone: technical but approachable.
      Never use corporate jargon. Always include code examples.

  - id: "recent-metrics"
    type: "dynamic"
    source: "agent:analytics-collector"
    refresh: "daily"
    max_age: "24h"

  - id: "full-context"
    type: "composite"
    includes: ["brand-voice", "recent-metrics", "competitor-analysis"]
    max_tokens: 8192
    summarize_if_exceeds: true
```

Three types:
- **Static** — manually written, versioned
- **Dynamic** — auto-refreshed from agent outputs
- **Composite** — combines multiple capsules, auto-summarizes if over token limit

---

### Daily Digest

A meta-agent runs every night, collects all runs from the day, and generates a summary.

```json
{
  "date": "2026-03-31",
  "summary": {
    "total_runs": 47,
    "successful": 42,
    "failed": 3,
    "skipped": 2,
    "total_cost_usd": 4.82
  },
  "by_team": {
    "marketing": {
      "runs": 18,
      "cost_usd": 2.10,
      "highlights": ["Generated 12 social posts", "3 posts auto-published"],
      "issues": ["Image generator failed twice — rate limited"]
    },
    "sales": {
      "runs": 14,
      "cost_usd": 1.45,
      "highlights": ["Found 8 qualified leads", "Drafted 5 outreach messages"]
    }
  },
  "action_items": [
    { "description": "Review 3 pending outreach drafts", "priority": "high" },
    { "description": "Image API rate limit — consider upgrading plan", "priority": "medium" }
  ],
  "budget_status": {
    "marketing": { "spent_month": 48.20, "limit_month": 100.00, "burn_rate": "on track" },
    "sales": { "spent_month": 31.50, "limit_month": 80.00, "burn_rate": "under budget" }
  }
}
```

Digest is viewable on the dashboard and optionally pushed via webhook (Telegram, Discord, Slack, email).

---

### Budget Tracking

Per-agent and per-team cost tracking with automatic enforcement.

- Set monthly/daily/per-run limits
- Alert at configurable threshold (default 80%)
- Auto-pause agents that exceed limits
- Dashboard shows burn rate projections
- Full cost breakdown by model tier

---

### Approval Gates

Some actions shouldn't be automatic. Define which actions require human approval.

```yaml
approval:
  required_for: ["publish", "spend > $1", "external_api_call"]
  approver: "admin"
  timeout_minutes: 60
  auto_approve_after: 3
```

Pending approvals show up in the dashboard with full context (agent output, cost, action description). After N consecutive successful approvals, the system can auto-approve.

---

### Live Dashboard

```
/dashboard
├── /overview          → Today's digest, live agent status, budget meters
├── /agents            → Agent list with last 10 runs each
├── /agents/[id]       → Single agent: timeline, outputs, cost graph
├── /runs              → Filterable run table (agent, status, date, cost)
├── /runs/[id]         → Run detail: input, output, cost, duration
├── /workflows         → Active workflow chains, signal flow
├── /signals           → Signal log
├── /digest            → Daily/weekly digest archive
├── /budget            → Team-level budget tracking with projections
├── /approvals         → Pending approvals (action required)
└── /settings
    ├── /agents        → Agent CRUD (YAML editor + form)
    ├── /workflows     → Workflow builder
    ├── /teams         → Team management
    └── /notifications → Webhook configuration
```

---

## Screenshots

<p align="center">
  <img src="assets/screenshot-dashboard.png" alt="Dashboard" width="100%" />
  <br/><sub>Dashboard — Real-time overview with stat cards, cost chart, and agent fleet</sub>
</p>

<p align="center">
  <img src="assets/screenshot-companies.png" alt="Companies" width="100%" />
  <br/><sub>Companies — Multi-company management with agent counts and budgets</sub>
</p>

<p align="center">
  <img src="assets/screenshot-agents.png" alt="Agents" width="100%" />
  <br/><sub>Agents — Model routing (Haiku/Sonnet/Opus), status, and schedule overview</sub>
</p>

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│           Next.js 16 + shadcn/ui                │
│          http://localhost:3004                    │
│                                                  │
│  Dashboard  Agents  Runs  Issues  Status Board  │
└──────────────────────┬──────────────────────────┘
                       │ fetch + WebSocket
┌──────────────────────┴──────────────────────────┐
│                    Backend                       │
│              Hono + TypeScript                   │
│          http://localhost:4400                    │
│                                                  │
│  REST API  │  WebSocket  │  SSE  │  Scheduler   │
│            │  (live logs) │       │  (cron)      │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────┐
│                   Database                       │
│           SQLite (sql.js, WAL mode)             │
│              ~/.agist/data.db                    │
│                                                  │
│  companies │ agents │ routines │ runs │ issues  │
└─────────────────────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────┐
│              Agent Adapter Layer                  │
│                                                  │
│  Claude CLI │ Anthropic API │ OpenAI │ Mock      │
│  Streams output → WebSocket → Dashboard          │
└─────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 16, shadcn/ui, Tremor, React Flow | Modern, fast, beautiful |
| Backend | Hono | 14KB, fastest Node.js framework |
| Database | SQLite (sql.js) | Zero config, zero native deps |
| Real-time | WebSocket + SSE | Bidirectional logs + unidirectional status |
| Scheduler | cron-parser + setInterval | Simple, reliable, no external deps |
| IDs | nanoid | URL-safe, 21 chars, collision-resistant |

### Project Structure

```
agist/
├── packages/
│   ├── cli/             # npx agist CLI
│   │   └── src/
│   │       ├── index.ts
│   │       └── commands/
│   │           ├── setup.ts    # Interactive setup wizard
│   │           ├── start.ts    # Start backend + frontend
│   │           ├── status.ts   # Health + agent fleet status
│   │           └── logs.ts     # Live log streaming (WebSocket)
│   ├── shared/          # Types, validators, constants
│   │   └── src/
│   │       ├── types.ts
│   │       └── validators.ts
│   ├── db/              # SQLite schema, queries, seed
│   │   └── src/
│   │       ├── schema.sql
│   │       ├── db.ts
│   │       ├── queries.ts
│   │       └── seed.ts
│   ├── server/          # Hono API server
│   │   └── src/
│   │       ├── index.ts        # Entry point (port 4400)
│   │       ├── db.ts           # SQLite init (sql.js)
│   │       ├── schema.sql      # Table definitions
│   │       ├── scheduler.ts    # Cron heartbeat scheduler
│   │       ├── adapter.ts      # Multi-adapter layer
│   │       ├── ws.ts           # WebSocket server
│   │       ├── sse.ts          # SSE event stream
│   │       └── routes/
│   │           ├── companies.ts
│   │           ├── agents.ts
│   │           ├── projects.ts
│   │           ├── routines.ts
│   │           ├── runs.ts
│   │           ├── issues.ts
│   │           └── health.ts
│   └── web/             # Next.js dashboard
│       └── src/
│           ├── app/
│           │   ├── (dashboard)/     # Main layout with sidebar
│           │   │   ├── page.tsx     # Status dashboard
│           │   │   ├── agents/
│           │   │   ├── companies/
│           │   │   ├── projects/
│           │   │   ├── routines/
│           │   │   ├── runs/
│           │   │   ├── issues/
│           │   │   └── settings/
│           │   └── status/          # Full-screen monitor board
│           ├── components/
│           │   ├── agent-card.tsx
│           │   ├── log-viewer.tsx
│           │   ├── org-chart.tsx
│           │   ├── cost-chart.tsx
│           │   ├── command-palette.tsx
│           │   └── stat-card.tsx
│           └── lib/
│               └── api.ts           # API client
├── Dockerfile           # Multi-stage production build
├── docker-compose.yml   # Agist + Caddy reverse proxy
├── Caddyfile            # Caddy routing config
├── .env.example         # Environment variable reference
├── CLAUDE.md
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## CLI Reference

```bash
npx agist setup    # interactive setup wizard
npx agist start    # start backend + frontend
npx agist status   # show server health, agent fleet, KPIs
npx agist logs <agentId>   # stream live logs for an agent
npx agist logs "*"          # stream all agent logs
```

---

## Configuration

All configuration via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4400` | Backend API port |
| `AGIST_AUTH_DISABLED` | `true` | Disable API key auth (dev only) |
| `CORS_ORIGINS` | `http://localhost:3004` | Allowed CORS origins |
| `LOG_LEVEL` | `info` | Logging level (debug/info/warn/error) |
| `ANTHROPIC_API_KEY` | — | Anthropic API key for Claude |
| `OPENAI_API_KEY` | — | OpenAI API key |
| `RUN_TTL_DAYS` | `30` | Auto-delete runs older than N days |
| `SLACK_WEBHOOK_URL` | — | Slack notification webhook |
| `GITHUB_TOKEN` | — | GitHub issue creation on failures |
| `GITHUB_REPO` | — | owner/repo format |

---

## API Authentication

By default auth is disabled for local development. To enable:

```bash
AGIST_AUTH_DISABLED=false
```

All API requests must then include the `X-Api-Key` header:

```bash
curl http://localhost:4400/api/agents \
  -H "X-Api-Key: agist_<your-key>"
```

---

## API

### Agents
```
POST   /api/agents                    Create agent
GET    /api/agents                    List agents (filter: team, status)
GET    /api/agents/:id                Agent detail
PUT    /api/agents/:id                Update agent
POST   /api/agents/:id/run            Trigger manual run
POST   /api/agents/:id/pause          Pause agent
POST   /api/agents/:id/resume         Resume agent
```

### Runs
```
GET    /api/runs                      List runs (filter: agent, status, date)
GET    /api/runs/:id                  Run detail
```

### Signals & Workflows
```
GET    /api/signals                   Signal log
POST   /api/signals                   Emit signal manually
GET    /api/workflows                 List workflows
POST   /api/workflows                 Create workflow
GET    /api/workflows/:id/runs        Workflow execution history
```

### Approvals
```
GET    /api/approvals                 List pending approvals
POST   /api/approvals/:id/approve     Approve
POST   /api/approvals/:id/reject      Reject
```

### Digest & Budget
```
GET    /api/digest                    Today's digest
GET    /api/digest/:date              Specific date digest
GET    /api/budget                    Budget overview
GET    /api/budget/:team              Team budget detail
```

### Capsules
```
GET    /api/capsules                  List capsules
PUT    /api/capsules/:id              Update capsule
POST   /api/capsules/:id/refresh      Refresh dynamic capsule
```

### System
```
GET    /api/health                    Health check
GET    /api/metrics                   Prometheus-compatible metrics
GET    /api/docs                      Swagger UI
WS     ws://localhost:4400/ws         Live agent logs
SSE    /api/events                    Status change stream
```

---

## Data Model

```sql
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  team TEXT NOT NULL,
  name TEXT NOT NULL,
  config TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  trigger_type TEXT NOT NULL,
  triggered_by TEXT,
  status TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER,
  cost_usd REAL,
  tokens_input INTEGER,
  tokens_output INTEGER,
  model_used TEXT,
  input TEXT,
  output_raw TEXT,
  output_structured TEXT,
  output_summary TEXT,
  error TEXT
);

CREATE TABLE signals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emitter_agent_id TEXT,
  emitter_run_id TEXT,
  payload TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  consumed_by TEXT DEFAULT '[]'
);

CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  config TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT REFERENCES workflows(id),
  trigger_signal_id TEXT,
  status TEXT,
  steps TEXT,
  started_at TEXT,
  completed_at TEXT
);

CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES runs(id),
  agent_id TEXT,
  action TEXT,
  status TEXT DEFAULT 'pending',
  requested_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT,
  resolved_by TEXT
);

CREATE TABLE budget_usage (
  id TEXT PRIMARY KEY,
  team TEXT NOT NULL,
  agent_id TEXT,
  date TEXT NOT NULL,
  cost_usd REAL,
  tokens_input INTEGER,
  tokens_output INTEGER
);

CREATE TABLE digests (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE capsules (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER,
  version INTEGER DEFAULT 1,
  config TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT
);

CREATE TABLE capsule_versions (
  capsule_id TEXT REFERENCES capsules(id),
  version INTEGER,
  content TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (capsule_id, version)
);
```

---

## Model Routing

Assign each agent the right model for the job:

| Model | Best For | Cost |
|-------|---------|------|
| Haiku 4.5 | Health checks, monitoring, simple tasks | Lowest |
| Sonnet 4.6 | Core development, content, analysis | Balanced |
| Opus 4.6 | Strategic decisions, deep reasoning | Highest |

---

## Roadmap

### Phase 1 — MVP
- [x] Agent registry (YAML config + API + dashboard)
- [x] Execution engine (cron + manual trigger + run logging)
- [x] Signal bus + workflow chains
- [x] Budget tracking + auto-pause
- [x] Approval gates
- [x] Dashboard (overview, agents, runs, approvals)
- [x] Structured output parsing with schema validation
- [x] Context capsules (static, dynamic, composite)
- [x] Daily digest generation

### Phase 2
- [ ] Visual workflow builder (drag & drop)
- [ ] Capsule versioning UI
- [ ] Multi-user auth
- [ ] Webhook notifications (Telegram, Discord, Slack, email)
- [ ] Plugin system for custom agent tools

---

## Contributing

Contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
git clone https://github.com/tahakotil/agist.git
cd agist
pnpm install
pnpm dev
```

---

## License

MIT - see [LICENSE](LICENSE).

---

<p align="center">
  Built by <a href="https://github.com/tahakotil">Taha Kotil</a><br/>
  <sub>AI agent orchestration for everyone.</sub>
</p>
