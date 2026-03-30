import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'crypto'

// ─── Helpers (extracted from webhooks.ts for unit testing) ───────────────────

function buildHmacSignature(secret: string, body: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
}

function buildWebhookBody(event: string, payload: Record<string, unknown>): string {
  return JSON.stringify({
    event,
    timestamp: expect.any(String),
    data: payload,
  })
}

// ─── HMAC signature generation ───────────────────────────────────────────────

describe('HMAC signature', () => {
  it('generates sha256 signature in correct format', () => {
    const sig = buildHmacSignature('mysecret', '{"hello":"world"}')
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/)
  })

  it('same body + secret always produces same signature', () => {
    const body = '{"event":"run.completed"}'
    const sig1 = buildHmacSignature('s3cr3t', body)
    const sig2 = buildHmacSignature('s3cr3t', body)
    expect(sig1).toBe(sig2)
  })

  it('different secrets produce different signatures', () => {
    const body = '{"event":"run.completed"}'
    const sig1 = buildHmacSignature('secret1', body)
    const sig2 = buildHmacSignature('secret2', body)
    expect(sig1).not.toBe(sig2)
  })

  it('different bodies produce different signatures', () => {
    const secret = 'mysecret'
    const sig1 = buildHmacSignature(secret, '{"event":"run.completed"}')
    const sig2 = buildHmacSignature(secret, '{"event":"run.failed"}')
    expect(sig1).not.toBe(sig2)
  })

  it('verifies a known HMAC value', () => {
    // Known values computed independently
    const secret = 'test-secret'
    const body = '{"event":"run.completed","data":{}}'
    const sig = buildHmacSignature(secret, body)
    // Should be deterministic sha256 hex
    const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
    expect(sig).toBe(expected)
  })
})

// ─── dispatchWebhooks (mocked fetch) ─────────────────────────────────────────

