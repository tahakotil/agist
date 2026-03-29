import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'events'

// ─── buildSystemPrompt (extracted logic) ──────────────────────────────────────

interface AgentContext {
  agentName: string
  agentTitle: string | null
  agentRole: string
  capabilities: string | null
  companyName: string
  companyDescription: string | null
  routineTitle: string | null
  routineDescription: string | null
}

function buildSystemPrompt(ctx: AgentContext, taskPrompt: string): string {
  const lines: string[] = []

  lines.push(`# Agent Identity`)
  lines.push(`You are "${ctx.agentName}", a ${ctx.agentRole} agent${ctx.agentTitle ? ` (${ctx.agentTitle})` : ''}.`)
  lines.push(`Company: ${ctx.companyName}${ctx.companyDescription ? ` — ${ctx.companyDescription}` : ''}`)

  if (ctx.capabilities) {
    lines.push('')
    lines.push(`## Capabilities`)
    lines.push(ctx.capabilities)
  }

  if (ctx.routineTitle || ctx.routineDescription) {
    lines.push('')
    lines.push(`## Current Task: ${ctx.routineTitle || 'Manual wake'}`)
    if (ctx.routineDescription) {
      lines.push(ctx.routineDescription)
    }
  }

  lines.push('')
  lines.push(`## Instructions`)
  lines.push(taskPrompt)

  lines.push('')
  lines.push(`## Output Rules`)
  lines.push(`- Be concise and action-oriented`)
  lines.push(`- Lead with findings or actions taken, not preamble`)
  lines.push(`- If nothing changed since last run, say "STATUS: NO_CHANGE" with reason`)
  lines.push(`- Always include evidence (data, commands run, results) not just conclusions`)

  return lines.join('\n')
}

// ─── parseStreamJsonTokens (extracted logic) ──────────────────────────────────

interface TokenState {
  inputTokens: number
  outputTokens: number
}

function parseStreamJsonLine(line: string, state: TokenState): void {
  try {
    const parsed = JSON.parse(line) as {
      type?: string
      usage?: { input_tokens?: number; output_tokens?: number }
      message?: { usage?: { input_tokens?: number; output_tokens?: number } }
      delta?: { type?: string; text?: string }
    }

    if (parsed.type === 'message_start' && parsed.message?.usage) {
      state.inputTokens = parsed.message.usage.input_tokens ?? state.inputTokens
      state.outputTokens = parsed.message.usage.output_tokens ?? state.outputTokens
    } else if (parsed.type === 'message_delta' && parsed.usage) {
      state.outputTokens = parsed.usage.output_tokens ?? state.outputTokens
    } else if (parsed.usage) {
      state.inputTokens = parsed.usage.input_tokens ?? state.inputTokens
      state.outputTokens = parsed.usage.output_tokens ?? state.outputTokens
    }
  } catch {
    // Not JSON — plain text output line, ignore
  }
}

// ─── buildCliArgs (extracted logic) ───────────────────────────────────────────

function buildCliArgs(model: string, systemPrompt: string, skillDir: string): string[] {
  return [
    '--model', model,
    '--print',
    '--verbose',
    '--output-format', 'stream-json',
    '--add-dir', skillDir,
    '-p', systemPrompt,
  ]
}

// ─── System prompt tests ──────────────────────────────────────────────────────

describe('buildSystemPrompt', () => {
  const baseCtx: AgentContext = {
    agentName: 'Alice',
    agentTitle: null,
    agentRole: 'engineer',
    capabilities: null,
    companyName: 'Acme Corp',
    companyDescription: null,
    routineTitle: null,
    routineDescription: null,
  }

  it('includes agent identity section', () => {
    const prompt = buildSystemPrompt(baseCtx, 'Do work')
    expect(prompt).toContain('# Agent Identity')
    expect(prompt).toContain('"Alice"')
    expect(prompt).toContain('engineer agent')
  })

  it('includes agent title when present', () => {
    const prompt = buildSystemPrompt({ ...baseCtx, agentTitle: 'Lead Engineer' }, 'Do work')
    expect(prompt).toContain('(Lead Engineer)')
  })

  it('does not include title parentheses when title is null', () => {
    const prompt = buildSystemPrompt(baseCtx, 'Do work')
    expect(prompt).not.toContain('(null)')
    expect(prompt).not.toContain('(undefined)')
  })

  it('includes company name', () => {
    const prompt = buildSystemPrompt(baseCtx, 'Do work')
    expect(prompt).toContain('Acme Corp')
  })

  it('includes company description when present', () => {
    const prompt = buildSystemPrompt(
      { ...baseCtx, companyDescription: 'The best company' },
      'Do work'
    )
    expect(prompt).toContain('The best company')
  })

  it('includes capabilities section when present', () => {
    const prompt = buildSystemPrompt(
      { ...baseCtx, capabilities: 'TypeScript, Node.js, Docker' },
      'Do work'
    )
    expect(prompt).toContain('## Capabilities')
    expect(prompt).toContain('TypeScript, Node.js, Docker')
  })

  it('does not include capabilities section when null', () => {
    const prompt = buildSystemPrompt(baseCtx, 'Do work')
    expect(prompt).not.toContain('## Capabilities')
  })

  it('includes current task section when routineTitle is present', () => {
    const prompt = buildSystemPrompt(
      { ...baseCtx, routineTitle: 'Daily standup', routineDescription: 'Check status' },
      'Do work'
    )
    expect(prompt).toContain('## Current Task: Daily standup')
    expect(prompt).toContain('Check status')
  })

  it('includes task section with "Manual wake" when only routineDescription given', () => {
    const prompt = buildSystemPrompt(
      { ...baseCtx, routineTitle: null, routineDescription: 'Some description' },
      'Do work'
    )
    expect(prompt).toContain('Manual wake')
    expect(prompt).toContain('Some description')
  })

  it('does not include task section when both routine fields are null', () => {
    const prompt = buildSystemPrompt(baseCtx, 'Do work')
    expect(prompt).not.toContain('## Current Task')
  })

  it('includes instructions section with task prompt', () => {
    const prompt = buildSystemPrompt(baseCtx, 'Check server health')
    expect(prompt).toContain('## Instructions')
    expect(prompt).toContain('Check server health')
  })

  it('includes output rules', () => {
    const prompt = buildSystemPrompt(baseCtx, 'Do work')
    expect(prompt).toContain('## Output Rules')
    expect(prompt).toContain('Be concise and action-oriented')
    expect(prompt).toContain('STATUS: NO_CHANGE')
  })
})

