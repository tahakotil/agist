import { describe, it, expect } from 'vitest'
import {
  CreateCompanySchema,
  UpdateCompanySchema,
  CreateAgentSchema,
  UpdateAgentSchema,
  CreateRoutineSchema,
  UpdateRoutineSchema,
  CreateRunSchema,
  UpdateRunStatusSchema,
  CreateIssueSchema,
  UpdateIssueSchema,
  CompanyStatusSchema,
  AgentRoleSchema,
  AgentStatusSchema,
  RunStatusSchema,
  RunSourceSchema,
  IssuePrioritySchema,
  IssueStatusSchema,
} from '../validators.js'

// ─── CompanyStatus ────────────────────────────────────────────────────────────

describe('CompanyStatusSchema', () => {
  it('accepts valid statuses', () => {
    expect(CompanyStatusSchema.parse('active')).toBe('active')
    expect(CompanyStatusSchema.parse('paused')).toBe('paused')
    expect(CompanyStatusSchema.parse('archived')).toBe('archived')
  })

  it('rejects invalid status', () => {
    expect(() => CompanyStatusSchema.parse('unknown')).toThrow()
    expect(() => CompanyStatusSchema.parse('')).toThrow()
  })
})

// ─── CreateCompanySchema ──────────────────────────────────────────────────────

describe('CreateCompanySchema', () => {
  it('accepts minimal valid input', () => {
    const result = CreateCompanySchema.parse({ name: 'Acme' })
    expect(result.name).toBe('Acme')
    expect(result.status).toBe('active')
    expect(result.budgetMonthlyCents).toBe(0)
  })

  it('accepts full valid input', () => {
    const result = CreateCompanySchema.parse({
      name: 'Acme Corp',
      description: 'A company',
      status: 'paused',
      budgetMonthlyCents: 5000,
    })
    expect(result.name).toBe('Acme Corp')
    expect(result.description).toBe('A company')
    expect(result.status).toBe('paused')
    expect(result.budgetMonthlyCents).toBe(5000)
  })

  it('rejects empty name', () => {
    expect(() => CreateCompanySchema.parse({ name: '' })).toThrow()
  })

  it('rejects name over 255 chars', () => {
    expect(() => CreateCompanySchema.parse({ name: 'a'.repeat(256) })).toThrow()
  })

  it('rejects description over 2000 chars', () => {
    expect(() =>
      CreateCompanySchema.parse({ name: 'X', description: 'a'.repeat(2001) })
    ).toThrow()
  })

  it('rejects invalid status enum', () => {
    expect(() =>
      CreateCompanySchema.parse({ name: 'X', status: 'active_invalid' })
    ).toThrow()
  })

  it('rejects negative budget', () => {
    expect(() =>
      CreateCompanySchema.parse({ name: 'X', budgetMonthlyCents: -1 })
    ).toThrow()
  })

  it('rejects float budget', () => {
    expect(() =>
      CreateCompanySchema.parse({ name: 'X', budgetMonthlyCents: 10.5 })
    ).toThrow()
  })

  it('accepts null description', () => {
    const result = CreateCompanySchema.parse({ name: 'X', description: null })
    expect(result.description).toBeNull()
  })

  it('ignores extra fields (strips unknown)', () => {
    const result = CreateCompanySchema.parse({ name: 'X', extra: 'ignored' } as any)
    expect((result as any).extra).toBeUndefined()
  })
})

// ─── UpdateCompanySchema ──────────────────────────────────────────────────────

describe('UpdateCompanySchema', () => {
  it('accepts empty update', () => {
    const result = UpdateCompanySchema.parse({})
    expect(result).toEqual({})
  })

  it('accepts partial update', () => {
    const result = UpdateCompanySchema.parse({ name: 'New Name' })
    expect(result.name).toBe('New Name')
  })

  it('rejects empty name if provided', () => {
    expect(() => UpdateCompanySchema.parse({ name: '' })).toThrow()
  })

  it('accepts spentMonthlyCents', () => {
    const result = UpdateCompanySchema.parse({ spentMonthlyCents: 100 })
    expect(result.spentMonthlyCents).toBe(100)
  })

  it('rejects negative spentMonthlyCents', () => {
    expect(() => UpdateCompanySchema.parse({ spentMonthlyCents: -1 })).toThrow()
  })
})

// ─── AgentRole ────────────────────────────────────────────────────────────────

