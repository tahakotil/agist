import { z } from "zod";

// ─── Company ─────────────────────────────────────────────────────────────────

export const CompanyStatusSchema = z.enum(["active", "paused", "archived"]);

export const CreateCompanySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullable().optional(),
  status: CompanyStatusSchema.optional().default("active"),
  budgetMonthlyCents: z.number().int().nonnegative().optional().default(0),
});

export const UpdateCompanySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: CompanyStatusSchema.optional(),
  budgetMonthlyCents: z.number().int().nonnegative().optional(),
  spentMonthlyCents: z.number().int().nonnegative().optional(),
});

export type CreateCompanyInput = z.infer<typeof CreateCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof UpdateCompanySchema>;

// ─── Agent ───────────────────────────────────────────────────────────────────

export const AgentPermissionModeSchema = z.enum(['autonomous', 'supervised', 'readonly', 'custom']);
export const CapsulePrioritySchema = z.enum(['instruction', 'memory', 'ephemeral']);

export const AgentRoleSchema = z.enum([
  "ceo",
  "engineer",
  "devops",
  "marketing",
  "seo",
  "content",
  "research",
  "sales",
  "general",
]);

export const AgentStatusSchema = z.enum(["idle", "running", "paused", "error", "budget_exceeded"]);

export const CreateAgentSchema = z.object({
  companyId: z.string().min(1),
  name: z.string().min(1).max(255),
  role: AgentRoleSchema,
  title: z.string().max(255).nullable().optional(),
  model: z.string().max(100).nullable().optional(),
  capabilities: z.string().max(4000).nullable().optional(),
  status: AgentStatusSchema.optional().default("idle"),
  reportsTo: z.string().nullable().optional(),
  adapterType: z.string().min(1).max(100),
  adapterConfig: z.record(z.unknown()).optional().default({}),
  workingDirectory: z.string().max(500).optional(),
  budgetMonthlyCents: z.number().int().nonnegative().optional().default(0),
  permissionMode: AgentPermissionModeSchema.optional().default('supervised'),
  systemPrompt: z.string().max(10000).optional().default(''),
});

export const UpdateAgentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  role: AgentRoleSchema.optional(),
  title: z.string().max(255).nullable().optional(),
  model: z.string().max(100).nullable().optional(),
  capabilities: z.string().max(4000).nullable().optional(),
  status: AgentStatusSchema.optional(),
  reportsTo: z.string().nullable().optional(),
  adapterType: z.string().min(1).max(100).optional(),
  adapterConfig: z.record(z.unknown()).optional(),
  workingDirectory: z.string().max(500).nullable().optional(),
  budgetMonthlyCents: z.number().int().nonnegative().optional(),
  spentMonthlyCents: z.number().int().nonnegative().optional(),
  permissionMode: AgentPermissionModeSchema.optional(),
  systemPrompt: z.string().max(10000).optional(),
});

export type CreateAgentInput = z.infer<typeof CreateAgentSchema>;
export type UpdateAgentInput = z.infer<typeof UpdateAgentSchema>;

// ─── Routine ──────────────────────────────────────────────────────────────────

export const CreateRoutineSchema = z.object({
  companyId: z.string().min(1),
  agentId: z.string().min(1),
  title: z.string().min(1).max(255),
  description: z.string().max(2000).nullable().optional(),
  cronExpression: z.string().min(1).max(100),
  timezone: z.string().min(1).max(100).optional().default("UTC"),
  enabled: z.boolean().optional().default(true),
  nextRunAt: z.string().nullable().optional(),
});

export const UpdateRoutineSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  cronExpression: z.string().min(1).max(100).optional(),
  timezone: z.string().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
  lastRunAt: z.string().nullable().optional(),
  nextRunAt: z.string().nullable().optional(),
});

export type CreateRoutineInput = z.infer<typeof CreateRoutineSchema>;
export type UpdateRoutineInput = z.infer<typeof UpdateRoutineSchema>;

// ─── Run ──────────────────────────────────────────────────────────────────────

export const RunStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "timeout",
  "cancelled",
]);

export const RunSourceSchema = z.enum(["schedule", "manual", "event", "routine", "system"]);

export const CreateRunSchema = z.object({
  agentId: z.string().min(1),
  companyId: z.string().min(1),
  routineId: z.string().nullable().optional(),
  status: RunStatusSchema.optional().default("queued"),
  model: z.string().max(100).nullable().optional(),
  source: RunSourceSchema,
  startedAt: z.string().nullable().optional(),
});

export const UpdateRunStatusSchema = z.object({
  status: RunStatusSchema,
  startedAt: z.string().nullable().optional(),
  finishedAt: z.string().nullable().optional(),
  exitCode: z.number().int().nullable().optional(),
  error: z.string().max(4000).nullable().optional(),
  tokenInput: z.number().int().nonnegative().optional(),
  tokenOutput: z.number().int().nonnegative().optional(),
  costCents: z.number().int().nonnegative().optional(),
  logExcerpt: z.string().max(10000).nullable().optional(),
});

export type CreateRunInput = z.infer<typeof CreateRunSchema>;
export type UpdateRunStatusInput = z.infer<typeof UpdateRunStatusSchema>;

// ─── Issue ────────────────────────────────────────────────────────────────────

export const IssuePrioritySchema = z.enum(["critical", "high", "medium", "low"]);
export const IssueStatusSchema = z.enum([
  "open",
  "in_progress",
  "resolved",
  "closed",
  "wont_fix",
]);

export const RoutineStatusSchema = z.enum(["active", "paused"]);

export const CreateIssueSchema = z.object({
  companyId: z.string().min(1),
  projectId: z.string().nullable().optional(),
  agentId: z.string().nullable().optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(10000).nullable().optional(),
  status: IssueStatusSchema.optional().default("open"),
  priority: IssuePrioritySchema.optional().default("medium"),
});

export const UpdateIssueSchema = z.object({
  projectId: z.string().nullable().optional(),
  agentId: z.string().nullable().optional(),
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).nullable().optional(),
  status: IssueStatusSchema.optional(),
  priority: IssuePrioritySchema.optional(),
});

export type CreateIssueInput = z.infer<typeof CreateIssueSchema>;
export type UpdateIssueInput = z.infer<typeof UpdateIssueSchema>;

// ─── ApprovalGate ─────────────────────────────────────────────────────────────

export const ApprovalGateStatusSchema = z.enum(["pending", "approved", "rejected"]);

export const CreateApprovalGateSchema = z.object({
  agentId: z.string().min(1),
  gateType: z.string().min(1).max(100),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional().default(''),
  payload: z.record(z.unknown()).optional().default({}),
  autoCreated: z.boolean().optional().default(false),
});

export const DecideApprovalGateSchema = z.object({
  decidedBy: z.string().max(255).optional().default('human'),
});

export type CreateApprovalGateInput = z.infer<typeof CreateApprovalGateSchema>;
export type DecideApprovalGateInput = z.infer<typeof DecideApprovalGateSchema>;
