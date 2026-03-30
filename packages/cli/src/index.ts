#!/usr/bin/env node
import { Command } from 'commander'
import { setupCommand } from './commands/setup.js'
import { startCommand } from './commands/start.js'
import { statusCommand } from './commands/status.js'
import { logsCommand } from './commands/logs.js'
import { importCommand } from './commands/import.js'
import { printBanner } from './utils/banner.js'

const program = new Command()
  .name('agist')
  .description('AI agent orchestration platform')
  .version('0.2.0')

program.addCommand(setupCommand)
program.addCommand(startCommand)
program.addCommand(statusCommand)
program.addCommand(logsCommand)
program.addCommand(importCommand)

// Default action when no subcommand is given: show banner then start
program.action(() => {
  printBanner()
  // Manually invoke start command action
  startCommand.parseAsync([], { from: 'user' }).catch((err: unknown) => {
    console.error((err as Error).message)
    process.exit(1)
  })
})

program.parse()
