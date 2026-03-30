import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { spawn, type ChildProcess } from 'child_process'
import { existsSync, readFileSync, unlinkSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { homedir } from 'os'
import { fileURLToPath } from 'url'
import type { AgistConfig } from './setup.js'
import type { CompanyTemplate } from '../utils/templates.js'
import { importPendingTemplate } from './import.js'

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

function loadPendingImport(): CompanyTemplate | null {
  const pendingPath = join(homedir(), '.agist', 'pending-import.json')
  if (!existsSync(pendingPath)) return null
  try {
    return JSON.parse(readFileSync(pendingPath, 'utf-8')) as CompanyTemplate
  } catch {
    return null
  }
}

function deletePendingImport(): void {
  const pendingPath = join(homedir(), '.agist', 'pending-import.json')
  try {
    unlinkSync(pendingPath)
  } catch {
    // ignore if already deleted
  }
}

function findProjectRoot(): string {
  // Walk up from CLI package to find monorepo root
  let dir = resolve(__dirname, '..', '..', '..', '..')
  if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir

  // Fallback: cwd
  return process.cwd()
}

async function openBrowser(url: string): Promise<void> {
  const platform = process.platform
  const cmd =
    platform === 'win32' ? 'start' :
    platform === 'darwin' ? 'open' :
    'xdg-open'

  try {
    spawn(cmd, [url], { shell: true, detached: true, stdio: 'ignore' }).unref()
  } catch {
    // Best-effort; if it fails, user can open manually
  }
}

async function waitForHealth(baseUrl: string, maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${baseUrl}/api/health`)
      if (res.ok) return true
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

export const startCommand = new Command('start')
  .description('Start the Agist platform (backend + frontend)')
  .option('--backend-only', 'Only start the backend')
  .option('--frontend-only', 'Only start the frontend')
  .option('--no-open', 'Do not open browser automatically')
  .action(
    async (opts: { backendOnly?: boolean; frontendOnly?: boolean; open?: boolean }) => {
      const config = loadConfig()
      const backendPort = config?.backendPort ?? 4400
      const frontendPort = config?.frontendPort ?? 3004
      const baseUrl = `http://localhost:${backendPort}`
      const dashboardUrl = `http://localhost:${frontendPort}`

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
            console.log('  API:       ', chalk.cyan(baseUrl))
            console.log('  Docs:      ', chalk.cyan(`${baseUrl}/api/docs`))
            console.log('  WebSocket: ', chalk.dim(`ws://localhost:${backendPort}/ws`))
          }
          if (!opts.backendOnly) {
            console.log('  Dashboard: ', chalk.cyan(dashboardUrl))
          }
          console.log('')
          console.log(chalk.dim('  Press Ctrl+C to stop'))

          // Handle pending template import + browser open after backend ready
          if (!opts.frontendOnly) {
            void handlePostStart(baseUrl, config, opts.open !== false)
          } else if (opts.open !== false) {
            void openBrowser(dashboardUrl)
          }
        }
      }

      if (!opts.frontendOnly) {
        const env: NodeJS.ProcessEnv = {
          ...process.env,
          PORT: String(backendPort),
        }
        if (config?.anthropicApiKey) env['ANTHROPIC_API_KEY'] = config.anthropicApiKey
        if (config?.openaiApiKey) env['OPENAI_API_KEY'] = config.openaiApiKey

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
          if (backendReady) process.stdout.write(chalk.dim(`[api] ${text}`))
        })

        backendProc.stderr?.on('data', (data: Buffer) => {
          const text = data.toString()
          if (text.includes('listening on')) {
            backendReady = true
            checkReady()
          }
        })

        backendProc.on('exit', (code) => {
          if (code !== 0 && code !== null) {
            spinner.fail(chalk.red(`Backend exited with code ${code}`))
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
          if (
            text.includes('Ready') ||
            text.includes('ready') ||
            text.includes('started server')
          ) {
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
    }
  )

async function handlePostStart(
  baseUrl: string,
  config: AgistConfig | null,
  openBrowserFlag: boolean
): Promise<void> {
  const frontendPort = config?.frontendPort ?? 3004
  const dashboardUrl = `http://localhost:${frontendPort}`

  // Process pending template import
  const pending = loadPendingImport()
  if (pending) {
    // Wait for the backend to actually respond
    const healthy = await waitForHealth(baseUrl)
    if (healthy) {
      console.log('')
      console.log(chalk.cyan(`  Importing starter template: ${pending.name}...`))

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (config?.apiKey) headers['X-Api-Key'] = config.apiKey

      try {
        await importPendingTemplate(pending, baseUrl, headers)
        deletePendingImport()
        console.log(chalk.green('  Template imported successfully!'))
        console.log('')
      } catch (err) {
        console.log(chalk.yellow(`  Could not import template: ${(err as Error).message}`))
        console.log(chalk.dim('  You can retry with: agist import ~/.agist/pending-import.json'))
        console.log('')
      }
    } else {
      console.log(chalk.yellow('  Backend health check timed out — skipping template import.'))
    }
  }

  // Open browser
  if (openBrowserFlag) {
    await openBrowser(dashboardUrl)
  }
}
