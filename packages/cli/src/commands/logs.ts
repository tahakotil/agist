import { Command } from 'commander'
import chalk from 'chalk'
import { existsSync, readFileSync } from 'fs'
import { join, homedir } from 'path'
// Use Node.js built-in WebSocket (Node 22+) — no external dep needed
import type { AgistConfig } from './setup.js'

function loadConfig(): AgistConfig | null {
  const configPath = join(homedir(), '.agist', 'config.json')
  if (!existsSync(configPath)) return null
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8')) as AgistConfig
  } catch {
    return null
  }
}

interface WsMessage {
  type: 'log' | 'status' | 'error' | 'subscribed'
  agentId?: string
  runId?: string
  line?: string
  timestamp?: string
  status?: string
}

function colorLine(line: string): string {
  if (line.includes('ERROR') || line.includes('error') || line.includes('Error')) {
    return chalk.red(line)
  }
  if (line.includes('WARN') || line.includes('warn') || line.includes('Warning')) {
    return chalk.yellow(line)
  }
  if (line.includes('SUCCESS') || line.includes('success') || line.includes('Done')) {
    return chalk.green(line)
  }
  return chalk.white(line)
}

export const logsCommand = new Command('logs')
  .description('Stream live logs from an agent')
  .argument('<agentId>', 'Agent ID (or "*" for all agents)')
  .option('--url <url>', 'WebSocket URL', 'ws://localhost:4400/ws')
  .action((agentId: string, opts: { url: string }) => {
    const config = loadConfig()
    const wsUrl = opts.url ?? `ws://localhost:${config?.backendPort ?? 4400}/ws`

    console.log('')
    console.log(
      chalk.dim(`  Connecting to ${wsUrl}...`)
    )

    // Node 22+ has built-in WebSocket
    const ws = new (globalThis as { WebSocket: typeof WebSocket }).WebSocket(wsUrl)

    ws.addEventListener('open', () => {
      console.log(chalk.green(`  Connected. Subscribing to agent: ${chalk.white(agentId)}`))
      console.log(chalk.dim('  Press Ctrl+C to exit'))
      console.log('')

      ws.send(JSON.stringify({ type: 'subscribe', agentId }))
    })

    ws.addEventListener('message', (event: MessageEvent) => {
      let msg: WsMessage
      try {
        msg = JSON.parse(String(event.data)) as WsMessage
      } catch {
        return
      }

      if (msg.type === 'log') {
        const ts = msg.timestamp
          ? chalk.dim(new Date(msg.timestamp).toLocaleTimeString())
          : chalk.dim(new Date().toLocaleTimeString())
        const aid = msg.agentId ? chalk.cyan(`[${msg.agentId.slice(0, 8)}]`) : ''
        const line = msg.line ?? ''
        console.log(`${ts} ${aid} ${colorLine(line)}`)
      } else if (msg.type === 'status') {
        const statusColors: Record<string, (s: string) => string> = {
          running: chalk.green,
          idle: chalk.blue,
          error: chalk.red,
          paused: chalk.yellow,
        }
        const colorFn = statusColors[msg.status ?? ''] ?? chalk.white
        console.log(
          chalk.dim(new Date().toLocaleTimeString()),
          chalk.cyan(`[${(msg.agentId ?? '').slice(0, 8)}]`),
          chalk.dim('status →'),
          colorFn(msg.status ?? '')
        )
      }
      // 'subscribed' — no-op
    })

    ws.addEventListener('error', (event: Event) => {
      const errMsg = (event as ErrorEvent).message ?? 'Unknown error'
      console.log(chalk.red(`  WebSocket error: ${errMsg}`))
      console.log(chalk.dim('  Make sure Agist is running: agist start'))
    })

    ws.addEventListener('close', () => {
      console.log('')
      console.log(chalk.yellow('  Connection closed.'))
      process.exit(0)
    })

    // Graceful exit on Ctrl+C
    process.on('SIGINT', () => {
      ws.close()
      console.log('')
      console.log(chalk.dim('  Disconnected.'))
      process.exit(0)
    })
  })
