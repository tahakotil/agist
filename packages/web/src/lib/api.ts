const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4400/api";

export class ApiConnectionError extends Error {
  constructor(url: string) {
    super(`Cannot connect to backend at ${url}`)
    this.name = 'ApiConnectionError'
  }
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch (err) {
    throw new ApiConnectionError(API_URL)
  }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ─── Types matching actual backend shapes ─────────────────────────────────────

export type AgentStatus = "idle" | "running" | "error" | "paused";
export type RunStatus = "completed" | "failed" | "running" | "cancelled" | "queued" | "timeout";

export interface Company {
  id: string;
  name: string;
  description: string;
  status: string;
  budgetMonthlyCents: number;
  spentMonthlyCents: number;
  agentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  role: string;
  title: string;
  model: string;
  capabilities: string[];
  status: AgentStatus;
  reportsTo: string | null;
  adapterType: string;
  adapterConfig: Record<string, unknown>;
  workingDirectory?: string | null;
  budgetMonthlyCents: number;
  spentMonthlyCents: number;
  createdAt: string;
  updatedAt: string;
}

export interface Run {
  id: string;
  agentId: string;
  agentName: string;
  companyId: string;
  companyName: string;
  routineId: string | null;
  status: RunStatus;
  model: string;
  source: string;
  startedAt: string;
  finishedAt?: string | null;
  exitCode?: number | null;
  error?: string | null;
  tokenInput: number;
  tokenOutput: number;
  cost: number;
  costCents: number;
  durationMs?: number;
  logExcerpt: string;
  createdAt: string;
}

export interface Routine {
  id: string;
  companyId: string;
  agentId: string;
  title: string;
  description: string;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  totalAgents: number;
  runningNow: number;
  successRate24h: number | null;
  costToday: number;
}

export interface DailyCost {
  date: string;
  haiku: number;
  sonnet: number;
  opus: number;
  total: number;
}

// ─── API functions ─────────────────────────────────────────────────────────────

// Companies
export async function getCompanies(): Promise<Company[]> {
  const res = await api<{ companies: Company[] }>("/companies");
  return res.companies;
}

export async function getCompany(id: string): Promise<Company> {
  const res = await api<{ company: Company }>(`/companies/${id}`);
  return res.company;
}

export async function createCompany(data: {
  name: string;
  description?: string;
  budgetMonthlyCents?: number;
}): Promise<Company> {
  const res = await api<{ company: Company }>("/companies", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.company;
}

export async function updateCompany(
  id: string,
  data: Partial<{ name: string; description: string; budgetMonthlyCents: number }>
): Promise<Company> {
  const res = await api<{ company: Company }>(`/companies/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res.company;
}

export async function deleteCompany(id: string): Promise<void> {
  await api(`/companies/${id}`, { method: "DELETE" });
}

// Agents
export async function getAgents(): Promise<Agent[]> {
  const res = await api<{ agents: Agent[] }>("/agents");
  return res.agents;
}

export async function getCompanyAgents(companyId: string): Promise<Agent[]> {
  const res = await api<{ agents: Agent[] }>(`/companies/${companyId}/agents`);
  return res.agents;
}

export async function getAgent(id: string): Promise<Agent> {
  const res = await api<{ agent: Agent }>(`/agents/${id}`);
  return res.agent;
}

export async function createAgent(
  companyId: string,
  data: {
    name: string;
    role?: string;
    title?: string;
    model?: string;
    workingDirectory?: string | null;
  }
): Promise<Agent> {
  const res = await api<{ agent: Agent }>(`/companies/${companyId}/agents`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.agent;
}

export async function updateAgent(
  id: string,
  data: Partial<{ name: string; role: string; title: string; model: string; status: AgentStatus; workingDirectory: string | null }>
): Promise<Agent> {
  const res = await api<{ agent: Agent }>(`/agents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res.agent;
}

export async function deleteAgent(id: string): Promise<void> {
  await api(`/agents/${id}`, { method: "DELETE" });
}

export async function wakeAgent(
  id: string,
  prompt?: string
): Promise<{ run: { id: string; agentId: string; status: string } }> {
  return api(`/agents/${id}/wake`, {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
}

// Runs
export async function getRecentRuns(limit = 20): Promise<Run[]> {
  const res = await api<{ runs: Run[] }>(`/runs/recent?limit=${limit}`);
  return res.runs;
}

export async function getAgentRuns(agentId: string, limit = 50): Promise<Run[]> {
  const res = await api<{ runs: Run[] }>(`/agents/${agentId}/runs?limit=${limit}`);
  return res.runs;
}

export async function getRun(id: string): Promise<Run> {
  const res = await api<{ run: Run }>(`/runs/${id}`);
  return res.run;
}

// Dashboard
export async function getDashboardStats(): Promise<DashboardStats> {
  return api<DashboardStats>("/dashboard/stats");
}

export async function updateRoutine(
  id: string,
  data: Partial<{ title: string; description: string; cronExpression: string; enabled: boolean }>
): Promise<Routine> {
  const res = await api<{ routine: Routine }>(`/routines/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res.routine;
}

// Routines
export async function getCompanyRoutines(companyId: string): Promise<Routine[]> {
  const res = await api<{ routines: Routine[] }>(`/companies/${companyId}/routines`);
  return res.routines;
}

// Issues
export interface Issue {
  id: string;
  agentId: string;
  agentName?: string;
  companyId: string;
  companyName?: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  message: string;
  details?: string;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function getCompanyIssues(companyId: string): Promise<Issue[]> {
  const res = await api<{ issues: Issue[] }>(`/companies/${companyId}/issues`);
  return res.issues;
}
