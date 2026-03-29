import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { EventEmitter } from 'events'
import { Readable } from 'stream'

// ─── Mock all dependencies before importing adapter ───────────────────────────

const mockRun = vi.fn()
const mockGet = vi.fn()
const mockBroadcast = vi.fn()
const mockPushToAgent = vi.fn()
const mockSpawn = vi.fn()

vi.mock('../db.js', () => ({
  run: (...args: unknown[]) => mockRun(...args),
  get: (...args: unknown[]) => mockGet(...args),
}))

vi.mock('../ws.js', () => ({
  pushToAgent: (...args: unknown[]) => mockPushToAgent(...args),
}))

vi.mock('../sse.js', () => ({
  broadcast: (...args: unknown[]) => mockBroadcast(...args),
}))

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}))

// ─── Fake child process factory ───────────────────────────────────────────────

function makeChild(exitCode = 0) {
  const stdout = new Readable({ read() {} })
  const stderr = new Readable({ read() {} })

  // setEncoding must return the stream (Readable protocol)
  stdout.setEncoding = function(enc) { Readable.prototype.setEncoding.call(this, enc); return this }
  stderr.setEncoding = function(enc) { Readable.prototype.setEncoding.call(this, enc); return this }

  const child = new EventEmitter() as EventEmitter & {
    stdout: Readable
    stderr: Readable
    kill: ReturnType<typeof vi.fn>
  }
  child.stdout = stdout
  child.stderr = stderr
  child.kill = vi.fn()

  return child
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('adapter workingDirectory', () => {
  let tempDir: string

  beforeEach(() => {
    vi.clearAllMocks()

    tempDir = join(tmpdir(), `agist-cwd-test-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })

    // Default DB mock: agent + company row
    mockGet.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('FROM agents')) {
        return {
          name: 'TestAgent',
          title: 'Tester',
          role: 'worker',
          capabilities: null,
          company_name: 'Acme',
          company_desc: null,
        }
      }
      // No routine for manual runs
      return undefined
    })
  })

  afterEach(() => {
    try { rmSync(tempDir, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  it('passes workingDirectory as cwd to spawn when directory exists', async () => {
    const child = makeChild(0)

    // mockSpawn records call args and emits close after a tick
    mockSpawn.mockImplementation((..._args: unknown[]) => {
      setImmediate(() => child.emit('close', 0))
      return child
    })

    const { spawnClaudeLocal } = await import('../adapter.js')

    await spawnClaudeLocal({
      runId: 'run-1',
      agentId: 'agent-1',
      companyId: 'company-1',
      model: 'claude-sonnet-4-6',
      prompt: 'test prompt',
      workingDirectory: tempDir,
    })

    expect(mockSpawn).toHaveBeenCalledOnce()
    const spawnOptions = mockSpawn.mock.calls[0][2] as { cwd?: string }
    expect(spawnOptions.cwd).toBe(tempDir)
  }, 10_000)

  it('falls back to process.cwd() when workingDirectory is null', async () => {
    const child = makeChild(0)

    mockSpawn.mockImplementation((..._args: unknown[]) => {
      setImmediate(() => child.emit('close', 0))
      return child
    })

    const { spawnClaudeLocal } = await import('../adapter.js')

    await spawnClaudeLocal({
      runId: 'run-2',
      agentId: 'agent-2',
      companyId: 'company-2',
      model: 'claude-sonnet-4-6',
      prompt: 'test prompt',
      workingDirectory: null,
    })

    expect(mockSpawn).toHaveBeenCalledOnce()
    const spawnOptions = mockSpawn.mock.calls[0][2] as { cwd?: string }
    expect(spawnOptions.cwd).toBe(process.cwd())
  }, 10_000)

  it('fails the run immediately when workingDirectory does not exist', async () => {
    const nonExistentDir = join(tmpdir(), `agist-nonexistent-${Date.now()}`)

    const { spawnClaudeLocal } = await import('../adapter.js')

    await spawnClaudeLocal({
      runId: 'run-3',
      agentId: 'agent-3',
      companyId: 'company-3',
      model: 'claude-sonnet-4-6',
      prompt: 'test prompt',
      workingDirectory: nonExistentDir,
    })

    // spawn should NOT have been called
    expect(mockSpawn).not.toHaveBeenCalled()

    // A run update to 'failed' status should have been issued
    const updateCall = mockRun.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes("status = 'failed'")
    )
    expect(updateCall).toBeDefined()

    // The error message should mention the missing directory path
    const params = updateCall![1] as unknown[]
    const errorMsg = params.find(
      (p) => typeof p === 'string' && (p as string).includes(nonExistentDir)
    )
    expect(errorMsg).toBeDefined()
  }, 10_000)
})
