/**
 * Tests for packages/server/src/parser/parse-output.ts
 *
 * These tests cover:
 * - validateOutputSchema: valid/invalid schemas
 * - parseStructuredOutput: extraction, confidence, retry, edge cases
 *   (all LLM calls are mocked via global fetch stub)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  validateOutputSchema,
  parseStructuredOutput,
  type OutputSchema,
} from '../parser/parse-output.js'

// ─── validateOutputSchema ────────────────────────────────────────────────────

describe('validateOutputSchema', () => {
  it('returns null for a valid schema with required + optional fields', () => {
    const schema: OutputSchema = {
      fields: [
        { name: 'status', type: 'string', required: true },
        { name: 'count', type: 'number', required: false },
        { name: 'items', type: 'array' },
        { name: 'active', type: 'boolean', description: 'Whether it is active' },
      ],
    }
    expect(validateOutputSchema(schema)).toBeNull()
  })

  it('returns null for a schema with a single field', () => {
    expect(validateOutputSchema({ fields: [{ name: 'x', type: 'number' }] })).toBeNull()
  })

  it('returns null for an empty fields array', () => {
    expect(validateOutputSchema({ fields: [] })).toBeNull()
  })

  it('returns error when schema is null', () => {
    expect(validateOutputSchema(null)).not.toBeNull()
  })

  it('returns error when schema is not an object', () => {
    expect(validateOutputSchema('string')).not.toBeNull()
    expect(validateOutputSchema(42)).not.toBeNull()
    expect(validateOutputSchema([])).not.toBeNull()
  })

  it('returns error when fields is missing', () => {
    expect(validateOutputSchema({})).not.toBeNull()
  })

  it('returns error when fields is not an array', () => {
    expect(validateOutputSchema({ fields: 'not-array' })).not.toBeNull()
  })

  it('returns error when a field has no name', () => {
    const result = validateOutputSchema({ fields: [{ type: 'string' }] })
    expect(result).not.toBeNull()
    expect(result).toContain('name')
  })

  it('returns error when a field name is empty string', () => {
    const result = validateOutputSchema({ fields: [{ name: '  ', type: 'string' }] })
    expect(result).not.toBeNull()
  })

  it('returns error when a field type is invalid', () => {
    const result = validateOutputSchema({ fields: [{ name: 'x', type: 'object' }] })
    expect(result).not.toBeNull()
    expect(result).toContain('type')
  })

  it('returns error when required is not a boolean', () => {
    const result = validateOutputSchema({ fields: [{ name: 'x', type: 'string', required: 'yes' }] })
    expect(result).not.toBeNull()
    expect(result).toContain('required')
  })

  it('returns error when description is not a string', () => {
    const result = validateOutputSchema({ fields: [{ name: 'x', type: 'string', description: 42 }] })
    expect(result).not.toBeNull()
    expect(result).toContain('description')
  })

  it('returns error when a field entry is not an object', () => {
    const result = validateOutputSchema({ fields: ['not-object'] })
    expect(result).not.toBeNull()
  })

  it('accepts all four valid field types', () => {
    for (const type of ['string', 'number', 'boolean', 'array'] as const) {
      expect(validateOutputSchema({ fields: [{ name: 'f', type }] })).toBeNull()
    }
  })
})

// ─── parseStructuredOutput (mocked fetch) ────────────────────────────────────

/**
 * Helper: build a minimal Anthropic-style fetch response.
 */
function makeAnthropicResponse(text: string, inputTokens = 10, outputTokens = 20) {
  return {
    ok: true,
    status: 200,
    text: async () => text,
    json: async () => ({
      content: [{ type: 'text', text }],
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    }),
  }
}

