/**
 * Structured Output Parser
 *
 * Takes raw LLM output + an OutputSchema defined on an agent and returns
 * structured JSON, a confidence score, and a human-readable summary.
 *
 * The parser uses the existing Anthropic API adapter pattern (direct fetch)
 * rather than spawning an adapter, so it does not require a run record.
 *
 * Confidence = (required fields extracted with correct type) / (total required fields).
 * If confidence < CONFIDENCE_THRESHOLD or required fields are missing, the parser
 * retries with a stricter prompt (max MAX_RETRIES retries).
 */

import { logger } from '../logger.js'
import { estimateCostCents } from '../adapters/cost.js'

// ─── Schema types ─────────────────────────────────────────────────────────────

export type OutputFieldType = 'string' | 'number' | 'boolean' | 'array'

export interface OutputSchemaField {
  /** Field name in the extracted JSON output */
  name: string
  /** Expected type */
  type: OutputFieldType
  /** Whether the field is required for a confident extraction */
  required?: boolean
  /** Human-readable description shown to the LLM parser */
  description?: string
}

export interface OutputSchema {
  fields: OutputSchemaField[]
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface ParsedStructuredOutput {
  /** The extracted structured JSON object */
  structured: Record<string, unknown>
  /** 0.0 – 1.0. Ratio of required fields extracted with correct type */
  confidence: number
  /** 1-2 sentence human-readable summary generated from structured data */
  summary: string
  /** Total token cost for parsing (may span multiple retries) */
  costCents: number
  /** Number of retries that were needed (0 = first attempt succeeded) */
  retries: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Below this confidence the parser will retry */
const CONFIDENCE_THRESHOLD = 0.7

/** Maximum number of retry attempts after the initial parse */
const MAX_RETRIES = 2

/**
 * The cheapest Anthropic model used for both extraction and summary.
 * Falls back gracefully when API key is missing.
 */
const PARSER_MODEL = 'claude-haiku-4-5-20251001'

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse structured output from raw LLM text according to a schema.
 *
 * @param rawOutput   Full stdout/text from the agent run
 * @param schema      OutputSchema defining expected fields
 * @param context     Optional context string (e.g. agent name + task) for better extraction
 * @returns ParsedStructuredOutput — always returns a result, never throws
 */
export async function parseStructuredOutput(
  rawOutput: string,
  schema: OutputSchema,
  context?: string
): Promise<ParsedStructuredOutput> {
  let totalCostCents = 0
  let retries = 0
  let lastStructured: Record<string, unknown> = {}
  let lastConfidence = 0

  const requiredFields = schema.fields.filter((f) => f.required !== false)

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const isRetry = attempt > 0
    const prompt = buildExtractionPrompt(rawOutput, schema, context, isRetry)

    const result = await callAnthropicForJson(prompt)
    totalCostCents += result.costCents

    if (!result.ok) {
      logger.warn('Structured output parser: LLM call failed', {
        attempt,
        error: result.error,
      })
      // On failure, keep trying unless we are out of retries
      if (attempt < MAX_RETRIES) {
        retries++
        continue
      }
      break
    }

    const extracted = result.data
    const confidence = computeConfidence(extracted, requiredFields)

    lastStructured = extracted
    lastConfidence = confidence

    if (confidence >= CONFIDENCE_THRESHOLD && allRequiredPresent(extracted, requiredFields)) {
      // Successful extraction — generate summary
      const summaryResult = await generateSummary(extracted, schema, context)
      totalCostCents += summaryResult.costCents

      return {
        structured: extracted,
        confidence,
        summary: summaryResult.summary,
        costCents: totalCostCents,
        retries,
      }
    }

    logger.info('Structured output parser: confidence below threshold, retrying', {
      attempt,
      confidence,
      threshold: CONFIDENCE_THRESHOLD,
    })

    retries++
  }

  // All retries exhausted — return best result so far with a fallback summary
  const summaryResult = await generateSummary(lastStructured, schema, context)
  totalCostCents += summaryResult.costCents

  return {
    structured: lastStructured,
    confidence: lastConfidence,
    summary: summaryResult.summary,
    costCents: totalCostCents,
    retries,
  }
}

/**
 * Validate an OutputSchema object. Returns null if valid, error string otherwise.
 */
export function validateOutputSchema(schema: unknown): string | null {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return 'output_schema must be an object'
  }

