/**
 * Tests for Company Templates (Import/Export)
 *
 * Covers:
 * - GET /api/companies/:cid/export — format, field mapping, sensitive data scrubbing
 * - POST /api/companies/import — valid template, invalid version, empty agents, reports_to resolution
 * - Round-trip: export → import → export → compare (should match except IDs)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'
import { createTestDb, setActiveDb, createDbMock } from './db-mock.js'

interface AgistTemplate {
  version: '1.0';
  name: string;
  description: string;
  author?: string;
  url?: string;
  company: { name: string; description?: string; budget_monthly_cents?: number };
  agents: Array<{
    slug: string; name: string; role: string; title?: string; model: string;
    capabilities?: string; reports_to?: string; budget_monthly_cents?: number; context_capsule?: string;
  }>;
  routines: Array<{
    agent_slug: string; title: string; cron_expression: string; timezone?: string;
  }>;
}

vi.mock('../db.js', () => createDbMock())
vi.mock('../sse.js', () => ({ broadcast: () => {}, subscribe: () => () => {} }))
vi.mock('../ws.js', () => ({
  pushToAgent: () => {},
  initWebSocketServer: () => {},
  handleUpgrade: () => {},
}))
vi.mock('../adapter.js', () => ({
  spawnClaudeLocal: vi.fn(async () => {}),
}))

async function buildApp() {
  const { companiesRouter } = await import('../routes/companies.js')
  const { agentsRouter } = await import('../routes/agents.js')
  const { routinesRouter } = await import('../routes/routines.js')
  const { templatesRouter } = await import('../routes/templates.js')
  const app = new Hono()
  app.use('*', async (c, next) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = c as any
    ctx.set('role', 'admin')
    ctx.set('apiKeyId', 'test-key')
    return next()
  })
  app.route('/', companiesRouter)
  app.route('/', agentsRouter)
  app.route('/', routinesRouter)
  app.route('/', templatesRouter)
  app.onError((err, c) => c.json({ error: err.message }, 500))
  return app
}

function json<T = Record<string, unknown>>(res: Response): Promise<T> {
  return res.json() as Promise<T>
}

async function createCompany(app: Hono, name = 'Test Corp', description = '') {
  const res = await app.request('/api/companies', {
    method: 'POST',
    body: JSON.stringify({ name, description }),
    headers: { 'Content-Type': 'application/json' },
  })
  const body = await json(res)
  return (body as Record<string, Record<string, string>>).company.id
}

async function createAgent(
  app: Hono,
  companyId: string,
  data: {
    name: string
    role?: string
    title?: string
    model?: string
    reportsTo?: string | null
    capabilities?: string[]
    budgetMonthlyCents?: number
  }
) {
  const res = await app.request(`/api/companies/${companyId}/agents`, {
    method: 'POST',
    body: JSON.stringify(data),
    headers: { 'Content-Type': 'application/json' },
  })
  const body = await json(res)
  return (body as Record<string, Record<string, string>>).agent
}

async function createRoutine(
  app: Hono,
  companyId: string,
  agentId: string,
  title: string,
  cronExpression: string,
  timezone = 'UTC'
) {
  const res = await app.request(`/api/companies/${companyId}/routines`, {
    method: 'POST',
    body: JSON.stringify({ agentId, title, cronExpression, timezone }),
    headers: { 'Content-Type': 'application/json' },
  })
  const body = await json(res)
  return (body as Record<string, Record<string, string>>).routine
}

// ── Export tests ────────────────────────────────────────────────────────────────

describe('Template Export — GET /api/companies/:cid/export', () => {
  let app: Hono

  beforeEach(async () => {
    const db = await createTestDb()
    setActiveDb(db)
    app = await buildApp()
  })

  it('returns 404 for unknown company', async () => {
    const res = await app.request('/api/companies/nonexistent-id/export')
    expect(res.status).toBe(404)
  })

  it('exports a company with correct template format', async () => {
    const cid = await createCompany(app, 'Acme Corp', 'Test company')
    const res = await app.request(`/api/companies/${cid}/export`)
    expect(res.status).toBe(200)

    const tpl = await json<AgistTemplate>(res)
    expect(tpl.version).toBe('1.0')
    expect(tpl.company.name).toBe('Acme Corp')
    expect(tpl.company.description).toBe('Test company')
    expect(Array.isArray(tpl.agents)).toBe(true)
    expect(Array.isArray(tpl.routines)).toBe(true)
  })

  it('exports agents with correct field mapping', async () => {
    const cid = await createCompany(app, 'Agents Corp')
    await createAgent(app, cid, {
      name: 'DevOps Bot',
      role: 'devops',
      title: 'Infrastructure Engineer',
      model: 'claude-haiku-4-5',
      capabilities: ['monitoring', 'alerting'],
    })

    const res = await app.request(`/api/companies/${cid}/export`)
    const tpl = await json<AgistTemplate>(res)

    expect(tpl.agents).toHaveLength(1)
    const agent = tpl.agents[0]
    expect(agent.name).toBe('DevOps Bot')
    expect(agent.role).toBe('devops')
    expect(agent.title).toBe('Infrastructure Engineer')
    expect(agent.model).toBe('claude-haiku-4-5')
    expect(agent.slug).toBe('devops-bot')
    // capabilities should be a comma-joined string
    expect(agent.capabilities).toContain('monitoring')
    expect(agent.capabilities).toContain('alerting')
  })

  it('exports reports_to as slug (not ID)', async () => {
    const cid = await createCompany(app, 'Hierarchy Corp')
    const ceo = await createAgent(app, cid, { name: 'CEO Agent', role: 'ceo' })
    await createAgent(app, cid, {
      name: 'Engineer Bot',
      role: 'engineer',
      reportsTo: ceo.id,
    })

    const res = await app.request(`/api/companies/${cid}/export`)
    const tpl = await json<AgistTemplate>(res)

    const engineer = tpl.agents.find((a) => a.name === 'Engineer Bot')
    expect(engineer).toBeDefined()
    expect(engineer!.reports_to).toBe('ceo-agent')
    // Should NOT be the raw ID
    expect(engineer!.reports_to).not.toBe(ceo.id)
  })

  it('exports routines with correct field mapping', async () => {
    const cid = await createCompany(app, 'Routines Corp')
    const agent = await createAgent(app, cid, { name: 'Watcher', role: 'devops' })
    await createRoutine(app, cid, agent.id, 'Health Check', '*/5 * * * *', 'UTC')

    const res = await app.request(`/api/companies/${cid}/export`)
    const tpl = await json<AgistTemplate>(res)

    expect(tpl.routines).toHaveLength(1)
    const routine = tpl.routines[0]
    expect(routine.title).toBe('Health Check')
    expect(routine.cron_expression).toBe('*/5 * * * *')
    expect(routine.agent_slug).toBe('watcher')
  })

  it('scrubs IP addresses from context_capsule', async () => {
    const cid = await createCompany(app, 'Scrub Corp')
    const agent = await createAgent(app, cid, { name: 'Sensitive Bot', role: 'devops' })

    // Set context capsule with IP addresses
    await app.request(`/api/agents/${agent.id}/context`, {
      method: 'PUT',
      body: JSON.stringify({ capsule: 'Server at 192.168.1.100 and 10.0.0.1 is running' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await app.request(`/api/companies/${cid}/export`)
    const tpl = await json<AgistTemplate>(res)

    const exported = tpl.agents[0]
    expect(exported.context_capsule).not.toContain('192.168.1.100')
    expect(exported.context_capsule).not.toContain('10.0.0.1')
    expect(exported.context_capsule).toContain('[REDACTED_IP]')
  })

  it('scrubs secret tokens from context_capsule', async () => {
    const cid = await createCompany(app, 'Secret Corp')
    const agent = await createAgent(app, cid, { name: 'Secret Bot', role: 'devops' })

    await app.request(`/api/agents/${agent.id}/context`, {
      method: 'PUT',
      body: JSON.stringify({ capsule: 'Connect using api_key=sk-abc123xyz and token=Bearer:eyJhbGc' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await app.request(`/api/companies/${cid}/export`)
    const tpl = await json<AgistTemplate>(res)

    const exported = tpl.agents[0]
    expect(exported.context_capsule).not.toContain('sk-abc123xyz')
    expect(exported.context_capsule).toContain('[REDACTED]')
  })

  it('sets Content-Disposition header for file download', async () => {
    const cid = await createCompany(app, 'Download Corp')
    const res = await app.request(`/api/companies/${cid}/export`)
    const disposition = res.headers.get('Content-Disposition')
    expect(disposition).toBeTruthy()
    expect(disposition).toContain('attachment')
    expect(disposition).toContain('.json')
  })

  it('exports empty agents and routines arrays for company with no agents', async () => {
    const cid = await createCompany(app, 'Empty Corp')
    const res = await app.request(`/api/companies/${cid}/export`)
    const tpl = await json<AgistTemplate>(res)

    expect(tpl.agents).toHaveLength(0)
    expect(tpl.routines).toHaveLength(0)
  })
})

// ── Import tests ────────────────────────────────────────────────────────────────

describe('Template Import — POST /api/companies/import', () => {
  let app: Hono

  beforeEach(async () => {
    const db = await createTestDb()
    setActiveDb(db)
    app = await buildApp()
  })

  const validTemplate: AgistTemplate = {
    version: '1.0',
    name: 'Test Import Template',
    description: 'A test template',
    company: {
      name: 'Imported Corp',
      description: 'Imported company',
      budget_monthly_cents: 1000,
    },
    agents: [
      {
        slug: 'leader',
        name: 'Leader Agent',
        role: 'ceo',
        title: 'CEO',
        model: 'claude-opus-4-5',
        capabilities: 'strategy, planning',
      },
      {
        slug: 'worker',
        name: 'Worker Agent',
        role: 'engineer',
        model: 'claude-haiku-4-5',
        reports_to: 'leader',
      },
    ],
    routines: [
      {
        agent_slug: 'worker',
        title: 'Daily Task',
        cron_expression: '0 9 * * 1-5',
        timezone: 'UTC',
      },
    ],
  }

  async function importTemplate(template: unknown) {
    return app.request('/api/companies/import', {
      method: 'POST',
      body: JSON.stringify(template),
      headers: { 'Content-Type': 'application/json' },
    })
  }

  it('returns 201 with companyId on valid template', async () => {
    const res = await importTemplate(validTemplate)
    expect(res.status).toBe(201)
    const body = await json(res)
    expect(typeof body.companyId).toBe('string')
    expect((body.companyId as string).length).toBeGreaterThan(0)
  })

  it('creates company in database with correct name', async () => {
    const res = await importTemplate(validTemplate)
    const { companyId } = await json(res)

    const getRes = await app.request(`/api/companies/${companyId}`)
    expect(getRes.status).toBe(200)
    const { company } = await json<{ company: { name: string; description: string } }>(getRes)
    expect(company.name).toBe('Imported Corp')
    expect(company.description).toBe('Imported company')
  })

  it('creates all agents in database', async () => {
    const res = await importTemplate(validTemplate)
    const { companyId } = await json(res)

    const agentsRes = await app.request(`/api/companies/${companyId}/agents`)
    const { agents } = await json<{ agents: Array<{ name: string }> }>(agentsRes)
    expect(agents).toHaveLength(2)
    const names = agents.map((a) => a.name)
    expect(names).toContain('Leader Agent')
    expect(names).toContain('Worker Agent')
  })

  it('resolves reports_to slug to agent ID', async () => {
    const res = await importTemplate(validTemplate)
    const { companyId } = await json(res)

    const agentsRes = await app.request(`/api/companies/${companyId}/agents`)
    const { agents } = await json<{ agents: Array<{ name: string; reportsTo: string | null; id: string }> }>(agentsRes)

    const leader = agents.find((a) => a.name === 'Leader Agent')
    const worker = agents.find((a) => a.name === 'Worker Agent')

    expect(leader).toBeDefined()
    expect(worker).toBeDefined()
    expect(worker!.reportsTo).toBe(leader!.id)
  })

  it('creates routines as disabled by default', async () => {
    const res = await importTemplate(validTemplate)
    const { companyId } = await json(res)

    const routinesRes = await app.request(`/api/companies/${companyId}/routines`)
    const { routines } = await json<{ routines: Array<{ title: string; enabled: boolean }> }>(routinesRes)
    expect(routines).toHaveLength(1)
    expect(routines[0].enabled).toBe(false)
    expect(routines[0].title).toBe('Daily Task')
  })

  it('returns 400 for invalid JSON', async () => {
    const res = await app.request('/api/companies/import', {
      method: 'POST',
      body: '{ not valid json }',
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 for wrong version', async () => {
    const res = await importTemplate({ ...validTemplate, version: '2.0' })
    expect(res.status).toBe(400)
    const body = await json(res)
    expect((body.error as string)).toContain('version')
  })

  it('returns 400 for missing company.name', async () => {
    const res = await importTemplate({
      ...validTemplate,
      company: { description: 'no name here' },
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when agents is not an array', async () => {
    const res = await importTemplate({ ...validTemplate, agents: 'not-an-array' })
    expect(res.status).toBe(400)
    const body = await json(res)
    expect((body.error as string)).toContain('agents')
  })

  it('imports template with empty agents array', async () => {
    const templateNoAgents: AgistTemplate = {
      ...validTemplate,
      agents: [],
      routines: [],
    }
    const res = await importTemplate(templateNoAgents)
    expect(res.status).toBe(201)

    const { companyId } = await json(res)
    const agentsRes = await app.request(`/api/companies/${companyId}/agents`)
    const { agents } = await json<{ agents: unknown[] }>(agentsRes)
    expect(agents).toHaveLength(0)
  })

  it('skips routines whose agent_slug does not exist in template', async () => {
    const templateBadRoutine: AgistTemplate = {
      ...validTemplate,
      routines: [
        {
          agent_slug: 'nonexistent-slug',
          title: 'Ghost Routine',
          cron_expression: '0 * * * *',
        },
      ],
    }
    const res = await importTemplate(templateBadRoutine)
    expect(res.status).toBe(201)

    const { companyId } = await json(res)
    const routinesRes = await app.request(`/api/companies/${companyId}/routines`)
    const { routines } = await json<{ routines: unknown[] }>(routinesRes)
    expect(routines).toHaveLength(0)
  })

  it('imports budget_monthly_cents on company', async () => {
    const res = await importTemplate(validTemplate)
    const { companyId } = await json(res)

    const getRes = await app.request(`/api/companies/${companyId}`)
    const { company } = await json<{ company: { budgetMonthlyCents: number } }>(getRes)
    expect(company.budgetMonthlyCents).toBe(1000)
  })
})

// ── Round-trip tests ────────────────────────────────────────────────────────────

describe('Template Round-Trip — export → import → export', () => {
  let app: Hono

  beforeEach(async () => {
    const db = await createTestDb()
    setActiveDb(db)
    app = await buildApp()
  })

  it('agent names and roles survive a round-trip', async () => {
    // Set up original company
    const cid = await createCompany(app, 'Round Trip Corp', 'Original description')
    const ceo = await createAgent(app, cid, { name: 'CEO Agent', role: 'ceo', model: 'claude-opus-4-5' })
    await createAgent(app, cid, { name: 'Engineer', role: 'engineer', reportsTo: ceo.id })
    await createRoutine(app, cid, ceo.id, 'Weekly Review', '0 9 * * 1')

    // Export
    const exportRes = await app.request(`/api/companies/${cid}/export`)
    expect(exportRes.status).toBe(200)
    const template = await json<AgistTemplate>(exportRes)

    // Import
    const importRes = await app.request('/api/companies/import', {
      method: 'POST',
      body: JSON.stringify(template),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(importRes.status).toBe(201)
    const { companyId: newCid } = await json(importRes)

    // Export again
    const reExportRes = await app.request(`/api/companies/${newCid}/export`)
    expect(reExportRes.status).toBe(200)
    const template2 = await json<AgistTemplate>(reExportRes)

    // Structural comparison (IDs will differ but names/roles should match)
    expect(template2.company.name).toBe(template.company.name)
    expect(template2.agents).toHaveLength(template.agents.length)
    expect(template2.routines).toHaveLength(template.routines.length)

    const agentNames1 = template.agents.map((a) => a.name).sort()
    const agentNames2 = template2.agents.map((a) => a.name).sort()
    expect(agentNames1).toEqual(agentNames2)

    const agentRoles1 = template.agents.map((a) => a.role).sort()
    const agentRoles2 = template2.agents.map((a) => a.role).sort()
    expect(agentRoles1).toEqual(agentRoles2)

    const routineTitles1 = template.routines.map((r) => r.title).sort()
    const routineTitles2 = template2.routines.map((r) => r.title).sort()
    expect(routineTitles1).toEqual(routineTitles2)
  })

  it('reports_to hierarchy is preserved through round-trip', async () => {
    const cid = await createCompany(app, 'Hierarchy Corp')
    const ceo = await createAgent(app, cid, { name: 'CEO', role: 'ceo' })
    const manager = await createAgent(app, cid, { name: 'Manager', role: 'general', reportsTo: ceo.id })
    await createAgent(app, cid, { name: 'Worker', role: 'engineer', reportsTo: manager.id })

    // Export
    const exportRes = await app.request(`/api/companies/${cid}/export`)
    const template = await json<AgistTemplate>(exportRes)

    // Check exported hierarchy using slugs
    const exportedManager = template.agents.find((a) => a.name === 'Manager')
    const exportedWorker = template.agents.find((a) => a.name === 'Worker')
    expect(exportedManager!.reports_to).toBe('ceo')
    expect(exportedWorker!.reports_to).toBe('manager')

    // Import
    const importRes = await app.request('/api/companies/import', {
      method: 'POST',
      body: JSON.stringify(template),
      headers: { 'Content-Type': 'application/json' },
    })
    const { companyId: newCid } = await json(importRes)

    // Check resolved IDs in imported company
    const agentsRes = await app.request(`/api/companies/${newCid}/agents`)
    const { agents } = await json<{
      agents: Array<{ name: string; reportsTo: string | null; id: string }>
    }>(agentsRes)

    const newCeo = agents.find((a) => a.name === 'CEO')
    const newManager = agents.find((a) => a.name === 'Manager')
    const newWorker = agents.find((a) => a.name === 'Worker')

    expect(newManager!.reportsTo).toBe(newCeo!.id)
    expect(newWorker!.reportsTo).toBe(newManager!.id)
  })
})
