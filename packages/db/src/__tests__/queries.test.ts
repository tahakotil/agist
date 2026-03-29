import { describe, it, expect, beforeEach } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

import {
  makeCompanyQueries,
  makeAgentQueries,
  makeRoutineQueries,
  makeRunQueries,
  makeIssueQueries,
} from '../queries.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load schema from db package
const schemaPath = join(__dirname, '..', 'schema.sql')
const schema = readFileSync(schemaPath, 'utf-8')

async function createTestDb(): Promise<Database> {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  // Execute schema statement by statement
  // Strip comment lines first, then split on semicolons
  const noComments = schema
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
  const statements = noComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('PRAGMA'))
  for (const stmt of statements) {
    db.run(stmt)
  }
  return db
}

let db: Database

beforeEach(async () => {
  db = await createTestDb()
})

// ─── Company CRUD ─────────────────────────────────────────────────────────────

describe('Company queries', () => {
  it('creates a company with defaults', () => {
    const q = makeCompanyQueries(db)
    const company = q.create({ name: 'Acme', status: 'active', budgetMonthlyCents: 0 })
    expect(company.id).toBeTruthy()
    expect(company.name).toBe('Acme')
    expect(company.status).toBe('active')
    expect(company.budgetMonthlyCents).toBe(0)
    expect(company.spentMonthlyCents).toBe(0)
    expect(company.createdAt).toBeTruthy()
    expect(company.updatedAt).toBeTruthy()
  })

  it('creates a company with all fields', () => {
    const q = makeCompanyQueries(db)
    const company = q.create({
      name: 'BigCorp',
      description: 'A big company',
      status: 'paused',
      budgetMonthlyCents: 10000,
    })
    expect(company.description).toBe('A big company')
    expect(company.status).toBe('paused')
    expect(company.budgetMonthlyCents).toBe(10000)
  })

  it('lists all companies', () => {
    const q = makeCompanyQueries(db)
    q.create({ name: 'A', status: 'active', budgetMonthlyCents: 0 })
    q.create({ name: 'B', status: 'active', budgetMonthlyCents: 0 })
    const list = q.list()
    expect(list.length).toBe(2)
  })

  it('lists companies ordered by created_at DESC', () => {
    const q = makeCompanyQueries(db)
    // Manually insert with different timestamps to ensure ordering is deterministic
    const now = new Date()
    const earlier = new Date(now.getTime() - 5000).toISOString()
    const later = new Date(now.getTime() + 5000).toISOString()
    // Insert directly via SQL with explicit timestamps
    db.run(
      `INSERT INTO companies (id, name, description, status, budget_monthly_cents, spent_monthly_cents, created_at, updated_at)
       VALUES ('c-first', 'First', NULL, 'active', 0, 0, ?, ?)`,
      [earlier, earlier]
    )
    db.run(
      `INSERT INTO companies (id, name, description, status, budget_monthly_cents, spent_monthly_cents, created_at, updated_at)
       VALUES ('c-second', 'Second', NULL, 'active', 0, 0, ?, ?)`,
      [later, later]
    )
    const list = q.list()
    // Most recently created should be first
    expect(list[0].name).toBe('Second')
    expect(list[1].name).toBe('First')
  })

  it('gets company by id', () => {
    const q = makeCompanyQueries(db)
    const created = q.create({ name: 'FindMe', status: 'active', budgetMonthlyCents: 0 })
    const found = q.getById(created.id)
    expect(found).toBeDefined()
    expect(found!.name).toBe('FindMe')
  })

  it('returns undefined for missing id', () => {
    const q = makeCompanyQueries(db)
    expect(q.getById('nonexistent')).toBeUndefined()
  })

  it('updates a company', () => {
    const q = makeCompanyQueries(db)
    const company = q.create({ name: 'Old Name', status: 'active', budgetMonthlyCents: 0 })
    const updated = q.update(company.id, { name: 'New Name', status: 'paused' })
    expect(updated).toBeDefined()
    expect(updated!.name).toBe('New Name')
    expect(updated!.status).toBe('paused')
  })

  it('returns undefined when updating nonexistent company', () => {
    const q = makeCompanyQueries(db)
    expect(q.update('nope', { name: 'X' })).toBeUndefined()
  })

  it('returns unchanged company when no update fields provided', () => {
    const q = makeCompanyQueries(db)
    const company = q.create({ name: 'Stable', status: 'active', budgetMonthlyCents: 0 })
    const result = q.update(company.id, {})
    expect(result!.name).toBe('Stable')
  })

  it('deletes a company', () => {
    const q = makeCompanyQueries(db)
    const company = q.create({ name: 'DeleteMe', status: 'active', budgetMonthlyCents: 0 })
    const deleted = q.delete(company.id)
    expect(deleted).toBe(true)
    expect(q.getById(company.id)).toBeUndefined()
  })

  it('returns false when deleting nonexistent company', () => {
    const q = makeCompanyQueries(db)
    expect(q.delete('nonexistent')).toBe(false)
  })

  it('returns empty array for empty db', () => {
    const q = makeCompanyQueries(db)
    expect(q.list()).toEqual([])
  })
})

