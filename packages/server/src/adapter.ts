import { spawn } from 'child_process';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { access } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { run, get, all } from './db.js';
import { nanoid } from 'nanoid';
import { pushToAgent } from './ws.js';
import { broadcast } from './sse.js';
import { logger } from './logger.js';
import { incRun, incRunsActive, decRunsActive, addTokens } from './metrics.js';
import { dispatchWebhooks } from './webhooks.js';
import { sendSlackNotification } from './integrations/slack.js';
import { createGitHubIssue } from './integrations/github.js';
import { getAdapter, getDefaultAdapter } from './adapters/index.js';
import { estimateCostCents } from './adapters/cost.js';
import { parseAgentOutputs } from './output-parser.js';
import { parseStructuredOutput } from './parser/parse-output.js';
import { ensureWorkspace, slugify } from './workspace.js';
import { audit } from './audit.js';

const LOG_EXCERPT_MAX_CHARS = 50_000;

function capLogExcerpt(lines: string[]): string {
  const joined = lines.join('\n');
  if (joined.length <= LOG_EXCERPT_MAX_CHARS) return joined;
  const truncated = joined.slice(-LOG_EXCERPT_MAX_CHARS);
  return '[... truncated ...]\n' + truncated;
}

export interface RunAdapterOptions {
  runId: string;
  agentId: string;
  companyId: string;
  model: string;
  prompt: string;
  workingDirectory?: string | null;
  adapterConfig?: Record<string, unknown>;
  /** Optional: override which adapter to use (e.g. 'mock', 'anthropic-api', 'openai') */
  adapterType?: string;
  /** Chain depth for wake chains — 0 = direct trigger, increments each hop */
  chainDepth?: number;
  /** Slug of the agent that initiated the wake chain (if any) */
  sourceAgentSlug?: string;
}

const MAX_CHAIN_DEPTH = 5;

interface WakeChainRequest {
  target_agent_slug: string;
  reason: string;
  priority?: string;
  context?: string;
}

/** Matches single-level JSON objects containing __agist_wake key */
const WAKE_CHAIN_REGEX = /\{"__agist_wake":\s*\{[^}]*\}\}/g;

/** Matches JSON objects containing __agist_approval key */
const APPROVAL_REGEX = /\{"__agist_approval":\s*\{[^}]*\}\}/g;

interface ApprovalRequest {
  gate_type: string;
  title: string;
  description?: string;
  payload?: Record<string, unknown>;
}

/**
 * Parse __agist_approval markers from agent stdout.
 * Returns array of approval gate requests, empty if none found.
 */
export function parseApprovalRequests(output: string): ApprovalRequest[] {
  const results: ApprovalRequest[] = [];
  const matches = output.match(APPROVAL_REGEX);
  if (!matches) return results;

  for (const match of matches) {
    try {
      const parsed = JSON.parse(match) as { __agist_approval?: ApprovalRequest };
      const req = parsed.__agist_approval;
      if (req?.gate_type && req?.title) {
        results.push({
          gate_type: req.gate_type,
          title: req.title,
          description: typeof req.description === 'string' ? req.description : '',
          payload: typeof req.payload === 'object' && req.payload !== null ? req.payload : {},
        });
      }
    } catch {
      // Malformed JSON — skip
    }
  }

  return results;
}

/**
 * Parse __agist_wake markers from agent stdout.
 * Returns array of wake chain requests, empty if none found.
 */
export function parseWakeChains(output: string): WakeChainRequest[] {
  const results: WakeChainRequest[] = [];
  const matches = output.match(WAKE_CHAIN_REGEX);
  if (!matches) return results;

  for (const match of matches) {
    try {
      const parsed = JSON.parse(match) as { __agist_wake?: WakeChainRequest };
      const wake = parsed.__agist_wake;
      if (wake?.target_agent_slug && typeof wake.target_agent_slug === 'string') {
        results.push({
          target_agent_slug: wake.target_agent_slug.trim(),
          reason: typeof wake.reason === 'string' ? wake.reason : '',
          priority: typeof wake.priority === 'string' ? wake.priority : undefined,
          context: typeof wake.context === 'string' ? wake.context : undefined,
        });
      }
    } catch {
      // Malformed JSON — skip
    }
  }

  return results;
}

/**
 * Fire-and-forget: execute wake chains triggered by a completed agent run.
 * Finds each target agent by slug, creates a run record, and spawns Claude.
 * Respects MAX_CHAIN_DEPTH to prevent infinite loops.
 */
