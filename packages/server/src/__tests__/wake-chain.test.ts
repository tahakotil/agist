import { describe, it, expect } from 'vitest'
import { parseWakeChains } from '../adapter.js'

describe('parseWakeChains', () => {
  it('parses a single valid __agist_wake marker', () => {
    const output = 'Some agent output\n{"__agist_wake": {"target_agent_slug": "seo-agent", "reason": "SEO analysis needed"}}\nMore output'
    const chains = parseWakeChains(output)
    expect(chains).toHaveLength(1)
    expect(chains[0].target_agent_slug).toBe('seo-agent')
    expect(chains[0].reason).toBe('SEO analysis needed')
  })

  it('parses multiple __agist_wake markers', () => {
    const output = [
      '{"__agist_wake": {"target_agent_slug": "seo-agent", "reason": "SEO needed"}}',
      '{"__agist_wake": {"target_agent_slug": "content-writer", "reason": "Write blog post"}}',
    ].join('\n')
    const chains = parseWakeChains(output)
    expect(chains).toHaveLength(2)
    expect(chains[0].target_agent_slug).toBe('seo-agent')
    expect(chains[1].target_agent_slug).toBe('content-writer')
  })

  it('parses optional fields priority and context', () => {
    const output = '{"__agist_wake": {"target_agent_slug": "deploy-agent", "reason": "Deploy needed", "priority": "high", "context": "staging passed"}}'
    const chains = parseWakeChains(output)
    expect(chains).toHaveLength(1)
    expect(chains[0].priority).toBe('high')
    expect(chains[0].context).toBe('staging passed')
  })

  it('returns empty array when no markers found', () => {
    const output = 'Regular agent output with no wake markers'
    const chains = parseWakeChains(output)
    expect(chains).toHaveLength(0)
  })

  it('returns empty array for empty string', () => {
    expect(parseWakeChains('')).toHaveLength(0)
  })

  it('skips malformed JSON', () => {
    const output = '{"__agist_wake": {broken json here}}'
    const chains = parseWakeChains(output)
    // Malformed — WAKE_CHAIN_REGEX won't match because it requires valid-ish structure
    // Even if regex matches, JSON.parse would fail and it gets skipped
    expect(chains).toHaveLength(0)
  })

  it('skips entries missing target_agent_slug', () => {
    const output = '{"__agist_wake": {"reason": "no slug here"}}'
    const chains = parseWakeChains(output)
    expect(chains).toHaveLength(0)
  })

  it('handles whitespace around JSON', () => {
    const output = 'text {"__agist_wake": {"target_agent_slug": "my-agent", "reason": "test"}} text'
    const chains = parseWakeChains(output)
    expect(chains).toHaveLength(1)
    expect(chains[0].target_agent_slug).toBe('my-agent')
  })

  it('trims target_agent_slug whitespace', () => {
    const output = '{"__agist_wake": {"target_agent_slug": "  my-agent  ", "reason": "test"}}'
    const chains = parseWakeChains(output)
    expect(chains).toHaveLength(1)
    expect(chains[0].target_agent_slug).toBe('my-agent')
  })
})