describe('parseStructuredOutput', () => {
  const originalEnv = process.env.ANTHROPIC_API_KEY

  beforeEach(() => {
    // Set a dummy API key so the parser attempts LLM calls
    process.env.ANTHROPIC_API_KEY = 'test-key'
    vi.resetAllMocks()
  })

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalEnv
    vi.restoreAllMocks()
  })

  // ── Basic extraction ────────────────────────────────────────────────────────

  it('extracts required string field with confidence 1.0', async () => {
    const schema: OutputSchema = {
      fields: [{ name: 'status', type: 'string', required: true }],
    }

    const extractJson = JSON.stringify({ status: 'ok' })
    const summaryText = 'Status is ok.'

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(makeAnthropicResponse(extractJson))
        .mockResolvedValueOnce(makeAnthropicResponse(summaryText))
    )

    const result = await parseStructuredOutput('The run completed with status ok.', schema)

    expect(result.structured).toEqual({ status: 'ok' })
    expect(result.confidence).toBe(1.0)
    expect(result.summary).toBe('Status is ok.')
    expect(result.retries).toBe(0)
    expect(result.costCents).toBeGreaterThanOrEqual(0)
  })

  it('extracts multiple field types correctly', async () => {
    const schema: OutputSchema = {
      fields: [
        { name: 'title', type: 'string', required: true },
        { name: 'count', type: 'number', required: true },
        { name: 'active', type: 'boolean', required: true },
        { name: 'tags', type: 'array', required: true },
      ],
    }

    const extracted = JSON.stringify({ title: 'Test', count: 42, active: true, tags: ['a', 'b'] })
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(makeAnthropicResponse(extracted))
        .mockResolvedValueOnce(makeAnthropicResponse('Title is Test with 42 items.'))
    )

    const result = await parseStructuredOutput('output text', schema)

    expect(result.structured.title).toBe('Test')
    expect(result.structured.count).toBe(42)
    expect(result.structured.active).toBe(true)
    expect(result.structured.tags).toEqual(['a', 'b'])
    expect(result.confidence).toBe(1.0)
  })

  // ── Confidence computation ──────────────────────────────────────────────────

  it('computes partial confidence when only some required fields are present', async () => {
    const schema: OutputSchema = {
      fields: [
        { name: 'status', type: 'string', required: true },
        { name: 'count', type: 'number', required: true },
      ],
    }

    // First attempt: only status, missing count → confidence = 0.5 → retry
    const partial = JSON.stringify({ status: 'ok' })
    // Second attempt (retry): both fields present → confidence = 1.0
    const full = JSON.stringify({ status: 'ok', count: 5 })
    const summary = 'Status ok, count 5.'

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(makeAnthropicResponse(partial))
        .mockResolvedValueOnce(makeAnthropicResponse(full))
        .mockResolvedValueOnce(makeAnthropicResponse(summary))
    )

    const result = await parseStructuredOutput('The status is ok and count is 5.', schema)

    expect(result.structured.status).toBe('ok')
    expect(result.structured.count).toBe(5)
    expect(result.confidence).toBe(1.0)
    expect(result.retries).toBeGreaterThanOrEqual(1)
  })

  it('returns confidence 1.0 when schema has no required fields', async () => {
    const schema: OutputSchema = {
      fields: [{ name: 'note', type: 'string', required: false }],
    }

    const extracted = JSON.stringify({ note: 'hello' })
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(makeAnthropicResponse(extracted))
        .mockResolvedValueOnce(makeAnthropicResponse('Note is hello.'))
    )

    const result = await parseStructuredOutput('output', schema)
    expect(result.confidence).toBe(1.0)
  })

  // ── Retry mechanism ─────────────────────────────────────────────────────────

  it('retries up to MAX_RETRIES (2) times on low-confidence extraction', async () => {
    const schema: OutputSchema = {
      fields: [
        { name: 'a', type: 'string', required: true },
        { name: 'b', type: 'number', required: true },
        { name: 'c', type: 'boolean', required: true },
      ],
    }

    // All attempts return empty → confidence 0.0 → exhaust retries
    const empty = JSON.stringify({})

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeAnthropicResponse(empty))   // attempt 0
      .mockResolvedValueOnce(makeAnthropicResponse(empty))   // attempt 1 (retry 1)
      .mockResolvedValueOnce(makeAnthropicResponse(empty))   // attempt 2 (retry 2)
      .mockResolvedValueOnce(makeAnthropicResponse('No data extracted.'))  // summary

    vi.stubGlobal('fetch', fetchMock)

    const result = await parseStructuredOutput('no relevant content here', schema)

    // Should have called extract 3 times (attempt 0, 1, 2).
    // Summary call does NOT happen when structured is empty (early return).
    expect(fetchMock).toHaveBeenCalledTimes(3)
    // retries is incremented on each sub-threshold attempt AFTER the check
    // attempt 0: confidence=0 → retries++ (1) → attempt 1: confidence=0 → retries++ (2) → attempt 2: confidence=0 → retries++ (3) → break
    expect(result.retries).toBe(3)
    expect(result.confidence).toBe(0.0)
  })

  it('stops retrying as soon as confidence meets threshold', async () => {
    const schema: OutputSchema = {
      fields: [{ name: 'status', type: 'string', required: true }],
    }

    const extracted = JSON.stringify({ status: 'done' })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeAnthropicResponse(extracted))   // attempt 0 succeeds
      .mockResolvedValueOnce(makeAnthropicResponse('Status is done.'))  // summary

    vi.stubGlobal('fetch', fetchMock)

    const result = await parseStructuredOutput('done', schema)

    // Exactly 2 calls: extract + summary (no retry needed)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.retries).toBe(0)
  })

  // ── Missing API key ─────────────────────────────────────────────────────────

  it('returns empty structured data with fallback summary when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY

    const schema: OutputSchema = {
      fields: [{ name: 'status', type: 'string', required: true }],
    }

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await parseStructuredOutput('The status is ok.', schema)

    // fetch should never be called without API key
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.structured).toEqual({})
    expect(result.costCents).toBe(0)
    expect(typeof result.summary).toBe('string')
    expect(result.summary.length).toBeGreaterThan(0)
  })

  // ── Edge cases ───────────────────────────────────────────────────────────────

  it('handles empty rawOutput gracefully', async () => {
    const schema: OutputSchema = {
      fields: [{ name: 'status', type: 'string', required: true }],
    }

    const empty = JSON.stringify({})
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(makeAnthropicResponse(empty))
    )

    const result = await parseStructuredOutput('', schema)
    expect(result).toBeDefined()
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })

  it('handles LLM returning non-JSON text gracefully', async () => {
    const schema: OutputSchema = {
      fields: [{ name: 'status', type: 'string', required: true }],
    }

    const notJson = 'I cannot extract that information.'
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(makeAnthropicResponse(notJson))
    )

    const result = await parseStructuredOutput('some text', schema)
    // Should not throw; structured is whatever was best extracted
    expect(result).toBeDefined()
    expect(typeof result.confidence).toBe('number')
  })

  it('extracts JSON wrapped in markdown fences', async () => {
    const schema: OutputSchema = {
      fields: [{ name: 'score', type: 'number', required: true }],
    }

    const markdown = '```json\n{"score": 95}\n```'
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(makeAnthropicResponse(markdown))
        .mockResolvedValueOnce(makeAnthropicResponse('Score is 95.'))
    )

    const result = await parseStructuredOutput('The test scored 95.', schema)
    expect(result.structured.score).toBe(95)
    expect(result.confidence).toBe(1.0)
  })

  it('handles network error from fetch gracefully', async () => {
    const schema: OutputSchema = {
      fields: [{ name: 'status', type: 'string', required: true }],
    }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network failure'))
    )

    // Should not throw
    const result = await parseStructuredOutput('some output', schema)
    expect(result).toBeDefined()
    expect(result.costCents).toBeGreaterThanOrEqual(0)
  })

  it('handles API error response (non-2xx) gracefully', async () => {
    const schema: OutputSchema = {
      fields: [{ name: 'status', type: 'string', required: true }],
    }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'rate limited',
        json: async () => ({}),
      })
    )

    const result = await parseStructuredOutput('some output', schema)
    expect(result).toBeDefined()
    expect(result.confidence).toBeGreaterThanOrEqual(0)
  })

  it('accumulates cost across retries', async () => {
    const schema: OutputSchema = {
      fields: [
        { name: 'x', type: 'string', required: true },
        { name: 'y', type: 'number', required: true },
      ],
    }

    // Use a very high token count so cost rounds to non-zero (> 0.5 cents)
    // At haiku rates (80/400 per 1M): 10M input + 5M output = 800 + 2000 = 2800 cents
    const empty = JSON.stringify({})
    const full = JSON.stringify({ x: 'hi', y: 3 })

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(makeAnthropicResponse(empty, 10_000_000, 5_000_000))   // attempt 0 fails
        .mockResolvedValueOnce(makeAnthropicResponse(full, 10_000_000, 5_000_000))    // retry succeeds
        .mockResolvedValueOnce(makeAnthropicResponse('x is hi.', 1_000_000, 500_000)) // summary
    )

    const result = await parseStructuredOutput('x is hi and y is 3', schema)
    // Total cost should be sum of all 3 calls (> 0)
    expect(result.costCents).toBeGreaterThan(0)
    expect(result.confidence).toBe(1.0)
  })

  it('includes context in extraction prompt (checked via fetch body)', async () => {
    const schema: OutputSchema = {
      fields: [{ name: 'status', type: 'string', required: true }],
    }

    const extracted = JSON.stringify({ status: 'running' })
    const capturedBodies: string[] = []

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.body) capturedBodies.push(init.body as string)
        return makeAnthropicResponse(extracted)
      })
    )

    await parseStructuredOutput('status is running', schema, 'MyAgent (runId: abc)')

    expect(capturedBodies.length).toBeGreaterThan(0)
    expect(capturedBodies[0]).toContain('MyAgent')
  })
})