async function executeWakeChains(
  wakeChains: WakeChainRequest[],
  sourceAgentId: string,
  sourceAgentSlugForChain: string,
  companyId: string,
  currentChainDepth: number
): Promise<void> {
  if (wakeChains.length === 0) return;
  const nextDepth = currentChainDepth + 1;
  if (nextDepth >= MAX_CHAIN_DEPTH) {
    logger.warn('Wake chain depth limit reached — not executing further chains', {
      sourceAgentId,
      currentChainDepth,
      MAX_CHAIN_DEPTH,
    });
    return;
  }

  for (const wakeReq of wakeChains) {
    try {
      const targetAgent = get<{
        id: string;
        company_id: string;
        name: string;
        slug: string | null;
        model: string;
        status: string;
        adapter_type: string;
        adapter_config: string;
        working_directory: string | null;
        title: string;
      }>(`SELECT id, company_id, name, slug, model, status, adapter_type, adapter_config, working_directory, title
          FROM agents WHERE slug = ? AND company_id = ?`,
        [wakeReq.target_agent_slug, companyId]
      );

      if (!targetAgent) {
        logger.warn('Wake chain: target agent not found', {
          sourceAgentId,
          targetSlug: wakeReq.target_agent_slug,
          companyId,
        });
        continue;
      }

      if (targetAgent.status === 'running') {
        logger.info('Wake chain: target agent already running — skipping', {
          sourceAgentId,
          targetAgentId: targetAgent.id,
          targetSlug: wakeReq.target_agent_slug,
        });
        continue;
      }

      const runId = nanoid();
      const now = new Date().toISOString();
      const source = `chain:${sourceAgentSlugForChain}`;

      run(
        `INSERT INTO runs (id, agent_id, company_id, routine_id, status, model, source, chain_depth, created_at)
         VALUES (?, ?, ?, NULL, 'queued', ?, ?, ?, ?)`,
        [runId, targetAgent.id, companyId, targetAgent.model, source, nextDepth, now]
      );

      const adapterConfig = (() => {
        try { return JSON.parse(targetAgent.adapter_config) as Record<string, unknown>; }
        catch { return {}; }
      })();

      const wakePrompt = [
        wakeReq.reason || `Wake request from ${sourceAgentSlugForChain}`,
        wakeReq.context ? `\nContext: ${wakeReq.context}` : '',
        wakeReq.priority ? `\nPriority: ${wakeReq.priority}` : '',
      ].join('').trim();

      logger.info('Wake chain: spawning target agent', {
        sourceAgentId,
        targetAgentId: targetAgent.id,
        targetSlug: wakeReq.target_agent_slug,
        nextDepth,
        source,
      });

      // Fire-and-forget — don't await to avoid blocking source agent completion
      spawnClaudeLocal({
        runId,
        agentId: targetAgent.id,
        companyId,
        model: targetAgent.model,
        prompt: wakePrompt,
        workingDirectory: targetAgent.working_directory ?? null,
        adapterConfig,
        adapterType: targetAgent.adapter_type,
        chainDepth: nextDepth,
        sourceAgentSlug: sourceAgentSlugForChain,
      }).catch((err: unknown) => {
        logger.error('Wake chain: adapter error', {
          sourceAgentId,
          targetAgentId: targetAgent.id,
          error: String(err),
        });
      });
    } catch (err) {
      logger.error('Wake chain: unexpected error processing wake request', {
        sourceAgentId,
        targetSlug: wakeReq.target_agent_slug,
        error: String(err),
      });
    }
  }
}

interface AgentContext {
  agentName: string;
  agentTitle: string | null;
  agentRole: string;
  capabilities: string | null;
  companyName: string;
  companyDescription: string | null;
  routineTitle: string | null;
  routineDescription: string | null;
  contextCapsule: string | null;
}

/**
 * Parse __agist_context_update__ marker from agent stdout.
 * Returns the extracted capsule content or null if not found.
 */
export function parseContextUpdate(stdout: string): string | null {
  const marker = '__agist_context_update__';
  const idx = stdout.indexOf(marker);
  if (idx === -1) return null;

  const afterMarkerStart = idx + marker.length;
  // Find the closing ``` fence after the marker
  const closingFence = stdout.indexOf('```', afterMarkerStart);
  if (closingFence === -1) {
    // No closing fence — take everything until end (cap at 5000 chars)
    const content = stdout.substring(afterMarkerStart).trim().slice(0, 5000);
    return content || null;
  }

  const content = stdout.substring(afterMarkerStart, closingFence).trim();
  return content || null;
}

interface IncomingSignal {
  id: string;
  source_agent_name: string;
  signal_type: string;
  title: string;
  payload: string;
}

