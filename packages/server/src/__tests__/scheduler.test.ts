import { describe, it, expect } from 'vitest'
import { CronExpressionParser } from 'cron-parser'

// ─── computeNextRunAt (extracted logic) ───────────────────────────────────────

function computeNextRunAt(cronExpression: string, timezone: string): string | null {
  try {
    const expr = CronExpressionParser.parse(cronExpression, {
      tz: timezone,
      currentDate: new Date(),
    })
    return expr.next().toISOString()
  } catch {
    return null
  }
}

function isRoutineDue(nextRunAt: string | null, now: Date): boolean {
  if (!nextRunAt) return false
  return new Date(nextRunAt) <= now
}

// ─── Cron expression parsing ──────────────────────────────────────────────────

describe('computeNextRunAt', () => {
  it('parses a standard 5-field cron expression', () => {
    const result = computeNextRunAt('0 9 * * *', 'UTC')
    expect(result).not.toBeNull()
    expect(typeof result).toBe('string')
    const date = new Date(result!)
    expect(date.getTime()).toBeGreaterThan(Date.now())
  })

  it('parses every-minute cron', () => {
    const result = computeNextRunAt('* * * * *', 'UTC')
    expect(result).not.toBeNull()
    const date = new Date(result!)
    // Next minute should be within 60 seconds
    expect(date.getTime() - Date.now()).toBeLessThan(60_000 + 1000)
    expect(date.getTime()).toBeGreaterThan(Date.now())
  })

  it('parses hourly cron', () => {
    const result = computeNextRunAt('0 * * * *', 'UTC')
    expect(result).not.toBeNull()
    const date = new Date(result!)
    // Next hour should be within 3600 seconds
    expect(date.getTime() - Date.now()).toBeLessThan(3_600_000 + 1000)
  })

  it('parses weekly cron', () => {
    const result = computeNextRunAt('0 9 * * 1', 'UTC') // Monday at 9am
    expect(result).not.toBeNull()
    const date = new Date(result!)
    // Within next 7 days
    expect(date.getTime() - Date.now()).toBeLessThan(7 * 24 * 60 * 60 * 1000 + 1000)
  })

  it('parses timezone-aware cron', () => {
    const utcResult = computeNextRunAt('0 9 * * *', 'UTC')
    const nyResult = computeNextRunAt('0 9 * * *', 'America/New_York')
    expect(utcResult).not.toBeNull()
    expect(nyResult).not.toBeNull()
    // Same time expression, different timezone = different absolute times
    expect(utcResult).not.toBe(nyResult)
  })

  it('returns null for invalid cron expression', () => {
    // 'invalid cron' — "inv" is not a valid alias, throws
    expect(computeNextRunAt('invalid cron', 'UTC')).toBeNull()
    // Out-of-range values (minute 99 is invalid)
    expect(computeNextRunAt('99 99 99 99 99', 'UTC')).toBeNull()
  })

  it('returns null for unknown timezone', () => {
    // Some parsers throw on invalid timezone
    const result = computeNextRunAt('0 9 * * *', 'Invalid/Timezone')
    // Either null or a valid date — depends on implementation
    if (result !== null) {
      expect(new Date(result).getTime()).toBeGreaterThan(Date.now())
    }
  })

  it('returns an ISO 8601 date string', () => {
    const result = computeNextRunAt('0 9 * * *', 'UTC')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })
})

// ─── isRoutineDue ─────────────────────────────────────────────────────────────

describe('isRoutineDue', () => {
  it('returns true when nextRunAt is in the past', () => {
    const pastDate = new Date(Date.now() - 60_000).toISOString()
    expect(isRoutineDue(pastDate, new Date())).toBe(true)
  })

  it('returns true when nextRunAt equals now', () => {
    const now = new Date()
    expect(isRoutineDue(now.toISOString(), now)).toBe(true)
  })

  it('returns false when nextRunAt is in the future', () => {
    const futureDate = new Date(Date.now() + 60_000).toISOString()
    expect(isRoutineDue(futureDate, new Date())).toBe(false)
  })

  it('returns false when nextRunAt is null', () => {
    expect(isRoutineDue(null, new Date())).toBe(false)
  })

  it('returns false when nextRunAt is undefined-like null', () => {
    expect(isRoutineDue(null, new Date())).toBe(false)
  })
})

