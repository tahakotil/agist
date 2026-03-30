/**
 * Capsule Manager — CRUD + type-specific logic for context capsules.
 *
 * Three capsule types:
 *   static    — Manually created/updated, versioned.
 *   dynamic   — Auto-refreshed from agent run outputs (config.source = "agent:<agentId>").
 *   composite — Combines multiple capsules; optionally summarised when over token limit.
 */

import { nanoid } from 'nanoid';
import { all, get, run } from '../db.js';
import { logger } from '../logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CapsuleRow {
  id: string;
  company_id: string;
  type: 'static' | 'dynamic' | 'composite';
  name: string;
  content: string;
  token_count: number;
  version: number;
  config: string; // JSON
  active: number;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

export interface CapsuleVersionRow {
  capsule_id: string;
  version: number;
  content: string;
  token_count: number;
  created_at: string;
}

export interface StaticConfig {
  /** Optional label */
  label?: string;
}

export interface DynamicConfig {
  /** "agent:<agentId>" */
  source: string;
  /** Max age in seconds before the capsule is considered stale */
  maxAge?: number;
}

export interface CompositeConfig {
  /** IDs of capsules to include */
  includes: string[];
  /** If total tokens exceed this limit AND summarizeIfExceeds is true, use LLM to summarise */
  maxTokens?: number;
  summarizeIfExceeds?: boolean;
}

export type CapsuleConfig = StaticConfig | DynamicConfig | CompositeConfig;

export interface Capsule {
  id: string;
  companyId: string;
  type: 'static' | 'dynamic' | 'composite';
  name: string;
  content: string;
  tokenCount: number;
  version: number;
  config: CapsuleConfig;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  isStale: boolean;
}

export interface CapsuleVersion {
  capsuleId: string;
  version: number;
  content: string;
  tokenCount: number;
  createdAt: string;
}

// ── Token count helper ────────────────────────────────────────────────────────

/** Rough approximation: 1 token ≈ 4 chars */
export function estimateTokenCount(content: string): number {
  return Math.ceil(content.length / 4);
}

// ── Row to domain object ──────────────────────────────────────────────────────