function buildSystemPrompt(ctx: AgentContext, taskPrompt: string, signals?: IncomingSignal[]): string {
  const parts: string[] = [];

  // 1. Context capsule (prepended if available)
  if (ctx.contextCapsule?.trim()) {
    parts.push('## YOUR CONTEXT CAPSULE\n\n' + ctx.contextCapsule);
  }

  // 2. Agent identity block
  const identityLines: string[] = [];
  identityLines.push(`# Agent Identity`);
  identityLines.push(`You are "${ctx.agentName}", a ${ctx.agentRole} agent${ctx.agentTitle ? ` (${ctx.agentTitle})` : ''}.`);
  identityLines.push(`Company: ${ctx.companyName}${ctx.companyDescription ? ` — ${ctx.companyDescription}` : ''}`);

  if (ctx.capabilities) {
    identityLines.push('');
    identityLines.push(`## Capabilities`);
    identityLines.push(ctx.capabilities);
  }

  if (ctx.routineTitle || ctx.routineDescription) {
    identityLines.push('');
    identityLines.push(`## Current Task: ${ctx.routineTitle || 'Manual wake'}`);
    if (ctx.routineDescription) {
      identityLines.push(ctx.routineDescription);
    }
  }

  identityLines.push('');
  identityLines.push(`## Instructions`);
  identityLines.push(taskPrompt);

  identityLines.push('');
  identityLines.push(`## Output Rules`);
  identityLines.push(`- Be concise and action-oriented`);
  identityLines.push(`- Lead with findings or actions taken, not preamble`);
  identityLines.push(`- If nothing changed since last run, say "STATUS: NO_CHANGE" with reason`);
  identityLines.push(`- Always include evidence (data, commands run, results) not just conclusions`);

  parts.push(identityLines.join('\n'));

  // 3. Incoming signals from other agents
  if (signals && signals.length > 0) {
    const signalLines: string[] = ['## INCOMING SIGNALS (from other agents)'];
    for (const sig of signals) {
      let payloadObj: Record<string, unknown> = {};
      try { payloadObj = JSON.parse(sig.payload) as Record<string, unknown>; } catch { /* ignore */ }
      const payloadStr = Object.keys(payloadObj).length > 0
        ? `\n  Payload: ${JSON.stringify(payloadObj)}`
        : '';
      signalLines.push(`- [${sig.signal_type}] from ${sig.source_agent_name || 'unknown-agent'}: ${sig.title}${payloadStr}`);
    }
    parts.push(signalLines.join('\n'));
  }

  // 4. Context update instruction
  parts.push(`## CONTEXT UPDATE
If your priorities or state changed, output an update block anywhere in your response:
\`\`\`
__agist_context_update__
IDENTITY: [who you are]
CURRENT PRIORITIES (updated ${new Date().toISOString().split('T')[0]}):
1. ...
LAST ACTION: [timestamp] — [what you did]
NEXT ACTION: [what should happen next]
\`\`\``);

  return parts.join('\n\n---\n\n');
}

