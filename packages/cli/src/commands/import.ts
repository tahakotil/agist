import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { AgistConfig } from './setup.js'
import type { CompanyTemplate } from '../utils/templates.js'

function loadConfig(): AgistConfig | null {
  const configPath = join(homedir(), '.agist', 'config.json')
  if (!existsSync(configPath)) return null
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8')) as AgistConfig
  } catch {
    return null
  }
}

interface ImportFile {
  name: string
  description?: string
  agents?: Array<{
    name: string
    role: string
    model?: string
    adapterType?: string
  }>
}

async function importTemplate(
  template: ImportFile,
  baseUrl: string,
  headers: Record<string, string>
): Promise<void> {
  // 1. Create the company
  const companyRes = await fetch(`${baseUrl}/api/companies`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: template.name,
      description: template.description ?? '',
    }),
  })

  if (!companyRes.ok) {
    const text = await companyRes.text()
    throw new Error(`Failed to create company: ${companyRes.status} ${text}`)
  }

  const companyData = (await companyRes.json()) as { id: string; name: string }
  const companyId = companyData.id
  console.log(chalk.dim(`  Created company: ${companyData.name} (${companyId})`))

  // 2. Create each agent
  const agents = template.agents ?? []
  for (const agent of agents) {
    const agentRes = await fetch(`${baseUrl}/api/companies/${companyId}/agents`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: agent.name,
        role: agent.role,
        model: agent.model,
        adapterType: agent.adapterType,
      }),
    })

    if (!agentRes.ok) {
      const text = await agentRes.text()
      console.log(chalk.yellow(`  Warning: could not create agent "${agent.name}": ${text}`))
    } else {
      const agentData = (await agentRes.json()) as { id: string; name: string }
      console.log(chalk.dim(`  Created agent:   ${agentData.name} (${agentData.id})`))
    }
  }
}

export const importCommand = new Command('import')
  .description('Import a company template from a JSON file')
  .argument('<file>', 'Path to a JSON template file')
  .option('--url <url>', 'Backend URL', 'http://localhost:4400')
  .action(async (file: string, opts: { url: string }) => {
    const config = loadConfig()
    const baseUrl = opts.url ?? `http://localhost:${config?.backendPort ?? 4400}`

    // Validate file exists
    if (!existsSync(file)) {
      console.log(chalk.red(`  File not found: ${file}`))
      process.exit(1)
    }

    // Parse file
    let template: ImportFile
    try {
      const raw = readFileSync(file, 'utf-8')
      template = JSON.parse(raw) as ImportFile
    } catch (err) {
      console.log(chalk.red(`  Could not parse JSON file: ${(err as Error).message}`))
      process.exit(1)
    }

    // Validate basic structure
    if (!template.name || typeof template.name !== 'string') {
      console.log(chalk.red('  Invalid template: missing "name" field.'))
      console.log(chalk.dim('  Expected: { "name": "...", "description": "...", "agents": [...] }'))
      process.exit(1)
    }

    const spinner = ora(`Importing "${template.name}"...`).start()

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (config?.apiKey) headers['X-Api-Key'] = config.apiKey

    try {
      spinner.stop()
      console.log('')
      console.log(chalk.cyan.bold(`  Importing template: ${template.name}`))
      console.log('')

      await importTemplate(template, baseUrl, headers)

      console.log('')
      console.log(chalk.green('  Import complete!'))
      console.log(
        '  View your team at:',
        chalk.cyan(`http://localhost:${config?.frontendPort ?? 3004}/companies`)
      )
      console.log('')
    } catch (err) {
      spinner.fail('Import failed')
      console.log('')
      console.log(chalk.red(`  Error: ${(err as Error).message}`))
      console.log('')
      console.log('  Make sure Agist is running:', chalk.cyan('agist start'))
      process.exit(1)
    }
  })

// Export the core import logic so start.ts can use it for pending-import
export async function importPendingTemplate(
  template: CompanyTemplate,
  baseUrl: string,
  headers: Record<string, string>
): Promise<void> {
  await importTemplate(template as ImportFile, baseUrl, headers)
}
