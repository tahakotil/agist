"use client"

import { useSSE } from "@/lib/use-sse"

/**
 * Mounts the SSE connection so all dashboard pages receive
 * real-time cache invalidations from the server.
 * Rendered as a zero-UI child inside the dashboard layout.
 */
export function SSEProvider() {
  useSSE()
  return null
}
