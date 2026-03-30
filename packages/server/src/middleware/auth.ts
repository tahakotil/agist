import type { Context, Next } from 'hono'
import { hashApiKey } from '../auth.js'
import { get, run } from '../db.js'

interface ApiKeyRow {
  id: string
  role: string
}

/**
 * API key authentication middleware.
 *
 * Auth is DISABLED by default in development (AGIST_AUTH_DISABLED=true).
 * Set AGIST_AUTH_DISABLED=false (or remove it) in production to enforce auth.
 *
 * Clients must send the key in the X-Api-Key header:
 *   X-Api-Key: agist_xxxxxxxxxxxx
 *
 * Or as a query param (for WebSocket / SSE clients):
 *   ?api_key=agist_xxxxxxxxxxxx
 */
export function authMiddleware() {
  return async (c: Context, next: Next) => {
    // Skip auth in local dev when explicitly disabled
    if (process.env.AGIST_AUTH_DISABLED === 'true') {
      c.set('role', 'admin')
      return next()
    }

    // Always allow the health check — no auth needed for monitoring
    if (c.req.path === '/api/health') return next()

    const apiKey =
      c.req.header('X-Api-Key') ||
      c.req.header('x-api-key') ||
      c.req.query('api_key')

    if (!apiKey) {
      return c.json(
        { error: 'API key required. Set X-Api-Key header or ?api_key= query param.' },
        401
      )
    }

    const hash = hashApiKey(apiKey)
    const row = get<ApiKeyRow>(
      `SELECT id, role FROM api_keys WHERE key_hash = ?`,
      [hash]
    )

    if (!row) {
      return c.json({ error: 'Invalid API key' }, 401)
    }

    // Propagate identity to downstream handlers
    c.set('role', row.role)
    c.set('apiKeyId', row.id)

    // Track last usage time (fire-and-forget, non-blocking)
    try {
      run(`UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?`, [row.id])
    } catch {
      // Non-critical — don't fail the request if this update errors
    }

    return next()
  }
}
