#!/usr/bin/env node
import { Command } from 'commander'
import { setupCommand } from './commands/setup.js'
import { startCommand } from './commands/start.js'
import { statusCommand } from './commands/status.js'
import { logsCommand } from './commands/logs.js'

const program = new Command()
  .name('agist')
  .description('AI agent orchestration platform')
  .version('0.1.0')

program.addCommand(setupCommand)
program.addCommand(startCommand)
program.addCommand(statusCommand)
program.addCommand(logsCommand)

program.parse()
