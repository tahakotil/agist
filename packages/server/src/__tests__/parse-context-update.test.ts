/**
 * Unit tests for parseContextUpdate() — pure function, no mocks needed.
 */

import { describe, it, expect } from 'vitest'
import { parseContextUpdate } from '../adapter.js'

describe('parseContextUpdate()', () => {
  it('returns null when marker is absent', () => {
    expect(parseContextUpdate('hello world no marker here')).toBeNull()
  })

  it('returns null on empty string', () => {
    expect(parseContextUpdate('')).toBeNull()
  })

  it('extracts content between marker and closing fence', () => {
    const stdout = [
      'Some agent output here',
      '__agist_context_update__',
      'IDENTITY: Test Agent',
      'STATUS: running',
      '```',
      'trailing output',
    ].join('\n')
    const result = parseContextUpdate(stdout)
    expect(result).toBe('IDENTITY: Test Agent\nSTATUS: running')
  })

  it('falls back to remainder (up to 5000 chars) when no closing fence', () => {
    const stdout = '__agist_context_update__\nIDENTITY: Fallback Agent\nSTATUS: ok'
    const result = parseContextUpdate(stdout)
    expect(result).toBe('IDENTITY: Fallback Agent\nSTATUS: ok')
  })

  it('returns null when content after marker is empty (only fence follows)', () => {
    const stdout = 'before\n__agist_context_update__\n```\nafter'
    const result = parseContextUpdate(stdout)
    expect(result).toBeNull()
  })

  it('returns null when marker is followed only by whitespace then fence', () => {
    const stdout = '__agist_context_update__\n   \n```'
    const result = parseContextUpdate(stdout)
    expect(result).toBeNull()
  })

  it('truncates fallback content to 5000 chars', () => {
    const longContent = 'x'.repeat(6000)
    const stdout = `__agist_context_update__\n${longContent}`
    const result = parseContextUpdate(stdout)
    expect(result?.length).toBeLessThanOrEqual(5000)
  })

  it('handles marker with multi-line capsule content', () => {
    const capsule = 'IDENTITY: Atlas\nROLE: ceo\nFOCUS: Q2 goals\n- grow ARR\n- ship enterprise tier'
    const stdout = `Some output\n__agist_context_update__\n${capsule}\n\`\`\``
    const result = parseContextUpdate(stdout)
    expect(result).toBe(capsule)
  })

  it('handles marker appearing mid-line (should still parse from marker position)', () => {
    const stdout = 'prefix__agist_context_update__\ncontents\n```'
    const result = parseContextUpdate(stdout)
    expect(result).toBe('contents')
  })
})
