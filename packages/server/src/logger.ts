type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVEL = (process.env.LOG_LEVEL || 'info') as LogLevel
const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  requestId?: string
  [key: string]: unknown
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[LOG_LEVEL]
}

function emit(entry: LogEntry): void {
  const line = JSON.stringify(entry)
  if (entry.level === 'error') {
    process.stderr.write(line + '\n')
  } else {
    process.stdout.write(line + '\n')
  }
}

export const logger = {
  debug(msg: string, meta?: Record<string, unknown>): void {
    if (shouldLog('debug')) emit({ timestamp: new Date().toISOString(), level: 'debug', message: msg, ...meta })
  },
  info(msg: string, meta?: Record<string, unknown>): void {
    if (shouldLog('info')) emit({ timestamp: new Date().toISOString(), level: 'info', message: msg, ...meta })
  },
  warn(msg: string, meta?: Record<string, unknown>): void {
    if (shouldLog('warn')) emit({ timestamp: new Date().toISOString(), level: 'warn', message: msg, ...meta })
  },
  error(msg: string, meta?: Record<string, unknown>): void {
    if (shouldLog('error')) emit({ timestamp: new Date().toISOString(), level: 'error', message: msg, ...meta })
  },
}
