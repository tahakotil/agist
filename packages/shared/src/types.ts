export type CompanyStatus = "active" | "paused" | "archived";
export type AgentStatus = "idle" | "running" | "paused" | "error";
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
export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type IssuePriority = "critical" | "high" | "medium" | "low";
export type IssueStatus = "backlog" | "todo" | "in_progress" | "in_review" | "done";

export interface Company {
  id: string;
  name: string;
  description: string | null;
  status: CompanyStatus;
  budgetMonthlyCents: number;
  spentMonthlyCents: number;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  companyId: string;
  name: string;
  role: AgentRole;
  title: string | null;
  model: string | null; // claude-haiku-4-5-20251001, claude-sonnet-4-6, claude-opus-4-6
  capabilities: string | null;
  status: AgentStatus;
  reportsTo: string | null;
  adapterType: string;
  adapterConfig: Record<string, unknown>;
  budgetMonthlyCents: number;
  spentMonthlyCents: number;
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
  source: string; // "schedule" | "manual" | "event"
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