function buildSkillDir(ctx: AgentContext): string {
  const base = join(tmpdir(), `agist-skills-${Date.now()}`);
  const skillDir = join(base, '.claude', 'skills');
  mkdirSync(skillDir, { recursive: true });

  // Write agent identity skill
  const skillContent = `---
name: ${ctx.agentName}
description: Agent identity and context for ${ctx.agentName}
---

# ${ctx.agentName}
${ctx.agentTitle ? `**Title:** ${ctx.agentTitle}` : ''}
**Role:** ${ctx.agentRole}
**Company:** ${ctx.companyName}${ctx.companyDescription ? ` — ${ctx.companyDescription}` : ''}

${ctx.capabilities ? `## Capabilities\n${ctx.capabilities}` : ''}

${ctx.routineTitle ? `## Current Routine: ${ctx.routineTitle}\n${ctx.routineDescription || ''}` : ''}
`;

  writeFileSync(join(skillDir, 'SKILL.md'), skillContent, 'utf-8');
  return base;
}

/**
 * Fire-and-forget: dispatch webhooks + Slack + GitHub after a run finishes.
 * Never throws.
 */
function notifyRunFinished(
  companyId: string,
  event: 'run.completed' | 'run.failed',
  runId: string,
  agentId: string,
  errorMsg?: string
): void {
  const runRecord = get<Record<string, unknown>>(`SELECT * FROM runs WHERE id = ?`, [runId])
  const agentRecord = get<Record<string, unknown>>(`SELECT * FROM agents WHERE id = ?`, [agentId])

  const payload: Record<string, unknown> = { run: runRecord, agent: agentRecord }
  if (errorMsg) payload.error = errorMsg

  dispatchWebhooks(companyId, event, payload).catch(() => undefined)

  const slackUrl = process.env.SLACK_WEBHOOK_URL
  if (slackUrl) {
    sendSlackNotification(event, payload, slackUrl).catch(() => undefined)
  }

  if (event === 'run.failed') {
    createGitHubIssue(event, payload).catch(() => undefined)
  }
}

/**
 * Resets spent_monthly_cents to 0 if we've crossed into a new calendar month.
 * Returns the current month string (e.g. "2025-03").
 */
export function maybeResetMonthlySpend(agentId: string): string {
  const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"

  const agentRow = get<{ last_reset_month: string | null; spent_monthly_cents: number }>(
    `SELECT last_reset_month, spent_monthly_cents FROM agents WHERE id = ?`,
    [agentId]
  );

  if (!agentRow) return currentMonth;

  if (agentRow.last_reset_month !== currentMonth) {
    const now = new Date().toISOString();
    run(
      `UPDATE agents SET spent_monthly_cents = 0, last_reset_month = ?, updated_at = ? WHERE id = ?`,
      [currentMonth, now, agentId]
    );
    logger.info('Budget: monthly spend reset', { agentId, month: currentMonth });
  }

  return currentMonth;
}

/**
 * Returns null if budget is OK (or unlimited), or an error string if exceeded.
 */
export function checkAgentBudget(agentId: string): string | null {
  maybeResetMonthlySpend(agentId);

  const agentRow = get<{ budget_monthly_cents: number; spent_monthly_cents: number; status: string }>(
    `SELECT budget_monthly_cents, spent_monthly_cents, status FROM agents WHERE id = ?`,
    [agentId]
  );

  if (!agentRow) return null;

  const { budget_monthly_cents, spent_monthly_cents } = agentRow;

  // 0 = unlimited
  if (budget_monthly_cents === 0) return null;

  if (spent_monthly_cents >= budget_monthly_cents) {
    // Auto-set status to budget_exceeded if not already set
    if (agentRow.status !== 'budget_exceeded') {
      const now = new Date().toISOString();
      run(
        `UPDATE agents SET status = 'budget_exceeded', updated_at = ? WHERE id = ?`,
        [now, agentId]
      );
      broadcast({
        type: 'agent.status',
        data: { agentId, status: 'budget_exceeded' },
      });
      logger.warn('Budget: agent exceeded monthly budget — marking budget_exceeded', {
        agentId,
        budgetCents: budget_monthly_cents,
        spentCents: spent_monthly_cents,
      });
    }
    return `Agent has exceeded its monthly budget (${spent_monthly_cents} / ${budget_monthly_cents} cents)`;
  }

  return null;
}

export async function spawnClaudeLocal(
  options: RunAdapterOptions
): Promise<void> {
  const { runId, agentId, companyId, model, prompt, workingDirectory } = options;

  const now = new Date().toISOString();

  // Fetch agent + company context from DB
  const agentRow = get<Record<string, unknown>>(
    `SELECT a.name, a.slug, a.title, a.role, a.capabilities, a.context_capsule, c.name as company_name, c.description as company_desc
     FROM agents a JOIN companies c ON a.company_id = c.id WHERE a.id = ?`, [agentId]
  );

  // Fetch routine context if this run came from a routine
  const routineRow = get<Record<string, unknown>>(
    `SELECT r.title, r.description FROM routines r
     JOIN runs ru ON ru.routine_id = r.id WHERE ru.id = ?`, [runId]
  );

  const agentName = (agentRow?.name as string) || 'unknown-agent';
  const agentSlug = (agentRow?.slug as string) || slugify(agentName);

  const ctx: AgentContext = {
    agentName,
    agentTitle: (agentRow?.title as string) || null,
    agentRole: (agentRow?.role as string) || 'general',
    capabilities: (agentRow?.capabilities as string) || null,
    companyName: (agentRow?.company_name as string) || 'Unknown Company',
    companyDescription: (agentRow?.company_desc as string) || null,
    routineTitle: (routineRow?.title as string) || null,
    routineDescription: (routineRow?.description as string) || null,
    contextCapsule: (agentRow?.context_capsule as string) || null,
  };

  // Fetch unconsumed signals for this agent (last 24h, max 10)
  interface SignalRow {
    id: string;
    source_agent_name: string;
    signal_type: string;
    title: string;
    payload: string;
  }
  const incomingSignals = all<SignalRow>(
    `SELECT id, source_agent_name, signal_type, title, payload FROM signals
     WHERE company_id = ?
       AND consumed_by NOT LIKE ?
       AND created_at > datetime('now', '-24 hours')
     ORDER BY created_at DESC LIMIT 10`,
    [companyId, `%"${agentId}"%`]
  );

  // Build enriched system prompt (with signal injection)
  const systemPrompt = buildSystemPrompt(ctx, prompt, incomingSignals);

  // Build skill directory for --add-dir
  const skillDir = buildSkillDir(ctx);

  // Set up shared workspace for inter-agent file communication
  const workspacePath = ensureWorkspace(companyId, agentSlug);

  // Validate working directory exists before proceeding
  if (workingDirectory) {
    try {
      await access(workingDirectory);
    } catch {
      const finishedAt = new Date().toISOString();
      const errorMsg = `Working directory not found: ${workingDirectory}`;

      run(
        `UPDATE runs SET status = 'failed', started_at = ?, exit_code = ?, error = ?,
         token_input = 0, token_output = 0, cost_cents = 0, log_excerpt = ?,
         finished_at = ? WHERE id = ?`,
        [now, -1, errorMsg, errorMsg, finishedAt, runId]
      );

      run(
        `UPDATE agents SET status = 'idle', updated_at = ? WHERE id = ?`,
        [finishedAt, agentId]
      );

      incRun('failed');
      logger.error('Working directory not found', { runId, agentId, workingDirectory });

      broadcast({
        type: 'run.completed',
        data: { runId, agentId, companyId, status: 'failed', error: errorMsg },
      });

      pushToAgent(agentId, {
        type: 'log',
        runId,
        line: `[error] ${errorMsg}`,
        timestamp: finishedAt,
      });

      pushToAgent(agentId, { type: 'status', agentId, status: 'idle', runId });

      try { rmSync(skillDir, { recursive: true, force: true }); } catch { /* ignore */ }

      return;
    }
  }

  // Mark run as running
  run(
    `UPDATE runs SET status = 'running', started_at = ? WHERE id = ?`,
    [now, runId]
  );

  run(
    `UPDATE agents SET status = ?, updated_at = ? WHERE id = ?`,
    ['running', now, agentId]
  );

  incRunsActive();
  logger.info('Run started', { runId, agentId, model });

  // Audit: run started
  const agentCompanyId = companyId;
  audit(agentCompanyId, agentId, 'run.started', { runId, model, source: 'adapter' });

  broadcast({
    type: 'agent.status',
    data: { agentId, status: 'running', runId },
  });

  pushToAgent(agentId, { type: 'status', agentId, status: 'running', runId });

  const workspaceInstruction = `\n\n## Shared Workspace\nYour shared workspace is available at: ${workspacePath}\nWrite reports and outputs to: ${workspacePath}/reports/${agentSlug}/\nRead context capsule from: ${workspacePath}/context/${agentSlug}.md\nCross-agent signals are written to: ${workspacePath}/reports/_synergy/signals.jsonl`;

  const args = [
    '--model', model,
    '--print',
    '--verbose',
    '--output-format', 'stream-json',
    '--add-dir', skillDir,
    '--add-dir', workspacePath,
    '-p', systemPrompt + workspaceInstruction,
  ];

  const child = spawn('claude', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: workingDirectory || process.cwd(),
    env: { ...process.env },
  });

  const logLines: string[] = [];
  const plainTextLines: string[] = []; // accumulate non-stream-json lines for output parsing
  let inputTokens = 0;
  let outputTokens = 0;
  let errorOutput = '';

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  child.stdout.on('data', (chunk: string) => {
    const lines = chunk.split('\n').filter((l) => l.trim());
    for (const line of lines) {
      logLines.push(line);
      pushToAgent(agentId, {
        type: 'log',
        runId,
        line,
        timestamp: new Date().toISOString(),
      });

      let isStreamJson = false;
      try {
        const parsed = JSON.parse(line) as StreamJsonChunk;

        // Extract token usage from stream-json events
        if (parsed.type === 'message_start' && parsed.message?.usage) {
          inputTokens = parsed.message.usage.input_tokens ?? inputTokens;
          outputTokens = parsed.message.usage.output_tokens ?? outputTokens;
          isStreamJson = true;
        } else if (parsed.type === 'message_delta' && parsed.usage) {
          outputTokens = parsed.usage.output_tokens ?? outputTokens;
          isStreamJson = true;
        } else if (parsed.usage) {
          inputTokens = parsed.usage.input_tokens ?? inputTokens;
          outputTokens = parsed.usage.output_tokens ?? outputTokens;
          isStreamJson = true;
        } else if (parsed.type) {
          // Other stream-json protocol events (content_block_start, etc.)
          isStreamJson = true;
        }
      } catch {
        // Not JSON — plain text output line
      }

      // Accumulate non-stream lines for structured output parsing
      if (!isStreamJson) {
        plainTextLines.push(line);

        // Parse __agist_approval markers from plain text output
        if (line.includes('__agist_approval')) {
          try {
            const jsonMatch = line.match(/\{.*"__agist_approval".*\}/s);
            if (jsonMatch) {
              const outer = JSON.parse(jsonMatch[0]) as {
                __agist_approval?: {
                  gate_type?: string;
                  title?: string;
                  description?: string;
                  payload?: Record<string, unknown>;
                };
              };
              const req = outer.__agist_approval;
              if (req?.gate_type && req?.title) {
                const gateId = nanoid();
                run(
                  `INSERT INTO approval_gates (id, company_id, agent_id, gate_type, title, description, payload, status, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))`,
                  [gateId, companyId, agentId, req.gate_type, req.title, req.description ?? '', JSON.stringify(req.payload ?? {})]
                );
                logger.info('Agent requested approval gate', { agentId, runId, gateType: req.gate_type, title: req.title });
              }
            }
          } catch (approvalParseErr) {
            logger.warn('Failed to parse __agist_approval', { agentId, runId, error: String(approvalParseErr) });
          }
        }

        // Parse __agist_signal markers from plain text output
        if (line.includes('__agist_signal')) {
          try {
            // Attempt to extract JSON object containing __agist_signal key
            const jsonMatch = line.match(/\{.*"__agist_signal".*\}/s);
            if (jsonMatch) {
              const outer = JSON.parse(jsonMatch[0]) as {
                __agist_signal?: {
                  type?: string;
                  title?: string;
                  payload?: Record<string, unknown>;
                };
              };
              const sig = outer.__agist_signal;
              if (sig?.type && sig?.title) {
                const agentNameForSignal = ctx.agentName;
                const sigId = nanoid();
                run(
                  `INSERT INTO signals (id, company_id, source_agent_id, source_agent_name, signal_type, title, payload, consumed_by, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, '[]', datetime('now'))`,
                  [sigId, companyId, agentId, agentNameForSignal, sig.type, sig.title, JSON.stringify(sig.payload ?? {})]
                );
                const newSigRow = get<Record<string, unknown>>(`SELECT * FROM signals WHERE id = ?`, [sigId]);
                if (newSigRow) {
                  broadcast({
                    type: 'signal.created',
                    data: {
                      id: newSigRow.id,
                      companyId: newSigRow.company_id,
                      sourceAgentId: newSigRow.source_agent_id,
                      sourceAgentName: newSigRow.source_agent_name,
                      signalType: newSigRow.signal_type,
                      title: newSigRow.title,
                      payload: JSON.parse(newSigRow.payload as string || '{}') as Record<string, unknown>,
                      consumedBy: [],
                      createdAt: newSigRow.created_at,
                    },
                  });
                }
                logger.info('Agent emitted signal', { agentId, runId, signalType: sig.type, title: sig.title });
              }
            }
          } catch (sigParseErr) {
            logger.warn('Failed to parse __agist_signal', { agentId, runId, error: String(sigParseErr) });
          }
        }
      }
    }
  });

  child.stderr.on('data', (chunk: string) => {
    errorOutput += chunk;
    logLines.push(`[stderr] ${chunk.trim()}`);
    pushToAgent(agentId, {
      type: 'log',
      runId,
      line: `[stderr] ${chunk.trim()}`,
      timestamp: new Date().toISOString(),
    });
  });

  // 5-minute timeout to prevent zombie processes
  const TIMEOUT_MS = 5 * 60 * 1000;

  await new Promise<void>((resolve) => {
    let settled = false;

    // Timeout guard: kill process after 5 minutes
    const timeoutHandle = setTimeout(() => {
      if (settled) return;
      logger.error('Run timed out — killing process', { runId, agentId });
      try {
        child.kill('SIGKILL');
      } catch {
        // Already dead
      }

      const finishedAt = new Date().toISOString();
      const costCents = estimateCostCents(model, inputTokens, outputTokens);
      const logExcerpt = capLogExcerpt(logLines);

      try { rmSync(skillDir, { recursive: true, force: true }); } catch { /* ignore */ }

      run(
        `UPDATE runs SET status = 'timeout', started_at = ?, exit_code = ?, error = ?,
         token_input = ?, token_output = ?, cost_cents = ?, log_excerpt = ?,
         finished_at = ? WHERE id = ?`,
        [now, -1, 'Process timed out after 5 minutes', inputTokens, outputTokens,
         costCents, logExcerpt, finishedAt, runId]
      );

      // Update agent status and spent in a single statement (avoids double-spend)
      run(
        `UPDATE agents SET status = 'idle', spent_monthly_cents = spent_monthly_cents + ?, updated_at = ? WHERE id = ?`,
        [costCents, finishedAt, agentId]
      );
      run(
        `UPDATE companies SET spent_monthly_cents = spent_monthly_cents + ?, updated_at = ? WHERE id = ?`,
        [costCents, finishedAt, companyId]
      );

      incRun('timeout');
      addTokens(inputTokens, outputTokens);
      decRunsActive();
      broadcast({ type: 'run.completed', data: { runId, agentId, companyId, status: 'timeout' } });
      pushToAgent(agentId, { type: 'status', agentId, status: 'idle', runId });

      settled = true;
      resolve();
    }, TIMEOUT_MS);

    child.on('close', (code) => {
      clearTimeout(timeoutHandle);
      if (settled) return;
      settled = true;

      const finishedAt = new Date().toISOString();
      const exitCode = code ?? -1;
      const status = exitCode === 0 ? 'completed' : 'failed';
      const costCents = estimateCostCents(model, inputTokens, outputTokens);

      // Keep log excerpt capped at 50K chars
      const logExcerpt = capLogExcerpt(logLines);

      run(
        `UPDATE runs SET status = ?, started_at = ?, exit_code = ?, error = ?,
         token_input = ?, token_output = ?, cost_cents = ?, log_excerpt = ?,
         finished_at = ? WHERE id = ?`,
        [
          status,
          now,
          exitCode,
          errorOutput || null,
          inputTokens,
          outputTokens,
          costCents,
          logExcerpt,
          finishedAt,
          runId,
        ]
      );

      // Cleanup temp skill directory
      try { rmSync(skillDir, { recursive: true, force: true }); } catch { /* ignore */ }

      // Mark injected signals as consumed by this agent
      if (incomingSignals.length > 0) {
        for (const sig of incomingSignals) {
          try {
            const sigRow = get<{ consumed_by: string }>(`SELECT consumed_by FROM signals WHERE id = ?`, [sig.id]);
            if (sigRow) {
              let consumedBy: string[] = [];
              try { consumedBy = JSON.parse(sigRow.consumed_by) as string[]; } catch { consumedBy = []; }
              if (!consumedBy.includes(agentId)) {
                consumedBy.push(agentId);
                run(`UPDATE signals SET consumed_by = ? WHERE id = ?`, [JSON.stringify(consumedBy), sig.id]);
              }
            }
          } catch (consumeErr) {
            logger.warn('Failed to mark signal consumed', { agentId, signalId: sig.id, error: String(consumeErr) });
          }
        }
      }

      // Parse and persist context update if agent emitted one
      const fullOutput = logLines.join('\n');
      const updatedCapsule = parseContextUpdate(fullOutput);
      if (updatedCapsule) {
        try {
          run(
            `UPDATE agents SET context_capsule = ?, updated_at = ? WHERE id = ?`,
            [updatedCapsule, finishedAt, agentId]
          );
          logger.info('Context capsule updated from run output', { agentId, runId, capsuleLength: updatedCapsule.length });
        } catch (capsuleErr) {
          logger.error('Failed to persist context capsule', { agentId, runId, error: capsuleErr });
        }
      }

      const agentStatus = 'idle';
      // Update agent status and spent in a single statement (avoids double-spend)
      run(
        `UPDATE agents SET status = ?, spent_monthly_cents = spent_monthly_cents + ?, updated_at = ? WHERE id = ?`,
        [agentStatus, costCents, finishedAt, agentId]
      );

      // Update company spent
      run(
        `UPDATE companies SET spent_monthly_cents = spent_monthly_cents + ?, updated_at = ? WHERE id = ?`,
        [costCents, finishedAt, companyId]
      );

      // Parse structured outputs from agent stdout
      try {
        const fullText = plainTextLines.join('\n');
        const parsedOutputs = parseAgentOutputs(fullText);
        if (parsedOutputs.length > 0) {
          const outputAt = new Date().toISOString();
          for (const output of parsedOutputs) {
            run(
              `INSERT INTO run_outputs (id, run_id, agent_id, output_type, data, created_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [output.id, runId, agentId, output.type, JSON.stringify(output.data), outputAt]
            );
          }
          logger.info('Parsed structured outputs from run', { runId, agentId, count: parsedOutputs.length });
        }
      } catch (parseErr) {
        logger.warn('Failed to parse structured outputs', { runId, agentId, error: String(parseErr) });
      }

      // Schema-based structured output parsing (v1.7)
      // Fire-and-forget async: fetch agent's output_schema and parse if present
      ;(async () => {
        try {
          const agentRow = get<{ output_schema: string | null; name: string }>(
            `SELECT output_schema, name FROM agents WHERE id = ?`,
            [agentId]
          );
          if (!agentRow?.output_schema) return;

          let schema: Record<string, unknown>;
          try {
            schema = JSON.parse(agentRow.output_schema) as Record<string, unknown>;
          } catch {
            return;
          }

          const rawOutput = plainTextLines.join('\n');
          const context = `${agentRow.name} (runId: ${runId})`;

          const result = await parseStructuredOutput(rawOutput, schema as Parameters<typeof parseStructuredOutput>[1], context);

          run(
            `UPDATE runs SET output_raw = ?, output_structured = ?, output_summary = ?, output_confidence = ? WHERE id = ?`,
            [
              rawOutput.slice(0, 50_000),
              JSON.stringify(result.structured),
              result.summary,
              result.confidence,
              runId,
            ]
          );

          logger.info('Schema-based structured output stored', {
            runId,
            agentId,
            confidence: result.confidence,
            retries: result.retries,
            costCents: result.costCents,
          });
        } catch (structuredErr) {
          logger.warn('Schema-based structured output parsing failed', {
            runId,
            agentId,
            error: String(structuredErr),
          });
        }
      })();

      // Wake chain: if run completed successfully, parse and execute any __agist_wake requests
      if (exitCode === 0) {
        const wakeChains = parseWakeChains(plainTextLines.join('\n'));
        if (wakeChains.length > 0) {
          logger.info('Wake chain: found wake requests in run output', { runId, agentId, count: wakeChains.length });
          // Fire-and-forget — don't await
          executeWakeChains(
            wakeChains,
            agentId,
            agentSlug,
            companyId,
            options.chainDepth ?? 0
          ).catch((err: unknown) => {
            logger.error('Wake chain: executeWakeChains error', { runId, agentId, error: String(err) });
          });
        }
      }

      incRun(status);
      addTokens(inputTokens, outputTokens);
      decRunsActive();
      logger.info('Run completed', { runId, agentId, status, exitCode, costCents, inputTokens, outputTokens });

      // Audit: run completed or failed
      audit(companyId, agentId, status === 'completed' ? 'run.completed' : 'run.failed', {
        runId,
        exitCode,
        costCents,
        tokenInput: inputTokens,
        tokenOutput: outputTokens,
      });

      pushToAgent(agentId, { type: 'status', agentId, status: agentStatus, runId });

      broadcast({
        type: 'run.completed',
        data: {
          runId,
          agentId,
          companyId,
          status,
          exitCode,
          costCents,
          tokenInput: inputTokens,
          tokenOutput: outputTokens,
        },
      });

      // Fire-and-forget notifications (webhooks, Slack, GitHub)
      notifyRunFinished(
        companyId,
        status === 'completed' ? 'run.completed' : 'run.failed',
        runId,
        agentId,
        status === 'failed' ? (errorOutput || 'Non-zero exit code') : undefined
      );

      resolve();
    });

    child.on('error', (err) => {
      clearTimeout(timeoutHandle);
      if (settled) return;
      settled = true;

      const finishedAt = new Date().toISOString();
      const errorMsg = `Failed to spawn claude CLI: ${err.message}`;

      // Cleanup temp skill directory
      try { rmSync(skillDir, { recursive: true, force: true }); } catch { /* ignore */ }

      run(
        `UPDATE runs SET status = ?, started_at = ?, exit_code = ?, error = ?,
         token_input = ?, token_output = ?, cost_cents = ?, log_excerpt = ?,
         finished_at = ? WHERE id = ?`,
        ['failed', now, -1, errorMsg, 0, 0, 0, errorMsg, finishedAt, runId]
      );

      run(
        `UPDATE agents SET status = ?, updated_at = ? WHERE id = ?`,
        ['idle', finishedAt, agentId]
      );

      incRun('failed');
      decRunsActive();
      logger.error('Failed to spawn claude CLI', { runId, agentId, error: errorMsg });

      broadcast({
        type: 'run.completed',
        data: { runId, agentId, companyId, status: 'failed', error: errorMsg },
      });

      // Fire-and-forget notifications
      notifyRunFinished(companyId, 'run.failed', runId, agentId, errorMsg);

      resolve();
    });
  });
}
