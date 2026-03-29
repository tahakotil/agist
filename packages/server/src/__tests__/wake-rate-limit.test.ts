/**
 * BUG-005: Wake Rate Limit Memory Leak
 *
 * Tests that the wakeRateLimit Map is lazily pruned when size > 100,
 * removing entries older than 60 seconds to prevent unbounded memory growth.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Extracted rate-limit logic (mirrors agents.ts implementation) ────────────

const WAKE_COOLDOWN_MS = 10_000

function checkAndPruneRateLimit(
  wakeRateLimit: Map<string, number>,
  agentId: string,
  now: number
): { limited: boolean; retryAfterSeconds?: number } {
  // Lazy pruning: clean stale entries when map grows large to prevent memory leak
  if (wakeRateLimit.size > 100) {
    for (const [key, timestamp] of wakeRateLimit) {
      if (now - timestamp > 60_000) wakeRateLimit.delete(key)
    }
  }

  const lastWake = wakeRateLimit.get(agentId)
  if (lastWake !== undefined && now - lastWake < WAKE_COOLDOWN_MS) {
    const retryAfterSeconds = Math.ceil((WAKE_COOLDOWN_MS - (now - lastWake)) / 1000)
    return { limited: true, retryAfterSeconds }
  }

  wakeRateLimit.set(agentId, now)
  return { limited: false }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BUG-005: Wake Rate Limit Memory Leak — lazy pruning', () => {
  it('allows first wake for any agent', () => {
    const map = new Map<string, number>()
    const result = checkAndPruneRateLimit(map, 'agent-1', Date.now())
    expect(result.limited).toBe(false)
  })

  it('rate-limits second wake within cooldown window', () => {
    const map = new Map<string, number>()
    const now = Date.now()
    checkAndPruneRateLimit(map, 'agent-1', now)
    const result = checkAndPruneRateLimit(map, 'agent-1', now + 5_000)
    expect(result.limited).toBe(true)
    expect(result.retryAfterSeconds).toBe(5)
  })

  it('allows wake after cooldown window expires', () => {
    const map = new Map<string, number>()
    const now = Date.now()
    checkAndPruneRateLimit(map, 'agent-1', now)
    const result = checkAndPruneRateLimit(map, 'agent-1', now + 11_000)
    expect(result.limited).toBe(false)
  })

  it('does NOT prune when map size is <= 100', () => {
    const map = new Map<string, number>()
    const now = Date.now()

    // Add 50 stale entries (older than 60s)
    for (let i = 0; i < 50; i++) {
      map.set(`agent-stale-${i}`, now - 120_000)
    }

    expect(map.size).toBe(50)
    checkAndPruneRateLimit(map, 'new-agent', now)

    // Size = 50 stale + 1 new = 51, pruning did NOT run (threshold is > 100)
    expect(map.size).toBe(51)
  })

  it('prunes stale entries when map size exceeds 100', () => {
    const map = new Map<string, number>()
    const now = Date.now()

    // Add 101 stale entries (older than 60s)
    for (let i = 0; i < 101; i++) {
      map.set(`agent-stale-${i}`, now - 120_000)
    }

    expect(map.size).toBe(101)

    checkAndPruneRateLimit(map, 'new-agent', now)

    // All 101 stale entries should be pruned, only the new entry remains
    expect(map.size).toBe(1)
    expect(map.has('new-agent')).toBe(true)
  })

  it('preserves recent entries during pruning (keeps entries < 60s old)', () => {
    const map = new Map<string, number>()
    const now = Date.now()

    // Add 90 stale entries
    for (let i = 0; i < 90; i++) {
      map.set(`agent-stale-${i}`, now - 120_000)
    }

    // Add 20 recent entries (within 60s, should be kept)
    for (let i = 0; i < 20; i++) {
      map.set(`agent-recent-${i}`, now - 30_000)
    }

    // Total = 110 > 100, triggering pruning on next call
    expect(map.size).toBe(110)

    checkAndPruneRateLimit(map, 'trigger-agent', now)

    // 90 stale removed, 20 recent kept + 1 new = 21
    expect(map.size).toBe(21)

    // Recent entries still present
    expect(map.has('agent-recent-0')).toBe(true)
    expect(map.has('agent-recent-19')).toBe(true)

    // Stale entries gone
    expect(map.has('agent-stale-0')).toBe(false)
  })

  it('pruning threshold is > 100, not >= 100', () => {
    const map = new Map<string, number>()
    const now = Date.now()

    // Add exactly 100 stale entries
    for (let i = 0; i < 100; i++) {
      map.set(`agent-stale-${i}`, now - 120_000)
    }

    expect(map.size).toBe(100)

    checkAndPruneRateLimit(map, 'new-agent', now)

    // size is exactly 100, so pruning did NOT run (condition is > 100)
    // After adding new agent: 100 stale + 1 new = 101
    expect(map.size).toBe(101)
    expect(map.has('agent-stale-0')).toBe(true)
  })

  it('prune threshold is based on 60 seconds exactly', () => {
    const map = new Map<string, number>()
    const now = Date.now()

    // Add 101 entries — some at exactly 60s, some at 60s+1ms, some at 59s
    for (let i = 0; i < 50; i++) {
      map.set(`agent-exactly60-${i}`, now - 60_000) // exactly 60s — NOT pruned (condition is >)
    }
    for (let i = 0; i < 51; i++) {
      map.set(`agent-over60-${i}`, now - 60_001) // just over 60s — pruned
    }

    expect(map.size).toBe(101)

    checkAndPruneRateLimit(map, 'new-agent', now)

    // 51 over-60s entries pruned, 50 exactly-60s entries kept + 1 new
    expect(map.size).toBe(51)
    expect(map.has('agent-exactly60-0')).toBe(true)
    expect(map.has('agent-over60-0')).toBe(false)
  })

  it('different agents have independent rate limits', () => {
    const map = new Map<string, number>()
    const now = Date.now()

    checkAndPruneRateLimit(map, 'agent-A', now)

    // agent-B should not be rate-limited
    const resultB = checkAndPruneRateLimit(map, 'agent-B', now + 1_000)
    expect(resultB.limited).toBe(false)

    // agent-A within cooldown is still rate-limited
    const resultA2 = checkAndPruneRateLimit(map, 'agent-A', now + 1_000)
    expect(resultA2.limited).toBe(true)
  })
})
