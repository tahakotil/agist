import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { spawn, type ChildProcess } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join, homedir, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { AgistConfig } from './setup.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function loadConfig(): AgistConfig | null {
  const configPath = join(homedir(), '.agist', 'config.json')
  if (!existsSync(configPath)) return null
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8')) as AgistConfig
  } catch {
    return null
  }
}

function findProjectRoot(): string {
  // Walk up from CLI package to find monorepo root
  let dir = resolve(__dirname, '..', '..', '..', '..')
  if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir

  // Fallback: cwd
  return process.cwd()
}

export const startCommand = new Command('start')
  .description('Start the Agist platform (backend + frontend)')
  .option('--backend-only', 'Only start the backend')
  .option('--frontend-only', 'Only start the frontend')
  .action(async (opts: { backendOnly?: boolean; frontendOnly?: boolean }) => {
    const config = loadConfig()
    const backendPort = config?.backendPort ?? 4400
    const frontendPort = config?.frontendPort ?? 3004

    const spinner = ora('Starting Agist...').start()

    const projectRoot = findProjectRoot()
    const processes: ChildProcess[] = []

    let backendReady = false
    let frontendReady = false

    function checkReady() {
      const bothReady = opts.backendOnly
        ? backendReady
        : opts.frontendOnly
          ? frontendReady
          : backendReady && frontendReady

      if (bothReady) {
        spinner.succeed(chalk.green('Agist is running!'))
        console.log('')
        if (!opts.frontendOnly) {
          console.log('  API:', chalk.cyan(`http://localhost:${backendPort}`))
        }
        if (!opts.backendOnly) {
          console.log('  Dashboard:', chalk.cyan(`http://localhost:${frontendPort}`))
        }
        if (!opts.frontendOnly) {
          console.log('  WebSocket:', chalk.dim(`ws://localhost:${backendPort}/ws`))
        }
        console.log('')
        console.log(chalk.dim('  Press Ctrl+C to stop'))
      }
    }

    if (!opts.frontendOnly) {
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        PORT: String(backendPort),
      }
      if (config?.anthropicApiKey) env['ANTHROPIC_API_KEY'] = config.anthropicApiKey

      const serverEntry = join(projectRoot, 'packages', 'server', 'src', 'index.ts')
      const backendProc = spawn('npx', ['tsx', serverEntry], {
        env,
        cwd: projectRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      processes.push(backendProc)

      backendProc.stdout?.on('data', (data: Buffer) => {
        const text = data.toString()
        if (text.includes('listening on')) {
          backendReady = true
          checkReady()
        }
        // Show after ready
        if (backendReady) process.stdout.write(chalk.dim(`[api] ${text}`))
      })

      backendProc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString()
        if (text.includes('listening on')) {
          backendReady = true
          checkReady()
        }
      })

      // Fallback: assume ready after 5s
      setTimeout(() => {
        if (!backendReady) {
          backendReady = true
          checkReady()
        }
      }, 5000)
    }

    if (!opts.backendOnly) {
      const webDir = join(projectRoot, 'packages', 'web')
      const frontendProc = spawn(
        'npx',
        ['next', 'dev', '-p', String(frontendPort)],
        {
          cwd: webDir,
          env: { ...process.env },
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      )
      processes.push(frontendProc)

      frontendProc.stdout?.on('data', (data: Buffer) => {
        const text = data.toString()
        if (text.includes('Ready') || text.includes('ready') || text.includes('started server')) {
          frontendReady = true
          checkReady()
        }
      })

      frontendProc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString()
        if (text.includes('Ready') || text.includes('ready')) {
          frontendReady = true
          checkReady()
        }
      })

      // Fallback: assume ready after 15s
      setTimeout(() => {
        if (!frontendReady) {
          frontendReady = true
          checkReady()
        }
      }, 15000)
    }

    // Handle graceful shutdown
    function shutdown() {
      console.log('')
      console.log(chalk.yellow('  Shutting down Agist...'))
      for (const proc of processes) {
        proc.kill('SIGTERM')
      }
      setTimeout(() => process.exit(0), 2000)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  })
