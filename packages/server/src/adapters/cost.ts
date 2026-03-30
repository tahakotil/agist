/**
 * Estimate cost in cents for a given model + token counts.
 * Rates are per 1M tokens in cents.
 */
const PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic Claude models
  'claude-opus-4-5': { input: 1500, output: 7500 },
  'claude-sonnet-4-5': { input: 300, output: 1500 },
  'claude-haiku-4-5': { input: 80, output: 400 },
  'claude-opus-4': { input: 1500, output: 7500 },
  'claude-sonnet-4': { input: 300, output: 1500 },
  'claude-haiku-4': { input: 80, output: 400 },
  'haiku': { input: 80, output: 400 },
  'sonnet': { input: 300, output: 1500 },
  'opus': { input: 1500, output: 7500 },
  // OpenAI models (in cents per 1M tokens)
  'gpt-4o': { input: 250, output: 1000 },       // $2.50 / $10.00 per 1M
  'gpt-4o-mini': { input: 15, output: 60 },      // $0.15 / $0.60 per 1M
  'gpt-4-turbo': { input: 1000, output: 3000 },  // $10 / $30 per 1M
  'gpt-4': { input: 3000, output: 6000 },        // $30 / $60 per 1M
  'gpt-3.5-turbo': { input: 50, output: 150 },   // $0.50 / $1.50 per 1M
}

export function estimateCostCents(model: string, inputTokens: number, outputTokens: number): number {
  // Sort keys by length descending so more specific keys (e.g. 'gpt-4o-mini') match before
  // shorter ones (e.g. 'gpt-4o') when the model string includes both as substrings.
  const sortedKeys = Object.keys(PRICING).sort((a, b) => b.length - a.length)
  const modelKey = sortedKeys.find((k) => model.includes(k)) ?? ''
  const rates = PRICING[modelKey] ?? { input: 300, output: 1500 }

  return Math.round(
    (inputTokens / 1_000_000) * rates.input +
      (outputTokens / 1_000_000) * rates.output
  )
}
