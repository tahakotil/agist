import { Hono } from 'hono'
import { renderMetrics, setAgentGauges, setRunsActive } from '../metrics.js'
import { get } from '../db.js'

export const metricsRouter = new Hono()

metricsRouter.get('/api/metrics', (c) => {
  // Refresh agent gauges from DB on every scrape
  try {
    const row = get<{ total: number; running: number }>(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running
       FROM agents`
    )
    setAgentGauges(row?.total ?? 0, row?.running ?? 0)

    const activeRow = get<{ active: number }>(
      `SELECT COUNT(*) as active FROM runs WHERE status = 'running'`
    )
    setRunsActive(activeRow?.active ?? 0)
  } catch {
    // DB not ready — serve stale gauges
  }

  return new Response(renderMetrics(), {
    headers: { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' },
  })
})