export function rowToCapsule(row: CapsuleRow): Capsule {
  let config: CapsuleConfig = {};
  try {
    config = JSON.parse(row.config) as CapsuleConfig;
  } catch {
    config = {};
  }

  const isStale = row.expires_at ? new Date(row.expires_at) < new Date() : false;

  return {
    id: row.id,
    companyId: row.company_id,
    type: row.type,
    name: row.name,
    content: row.content,
    tokenCount: row.token_count,
    version: row.version,
    config,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at ?? null,
    isStale,
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export function listCapsules(companyId: string): Capsule[] {
  const rows = all<CapsuleRow>(
    `SELECT * FROM capsules WHERE company_id = ? AND active = 1 ORDER BY created_at DESC`,
    [companyId]
  );
  return rows.map(rowToCapsule);
}

export function getCapsule(id: string): Capsule | undefined {
  const row = get<CapsuleRow>(`SELECT * FROM capsules WHERE id = ? AND active = 1`, [id]);
  return row ? rowToCapsule(row) : undefined;
}

export function createCapsule(
  companyId: string,
  type: 'static' | 'dynamic' | 'composite',
  name: string,
  content: string,
  config: CapsuleConfig = {}
): Capsule {
  const id = nanoid();
  const now = new Date().toISOString();
  const tokenCount = estimateTokenCount(content);

  // Compute expires_at for dynamic capsules with maxAge
  let expiresAt: string | null = null;
  if (type === 'dynamic') {
    const dynCfg = config as DynamicConfig;
    if (dynCfg.maxAge && dynCfg.maxAge > 0) {
      expiresAt = new Date(Date.now() + dynCfg.maxAge * 1000).toISOString();
    }
  }

  run(
    `INSERT INTO capsules (id, company_id, type, name, content, token_count, version, config, active, created_at, updated_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, 1, ?, ?, ?)`,
    [id, companyId, type, name, content, tokenCount, JSON.stringify(config), now, now, expiresAt]
  );

  // Store initial version in capsule_versions
  run(
    `INSERT INTO capsule_versions (capsule_id, version, content, token_count, created_at) VALUES (?, 1, ?, ?, ?)`,
    [id, content, tokenCount, now]
  );

  const row = get<CapsuleRow>(`SELECT * FROM capsules WHERE id = ?`, [id])!;
  return rowToCapsule(row);
}

export function updateCapsuleContent(id: string, newContent: string): Capsule | undefined {
  const existing = get<CapsuleRow>(`SELECT * FROM capsules WHERE id = ? AND active = 1`, [id]);
  if (!existing) return undefined;

  const now = new Date().toISOString();
  const newVersion = existing.version + 1;
  const tokenCount = estimateTokenCount(newContent);

  // Persist old version before overwriting
  run(
    `INSERT INTO capsule_versions (capsule_id, version, content, token_count, created_at) VALUES (?, ?, ?, ?, ?)`,
    [id, newVersion, newContent, tokenCount, now]
  );

  // Recompute expires_at for dynamic capsules
  let expiresAt: string | null = existing.expires_at ?? null;
  if (existing.type === 'dynamic') {
    let config: DynamicConfig = { source: '' };
    try { config = JSON.parse(existing.config) as DynamicConfig; } catch { /* ignore */ }
    if (config.maxAge && config.maxAge > 0) {
      expiresAt = new Date(Date.now() + config.maxAge * 1000).toISOString();
    }
  }

  run(
    `UPDATE capsules SET content = ?, token_count = ?, version = ?, updated_at = ?, expires_at = ? WHERE id = ?`,
    [newContent, tokenCount, newVersion, now, expiresAt, id]
  );

  const updated = get<CapsuleRow>(`SELECT * FROM capsules WHERE id = ?`, [id])!;
  return rowToCapsule(updated);
}

/** Soft-delete: set active=0 */
export function deleteCapsule(id: string): boolean {
  const existing = get(`SELECT id FROM capsules WHERE id = ? AND active = 1`, [id]);
  if (!existing) return false;

  const now = new Date().toISOString();
  run(`UPDATE capsules SET active = 0, updated_at = ? WHERE id = ?`, [now, id]);
  return true;
}

// ── Versions ─────────────────────────────────────────────────────────────────

export function getCapsuleVersions(capsuleId: string): CapsuleVersion[] {
  const rows = all<CapsuleVersionRow>(
    `SELECT * FROM capsule_versions WHERE capsule_id = ? ORDER BY version DESC`,
    [capsuleId]
  );
  return rows.map((r) => ({
    capsuleId: r.capsule_id,
    version: r.version,
    content: r.content,
    tokenCount: r.token_count,
    createdAt: r.created_at,
  }));
}

export function getCapsuleVersion(capsuleId: string, version: number): CapsuleVersion | undefined {
  const row = get<CapsuleVersionRow>(
    `SELECT * FROM capsule_versions WHERE capsule_id = ? AND version = ?`,
    [capsuleId, version]
  );
  if (!row) return undefined;
  return {
    capsuleId: row.capsule_id,
    version: row.version,
    content: row.content,
    tokenCount: row.token_count,
    createdAt: row.created_at,
  };
}

// ── Dynamic capsule auto-update ───────────────────────────────────────────────

/**
 * After an agent run completes, find any dynamic capsules sourced from this
 * agent and update their content with the latest run output.
 * Never throws.
 */
export function updateDynamicCapsulesForAgent(
  agentId: string,
  companyId: string
): void {
  try {
    // Find dynamic capsules in this company that source from this agent
    const capsules = all<CapsuleRow>(
      `SELECT * FROM capsules
       WHERE company_id = ? AND type = 'dynamic' AND active = 1`,
      [companyId]
    );

    const dynamicForAgent = capsules.filter((row) => {
      try {
        const cfg = JSON.parse(row.config) as DynamicConfig;
        return cfg.source === `agent:${agentId}`;
      } catch {
        return false;
      }
    });

    if (dynamicForAgent.length === 0) return;

    // Fetch latest run output for this agent
    const latestOutput = get<{ data: string }>(
      `SELECT data FROM run_outputs WHERE agent_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
      [agentId]
    );

    if (!latestOutput) {
      logger.debug('capsule-manager: no run output found for dynamic capsule update', { agentId });
      return;
    }

    let outputContent: string;
    try {
      const parsed = JSON.parse(latestOutput.data) as Record<string, unknown>;
      // Use summary if available, else stringify entire data
      outputContent = (parsed.summary as string) ?? (parsed.content as string) ?? JSON.stringify(parsed);
    } catch {
      outputContent = latestOutput.data;
    }

    for (const row of dynamicForAgent) {
      try {
        updateCapsuleContent(row.id, outputContent);
        // Cascade composite capsule refresh for any composites that include this one
        refreshCompositeCapsules(row.id, companyId);
        logger.info('capsule-manager: dynamic capsule updated', { capsuleId: row.id, agentId });
      } catch (err) {
        logger.warn('capsule-manager: failed to update dynamic capsule', {
          capsuleId: row.id,
          agentId,
          error: String(err),
        });
      }
    }
  } catch (err) {
    logger.warn('capsule-manager: updateDynamicCapsulesForAgent failed', {
      agentId,
      error: String(err),
    });
  }
}

// ── Composite capsule assembly ────────────────────────────────────────────────

/**
 * Rebuild the content of a composite capsule from its included capsules.
 * If total tokens exceed config.maxTokens and config.summarizeIfExceeds is true,
 * calls the LLM summariser.
 * Never throws.
 */
export async function refreshCompositeCapsule(capsuleId: string): Promise<void> {
  const row = get<CapsuleRow>(`SELECT * FROM capsules WHERE id = ? AND active = 1`, [capsuleId]);
  if (!row || row.type !== 'composite') return;

  let cfg: CompositeConfig = { includes: [] };
  try {
    cfg = JSON.parse(row.config) as CompositeConfig;
  } catch {
    return;
  }

  if (!cfg.includes || cfg.includes.length === 0) return;

  // Load included capsules
  const includedContents: string[] = [];
  for (const incId of cfg.includes) {
    const inc = get<CapsuleRow>(
      `SELECT * FROM capsules WHERE id = ? AND active = 1`,
      [incId]
    );
    if (inc) {
      includedContents.push(`### ${inc.name}\n\n${inc.content}`);
    }
  }

  let combined = includedContents.join('\n\n---\n\n');
  const totalTokens = estimateTokenCount(combined);

  // Summarise if over limit
  if (cfg.maxTokens && totalTokens > cfg.maxTokens && cfg.summarizeIfExceeds) {
    try {
      combined = await summariseContent(combined, cfg.maxTokens);
    } catch (err) {
      logger.warn('capsule-manager: composite summarisation failed — using truncated content', {
        capsuleId,
        error: String(err),
      });
      // Fallback: truncate to approximate char limit
      combined = combined.slice(0, cfg.maxTokens * 4);
    }
  }

  updateCapsuleContent(capsuleId, combined);
  logger.info('capsule-manager: composite capsule refreshed', { capsuleId });
}

/**
 * Find all composite capsules that include the given capsule and refresh them.
 */
function refreshCompositeCapsules(updatedCapsuleId: string, companyId: string): void {
  const composites = all<CapsuleRow>(
    `SELECT * FROM capsules WHERE company_id = ? AND type = 'composite' AND active = 1`,
    [companyId]
  );

  for (const comp of composites) {
    try {
      const cfg = JSON.parse(comp.config) as CompositeConfig;
      if (Array.isArray(cfg.includes) && cfg.includes.includes(updatedCapsuleId)) {
        // Fire-and-forget refresh
        refreshCompositeCapsule(comp.id).catch((err: unknown) => {
          logger.warn('capsule-manager: composite cascade refresh failed', {
            capsuleId: comp.id,
            error: String(err),
          });
        });
      }
    } catch {
      // ignore malformed config
    }
  }
}

// ── LLM summariser (haiku tier via Anthropic API) ────────────────────────────

async function summariseContent(content: string, maxTokens: number): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set — cannot summarise composite capsule');
  }

  // Aim for ~maxTokens output (1 token ≈ 4 chars, leave some buffer)
  const targetChars = maxTokens * 4;

  const prompt = `You are a context summariser. Summarise the following content into a concise context capsule of no more than ${targetChars} characters. Preserve key facts, decisions, and action items. Output only the summary — no preamble.\n\n${content}`;

  const body = {
    model: 'claude-haiku-4-5',
    max_tokens: Math.min(maxTokens, 4096),
    messages: [{ role: 'user' as const, content: prompt }],
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => `HTTP ${response.status}`);
    throw new Error(`Summarisation API error: ${errText}`);
  }

  const data = await response.json() as {
    content?: Array<{ type: string; text?: string }>;
  };

  const text = data.content?.find((c) => c.type === 'text')?.text ?? '';
  if (!text) throw new Error('Empty summary response from API');

  return text;
}