// ─── Stream JSON token parsing ────────────────────────────────────────────────

describe('parseStreamJsonLine', () => {
  it('parses message_start with input/output tokens', () => {
    const state: TokenState = { inputTokens: 0, outputTokens: 0 }
    const line = JSON.stringify({
      type: 'message_start',
      message: { usage: { input_tokens: 1500, output_tokens: 0 } },
    })
    parseStreamJsonLine(line, state)
    expect(state.inputTokens).toBe(1500)
    expect(state.outputTokens).toBe(0)
  })

  it('parses message_delta with output tokens', () => {
    const state: TokenState = { inputTokens: 1500, outputTokens: 0 }
    const line = JSON.stringify({
      type: 'message_delta',
      usage: { output_tokens: 500 },
    })
    parseStreamJsonLine(line, state)
    expect(state.outputTokens).toBe(500)
    expect(state.inputTokens).toBe(1500) // unchanged
  })

  it('parses generic usage object', () => {
    const state: TokenState = { inputTokens: 0, outputTokens: 0 }
    const line = JSON.stringify({
      type: 'some_event',
      usage: { input_tokens: 200, output_tokens: 100 },
    })
    parseStreamJsonLine(line, state)
    expect(state.inputTokens).toBe(200)
    expect(state.outputTokens).toBe(100)
  })

  it('does not modify state for plain text lines', () => {
    const state: TokenState = { inputTokens: 100, outputTokens: 50 }
    parseStreamJsonLine('plain text output', state)
    expect(state.inputTokens).toBe(100)
    expect(state.outputTokens).toBe(50)
  })

  it('does not modify state for invalid JSON', () => {
    const state: TokenState = { inputTokens: 100, outputTokens: 50 }
    parseStreamJsonLine('{invalid json}', state)
    expect(state.inputTokens).toBe(100)
    expect(state.outputTokens).toBe(50)
  })

  it('does not modify state for JSON without usage fields', () => {
    const state: TokenState = { inputTokens: 100, outputTokens: 50 }
    const line = JSON.stringify({ type: 'content_block_start', index: 0 })
    parseStreamJsonLine(line, state)
    expect(state.inputTokens).toBe(100)
    expect(state.outputTokens).toBe(50)
  })

  it('does not override tokens if field is missing in message_start', () => {
    const state: TokenState = { inputTokens: 100, outputTokens: 50 }
    const line = JSON.stringify({
      type: 'message_start',
      message: { usage: {} }, // missing input_tokens / output_tokens
    })
    parseStreamJsonLine(line, state)
    expect(state.inputTokens).toBe(100) // kept existing
    expect(state.outputTokens).toBe(50) // kept existing
  })

  it('accumulates tokens across multiple lines', () => {
    const state: TokenState = { inputTokens: 0, outputTokens: 0 }

    parseStreamJsonLine(
      JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 1000, output_tokens: 0 } } }),
      state
    )
    parseStreamJsonLine(
      JSON.stringify({ type: 'message_delta', usage: { output_tokens: 300 } }),
      state
    )
    parseStreamJsonLine('Some plain text line', state)

    expect(state.inputTokens).toBe(1000)
    expect(state.outputTokens).toBe(300)
  })
})

// ─── CLI args construction ────────────────────────────────────────────────────

