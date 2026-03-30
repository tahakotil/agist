import { mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const AGIST_HOME = join(homedir(), '.agist')

export function getWorkspacePath(companyId: string): string {
  return join(AGIST_HOME, 'workspaces', companyId)
}

export function ensureWorkspace(companyId: string, agentSlug: string): string {
  const wsPath = getWorkspacePath(companyId)
  const dirs = [
    join(wsPath, 'reports', agentSlug),
    join(wsPath, 'reports', '_synergy'),
    join(wsPath, 'context'),
    join(wsPath, 'shared', 'queues'),
    join(wsPath, 'bin'),
  ]
  for (const dir of dirs) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }
  return wsPath
}

export function getReportPath(companyId: string, agentSlug: string): string {
  return join(getWorkspacePath(companyId), 'reports', agentSlug)
}

export function getContextPath(companyId: string, agentSlug: string): string {
  return join(getWorkspacePath(companyId), 'context', `${agentSlug}.md`)
}

export function getSynergyPath(companyId: string): string {
  return join(getWorkspacePath(companyId), 'reports', '_synergy', 'signals.jsonl')
}

/**
 * Generate a URL-safe slug from an agent name.
 * "My Agent Name" => "my-agent-name"
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'agent'
}

/**
 * Validate a slug/filename segment to prevent path traversal.
 * Returns false if it contains "..", "/", "\\", or is empty.
 */
export function isSafeSegment(segment: string): boolean {
  if (!segment || segment.length === 0) return false
  if (segment.includes('..')) return false
  if (segment.includes('/')) return false
  if (segment.includes('\\')) return false
  if (segment.includes('\0')) return false
  return true
}

export interface ReportDirEntry {
  slug: string
  fileCount: number
}

export interface ReportFileEntry {
  name: string
  size: number
  modifiedAt: string
}

/**
 * List all agent report directories for a company.
 */
export function listReportDirs(companyId: string): ReportDirEntry[] {
  const reportsRoot = join(getWorkspacePath(companyId), 'reports')
  if (!existsSync(reportsRoot)) return []

  const entries = readdirSync(reportsRoot, { withFileTypes: true })
  return entries
    .filter((e) => e.isDirectory() && e.name !== '_synergy')
    .map((e) => {
      const dirPath = join(reportsRoot, e.name)
      let fileCount = 0
      try {
        fileCount = readdirSync(dirPath).length
      } catch {
        // ignore
      }
      return { slug: e.name, fileCount }
    })
}

/**
 * List files in a specific agent's report directory.
 */
export function listReportFiles(companyId: string, agentSlug: string): ReportFileEntry[] {
  const reportPath = getReportPath(companyId, agentSlug)
  if (!existsSync(reportPath)) return []

  const entries = readdirSync(reportPath, { withFileTypes: true })
  return entries
    .filter((e) => e.isFile())
    .map((e) => {
      const filePath = join(reportPath, e.name)
      let size = 0
      let modifiedAt = new Date().toISOString()
      try {
        const stat = statSync(filePath)
        size = stat.size
        modifiedAt = stat.mtime.toISOString()
      } catch {
        // ignore
      }
      return { name: e.name, size, modifiedAt }
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
}

/**
 * Read a specific report file.
 */
export function readReportFile(companyId: string, agentSlug: string, filename: string): string {
  const filePath = join(getReportPath(companyId, agentSlug), filename)
  return readFileSync(filePath, 'utf-8')
}

/**
 * Read the last N lines of the synergy signals file.
 */
export function readSynergySignals(companyId: string, maxLines = 50): string[] {
  const synergyPath = getSynergyPath(companyId)
  if (!existsSync(synergyPath)) return []

  const content = readFileSync(synergyPath, 'utf-8')
  const lines = content.split('\n').filter((l) => l.trim())
  return lines.slice(-maxLines)
}

/**
 * Read context capsule for an agent.
 */
export function readContextCapsule(companyId: string, agentSlug: string): string {
  const ctxPath = getContextPath(companyId, agentSlug)
  if (!existsSync(ctxPath)) return ''
  return readFileSync(ctxPath, 'utf-8')
}

/**
 * Write/update context capsule for an agent.
 */
export function writeContextCapsule(companyId: string, agentSlug: string, content: string): void {
  ensureWorkspace(companyId, agentSlug)
  const ctxPath = getContextPath(companyId, agentSlug)
  writeFileSync(ctxPath, content, 'utf-8')
}
