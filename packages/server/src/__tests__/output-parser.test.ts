import { describe, it, expect } from 'vitest'
import {
  parseAgentOutputs,
  isAgentReport,
  classifyReport,
} from '../output-parser.js'

// ─── isAgentReport ────────────────────────────────────────────────────────────

describe('isAgentReport', () => {
  it('returns true for a health report with checks', () => {
    const obj = { status: 'PASS', checks: [], timestamp: '2024-01-01' }
    expect(isAgentReport(obj)).toBe(true)
  })

  it('returns true for an analytics report with metrics', () => {
    const obj = { metrics: { pageviews: 1000 }, timestamp: '2024-01-01', source: 'ga4' }
    expect(isAgentReport(obj)).toBe(true)
  })

  it('returns true for a report with summary key', () => {
    const obj = { summary: 'Done', findings: ['item1'], timestamp: '2024-01-01' }
    expect(isAgentReport(obj)).toBe(true)
  })

  it('returns false for an empty object', () => {
    expect(isAgentReport({})).toBe(false)
  })

  it('returns false for a single-key report object', () => {
    expect(isAgentReport({ status: 'ok' })).toBe(false)
  })

  it('returns false for a stream-json token (type+delta)', () => {
    const token = { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hello' } }
    // All top-level keys are stream-only: type, index, delta
    expect(isAgentReport(token)).toBe(false)
  })

  it('returns false for a random object with no report keys', () => {
    const obj = { foo: 'bar', baz: 42 }
    expect(isAgentReport(obj)).toBe(false)
  })

  it('returns true for alerts report', () => {
    const obj = { alerts: [{ message: 'Disk full' }], timestamp: '2024-01-01', severity: 'critical' }
    expect(isAgentReport(obj)).toBe(true)
  })
})

// ─── classifyReport ───────────────────────────────────────────────────────────

describe('classifyReport', () => {
  it('classifies health report by checks key', () => {
    const obj = { status: 'PASS', checks: [{ name: 'db', status: 'PASS' }] }
    expect(classifyReport(obj)).toBe('health')
  })

  it('classifies health report by overall_status key', () => {
    const obj = { overall_status: 'WARN', timestamp: '2024-01-01' }
    expect(classifyReport(obj)).toBe('health')
  })

  it('classifies health report when status + warnings keys present', () => {
    const obj = { status: 'OK', warnings: ['memory high'], timestamp: '2024-01-01' }
    expect(classifyReport(obj)).toBe('health')
  })

  it('classifies analytics report by metrics key', () => {
    const obj = { metrics: { pageviews: 100, sessions: 50 }, period: '7d' }
    expect(classifyReport(obj)).toBe('analytics')
  })

  it('classifies analytics report by score key', () => {
    const obj = { score: 92, timestamp: '2024-01-01', tool: 'lighthouse' }
    expect(classifyReport(obj)).toBe('analytics')
  })

  it('classifies seo report by keywords key', () => {
    const obj = { keywords: ['react', 'typescript'], timestamp: '2024-01-01', count: 2 }
    expect(classifyReport(obj)).toBe('seo')
  })

  it('classifies seo report by audit key', () => {
    const obj = { audit: { score: 80 }, timestamp: '2024-01-01', pages: 10 }
    expect(classifyReport(obj)).toBe('seo')
  })

  it('classifies alert by alerts key', () => {
    const obj = { alerts: ['down'], findings: ['item'], timestamp: '2024-01-01' }
    expect(classifyReport(obj)).toBe('alert')
  })

  it('classifies content report by content key', () => {
    const obj = { content: [{ title: 'Blog post' }], timestamp: '2024-01-01', count: 1 }
    expect(classifyReport(obj)).toBe('content')
  })

  it('falls back to report for generic objects', () => {
    const obj = { data: [1, 2, 3], summary: 'generic', timestamp: '2024-01-01' }
    expect(classifyReport(obj)).toBe('report')
  })
})

// ─── parseAgentOutputs ────────────────────────────────────────────────────────

describe('parseAgentOutputs', () => {
  it('returns empty array for empty string', () => {
    expect(parseAgentOutputs('')).toHaveLength(0)
  })

  it('returns empty array for whitespace-only string', () => {
    expect(parseAgentOutputs('   \n\n  ')).toHaveLength(0)
  })

  it('returns empty array when stdout has no report-like JSON', () => {
    const stdout = 'Running health check...\nAll systems operational\nNo issues found.'
    expect(parseAgentOutputs(stdout)).toHaveLength(0)
  })

  it('extracts report from fenced JSON block', () => {
    const stdout = `
I ran the checks.

\`\`\`json
{
  "status": "PASS",
  "checks": [
    { "name": "db", "status": "PASS" },
    { "name": "redis", "status": "PASS" }
  ],
  "timestamp": "2024-01-01T00:00:00Z"
}
\`\`\`

All good.
`
    const outputs = parseAgentOutputs(stdout)
    expect(outputs).toHaveLength(1)
    expect(outputs[0].type).toBe('health')
    expect(outputs[0].data.status).toBe('PASS')
    expect(outputs[0].id).toBeDefined()
  })

  it('extracts report from fenced block without json language tag', () => {
    const stdout = `
\`\`\`
{ "metrics": { "pageviews": 500 }, "period": "7d", "timestamp": "2024-01-01T00:00:00Z" }
\`\`\`
`
    const outputs = parseAgentOutputs(stdout)
    expect(outputs).toHaveLength(1)
    expect(outputs[0].type).toBe('analytics')
  })

  it('extracts report from standalone single-line JSON', () => {
    const stdout = `Checking metrics now.\n{ "metrics": { "sessions": 200 }, "timestamp": "2024-01-01T00:00:00Z", "source": "ga4" }\nDone.`
    const outputs = parseAgentOutputs(stdout)
    expect(outputs).toHaveLength(1)
    expect(outputs[0].type).toBe('analytics')
  })

  it('extracts report from __agist_report marker block', () => {
    const stdout = `
Analysis complete.

__agist_report
{
  "overall_status": "CRITICAL",
  "checks": [{ "name": "cpu", "status": "CRITICAL", "message": "95% utilization" }],
  "timestamp": "2024-01-01T00:00:00Z"
}
__end_agist_report

Please review.
`
    const outputs = parseAgentOutputs(stdout)
    expect(outputs).toHaveLength(1)
    expect(outputs[0].type).toBe('health')
    expect(outputs[0].data.overall_status).toBe('CRITICAL')
  })

  it('deduplicates the same JSON object appearing in multiple extraction strategies', () => {
    // The same JSON object appears both as a fenced block AND as standalone JSON
    const json = '{"status":"PASS","checks":[{"name":"db","status":"OK"}],"timestamp":"2024-01-01T00:00:00Z"}'
    const stdout = `\`\`\`json\n${json}\n\`\`\`\n${json}`
    const outputs = parseAgentOutputs(stdout)
    expect(outputs).toHaveLength(1)
  })

  it('handles mixed content with stream-json tokens and reports', () => {
    // Stream-json lines should be excluded; only the real report should remain
    const stdout = [
      '{"type":"message_start","message":{"id":"msg_01","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-6","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":100,"output_tokens":0}}}',
      '{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
      '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Running checks..."}}',
      '```json',
      '{"status":"PASS","checks":[{"name":"api","status":"PASS"}],"timestamp":"2024-01-01T00:00:00Z"}',
      '```',
      '{"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":50}}',
      '{"type":"message_stop"}',
    ].join('\n')

    const outputs = parseAgentOutputs(stdout)
    // Only the health report should be extracted; stream tokens should be filtered
    expect(outputs).toHaveLength(1)
    expect(outputs[0].type).toBe('health')
    expect(outputs[0].data.status).toBe('PASS')
  })

  it('extracts multiple distinct reports from one stdout', () => {
    const stdout = `
Health check:
\`\`\`json
{
  "status": "PASS",
  "checks": [{ "name": "db", "status": "PASS" }],
  "timestamp": "2024-01-01T00:00:00Z"
}
\`\`\`

Analytics:
\`\`\`json
{
  "metrics": { "pageviews": 1000, "sessions": 400 },
  "period": "7d",
  "timestamp": "2024-01-01T00:00:00Z"
}
\`\`\`
`
    const outputs = parseAgentOutputs(stdout)
    expect(outputs).toHaveLength(2)
    const types = outputs.map((o) => o.type).sort()
    expect(types).toContain('health')
    expect(types).toContain('analytics')
  })

  it('ignores non-report JSON objects like arrays at top level', () => {
    // Arrays wrapped as values are OK, but top-level arrays are ignored
    const stdout = 'Here is a list: [1,2,3]'
    expect(parseAgentOutputs(stdout)).toHaveLength(0)
  })

  it('each output has a unique nanoid', () => {
    const stdout = `
\`\`\`json
{ "status": "PASS", "checks": [], "timestamp": "2024-01-01T00:00:00Z" }
\`\`\`
\`\`\`json
{ "metrics": { "pageviews": 500 }, "period": "7d", "timestamp": "2024-01-01T00:00:00Z" }
\`\`\`
`
    const outputs = parseAgentOutputs(stdout)
    expect(outputs).toHaveLength(2)
    expect(outputs[0].id).not.toBe(outputs[1].id)
  })
})

// ─── Output routes (inline handler tests) ─────────────────────────────────────

describe('outputs API route helpers', () => {
  it('rowToOutput parses JSON data field', () => {
    // Inline the rowToOutput logic to test it
    function rowToOutput(row: { id: string; run_id: string; agent_id: string; output_type: string; data: string; created_at: string }) {
      let data: Record<string, unknown> = {}
      try {
        data = JSON.parse(row.data) as Record<string, unknown>
      } catch {
        data = { raw: row.data }
      }
      return {
        id: row.id,
        runId: row.run_id,
        agentId: row.agent_id,
        outputType: row.output_type,
        data,
        createdAt: row.created_at,
      }
    }

    const row = {
      id: 'out_001',
      run_id: 'run_001',
      agent_id: 'agent_001',
      output_type: 'health',
      data: '{"status":"PASS","checks":[]}',
      created_at: '2024-01-01T00:00:00Z',
    }
    const result = rowToOutput(row)
    expect(result.id).toBe('out_001')
    expect(result.runId).toBe('run_001')
    expect(result.agentId).toBe('agent_001')
    expect(result.outputType).toBe('health')
    expect(result.data).toEqual({ status: 'PASS', checks: [] })
    expect(result.createdAt).toBe('2024-01-01T00:00:00Z')
  })

  it('rowToOutput falls back to raw string for invalid JSON', () => {
    function rowToOutput(row: { id: string; run_id: string; agent_id: string; output_type: string; data: string; created_at: string }) {
      let data: Record<string, unknown> = {}
      try {
        data = JSON.parse(row.data) as Record<string, unknown>
      } catch {
        data = { raw: row.data }
      }
      return { id: row.id, runId: row.run_id, agentId: row.agent_id, outputType: row.output_type, data, createdAt: row.created_at }
    }

    const row = {
      id: 'out_002',
      run_id: 'run_001',
      agent_id: 'agent_001',
      output_type: 'report',
      data: 'not valid JSON {{',
      created_at: '2024-01-01T00:00:00Z',
    }
    const result = rowToOutput(row)
    expect(result.data).toEqual({ raw: 'not valid JSON {{' })
  })
})
