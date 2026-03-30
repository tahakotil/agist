/**
 * In-memory Prometheus-compatible metrics.
 * Counters/gauges reset on server restart — acceptable for MVP.
 */

interface HttpKey {
  method: string
  path: string
  status: number
}

function httpKey(method: string, path: string, status: number): string {
  return `${method}:${path}:${status}`
}

const httpRequestsTotal = new Map<string, number>()
const httpRequestDurationsMs: number[] = []
const runsTotal = new Map<string, number>()
let runsActive = 0
let tokensInputTotal = 0
let tokensOutputTotal = 0
let agentsTotal = 0
let agentsRunning = 0

// ── Public increment helpers ────────────────────────────────────────────────

export function incHttpRequest(method: string, path: string, status: number, durationMs: number): void {
  const key = httpKey(method, path, status)
  httpRequestsTotal.set(key, (httpRequestsTotal.get(key) ?? 0) + 1)
  // keep rolling window of last 1000 durations
  httpRequestDurationsMs.push(durationMs)
  if (httpRequestDurationsMs.length > 1000) httpRequestDurationsMs.shift()
}

export function incRun(status: string): void {
  runsTotal.set(status, (runsTotal.get(status) ?? 0) + 1)
}

export function setRunsActive(n: number): void {
  runsActive = n
}

export function incRunsActive(): void {
  runsActive++
}

export function decRunsActive(): void {
  if (runsActive > 0) runsActive--
}

export function addTokens(input: number, output: number): void {
  tokensInputTotal += input
  tokensOutputTotal += output
}

export function setAgentGauges(total: number, running: number): void {
  agentsTotal = total
  agentsRunning = running
}

// ── Prometheus text format renderer ────────────────────────────────────────

function counter(name: string, help: string, type: 'counter' | 'gauge', entries: Array<[string, number]>): string {
  const lines: string[] = [
    `# HELP ${name} ${help}`,
    `# TYPE ${name} ${type}`,
  ]
  for (const [labels, value] of entries) {
    lines.push(`${name}{${labels}} ${value}`)
  }
  return lines.join('\n')
}

export function renderMetrics(): string {
  const sections: string[] = []

  // HTTP requests total
  const httpEntries: Array<[string, number]> = []
  for (const [key, count] of httpRequestsTotal) {
    const [method, path, status] = key.split(':')
    httpEntries.push([`method="${method}",path="${path}",status="${status}"`, count])
  }
  sections.push(counter('agist_http_requests_total', 'Total HTTP requests', 'counter', httpEntries))

  // HTTP request duration p50/p95 (simple approximation)
  const sorted = [...httpRequestDurationsMs].sort((a, b) => a - b)
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0
  sections.push(
    `# HELP agist_http_request_duration_ms HTTP request duration in milliseconds\n# TYPE agist_http_request_duration_ms summary\nagist_http_request_duration_ms{quantile="0.5"} ${p50}\nagist_http_request_duration_ms{quantile="0.95"} ${p95}`
  )

  // Runs total
  const runEntries: Array<[string, number]> = []
  for (const [status, count] of runsTotal) {
    runEntries.push([`status="${status}"`, count])
  }
  sections.push(counter('agist_runs_total', 'Total runs by status', 'counter', runEntries))

  // Runs active
  sections.push(
    `# HELP agist_runs_active Currently active (running) agents\n# TYPE agist_runs_active gauge\nagist_runs_active ${runsActive}`
  )

  // Tokens
  sections.push(
    `# HELP agist_tokens_total Total tokens consumed\n# TYPE agist_tokens_total counter\nagist_tokens_total{direction="input"} ${tokensInputTotal}\nagist_tokens_total{direction="output"} ${tokensOutputTotal}`
  )

  // Agents
  sections.push(
    `# HELP agist_agents_total Total registered agents\n# TYPE agist_agents_total gauge\nagist_agents_total ${agentsTotal}`
  )
  sections.push(
    `# HELP agist_agents_running Agents currently running\n# TYPE agist_agents_running gauge\nagist_agents_running ${agentsRunning}`
  )

  return sections.join('\n\n') + '\n'
}
