import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
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

interface HealthResponse {
  status: string
  db?: string
  uptime?: number
}

interface StatsResponse {
  totalAgents?: number
  runningAgents?: number
  successRate?: number
  totalCostCents?: number
}

interface AgentsResponse {
  agents: Array<{
    id: string
    name: string
    role: string
    status: string
    model: string | null
    companyName?: string
  }>
}

function statusColor(status: string): string {
  switch (status) {
    case 'running': return chalk.green(status)
    case 'idle': return chalk.blue(status)
    case 'paused': return chalk.yellow(status)
    case 'error': return chalk.red(status)
    default: return chalk.dim(status)
  }
}

function modelShort(model: string | null): string {
  if (!model) return 'unknown'
  if (model.includes('haiku')) return 'Haiku'
  if (model.includes('sonnet')) return 'Sonnet'
  if (model.includes('opus')) return 'Opus'
  return model.split('-').pop() ?? model
}

export const statusCommand = new Command('status')
  .description('Show Agist platform status and agent list')
  .option('--url <url>', 'Backend URL', 'http://localhost:4400')
  .action(async (opts: { url: string }) => {
    const config = loadConfig()
    const baseUrl = opts.url ?? `http://localhost:${config?.backendPort ?? 4400}`

    const spinner = ora('Fetching status...').start()

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (config?.apiKey) headers['X-Api-Key'] = config.apiKey

    try {
      // Fetch health
      const [healthRes, statsRes, agentsRes] = await Promise.all([
        fetch(`${baseUrl}/api/health`, { headers }),
        fetch(`${baseUrl}/api/dashboard/stats`, { headers }),
        fetch(`${baseUrl}/api/agents?limit=50`, { headers }),
      ])

      spinner.stop()

      if (!healthRes.ok) {
        console.log('')
        console.log(chalk.red('  Agist backend is not reachable.'))
        console.log(chalk.dim(`  Tried: ${baseUrl}`))
        console.log('')
        console.log('  Start it with:', chalk.cyan('agist start'))
        return
      }

      const health = (await healthRes.json()) as HealthResponse
      const stats = statsRes.ok ? (await statsRes.json()) as StatsResponse : {}
      const agentsData = agentsRes.ok ? (await agentsRes.json()) as AgentsResponse : { agents: [] }

      console.log('')
      console.log(chalk.cyan.bold('  Agist Status'))
      console.log('')

      // Server
      const healthStatus = health.status === 'ok' ? chalk.green('online') : chalk.red(health.status)
      console.log(`  Server     ${healthStatus}`)
      console.log(`  Database   ${health.db === 'ok' ? chalk.green('ok') : chalk.red(health.db ?? 'unknown')}`)
      if (health.uptime !== undefined) {
        const mins = Math.floor(health.uptime / 60)
        const hrs = Math.floor(mins / 60)
        const uptimeStr = hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`
        console.log(`  Uptime     ${chalk.dim(uptimeStr)}`)
      }
      console.log('')

      // Stats
      if (Object.keys(stats).length > 0) {
        console.log(chalk.bold('  Stats'))
        console.log(`  Agents     ${stats.totalAgents ?? 0} total, ${stats.runningAgents ?? 0} running`)
        if (stats.successRate !== undefined) {
          console.log(`  Success    ${(stats.successRate * 100).toFixed(1)}%`)
        }
        if (stats.totalCostCents !== undefined) {
          console.log(`  Cost       $${(stats.totalCostCents / 100).toFixed(2)} this month`)
        }
        console.log('')
      }

      // Agents
      const agents = agentsData.agents ?? []
      if (agents.length === 0) {
        console.log(chalk.dim('  No agents found.'))
      } else {
        console.log(chalk.bold('  Agents'))
        console.log('')

        const nameW = Math.max(10, ...agents.map((a) => a.name.length))
        const roleW = Math.max(8, ...agents.map((a) => a.role.length))

        const header = [
          chalk.dim('  Name'.padEnd(nameW + 4)),
          chalk.dim('Role'.padEnd(roleW + 4)),
          chalk.dim('Model'.padEnd(10)),
          chalk.dim('Status'),
        ].join('')
        console.log(header)
        console.log(chalk.dim('  ' + '─'.repeat(nameW + roleW + 28)))

        for (const agent of agents) {
          const line = [
            `  ${agent.name.padEnd(nameW + 4)}`,
            `${agent.role.padEnd(roleW + 4)}`,
            `${modelShort(agent.model).padEnd(10)}`,
            statusColor(agent.status),
          ].join('')
          console.log(line)
        }
      }

      console.log('')
    } catch (err) {
      spinner.fail('Could not connect to Agist backend')
      console.log('')
      console.log(chalk.dim(`  Error: ${(err as Error).message}`))
      console.log('')
      console.log('  Start it with:', chalk.cyan('agist start'))
    }
  })
