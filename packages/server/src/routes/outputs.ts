import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { all, get, run } from '../db.js';

export const outputsRouter = new Hono();

interface RunOutputRow {
  id: string;
  run_id: string;
  agent_id: string;
  output_type: string;
  data: string; // JSON string stored in DB
  created_at: string;
}

function rowToOutput(row: RunOutputRow) {
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(row.data) as Record<string, unknown>;
  } catch {
    data = { raw: row.data };
  }
  return {
    id: row.id,
    runId: row.run_id,
    agentId: row.agent_id,
    outputType: row.output_type,
    data,
    createdAt: row.created_at,
  };
}

const createOutputSchema = z.object({
  output_type: z.string().min(1).max(100).default('report'),
  data: z.record(z.unknown()),
});

// POST /api/runs/:runId/outputs — store a parsed output for a run
outputsRouter.post(
  '/api/runs/:runId/outputs',
  zValidator('json', createOutputSchema),
  (c) => {
    const runId = c.req.param('runId');
    const body = c.req.valid('json');

    const runRow = get<{ id: string; agent_id: string }>(`SELECT id, agent_id FROM runs WHERE id = ?`, [runId]);
    if (!runRow) {
      return c.json({ error: 'Run not found' }, 404);
    }

    // Quality gate: reject outputs with confidence below threshold
    const data = body.data as Record<string, unknown>;
    const confidence = typeof data.confidence === 'number' ? data.confidence : 1;
    if (confidence < 0.5) {
      return c.json({
        error: 'Output confidence too low for persistence',
        confidence,
        threshold: 0.5,
      }, 422);
    }

    const id = nanoid();
    const now = new Date().toISOString();
    const dataStr = JSON.stringify(body.data);

    run(
      `INSERT INTO run_outputs (id, run_id, agent_id, output_type, data, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, runId, runRow.agent_id, body.output_type, dataStr, now]
    );

    const row = get<RunOutputRow>(`SELECT * FROM run_outputs WHERE id = ?`, [id]);
    return c.json({ output: rowToOutput(row!) }, 201);
  }
);

// GET /api/runs/:runId/outputs — outputs for a specific run
outputsRouter.get('/api/runs/:runId/outputs', (c) => {
  const runId = c.req.param('runId');

  const runExists = get(`SELECT id FROM runs WHERE id = ?`, [runId]);
  if (!runExists) {
    return c.json({ error: 'Run not found' }, 404);
  }

  const rows = all<RunOutputRow>(
    `SELECT * FROM run_outputs WHERE run_id = ? ORDER BY created_at ASC`,
    [runId]
  );

  return c.json({ outputs: rows.map(rowToOutput) });
});

// GET /api/agents/:agentId/outputs — all outputs by agent (last 50)
outputsRouter.get('/api/agents/:agentId/outputs', (c) => {
  const agentId = c.req.param('agentId');
  const limitParam = c.req.query('limit');
  const limit = Math.min(100, Math.max(1, parseInt(limitParam ?? '50', 10) || 50));

  const agentExists = get(`SELECT id FROM agents WHERE id = ?`, [agentId]);
  if (!agentExists) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  const rows = all<RunOutputRow>(
    `SELECT * FROM run_outputs WHERE agent_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    [agentId, limit]
  );

  return c.json({ outputs: rows.map(rowToOutput) });
});

// GET /api/agents/:agentId/outputs/latest — most recent output for agent
outputsRouter.get('/api/agents/:agentId/outputs/latest', (c) => {
  const agentId = c.req.param('agentId');

  const agentExists = get(`SELECT id FROM agents WHERE id = ?`, [agentId]);
  if (!agentExists) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  const row = get<RunOutputRow>(
    `SELECT * FROM run_outputs WHERE agent_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    [agentId]
  );

  if (!row) {
    return c.json({ output: null });
  }

  return c.json({ output: rowToOutput(row) });
});

// GET /api/companies/:cid/outputs/summary — per-agent latest status summary
outputsRouter.get('/api/companies/:cid/outputs/summary', (c) => {
  const companyId = c.req.param('cid');

  const companyExists = get(`SELECT id FROM companies WHERE id = ?`, [companyId]);
  if (!companyExists) {
    return c.json({ error: 'Company not found' }, 404);
  }

  // Get latest output per agent for agents in this company
  // Use rowid (auto-increment insertion order) to avoid duplicate rows when
  // two outputs share the same created_at timestamp.
  const rows = all<RunOutputRow & { agent_name: string }>(
    `SELECT ro.*, a.name as agent_name
     FROM run_outputs ro
     JOIN agents a ON a.id = ro.agent_id
     WHERE a.company_id = ?
       AND ro.rowid = (
         SELECT MAX(ro2.rowid)
         FROM run_outputs ro2
         WHERE ro2.agent_id = ro.agent_id
       )
     ORDER BY ro.created_at DESC`,
    [companyId]
  );

  const summary = rows.map((row) => {
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(row.data) as Record<string, unknown>;
    } catch {
      data = { raw: row.data };
    }
    return {
      agentId: row.agent_id,
      agentName: row.agent_name,
      outputType: row.output_type,
      status: (data.status as string) ?? (data.overall_status as string) ?? null,
      createdAt: row.created_at,
    };
  });

  return c.json({ summary });
});
