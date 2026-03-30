import type { RunAdapter, AdapterRunOptions, AdapterResult } from './types.js'

export const mockAdapter: RunAdapter = {
  name: 'mock',

  async spawn(options: AdapterRunOptions): Promise<AdapterResult> {
    const lines = [
      'Starting mock run...',
      `Processing prompt: "${options.prompt.slice(0, 50)}..."`,
      'Generating response...',
      'Mock response: This is a simulated agent response.',
      'Run completed successfully.',
    ]

    for (const line of lines) {
      options.onLog(line)
      await new Promise<void>((r) => setTimeout(r, 400))
    }

    const tokenInput = Math.floor(Math.random() * 1000) + 100
    const tokenOutput = Math.floor(Math.random() * 500) + 50
    options.onTokens(tokenInput, tokenOutput)

    return {
      exitCode: 0,
      tokenInput,
      tokenOutput,
      costCents: 0,
      logExcerpt: lines.join('\n'),
    }
  },
}