// ─── Agent CRUD ───────────────────────────────────────────────────────────────

describe('Agent queries', () => {
  let companyId: string

  beforeEach(() => {
    const cq = makeCompanyQueries(db)
    const company = cq.create({ name: 'TestCo', status: 'active', budgetMonthlyCents: 0 })
    companyId = company.id
  })

  const baseAgent = () => ({
    companyId,
    name: 'Bot',
    role: 'engineer' as const,
    adapterType: 'claude-cli',
    status: 'idle' as const,
    budgetMonthlyCents: 0,
    adapterConfig: {},
  })

  it('creates an agent with defaults', () => {
    const q = makeAgentQueries(db)
    const agent = q.create(baseAgent())
    expect(agent.id).toBeTruthy()
    expect(agent.name).toBe('Bot')
    expect(agent.role).toBe('engineer')
    expect(agent.companyId).toBe(companyId)
    expect(agent.status).toBe('idle')
    expect(agent.adapterConfig).toEqual({})
  })

  it('creates an agent with full fields', () => {
    const q = makeAgentQueries(db)
    const agent = q.create({
      ...baseAgent(),
      title: 'Lead',
      model: 'claude-sonnet-4-6',
      capabilities: 'TypeScript, Node.js',
      adapterConfig: { timeout: 30 },
    })
    expect(agent.title).toBe('Lead')
    expect(agent.model).toBe('claude-sonnet-4-6')
    expect(agent.capabilities).toBe('TypeScript, Node.js')
    expect(agent.adapterConfig).toEqual({ timeout: 30 })
  })

  it('lists agents by company', () => {
    const q = makeAgentQueries(db)
    q.create(baseAgent())
    q.create({ ...baseAgent(), name: 'Bot2' })
    const list = q.listByCompany(companyId)
    expect(list.length).toBe(2)
  })

  it('lists only agents for the specified company', () => {
    const cq = makeCompanyQueries(db)
    const otherCompany = cq.create({ name: 'Other', status: 'active', budgetMonthlyCents: 0 })
    const q = makeAgentQueries(db)
    q.create(baseAgent())
    q.create({ ...baseAgent(), companyId: otherCompany.id })
    const list = q.listByCompany(companyId)
    expect(list.length).toBe(1)
  })

  it('gets agent by id', () => {
    const q = makeAgentQueries(db)
    const created = q.create(baseAgent())
    const found = q.getById(created.id)
    expect(found).toBeDefined()
    expect(found!.name).toBe('Bot')
  })

  it('returns undefined for missing agent', () => {
    const q = makeAgentQueries(db)
    expect(q.getById('nope')).toBeUndefined()
  })

  it('updates an agent', () => {
    const q = makeAgentQueries(db)
    const agent = q.create(baseAgent())
    const updated = q.update(agent.id, { status: 'running', model: 'claude-haiku-4-5' })
    expect(updated!.status).toBe('running')
    expect(updated!.model).toBe('claude-haiku-4-5')
  })

  it('returns undefined when updating nonexistent agent', () => {
    const q = makeAgentQueries(db)
    expect(q.update('nope', { status: 'paused' })).toBeUndefined()
  })

  it('deletes an agent', () => {
    const q = makeAgentQueries(db)
    const agent = q.create(baseAgent())
    expect(q.delete(agent.id)).toBe(true)
    expect(q.getById(agent.id)).toBeUndefined()
  })

  it('agents are cascade deleted when company is deleted', () => {
    const cq = makeCompanyQueries(db)
    const q = makeAgentQueries(db)
    const agent = q.create(baseAgent())
    cq.delete(companyId)
    expect(q.getById(agent.id)).toBeUndefined()
  })

  it('parses adapterConfig from JSON string correctly', () => {
    const q = makeAgentQueries(db)
    const agent = q.create({ ...baseAgent(), adapterConfig: { model: 'test', timeout: 60 } })
    const fetched = q.getById(agent.id)
    expect(fetched!.adapterConfig).toEqual({ model: 'test', timeout: 60 })
  })
})

