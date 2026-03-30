import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockAdapter } from '../adapters/mock.js'
import { getAdapter, getDefaultAdapter, listAdapters } from '../adapters/index.js'
import { estimateCostCents } from '../adapters/cost.js'

// ─── Mock adapter ─────────────────────────────────────────────────────────────

describe('mockAdapter', () => {
  it('has name "mock"', () => {
    expect(mockAdapter.name).toBe('mock')
  })

  it('returns exitCode 0 on success', async () => {
    const logs: string[] = []
    let tokensCalled = false

    const result = await mockAdapter.spawn({
      runId: 'run-1',
      agentId: 'agent-1',
      companyId: 'company-1',
      prompt: 'Hello world',
      model: 'claude-haiku-4-5',
      onLog: (line) => logs.push(line),
      onTokens: (i, o) => {
        tokensCalled = true
        expect(i).toBeGreaterThan(0)
        expect(o).toBeGreaterThan(0)
      },
    })

    expect(result.exitCode).toBe(0)
    expect(result.costCents).toBe(0)
    expect(result.tokenInput).toBeGreaterThan(0)
    expect(result.tokenOutput).toBeGreaterThan(0)
    expect(logs.length).toBeGreaterThan(0)
    expect(tokensCalled).toBe(true)
  }, 10_000)

  it('includes prompt in log output', async () => {
    const logs: string[] = []

    await mockAdapter.spawn({
      runId: 'run-2',
      agentId: 'agent-1',
      companyId: 'company-1',
      prompt: 'Test prompt for mock',
      model: 'mock',
      onLog: (line) => logs.push(line),
      onTokens: () => {},
    })

    const allLog = logs.join('\n')
    expect(allLog).toContain('Test prompt for mock')
  }, 10_000)

  it('returns logExcerpt with all lines', async () => {
    const result = await mockAdapter.spawn({
      runId: 'run-3',
      agentId: 'agent-1',
      companyId: 'company-1',
      prompt: 'check',
      model: 'mock',
      onLog: () => {},
      onTokens: () => {},
    })

    expect(result.logExcerpt).toContain('mock run')
    expect(result.logExcerpt).toContain('Run completed successfully.')
  }, 10_000)
})

// ─── Adapter registry ─────────────────────────────────────────────────────────

describe('getAdapter', () => {
  it('returns claude-cli adapter for "claude-cli"', () => {
    const adapter = getAdapter('claude-cli')
    expect(adapter).toBeDefined()
    expect(adapter?.name).toBe('claude-cli')
  })

  it('returns claude-cli for legacy "claude_local" alias', () => {
    const adapter = getAdapter('claude_local')
    expect(adapter).toBeDefined()
    expect(adapter?.name).toBe('claude-cli')
  })

  it('returns anthropic-api adapter', () => {
    const adapter = getAdapter('anthropic-api')
    expect(adapter).toBeDefined()
    expect(adapter?.name).toBe('anthropic-api')
  })

  it('returns openai adapter', () => {
    const adapter = getAdapter('openai')
    expect(adapter).toBeDefined()
    expect(adapter?.name).toBe('openai')
  })

  it('returns mock adapter', () => {
    const adapter = getAdapter('mock')
    expect(adapter).toBeDefined()
    expect(adapter?.name).toBe('mock')
  })

  it('returns undefined for unknown adapter', () => {
    expect(getAdapter('nonexistent')).toBeUndefined()
  })
})

describe('getDefaultAdapter', () => {
  it('returns openai for gpt- models', () => {
    expect(getDefaultAdapter('gpt-4o').name).toBe('openai')
    expect(getDefaultAdapter('gpt-4o-mini').name).toBe('openai')
    expect(getDefaultAdapter('gpt-4-turbo').name).toBe('openai')
  })

  it('returns claude-cli for claude- models', () => {
    expect(getDefaultAdapter('claude-sonnet-4-6').name).toBe('claude-cli')
    expect(getDefaultAdapter('claude-haiku-4-5').name).toBe('claude-cli')
    expect(getDefaultAdapter('claude-opus-4-5').name).toBe('claude-cli')
  })

  it('returns claude-cli as fallback for unknown models', () => {
    expect(getDefaultAdapter('llama-3').name).toBe('claude-cli')
    expect(getDefaultAdapter('unknown').name).toBe('claude-cli')
  })
})

describe('listAdapters', () => {
  it('returns all public adapter names', () => {
    const list = listAdapters()
    expect(list).toContain('claude-cli')
    expect(list).toContain('anthropic-api')
    expect(list).toContain('openai')
    expect(list).toContain('mock')
  })

  it('does not include legacy alias', () => {
    const list = listAdapters()
    expect(list).not.toContain('claude_local')
  })
})

// ─── Cost calculation ─────────────────────────────────────────────────────────

describe('estimateCostCents', () => {
  it('calculates cost for haiku model', () => {
    // 1M input tokens at 80 cents + 1M output at 400 cents = 480 cents
    const cost = estimateCostCents('claude-haiku-4-5', 1_000_000, 1_000_000)
    expect(cost).toBe(480)
  })

  it('calculates cost for sonnet model', () => {
    // 1M input at 300 + 1M output at 1500 = 1800
    const cost = estimateCostCents('claude-sonnet-4-5', 1_000_000, 1_000_000)
    expect(cost).toBe(1800)
  })

  it('calculates cost for opus model', () => {
    // 1M input at 1500 + 1M output at 7500 = 9000
    const cost = estimateCostCents('claude-opus-4-5', 1_000_000, 1_000_000)
    expect(cost).toBe(9000)
  })

  it('calculates cost for gpt-4o', () => {
    // 1M input at 250 + 1M output at 1000 = 1250
    const cost = estimateCostCents('gpt-4o', 1_000_000, 1_000_000)
    expect(cost).toBe(1250)
  })

  it('calculates cost for gpt-4o-mini', () => {
    // 1M input at 15 + 1M output at 60 = 75
    const cost = estimateCostCents('gpt-4o-mini', 1_000_000, 1_000_000)
    expect(cost).toBe(75)
  })

  it('returns 0 for 0 tokens', () => {
    expect(estimateCostCents('claude-sonnet-4-5', 0, 0)).toBe(0)
  })

  it('falls back to sonnet pricing for unknown models', () => {
    // Unknown model → { input: 300, output: 1500 }
    const cost = estimateCostCents('unknown-model', 1_000_000, 1_000_000)
    expect(cost).toBe(1800)
  })

  it('uses partial token amounts correctly', () => {
    // 100K input tokens + 50K output tokens for haiku
    // (100000 / 1000000) * 80 + (50000 / 1000000) * 400 = 8 + 20 = 28
    const cost = estimateCostCents('claude-haiku-4-5', 100_000, 50_000)
    expect(cost).toBe(28)
  })
})