describe('AgentRoleSchema', () => {
  const validRoles = ['ceo', 'engineer', 'devops', 'marketing', 'seo', 'content', 'research', 'sales', 'general']
  it.each(validRoles)('accepts role "%s"', (role) => {
    expect(AgentRoleSchema.parse(role)).toBe(role)
  })

  it('rejects invalid role', () => {
    expect(() => AgentRoleSchema.parse('developer')).toThrow()
    expect(() => AgentRoleSchema.parse('')).toThrow()
  })
})

// ─── CreateAgentSchema ────────────────────────────────────────────────────────

describe('CreateAgentSchema', () => {
  const base = {
    companyId: 'company-123',
    name: 'Alice',
    role: 'engineer' as const,
    adapterType: 'claude-cli',
  }

  it('accepts minimal valid input', () => {
    const result = CreateAgentSchema.parse(base)
    expect(result.companyId).toBe('company-123')
    expect(result.name).toBe('Alice')
    expect(result.role).toBe('engineer')
    expect(result.status).toBe('idle')
    expect(result.budgetMonthlyCents).toBe(0)
    expect(result.adapterConfig).toEqual({})
  })

  it('accepts full valid input', () => {
    const result = CreateAgentSchema.parse({
      ...base,
      title: 'Lead Engineer',
      model: 'claude-sonnet-4-6',
      capabilities: 'coding, debugging',
      status: 'running',
      reportsTo: 'agent-456',
      adapterConfig: { key: 'value' },
      budgetMonthlyCents: 1000,
    })
    expect(result.title).toBe('Lead Engineer')
    expect(result.model).toBe('claude-sonnet-4-6')
    expect(result.capabilities).toBe('coding, debugging')
    expect(result.status).toBe('running')
    expect(result.reportsTo).toBe('agent-456')
  })

  it('rejects missing companyId', () => {
    const { companyId: _, ...rest } = base
    expect(() => CreateAgentSchema.parse(rest)).toThrow()
  })

  it('rejects empty companyId', () => {
    expect(() => CreateAgentSchema.parse({ ...base, companyId: '' })).toThrow()
  })

  it('rejects empty name', () => {
    expect(() => CreateAgentSchema.parse({ ...base, name: '' })).toThrow()
  })

  it('rejects name over 255 chars', () => {
    expect(() => CreateAgentSchema.parse({ ...base, name: 'a'.repeat(256) })).toThrow()
  })

  it('rejects invalid role', () => {
    expect(() => CreateAgentSchema.parse({ ...base, role: 'hacker' as any })).toThrow()
  })

  it('rejects invalid status', () => {
    expect(() => CreateAgentSchema.parse({ ...base, status: 'sleeping' as any })).toThrow()
  })

  it('rejects capabilities over 4000 chars', () => {
    expect(() =>
      CreateAgentSchema.parse({ ...base, capabilities: 'a'.repeat(4001) })
    ).toThrow()
  })

  it('rejects missing adapterType', () => {
    const { adapterType: _, ...rest } = base
    expect(() => CreateAgentSchema.parse(rest)).toThrow()
  })

  it('rejects negative budget', () => {
    expect(() =>
      CreateAgentSchema.parse({ ...base, budgetMonthlyCents: -100 })
    ).toThrow()
  })
})

// ─── UpdateAgentSchema ────────────────────────────────────────────────────────

describe('UpdateAgentSchema', () => {
  it('accepts empty update', () => {
    expect(UpdateAgentSchema.parse({})).toEqual({})
  })

  it('accepts status update', () => {
    const result = UpdateAgentSchema.parse({ status: 'paused' })
    expect(result.status).toBe('paused')
  })

  it('accepts adapterConfig update', () => {
    const result = UpdateAgentSchema.parse({ adapterConfig: { foo: 'bar' } })
    expect(result.adapterConfig).toEqual({ foo: 'bar' })
  })

  it('rejects invalid role', () => {
    expect(() => UpdateAgentSchema.parse({ role: 'wizard' as any })).toThrow()
  })
})

// ─── CreateRoutineSchema ──────────────────────────────────────────────────────

