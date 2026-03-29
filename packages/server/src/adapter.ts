import { spawn } from 'child_process';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { run, get } from './db.js';
import { pushToAgent } from './ws.js';
import { broadcast } from './sse.js';

export interface RunAdapterOptions {
  runId: string;
  agentId: string;
  companyId: string;
  model: string;
  prompt: string;
  adapterConfig?: Record<string, unknown>;
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
}

function buildSystemPrompt(ctx: AgentContext, taskPrompt: string): string {
  const lines: string[] = [];

  lines.push(`# Agent Identity`);
  lines.push(`You are "${ctx.agentName}", a ${ctx.agentRole} agent${ctx.agentTitle ? ` (${ctx.agentTitle})` : ''}.`);
  lines.push(`Company: ${ctx.companyName}${ctx.companyDescription ? ` — ${ctx.companyDescription}` : ''}`);

  if (ctx.capabilities) {
    lines.push('');
    lines.push(`## Capabilities`);
    lines.push(ctx.capabilities);
  }

  if (ctx.routineTitle || ctx.routineDescription) {
    lines.push('');
    lines.push(`## Current Task: ${ctx.routineTitle || 'Manual wake'}`);
    if (ctx.routineDescription) {
      lines.push(ctx.routineDescription);
    }
  }

  lines.push('');
  lines.push(`## Instructions`);
  lines.push(taskPrompt);

  lines.push('');
  lines.push(`## Output Rules`);
  lines.push(`- Be concise and action-oriented`);
  lines.push(`- Lead with findings or actions taken, not preamble`);
  lines.push(`- If nothing changed since last run, say "STATUS: NO_CHANGE" with reason`);
  lines.push(`- Always include evidence (data, commands run, results) not just conclusions`);

  return lines.join('\n');
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

interface StreamJsonChunk {
  type?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  message?: {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  };
  delta?: {
    type?: string;
    text?: string;
  };
  content_block?: {
    type?: string;
    text?: string;
  };
}

function estimateCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  // Cost rates per 1M tokens in cents ($0.80 input = 80 cents per 1M)
  const pricing: Record<string, { input: number; output: number }> = {
    'claude-opus-4-5': { input: 1500, output: 7500 },
    'claude-sonnet-4-5': { input: 300, output: 1500 },
    'claude-haiku-4-5': { input: 80, output: 400 },
    'claude-opus-4': { input: 1500, output: 7500 },
    'claude-sonnet-4': { input: 300, output: 1500 },
    'claude-haiku-4': { input: 80, output: 400 },
    'haiku': { input: 80, output: 400 },
    'sonnet': { input: 300, output: 1500 },
    'opus': { input: 1500, output: 7500 },
  };

  const modelKey = Object.keys(pricing).find((k) => model.includes(k)) ?? '';
  const rates = pricing[modelKey] ?? { input: 300, output: 1500 };

  return Math.round(
    (inputTokens / 1_000_000) * rates.input +
      (outputTokens / 1_000_000) * rates.output
  );
}

