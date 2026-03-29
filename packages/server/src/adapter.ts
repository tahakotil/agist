import { spawn } from 'child_process';
import { run } from './db.js';
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
  // Rough cost estimates per 1M tokens in cents
  const pricing: Record<string, { input: number; output: number }> = {
    'claude-opus-4-5': { input: 1500, output: 7500 },
    'claude-sonnet-4-5': { input: 300, output: 1500 },
    'claude-haiku-4-5': { input: 25, output: 125 },
    'claude-opus-4': { input: 1500, output: 7500 },
    'claude-sonnet-4': { input: 300, output: 1500 },
    'claude-haiku-4': { input: 25, output: 125 },
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
    '--output-format', 'stream-json',
    '-p', prompt,
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

  await new Promise<void>((resolve) => {
    child.on('close', (code) => {
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
      const finishedAt = new Date().toISOString();
      const errorMsg = `Failed to spawn claude CLI: ${err.message}`;

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
