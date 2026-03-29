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
