const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4400/api";

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export type AgentStatus = "idle" | "running" | "error" | "paused";
export type ModelType = "haiku" | "sonnet" | "opus";
export type RunStatus = "success" | "error" | "running" | "cancelled";

export interface Company {
  id: string;
  name: string;
  slug: string;
  description?: string;
  agentCount: number;
  budget: number;
  spent: number;
  createdAt: string;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  model: ModelType;
  status: AgentStatus;
  companyId: string;
  companyName: string;
  cronSchedule?: string;
  lastRunAt?: string;
  nextRunAt?: string;
  currentTask?: string;
  reportsTo?: string;
  description?: string;
  createdAt: string;
}

export interface Run {
  id: string;
  agentId: string;
  agentName: string;
  companyId: string;
  companyName: string;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  cost: number;
  logs?: LogEntry[];
}

export interface LogEntry {
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";
  message: string;
}

export interface Routine {
  id: string;
  name: string;
  agentId: string;
  companyId: string;
  cronSchedule: string;
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
}

export interface DashboardStats {
  totalAgents: number;
  runningNow: number;
  successRate24h: number;
  costToday: number;
}

export interface DailyCost {
  date: string;
  haiku: number;
  sonnet: number;
  opus: number;
  total: number;
}
