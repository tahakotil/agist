import { spawn } from 'child_process'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { access } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import type { RunAdapter, AdapterRunOptions, AdapterResult } from './types.js'
import { estimateCostCents } from './cost.js'

// Active child processes keyed by runId — allows kill() support
const activeProcesses = new Map<string, ReturnType<typeof spawn>>()

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

function buildSkillDir(ctx: AgentContext): string {
  const base = join(tmpdir(), `agist-skills-${Date.now()}`)
  const skillDir = join(base, '.claude', 'skills')
  mkdirSync(skillDir, { recursive: true })

  const skillContent = `---
name: ${ctx.agentName}
description: Agent identity and context for ${ctx.agentName}
---

# ${ctx.agentName}
${ctx.agentTitle ? `**Title:** ${ctx.agentTitle}` : ''}
**Role:** ${ctx.agentRole}
**Company:** ${ctx.companyName}${ctx.companyDescription ? ` — ${ctx.companyDescription}` : ''}

${ctx.capabilities ? `## Capabilities\n${ctx.capabilities}` : ''}

${ctx.routineTitle ? `## Current Routine: ${ctx.routineTitle}\n${ctx.routineDescription || ''}` : ''}
`

  writeFileSync(join(skillDir, 'SKILL.md'), skillContent, 'utf-8')
  return base
}

interface StreamJsonChunk {
  type?: string
  usage?: {
    input_tokens?: number
    output_tokens?: number
  }
  message?: {
    usage?: {
      input_tokens?: number
      output_tokens?: number
    }
  }
  delta?: {
    type?: string
    text?: string
  }
}

export const claudeCliAdapter: RunAdapter = {
  name: 'claude-cli',

  async spawn(options: AdapterRunOptions): Promise<AdapterResult> {
    const { runId, model, prompt, workingDirectory, systemPrompt } = options

    // Build skill dir for --add-dir
    const ctx: AgentContext = {
      agentName: options.title ?? 'agent',
      agentTitle: options.title ?? null,
      agentRole: 'worker',
      capabilities: options.capabilities?.join('\n') ?? null,
      companyName: 'Agist',
      companyDescription: null,
      routineTitle: null,
      routineDescription: null,
    }

    const skillDir = buildSkillDir(ctx)
    const effectivePrompt = systemPrompt ?? prompt

    // Validate working directory exists before proceeding
    if (workingDirectory) {
      try {
        await access(workingDirectory)
      } catch {
        const errMsg = `Working directory not found: ${workingDirectory}`
        options.onLog(`[error] ${errMsg}`)
        try { rmSync(skillDir, { recursive: true, force: true }) } catch { /* ignore */ }
        return {
          exitCode: -1,
          tokenInput: 0,
          tokenOutput: 0,
          costCents: 0,
          logExcerpt: errMsg,
          error: errMsg,
        }
      }
    }

    const args = [
      '--model', model,
      '--print',
      '--verbose',
      '--output-format', 'stream-json',
      '--add-dir', skillDir,
      '-p', effectivePrompt,
    ]

    const child = spawn('claude', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: workingDirectory || process.cwd(),
      env: { ...process.env },
    })

    activeProcesses.set(runId, child)

    const logLines: string[] = []
    let inputTokens = 0
    let outputTokens = 0
    let errorOutput = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    child.stdout.on('data', (chunk: string) => {
      const lines = chunk.split('\n').filter((l) => l.trim())
      for (const line of lines) {
        logLines.push(line)
        options.onLog(line)

        try {
          const parsed = JSON.parse(line) as StreamJsonChunk

          if (parsed.type === 'message_start' && parsed.message?.usage) {
            inputTokens = parsed.message.usage.input_tokens ?? inputTokens
            outputTokens = parsed.message.usage.output_tokens ?? outputTokens
          } else if (parsed.type === 'message_delta' && parsed.usage) {
            outputTokens = parsed.usage.output_tokens ?? outputTokens
          } else if (parsed.usage) {
            inputTokens = parsed.usage.input_tokens ?? inputTokens
            outputTokens = parsed.usage.output_tokens ?? outputTokens
          }
        } catch {
          // Not JSON — plain text output line
        }
      }
    })

    child.stderr.on('data', (chunk: string) => {
      errorOutput += chunk
      const line = `[stderr] ${chunk.trim()}`
      logLines.push(line)
      options.onLog(line)
    })

    const TIMEOUT_MS = 5 * 60 * 1000

    return new Promise<AdapterResult>((resolve) => {
      let settled = false

      const finish = (result: AdapterResult) => {
        if (settled) return
        settled = true
        activeProcesses.delete(runId)
        try { rmSync(skillDir, { recursive: true, force: true }) } catch { /* ignore */ }
        options.onTokens(result.tokenInput, result.tokenOutput)
        resolve(result)
      }

      const timeoutHandle = setTimeout(() => {
        if (settled) return
        console.error(`[claude-cli] Run ${runId} timed out after 5 minutes — killing process`)
        try { child.kill('SIGKILL') } catch { /* already dead */ }

        const costCents = estimateCostCents(model, inputTokens, outputTokens)
        const logExcerpt = logLines.slice(-200).join('\n')

        finish({
          exitCode: -1,
          tokenInput: inputTokens,
          tokenOutput: outputTokens,
          costCents,
          logExcerpt,
          error: 'Process timed out after 5 minutes',
        })
      }, TIMEOUT_MS)

      child.on('close', (code) => {
        clearTimeout(timeoutHandle)
        if (settled) return

        const exitCode = code ?? -1
        const costCents = estimateCostCents(model, inputTokens, outputTokens)
        const logExcerpt = logLines.slice(-200).join('\n')

        finish({
          exitCode,
          tokenInput: inputTokens,
          tokenOutput: outputTokens,
          costCents,
          logExcerpt,
          error: errorOutput || undefined,
        })
      })

      child.on('error', (err) => {
        clearTimeout(timeoutHandle)
        if (settled) return

        const errMsg = `Failed to spawn claude CLI: ${err.message}`
        options.onLog(`[error] ${errMsg}`)

        finish({
          exitCode: -1,
          tokenInput: 0,
          tokenOutput: 0,
          costCents: 0,
          logExcerpt: errMsg,
          error: errMsg,
        })
      })
    })
  },

  kill(runId: string): void {
    const child = activeProcesses.get(runId)
    if (child) {
      try { child.kill('SIGKILL') } catch { /* ignore */ }
      activeProcesses.delete(runId)
    }
  },
}
