# Agist

Open-source AI agent orchestration platform. Manage multi-agent teams from a single dashboard.

## Project Overview

- **Name:** Agist
- **Repo:** github.com/tahakotil/agist
- **License:** MIT
- **Status:** MVP — functional backend + frontend
- **Author:** Taha Kotil (kotivon.com)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router, Turbopack), shadcn/ui, Tremor charts, React Flow |
| Backend | Hono (TypeScript), WebSocket (ws), SSE |
| Database | SQLite via sql.js (WAL mode, zero native deps) |
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
# Terminal 1:
cd packages/server && npx tsx src/index.ts
# Terminal 2:
cd packages/web && npx next dev -p 3004
```

- Backend: http://localhost:4400
- Frontend: http://localhost:3004
- WebSocket: ws://localhost:4400/ws
- SSE: http://localhost:4400/api/events
- DB file: ~/.agent-platform/data.db

## API Endpoints

### Companies
- `GET    /api/companies` — list all
- `POST   /api/companies` — create
- `GET    /api/companies/:id` — get one
- `PATCH  /api/companies/:id` — update
- `DELETE /api/companies/:id` — delete

### Agents
- `GET    /api/companies/:companyId/agents` — list by company
- `POST   /api/companies/:companyId/agents` — create
- `GET    /api/agents/:id` — get one
- `PATCH  /api/agents/:id` — update (model, config, status)
- `DELETE /api/agents/:id` — delete
- `POST   /api/agents/:id/wake` — manual wake (spawn Claude CLI)

### Routines (scheduled heartbeats)
- `GET    /api/companies/:companyId/routines` — list
- `POST   /api/companies/:companyId/routines` — create (cronExpression, agentId)
- `PATCH  /api/routines/:id` — update
- `DELETE /api/routines/:id` — delete

### Runs
- `GET    /api/runs/recent` — last 20 runs across all agents
- `GET    /api/agents/:agentId/runs` — runs by agent
- `GET    /api/runs/:id` — run detail

### Issues
- `GET    /api/companies/:companyId/issues` — list (filterable by status, priority, agentId)
- `POST   /api/companies/:companyId/issues` — create
- `PATCH  /api/issues/:id` — update
- `DELETE /api/issues/:id` — delete

### System
- `GET    /api/health` — server health + DB check
- `GET    /api/events` — SSE stream (agent status changes, run completions)

## Dashboard Pages

| Route | Purpose |
|-------|---------|
| `/` | Status dashboard — stat cards, agent grid, recent runs, cost chart |
| `/companies` | Company list with agent counts and budgets |
| `/companies/:id` | Company detail with org chart (React Flow) |
| `/agents` | All agents table — model badge, status, schedule, actions |
| `/agents/:id` | Agent detail — live log viewer (WebSocket), run history |
| `/routines` | Routine/schedule management |
| `/runs` | Run history table |
| `/runs/:id` | Run detail with full log |
| `/issues` | Issue tracker |
| `/settings` | Platform settings |
| `/status` | Full-screen status board (wall monitor mode) |

## Key Components

- `agent-card.tsx` — Agent card with model badge, status dot, cron, actions
- `log-viewer.tsx` — Terminal-style WebSocket log viewer (monospace, color-coded)
- `org-chart.tsx` — React Flow org chart (agent hierarchy, reportsTo edges)
- `cost-chart.tsx` — Tremor area chart for cost tracking
- `command-palette.tsx` — Cmd+K command palette (cmdk)
- `stat-card.tsx` — KPI stat card with delta indicator
- `sidebar.tsx` — Dashboard navigation sidebar

## Scheduler

- Checks due routines every 30 seconds
- Parses cron expressions via cron-parser v5 (CronExpressionParser)
- Spawns Claude CLI: `claude --model <model> --print --output-format stream-json -p "<prompt>"`
- Streams output via WebSocket, tracks tokens/cost per run
- Updates agent status (idle/running/error) in real-time via SSE

## Model Routing

Agents have a `model` field that gets passed to Claude CLI:
- `claude-haiku-4-5-20251001` — monitoring/health checks (cheap, fast)
- `claude-sonnet-4-6` — core work (balanced)
- `claude-opus-4-6` — strategic decisions (deep reasoning)

## Database

SQLite with sql.js (WebAssembly, no native compilation needed).
Tables: companies, agents, routines, runs, issues.
Auto-saves to disk every 30 seconds.
DB path: `~/.agent-platform/data.db`

## Conventions

- All IDs are nanoid (21 chars)
- All dates are ISO 8601 UTC strings
- Money values in cents (integer)
- API responses wrapped: `{ company: {...} }`, `{ companies: [...] }`
- Frontend uses @tanstack/react-query with 5s refetch
- Dark mode default (shadcn slate palette)

## Git Workflow

- Branch: `main`
- Commits: conventional (feat/fix/docs/chore)
- No generated files in git (node_modules, .next, dist)
