const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4400/api";

export class ApiConnectionError extends Error {
  constructor(url: string) {
    super(`Cannot connect to backend at ${url}`)
    this.name = 'ApiConnectionError'
  }
}

function getApiKey(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('agist_api_key')
  }
  return process.env.NEXT_PUBLIC_API_KEY || null
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const apiKey = getApiKey()
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string> | undefined),
  }
  if (apiKey) {
    headers["X-Api-Key"] = apiKey
  }
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new ApiConnectionError(API_URL)
  }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildQs(params: Record<string, any>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
  if (entries.length === 0) return ""
  return "?" + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&")
}

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
  companyName?: string;
  agentId: string;
  agentName?: string;
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

export interface Issue {
  id: string;
  agentId: string | null;
  agentName?: string;
  companyId: string;
  companyName?: string;
  projectId?: string | null;
  title: string;
  description: string;
  status: string;
  priority: "critical" | "high" | "medium" | "low";
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  totalAgents: number;
  runningNow: number;
  successRate24h: number | null;
  costToday: number;
}

export interface AgentDailyCost {
  date: string;
  agentId: string;
  agentName: string;
  model: string;
  costCents: number;
}

// ─── Companies ─────────────────────────────────────────────────────────────────
export interface CompanyListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sort?: "name" | "createdAt";
}

export async function getCompanies(params?: CompanyListParams): Promise<{ companies: Company[]; pagination: Pagination }> {
  return api<{ companies: Company[]; pagination: Pagination }>(`/companies${buildQs(params ?? {})}`);
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

// ─── Agents ────────────────────────────────────────────────────────────────────
export interface AgentListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  model?: string;
  role?: string;
  sort?: "name" | "status" | "createdAt";
}

export async function getAgents(params?: AgentListParams): Promise<{ agents: Agent[]; pagination: Pagination }> {
  return api<{ agents: Agent[]; pagination: Pagination }>(`/agents${buildQs(params ?? {})}`);
}