// ── Agent context injection helper ───────────────────────────────────────────

/**
 * Load and return the concatenated content of all listed capsule IDs
 * that belong to the given company, refreshing stale ones first.
 * Returns empty string if none found.
 */
export async function loadCapsulesForAgent(
  capsuleIds: string[],
  companyId: string
): Promise<string> {
  if (capsuleIds.length === 0) return '';

  const parts: string[] = [];

  for (const capsuleId of capsuleIds) {
    const row = get<CapsuleRow>(
      `SELECT * FROM capsules WHERE id = ? AND company_id = ? AND active = 1`,
      [capsuleId, companyId]
    );

    if (!row) {
      logger.warn('capsule-manager: capsule not found for agent injection', { capsuleId, companyId });
      continue;
    }

    const capsule = rowToCapsule(row);

    // Refresh composite if stale
    if (capsule.type === 'composite') {
      await refreshCompositeCapsule(capsuleId).catch((err: unknown) => {
        logger.warn('capsule-manager: composite refresh during injection failed', {
          capsuleId,
          error: String(err),
        });
      });
      // Re-read after potential refresh
      const refreshed = get<CapsuleRow>(`SELECT * FROM capsules WHERE id = ?`, [capsuleId]);
      if (refreshed) {
        parts.push(`### Capsule: ${refreshed.name}\n\n${refreshed.content}`);
        continue;
      }
    }

    // For dynamic capsule: check staleness but still include content
    if (capsule.type === 'dynamic' && capsule.isStale) {
      logger.warn('capsule-manager: dynamic capsule is stale', {
        capsuleId,
        expiresAt: capsule.expiresAt,
      });
    }

    parts.push(`### Capsule: ${capsule.name}\n\n${capsule.content}`);
  }

  return parts.join('\n\n---\n\n');
}
