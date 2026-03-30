import type { RunAdapter, AdapterRunOptions, AdapterResult } from './types.js'
import { estimateCostCents } from './cost.js'

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface OpenAIResponse {
  id: string
  object: string
  choices: Array<{
    index: number
    message: { role: string; content: string }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export const openaiAdapter: RunAdapter = {
  name: 'openai',

  async spawn(options: AdapterRunOptions): Promise<AdapterResult> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      const err = 'OPENAI_API_KEY not set'
      options.onLog(`[error] ${err}`)
      return { exitCode: 1, tokenInput: 0, tokenOutput: 0, costCents: 0, logExcerpt: err, error: err }
    }

    const messages: OpenAIMessage[] = []
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt })
    }
    messages.push({ role: 'user', content: options.prompt })

    const body = {
      model: options.model,
      max_tokens: 4096,
      messages,
    }

    let response: Response
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
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

    const data = await response.json() as OpenAIResponse
    const text = data.choices?.[0]?.message?.content ?? ''
    const tokenInput = data.usage?.prompt_tokens ?? 0
    const tokenOutput = data.usage?.completion_tokens ?? 0

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
