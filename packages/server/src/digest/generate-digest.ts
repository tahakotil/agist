/**
 * Daily Digest Generator
 *
 * For a given company + date, queries run data, calculates stats,
 * optionally calls an LLM to generate human-readable highlights,
 * and saves the result to the digests table.
 */

import { nanoid } from 'nanoid';
import { all, get, run } from '../db.js';
import { logger } from '../logger.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AgentDigestEntry {
  agentId: string;
  agentName: string;
  runs: number;
  costUsd: number;
  highlights: string[];
  issues: string[];
}

export interface ActionItem {
  description: string;
  priority: 'high' | 'medium' | 'low';
  source: string;
}

export interface BudgetStatus {
  spentToday: number;
  spentMonth: number;
  limitMonth: number;
  burnRate: 'on track' | 'over pace' | 'under budget';
}

export interface DailyDigest {
  id: string;
  date: string;
  companyId: string;
  summary: {
    totalRuns: number;
    successful: number;
    failed: number;
    totalCostUsd: number;
    totalTokens: { input: number; output: number };
  };
  byAgent: AgentDigestEntry[];
  actionItems: ActionItem[];
  budgetStatus: BudgetStatus;
  pendingApprovals: number;
  createdAt: string;
}

// ── DB row types ───────────────────────────────────────────────────────────────

interface RunSummaryRow {
  agent_id: string;
  agent_name: string;
  total_runs: number;
  successful: number;
  failed: number;
  cost_cents: number;
  token_input: number;
  token_output: number;
  sample_log: string | null;
  sample_error: string | null;
}

interface CompanyRow {
  id: string;
  name: string;
  budget_monthly_cents: number;
  spent_monthly_cents: number;
}

interface DigestRow {
  id: string;
  company_id: string;
  date: string;
  content: string;
  created_at: string;
}

// ── LLM call ──────────────────────────────────────────────────────────────────

interface LlmSummary {
  byAgent: Record<string, { highlights: string[]; issues: string[] }>;
  actionItems: ActionItem[];
}

async function callLlmForSummary(
  companyName: string,
  date: string,
  agentStats: RunSummaryRow[]
): Promise<LlmSummary | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.warn('generate-digest: ANTHROPIC_API_KEY not set — skipping LLM summary');
    return null;
  }

  const statsText = agentStats
    .map((a) => {
      const logSnippet = a.sample_log ? a.sample_log.slice(0, 400) : '(no output)';
      const errorSnippet = a.sample_error ? ` Error: ${a.sample_error.slice(0, 200)}` : '';
      return `Agent: ${a.agent_name}
  Runs: ${a.total_runs} (success: ${a.successful}, failed: ${a.failed})
  Cost: $${(a.cost_cents / 100).toFixed(4)}
  Sample output: ${logSnippet}${errorSnippet}`;
    })
    .join('\n\n');

  const prompt = `You are an AI agent fleet manager generating a daily digest for ${companyName} on ${date}.

Here is the run activity summary:

${statsText}

Based on this data, produce a JSON summary with this exact structure:
{
  "byAgent": {
    "<agent_name>": {
      "highlights": ["2-3 bullet strings about what went well"],
      "issues": ["bullet strings about failures or problems, empty array if none"]
    }
  },
  "actionItems": [
    {
      "description": "specific action needed",
      "priority": "high|medium|low",
      "source": "agent_name or 'system'"
    }
  ]
}

Rules:
- highlights: 2-3 concise bullets per agent, only if they had runs
- issues: list failures clearly, empty array if all runs succeeded
- actionItems: only real items needing human attention (failed agents, budget concerns, etc.)
- Keep all text concise and actionable
- Return ONLY the JSON object, no markdown fences`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      logger.warn('generate-digest: LLM call failed', { status: response.status });
      return null;
    }

    const data = await response.json() as {
      content: Array<{ type: string; text?: string }>;
    };
    const text = data.content?.find((c) => c.type === 'text')?.text ?? '';

    try {
      return JSON.parse(text) as LlmSummary;
    } catch {
      logger.warn('generate-digest: failed to parse LLM JSON', { text: text.slice(0, 200) });
      return null;
    }
  } catch (err) {
    logger.warn('generate-digest: LLM fetch error', { error: String(err) });
    return null;
  }
}

// ── Budget burn rate ───────────────────────────────────────────────────────────

function computeBurnRate(
  spentMonth: number,
  limitMonth: number,
  date: string
): BudgetStatus['burnRate'] {
  if (limitMonth === 0) return 'on track'; // unlimited

  // How far through the month are we?
  const d = new Date(date);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const dayOfMonth = d.getDate();
  const fractionElapsed = dayOfMonth / daysInMonth;

  const expectedSpend = limitMonth * fractionElapsed;

  if (spentMonth > limitMonth) return 'over pace';
  if (spentMonth > expectedSpend * 1.1) return 'over pace';
  if (spentMonth < expectedSpend * 0.5) return 'under budget';
  return 'on track';
}

// ── Main generator ─────────────────────────────────────────────────────────────

