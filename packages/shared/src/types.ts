export interface PaginationParams {
  page?: number    // 1-based, default 1
  limit?: number   // default 20, max 100
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export type CompanyStatus = "active" | "paused" | "archived";
export type AgentStatus = "idle" | "running" | "paused" | "error" | "budget_exceeded";
export type AgentPermissionMode = 'autonomous' | 'supervised' | 'readonly' | 'custom';
export type CapsulePriority = 'instruction' | 'memory' | 'ephemeral';
export type RunSource = 'manual' | 'schedule' | 'event' | 'routine' | 'system' | 'chain';
export type AgentRole =
  | "ceo"
  | "engineer"
  | "devops"
  | "marketing"
  | "seo"
  | "content"
  | "research"
  | "sales"
  | "general";
export type RunStatus = "queued" | "running" | "completed" | "failed" | "timeout" | "cancelled";
export type IssuePriority = "critical" | "high" | "medium" | "low";
export type IssueStatus = "open" | "in_progress" | "resolved" | "closed" | "wont_fix";
export type RoutineStatus = "active" | "paused";

export interface Company {
  id: string;
  name: string;
  description: string | null;
  status: CompanyStatus;
  budgetMonthlyCents: number;
  spentMonthlyCents: number;
  systemBudgetCents: number;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  companyId: string;
  name: string;
  slug: string;
  role: AgentRole;
  title: string | null;
  model: string | null; // claude-haiku-4-5-20251001, claude-sonnet-4-6, claude-opus-4-6
  capabilities: string | null;
  status: AgentStatus;
  reportsTo: string | null;
  adapterType: string;
  adapterConfig: Record<string, unknown>;
  workingDirectory?: string | null; // absolute path to project directory
  projectId?: string | null;
  tags?: string[]; // free-form tags for grouping/filtering
  contextCapsule?: string; // persistent agent memory/context
  permissionMode: AgentPermissionMode;
  systemPrompt: string; // immutable human-written instructions
  budgetMonthlyCents: number;
  spentMonthlyCents: number;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  companyId: string;
  name: string;
  description: string;
  workingDirectory?: string | null;
  agentCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Routine {
  id: string;
  companyId: string;
  agentId: string;
  title: string;
  description: string | null;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Run {
  id: string;
  agentId: string;
  companyId: string;
  routineId: string | null;
  status: RunStatus;
  model: string | null;
  source: string; // "manual" | "scheduler" | "chain:{source-agent-slug}"
  chainDepth: number; // 0 = direct, increments with each chain hop
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  error: string | null;
  tokenInput: number;
  tokenOutput: number;
  costCents: number;
  logExcerpt: string | null;
  createdAt: string;
}

export interface RunOutput {
  id: string;
  runId: string;
  agentId: string;
  outputType: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export type SignalType = 'product-update' | 'social-proof' | 'seo-tactic' | 'market-trend' | 'alert' | 'kpi-change';

export interface Signal {
  id: string;
  companyId: string;
  sourceAgentId: string;
  sourceAgentName: string;
  signalType: SignalType | string;
  title: string;
  payload: Record<string, unknown>;
  consumedBy: string[];
  createdAt: string;
}

export interface Issue {
  id: string;
  companyId: string;
  projectId: string | null;
  agentId: string | null;
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  createdAt: string;
  updatedAt: string;
}

export type ApprovalGateStatus = "pending" | "approved" | "rejected";

export interface ApprovalGate {
  id: string;
  companyId: string;
  agentId: string;
  agentName?: string;
  gateType: string;
  title: string;
  description: string;
  payload: Record<string, unknown>;
  status: ApprovalGateStatus;
  decidedAt: string | null;
  decidedBy: string;
  autoCreated: boolean;
  decisionReason: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  companyId: string | null;
  agentId: string | null;
  action: string;
  detail: Record<string, unknown>;
  actor: string;
  decisionReason: string;
  createdAt: string;
}

export interface CapsuleConsolidation {
  id: string;
  companyId: string;
  lastConsolidatedAt: string | null;
  runsSinceLast: number;
  lockHolder: string | null;
  lockAcquiredAt: string | null;
  status: 'idle' | 'running' | 'failed';
  createdAt: string;
}

export interface Capsule {
  id: string;
  companyId: string;
  type: 'static' | 'dynamic' | 'composite';
  name: string;
  content: string;
  tokenCount: number;
  version: number;
  config: Record<string, unknown>;
  active: boolean;
  priority: CapsulePriority;
  contentHash: string;
  lastManualUpdateAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}
