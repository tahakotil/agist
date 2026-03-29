import type { Database } from "sql.js";
import { nanoid } from "nanoid";
import type {
  Company,
  Agent,
  Routine,
  Run,
  Issue,
} from "@agist/shared";
import type {
  CreateCompanyInput,
  UpdateCompanyInput,
  CreateAgentInput,
  UpdateAgentInput,
  CreateRoutineInput,
  UpdateRoutineInput,
  CreateRunInput,
  UpdateRunStatusInput,
  CreateIssueInput,
  UpdateIssueInput,
} from "@agist/shared";

// ─── sql.js helpers ───────────────────────────────────────────────────────────

function dbAll<T = Record<string, unknown>>(db: Database, sql: string, params: unknown[] = []): T[] {
  const stmt = db.prepare(sql);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (params.length) stmt.bind(params as any);
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

function dbGet<T = Record<string, unknown>>(db: Database, sql: string, params: unknown[] = []): T | undefined {
  return dbAll<T>(db, sql, params)[0];
}

function dbRun(db: Database, sql: string, params: unknown[] = []): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.run(sql, params as any);
  return db.getRowsModified();
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function id(): string {
  return nanoid();
}

// SQLite stores booleans as INTEGER (0/1). Map back to boolean.
function rowToRoutine(row: Record<string, unknown>): Routine {
  return {
    ...(row as unknown as Routine),
    id: row["id"] as string,
    companyId: row["company_id"] as string,
    agentId: row["agent_id"] as string,
    title: row["title"] as string,
    description: (row["description"] as string | null) ?? null,
    cronExpression: row["cron_expression"] as string,
    timezone: row["timezone"] as string,
    enabled: Boolean(row["enabled"]),
    lastRunAt: (row["last_run_at"] as string | null) ?? null,
    nextRunAt: (row["next_run_at"] as string | null) ?? null,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  };
}

function rowToCompany(row: Record<string, unknown>): Company {
  return {
    id: row["id"] as string,
    name: row["name"] as string,
    description: (row["description"] as string | null) ?? null,
    status: row["status"] as Company["status"],
    budgetMonthlyCents: row["budget_monthly_cents"] as number,
    spentMonthlyCents: row["spent_monthly_cents"] as number,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  };
}

function rowToAgent(row: Record<string, unknown>): Agent {
  let adapterConfig: Record<string, unknown> = {};
  try {
    adapterConfig = JSON.parse((row["adapter_config"] as string) ?? "{}") as Record<string, unknown>;
  } catch {
    adapterConfig = {};
  }
  return {
    id: row["id"] as string,
    companyId: row["company_id"] as string,
    name: row["name"] as string,
    role: row["role"] as Agent["role"],
    title: (row["title"] as string | null) ?? null,
    model: (row["model"] as string | null) ?? null,
    capabilities: (row["capabilities"] as string | null) ?? null,
    status: row["status"] as Agent["status"],
    reportsTo: (row["reports_to"] as string | null) ?? null,
    adapterType: row["adapter_type"] as string,
    adapterConfig,
    budgetMonthlyCents: row["budget_monthly_cents"] as number,
    spentMonthlyCents: row["spent_monthly_cents"] as number,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  };
}

function rowToRun(row: Record<string, unknown>): Run {
  return {
    id: row["id"] as string,
    agentId: row["agent_id"] as string,
    companyId: row["company_id"] as string,
    routineId: (row["routine_id"] as string | null) ?? null,
    status: row["status"] as Run["status"],
    model: (row["model"] as string | null) ?? null,
    source: row["source"] as string,
    startedAt: (row["started_at"] as string | null) ?? null,
    finishedAt: (row["finished_at"] as string | null) ?? null,
    exitCode: (row["exit_code"] as number | null) ?? null,
    error: (row["error"] as string | null) ?? null,
    tokenInput: row["token_input"] as number,
    tokenOutput: row["token_output"] as number,
    costCents: row["cost_cents"] as number,
    logExcerpt: (row["log_excerpt"] as string | null) ?? null,
    createdAt: row["created_at"] as string,
  };
}

function rowToIssue(row: Record<string, unknown>): Issue {
  return {
    id: row["id"] as string,
    companyId: row["company_id"] as string,
    projectId: (row["project_id"] as string | null) ?? null,
    agentId: (row["agent_id"] as string | null) ?? null,
    title: row["title"] as string,
    description: (row["description"] as string | null) ?? null,
    status: row["status"] as Issue["status"],
    priority: row["priority"] as Issue["priority"],
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  };
}

// ─── companies ────────────────────────────────────────────────────────────────

export function makeCompanyQueries(db: Database) {
  return {
    list(): Company[] {
      return dbAll<Record<string, unknown>>(db, "SELECT * FROM companies ORDER BY created_at DESC").map(rowToCompany);
    },

    getById(companyId: string): Company | undefined {
      const row = dbGet<Record<string, unknown>>(db, "SELECT * FROM companies WHERE id = ?", [companyId]);
      return row ? rowToCompany(row) : undefined;
    },

    create(input: CreateCompanyInput): Company {
      const newId = id();
      const ts = now();
      dbRun(
        db,
        `INSERT INTO companies (id, name, description, status, budget_monthly_cents, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [newId, input.name, input.description ?? null, input.status ?? "active", input.budgetMonthlyCents ?? 0, ts, ts]
      );
      return rowToCompany(dbGet<Record<string, unknown>>(db, "SELECT * FROM companies WHERE id = ?", [newId])!);
    },

    update(companyId: string, input: UpdateCompanyInput): Company | undefined {
      const existing = dbGet<Record<string, unknown>>(db, "SELECT * FROM companies WHERE id = ?", [companyId]);
      if (!existing) return undefined;

      const fields: string[] = [];
      const values: unknown[] = [];

      if (input.name !== undefined) { fields.push("name = ?"); values.push(input.name); }
      if (input.description !== undefined) { fields.push("description = ?"); values.push(input.description); }
      if (input.status !== undefined) { fields.push("status = ?"); values.push(input.status); }
      if (input.budgetMonthlyCents !== undefined) { fields.push("budget_monthly_cents = ?"); values.push(input.budgetMonthlyCents); }
      if (input.spentMonthlyCents !== undefined) { fields.push("spent_monthly_cents = ?"); values.push(input.spentMonthlyCents); }

      if (fields.length === 0) return rowToCompany(existing);

      fields.push("updated_at = ?");
      values.push(now());
      values.push(companyId);

      dbRun(db, `UPDATE companies SET ${fields.join(", ")} WHERE id = ?`, values);
      return rowToCompany(dbGet<Record<string, unknown>>(db, "SELECT * FROM companies WHERE id = ?", [companyId])!);
    },

    delete(companyId: string): boolean {
      return dbRun(db, "DELETE FROM companies WHERE id = ?", [companyId]) > 0;
    },
  };
}

// ─── agents ───────────────────────────────────────────────────────────────────

export function makeAgentQueries(db: Database) {
  return {
    listByCompany(companyId: string): Agent[] {
      return dbAll<Record<string, unknown>>(db, "SELECT * FROM agents WHERE company_id = ? ORDER BY created_at DESC", [companyId]).map(rowToAgent);
    },

    getById(agentId: string): Agent | undefined {
      const row = dbGet<Record<string, unknown>>(db, "SELECT * FROM agents WHERE id = ?", [agentId]);
      return row ? rowToAgent(row) : undefined;
    },

    create(input: CreateAgentInput): Agent {
      const newId = id();
      const ts = now();
      dbRun(
        db,
        `INSERT INTO agents
           (id, company_id, name, role, title, model, capabilities, status,
            reports_to, adapter_type, adapter_config, budget_monthly_cents,
            spent_monthly_cents, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [
          newId,
          input.companyId,
          input.name,
          input.role,
          input.title ?? null,
          input.model ?? null,
          input.capabilities ?? null,
          input.status ?? "idle",
          input.reportsTo ?? null,
          input.adapterType,
          JSON.stringify(input.adapterConfig ?? {}),
          input.budgetMonthlyCents ?? 0,
          ts,
          ts,
        ]
      );
      return rowToAgent(dbGet<Record<string, unknown>>(db, "SELECT * FROM agents WHERE id = ?", [newId])!);
    },

    update(agentId: string, input: UpdateAgentInput): Agent | undefined {
      const existing = dbGet<Record<string, unknown>>(db, "SELECT * FROM agents WHERE id = ?", [agentId]);
      if (!existing) return undefined;

      const fields: string[] = [];
      const values: unknown[] = [];

      if (input.name !== undefined) { fields.push("name = ?"); values.push(input.name); }
      if (input.role !== undefined) { fields.push("role = ?"); values.push(input.role); }
      if (input.title !== undefined) { fields.push("title = ?"); values.push(input.title); }
      if (input.model !== undefined) { fields.push("model = ?"); values.push(input.model); }
      if (input.capabilities !== undefined) { fields.push("capabilities = ?"); values.push(input.capabilities); }
      if (input.status !== undefined) { fields.push("status = ?"); values.push(input.status); }
      if (input.reportsTo !== undefined) { fields.push("reports_to = ?"); values.push(input.reportsTo); }
      if (input.adapterType !== undefined) { fields.push("adapter_type = ?"); values.push(input.adapterType); }
      if (input.adapterConfig !== undefined) { fields.push("adapter_config = ?"); values.push(JSON.stringify(input.adapterConfig)); }
      if (input.budgetMonthlyCents !== undefined) { fields.push("budget_monthly_cents = ?"); values.push(input.budgetMonthlyCents); }
      if (input.spentMonthlyCents !== undefined) { fields.push("spent_monthly_cents = ?"); values.push(input.spentMonthlyCents); }

      if (fields.length === 0) return rowToAgent(existing);

      fields.push("updated_at = ?");
      values.push(now());
      values.push(agentId);

      dbRun(db, `UPDATE agents SET ${fields.join(", ")} WHERE id = ?`, values);
      return rowToAgent(dbGet<Record<string, unknown>>(db, "SELECT * FROM agents WHERE id = ?", [agentId])!);
    },

    delete(agentId: string): boolean {
      return dbRun(db, "DELETE FROM agents WHERE id = ?", [agentId]) > 0;
    },
  };
}

// ─── routines ─────────────────────────────────────────────────────────────────

export function makeRoutineQueries(db: Database) {
  return {
    listByCompany(companyId: string): Routine[] {
      return dbAll<Record<string, unknown>>(db, "SELECT * FROM routines WHERE company_id = ? ORDER BY created_at DESC", [companyId]).map(rowToRoutine);
    },

    listByAgent(agentId: string): Routine[] {
      return dbAll<Record<string, unknown>>(db, "SELECT * FROM routines WHERE agent_id = ? ORDER BY created_at DESC", [agentId]).map(rowToRoutine);
    },

    getById(routineId: string): Routine | undefined {
      const row = dbGet<Record<string, unknown>>(db, "SELECT * FROM routines WHERE id = ?", [routineId]);
      return row ? rowToRoutine(row) : undefined;
    },

    create(input: CreateRoutineInput): Routine {
      const newId = id();
      const ts = now();
      dbRun(
        db,
        `INSERT INTO routines
           (id, company_id, agent_id, title, description, cron_expression,
            timezone, enabled, last_run_at, next_run_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId,
          input.companyId,
          input.agentId,
          input.title,
          input.description ?? null,
          input.cronExpression,
          input.timezone ?? "UTC",
          input.enabled !== false ? 1 : 0,
          null,
          input.nextRunAt ?? null,
          ts,
          ts,
        ]
      );
      return rowToRoutine(dbGet<Record<string, unknown>>(db, "SELECT * FROM routines WHERE id = ?", [newId])!);
    },

    update(routineId: string, input: UpdateRoutineInput): Routine | undefined {
      const existing = dbGet<Record<string, unknown>>(db, "SELECT * FROM routines WHERE id = ?", [routineId]);
      if (!existing) return undefined;

      const fields: string[] = [];
      const values: unknown[] = [];

      if (input.title !== undefined) { fields.push("title = ?"); values.push(input.title); }
      if (input.description !== undefined) { fields.push("description = ?"); values.push(input.description); }
      if (input.cronExpression !== undefined) { fields.push("cron_expression = ?"); values.push(input.cronExpression); }
      if (input.timezone !== undefined) { fields.push("timezone = ?"); values.push(input.timezone); }
      if (input.enabled !== undefined) { fields.push("enabled = ?"); values.push(input.enabled ? 1 : 0); }
      if (input.lastRunAt !== undefined) { fields.push("last_run_at = ?"); values.push(input.lastRunAt); }
      if (input.nextRunAt !== undefined) { fields.push("next_run_at = ?"); values.push(input.nextRunAt); }

      if (fields.length === 0) return rowToRoutine(existing);

      fields.push("updated_at = ?");
      values.push(now());
      values.push(routineId);

      dbRun(db, `UPDATE routines SET ${fields.join(", ")} WHERE id = ?`, values);
      return rowToRoutine(dbGet<Record<string, unknown>>(db, "SELECT * FROM routines WHERE id = ?", [routineId])!);
    },

    delete(routineId: string): boolean {
      return dbRun(db, "DELETE FROM routines WHERE id = ?", [routineId]) > 0;
    },
  };
}

// ─── runs ─────────────────────────────────────────────────────────────────────

export function makeRunQueries(db: Database) {
  return {
    listByAgent(agentId: string, limit = 50): Run[] {
      return dbAll<Record<string, unknown>>(db, "SELECT * FROM runs WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?", [agentId, limit]).map(rowToRun);
    },

    getById(runId: string): Run | undefined {
      const row = dbGet<Record<string, unknown>>(db, "SELECT * FROM runs WHERE id = ?", [runId]);
      return row ? rowToRun(row) : undefined;
    },

    create(input: CreateRunInput): Run {
      const newId = id();
      const ts = now();
      dbRun(
        db,
        `INSERT INTO runs
           (id, agent_id, company_id, routine_id, status, model, source,
            started_at, finished_at, exit_code, error, token_input,
            token_output, cost_cents, log_excerpt, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 0, 0, 0, NULL, ?)`,
        [
          newId,
          input.agentId,
          input.companyId,
          input.routineId ?? null,
          input.status ?? "queued",
          input.model ?? null,
          input.source,
          input.startedAt ?? null,
          ts,
        ]
      );
      return rowToRun(dbGet<Record<string, unknown>>(db, "SELECT * FROM runs WHERE id = ?", [newId])!);
    },

    updateStatus(runId: string, input: UpdateRunStatusInput): Run | undefined {
      const existing = dbGet<Record<string, unknown>>(db, "SELECT * FROM runs WHERE id = ?", [runId]);
      if (!existing) return undefined;

      const fields: string[] = [];
      const values: unknown[] = [];

      fields.push("status = ?");
      values.push(input.status);

      if (input.startedAt !== undefined) { fields.push("started_at = ?"); values.push(input.startedAt); }
      if (input.finishedAt !== undefined) { fields.push("finished_at = ?"); values.push(input.finishedAt); }
      if (input.exitCode !== undefined) { fields.push("exit_code = ?"); values.push(input.exitCode); }
      if (input.error !== undefined) { fields.push("error = ?"); values.push(input.error); }
      if (input.tokenInput !== undefined) { fields.push("token_input = ?"); values.push(input.tokenInput); }
      if (input.tokenOutput !== undefined) { fields.push("token_output = ?"); values.push(input.tokenOutput); }
      if (input.costCents !== undefined) { fields.push("cost_cents = ?"); values.push(input.costCents); }
      if (input.logExcerpt !== undefined) { fields.push("log_excerpt = ?"); values.push(input.logExcerpt); }

      values.push(runId);
      dbRun(db, `UPDATE runs SET ${fields.join(", ")} WHERE id = ?`, values);
      return rowToRun(dbGet<Record<string, unknown>>(db, "SELECT * FROM runs WHERE id = ?", [runId])!);
    },

    getLatestByAgent(agentId: string): Run | undefined {
      const row = dbGet<Record<string, unknown>>(db, "SELECT * FROM runs WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1", [agentId]);
      return row ? rowToRun(row) : undefined;
    },

    delete(runId: string): boolean {
      return dbRun(db, "DELETE FROM runs WHERE id = ?", [runId]) > 0;
    },
  };
}

// ─── issues ───────────────────────────────────────────────────────────────────

export function makeIssueQueries(db: Database) {
  return {
    listByCompany(companyId: string): Issue[] {
      return dbAll<Record<string, unknown>>(db, "SELECT * FROM issues WHERE company_id = ? ORDER BY created_at DESC", [companyId]).map(rowToIssue);
    },

    getById(issueId: string): Issue | undefined {
      const row = dbGet<Record<string, unknown>>(db, "SELECT * FROM issues WHERE id = ?", [issueId]);
      return row ? rowToIssue(row) : undefined;
    },

    create(input: CreateIssueInput): Issue {
      const newId = id();
      const ts = now();
      dbRun(
        db,
        `INSERT INTO issues
           (id, company_id, project_id, agent_id, title, description,
            status, priority, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId,
          input.companyId,
          input.projectId ?? null,
          input.agentId ?? null,
          input.title,
          input.description ?? null,
          input.status ?? "backlog",
          input.priority ?? "medium",
          ts,
          ts,
        ]
      );
      return rowToIssue(dbGet<Record<string, unknown>>(db, "SELECT * FROM issues WHERE id = ?", [newId])!);
    },

    update(issueId: string, input: UpdateIssueInput): Issue | undefined {
      const existing = dbGet<Record<string, unknown>>(db, "SELECT * FROM issues WHERE id = ?", [issueId]);
      if (!existing) return undefined;

      const fields: string[] = [];
      const values: unknown[] = [];

      if (input.projectId !== undefined) { fields.push("project_id = ?"); values.push(input.projectId); }
      if (input.agentId !== undefined) { fields.push("agent_id = ?"); values.push(input.agentId); }
      if (input.title !== undefined) { fields.push("title = ?"); values.push(input.title); }
      if (input.description !== undefined) { fields.push("description = ?"); values.push(input.description); }
      if (input.status !== undefined) { fields.push("status = ?"); values.push(input.status); }
      if (input.priority !== undefined) { fields.push("priority = ?"); values.push(input.priority); }

      if (fields.length === 0) return rowToIssue(existing);

      fields.push("updated_at = ?");
      values.push(now());
      values.push(issueId);

      dbRun(db, `UPDATE issues SET ${fields.join(", ")} WHERE id = ?`, values);
      return rowToIssue(dbGet<Record<string, unknown>>(db, "SELECT * FROM issues WHERE id = ?", [issueId])!);
    },

    delete(issueId: string): boolean {
      return dbRun(db, "DELETE FROM issues WHERE id = ?", [issueId]) > 0;
    },
  };
}