describe('CreateRoutineSchema', () => {
  const base = {
    companyId: 'c1',
    agentId: 'a1',
    title: 'Daily check',
    cronExpression: '0 9 * * *',
  }

  it('accepts minimal valid input', () => {
    const result = CreateRoutineSchema.parse(base)
    expect(result.title).toBe('Daily check')
    expect(result.timezone).toBe('UTC')
    expect(result.enabled).toBe(true)
  })

  it('accepts full input', () => {
    const result = CreateRoutineSchema.parse({
      ...base,
      description: 'Morning check',
      timezone: 'America/New_York',
      enabled: false,
    })
    expect(result.description).toBe('Morning check')
    expect(result.timezone).toBe('America/New_York')
    expect(result.enabled).toBe(false)
  })

  it('rejects empty companyId', () => {
    expect(() => CreateRoutineSchema.parse({ ...base, companyId: '' })).toThrow()
  })

  it('rejects empty agentId', () => {
    expect(() => CreateRoutineSchema.parse({ ...base, agentId: '' })).toThrow()
  })

  it('rejects empty title', () => {
    expect(() => CreateRoutineSchema.parse({ ...base, title: '' })).toThrow()
  })

  it('rejects empty cronExpression', () => {
    expect(() => CreateRoutineSchema.parse({ ...base, cronExpression: '' })).toThrow()
  })

  it('rejects description over 2000 chars', () => {
    expect(() =>
      CreateRoutineSchema.parse({ ...base, description: 'a'.repeat(2001) })
    ).toThrow()
  })
})

// ─── UpdateRoutineSchema ──────────────────────────────────────────────────────

describe('UpdateRoutineSchema', () => {
  it('accepts empty update', () => {
    expect(UpdateRoutineSchema.parse({})).toEqual({})
  })

  it('accepts enabled toggle', () => {
    const result = UpdateRoutineSchema.parse({ enabled: false })
    expect(result.enabled).toBe(false)
  })

  it('accepts lastRunAt null', () => {
    const result = UpdateRoutineSchema.parse({ lastRunAt: null })
    expect(result.lastRunAt).toBeNull()
  })

  it('rejects empty title if provided', () => {
    expect(() => UpdateRoutineSchema.parse({ title: '' })).toThrow()
  })
})

// ─── CreateRunSchema ──────────────────────────────────────────────────────────

describe('CreateRunSchema', () => {
  const base = {
    agentId: 'a1',
    companyId: 'c1',
    source: 'schedule' as const,
  }

  it('accepts minimal valid input', () => {
    const result = CreateRunSchema.parse(base)
    expect(result.agentId).toBe('a1')
    expect(result.companyId).toBe('c1')
    expect(result.source).toBe('schedule')
    expect(result.status).toBe('queued')
  })

  it('accepts manual source', () => {
    const result = CreateRunSchema.parse({ ...base, source: 'manual' })
    expect(result.source).toBe('manual')
  })

  it('accepts event source', () => {
    const result = CreateRunSchema.parse({ ...base, source: 'event' })
    expect(result.source).toBe('event')
  })

  it('rejects invalid source', () => {
    expect(() => CreateRunSchema.parse({ ...base, source: 'webhook' as any })).toThrow()
  })

  it('rejects empty agentId', () => {
    expect(() => CreateRunSchema.parse({ ...base, agentId: '' })).toThrow()
  })

  it('rejects invalid status', () => {
    expect(() => CreateRunSchema.parse({ ...base, status: 'started' as any })).toThrow()
  })
})

// ─── UpdateRunStatusSchema ────────────────────────────────────────────────────

describe('UpdateRunStatusSchema', () => {
  it('accepts minimal valid input', () => {
    const result = UpdateRunStatusSchema.parse({ status: 'succeeded' })
    expect(result.status).toBe('succeeded')
  })

  it('accepts full input', () => {
    const result = UpdateRunStatusSchema.parse({
      status: 'failed',
      finishedAt: '2024-01-01T00:00:00Z',
      exitCode: 1,
      error: 'Something failed',
      tokenInput: 1000,
      tokenOutput: 500,
      costCents: 3,
      logExcerpt: 'last log line',
    })
    expect(result.status).toBe('failed')
    expect(result.exitCode).toBe(1)
    expect(result.tokenInput).toBe(1000)
  })

  it('rejects invalid status', () => {
    expect(() => UpdateRunStatusSchema.parse({ status: 'done' as any })).toThrow()
  })

  it('rejects negative tokenInput', () => {
    expect(() =>
      UpdateRunStatusSchema.parse({ status: 'succeeded', tokenInput: -1 })
    ).toThrow()
  })

  it('rejects error over 4000 chars', () => {
    expect(() =>
      UpdateRunStatusSchema.parse({ status: 'failed', error: 'e'.repeat(4001) })
    ).toThrow()
  })

  it('rejects logExcerpt over 10000 chars', () => {
    expect(() =>
      UpdateRunStatusSchema.parse({ status: 'succeeded', logExcerpt: 'l'.repeat(10001) })
    ).toThrow()
  })
})

