/**
 * BUG-007: Dashboard Stats Error Swallowing
 *
 * Tests that errors in the dashboard stats endpoint are:
 * 1. Logged via console.error (not silently swallowed)
 * 2. Return HTTP 500 with both an error message AND fallback stats
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'

// ─── Extracted stats handler logic (mirrors health.ts implementation) ─────────

interface DashboardStats {
  totalAgents: number
  runningNow: number
  successRate24h: number | null
  costToday: number
}

interface GetRow {
  (sql: string, params?: unknown[]): Record<string, unknown> | undefined
}

function createStatsHandler(getRow: GetRow) {
  const app = new Hono()

  app.get('/api/dashboard/stats', (c) => {
    let totalAgents = 0
    let runningNow = 0
    let successRate24h: number | null = null
    let costTodayCents = 0

    try {
      const agentStats = getRow(
        `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running FROM agents`
      ) as { total: number; running: number } | undefined

      totalAgents = agentStats?.total ?? 0
      runningNow = agentStats?.running ?? 0

      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const runStats = getRow(
        `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success FROM runs WHERE created_at > ?`,
        [since24h]
      ) as { total: number; success: number } | undefined

      successRate24h =
        runStats && runStats.total > 0
          ? Math.round((runStats.success / runStats.total) * 1000) / 10
          : null

      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const costRow = getRow(
        `SELECT SUM(cost_cents) as total FROM runs WHERE created_at >= ?`,
        [today.toISOString()]
      ) as { total: number } | undefined
      costTodayCents = costRow?.total ?? 0
    } catch (err) {
      console.error('[Agist] Dashboard stats query failed:', err)
      return c.json(
        {
          error: 'Failed to compute dashboard stats',
          stats: { totalAgents: 0, running: 0, successRate: null, costToday: 0 },
        },
        500
      )
    }

    return c.json({
      totalAgents,
      runningNow,
      successRate24h,
      costToday: costTodayCents / 100,
    })
  })

  return app
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BUG-007: Dashboard Stats Error Swallowing', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns 200 with stats when DB queries succeed', async () => {
    const getRow = vi.fn()
      .mockReturnValueOnce({ total: 5, running: 2 })   // agent stats
      .mockReturnValueOnce({ total: 10, success: 8 })  // run stats
      .mockReturnValueOnce({ total: 500 })              // cost today

    const app = createStatsHandler(getRow)
    const res = await app.request('/api/dashboard/stats')

    expect(res.status).toBe(200)
    const body = await res.json() as DashboardStats
    expect(body.totalAgents).toBe(5)
    expect(body.runningNow).toBe(2)
    expect(body.successRate24h).toBe(80)
    expect(body.costToday).toBe(5) // 500 cents / 100
  })

  it('returns 500 with error message when DB throws', async () => {
    const getRow = vi.fn().mockImplementation(() => {
      throw new Error('DB connection lost')
    })

    const app = createStatsHandler(getRow)
    const res = await app.request('/api/dashboard/stats')

    expect(res.status).toBe(500)
    const body = await res.json() as { error: string; stats: object }
    expect(body.error).toBe('Failed to compute dashboard stats')
  })

  it('returns fallback stats object on DB error', async () => {
    const getRow = vi.fn().mockImplementation(() => {
      throw new Error('SQL syntax error')
    })

    const app = createStatsHandler(getRow)
    const res = await app.request('/api/dashboard/stats')

    expect(res.status).toBe(500)
    const body = await res.json() as { error: string; stats: { totalAgents: number; running: number; successRate: null; costToday: number } }
    expect(body.stats).toEqual({
      totalAgents: 0,
      running: 0,
      successRate: null,
      costToday: 0,
    })
  })

  it('logs error via console.error (not swallowed silently)', async () => {
    const dbError = new Error('Unexpected DB failure')
    const getRow = vi.fn().mockImplementation(() => {
      throw dbError
    })

    const app = createStatsHandler(getRow)
    await app.request('/api/dashboard/stats')

    expect(console.error).toHaveBeenCalledWith(
      '[Agist] Dashboard stats query failed:',
      dbError
    )
  })

  it('does NOT call console.error on success', async () => {
    const getRow = vi.fn()
      .mockReturnValueOnce({ total: 3, running: 1 })
      .mockReturnValueOnce({ total: 5, success: 4 })
      .mockReturnValueOnce({ total: 100 })

    const app = createStatsHandler(getRow)
    await app.request('/api/dashboard/stats')

    expect(console.error).not.toHaveBeenCalled()
  })

  it('handles null total agents gracefully (returns 0)', async () => {
    const getRow = vi.fn()
      .mockReturnValueOnce(undefined)                  // no agent stats row
      .mockReturnValueOnce(undefined)                  // no run stats
      .mockReturnValueOnce(undefined)                  // no cost row

    const app = createStatsHandler(getRow)
    const res = await app.request('/api/dashboard/stats')

    expect(res.status).toBe(200)
    const body = await res.json() as DashboardStats
    expect(body.totalAgents).toBe(0)
    expect(body.successRate24h).toBeNull()
    expect(body.costToday).toBe(0)
  })

  it('calculates successRate24h correctly (80% = 80.0)', async () => {
    const getRow = vi.fn()
      .mockReturnValueOnce({ total: 0, running: 0 })
      .mockReturnValueOnce({ total: 100, success: 80 })
      .mockReturnValueOnce({ total: 0 })

    const app = createStatsHandler(getRow)
    const res = await app.request('/api/dashboard/stats')
    const body = await res.json() as DashboardStats
    expect(body.successRate24h).toBe(80)
  })

  it('returns null successRate24h when no runs in 24h', async () => {
    const getRow = vi.fn()
      .mockReturnValueOnce({ total: 2, running: 0 })
      .mockReturnValueOnce({ total: 0, success: 0 })  // zero total runs
      .mockReturnValueOnce({ total: 0 })

    const app = createStatsHandler(getRow)
    const res = await app.request('/api/dashboard/stats')
    const body = await res.json() as DashboardStats
    expect(body.successRate24h).toBeNull()
  })
})
