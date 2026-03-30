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
