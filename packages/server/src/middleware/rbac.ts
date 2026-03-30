import type { Context, Next } from 'hono'

/**
 * Require the caller to have at least the specified role.
 * Role hierarchy: admin > readonly
 *
 * When AGIST_AUTH_DISABLED=true, all requests are treated as admin (dev mode).
 *
 * Apply this middleware on POST / PATCH / DELETE routes:
 *   router.post('/...', requireRole('admin'), handler)
 */
export function requireRole(role: 'admin' | 'readonly') {
  return async (c: Context, next: Next) => {
    // Auth disabled globally — treat every caller as admin
    if (process.env.AGIST_AUTH_DISABLED === 'true') {
      return next()
    }

    const userRole = c.get('role') as string | undefined

    if (role === 'admin' && userRole !== 'admin') {
      return c.json({ error: 'Admin access required' }, 403)
    }

    return next()
  }
}