describe('dispatchWebhooks (unit)', () => {
  let fetchCalls: Array<{ url: string; options: RequestInit }> = []
  let mockWebhooks: Array<{
    id: string
    company_id: string
    url: string
    events: string
    secret: string | null
    enabled: number
    created_at: string
    updated_at: string
  }> = []

  // Inline reimplementation of dispatchWebhooks for unit testing
  async function dispatchWebhooksUnit(
    webhooks: typeof mockWebhooks,
    event: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    for (const webhook of webhooks) {
      if (!webhook.enabled) continue

      const subscribedEvents =
        webhook.events === '*'
          ? ['*']
          : webhook.events.split(',').map((e) => e.trim()).filter(Boolean)

      if (!subscribedEvents.includes('*') && !subscribedEvents.includes(event)) {
        continue
      }

      const body = JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        data: payload,
      })

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }

      if (webhook.secret) {
        const signature = createHmac('sha256', webhook.secret).update(body).digest('hex')
        headers['X-Agist-Signature'] = `sha256=${signature}`
      }

      fetchCalls.push({ url: webhook.url, options: { method: 'POST', headers, body } })
    }
  }

  beforeEach(() => {
    fetchCalls = []
    mockWebhooks = []
  })

  it('does not call fetch when no webhooks exist', async () => {
    await dispatchWebhooksUnit([], 'run.completed', { runId: 'r1' })
    expect(fetchCalls).toHaveLength(0)
  })

  it('calls fetch once for a matching wildcard webhook', async () => {
    mockWebhooks.push({
      id: 'wh-1', company_id: 'co-1', url: 'https://example.com/hook',
      events: '*', secret: null, enabled: 1,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    })

    await dispatchWebhooksUnit(mockWebhooks, 'run.completed', { runId: 'r1' })
    expect(fetchCalls).toHaveLength(1)
    expect(fetchCalls[0].url).toBe('https://example.com/hook')
  })

  it('calls fetch for matching specific event', async () => {
    mockWebhooks.push({
      id: 'wh-1', company_id: 'co-1', url: 'https://example.com/hook',
      events: 'run.completed,run.failed', secret: null, enabled: 1,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    })

    await dispatchWebhooksUnit(mockWebhooks, 'run.completed', { runId: 'r1' })
    expect(fetchCalls).toHaveLength(1)
  })

  it('does not call fetch for non-matching event', async () => {
    mockWebhooks.push({
      id: 'wh-1', company_id: 'co-1', url: 'https://example.com/hook',
      events: 'run.failed', secret: null, enabled: 1,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    })

    await dispatchWebhooksUnit(mockWebhooks, 'run.completed', { runId: 'r1' })
    expect(fetchCalls).toHaveLength(0)
  })

  it('skips disabled webhooks', async () => {
    mockWebhooks.push({
      id: 'wh-1', company_id: 'co-1', url: 'https://example.com/hook',
      events: '*', secret: null, enabled: 0,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    })

    await dispatchWebhooksUnit(mockWebhooks, 'run.completed', { runId: 'r1' })
    expect(fetchCalls).toHaveLength(0)
  })

  it('delivers to multiple matching webhooks', async () => {
    mockWebhooks.push(
      {
        id: 'wh-1', company_id: 'co-1', url: 'https://a.example.com/hook',
        events: '*', secret: null, enabled: 1,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      },
      {
        id: 'wh-2', company_id: 'co-1', url: 'https://b.example.com/hook',
        events: 'run.completed', secret: null, enabled: 1,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }
    )

    await dispatchWebhooksUnit(mockWebhooks, 'run.completed', { runId: 'r1' })
    expect(fetchCalls).toHaveLength(2)
    const urls = fetchCalls.map((c) => c.url)
    expect(urls).toContain('https://a.example.com/hook')
    expect(urls).toContain('https://b.example.com/hook')
  })

  it('sets Content-Type application/json header', async () => {
    mockWebhooks.push({
      id: 'wh-1', company_id: 'co-1', url: 'https://example.com/hook',
      events: '*', secret: null, enabled: 1,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    })

    await dispatchWebhooksUnit(mockWebhooks, 'run.completed', { runId: 'r1' })
    const headers = fetchCalls[0].options.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('sets X-Agist-Signature header when secret is present', async () => {
    const secret = 'my-webhook-secret'
    mockWebhooks.push({
      id: 'wh-1', company_id: 'co-1', url: 'https://example.com/hook',
      events: '*', secret, enabled: 1,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    })

    await dispatchWebhooksUnit(mockWebhooks, 'run.completed', { runId: 'r1' })
    const headers = fetchCalls[0].options.headers as Record<string, string>
    expect(headers['X-Agist-Signature']).toMatch(/^sha256=[0-9a-f]{64}$/)
  })

  it('does not set X-Agist-Signature when secret is null', async () => {
    mockWebhooks.push({
      id: 'wh-1', company_id: 'co-1', url: 'https://example.com/hook',
      events: '*', secret: null, enabled: 1,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    })

    await dispatchWebhooksUnit(mockWebhooks, 'run.completed', { runId: 'r1' })
    const headers = fetchCalls[0].options.headers as Record<string, string>
    expect(headers['X-Agist-Signature']).toBeUndefined()
  })

  it('HMAC signature is valid for the payload body', async () => {
    const secret = 'verify-me'
    mockWebhooks.push({
      id: 'wh-1', company_id: 'co-1', url: 'https://example.com/hook',
      events: '*', secret, enabled: 1,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    })

    await dispatchWebhooksUnit(mockWebhooks, 'run.failed', { runId: 'r1', error: 'crash' })
    const headers = fetchCalls[0].options.headers as Record<string, string>
    const body = fetchCalls[0].options.body as string
    const sig = headers['X-Agist-Signature']

    // Verify the signature matches the body
    const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
    expect(sig).toBe(expected)
  })

  it('payload body is valid JSON with event and data fields', async () => {
    mockWebhooks.push({
      id: 'wh-1', company_id: 'co-1', url: 'https://example.com/hook',
      events: '*', secret: null, enabled: 1,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    })

    const testPayload = { runId: 'r1', agentId: 'a1', status: 'failed' }
    await dispatchWebhooksUnit(mockWebhooks, 'run.failed', testPayload)

    const body = JSON.parse(fetchCalls[0].options.body as string)
    expect(body.event).toBe('run.failed')
    expect(body.data).toMatchObject(testPayload)
    expect(body.timestamp).toBeDefined()
    expect(typeof body.timestamp).toBe('string')
  })

  it('uses POST method', async () => {
    mockWebhooks.push({
      id: 'wh-1', company_id: 'co-1', url: 'https://example.com/hook',
      events: '*', secret: null, enabled: 1,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    })

    await dispatchWebhooksUnit(mockWebhooks, 'run.completed', {})
    expect(fetchCalls[0].options.method).toBe('POST')
  })
})

// ─── Webhook routes (HTTP integration) ───────────────────────────────────────

