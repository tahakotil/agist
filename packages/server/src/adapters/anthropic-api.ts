import type { RunAdapter, AdapterRunOptions, AdapterResult } from './types.js'
import { estimateCostCents } from './cost.js'

interface AnthropicMessage {
  id: string
  type: string
  role: string
  content: Array<{ type: string; text?: string }>
  usage: {
    input_tokens: number
    output_tokens: number
  }
}

export const anthropicApiAdapter: RunAdapter = {
  name: 'anthropic-api',

  async spawn(options: AdapterRunOptions): Promise<AdapterResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      const err = 'ANTHROPIC_API_KEY not set'
      options.onLog(`[error] ${err}`)
      return { exitCode: 1, tokenInput: 0, tokenOutput: 0, costCents: 0, logExcerpt: err, error: err }
    }

    const body = {
      model: options.model,
      max_tokens: 4096,
      ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
      messages: [{ role: 'user' as const, content: options.prompt }],
    }

    let response: Response
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      })
    } catch (fetchErr) {
      const errMsg = `Network error: ${(fetchErr as Error).message}`
      options.onLog(`[error] ${errMsg}`)
      return { exitCode: 1, tokenInput: 0, tokenOutput: 0, costCents: 0, logExcerpt: errMsg, error: errMsg }
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => `HTTP ${response.status}`)
      options.onLog(`[error] API Error ${response.status}: ${errText}`)
      return { exitCode: 1, tokenInput: 0, tokenOutput: 0, costCents: 0, logExcerpt: errText, error: errText }
    }

    const data = await response.json() as AnthropicMessage
    const text = data.content?.find((c) => c.type === 'text')?.text ?? ''
    const tokenInput = data.usage?.input_tokens ?? 0
    const tokenOutput = data.usage?.output_tokens ?? 0

    options.onLog(text)
    options.onTokens(tokenInput, tokenOutput)

    const costCents = estimateCostCents(options.model, tokenInput, tokenOutput)

    return {
      exitCode: 0,
      tokenInput,
      tokenOutput,
      costCents,
      logExcerpt: text,
    }
  },
}
