import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { formatDistanceToNow } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function relativeTime(dateStr?: string): string {
  if (!dateStr) return "Never"
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
  } catch {
    return "Unknown"
  }
}

export function formatDuration(ms?: number): string {
  if (ms == null) return "-"
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${m}m ${s}s`
}

export function formatCost(cost: number): string {
  if (cost === 0) return "$0.00"
  if (cost < 0.001) return `<$0.001`
  return `$${cost.toFixed(4)}`
}

export function modelColor(model: string): string {
  switch (model?.toLowerCase()) {
    case "haiku":
      return "emerald"
    case "sonnet":
      return "blue"
    case "opus":
      return "violet"
    default:
      return "slate"
  }
}

/**
 * Clean raw log excerpt for display:
 * - Unescape \n to real newlines
 * - Strip JSON stream objects (Claude CLI output format)
 * - Strip base64 binary data blobs
 * - Collapse excessive whitespace
 */
export function cleanLogExcerpt(raw?: string | null, maxLen = 300): string {
  if (!raw) return ""
  let text = raw.replace(/\\n/g, '\n')

  // Remove top-level JSON objects by tracking brace depth
  let result = ''
  let depth = 0
  let inJson = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{' && !inJson && depth === 0) {
      // Check if this looks like a JSON stream object
      const ahead = text.slice(i, i + 30)
      if (/"type"|"message"|"content"|"model"|"session_id"|"uuid"|"stop_reason"|"usage"|"caller"|"inference"|"parent_tool"/.test(ahead)) {
        inJson = true
        depth = 1
        continue
      }
    }
    if (inJson) {
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth <= 0) { inJson = false; depth = 0 }
      }
      continue
    }
    result += ch
  }

  result = result
    // Remove base64 blobs (40+ contiguous base64 chars)
    .replace(/[A-Za-z0-9+/=]{40,}/g, '')
    // Remove [... truncated ...]
    .replace(/\[\.\.\.?\s*truncated\s*\.\.\.?\]/gi, '')
    // Remove orphaned JSON fragments
    .replace(/,"[a-z_]+":/gi, '')
    // Collapse multiple blank lines and whitespace
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s{4,}/g, ' ')
    .trim()

  if (result.length > maxLen) result = result.slice(0, maxLen) + '...'
  return result
}

/**
 * Clean context capsule text for display:
 * - Unescape \n to real newlines
 */
export function cleanCapsuleText(raw?: string | null): string {
  if (!raw) return ""
  return raw.replace(/\\n/g, '\n').trim()
}

export function statusColor(status: string): string {
  switch (status) {
    case "idle":
      return "green"
    case "running":
      return "blue"
    case "error":
      return "red"
    case "paused":
      return "amber"
    case "success":
      return "green"
    case "cancelled":
      return "slate"
    default:
      return "slate"
  }
}
