import { describe, it, expect } from 'vitest'

// ─── estimateCostCents (extracted from adapter.ts) ────────────────────────────

// Cost rates per 1M tokens in cents
const pricing: Record<string, { input: number; output: number }> = {
  'claude-opus-4-5': { input: 1500, output: 7500 },
  'claude-sonnet-4-5': { input: 300, output: 1500 },
  'claude-haiku-4-5': { input: 80, output: 400 },
  'claude-opus-4': { input: 1500, output: 7500 },
  'claude-sonnet-4': { input: 300, output: 1500 },
  'claude-haiku-4': { input: 80, output: 400 },
  'haiku': { input: 80, output: 400 },
  'sonnet': { input: 300, output: 1500 },
  'opus': { input: 1500, output: 7500 },
}

function estimateCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const modelKey = Object.keys(pricing).find((k) => model.includes(k)) ?? ''
  const rates = pricing[modelKey] ?? { input: 300, output: 1500 }
  return Math.round(
    (inputTokens / 1_000_000) * rates.input +
      (outputTokens / 1_000_000) * rates.output
  )
}

// ─── Haiku pricing ────────────────────────────────────────────────────────────

describe('estimateCostCents - Haiku', () => {
  it('calculates cost for claude-haiku-4-5 model', () => {
    // 1M input tokens at 80 cents = 80, 1M output at 400 cents = 400
    const cost = estimateCostCents('claude-haiku-4-5-20251001', 1_000_000, 1_000_000)
    expect(cost).toBe(480) // 80 + 400
  })

  it('calculates haiku input-only cost', () => {
    const cost = estimateCostCents('claude-haiku-4-5', 1_000_000, 0)
    expect(cost).toBe(80)
  })

  it('calculates haiku output-only cost', () => {
    const cost = estimateCostCents('claude-haiku-4-5', 0, 1_000_000)
    expect(cost).toBe(400)
  })

  it('calculates haiku partial tokens', () => {
    // 100k input tokens = 8 cents, 50k output = 20 cents → 28 cents
    const cost = estimateCostCents('claude-haiku-4-5', 100_000, 50_000)
    expect(cost).toBe(28)
  })

  it('matches haiku via short name', () => {
    const cost1 = estimateCostCents('haiku', 1_000_000, 0)
    const cost2 = estimateCostCents('claude-haiku-4-5', 1_000_000, 0)
    expect(cost1).toBe(cost2)
  })
})

// ─── Sonnet pricing ───────────────────────────────────────────────────────────

describe('estimateCostCents - Sonnet', () => {
  it('calculates cost for claude-sonnet-4-5 model', () => {
    // 1M input at 300 cents + 1M output at 1500 cents = 1800 cents
    const cost = estimateCostCents('claude-sonnet-4-5', 1_000_000, 1_000_000)
    expect(cost).toBe(1800)
  })

  it('calculates sonnet input-only cost', () => {
    const cost = estimateCostCents('claude-sonnet-4-5', 1_000_000, 0)
    expect(cost).toBe(300)
  })

  it('calculates sonnet output-only cost', () => {
    const cost = estimateCostCents('claude-sonnet-4-5', 0, 1_000_000)
    expect(cost).toBe(1500)
  })

  it('calculates sonnet-4-6 correctly (matches sonnet rates)', () => {
    const cost = estimateCostCents('claude-sonnet-4-6', 1_000_000, 0)
    expect(cost).toBe(300) // Falls back to sonnet key match
  })

  it('matches sonnet via short name', () => {
    const cost1 = estimateCostCents('sonnet', 1_000_000, 0)
    const cost2 = estimateCostCents('claude-sonnet-4-5', 1_000_000, 0)
    expect(cost1).toBe(cost2)
  })
})

// ─── Opus pricing ─────────────────────────────────────────────────────────────

describe('estimateCostCents - Opus', () => {
  it('calculates cost for claude-opus-4-5 model', () => {
    // 1M input at 1500 + 1M output at 7500 = 9000 cents
    const cost = estimateCostCents('claude-opus-4-5', 1_000_000, 1_000_000)
    expect(cost).toBe(9000)
  })

  it('calculates opus input-only cost', () => {
    const cost = estimateCostCents('claude-opus-4-5', 1_000_000, 0)
    expect(cost).toBe(1500)
  })

  it('calculates opus output-only cost', () => {
    const cost = estimateCostCents('claude-opus-4-5', 0, 1_000_000)
    expect(cost).toBe(7500)
  })

  it('matches opus via short name', () => {
    const cost1 = estimateCostCents('opus', 1_000_000, 0)
    const cost2 = estimateCostCents('claude-opus-4-5', 1_000_000, 0)
    expect(cost1).toBe(cost2)
  })
})

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('estimateCostCents - edge cases', () => {
  it('returns 0 for zero tokens', () => {
    expect(estimateCostCents('claude-sonnet-4-5', 0, 0)).toBe(0)
    expect(estimateCostCents('claude-haiku-4-5', 0, 0)).toBe(0)
    expect(estimateCostCents('claude-opus-4-5', 0, 0)).toBe(0)
  })

  it('returns integer (Math.round) for fractional tokens', () => {
    // 1 token = tiny fraction
    const cost = estimateCostCents('claude-sonnet-4-5', 1, 1)
    expect(Number.isInteger(cost)).toBe(true)
    expect(cost).toBe(0) // rounds to 0 for such small counts
  })

  it('falls back to sonnet rates for unknown model', () => {
    const unknownCost = estimateCostCents('unknown-model-xyz', 1_000_000, 0)
    const sonnetCost = estimateCostCents('claude-sonnet-4-5', 1_000_000, 0)
    expect(unknownCost).toBe(sonnetCost)
  })

  it('falls back for empty model string', () => {
    const cost = estimateCostCents('', 1_000_000, 0)
    // Should use default sonnet rates
    expect(cost).toBe(300)
  })

  it('handles large token counts correctly', () => {
    // 100M tokens at sonnet rates: 100 * 300 = 30000 input + 100 * 1500 = 150000 output
    const cost = estimateCostCents('claude-sonnet-4-5', 100_000_000, 100_000_000)
    expect(cost).toBe(180_000)
  })

  it('haiku is cheaper than sonnet for same tokens', () => {
    const haikuCost = estimateCostCents('claude-haiku-4-5', 1_000_000, 1_000_000)
    const sonnetCost = estimateCostCents('claude-sonnet-4-5', 1_000_000, 1_000_000)
    expect(haikuCost).toBeLessThan(sonnetCost)
  })

  it('sonnet is cheaper than opus for same tokens', () => {
    const sonnetCost = estimateCostCents('claude-sonnet-4-5', 1_000_000, 1_000_000)
    const opusCost = estimateCostCents('claude-opus-4-5', 1_000_000, 1_000_000)
    expect(sonnetCost).toBeLessThan(opusCost)
  })
})