// ─── Routine CRUD ─────────────────────────────────────────────────────────────

describe('Routine queries', () => {
  let companyId: string
  let agentId: string

  beforeEach(() => {
    const cq = makeCompanyQueries(db)
    const aq = makeAgentQueries(db)
    const company = cq.create({ name: 'TestCo', status: 'active', budgetMonthlyCents: 0 })
    companyId = company.id
    const agent = aq.create({
      companyId,
      name: 'Bot',
      role: 'engineer',
      adapterType: 'claude-cli',
      status: 'idle',
      budgetMonthlyCents: 0,
      adapterConfig: {},
    })
    agentId = agent.id
  })

  const baseRoutine = () => ({
    companyId,
    agentId,
    title: 'Daily check',
    cronExpression: '0 9 * * *',
    timezone: 'UTC',
    enabled: true,
  })

  it('creates a routine', () => {
    const q = makeRoutineQueries(db)
    const routine = q.create(baseRoutine())
    expect(routine.id).toBeTruthy()
    expect(routine.title).toBe('Daily check')
    expect(routine.cronExpression).toBe('0 9 * * *')
    expect(routine.enabled).toBe(true)
    expect(routine.timezone).toBe('UTC')
  })

  it('creates a disabled routine', () => {
    const q = makeRoutineQueries(db)
    const routine = q.create({ ...baseRoutine(), enabled: false })
    expect(routine.enabled).toBe(false)
  })

  it('lists routines by company', () => {
    const q = makeRoutineQueries(db)
    q.create(baseRoutine())
    q.create({ ...baseRoutine(), title: 'Weekly' })
    expect(q.listByCompany(companyId).length).toBe(2)
  })

  it('lists routines by agent', () => {
    const q = makeRoutineQueries(db)
    q.create(baseRoutine())
    expect(q.listByAgent(agentId).length).toBe(1)
  })

  it('gets routine by id', () => {
    const q = makeRoutineQueries(db)
    const created = q.create(baseRoutine())
    const found = q.getById(created.id)
    expect(found).toBeDefined()
    expect(found!.title).toBe('Daily check')
  })

  it('updates a routine', () => {
    const q = makeRoutineQueries(db)
    const routine = q.create(baseRoutine())
    const updated = q.update(routine.id, { enabled: false, title: 'Updated' })
    expect(updated!.enabled).toBe(false)
    expect(updated!.title).toBe('Updated')
  })

  it('updates lastRunAt and nextRunAt', () => {
    const q = makeRoutineQueries(db)
    const routine = q.create(baseRoutine())
    const ts = '2024-01-01T09:00:00.000Z'
    const updated = q.update(routine.id, { lastRunAt: ts, nextRunAt: ts })
    expect(updated!.lastRunAt).toBe(ts)
    expect(updated!.nextRunAt).toBe(ts)
  })

  it('deletes a routine', () => {
    const q = makeRoutineQueries(db)
    const routine = q.create(baseRoutine())
    expect(q.delete(routine.id)).toBe(true)
    expect(q.getById(routine.id)).toBeUndefined()
  })

  it('routines are cascade deleted when agent is deleted', () => {
    const aq = makeAgentQueries(db)
    const q = makeRoutineQueries(db)
    const routine = q.create(baseRoutine())
    aq.delete(agentId)
    expect(q.getById(routine.id)).toBeUndefined()
  })
})

// ─── Run CRUD ─────────────────────────────────────────────────────────────────