  const s = schema as Record<string, unknown>

  if (!Array.isArray(s.fields)) {
    return 'output_schema.fields must be an array'
  }

  const validTypes: OutputFieldType[] = ['string', 'number', 'boolean', 'array']

  for (let i = 0; i < (s.fields as unknown[]).length; i++) {
    const field = (s.fields as unknown[])[i]
    if (!field || typeof field !== 'object' || Array.isArray(field)) {
      return `output_schema.fields[${i}] must be an object`
    }

    const f = field as Record<string, unknown>

    if (!f.name || typeof f.name !== 'string' || f.name.trim() === '') {
      return `output_schema.fields[${i}].name must be a non-empty string`
    }

    if (!validTypes.includes(f.type as OutputFieldType)) {
      return `output_schema.fields[${i}].type must be one of: ${validTypes.join(', ')}`
    }

    if (f.required !== undefined && typeof f.required !== 'boolean') {
      return `output_schema.fields[${i}].required must be a boolean`
    }

    if (f.description !== undefined && typeof f.description !== 'string') {
      return `output_schema.fields[${i}].description must be a string`
    }
  }

  return null
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildExtractionPrompt(
  rawOutput: string,
  schema: OutputSchema,
  context: string | undefined,
  isRetry: boolean
): string {
  const schemaDescription = schema.fields
    .map((f) => {
      const required = f.required !== false ? ' (REQUIRED)' : ' (optional)'
      const desc = f.description ? ` — ${f.description}` : ''
      return `  - "${f.name}": ${f.type}${required}${desc}`
    })
    .join('\n')

  const strictNote = isRetry
    ? '\n\nIMPORTANT: Previous extraction was incomplete. Be thorough. Extract EVERY required field, even if you must infer it from context. Do not skip fields.'
    : ''

  const contextNote = context ? `\nContext: ${context}\n` : ''

  return `You are a structured data extraction assistant. Extract information from the provided text and return ONLY a valid JSON object matching the schema below. Do not include any explanation, markdown, or text outside the JSON object.${strictNote}
${contextNote}
Schema fields to extract:
${schemaDescription}

Text to extract from:
---
${rawOutput.slice(0, 8000)}
---

Return ONLY a JSON object with the extracted fields. If a field cannot be found, omit it (for optional fields) or set it to null (for required fields).`
}

function buildSummaryPrompt(
  structured: Record<string, unknown>,
  schema: OutputSchema,
  context: string | undefined
): string {
  const contextNote = context ? ` (${context})` : ''
  return `Summarize the following structured data in 1-2 concise sentences${contextNote}. Focus on the most important findings or status. Be direct and factual.

Data:
${JSON.stringify(structured, null, 2)}

Return ONLY the summary text, no JSON, no markdown headers.`
}

function computeConfidence(
  extracted: Record<string, unknown>,
  requiredFields: OutputSchemaField[]
): number {
  if (requiredFields.length === 0) return 1.0

  let matched = 0
  for (const field of requiredFields) {
    if (!(field.name in extracted)) continue
    const val = extracted[field.name]
    if (val === null || val === undefined) continue
    if (typeMatches(val, field.type)) {
      matched++
    }
  }

  return matched / requiredFields.length
}

function allRequiredPresent(
  extracted: Record<string, unknown>,
  requiredFields: OutputSchemaField[]
): boolean {
  return requiredFields.every(
    (f) => f.name in extracted && extracted[f.name] !== null && extracted[f.name] !== undefined
  )
}

function typeMatches(value: unknown, expectedType: OutputFieldType): boolean {
  switch (expectedType) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number' && !isNaN(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'array':
      return Array.isArray(value)
    default:
      return false
  }
}

// ─── LLM API calls ────────────────────────────────────────────────────────────

type AnthropicCallResult =
  | {
      ok: true
      data: Record<string, unknown>
      costCents: number
      error?: never
    }
  | {
      ok: false
      data?: never
      costCents: number
      error: string
    }

