# Agist

Open-source AI agent orchestration platform. Manage multi-agent teams from a single dashboard.

## Project Overview

- **Name:** Agist
- **Repo:** github.com/tahakotil/agist
- **License:** MIT
- **Status:** MVP — backend + frontend + scheduler + real-time working
- **Author:** Taha Kotil (github.com/tahakotil)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router, Turbopack), shadcn/ui, Tremor charts, React Flow |
| Backend | Hono (TypeScript), WebSocket (ws), SSE |
| Database | SQLite via sql.js (WAL mode, zero native deps) |
| Real-time | WebSocket (live logs) + SSE (status updates) |
| Scheduler | cron-parser v5 + 30s interval check |
| Package Manager | pnpm workspaces (monorepo) |
| Runtime | Node.js 20+ |

## Monorepo Structure

```
packages/
  shared/    — TypeScript types, Zod validators, constants
  db/        — SQLite schema, migrations, queries, seed data
  server/    — Hono API (port 4400), WebSocket, SSE, cron scheduler, Claude adapter
  web/       — Next.js dashboard (port 3004), shadcn/ui, dark mode
  cli/       — (planned) npx agist setup command
```

## Running Locally

```bash
pnpm install
pnpm seed    # optional: load demo data
pnpm dev     # starts backend:4400 + frontend:3004
```

Or separately:
```bash
cd packages/server && npx tsx src/index.ts   # backend
cd packages/web && npx next dev -p 3004      # frontend
```

- Backend API: http://localhost:4400
- Dashboard: http://localhost:3004
- WebSocket: ws://localhost:4400/ws
- SSE events: http://localhost:4400/api/events
- DB file: ~/.agist/data.db

## API Endpoints

### Companies
- `GET    /api/companies` — list all
- `POST   /api/companies` — create {name, description?, budgetMonthlyCents?}
- `GET    /api/companies/:id` — get one
- `PATCH  /api/companies/:id` — update
- `DELETE /api/companies/:id` — delete

### Agents
- `GET    /api/companies/:companyId/agents` — list by company
- `POST   /api/companies/:companyId/agents` — create {name, role, model?, title?, capabilities?}
- `GET    /api/agents/:id` — get one
- `PATCH  /api/agents/:id` — update (model, status, adapterConfig)
- `DELETE /api/agents/:id` — delete
- `POST   /api/agents/:id/wake` — manual wake {prompt?} — spawns Claude CLI

Agent roles are free-form strings (not enum). Common: devops, seo, marketing, content, development, lead, research.

### Routines (scheduled heartbeats)
- `GET    /api/companies/:companyId/routines` — list
- `POST   /api/companies/:companyId/routines` — create {agentId, title, cronExpression, timezone?}
- `PATCH  /api/routines/:id` — update
- `DELETE /api/routines/:id` — delete

### Runs
- `GET    /api/runs/recent` — last 20 runs across all agents
- `GET    /api/agents/:agentId/runs` — runs by agent
- `GET    /api/runs/:id` — run detail with log excerpt

### Issues
- `GET    /api/companies/:companyId/issues` — list (filterable: status, priority, agentId)
- `POST   /api/companies/:companyId/issues` — create {title, description?, priority?, agentId?}
- `PATCH  /api/issues/:id` — update
- `DELETE /api/issues/:id` — delete

### System
- `GET    /api/health` — server health + DB check
- `GET    /api/dashboard/stats` — dashboard KPIs (total agents, running, success rate, cost)
- `GET    /api/events` — SSE stream (agent.status, run.completed events)

## Dashboard Pages

| Route | Purpose |
|-------|---------|
| `/` | Dashboard — stat cards, agent fleet grid, recent runs, cost chart |
| `/companies` | Company list with agent counts and budgets |
| `/companies/:id` | Company detail with org chart (React Flow) and agent list |
| `/agents` | All agents — model badge (Haiku/Sonnet/Opus), status, actions |
| `/agents/:id` | Agent detail — live log viewer (WebSocket), run history, wake button |
| `/routines` | Routine/schedule management with enable/disable toggle |
| `/runs` | Run history table with status badges |
| `/runs/:id` | Run detail with full log and token/cost breakdown |
| `/issues` | Issue tracker with priority and status management |
| `/settings` | Platform settings |
| `/status` | Full-screen status board (wall monitor mode, no sidebar) |

