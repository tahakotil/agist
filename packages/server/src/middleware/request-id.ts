import type { Context, Next } from 'hono'
import { nanoid } from 'nanoid'

export function requestIdMiddleware() {
  return async (c: Context, next: Next) => {
    const requestId = c.req.header('X-Request-Id') || nanoid(12)
    c.set('requestId', requestId)
    c.header('X-Request-Id', requestId)
    return next()
  }
}
