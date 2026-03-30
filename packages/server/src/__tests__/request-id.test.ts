import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { requestIdMiddleware } from '../middleware/request-id.js'

function buildApp() {
  const app = new Hono()
  app.use('*', requestIdMiddleware())
  app.get('/test', (c) => {
    return c.json({ requestId: (c.get as (k: string) => string)('requestId') })
  })
  return app
}

describe('requestIdMiddleware', () => {
  it('generates a requestId when none is provided', async () => {
    const app = buildApp()
    const res = await app.request('/test')
    expect(res.status).toBe(200)
    const body = await res.json() as { requestId: string }
    expect(typeof body.requestId).toBe('string')
    expect(body.requestId.length).toBeGreaterThan(0)
  })

  it('echoes back X-Request-Id header when provided', async () => {
    const app = buildApp()
    const res = await app.request('/test', {
      headers: { 'X-Request-Id': 'my-trace-id-123' },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { requestId: string }
    expect(body.requestId).toBe('my-trace-id-123')
  })

  it('sets X-Request-Id response header', async () => {
    const app = buildApp()
    const res = await app.request('/test')
    expect(res.headers.get('X-Request-Id')).toBeTruthy()
  })

  it('passes through the provided X-Request-Id in response header', async () => {
    const app = buildApp()
    const res = await app.request('/test', {
      headers: { 'X-Request-Id': 'trace-abc' },
    })
    expect(res.headers.get('X-Request-Id')).toBe('trace-abc')
  })
})
