import type { Context, Next } from 'hono'

interface Bucket {
  count: number
  resetAt: number
}

// In-memory rate-limit buckets, keyed by apiKeyId or IP
const buckets = new Map<string, Bucket>()

export function rateLimit(opts: { max: number; windowMs: number }) {
  return async (c: Context, next: Next) => {
    // Only limit mutating methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return next()

    const key =
      (c.get('apiKeyId') as string | undefined) ||
      c.req.header('x-forwarded-for') ||
      'anonymous'

    const now = Date.now()
    let bucket = buckets.get(key)

    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + opts.windowMs }
      buckets.set(key, bucket)
    }

    bucket.count++

    c.header('X-RateLimit-Limit', String(opts.max))
    c.header('X-RateLimit-Remaining', String(Math.max(0, opts.max - bucket.count)))

    if (bucket.count > opts.max) {
      return c.json({ error: 'Rate limit exceeded. Too many requests.' }, 429)
    }

    // Lazy cleanup: prune stale entries when the map grows large
    if (buckets.size > 1000) {
      for (const [k, v] of buckets) {
        if (now > v.resetAt) buckets.delete(k)
      }
    }

    return next()
  }
}