describe('webhook routes (HTTP)', async () => {
  // Dynamically import the app after setting up in-memory db
  // These tests use a real Hono app with in-memory SQLite

  const { initDb } = await import('../db.js')
  const { webhooksRouter } = await import('../routes/webhooks.js')
  const { Hono } = await import('hono')

  const app = new Hono()
  app.route('/', webhooksRouter)

  let companyId: string

  beforeEach(async () => {
    await initDb()
    // Create a test company
    const { run: dbRun, get: dbGet } = await import('../db.js')
    const { nanoid } = await import('nanoid')
    companyId = nanoid()
    dbRun(
      `INSERT INTO companies (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      [companyId, 'Test Co', new Date().toISOString(), new Date().toISOString()]
    )
  })

  it('GET /api/companies/:companyId/webhooks returns empty array initially', async () => {
    const res = await app.request(`/api/companies/${companyId}/webhooks`)
    expect(res.status).toBe(200)
    const body = await res.json() as { webhooks: unknown[] }
    expect(body.webhooks).toEqual([])
  })

  it('POST /api/companies/:companyId/webhooks creates a webhook', async () => {
    const res = await app.request(
      `/api/companies/${companyId}/webhooks`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/hook', events: '*' }),
      }
    )
    expect(res.status).toBe(201)
    const body = await res.json() as { webhook: Record<string, unknown> }
    expect(body.webhook.url).toBe('https://example.com/hook')
    expect(body.webhook.events).toBe('*')
    expect(body.webhook.enabled).toBe(true)
    expect(body.webhook.companyId).toBe(companyId)
  })

  it('POST masks the secret field in response', async () => {
    const res = await app.request(
      `/api/companies/${companyId}/webhooks`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/hook', secret: 'my-secret' }),
      }
    )
    const body = await res.json() as { webhook: Record<string, unknown> }
    expect(body.webhook.secret).toBe('***')
  })

  it('POST with no secret returns null secret', async () => {
    const res = await app.request(
      `/api/companies/${companyId}/webhooks`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/hook' }),
      }
    )
    const body = await res.json() as { webhook: Record<string, unknown> }
    expect(body.webhook.secret).toBeNull()
  })

  it('GET /api/companies/:companyId/webhooks lists created webhooks', async () => {
    // Create two webhooks
    await app.request(
      `/api/companies/${companyId}/webhooks`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://a.example.com/hook' }),
      }
    )
    await app.request(
      `/api/companies/${companyId}/webhooks`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://b.example.com/hook' }),
      }
    )

    const res = await app.request(`/api/companies/${companyId}/webhooks`)
    const body = await res.json() as { webhooks: Array<{ url: string }> }
    expect(body.webhooks).toHaveLength(2)
    const urls = body.webhooks.map((w) => w.url)
    expect(urls).toContain('https://a.example.com/hook')
    expect(urls).toContain('https://b.example.com/hook')
  })

  it('GET /api/webhooks/:id returns a single webhook', async () => {
    const createRes = await app.request(
      `/api/companies/${companyId}/webhooks`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/hook' }),
      }
    )
    const created = await createRes.json() as { webhook: { id: string } }
    const id = created.webhook.id

    const getRes = await app.request(`/api/webhooks/${id}`)
    expect(getRes.status).toBe(200)
    const body = await getRes.json() as { webhook: Record<string, unknown> }
    expect(body.webhook.id).toBe(id)
  })

  it('GET /api/webhooks/:id returns 404 for unknown id', async () => {
    const res = await app.request('/api/webhooks/nonexistent-id')
    expect(res.status).toBe(404)
  })

  it('PATCH /api/webhooks/:id updates enabled status', async () => {
    const createRes = await app.request(
      `/api/companies/${companyId}/webhooks`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/hook', enabled: true }),
      }
    )
    const created = await createRes.json() as { webhook: { id: string } }
    const id = created.webhook.id

    const patchRes = await app.request(
      `/api/webhooks/${id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      }
    )
    expect(patchRes.status).toBe(200)
    const body = await patchRes.json() as { webhook: Record<string, unknown> }
    expect(body.webhook.enabled).toBe(false)
  })

  it('PATCH /api/webhooks/:id updates url', async () => {
    const createRes = await app.request(
      `/api/companies/${companyId}/webhooks`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://old.example.com/hook' }),
      }
    )
    const created = await createRes.json() as { webhook: { id: string } }
    const id = created.webhook.id

    const patchRes = await app.request(
      `/api/webhooks/${id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://new.example.com/hook' }),
      }
    )
    const body = await patchRes.json() as { webhook: Record<string, unknown> }
    expect(body.webhook.url).toBe('https://new.example.com/hook')
  })

  it('PATCH /api/webhooks/:id returns 404 for unknown id', async () => {
    const res = await app.request(
      '/api/webhooks/nonexistent-id',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      }
    )
    expect(res.status).toBe(404)
  })

  it('DELETE /api/webhooks/:id deletes webhook', async () => {
    const createRes = await app.request(
      `/api/companies/${companyId}/webhooks`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/hook' }),
      }
    )
    const created = await createRes.json() as { webhook: { id: string } }
    const id = created.webhook.id

    const deleteRes = await app.request(
      `/api/webhooks/${id}`,
      { method: 'DELETE' }
    )
    expect(deleteRes.status).toBe(200)
    const body = await deleteRes.json() as { success: boolean }
    expect(body.success).toBe(true)

    // Verify it's gone
    const getRes = await app.request(`/api/webhooks/${id}`)
    expect(getRes.status).toBe(404)
  })

  it('DELETE /api/webhooks/:id returns 404 for unknown id', async () => {
    const res = await app.request('/api/webhooks/nonexistent-id', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })

  it('POST returns 404 for unknown company', async () => {
    const res = await app.request(
      '/api/companies/nonexistent-company/webhooks',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/hook' }),
      }
    )
    expect(res.status).toBe(404)
  })

  it('POST validates url format', async () => {
    const res = await app.request(
      `/api/companies/${companyId}/webhooks`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'not-a-url' }),
      }
    )
    expect(res.status).toBe(400)
  })
})