describe('Run queries', () => {
  let companyId: string
  let agentId: string

  beforeEach(() => {
    const cq = makeCompanyQueries(db)
    const aq = makeAgentQueries(db)
    const company = cq.create({ name: 'TestCo', status: 'active', budgetMonthlyCents: 0 })
    companyId = company.id
    const agent = aq.create({
      companyId,
      name: 'Bot',
      role: 'engineer',
      adapterType: 'claude-cli',
      status: 'idle',
      budgetMonthlyCents: 0,
      adapterConfig: {},
    })
    agentId = agent.id
  })

  const baseRun = () => ({
    agentId,
    companyId,
    source: 'manual' as const,
    status: 'queued' as const,
  })

  it('creates a run', () => {
    const q = makeRunQueries(db)
    const run = q.create(baseRun())
    expect(run.id).toBeTruthy()
    expect(run.agentId).toBe(agentId)
    expect(run.companyId).toBe(companyId)
    expect(run.source).toBe('manual')
    expect(run.status).toBe('queued')
    expect(run.tokenInput).toBe(0)
    expect(run.tokenOutput).toBe(0)
    expect(run.costCents).toBe(0)
  })

  it('creates a run with model', () => {
    const q = makeRunQueries(db)
    const run = q.create({ ...baseRun(), model: 'claude-sonnet-4-6' })
    expect(run.model).toBe('claude-sonnet-4-6')
  })

  it('lists runs by agent', () => {
    const q = makeRunQueries(db)
    q.create(baseRun())
    q.create(baseRun())
    expect(q.listByAgent(agentId).length).toBe(2)
  })

  it('gets run by id', () => {
    const q = makeRunQueries(db)
    const created = q.create(baseRun())
    const found = q.getById(created.id)
    expect(found).toBeDefined()
    expect(found!.id).toBe(created.id)
  })

  it('updates run status', () => {
    const q = makeRunQueries(db)
    const run = q.create(baseRun())
    const updated = q.updateStatus(run.id, {
      status: 'completed',
      finishedAt: '2024-01-01T00:00:00.000Z',
      exitCode: 0,
      tokenInput: 1000,
      tokenOutput: 500,
      costCents: 5,
      logExcerpt: 'done',
    })
    expect(updated!.status).toBe('completed')
    expect(updated!.exitCode).toBe(0)
    expect(updated!.tokenInput).toBe(1000)
    expect(updated!.tokenOutput).toBe(500)
    expect(updated!.costCents).toBe(5)
  })

  it('updates run status to failed', () => {
    const q = makeRunQueries(db)
    const run = q.create(baseRun())
    const updated = q.updateStatus(run.id, {
      status: 'failed',
      exitCode: 1,
      error: 'Process failed',
    })
    expect(updated!.status).toBe('failed')
    expect(updated!.exitCode).toBe(1)
    expect(updated!.error).toBe('Process failed')
  })

  it('returns undefined when updating nonexistent run', () => {
    const q = makeRunQueries(db)
    expect(q.updateStatus('nope', { status: 'completed' })).toBeUndefined()
  })

  it('gets latest run by agent', () => {
    // Insert runs with explicit different timestamps to guarantee ordering
    const now = new Date()
    const earlier = new Date(now.getTime() - 5000).toISOString()
    const later = new Date(now.getTime() + 5000).toISOString()
    db.run(
      `INSERT INTO runs (id, agent_id, company_id, routine_id, status, model, source, started_at, finished_at, exit_code, error, token_input, token_output, cost_cents, log_excerpt, created_at)
       VALUES ('run-old', ?, ?, NULL, 'queued', NULL, 'manual', NULL, NULL, NULL, NULL, 0, 0, 0, NULL, ?)`,
      [agentId, companyId, earlier]
    )
    db.run(
      `INSERT INTO runs (id, agent_id, company_id, routine_id, status, model, source, started_at, finished_at, exit_code, error, token_input, token_output, cost_cents, log_excerpt, created_at)
       VALUES ('run-new', ?, ?, NULL, 'queued', 'latest-model', 'manual', NULL, NULL, NULL, NULL, 0, 0, 0, NULL, ?)`,
      [agentId, companyId, later]
    )
    const q = makeRunQueries(db)
    const result = q.getLatestByAgent(agentId)
    expect(result!.id).toBe('run-new')
    expect(result!.model).toBe('latest-model')
  })

  it('returns undefined for getLatestByAgent with no runs', () => {
    const q = makeRunQueries(db)
    expect(q.getLatestByAgent(agentId)).toBeUndefined()
  })

  it('deletes a run', () => {
    const q = makeRunQueries(db)
    const run = q.create(baseRun())
    expect(q.delete(run.id)).toBe(true)
    expect(q.getById(run.id)).toBeUndefined()
  })

  it('runs are cascade deleted when agent is deleted', () => {
    const aq = makeAgentQueries(db)
    const q = makeRunQueries(db)
    const run = q.create(baseRun())
    aq.delete(agentId)
    expect(q.getById(run.id)).toBeUndefined()
  })
})

// ─── Issue CRUD ───────────────────────────────────────────────────────────────

