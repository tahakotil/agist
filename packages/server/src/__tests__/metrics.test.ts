import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the db module before importing metrics router
vi.mock('../db.js', () => ({
  get: vi.fn().mockReturnValue(undefined),
  all: vi.fn().mockReturnValue([]),
  run: vi.fn(),
  initDb: async () => ({}),
  saveDb: () => {},
  getDb: () => ({}),
}))

describe('metrics module', () => {
  beforeEach(async () => {
    vi.resetModules()
  })

  it('renderMetrics returns Prometheus text format', async () => {
    const { renderMetrics } = await import('../metrics.js')
    const output = renderMetrics()
    expect(typeof output).toBe('string')
    expect(output).toContain('# HELP agist_http_requests_total')
    expect(output).toContain('# TYPE agist_http_requests_total counter')
    expect(output).toContain('# HELP agist_runs_total')
    expect(output).toContain('# HELP agist_runs_active')
    expect(output).toContain('# HELP agist_tokens_total')
    expect(output).toContain('# HELP agist_agents_total')
    expect(output).toContain('agist_runs_active')
    expect(output).toContain('agist_tokens_total{direction="input"}')
    expect(output).toContain('agist_tokens_total{direction="output"}')
  })

  it('incHttpRequest increments counters', async () => {
    const { incHttpRequest, renderMetrics } = await import('../metrics.js')
    incHttpRequest('GET', '/api/agents', 200, 45)
    incHttpRequest('GET', '/api/agents', 200, 60)
    incHttpRequest('POST', '/api/agents', 201, 120)
    const output = renderMetrics()
    expect(output).toContain('method="GET",path="/api/agents",status="200"} 2')
    expect(output).toContain('method="POST",path="/api/agents",status="201"} 1')
  })

  it('incRun increments run status counters', async () => {
    const { incRun, renderMetrics } = await import('../metrics.js')
    incRun('completed')
    incRun('completed')
    incRun('failed')
    const output = renderMetrics()
    expect(output).toContain('status="completed"} 2')
    expect(output).toContain('status="failed"} 1')
  })

  it('addTokens accumulates token totals', async () => {
    const { addTokens, renderMetrics } = await import('../metrics.js')
    addTokens(1000, 500)
    addTokens(2000, 300)
    const output = renderMetrics()
    expect(output).toContain('agist_tokens_total{direction="input"} 3000')
    expect(output).toContain('agist_tokens_total{direction="output"} 800')
  })

  it('setAgentGauges updates gauge values', async () => {
    const { setAgentGauges, renderMetrics } = await import('../metrics.js')
    setAgentGauges(12, 3)
    const output = renderMetrics()
    expect(output).toContain('agist_agents_total 12')
    expect(output).toContain('agist_agents_running 3')
  })
})

describe('GET /api/metrics', () => {
  it('returns 200 with Prometheus content-type', async () => {
    vi.resetModules()
    const { Hono } = await import('hono')
    const { metricsRouter } = await import('../routes/metrics.js')
    const app = new Hono()
    app.route('/', metricsRouter)
    const res = await app.request('/api/metrics')
    expect(res.status).toBe(200)
    const ct = res.headers.get('content-type') ?? ''
    expect(ct).toContain('text/plain')
    const body = await res.text()
    expect(body).toContain('# HELP agist_http_requests_total')
  })
})