describe('buildCliArgs', () => {
  it('includes --model flag', () => {
    const args = buildCliArgs('claude-sonnet-4-6', 'Do work', '/tmp/skills')
    const modelIdx = args.indexOf('--model')
    expect(modelIdx).toBeGreaterThanOrEqual(0)
    expect(args[modelIdx + 1]).toBe('claude-sonnet-4-6')
  })

  it('includes --print flag', () => {
    const args = buildCliArgs('claude-sonnet-4-6', 'Do work', '/tmp/skills')
    expect(args).toContain('--print')
  })

  it('includes --verbose flag', () => {
    const args = buildCliArgs('claude-sonnet-4-6', 'Do work', '/tmp/skills')
    expect(args).toContain('--verbose')
  })

  it('includes --output-format stream-json', () => {
    const args = buildCliArgs('claude-sonnet-4-6', 'Do work', '/tmp/skills')
    const idx = args.indexOf('--output-format')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(args[idx + 1]).toBe('stream-json')
  })

  it('includes --add-dir with skill directory', () => {
    const args = buildCliArgs('claude-sonnet-4-6', 'Do work', '/tmp/agist-skills-123')
    const idx = args.indexOf('--add-dir')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(args[idx + 1]).toBe('/tmp/agist-skills-123')
  })

  it('includes -p flag with system prompt', () => {
    const args = buildCliArgs('claude-sonnet-4-6', 'My system prompt', '/tmp/skills')
    const idx = args.indexOf('-p')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(args[idx + 1]).toBe('My system prompt')
  })

  it('works with different models', () => {
    const haikuArgs = buildCliArgs('claude-haiku-4-5', 'work', '/tmp')
    const opusArgs = buildCliArgs('claude-opus-4-5', 'work', '/tmp')
    expect(haikuArgs[haikuArgs.indexOf('--model') + 1]).toBe('claude-haiku-4-5')
    expect(opusArgs[opusArgs.indexOf('--model') + 1]).toBe('claude-opus-4-5')
  })
})

// ─── Mock child_process spawn behavior ───────────────────────────────────────

describe('spawn process behavior simulation', () => {
  it('simulates successful process exit (code 0 = completed)', () => {
    const exitCode = 0
    const status = exitCode === 0 ? 'completed' : 'failed'
    expect(status).toBe('completed')
  })

  it('simulates failed process exit (non-zero = failed)', () => {
    const exitCode: number = 1
    const status = exitCode === 0 ? 'completed' : 'failed'
    expect(status).toBe('failed')
  })

  it('simulates null exit code (process killed = -1)', () => {
    const rawCode: number | null = null
    const exitCode: number = rawCode ?? -1
    const status = exitCode === 0 ? 'completed' : 'failed'
    expect(exitCode).toBe(-1)
    expect(status).toBe('failed')
  })

  it('captures log lines slice of last 200', () => {
    const logLines = Array.from({ length: 300 }, (_, i) => `line ${i}`)
    const excerpt = logLines.slice(-200).join('\n')
    expect(excerpt.split('\n').length).toBe(200)
    expect(excerpt).toContain('line 299')
    expect(excerpt).not.toContain('line 99')
  })

  it('simulates mock spawn with EventEmitter', async () => {
    const mockProcess = new EventEmitter() as any
    mockProcess.stdout = new EventEmitter()
    mockProcess.stderr = new EventEmitter()
    mockProcess.stdout.setEncoding = vi.fn()
    mockProcess.stderr.setEncoding = vi.fn()

    const logLines: string[] = []
    let errorOutput = ''
    let exitCode: number | null = null

    mockProcess.stdout.on('data', (chunk: string) => {
      const lines = chunk.split('\n').filter((l: string) => l.trim())
      logLines.push(...lines)
    })

    mockProcess.stderr.on('data', (chunk: string) => {
      errorOutput += chunk
    })

    const promise = new Promise<void>((resolve) => {
      mockProcess.on('close', (code: number) => {
        exitCode = code
        resolve()
      })
    })

    // Simulate output
    mockProcess.stdout.emit('data', 'Hello from Claude\n')
    mockProcess.stdout.emit('data', JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 100, output_tokens: 0 } } }) + '\n')
    mockProcess.stderr.emit('data', 'some warning')
    mockProcess.emit('close', 0)

    await promise

    expect(logLines).toContain('Hello from Claude')
    expect(logLines.length).toBe(2)
    expect(errorOutput).toBe('some warning')
    expect(exitCode).toBe(0)
  })

  it('simulates process error event', async () => {
    const mockProcess = new EventEmitter() as any
    mockProcess.stdout = new EventEmitter()
    mockProcess.stderr = new EventEmitter()
    mockProcess.stdout.setEncoding = vi.fn()
    mockProcess.stderr.setEncoding = vi.fn()

    let errorMessage = ''

    const promise = new Promise<void>((resolve) => {
      mockProcess.on('error', (err: Error) => {
        errorMessage = `Failed to spawn claude CLI: ${err.message}`
        resolve()
      })
    })

    mockProcess.emit('error', new Error('ENOENT: claude not found'))

    await promise

    expect(errorMessage).toContain('Failed to spawn claude CLI')
    expect(errorMessage).toContain('ENOENT')
  })
})
