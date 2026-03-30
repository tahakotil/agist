import { nanoid } from 'nanoid';

export interface ParsedOutput {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

// Keys that indicate a JSON object is an agent report (not a stream token)
const REPORT_KEYS = new Set([
  'status', 'checks', 'timestamp', 'overall_status', 'metrics',
  'alerts', 'summary', 'report', 'results', 'findings', 'errors',
  'warnings', 'score', 'issues', 'recommendations', 'data',
  'health', 'analytics', 'seo', 'content', 'leads', 'output',
  'performance', 'audit', 'crawl', 'pages', 'keywords',
]);

// Keys that are exclusive to Claude stream-json protocol tokens (never reports)
const STREAM_ONLY_KEYS = new Set([
  'type', 'index', 'delta', 'content_block', 'message',
  'stop_reason', 'stop_sequence', 'model', 'id',
]);

// "Structural" keys that indicate top-level report objects (not check/item rows).
// An object must have at least one of these to qualify as a report.
const STRUCTURAL_KEYS = new Set([
  'checks', 'overall_status', 'metrics', 'alerts', 'summary', 'report',
  'results', 'findings', 'recommendations', 'analytics', 'seo', 'content',
  'leads', 'performance', 'audit', 'crawl', 'pages', 'keywords', 'issues',
  'errors', 'warnings', 'score', 'timestamp',
]);

/**
 * Return true if the object looks like an agent report rather than a raw
 * stream-json token or some other incidental JSON.
 */
export function isAgentReport(obj: Record<string, unknown>): boolean {
  const keys = Object.keys(obj);
  if (keys.length === 0) return false;

  // Must have at least one report-like key
  const hasReportKey = keys.some((k) => REPORT_KEYS.has(k));
  if (!hasReportKey) return false;

  // If every key is a stream-only key, it's a protocol token, not a report
  const allStream = keys.every((k) => STREAM_ONLY_KEYS.has(k));
  if (allStream) return false;

  // Minimum complexity: must have at least 2 keys to be meaningful
  if (keys.length < 2) return false;

  // Must have at least one structural key — this filters out row-level objects
  // like { "name": "db", "status": "PASS" } that appear inside checks arrays
  const hasStructuralKey = keys.some((k) => STRUCTURAL_KEYS.has(k));
  if (!hasStructuralKey) return false;

  return true;
}

/**
 * Classify a report object into a human-readable type string.
 */
export function classifyReport(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj);
  const keySet = new Set(keys);

  // Health reports
  if (
    keySet.has('checks') ||
    keySet.has('overall_status') ||
    keySet.has('health') ||
    (keySet.has('status') && keySet.has('errors')) ||
    (keySet.has('status') && keySet.has('warnings'))
  ) {
    return 'health';
  }

  // Analytics reports
  if (
    keySet.has('metrics') ||
    keySet.has('analytics') ||
    keySet.has('performance') ||
    keySet.has('score')
  ) {
    return 'analytics';
  }

  // SEO reports
  if (
    keySet.has('seo') ||
    keySet.has('keywords') ||
    keySet.has('pages') ||
    keySet.has('crawl') ||
    keySet.has('audit')
  ) {
    return 'seo';
  }

  // Content reports
  if (keySet.has('content') || keySet.has('leads') || keySet.has('leadgen')) {
    return 'content';
  }

  // Alert / issue reports
  if (keySet.has('alerts') || keySet.has('issues') || keySet.has('findings')) {
    return 'alert';
  }

  return 'report';
}

/**
 * Attempt to parse a string as JSON. Returns the parsed object or null.
 */
function tryParseJson(str: string): Record<string, unknown> | null {
  try {
    const val = JSON.parse(str);
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return val as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract JSON objects from fenced code blocks (```json ... ```)
 */
function extractFencedJson(text: string): string[] {
  const results: string[] = [];
  const fenceRegex = /```(?:json)?\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(text)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

/**
 * Extract __agist_report marker blocks
 */
function extractMarkerBlocks(text: string): string[] {
  const results: string[] = [];
  const markerRegex = /__agist_report\s*([\s\S]*?)__end_agist_report/g;
  let match: RegExpExecArray | null;
  while ((match = markerRegex.exec(text)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

/**
 * Extract standalone JSON objects using brace-matching.
 * Finds top-level `{ ... }` blocks in the text.
 */
function extractStandaloneJson(text: string): string[] {
  const results: string[] = [];
  let depth = 0;
  let start = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        results.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return results;
}

/**
 * Parse structured JSON outputs from agent stdout.
 * Returns only objects that pass the isAgentReport heuristic.
 * Deduplicates by JSON fingerprint so the same object is not stored twice.
 */
export function parseAgentOutputs(stdout: string): ParsedOutput[] {
  if (!stdout || stdout.trim().length === 0) return [];

  const candidates: string[] = [];

  // 1. __agist_report markers (highest confidence)
  candidates.push(...extractMarkerBlocks(stdout));

  // 2. Fenced JSON blocks
  candidates.push(...extractFencedJson(stdout));

  // 3. Standalone brace-matched objects in each line and across full text
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      candidates.push(trimmed);
    }
  }

  // Also try full-text brace-matching for multi-line objects
  candidates.push(...extractStandaloneJson(stdout));

  // Parse, filter, deduplicate
  const seen = new Set<string>();
  const outputs: ParsedOutput[] = [];

  for (const candidate of candidates) {
    const obj = tryParseJson(candidate);
    if (!obj) continue;
    if (!isAgentReport(obj)) continue;

    // Deduplicate by canonical JSON fingerprint
    const fingerprint = JSON.stringify(obj, Object.keys(obj).sort());
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);

    outputs.push({
      id: nanoid(),
      type: classifyReport(obj),
      data: obj,
    });
  }

  return outputs;
}
