/**
 * Tests for the Agent Context Capsule API:
 *  - GET /api/agents/:id/context
 *  - PUT /api/agents/:id/context
 *  - Max-length validation (>10,000 chars rejected)
 *
 * For parseContextUpdate() tests see: parse-context-update.test.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'
import { createTestDb, setActiveDb, createDbMock } from '../../test/db-mock.js'

vi.mock('../db.js', () => createDbMock())
vi.mock('../sse.js', () => ({ broadcast: () => {}, subscribe: () => () => {} }))
vi.mock('../ws.js', () => ({
  pushToAgent: () => {},
  initWebSocketServer: () => {},
  handleUpgrade: () => {},
}))
vi.mock('../adapter.js', () => ({
  spawnClaudeLocal: vi.fn(async () => {}),
}))

async function buildApp() {
  const { companiesRouter } = await import('../routes/companies.js')
  const { agentsRouter } = await import('../routes/agents.js')
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('role', 'admin')
    c.set('apiKeyId', 'test-key')
    return next()
  })
  app.route('/', companiesRouter)
  app.route('/', agentsRouter)
  app.onError((err, c) => c.json({ error: err.message }, 500))
  return app
}

function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>
}

async function createCompany(app: Hono, name = 'Test Corp') {
  const res = await app.request('/api/companies', {
    method: 'POST',
    body: JSON.stringify({ name }),
    headers: { 'Content-Type': 'application/json' },
  })
  const body = await json(res)
  return (body.company as Record<string, unknown>).id as string
}

async function createAgent(app: Hono, companyId: string, name = 'TestAgent') {
  const res = await app.request(`/api/companies/${companyId}/agents`, {
    method: 'POST',
    body: JSON.stringify({ name, role: 'worker' }),
    headers: { 'Content-Type': 'application/json' },
  })
  const body = await json(res)
  return (body.agent as Record<string, unknown>).id as string
}

describe('Context Capsule API', () => {
  let app: Hono
  let companyId: string
  let agentId: string

  beforeEach(async () => {
    const db = await createTestDb()
    setActiveDb(db)
    app = await buildApp()
    companyId = await createCompany(app)
    agentId = await createAgent(app, companyId)
  })

  it('GET /api/agents/:id/context → 200 with empty capsule by default', async () => {
    const res = await app.request(`/api/agents/${agentId}/context`)
    expect(res.status).toBe(200)
    const body = await json(res)
    expect(body.capsule).toBe('')
  })

  it('GET /api/agents/nonexistent/context → 404', async () => {
    const res = await app.request('/api/agents/ghost-id-000/context')
    expect(res.status).toBe(404)
  })

  it('PUT /api/agents/:id/context → 200 updates capsule', async () => {
    const capsule = 'IDENTITY: TestAgent\nROLE: worker'
    const res = await app.request(`/api/agents/${agentId}/context`, {
      method: 'PUT',
      body: JSON.stringify({ capsule }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(200)
    const body = await json(res)
    expect(body.capsule).toBe(capsule)
  })

  it('PUT then GET returns updated capsule', async () => {
    const capsule = 'IDENTITY: Updated\nSTATUS: active'
    await app.request(`/api/agents/${agentId}/context`, {
      method: 'PUT',
      body: JSON.stringify({ capsule }),
      headers: { 'Content-Type': 'application/json' },
    })
    const getRes = await app.request(`/api/agents/${agentId}/context`)
    const body = await json(getRes)
    expect(body.capsule).toBe(capsule)
  })

  it('PUT with capsule exceeding 10,000 chars → 400', async () => {
    const tooLong = 'x'.repeat(10_001)
    const res = await app.request(`/api/agents/${agentId}/context`, {
      method: 'PUT',
      body: JSON.stringify({ capsule: tooLong }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(400)
  })

  it('PUT with exactly 10,000 chars → 200', async () => {
    const maxLen = 'x'.repeat(10_000)
    const res = await app.request(`/api/agents/${agentId}/context`, {
      method: 'PUT',
      body: JSON.stringify({ capsule: maxLen }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(200)
  })

  it('PUT to nonexistent agent → 404', async () => {
    const res = await app.request('/api/agents/ghost-id-000/context', {
      method: 'PUT',
      body: JSON.stringify({ capsule: 'hello' }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(404)
  })

  it('PUT without capsule field → 400', async () => {
    const res = await app.request(`/api/agents/${agentId}/context`, {
      method: 'PUT',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(400)
  })

  it('PUT with empty string clears the capsule', async () => {
    await app.request(`/api/agents/${agentId}/context`, {
      method: 'PUT',
      body: JSON.stringify({ capsule: 'some content' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const clearRes = await app.request(`/api/agents/${agentId}/context`, {
      method: 'PUT',
      body: JSON.stringify({ capsule: '' }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(clearRes.status).toBe(200)
    const getRes = await app.request(`/api/agents/${agentId}/context`)
    const body = await json(getRes)
    expect(body.capsule).toBe('')
  })
})
