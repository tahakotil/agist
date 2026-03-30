import { Hono, type Context } from 'hono'
import { get } from '../db.js'
import {
  isSafeSegment,
  listReportDirs,
  listReportFiles,
  readReportFile,
  readSynergySignals,
  readContextCapsule,
  writeContextCapsule,
  getReportPath,
} from '../workspace.js'
import { existsSync } from 'fs'

export const workspaceRouter = new Hono()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateCompany(c: Context<any, any>, companyId: string) {
  const company = get(`SELECT id FROM companies WHERE id = ?`, [companyId])
  return company ? null : c.json({ error: 'Company not found' }, 404)
}

// GET /api/companies/:cid/workspace/reports — list all agent report dirs
workspaceRouter.get('/api/companies/:cid/workspace/reports', (c) => {
  const companyId = c.req.param('cid')
  const notFound = validateCompany(c, companyId)
  if (notFound) return notFound

  const dirs = listReportDirs(companyId)
  return c.json({ reports: dirs })
})

// GET /api/companies/:cid/workspace/reports/:agentSlug — list files in agent report dir
workspaceRouter.get('/api/companies/:cid/workspace/reports/:agentSlug', (c) => {
  const companyId = c.req.param('cid')
  const agentSlug = c.req.param('agentSlug')

  const notFound = validateCompany(c, companyId)
  if (notFound) return notFound

  if (!isSafeSegment(agentSlug)) {
    return c.json({ error: 'Invalid agent slug' }, 400)
  }

  const files = listReportFiles(companyId, agentSlug)
  return c.json({ agentSlug, files })
})

// GET /api/companies/:cid/workspace/reports/:agentSlug/:filename — read a report file
workspaceRouter.get('/api/companies/:cid/workspace/reports/:agentSlug/:filename', (c) => {
  const companyId = c.req.param('cid')
  const agentSlug = c.req.param('agentSlug')
  const filename = c.req.param('filename')

  const notFound = validateCompany(c, companyId)
  if (notFound) return notFound

  if (!isSafeSegment(agentSlug)) {
    return c.json({ error: 'Invalid agent slug' }, 400)
  }
  if (!isSafeSegment(filename)) {
    return c.json({ error: 'Invalid filename' }, 400)
  }

  const reportPath = getReportPath(companyId, agentSlug)
  const filePath = `${reportPath}/${filename}`

  if (!existsSync(filePath)) {
    return c.json({ error: 'File not found' }, 404)
  }

  let content: string
  try {
    content = readReportFile(companyId, agentSlug, filename)
  } catch {
    return c.json({ error: 'Failed to read file' }, 500)
  }

  return c.json({ agentSlug, filename, content })
})

// GET /api/companies/:cid/workspace/synergy — read synergy signals (last 50 lines)
workspaceRouter.get('/api/companies/:cid/workspace/synergy', (c) => {
  const companyId = c.req.param('cid')

  const notFound = validateCompany(c, companyId)
  if (notFound) return notFound

  const lines = readSynergySignals(companyId, 50)
  const signals = lines.map((line) => {
    try {
      return JSON.parse(line) as unknown
    } catch {
      return { raw: line }
    }
  })

  return c.json({ signals })
})

// GET /api/companies/:cid/workspace/context/:agentSlug — read context capsule
workspaceRouter.get('/api/companies/:cid/workspace/context/:agentSlug', (c) => {
  const companyId = c.req.param('cid')
  const agentSlug = c.req.param('agentSlug')

  const notFound = validateCompany(c, companyId)
  if (notFound) return notFound

  if (!isSafeSegment(agentSlug)) {
    return c.json({ error: 'Invalid agent slug' }, 400)
  }

  const content = readContextCapsule(companyId, agentSlug)
  return c.json({ agentSlug, content })
})

// PUT /api/companies/:cid/workspace/context/:agentSlug — update context capsule
workspaceRouter.put('/api/companies/:cid/workspace/context/:agentSlug', async (c) => {
  const companyId = c.req.param('cid')
  const agentSlug = c.req.param('agentSlug')

  const notFound = validateCompany(c, companyId)
  if (notFound) return notFound

  if (!isSafeSegment(agentSlug)) {
    return c.json({ error: 'Invalid agent slug' }, 400)
  }

  let body: { content?: string }
  try {
    body = await c.req.json() as { content?: string }
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (typeof body.content !== 'string') {
    return c.json({ error: 'content (string) is required' }, 400)
  }

  try {
    writeContextCapsule(companyId, agentSlug, body.content)
  } catch {
    return c.json({ error: 'Failed to write context capsule' }, 500)
  }

  return c.json({ agentSlug, updated: true })
})
