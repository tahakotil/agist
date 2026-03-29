"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { Download, Copy, ArrowDown, Wifi, WifiOff } from "lucide-react"
import type { LogEntry } from "@/lib/api"

interface LogViewerProps {
  agentId: string
  runId?: string
  initialLogs?: LogEntry[]
  height?: string
}

const LEVEL_STYLES: Record<string, string> = {
  INFO: "text-slate-400",
  WARN: "text-amber-400",
  ERROR: "text-red-400",
  DEBUG: "text-slate-600",
}

const LEVEL_PREFIX: Record<string, string> = {
  INFO: " INFO",
  WARN: " WARN",
  ERROR: "ERROR",
  DEBUG: "DEBUG",
}

export function LogViewer({ agentId, runId, initialLogs = [], height = "400px" }: LogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>(initialLogs)
  const [connected, setConnected] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4400/ws"
    let ws: WebSocket

    try {
      ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        const msg = runId
          ? JSON.stringify({ type: "subscribe_run", runId })
          : JSON.stringify({ type: "subscribe_agent", agentId })
        ws.send(msg)
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === "log" && data.entry) {
            setLogs((prev) => [...prev.slice(-4999), data.entry])
          }
        } catch {
          // ignore malformed messages
        }
      }

      ws.onclose = () => {
        setConnected(false)
      }

      ws.onerror = () => {
        setConnected(false)
      }
    } catch {
      setConnected(false)
    }

    return () => {
      ws?.close()
    }
  }, [agentId, runId])

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [logs, autoScroll])

  const handleCopy = useCallback(() => {
    const text = logs
      .map(
        (l) =>
          `[${new Date(l.timestamp).toISOString()}] [${l.level}] ${l.message}`
      )
      .join("\n")
    navigator.clipboard.writeText(text).catch(() => {})
  }, [logs])

  const handleDownload = useCallback(() => {
    const text = logs
      .map(
        (l) =>
          `[${new Date(l.timestamp).toISOString()}] [${l.level}] ${l.message}`
      )
      .join("\n")
    const blob = new Blob([text], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `agent-${agentId}-logs.txt`
    a.click()
    URL.revokeObjectURL(url)
  }, [logs, agentId])

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-400 font-mono uppercase tracking-wider">
            Logs
          </span>
          <span className="text-slate-700">·</span>
          <span className="text-xs text-slate-600 font-mono">
            {logs.length} lines
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            {connected ? (
              <>
                <Wifi className="h-3 w-3 text-emerald-400" />
                <span className="text-xs text-emerald-400">Live</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3 text-slate-500" />
                <span className="text-xs text-slate-500">Offline</span>
              </>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-slate-500 hover:text-slate-300"
            onClick={() => setAutoScroll((v) => !v)}
            title={autoScroll ? "Disable auto-scroll" : "Enable auto-scroll"}
          >
            <ArrowDown
              className={cn(
                "h-3 w-3 transition-colors",
                autoScroll ? "text-blue-400" : "text-slate-500"
              )}
            />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-slate-500 hover:text-slate-300"
            onClick={handleCopy}
            title="Copy logs"
          >
            <Copy className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-slate-500 hover:text-slate-300"
            onClick={handleDownload}
            title="Download logs"
          >
            <Download className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Log output */}
      <ScrollArea
        ref={scrollAreaRef}
        style={{ height }}
        className="w-full"
      >
        <div className="p-4 space-y-0.5">
          {logs.length === 0 ? (
            <p className="text-slate-600 text-xs font-mono text-center py-8">
              Waiting for logs...
            </p>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="flex gap-3 text-xs font-mono leading-5 hover:bg-slate-900/50 px-1 rounded">
                <span className="text-slate-700 flex-shrink-0 tabular-nums">
                  {new Date(log.timestamp).toLocaleTimeString("en-US", {
                    hour12: false,
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
                <span
                  className={cn(
                    "flex-shrink-0 font-semibold w-10",
                    LEVEL_STYLES[log.level] ?? "text-slate-400"
                  )}
                >
                  {LEVEL_PREFIX[log.level] ?? log.level}
                </span>
                <span className={cn("break-all", LEVEL_STYLES[log.level] ?? "text-slate-300")}>
                  {log.message}
                </span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  )
}
