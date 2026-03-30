import { Command } from 'commander'
import chalk from 'chalk'
import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { randomBytes } from 'crypto'
import prompts from 'prompts'
import { TEMPLATE_CHOICES, TEMPLATES, type TemplateName } from '../utils/templates.js'

export interface AgistConfig {
  dataDir: string
  backendPort: number
  frontendPort: number
  anthropicApiKey: string
  openaiApiKey: string
  apiKey: string
  createdAt: string
}

export const setupCommand = new Command('setup')
  .description('Interactive setup wizard for Agist')
  .action(async () => {
    console.log('')
    console.log(chalk.cyan.bold('  Welcome to Agist!'))
    console.log(chalk.dim("  Let's set up your agent platform."))
    console.log('')

    const defaultDataDir = join(homedir(), '.agist')

    const answers = await prompts([
      {
        type: 'text',
        name: 'dataDir',
        message: 'Where to store data?',
        initial: defaultDataDir,
      },
      {
        type: 'number',
        name: 'backendPort',
        message: 'Backend API port?',
        initial: 4400,
      },
      {
        type: 'number',
        name: 'frontendPort',
        message: 'Frontend dashboard port?',
        initial: 3004,
      },
      {
        type: 'password',
        name: 'anthropicApiKey',
        message: 'Anthropic API key? (optional, press Enter to skip)',
        initial: '',
      },
      {
        type: 'password',
        name: 'openaiApiKey',
        message: 'OpenAI API key? (optional, press Enter to skip)',
        initial: '',
      },
      {
        type: 'select',
        name: 'template',
        message: 'Import a starter template?',
        choices: TEMPLATE_CHOICES.map((t) => ({
          title: t.title,
          value: t.value,
          description: t.description,
        })),
        initial: 0,
      },
    ])

    if (!answers.dataDir) {
      console.log(chalk.yellow('Setup cancelled.'))
      process.exit(0)
    }

    const dataDir = answers.dataDir as string

    // Create data directory
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true })
    }

    // Generate API key
    const apiKey = `agist_${randomBytes(24).toString('hex')}`

    const config: AgistConfig = {
      dataDir,
      backendPort: (answers.backendPort as number) ?? 4400,
      frontendPort: (answers.frontendPort as number) ?? 3004,
      anthropicApiKey: (answers.anthropicApiKey as string) ?? '',
      openaiApiKey: (answers.openaiApiKey as string) ?? '',
      apiKey,
      createdAt: new Date().toISOString(),
    }

    const configPath = join(dataDir, 'config.json')
    writeFileSync(configPath, JSON.stringify(config, null, 2))

    // Save pending-import if a template was selected
    const selectedTemplate = answers.template as TemplateName | 'none'
    if (selectedTemplate && selectedTemplate !== 'none') {
      const template = TEMPLATES[selectedTemplate]
      const pendingPath = join(dataDir, 'pending-import.json')
      writeFileSync(pendingPath, JSON.stringify({ templateName: selectedTemplate, ...template }, null, 2))
      console.log('')
      console.log(chalk.dim('  Template queued:'), chalk.white(template.name))
    }

    console.log('')
    console.log(chalk.green('  Setup complete!'))
    console.log('')
    console.log(chalk.dim('  Config saved to:'), chalk.white(configPath))
    console.log('')
    console.log(chalk.dim('  Your API key:'))
    console.log(chalk.yellow(`  ${apiKey}`))
    console.log('')
    console.log(chalk.dim('  Keep this key safe — it authenticates API requests.'))
    console.log('')
    console.log(
      '  Run',
      chalk.cyan('agist start'),
      'to launch the platform.'
    )
    console.log('')
  })
