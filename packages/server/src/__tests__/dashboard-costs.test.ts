import { describe, it, expect, beforeEach, vi } from 'vitest'

// ─── Inline mock for db ────────────────────────────────────────────────────────
// We use a simple closure so we can control what `all` returns per-test.
let _allRows: Record<string, unknown>[] = []

vi.mock('../db.js', () => ({
  get: vi.fn(),
  all: vi.fn((_sql: string, _params?: unknown[]) => _allRows),
  run: vi.fn(),
  initDb: async () => ({}),
  saveDb: () => {},
  getDb: () => ({}),
}))

vi.mock('../sse.js', () => ({ broadcast: () => {}, subscribe: () => () => {}, sseRouter: { get: () => {} } }))
vi.mock('../ws.js', () => ({ pushToAgent: () => {}, initWebSocketServer: () => {}, handleUpgrade: () => {} }))
vi.mock('../adapter.js', () => ({ spawnClaudeLocal: async () => {} }))
vi.mock('../logger.js', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

async function buildApp() {
  const { Hono } = await import('hono')
  const { healthRouter } = await import('../routes/health.js')
  const app = new Hono()
  app.route('/', healthRouter)
  return app
}

describe('GET /api/dashboard/costs', () => {
  beforeEach(() => {
    vi.resetModules()
    _allRows = []
  })

  it('returns empty array when no runs exist', async () => {
    _allRows = []
    const app = await buildApp()
    const res = await app.request('/api/dashboard/costs')
    expect(res.status).toBe(200)
    const body = await res.json() as { costs: unknown[] }
    expect(Array.isArray(body.costs)).toBe(true)
    expect(body.costs).toHaveLength(0)
  })

  it('returns cost breakdown by agent', async () => {
    _allRows = [
      {
        date: '2026-03-29',
        agent_id: 'agent1',
        agent_name: 'Builder',
        model: 'claude-sonnet-4-6',
        cost_cents: 450,
      },
    ]
    const app = await buildApp()
    const res = await app.request('/api/dashboard/costs?days=7')
    expect(res.status).toBe(200)
    const body = await res.json() as { costs: Array<Record<string, unknown>> }
    expect(body.costs.length).toBeGreaterThan(0)
    const entry = body.costs[0]
    expect(entry).toHaveProperty('date')
    expect(entry).toHaveProperty('agentId')
    expect(entry).toHaveProperty('agentName')
    expect(entry).toHaveProperty('model')
    expect(entry).toHaveProperty('costCents')
    expect(typeof entry.costCents).toBe('number')
  })

  it('maps snake_case row fields to camelCase response', async () => {
    _allRows = [
      {
        date: '2026-03-28',
        agent_id: 'agentX',
        agent_name: 'Writer',
        model: 'claude-haiku-4-5-20251001',
        cost_cents: 80,
      },
    ]
    const app = await buildApp()
    const res = await app.request('/api/dashboard/costs?days=7')
    expect(res.status).toBe(200)
    const body = await res.json() as { costs: Array<Record<string, unknown>> }
    const entry = body.costs[0]
    expect(entry.agentId).toBe('agentX')
    expect(entry.agentName).toBe('Writer')
    expect(entry.costCents).toBe(80)
  })
})