export async function spawnClaudeLocal(
  options: RunAdapterOptions
): Promise<void> {
  const { runId, agentId, companyId, model, prompt } = options;

  const now = new Date().toISOString();

  // Fetch agent + company context from DB
  const agentRow = get<Record<string, unknown>>(
    `SELECT a.name, a.title, a.role, a.capabilities, c.name as company_name, c.description as company_desc
     FROM agents a JOIN companies c ON a.company_id = c.id WHERE a.id = ?`, [agentId]
  );

  // Fetch routine context if this run came from a routine
  const routineRow = get<Record<string, unknown>>(
    `SELECT r.title, r.description FROM routines r
     JOIN runs ru ON ru.routine_id = r.id WHERE ru.id = ?`, [runId]
  );

  const ctx: AgentContext = {
    agentName: (agentRow?.name as string) || 'unknown-agent',
    agentTitle: (agentRow?.title as string) || null,
    agentRole: (agentRow?.role as string) || 'general',
    capabilities: (agentRow?.capabilities as string) || null,
    companyName: (agentRow?.company_name as string) || 'Unknown Company',
    companyDescription: (agentRow?.company_desc as string) || null,
    routineTitle: (routineRow?.title as string) || null,
    routineDescription: (routineRow?.description as string) || null,
  };

  // Build enriched system prompt
  const systemPrompt = buildSystemPrompt(ctx, prompt);

  // Build skill directory for --add-dir
  const skillDir = buildSkillDir(ctx);

  // Mark run as running
  run(
    `UPDATE runs SET status = 'running', started_at = ? WHERE id = ?`,
    [now, runId]
  );

  run(
    `UPDATE agents SET status = ?, updated_at = ? WHERE id = ?`,
    ['running', now, agentId]
  );

  broadcast({
    type: 'agent.status',
    data: { agentId, status: 'running', runId },
  });

  pushToAgent(agentId, { type: 'status', agentId, status: 'running', runId });

  const args = [
    '--model', model,
    '--print',
    '--verbose',
    '--output-format', 'stream-json',
    '--add-dir', skillDir,
    '-p', systemPrompt,
  ];

  const child = spawn('claude', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  const logLines: string[] = [];
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

      try {
        const parsed = JSON.parse(line) as StreamJsonChunk;

        // Extract token usage from stream-json events
        if (parsed.type === 'message_start' && parsed.message?.usage) {
          inputTokens = parsed.message.usage.input_tokens ?? inputTokens;
          outputTokens = parsed.message.usage.output_tokens ?? outputTokens;
        } else if (parsed.type === 'message_delta' && parsed.usage) {
          outputTokens = parsed.usage.output_tokens ?? outputTokens;
        } else if (parsed.usage) {
          inputTokens = parsed.usage.input_tokens ?? inputTokens;
          outputTokens = parsed.usage.output_tokens ?? outputTokens;
        }
      } catch {
        // Not JSON — plain text output line
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
      console.error(`[adapter] Run ${runId} timed out after 5 minutes — killing process`);
      try {
        child.kill('SIGKILL');
      } catch {
        // Already dead
      }

      const finishedAt = new Date().toISOString();
      const costCents = estimateCostCents(model, inputTokens, outputTokens);
      const logExcerpt = logLines.slice(-200).join('\n');

      try { rmSync(skillDir, { recursive: true, force: true }); } catch { /* ignore */ }

      run(
        `UPDATE runs SET status = 'timeout', started_at = ?, exit_code = ?, error = ?,
         token_input = ?, token_output = ?, cost_cents = ?, log_excerpt = ?,
         finished_at = ? WHERE id = ?`,
        [now, -1, 'Process timed out after 5 minutes', inputTokens, outputTokens,
         costCents, logExcerpt, finishedAt, runId]
      );

      run(`UPDATE agents SET status = 'idle', updated_at = ? WHERE id = ?`, [finishedAt, agentId]);
      run(
        `UPDATE companies SET spent_monthly_cents = spent_monthly_cents + ?, updated_at = ? WHERE id = ?`,
        [costCents, finishedAt, companyId]
      );
      run(
        `UPDATE agents SET spent_monthly_cents = spent_monthly_cents + ?, updated_at = ? WHERE id = ?`,
        [costCents, finishedAt, agentId]
      );

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
      const status = exitCode === 0 ? 'success' : 'failed';
      const costCents = estimateCostCents(model, inputTokens, outputTokens);

      // Keep last 200 log lines as excerpt
      const logExcerpt = logLines.slice(-200).join('\n');

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

      const agentStatus = 'idle';
      run(
        `UPDATE agents SET status = ?, updated_at = ? WHERE id = ?`,
        [agentStatus, finishedAt, agentId]
      );

      // Update company spent
      run(
        `UPDATE companies SET spent_monthly_cents = spent_monthly_cents + ?, updated_at = ? WHERE id = ?`,
        [costCents, finishedAt, companyId]
      );

      // Update agent spent
      run(
        `UPDATE agents SET spent_monthly_cents = spent_monthly_cents + ?, updated_at = ? WHERE id = ?`,
        [costCents, finishedAt, agentId]
      );

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

      broadcast({
        type: 'run.completed',
        data: { runId, agentId, companyId, status: 'failed', error: errorMsg },
      });

      resolve();
    });
  });
}