// ─── CreateIssueSchema ────────────────────────────────────────────────────────

describe('CreateIssueSchema', () => {
  const base = {
    companyId: 'c1',
    title: 'Bug found',
  }

  it('accepts minimal valid input', () => {
    const result = CreateIssueSchema.parse(base)
    expect(result.title).toBe('Bug found')
    expect(result.status).toBe('backlog')
    expect(result.priority).toBe('medium')
  })

  it('accepts full input', () => {
    const result = CreateIssueSchema.parse({
      ...base,
      agentId: 'a1',
      projectId: 'p1',
      description: 'Details here',
      status: 'in_progress',
      priority: 'critical',
    })
    expect(result.agentId).toBe('a1')
    expect(result.status).toBe('in_progress')
    expect(result.priority).toBe('critical')
  })

  it('rejects empty companyId', () => {
    expect(() => CreateIssueSchema.parse({ ...base, companyId: '' })).toThrow()
  })

  it('rejects empty title', () => {
    expect(() => CreateIssueSchema.parse({ ...base, title: '' })).toThrow()
  })

  it('rejects title over 500 chars', () => {
    expect(() => CreateIssueSchema.parse({ ...base, title: 'a'.repeat(501) })).toThrow()
  })

  it('rejects invalid priority', () => {
    expect(() => CreateIssueSchema.parse({ ...base, priority: 'urgent' as any })).toThrow()
  })

  it('rejects invalid status', () => {
    expect(() => CreateIssueSchema.parse({ ...base, status: 'closed' as any })).toThrow()
  })

  it('rejects description over 10000 chars', () => {
    expect(() =>
      CreateIssueSchema.parse({ ...base, description: 'd'.repeat(10001) })
    ).toThrow()
  })
})

// ─── UpdateIssueSchema ────────────────────────────────────────────────────────

describe('UpdateIssueSchema', () => {
  it('accepts empty update', () => {
    expect(UpdateIssueSchema.parse({})).toEqual({})
  })

  it('accepts status change', () => {
    const result = UpdateIssueSchema.parse({ status: 'done' })
    expect(result.status).toBe('done')
  })

  it('accepts priority change', () => {
    const result = UpdateIssueSchema.parse({ priority: 'high' })
    expect(result.priority).toBe('high')
  })

  it('rejects invalid status', () => {
    expect(() => UpdateIssueSchema.parse({ status: 'wontfix' as any })).toThrow()
  })

  it('rejects empty title if provided', () => {
    expect(() => UpdateIssueSchema.parse({ title: '' })).toThrow()
  })
})

// ─── Enum schemas (boundary tests) ───────────────────────────────────────────

describe('RunStatusSchema', () => {
  const statuses = ['queued', 'running', 'succeeded', 'failed', 'cancelled']
  it.each(statuses)('accepts "%s"', (s) => {
    expect(RunStatusSchema.parse(s)).toBe(s)
  })
  it('rejects unknown status', () => {
    expect(() => RunStatusSchema.parse('done')).toThrow()
  })
})

describe('RunSourceSchema', () => {
  it('accepts valid sources', () => {
    expect(RunSourceSchema.parse('schedule')).toBe('schedule')
    expect(RunSourceSchema.parse('manual')).toBe('manual')
    expect(RunSourceSchema.parse('event')).toBe('event')
  })
  it('rejects invalid source', () => {
    expect(() => RunSourceSchema.parse('webhook')).toThrow()
  })
})

describe('IssuePrioritySchema', () => {
  it.each(['critical', 'high', 'medium', 'low'])('accepts "%s"', (p) => {
    expect(IssuePrioritySchema.parse(p)).toBe(p)
  })
  it('rejects invalid priority', () => {
    expect(() => IssuePrioritySchema.parse('urgent')).toThrow()
  })
})

describe('IssueStatusSchema', () => {
  it.each(['backlog', 'todo', 'in_progress', 'in_review', 'done'])('accepts "%s"', (s) => {
    expect(IssueStatusSchema.parse(s)).toBe(s)
  })
  it('rejects invalid status', () => {
    expect(() => IssueStatusSchema.parse('closed')).toThrow()
  })
})

describe('AgentStatusSchema', () => {
  it.each(['idle', 'running', 'paused', 'error'])('accepts "%s"', (s) => {
    expect(AgentStatusSchema.parse(s)).toBe(s)
  })
  it('rejects unknown status', () => {
    expect(() => AgentStatusSchema.parse('sleeping')).toThrow()
  })
})