/**
 * Call the Anthropic API and parse the response as JSON.
 * Returns cost + parsed data or error.
 */
async function callAnthropicForJson(prompt: string): Promise<AnthropicCallResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { ok: false, costCents: 0, error: 'ANTHROPIC_API_KEY not set — structured parsing skipped' }
  }

  let response: Response
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: PARSER_MODEL,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  } catch (fetchErr) {
    return {
      ok: false,
      costCents: 0,
      error: `Network error: ${(fetchErr as Error).message}`,
    }
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => `HTTP ${response.status}`)
    return { ok: false, costCents: 0, error: `API error ${response.status}: ${errText}` }
  }

  interface AnthropicResponse {
    content: Array<{ type: string; text?: string }>
    usage?: { input_tokens?: number; output_tokens?: number }
  }

  const data = (await response.json()) as AnthropicResponse
  const text = data.content?.find((c) => c.type === 'text')?.text ?? ''
  const inputTokens = data.usage?.input_tokens ?? 0
  const outputTokens = data.usage?.output_tokens ?? 0
  const costCents = estimateCostCents(PARSER_MODEL, inputTokens, outputTokens)

  // Extract JSON from the text (LLM may wrap in markdown code blocks)
  const parsed = extractJsonFromText(text)
  if (!parsed) {
    return {
      ok: false,
      costCents,
      error: `Could not parse JSON from LLM response: ${text.slice(0, 200)}`,
    }
  }

  return { ok: true, data: parsed, costCents }
}

/**
 * Call the Anthropic API and return the text as a summary string.
 */
async function generateSummary(
  structured: Record<string, unknown>,
  schema: OutputSchema,
  context: string | undefined
): Promise<{ summary: string; costCents: number }> {
  if (Object.keys(structured).length === 0) {
    return { summary: 'No structured data could be extracted from the output.', costCents: 0 }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // Fallback: generate a basic summary from the structured data without calling the API
    return { summary: buildFallbackSummary(structured), costCents: 0 }
  }

  const prompt = buildSummaryPrompt(structured, schema, context)

  let response: Response
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: PARSER_MODEL,
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  } catch {
    return { summary: buildFallbackSummary(structured), costCents: 0 }
  }

  if (!response.ok) {
    return { summary: buildFallbackSummary(structured), costCents: 0 }
  }

  interface AnthropicResponse {
    content: Array<{ type: string; text?: string }>
    usage?: { input_tokens?: number; output_tokens?: number }
  }

  const data = (await response.json()) as AnthropicResponse
  const text = data.content?.find((c) => c.type === 'text')?.text ?? ''
  const inputTokens = data.usage?.input_tokens ?? 0
  const outputTokens = data.usage?.output_tokens ?? 0
  const costCents = estimateCostCents(PARSER_MODEL, inputTokens, outputTokens)

  const summary = text.trim() || buildFallbackSummary(structured)
  return { summary, costCents }
}

/**
 * Extract a JSON object from text that may contain markdown fences or mixed content.
 */
function extractJsonFromText(text: string): Record<string, unknown> | null {
  if (!text || text.trim() === '') return null

  // Try direct parse first
  try {
    const direct = JSON.parse(text.trim())
    if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
      return direct as Record<string, unknown>
    }
  } catch {
    // Not raw JSON
  }

  // Try extracting from markdown code blocks
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim())
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // Not JSON in code block
    }
  }

  // Try extracting first brace-matched object
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    try {
      const slice = text.slice(start, end + 1)
      const parsed = JSON.parse(slice)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // Not JSON
    }
  }

  return null
}

/**
 * Generate a minimal summary from structured data without calling the LLM.
 */
function buildFallbackSummary(structured: Record<string, unknown>): string {
  const keys = Object.keys(structured)
  if (keys.length === 0) return 'No data extracted.'

  // Check for common status/summary fields
  if (typeof structured['summary'] === 'string') return structured['summary']
  if (typeof structured['status'] === 'string') {
    return `Status: ${structured['status']}. ${keys.length} fields extracted.`
  }

  return `Extracted ${keys.length} field${keys.length === 1 ? '' : 's'}: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}.`
}
