"use client"

import { useSSE } from "@/lib/use-sse"
import { useQueryClient } from "@tanstack/react-query"
import { ApiConnectionError } from "@/lib/api"
import { AlertCircle } from "lucide-react"

/**
 * Mounts the SSE connection and shows a banner when backend is unreachable.
 */
export function SSEProvider() {
  const connected = useSSE()
  const queryClient = useQueryClient()

  // Check if any query has a connection error
  const queries = queryClient.getQueryCache().getAll()
  const hasConnectionError = queries.some(
    (q) => q.state.error instanceof ApiConnectionError
  )

  const showBanner = !connected && hasConnectionError

  if (!showBanner) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 flex items-center justify-center gap-2 text-amber-400 text-sm backdrop-blur-sm">
      <AlertCircle className="h-4 w-4 flex-shrink-0" />
      <span>
        Cannot connect to backend at <code className="font-mono text-xs">localhost:4400</code>
        {" — "}Start with <code className="font-mono text-xs bg-amber-500/10 px-1 rounded">pnpm dev</code>
      </span>
    </div>
  )
}
