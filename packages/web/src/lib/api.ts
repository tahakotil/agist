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
  contextCapsule?: string;
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
  chainDepth: number;
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

export async function getAgentContext(id: string): Promise<{ capsule: string }> {
  return api<{ capsule: string }>(`/agents/${id}/context`);
}

export async function updateAgentContext(id: string, capsule: string): Promise<void> {
  await api(`/agents/${id}/context`, {
    method: "PUT",
    body: JSON.stringify({ capsule }),
  });
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

// ─── Signals ──────────────────────────────────────────────────────────────────
export interface Signal {
  id: string;
  companyId: string;
  sourceAgentId: string;
  sourceAgentName: string;
  signalType: string;
  title: string;
  payload: Record<string, unknown>;
  consumedBy: string[];
  createdAt: string;
}

export interface SignalListParams {
  type?: string;
  since?: string;
  limit?: number;
}

export async function getCompanySignals(
  companyId: string,
  params?: SignalListParams
): Promise<Signal[]> {
  const res = await api<{ signals: Signal[] }>(
    `/companies/${companyId}/signals${buildQs(params ?? {})}`
  );
  return res.signals;
}

export async function getUnconsumedSignals(
  companyId: string,
  agentId: string
): Promise<Signal[]> {
  const res = await api<{ signals: Signal[] }>(
    `/companies/${companyId}/signals/unconsumed/${agentId}`
  );
  return res.signals;
}

export async function createSignal(
  companyId: string,
  data: {
    source_agent_id: string;
    signal_type: string;
    title: string;
    payload?: Record<string, unknown>;
  }
): Promise<Signal> {
  const res = await api<{ signal: Signal }>(`/companies/${companyId}/signals`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.signal;
}

export async function consumeSignal(
  companyId: string,
  signalId: string,
  agentId: string
): Promise<void> {
  await api(`/companies/${companyId}/signals/${signalId}/consume`, {
    method: "POST",
    body: JSON.stringify({ agent_id: agentId }),
  });
}

// ─── Workspace ─────────────────────────────────────────────────────────────────
export interface ReportDirEntry {
  slug: string;
  fileCount: number;
}

export interface ReportFileEntry {
  name: string;
  size: number;
  modifiedAt: string;
}

export async function getWorkspaceReports(companyId: string): Promise<ReportDirEntry[]> {
  const res = await api<{ reports: ReportDirEntry[] }>(`/companies/${companyId}/workspace/reports`);
  return res.reports;
}

export async function getAgentReportFiles(companyId: string, agentSlug: string): Promise<ReportFileEntry[]> {
  const res = await api<{ agentSlug: string; files: ReportFileEntry[] }>(
    `/companies/${companyId}/workspace/reports/${encodeURIComponent(agentSlug)}`
  );
  return res.files;
}

export async function getReportFileContent(
  companyId: string,
  agentSlug: string,
  filename: string
): Promise<string> {
  const res = await api<{ agentSlug: string; filename: string; content: string }>(
    `/companies/${companyId}/workspace/reports/${encodeURIComponent(agentSlug)}/${encodeURIComponent(filename)}`
  );
  return res.content;
}

export async function getWorkspaceSynergy(companyId: string): Promise<unknown[]> {
  const res = await api<{ signals: unknown[] }>(`/companies/${companyId}/workspace/synergy`);
  return res.signals;
}

export async function getContextCapsule(companyId: string, agentSlug: string): Promise<string> {
  const res = await api<{ agentSlug: string; content: string }>(
    `/companies/${companyId}/workspace/context/${encodeURIComponent(agentSlug)}`
  );
  return res.content;
}

export async function updateContextCapsule(
  companyId: string,
  agentSlug: string,
  content: string
): Promise<void> {
  await api(`/companies/${companyId}/workspace/context/${encodeURIComponent(agentSlug)}`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
}

// ─── Run Outputs ────────────────────────────────────────────────────────────────
export interface RunOutput {
  id: string;
  runId: string;
  agentId: string;
  outputType: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export async function getRunOutputs(runId: string): Promise<RunOutput[]> {
  const res = await api<{ outputs: RunOutput[] }>(`/runs/${runId}/outputs`);
  return res.outputs;
}

export async function getAgentOutputs(agentId: string, limit = 50): Promise<RunOutput[]> {
  const res = await api<{ outputs: RunOutput[] }>(`/agents/${agentId}/outputs?limit=${limit}`);
  return res.outputs;
}

export async function getAgentLatestOutput(agentId: string): Promise<RunOutput | null> {
  const res = await api<{ output: RunOutput | null }>(`/agents/${agentId}/outputs/latest`);
  return res.output;
}

// ─── Templates ─────────────────────────────────────────────────────────────────

export interface AgistTemplate {
  version: '1.0';
  name: string;
  description: string;
  author?: string;
  url?: string;
  company: {
    name: string;
    description?: string;
    budget_monthly_cents?: number;
  };
  agents: TemplateAgent[];
  routines: TemplateRoutine[];
}

export interface TemplateAgent {
  slug: string;
  name: string;
  role: string;
  title?: string;
  model: string;
  capabilities?: string;
  reports_to?: string;
  budget_monthly_cents?: number;
  context_capsule?: string;
}

export interface TemplateRoutine {
  agent_slug: string;
  title: string;
  cron_expression: string;
  timezone?: string;
}

export async function exportCompanyTemplate(companyId: string): Promise<AgistTemplate> {
  return api<AgistTemplate>(`/companies/${companyId}/export`);
}

export async function importTemplate(template: AgistTemplate): Promise<{ companyId: string }> {
  return api<{ companyId: string }>('/companies/import', {
    method: 'POST',
    body: JSON.stringify(template),
  });
}

// ── Governance: Approval Gates ────────────────────────────────────────────────

export type ApprovalGateStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalGate {
  id: string;
  companyId: string;
  agentId: string;
  agentName: string | null;
  gateType: string;
  title: string;
  description: string;
  payload: Record<string, unknown>;
  status: ApprovalGateStatus;
  decidedAt: string | null;
  decidedBy: string | null;
  createdAt: string;
}

export async function getCompanyGates(
  companyId: string,
  params?: { status?: string; page?: number; limit?: number }
): Promise<{ gates: ApprovalGate[]; pagination: Pagination }> {
  return api<{ gates: ApprovalGate[]; pagination: Pagination }>(
    `/companies/${companyId}/gates${buildQs(params ?? {})}`
  );
}

export async function getPendingGates(
  companyId: string
): Promise<{ gates: ApprovalGate[]; total: number }> {
  return api<{ gates: ApprovalGate[]; total: number }>(
    `/companies/${companyId}/gates/pending`
  );
}

export async function createGate(
  companyId: string,
  body: {
    agentId: string;
    gateType: string;
    title: string;
    description: string;
    payload?: Record<string, unknown>;
  }
): Promise<{ gate: ApprovalGate }> {
  return api<{ gate: ApprovalGate }>(`/companies/${companyId}/gates`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function approveGate(
  companyId: string,
  gateId: string,
  decidedBy = 'human'
): Promise<{ gate: ApprovalGate }> {
  return api<{ gate: ApprovalGate }>(
    `/companies/${companyId}/gates/${gateId}/approve`,
    {
      method: 'POST',
      body: JSON.stringify({ decidedBy }),
    }
  );
}

export async function rejectGate(
  companyId: string,
  gateId: string,
  decidedBy = 'human'
): Promise<{ gate: ApprovalGate }> {
  return api<{ gate: ApprovalGate }>(
    `/companies/${companyId}/gates/${gateId}/reject`,
    {
      method: 'POST',
      body: JSON.stringify({ decidedBy }),
    }
  );
}

// ── Governance: Audit Log ─────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  companyId: string | null;
  agentId: string | null;
  agentName: string | null;
  action: string;
  detail: Record<string, unknown>;
  actor: string;
  createdAt: string;
}

export async function getAuditLog(
  companyId: string,
  params?: { action?: string; agent_id?: string; limit?: number; page?: number }
): Promise<{ entries: AuditLogEntry[]; pagination: Pagination }> {
  return api<{ entries: AuditLogEntry[]; pagination: Pagination }>(
    `/companies/${companyId}/audit${buildQs(params ?? {})}`
  );
}

// ── Governance: Pause / Resume ────────────────────────────────────────────────

export async function pauseAgent(agentId: string): Promise<{ agent: Agent }> {
  return api<{ agent: Agent }>(`/agents/${agentId}/pause`, { method: 'POST' });
}

export async function resumeAgent(agentId: string): Promise<{ agent: Agent }> {
  return api<{ agent: Agent }>(`/agents/${agentId}/resume`, { method: 'POST' });
}

// ── Daily Digests ─────────────────────────────────────────────────────────────

export interface AgentDigestEntry {
  agentId: string;
  agentName: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  totalCostCents: number;
  avgDurationMs: number;
  highlights: string[];
  issues: string[];
}

export interface ActionItem {
  priority: 'high' | 'medium' | 'low';
  description: string;
  agentId?: string;
  agentName?: string;
}

export interface BudgetStatus {
  budgetMonthlyCents: number;
  spentMonthlyCents: number;
  burnRatePct: number;
  onTrack: boolean;
}

export interface DailyDigest {
  companyId: string;
  date: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  totalCostCents: number;
  pendingApprovals: number;
  agentEntries: AgentDigestEntry[];
  actionItems: ActionItem[];
  budgetStatus: BudgetStatus | null;
  generatedAt: string;
  llmSummary: string | null;
}

export interface DigestRow {
  id: string;
  companyId: string;
  date: string;
  digest: DailyDigest;
  createdAt: string;
}

export async function getCompanyDigest(companyId: string): Promise<DigestRow | null> {
  try {
    const res = await api<{ digest: DigestRow | null }>(`/companies/${companyId}/digest`);
    return res.digest;
  } catch {
    return null;
  }
}

export async function getCompanyDigestByDate(companyId: string, date: string): Promise<DigestRow | null> {
  try {
    const res = await api<{ digest: DigestRow | null }>(`/companies/${companyId}/digest/${date}`);
    return res.digest;
  } catch {
    return null;
  }
}

export async function getCompanyDigestRange(
  companyId: string,
  from: string,
  to: string
): Promise<DigestRow[]> {
  try {
    const res = await api<{ digests: DigestRow[] }>(
      `/companies/${companyId}/digest/range${buildQs({ from, to })}`
    );
    return res.digests;
  } catch {
    return [];
  }
}

export async function generateCompanyDigest(companyId: string, date?: string): Promise<DigestRow> {
  const res = await api<{ digest: DigestRow }>(`/companies/${companyId}/digest/generate`, {
    method: 'POST',
    body: JSON.stringify({ date }),
  });
  return res.digest;
}