export async function getCompanyAgents(
  companyId: string,
  params?: AgentListParams
): Promise<{ agents: Agent[]; pagination: Pagination }> {
  return api<{ agents: Agent[]; pagination: Pagination }>(
    `/companies/${companyId}/agents${buildQs(params ?? {})}`
  );
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
  data: Partial<{
    name: string;
    role: string;
    title: string;
    model: string;
    status: AgentStatus;
    workingDirectory: string | null;
  }>
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

export interface DeleteAgentRunsParams {
  olderThan?: string;
  status?: RunStatus;
}

export async function deleteAgentRuns(
  agentId: string,
  params?: DeleteAgentRunsParams
): Promise<{ deleted: number }> {
  return api<{ deleted: number }>(
    `/agents/${agentId}/runs${buildQs(params ?? {})}`,
    { method: "DELETE" }
  );
}

// ─── Runs ──────────────────────────────────────────────────────────────────────
export interface RunListParams {
  page?: number;
  limit?: number;
  status?: RunStatus;
  source?: string;
  agentId?: string;
  from?: string;
  to?: string;
  sort?: "startedAt" | "cost" | "durationMs";
}

export async function getRuns(params?: RunListParams): Promise<{ runs: Run[]; pagination: Pagination }> {
  return api<{ runs: Run[]; pagination: Pagination }>(`/runs${buildQs(params ?? {})}`);
}

export async function getRecentRuns(limit = 20): Promise<Run[]> {
  const res = await api<{ runs: Run[] }>(`/runs/recent?limit=${limit}`);
  return res.runs;
}

export async function getAgentRuns(
  agentId: string,
  params?: RunListParams
): Promise<{ runs: Run[]; pagination: Pagination }> {
  return api<{ runs: Run[]; pagination: Pagination }>(
    `/agents/${agentId}/runs${buildQs(params ?? {})}`
  );
}

export async function getRun(id: string): Promise<Run> {
  const res = await api<{ run: Run }>(`/runs/${id}`);
  return res.run;
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────
export async function getDashboardStats(): Promise<DashboardStats> {
  return api<DashboardStats>("/dashboard/stats");
}

export async function getDashboardCosts(days = 7): Promise<AgentDailyCost[]> {
  const res = await api<{ costs: AgentDailyCost[] }>(`/dashboard/costs?days=${days}`);
  return res.costs;
}

// ─── Routines ─────────────────────────────────────────────────────────────────
export interface RoutineListParams {
  page?: number;
  limit?: number;
  enabled?: boolean;
  agentId?: string;
}

export async function getRoutines(
  params?: RoutineListParams
): Promise<{ routines: Routine[]; pagination: Pagination }> {
  return api<{ routines: Routine[]; pagination: Pagination }>(`/routines${buildQs(params ?? {})}`);
}

export async function getCompanyRoutines(
  companyId: string,
  params?: RoutineListParams
): Promise<{ routines: Routine[]; pagination: Pagination }> {
  return api<{ routines: Routine[]; pagination: Pagination }>(
    `/companies/${companyId}/routines${buildQs(params ?? {})}`
  );
}

export async function createRoutine(
  companyId: string,
  data: {
    agentId: string;
    title: string;
    description?: string;
    cronExpression: string;
    timezone?: string;
    enabled?: boolean;
  }
): Promise<Routine> {
  const res = await api<{ routine: Routine }>(`/companies/${companyId}/routines`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.routine;
}

export async function updateRoutine(
  id: string,
  data: Partial<{
    title: string;
    description: string;
    cronExpression: string;
    enabled: boolean;
  }>
): Promise<Routine> {
  const res = await api<{ routine: Routine }>(`/routines/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res.routine;
}

export async function deleteRoutine(id: string): Promise<void> {
  await api(`/routines/${id}`, { method: "DELETE" });
}

// ─── Issues ────────────────────────────────────────────────────────────────────
export interface IssueListParams {
  page?: number;
  limit?: number;
  status?: string;
  priority?: string;
  agentId?: string;
  sort?: "priority" | "createdAt" | "status";
}

export async function getCompanyIssues(
  companyId: string,
  params?: IssueListParams
): Promise<{ issues: Issue[]; pagination: Pagination }> {
  return api<{ issues: Issue[]; pagination: Pagination }>(
    `/companies/${companyId}/issues${buildQs(params ?? {})}`
  );
}

export async function createIssue(
  companyId: string,
  data: {
    title: string;
    description?: string;
    priority?: string;
    agentId?: string | null;
    projectId?: string | null;
  }
): Promise<Issue> {
  const res = await api<{ issue: Issue }>(`/companies/${companyId}/issues`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.issue;
}

export async function updateIssue(
  id: string,
  data: Partial<{
    title: string;
    description: string;
    status: string;
    priority: string;
    agentId: string | null;
    projectId: string | null;
  }>
): Promise<Issue> {
  const res = await api<{ issue: Issue }>(`/issues/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res.issue;
}

export async function deleteIssue(id: string): Promise<void> {
  await api(`/issues/${id}`, { method: "DELETE" });
}

// ─── Projects ─────────────────────────────────────────────────────────────────
export interface Project {
  id: string;
  companyId: string;
  companyName?: string;
  name: string;
  description: string;
  workingDirectory?: string | null;
  agentCount?: number;
  createdAt: string;
  updatedAt: string;
}

export async function getCompanyProjects(
  companyId: string
): Promise<{ projects: Project[] }> {
  return api<{ projects: Project[] }>(`/companies/${companyId}/projects`);
}

export async function getProject(id: string): Promise<Project> {
  const res = await api<{ project: Project }>(`/projects/${id}`);
  return res.project;
}

export async function createProject(
  companyId: string,
  data: {
    name: string;
    description?: string;
    workingDirectory?: string | null;
  }
): Promise<Project> {
  const res = await api<{ project: Project }>(`/companies/${companyId}/projects`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.project;
}

export async function updateProject(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    workingDirectory: string | null;
  }>
): Promise<Project> {
  const res = await api<{ project: Project }>(`/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res.project;
}

export async function deleteProject(id: string): Promise<void> {
  await api(`/projects/${id}`, { method: "DELETE" });
}
