import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('logger', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>
  let stderrSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.LOG_LEVEL
    // Reset module so LOG_LEVEL is re-read
    vi.resetModules()
  })

  it('emits structured JSON for info level', async () => {
    const { logger } = await import('../logger.js')
    logger.info('hello world', { foo: 'bar' })
    expect(stdoutSpy).toHaveBeenCalled()
    const line = (stdoutSpy.mock.calls[0][0] as string).trim()
    const parsed = JSON.parse(line) as Record<string, unknown>
    expect(parsed.level).toBe('info')
    expect(parsed.message).toBe('hello world')
    expect(parsed.foo).toBe('bar')
    expect(typeof parsed.timestamp).toBe('string')
  })

  it('writes errors to stderr', async () => {
    const { logger } = await import('../logger.js')
    logger.error('something broke', { code: 500 })
    expect(stderrSpy).toHaveBeenCalled()
    const line = (stderrSpy.mock.calls[0][0] as string).trim()
    const parsed = JSON.parse(line) as Record<string, unknown>
    expect(parsed.level).toBe('error')
    expect(parsed.message).toBe('something broke')
    expect(parsed.code).toBe(500)
  })

  it('suppresses debug logs when LOG_LEVEL=info', async () => {
    process.env.LOG_LEVEL = 'info'
    const { logger } = await import('../logger.js')
    logger.debug('noisy debug')
    expect(stdoutSpy).not.toHaveBeenCalled()
  })

  it('emits debug logs when LOG_LEVEL=debug', async () => {
    process.env.LOG_LEVEL = 'debug'
    vi.resetModules()
    const { logger } = await import('../logger.js')
    logger.debug('debug line')
    expect(stdoutSpy).toHaveBeenCalled()
    const line = (stdoutSpy.mock.calls[0][0] as string).trim()
    const parsed = JSON.parse(line) as Record<string, unknown>
    expect(parsed.level).toBe('debug')
  })

  it('suppresses info/debug logs when LOG_LEVEL=warn', async () => {
    process.env.LOG_LEVEL = 'warn'
    vi.resetModules()
    const { logger } = await import('../logger.js')
    logger.info('silent info')
    logger.debug('silent debug')
    expect(stdoutSpy).not.toHaveBeenCalled()
    logger.warn('visible warn')
    expect(stdoutSpy).toHaveBeenCalledTimes(1)
  })
})
