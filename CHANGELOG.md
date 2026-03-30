# Changelog

All notable changes to Agist will be documented in this file.

## [0.2.0] - 2026-03-30

### Added
- API key authentication with role-based access (admin/readonly)
- Rate limiting on all mutating endpoints
- Pagination and filtering on all list endpoints
- OpenAPI 3.1 specification at /api/openapi.json
- Structured JSON logging with log levels
- Prometheus-compatible metrics at /api/metrics
- Multi-adapter support (Claude CLI, Anthropic API, OpenAI, Mock)
- Webhook notifications for run events
- Slack and GitHub integrations
- Projects feature: group agents by project with working directory
- Agent tags for grouping and filtering (?tag=frontend)
- reportsTo validation with circular reference detection
- CLI: `npx agist setup|start|status|logs`
- Docker image and Docker Compose with Caddy reverse proxy
- Projects page in dashboard with create dialog
- .env.example for configuration reference

### Fixed
- Enum mismatches between shared types and server
- Double spend_monthly_cents update in adapter
- Wake rate limit memory leak
- DB auto-save interval not cleared on shutdown
- Dashboard infinite skeleton when backend is offline

## [0.1.0] - 2026-03-01

### Added
- Initial MVP release
- Hono HTTP API (port 4400)
- SQLite persistence via sql.js (WAL mode, zero native deps)
- Cron-based scheduler (cron-parser v5, 30s check interval)
- Claude CLI adapter with skill injection support
- WebSocket live logs (ws://localhost:4400/ws)
- SSE status events (/api/events)
- Next.js 16 dashboard (port 3004, shadcn/ui, dark mode)
- Multi-company support with agent fleet management
- Run history with token/cost tracking
- Issue tracker with priority and status
- React Flow org chart for agent hierarchy
- Tremor cost charts (7-day breakdown by model)
- Command palette (Cmd+K)
