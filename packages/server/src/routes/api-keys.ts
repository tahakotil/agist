import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { all, get, run } from '../db.js'
import { generateApiKey } from '../auth.js'
import { requireRole } from '../middleware/rbac.js'

export const apiKeysRouter = new Hono()

const createSchema = z.object({
  name: z.string().min(1).max(200),
  role: z.enum(['admin', 'readonly']).default('admin'),
})

interface ApiKeyRow {
  id: string
  name: string
  key_hash: string
  role: string
  created_at: string
  last_used_at: string | null
}

function rowToApiKey(row: ApiKeyRow) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    // key_hash is NEVER returned to clients
  }
}

// POST /api/api-keys — create a new API key (returns raw key once, stores hash)
apiKeysRouter.post(
  '/api/api-keys',
  requireRole('admin'),
  zValidator('json', createSchema),
  (c) => {
    const body = c.req.valid('json')
    const { key, hash } = generateApiKey()
    const id = nanoid()
    const now = new Date().toISOString()

    run(
      `INSERT INTO api_keys (id, name, key_hash, role, created_at, last_used_at)
       VALUES (?, ?, ?, ?, ?, NULL)`,
      [id, body.name, hash, body.role, now]
    )

    return c.json(
      {
        apiKey: {
          id,
          name: body.name,
          role: body.role,
          createdAt: now,
          lastUsedAt: null,
          // Raw key is returned ONLY here — never shown again
          key,
        },
      },
      201
    )
  }
)

// GET /api/api-keys — list all keys (no hashes)
apiKeysRouter.get('/api/api-keys', requireRole('admin'), (c) => {
  const rows = all<ApiKeyRow>(
    `SELECT id, name, key_hash, role, created_at, last_used_at FROM api_keys ORDER BY created_at DESC`
  )
  return c.json({ apiKeys: rows.map(rowToApiKey) })
})

// DELETE /api/api-keys/:id — revoke a key
apiKeysRouter.delete('/api/api-keys/:id', requireRole('admin'), (c) => {
  const id = c.req.param('id')

  const existing = get(`SELECT id FROM api_keys WHERE id = ?`, [id])
  if (!existing) {
    return c.json({ error: 'API key not found' }, 404)
  }

  run(`DELETE FROM api_keys WHERE id = ?`, [id])
  return c.json({ success: true })
})
