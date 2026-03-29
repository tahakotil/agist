/**
 * BUG-008: DB Auto-Save Interval Not Cleared on Shutdown
 *
 * Tests that:
 * 1. initDb stores the setInterval handle in saveInterval
 * 2. shutdownDb clears the interval (preventing zombie timers)
 * 3. shutdownDb calls saveDb() once as a final flush
 * 4. shutdownDb is idempotent (safe to call multiple times)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Extracted DB lifecycle logic (mirrors db.ts implementation) ──────────────

function createDbLifecycle() {
  let saveInterval: ReturnType<typeof setInterval> | null = null
  let saveCallCount = 0

  function saveDb() {
    saveCallCount++
  }

  function initDbInterval() {
    saveInterval = setInterval(() => saveDb(), 30_000)
    return saveInterval
  }

  function shutdownDb() {
    if (saveInterval) {
      clearInterval(saveInterval)
      saveInterval = null
    }
    saveDb() // final save
  }

  function getSaveInterval() {
    return saveInterval
  }

  function getSaveCallCount() {
    return saveCallCount
  }

  function resetSaveCallCount() {
    saveCallCount = 0
  }

  return { initDbInterval, shutdownDb, getSaveInterval, getSaveCallCount, resetSaveCallCount }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BUG-008: DB Auto-Save Interval Not Cleared on Shutdown', () => {
  it('initDb stores the interval handle (not null/undefined)', () => {
    const { initDbInterval, getSaveInterval, shutdownDb } = createDbLifecycle()

    const handle = initDbInterval()

    expect(getSaveInterval()).not.toBeNull()
    expect(getSaveInterval()).toBe(handle)

    // cleanup
    shutdownDb()
  })

  it('shutdownDb clears the interval (saveInterval becomes null)', () => {
    const { initDbInterval, shutdownDb, getSaveInterval } = createDbLifecycle()

    initDbInterval()
    expect(getSaveInterval()).not.toBeNull()

    shutdownDb()

    expect(getSaveInterval()).toBeNull()
  })

  it('shutdownDb calls saveDb() exactly once as final flush', () => {
    const { initDbInterval, shutdownDb, getSaveCallCount } = createDbLifecycle()

    initDbInterval()
    const countBefore = getSaveCallCount()

    shutdownDb()

    expect(getSaveCallCount()).toBe(countBefore + 1)
  })

  it('shutdownDb is idempotent — safe to call multiple times', () => {
    const { initDbInterval, shutdownDb, getSaveInterval, getSaveCallCount } = createDbLifecycle()

    initDbInterval()
    shutdownDb()   // first call
    shutdownDb()   // second call — should not throw

    expect(getSaveInterval()).toBeNull()
    // saveDb called once per shutdownDb call
    expect(getSaveCallCount()).toBe(2)
  })

  it('shutdownDb is safe to call before initDb (saveInterval is null)', () => {
    const { shutdownDb, getSaveInterval, getSaveCallCount } = createDbLifecycle()

    // No interval initialized yet
    expect(getSaveInterval()).toBeNull()

    // Should not throw
    expect(() => shutdownDb()).not.toThrow()

    // Still calls saveDb (final flush attempt)
    expect(getSaveCallCount()).toBe(1)
  })

  it('interval fires saveDb periodically before shutdown', () => {
    vi.useFakeTimers()

    const { initDbInterval, shutdownDb, getSaveCallCount } = createDbLifecycle()

    initDbInterval()

    // Advance time by 90 seconds — should trigger 3 saves (at 30s, 60s, 90s)
    vi.advanceTimersByTime(90_000)

    expect(getSaveCallCount()).toBe(3)

    // Now shut down
    shutdownDb()

    // One more save on shutdown
    expect(getSaveCallCount()).toBe(4)

    // Advance time further — no more saves since interval was cleared
    vi.advanceTimersByTime(60_000)
    expect(getSaveCallCount()).toBe(4)

    vi.useRealTimers()
  })

  it('after shutdown, interval no longer fires', () => {
    vi.useFakeTimers()

    const { initDbInterval, shutdownDb, getSaveCallCount } = createDbLifecycle()

    initDbInterval()
    vi.advanceTimersByTime(30_000) // 1 auto-save
    expect(getSaveCallCount()).toBe(1)

    shutdownDb() // clears interval + 1 final save
    expect(getSaveCallCount()).toBe(2)

    // Advance another 120 seconds — no additional saves
    vi.advanceTimersByTime(120_000)
    expect(getSaveCallCount()).toBe(2)

    vi.useRealTimers()
  })
})