describe('Issue queries', () => {
  let companyId: string
  let agentId: string

  beforeEach(() => {
    const cq = makeCompanyQueries(db)
    const aq = makeAgentQueries(db)
    const company = cq.create({ name: 'TestCo', status: 'active', budgetMonthlyCents: 0 })
    companyId = company.id
    const agent = aq.create({
      companyId,
      name: 'Bot',
      role: 'engineer',
      adapterType: 'claude-cli',
      status: 'idle',
      budgetMonthlyCents: 0,
      adapterConfig: {},
    })
    agentId = agent.id
  })

  const baseIssue = () => ({
    companyId,
    title: 'Fix login bug',
    status: 'open' as const,
    priority: 'medium' as const,
  })

  it('creates an issue with defaults', () => {
    const q = makeIssueQueries(db)
    const issue = q.create(baseIssue())
    expect(issue.id).toBeTruthy()
    expect(issue.title).toBe('Fix login bug')
    expect(issue.status).toBe('open')
    expect(issue.priority).toBe('medium')
    expect(issue.projectId).toBeNull()
    expect(issue.agentId).toBeNull()
  })

  it('creates an issue with all fields', () => {
    const q = makeIssueQueries(db)
    const issue = q.create({
      ...baseIssue(),
      agentId,
      projectId: 'proj-1',
      description: 'Details here',
      status: 'in_progress',
      priority: 'critical',
    })
    expect(issue.agentId).toBe(agentId)
    expect(issue.projectId).toBe('proj-1')
    expect(issue.status).toBe('in_progress')
    expect(issue.priority).toBe('critical')
  })

  it('lists issues by company', () => {
    const q = makeIssueQueries(db)
    q.create(baseIssue())
    q.create({ ...baseIssue(), title: 'Another issue' })
    expect(q.listByCompany(companyId).length).toBe(2)
  })

  it('lists only issues for the specified company', () => {
    const cq = makeCompanyQueries(db)
    const q = makeIssueQueries(db)
    const other = cq.create({ name: 'Other', status: 'active', budgetMonthlyCents: 0 })
    q.create(baseIssue())
    q.create({ companyId: other.id, title: 'Other issue', status: 'open', priority: 'low' })
    expect(q.listByCompany(companyId).length).toBe(1)
  })

  it('gets issue by id', () => {
    const q = makeIssueQueries(db)
    const created = q.create(baseIssue())
    const found = q.getById(created.id)
    expect(found).toBeDefined()
    expect(found!.title).toBe('Fix login bug')
  })

  it('updates an issue', () => {
    const q = makeIssueQueries(db)
    const issue = q.create(baseIssue())
    const updated = q.update(issue.id, { status: 'resolved', priority: 'high' })
    expect(updated!.status).toBe('resolved')
    expect(updated!.priority).toBe('high')
  })

  it('returns undefined when updating nonexistent issue', () => {
    const q = makeIssueQueries(db)
    expect(q.update('nope', { status: 'resolved' })).toBeUndefined()
  })

  it('returns unchanged issue when no update fields', () => {
    const q = makeIssueQueries(db)
    const issue = q.create(baseIssue())
    const result = q.update(issue.id, {})
    expect(result!.title).toBe('Fix login bug')
  })

  it('deletes an issue', () => {
    const q = makeIssueQueries(db)
    const issue = q.create(baseIssue())
    expect(q.delete(issue.id)).toBe(true)
    expect(q.getById(issue.id)).toBeUndefined()
  })

  it('returns false when deleting nonexistent issue', () => {
    const q = makeIssueQueries(db)
    expect(q.delete('nope')).toBe(false)
  })

  it('issues are cascade deleted when company is deleted', () => {
    const cq = makeCompanyQueries(db)
    const q = makeIssueQueries(db)
    const issue = q.create(baseIssue())
    cq.delete(companyId)
    expect(q.getById(issue.id)).toBeUndefined()
  })

  it('issue agentId becomes null when agent is deleted (SET NULL)', () => {
    const aq = makeAgentQueries(db)
    const q = makeIssueQueries(db)
    const issue = q.create({ ...baseIssue(), agentId })
    aq.delete(agentId)
    const found = q.getById(issue.id)
    expect(found).toBeDefined()
    expect(found!.agentId).toBeNull()
  })
})

// ─── Schema structure ─────────────────────────────────────────────────────────

describe('Schema structure', () => {
  it('creates all required tables', () => {
    const stmt = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    )
    const tables: string[] = []
    while (stmt.step()) {
      const row = stmt.getAsObject() as { name: string }
      tables.push(row.name)
    }
    stmt.free()
    expect(tables).toContain('companies')
    expect(tables).toContain('agents')
    expect(tables).toContain('routines')
    expect(tables).toContain('runs')
    expect(tables).toContain('issues')
  })

  it('empty db returns empty lists', () => {
    expect(makeCompanyQueries(db).list()).toEqual([])
    expect(makeAgentQueries(db).listByCompany('any')).toEqual([])
    expect(makeRoutineQueries(db).listByCompany('any')).toEqual([])
    expect(makeRunQueries(db).listByAgent('any')).toEqual([])
    expect(makeIssueQueries(db).listByCompany('any')).toEqual([])
  })
})
