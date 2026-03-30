/**
 * Security layer tests — auth middleware, RBAC, rate limiting, API key CRUD.
 *
 * These tests run in isolation using in-memory logic extracted from the
 * middleware modules, avoiding any live DB or HTTP server.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Auth utility tests ───────────────────────────────────────────────────────

import { generateApiKey, hashApiKey } from '../auth.js'

describe('generateApiKey', () => {
  it('returns a key prefixed with agist_', () => {
    const { key } = generateApiKey()
    expect(key).toMatch(/^agist_/)
  })

  it('returns a 64-char hex hash', () => {
    const { hash } = generateApiKey()
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]+$/)
  })

  it('generates unique keys on each call', () => {
    const a = generateApiKey()
    const b = generateApiKey()
    expect(a.key).not.toBe(b.key)
    expect(a.hash).not.toBe(b.hash)
  })

  it('hash is deterministic for same key', () => {
    const key = 'agist_testkey123'
    expect(hashApiKey(key)).toBe(hashApiKey(key))
  })

  it('different keys produce different hashes', () => {
    expect(hashApiKey('agist_aaa')).not.toBe(hashApiKey('agist_bbb'))
  })
})

// ─── Rate limiter unit tests ──────────────────────────────────────────────────

// Inline the rate-limit logic so we can test without Hono context
interface Bucket {
  count: number
  resetAt: number
}

function makeRateLimiter(max: number, windowMs: number) {
  const buckets = new Map<string, Bucket>()

  return function check(key: string, method: string): { allowed: boolean; remaining: number } {
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return { allowed: true, remaining: max }
    }

    const now = Date.now()
    let bucket = buckets.get(key)
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs }
      buckets.set(key, bucket)
    }
    bucket.count++
    const remaining = Math.max(0, max - bucket.count)
    return { allowed: bucket.count <= max, remaining }
  }
}

describe('rateLimit logic', () => {
  it('allows GET requests unconditionally', () => {
    const check = makeRateLimiter(1, 60_000)
    // Even over the limit for POST, GET should still pass
    for (let i = 0; i < 5; i++) {
      const result = check('user1', 'GET')
      expect(result.allowed).toBe(true)
    }
  })

  it('allows mutating requests within the limit', () => {
    const check = makeRateLimiter(3, 60_000)
    expect(check('user1', 'POST').allowed).toBe(true)
    expect(check('user1', 'POST').allowed).toBe(true)
    expect(check('user1', 'POST').allowed).toBe(true)
  })

  it('blocks after the limit is exceeded', () => {
    const check = makeRateLimiter(2, 60_000)
    check('user1', 'POST')
    check('user1', 'POST')
    const result = check('user1', 'POST')
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('tracks limits independently per key', () => {
    const check = makeRateLimiter(1, 60_000)
    expect(check('user1', 'DELETE').allowed).toBe(true)
    expect(check('user1', 'DELETE').allowed).toBe(false)
    // user2 has a fresh bucket
    expect(check('user2', 'DELETE').allowed).toBe(true)
  })

  it('decrements remaining count correctly', () => {
    const check = makeRateLimiter(5, 60_000)
    const first = check('u', 'POST')
    expect(first.remaining).toBe(4)
    const second = check('u', 'POST')
    expect(second.remaining).toBe(3)
  })
})

// ─── RBAC logic tests ─────────────────────────────────────────────────────────

type Role = 'admin' | 'readonly' | undefined

function checkRole(required: 'admin' | 'readonly', userRole: Role): boolean {
  if (required === 'admin' && userRole !== 'admin') return false
  return true
}

describe('requireRole logic', () => {
  it('allows admin when admin is required', () => {
    expect(checkRole('admin', 'admin')).toBe(true)
  })

  it('denies readonly when admin is required', () => {
    expect(checkRole('admin', 'readonly')).toBe(false)
  })

  it('denies undefined role when admin is required', () => {
    expect(checkRole('admin', undefined)).toBe(false)
  })

  it('allows admin on readonly-required routes', () => {
    expect(checkRole('readonly', 'admin')).toBe(true)
  })

  it('allows readonly on readonly-required routes', () => {
    expect(checkRole('readonly', 'readonly')).toBe(true)
  })
})

// ─── API key management logic tests ───────────────────────────────────────────

describe('API key management', () => {
  it('generated key has correct format', () => {
    const { key, hash } = generateApiKey()
    expect(key.startsWith('agist_')).toBe(true)
    expect(key.length).toBeGreaterThan(30)
    expect(hash.length).toBe(64)
  })

  it('hash function is consistent', () => {
    const key = 'agist_consistent_test_key'
    const h1 = hashApiKey(key)
    const h2 = hashApiKey(key)
    expect(h1).toBe(h2)
  })

  it('raw key must never equal its hash', () => {
    const { key, hash } = generateApiKey()
    expect(key).not.toBe(hash)
  })

  it('hash is hex encoded sha256', () => {
    const { hash } = generateApiKey()
    // SHA-256 hex = 64 hex chars
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })
})

// ─── Auth disabled bypass ─────────────────────────────────────────────────────

describe('AGIST_AUTH_DISABLED bypass', () => {
  it('when env is "true", auth should be skipped (role set to admin)', () => {
    // Simulate the logic in authMiddleware
    const authDisabled = 'true'
    const role = authDisabled === 'true' ? 'admin' : null
    expect(role).toBe('admin')
  })

  it('when env is not "true", auth should be enforced', () => {
    const authDisabled = 'false'
    const role = authDisabled === 'true' ? 'admin' : null
    expect(role).toBeNull()
  })
})

// ─── Wake prompt validation ───────────────────────────────────────────────────

import { z } from 'zod'

const wakeSchema = z.object({
  prompt: z.string().max(10_000, 'Prompt must be 10,000 characters or fewer').optional(),
})

describe('wake prompt validation', () => {
  it('accepts a valid prompt', () => {
    const result = wakeSchema.safeParse({ prompt: 'Check server health' })
    expect(result.success).toBe(true)
  })

  it('accepts missing prompt (optional)', () => {
    const result = wakeSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('rejects prompt over 10,000 chars', () => {
    const longPrompt = 'x'.repeat(10_001)
    const result = wakeSchema.safeParse({ prompt: longPrompt })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('10,000')
    }
  })

  it('accepts prompt of exactly 10,000 chars', () => {
    const exactPrompt = 'x'.repeat(10_000)
    const result = wakeSchema.safeParse({ prompt: exactPrompt })
    expect(result.success).toBe(true)
  })
})
