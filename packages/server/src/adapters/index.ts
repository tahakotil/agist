import type { RunAdapter } from './types.js'
import { claudeCliAdapter } from './claude-cli.js'
import { anthropicApiAdapter } from './anthropic-api.js'
import { openaiAdapter } from './openai.js'
import { mockAdapter } from './mock.js'

export type { RunAdapter, AdapterRunOptions, AdapterResult } from './types.js'

const adapters: Record<string, RunAdapter> = {
  'claude-cli': claudeCliAdapter,
  // Legacy alias used in existing DB rows
  'claude_local': claudeCliAdapter,
  'anthropic-api': anthropicApiAdapter,
  'openai': openaiAdapter,
  'mock': mockAdapter,
}

export function getAdapter(name: string): RunAdapter | undefined {
  return adapters[name]
}

export function getDefaultAdapter(model: string): RunAdapter {
  if (model.startsWith('gpt-')) return openaiAdapter
  if (model.startsWith('claude-')) return claudeCliAdapter
  return claudeCliAdapter
}

export function listAdapters(): string[] {
  // Return de-duped public-facing names (exclude legacy alias)
  return ['claude-cli', 'anthropic-api', 'openai', 'mock']
}

export { claudeCliAdapter, anthropicApiAdapter, openaiAdapter, mockAdapter }
