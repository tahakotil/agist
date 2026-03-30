import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { all, get, run } from '../db.js'

export const webhooksRouter = new Hono()

interface WebhookRow {
  id: string
  company_id: string
  url: string
  events: string
  secret: string | null
  enabled: number
  created_at: string
  updated_at: string
}

function rowToWebhook(row: WebhookRow) {
  return {
    id: row.id,
    companyId: row.company_id,
    url: row.url,
    events: row.events,
    secret: row.secret ? '***' : null,   // Never expose the raw secret
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const createSchema = z.object({
  url: z.string().url().max(2000),
  events: z.string().max(500).optional().default('*'),
  secret: z.string().max(200).nullable().optional(),
  enabled: z.boolean().optional().default(true),
})

const updateSchema = z.object({
  url: z.string().url().max(2000).optional(),
  events: z.string().max(500).optional(),
  secret: z.string().max(200).nullable().optional(),
  enabled: z.boolean().optional(),
})

// GET /api/companies/:companyId/webhooks
webhooksRouter.get('/api/companies/:companyId/webhooks', (c) => {
  const companyId = c.req.param('companyId')

  const company = get(`SELECT id FROM companies WHERE id = ?`, [companyId])
  if (!company) {
    return c.json({ error: 'Company not found' }, 404)
  }

  const rows = all<WebhookRow>(
    `SELECT * FROM webhooks WHERE company_id = ? ORDER BY created_at DESC`,
    [companyId]
  )

  return c.json({ webhooks: rows.map(rowToWebhook) })
})

// POST /api/companies/:companyId/webhooks
webhooksRouter.post(
  '/api/companies/:companyId/webhooks',
  zValidator('json', createSchema),
  (c) => {
    const companyId = c.req.param('companyId')
    const body = c.req.valid('json')

    const company = get(`SELECT id FROM companies WHERE id = ?`, [companyId])
    if (!company) {
      return c.json({ error: 'Company not found' }, 404)
    }

    const now = new Date().toISOString()
    const id = nanoid()

    run(
      `INSERT INTO webhooks (id, company_id, url, events, secret, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        companyId,
        body.url,
        body.events,
        body.secret ?? null,
        body.enabled ? 1 : 0,
        now,
        now,
      ]
    )

    const row = get<WebhookRow>(`SELECT * FROM webhooks WHERE id = ?`, [id])
    return c.json({ webhook: rowToWebhook(row!) }, 201)
  }
)

// GET /api/webhooks/:id
webhooksRouter.get('/api/webhooks/:id', (c) => {
  const id = c.req.param('id')
  const row = get<WebhookRow>(`SELECT * FROM webhooks WHERE id = ?`, [id])
  if (!row) {
    return c.json({ error: 'Webhook not found' }, 404)
  }
  return c.json({ webhook: rowToWebhook(row) })
})

// PATCH /api/webhooks/:id
webhooksRouter.patch('/api/webhooks/:id', zValidator('json', updateSchema), (c) => {
  const id = c.req.param('id')
  const body = c.req.valid('json')

  const existing = get<WebhookRow>(`SELECT * FROM webhooks WHERE id = ?`, [id])
  if (!existing) {
    return c.json({ error: 'Webhook not found' }, 404)
  }

  const now = new Date().toISOString()
  const fields: string[] = []
  const values: unknown[] = []

  if (body.url !== undefined) { fields.push('url = ?'); values.push(body.url) }
  if (body.events !== undefined) { fields.push('events = ?'); values.push(body.events) }
  if ('secret' in body) { fields.push('secret = ?'); values.push(body.secret ?? null) }
  if (body.enabled !== undefined) { fields.push('enabled = ?'); values.push(body.enabled ? 1 : 0) }

  if (fields.length === 0) {
    return c.json({ webhook: rowToWebhook(existing) })
  }

  fields.push('updated_at = ?')
  values.push(now)
  values.push(id)

  run(`UPDATE webhooks SET ${fields.join(', ')} WHERE id = ?`, values)

  const updated = get<WebhookRow>(`SELECT * FROM webhooks WHERE id = ?`, [id])
  return c.json({ webhook: rowToWebhook(updated!) })
})

// DELETE /api/webhooks/:id
webhooksRouter.delete('/api/webhooks/:id', (c) => {
  const id = c.req.param('id')
  const existing = get(`SELECT id FROM webhooks WHERE id = ?`, [id])
  if (!existing) {
    return c.json({ error: 'Webhook not found' }, 404)
  }
  run(`DELETE FROM webhooks WHERE id = ?`, [id])
  return c.json({ success: true })
})
