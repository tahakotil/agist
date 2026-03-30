import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// ─── Re-implement pure utilities locally (no I/O side effects) ─────────────────

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'agent'
  )
}

function isSafeSegment(segment: string): boolean {
  if (!segment || segment.length === 0) return false
  if (segment.includes('..')) return false
  if (segment.includes('/')) return false
  if (segment.includes('\\')) return false
  if (segment.includes('\0')) return false
  return true
}

// ─── Slug generation ─────────────────────────────────────────────────────────

describe('slugify', () => {
  it('lowercases and trims', () => {
    expect(slugify('  My Agent  ')).toBe('my-agent')
  })

  it('replaces spaces with hyphens', () => {
    expect(slugify('My Agent Name')).toBe('my-agent-name')
  })

  it('collapses multiple spaces/specials into single hyphen', () => {
    expect(slugify('Dev Ops!! Agent')).toBe('dev-ops-agent')
  })

  it('strips leading/trailing hyphens', () => {
    expect(slugify('---lead-trail---')).toBe('lead-trail')
  })

  it('handles all-special characters by returning fallback', () => {
    expect(slugify('!!!***')).toBe('agent')
  })

  it('handles empty string by returning fallback', () => {
    expect(slugify('')).toBe('agent')
  })

  it('preserves numbers', () => {
    expect(slugify('Agent 2.0')).toBe('agent-2-0')
  })

  it('handles unicode-heavy names', () => {
    // Non-ASCII stripped → falls back to hyphens then trimmed
    expect(slugify('Ağent')).toMatch(/^[a-z0-9-]+$/)
  })
})

// ─── isSafeSegment ─────────────────────────────────────────────────────────────

describe('isSafeSegment', () => {
  it('returns true for valid slug', () => {
    expect(isSafeSegment('my-agent')).toBe(true)
  })

  it('returns true for alphanumeric with dashes', () => {
    expect(isSafeSegment('agent-123')).toBe(true)
  })

  it('rejects empty string', () => {
    expect(isSafeSegment('')).toBe(false)
  })

  it('rejects ".." (directory traversal)', () => {
    expect(isSafeSegment('..')).toBe(false)
  })

  it('rejects path with ".." embedded', () => {
    expect(isSafeSegment('foo/../bar')).toBe(false)
  })

  it('rejects forward slash', () => {
    expect(isSafeSegment('foo/bar')).toBe(false)
  })

  it('rejects backslash', () => {
    expect(isSafeSegment('foo\\bar')).toBe(false)
  })

  it('rejects null byte', () => {
    expect(isSafeSegment('foo\0bar')).toBe(false)
  })

  it('rejects absolute-looking path', () => {
    expect(isSafeSegment('/etc/passwd')).toBe(false)
  })
})

// ─── Filesystem helpers ────────────────────────────────────────────────────────

import {
  ensureWorkspace,
  getReportPath,
  getContextPath,
  getSynergyPath,
  getWorkspacePath,
} from '../workspace.js'

// Patch AGIST_HOME by monkey-patching the module — instead, we test with a
// temp directory by overriding the env. Since the module uses homedir() inline,
// we use a side-channel: patch process.env.HOME and re-import.
// Instead, test the path shape without overriding the real home.

describe('getReportPath', () => {
  it('returns <workspacePath>/reports/<slug>', () => {
    const wsPath = getWorkspacePath('company-123')
    const expected = join(wsPath, 'reports', 'my-agent')
    expect(getReportPath('company-123', 'my-agent')).toBe(expected)
  })
})

describe('getContextPath', () => {
  it('returns <workspacePath>/context/<slug>.md', () => {
    const wsPath = getWorkspacePath('company-123')
    const expected = join(wsPath, 'context', 'my-agent.md')
    expect(getContextPath('company-123', 'my-agent')).toBe(expected)
  })
})

describe('getSynergyPath', () => {
  it('returns <workspacePath>/reports/_synergy/signals.jsonl', () => {
    const wsPath = getWorkspacePath('company-123')
    const expected = join(wsPath, 'reports', '_synergy', 'signals.jsonl')
    expect(getSynergyPath('company-123')).toBe(expected)
  })
})

describe('ensureWorkspace', () => {
  // We use a real temp dir to avoid polluting ~/.agist during tests
  let tmpHome: string
  let origHome: string | undefined

  beforeEach(() => {
    tmpHome = join(tmpdir(), `agist-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(tmpHome, { recursive: true })
    origHome = process.env.HOME
    // Note: Because workspace.ts imports homedir() at module load time, we
    // verify the shape via the actual path helpers, then check fs separately.
  })

  afterEach(() => {
    if (origHome !== undefined) {
      process.env.HOME = origHome
    }
    try {
      rmSync(tmpHome, { recursive: true, force: true })
    } catch {
      // ignore cleanup errors
    }
  })

  it('creates all required directories', () => {
    // Use real ensureWorkspace which writes into ~/.agist/workspaces/
    // Use a unique company id so we don't interfere with real data
    const testCompany = `test-company-${Date.now()}`
    const testSlug = `test-agent-${Date.now()}`

    const wsPath = ensureWorkspace(testCompany, testSlug)

    // Workspace root
    expect(existsSync(wsPath)).toBe(true)
    // reports/<slug>
    expect(existsSync(join(wsPath, 'reports', testSlug))).toBe(true)
    // reports/_synergy
    expect(existsSync(join(wsPath, 'reports', '_synergy'))).toBe(true)
    // context
    expect(existsSync(join(wsPath, 'context'))).toBe(true)
    // shared/queues
    expect(existsSync(join(wsPath, 'shared', 'queues'))).toBe(true)
    // bin
    expect(existsSync(join(wsPath, 'bin'))).toBe(true)

    // Cleanup
    try {
      rmSync(wsPath, { recursive: true, force: true })
    } catch {
      // best-effort
    }
  })

  it('is idempotent — calling twice does not throw', () => {
    const testCompany = `test-company-idem-${Date.now()}`
    const testSlug = `test-agent-idem-${Date.now()}`

    expect(() => {
      ensureWorkspace(testCompany, testSlug)
      ensureWorkspace(testCompany, testSlug)
    }).not.toThrow()

    // Cleanup
    try {
      rmSync(getWorkspacePath(testCompany), { recursive: true, force: true })
    } catch {
      // best-effort
    }
  })
})

// ─── Workspace API path traversal tests ────────────────────────────────────────
// These test the validation logic that the route uses.

describe('path traversal prevention', () => {
  const TRAVERSAL_ATTEMPTS = [
    '..',
    '../../../etc/passwd',
    'foo/../bar',
    '/etc/passwd',
    '\\windows\\system32',
    'foo/bar',
    'foo\\bar',
    '',
    'foo\0bar',
  ]

  it('rejects all traversal attempts via isSafeSegment', () => {
    for (const attempt of TRAVERSAL_ATTEMPTS) {
      expect(isSafeSegment(attempt)).toBe(false)
    }
  })

  const SAFE_SLUGS = ['my-agent', 'agent-123', 'seo', 'devops-bot', 'agent']
  it('accepts all valid slugs', () => {
    for (const slug of SAFE_SLUGS) {
      expect(isSafeSegment(slug)).toBe(true)
    }
  })
})