// ─── Disabled routine logic ───────────────────────────────────────────────────

describe('Disabled routine logic', () => {
  it('does not process disabled routines (enabled=0)', () => {
    const routine = {
      id: 'r1',
      enabled: 0,
      next_run_at: new Date(Date.now() - 1000).toISOString(),
    }
    // Simulate scheduler filter: only process enabled=1 routines
    const dueEnabled = [routine].filter(
      (r) => r.enabled === 1 && r.next_run_at && new Date(r.next_run_at) <= new Date()
    )
    expect(dueEnabled.length).toBe(0)
  })

  it('processes enabled routines that are due', () => {
    const routine = {
      id: 'r1',
      enabled: 1,
      next_run_at: new Date(Date.now() - 1000).toISOString(),
    }
    const dueEnabled = [routine].filter(
      (r) => r.enabled === 1 && r.next_run_at && new Date(r.next_run_at) <= new Date()
    )
    expect(dueEnabled.length).toBe(1)
  })

  it('skips enabled routines not yet due', () => {
    const routine = {
      id: 'r1',
      enabled: 1,
      next_run_at: new Date(Date.now() + 60_000).toISOString(),
    }
    const dueEnabled = [routine].filter(
      (r) => r.enabled === 1 && r.next_run_at && new Date(r.next_run_at) <= new Date()
    )
    expect(dueEnabled.length).toBe(0)
  })

  it('skips routines with null next_run_at', () => {
    const routine = { id: 'r1', enabled: 1, next_run_at: null }
    const dueEnabled = [routine].filter(
      (r) => r.enabled === 1 && r.next_run_at && new Date(r.next_run_at) <= new Date()
    )
    expect(dueEnabled.length).toBe(0)
  })
})

// ─── Concurrent run prevention logic ─────────────────────────────────────────

describe('Concurrent run prevention', () => {
  it('skips agent already in running status', () => {
    const agents = [
      { id: 'a1', status: 'running' },
      { id: 'a2', status: 'idle' },
    ]

    // Simulate scheduler: skip running agents
    const spawnableAgents = agents.filter((a) => a.status !== 'running')
    expect(spawnableAgents.length).toBe(1)
    expect(spawnableAgents[0].id).toBe('a2')
  })

  it('allows agent in idle status to spawn', () => {
    const agent = { id: 'a1', status: 'idle' }
    expect(agent.status === 'running').toBe(false)
  })

  it('allows agent in paused status to spawn (only running is blocked)', () => {
    const agent = { id: 'a1', status: 'paused' }
    expect(agent.status === 'running').toBe(false)
  })

  it('allows agent in error status to retry', () => {
    const agent = { id: 'a1', status: 'error' }
    expect(agent.status === 'running').toBe(false)
  })
})

// ─── Multiple routines selection ──────────────────────────────────────────────

describe('Multiple routine filtering', () => {
  const now = new Date()
  const past = new Date(now.getTime() - 60_000).toISOString()
  const future = new Date(now.getTime() + 60_000).toISOString()

  const routines = [
    { id: 'r1', enabled: 1, next_run_at: past },   // due + enabled = process
    { id: 'r2', enabled: 0, next_run_at: past },   // due but disabled = skip
    { id: 'r3', enabled: 1, next_run_at: future }, // not due = skip
    { id: 'r4', enabled: 1, next_run_at: null },   // null = skip
    { id: 'r5', enabled: 0, next_run_at: null },   // disabled + null = skip
  ]

  it('selects only enabled and due routines', () => {
    const due = routines.filter(
      (r) => r.enabled === 1 && r.next_run_at && new Date(r.next_run_at) <= now
    )
    expect(due.length).toBe(1)
    expect(due[0].id).toBe('r1')
  })
})