## Key Components

- `agent-card.tsx` — Agent card with model badge, status dot, actions (wake/pause)
- `log-viewer.tsx` — Terminal-style WebSocket log viewer (monospace, color-coded, auto-scroll, reconnect)
- `org-chart.tsx` — React Flow org chart (agent hierarchy via reportsTo edges)
- `cost-chart.tsx` — Tremor stacked area chart (cost by model over 7 days)
- `command-palette.tsx` — Cmd+K command palette (cmdk)
- `stat-card.tsx` — KPI stat card with delta indicator
- `sidebar.tsx` — Dashboard navigation
- `sse-provider.tsx` — SSE client that auto-invalidates React Query cache on events

## Scheduler + Adapter

The core loop:
1. Scheduler checks due routines every 30 seconds (cron-parser v5)
2. Creates a run record (status: queued)
3. Spawns Claude CLI: `claude --model <model> --verbose --print --output-format stream-json -p "<prompt>"`
4. Streams stdout lines via WebSocket to subscribed dashboard clients
5. Parses stream-json for token counts (message_start, message_delta)
6. On exit: updates run (status, exitCode, tokens, cost), agent (status→idle), company (spent)
7. Broadcasts status change via SSE

### Skill Injection (TODO)
Currently the adapter passes only a prompt string. It should:
- Build a system prompt from agent's capabilities, title, company context
- Create a temp dir with `.claude/skills/` containing the agent's skill markdown
- Pass `--add-dir <tmpdir>` to give Claude Code the agent's context
- This is how Paperclip does it — we need to implement this

## Model Routing

Agents have a `model` field passed to Claude CLI `--model` flag:
- `claude-haiku-4-5-20251001` — monitoring, health checks (cheap, fast)
- `claude-sonnet-4-6` — core work, content, development (balanced)
- `claude-opus-4-6` — strategic decisions, deep reasoning (expensive)

Cost tracking (per 1M tokens, in cents):
- Haiku: input 80c, output 400c
- Sonnet: input 300c, output 1500c
- Opus: input 1500c, output 7500c

## Database

SQLite via sql.js (WebAssembly, zero native compilation).
Tables: companies, agents, routines, runs, issues.
Auto-saves to disk every 30 seconds.
DB path: `~/.agist/data.db`

## Real-time Architecture

- **WebSocket (ws://localhost:4400/ws):** Bidirectional. Client subscribes to agent logs.
  - Client sends: `{ type: "subscribe", agentId: "xxx" }` (or `"*"` for all)
  - Server pushes: `{ type: "log", agentId, runId, line, timestamp }`
  - Server pushes: `{ type: "status", agentId, status, runId }`
- **SSE (GET /api/events):** Unidirectional server→client.
  - Events: `agent.status`, `run.completed`
  - Dashboard uses SSEProvider to auto-invalidate React Query cache
  - 30s heartbeat ping to keep connection alive

## Conventions

- All IDs: nanoid (21 chars, URL-safe)
- All dates: ISO 8601 UTC strings
- Money: cents (integer)
- API responses: wrapped `{ company: {...} }`, `{ companies: [...] }`
- Frontend: @tanstack/react-query with 5s refetch + SSE invalidation
- UI: Dark mode default, shadcn slate palette
- Agent roles: free-form strings (not enum)
- Empty states: show "N/A" or descriptive message, never fake data

## Scripts

```bash
pnpm dev        # start backend + frontend (concurrently)
pnpm seed       # load demo data (Acme Corp + 4 agents + 5 runs)
pnpm clean      # delete database (~/.agist/data.db)
```

## Git

- Branch: `main`
- Commits: conventional (feat/fix/docs/chore)
- Repo: github.com/tahakotil/agist
- No generated files: node_modules, .next, dist, *.db
