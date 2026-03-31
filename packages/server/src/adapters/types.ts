export interface AdapterRunOptions {
  runId: string
  agentId: string
  companyId: string
  prompt: string
  model: string
  workingDirectory?: string | null
  systemPrompt?: string
  capabilities?: string[]
  title?: string
  /** Extra directories to mount via --add-dir (claude-cli only) */
  extraDirs?: string[]
  onLog: (line: string) => void
  onTokens: (input: number, output: number) => void
}

export interface AdapterResult {
  exitCode: number
  tokenInput: number
  tokenOutput: number
  costCents: number
  logExcerpt: string
  error?: string
}

export interface RunAdapter {
  name: string
  spawn(options: AdapterRunOptions): Promise<AdapterResult>
  kill?(runId: string): void
}

/**
 * Standardized Adapter Definition Interface
 *
 * Following Claude Code's ToolDef pattern:
 * Each adapter declares capabilities, validates config, and executes.
 * This interface allows runtime adapter discovery and health-checking.
 */
export interface AdapterDef {
  /** Internal adapter identifier (e.g. 'claude-cli', 'openai') */
  name: string

  /** Human-readable display name */
  displayName: string

  /** Whether this adapter requires an API key to function */
  requiresApiKey: boolean

  /** Required environment variable names (checked at startup/health) */
  requiredEnvVars: string[]

  /**
   * Validate adapter-specific config before use.
   * Returns { valid: true } or { valid: false, error: 'description' }.
   */
  validateConfig(config: Record<string, unknown>): { valid: boolean; error?: string }

  /**
   * Health check — is this adapter available right now?
   * Should be lightweight (check env var or single ping).
   */
  healthCheck(): Promise<{ healthy: boolean; error?: string }>

  /**
   * Estimate cost in cents for a given model and token counts.
   * Used for budget pre-checks before spawning a run.
   */
  estimateCost(model: string, inputTokens: number, outputTokens: number): number
}