export async function generateDigest(
  companyId: string,
  date: string // YYYY-MM-DD
): Promise<DailyDigest> {
  logger.info('generate-digest: starting', { companyId, date });

  // Verify company exists
  const company = get<CompanyRow>(`SELECT * FROM companies WHERE id = ?`, [companyId]);
  if (!company) {
    throw new Error(`Company not found: ${companyId}`);
  }

  // Date range for the given day (UTC)
  const dateStart = `${date}T00:00:00.000Z`;
  const dateEnd = `${date}T23:59:59.999Z`;

  // Query run stats grouped by agent for the date
  const agentStats = all<RunSummaryRow>(
    `SELECT
       r.agent_id,
       a.name as agent_name,
       COUNT(*) as total_runs,
       SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END) as successful,
       SUM(CASE WHEN r.status IN ('failed', 'timeout') THEN 1 ELSE 0 END) as failed,
       COALESCE(SUM(r.cost_cents), 0) as cost_cents,
       COALESCE(SUM(r.token_input), 0) as token_input,
       COALESCE(SUM(r.token_output), 0) as token_output,
       MAX(r.log_excerpt) as sample_log,
       MAX(r.error) as sample_error
     FROM runs r
     JOIN agents a ON a.id = r.agent_id
     WHERE r.company_id = ?
       AND r.created_at >= ?
       AND r.created_at <= ?
       AND r.status NOT IN ('queued', 'running')
     GROUP BY r.agent_id, a.name`,
    [companyId, dateStart, dateEnd]
  );

  // Aggregate totals
  let totalRuns = 0;
  let totalSuccessful = 0;
  let totalFailed = 0;
  let totalCostCents = 0;
  let totalTokenInput = 0;
  let totalTokenOutput = 0;

  for (const a of agentStats) {
    totalRuns += Number(a.total_runs);
    totalSuccessful += Number(a.successful);
    totalFailed += Number(a.failed);
    totalCostCents += Number(a.cost_cents);
    totalTokenInput += Number(a.token_input);
    totalTokenOutput += Number(a.token_output);
  }

  // Count pending approval gates
  let pendingApprovals = 0;
  try {
    const gateRow = get<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM approval_gates WHERE company_id = ? AND status = 'pending'`,
      [companyId]
    );
    pendingApprovals = gateRow?.cnt ?? 0;
  } catch {
    // approval_gates table may not exist in older DBs
    pendingApprovals = 0;
  }

  // Budget status
  const budgetStatus: BudgetStatus = {
    spentToday: totalCostCents / 100,
    spentMonth: company.spent_monthly_cents / 100,
    limitMonth: company.budget_monthly_cents / 100,
    burnRate: computeBurnRate(company.spent_monthly_cents, company.budget_monthly_cents, date),
  };

  // LLM-generated highlights (optional, best-effort)
  let llmSummary: LlmSummary | null = null;
  if (agentStats.length > 0) {
    llmSummary = await callLlmForSummary(company.name, date, agentStats);
  }

  // Build byAgent array
  const byAgent: AgentDigestEntry[] = agentStats.map((a) => {
    const llmAgent = llmSummary?.byAgent?.[a.agent_name];
    return {
      agentId: a.agent_id,
      agentName: a.agent_name,
      runs: Number(a.total_runs),
      costUsd: Number(a.cost_cents) / 100,
      highlights: llmAgent?.highlights ?? (Number(a.successful) > 0
        ? [`${a.successful} run(s) completed successfully`]
        : []),
      issues: llmAgent?.issues ?? (Number(a.failed) > 0
        ? [`${a.failed} run(s) failed`]
        : []),
    };
  });

  // Action items from LLM or auto-generated
  let actionItems: ActionItem[] = [];

  if (llmSummary?.actionItems) {
    actionItems = llmSummary.actionItems;
  } else {
    // Auto-generate action items from data
    if (pendingApprovals > 0) {
      actionItems.push({
        description: `${pendingApprovals} approval gate(s) pending review`,
        priority: 'high',
        source: 'system',
      });
    }
    for (const a of agentStats) {
      if (Number(a.failed) > 0) {
        actionItems.push({
          description: `${a.agent_name} had ${a.failed} failed run(s) — review logs`,
          priority: Number(a.failed) > 2 ? 'high' : 'medium',
          source: a.agent_name,
        });
      }
    }
    if (budgetStatus.burnRate === 'over pace') {
      actionItems.push({
        description: `Budget burn rate is above expected pace for ${company.name}`,
        priority: 'medium',
        source: 'system',
      });
    }
  }

  const digest: DailyDigest = {
    id: nanoid(),
    date,
    companyId,
    summary: {
      totalRuns,
      successful: totalSuccessful,
      failed: totalFailed,
      totalCostUsd: totalCostCents / 100,
      totalTokens: { input: totalTokenInput, output: totalTokenOutput },
    },
    byAgent,
    actionItems,
    budgetStatus,
    pendingApprovals,
    createdAt: new Date().toISOString(),
  };

  // Save to digests table (upsert by company_id + date)
  const existing = get<DigestRow>(
    `SELECT id FROM digests WHERE company_id = ? AND date = ?`,
    [companyId, date]
  );

  const contentJson = JSON.stringify(digest);

  if (existing) {
    run(
      `UPDATE digests SET content = ?, created_at = ? WHERE company_id = ? AND date = ?`,
      [contentJson, digest.createdAt, companyId, date]
    );
    digest.id = existing.id; // Keep the original ID
  } else {
    run(
      `INSERT INTO digests (id, company_id, date, content, created_at) VALUES (?, ?, ?, ?, ?)`,
      [digest.id, companyId, date, contentJson, digest.createdAt]
    );
  }

  logger.info('generate-digest: completed', {
    companyId,
    date,
    totalRuns,
    totalCostCents,
    agentCount: byAgent.length,
  });

  return digest;
}
