"use client"

import { useQuery } from "@tanstack/react-query"
import { getAgents, type Agent } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { relativeTime, cn } from "@/lib/utils"
import { Zap, RefreshCw } from "lucide-react"
import { useState, useEffect } from "react"

const MODEL_BADGE: Record<string, string> = {
  "claude-haiku-4-5-20251001": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "claude-sonnet-4-6": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "claude-opus-4-5": "bg-violet-500/15 text-violet-400 border-violet-500/30",
  "claude-opus-4-6": "bg-violet-500/15 text-violet-400 border-violet-500/30",
  haiku: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  sonnet: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  opus: "bg-violet-500/15 text-violet-400 border-violet-500/30",
}

function getModelBadge(model: string): string {
  if (MODEL_BADGE[model]) return MODEL_BADGE[model]
  const key = Object.keys(MODEL_BADGE).find((k) => model.includes(k))
  return key ? MODEL_BADGE[key] : "bg-slate-500/15 text-slate-400 border-slate-500/30"
}

function modelShortLabel(model: string): string {
  if (model.includes("haiku")) return "Haiku"
  if (model.includes("sonnet")) return "Sonnet"
  if (model.includes("opus")) return "Opus"
  return model
}

const STATUS_CONFIG: Record<string, { dot: string; ring: string; label: string; bg: string }> = {
  idle: {
    dot: "bg-emerald-400",
    ring: "ring-emerald-500/20",
    label: "IDLE",
    bg: "border-emerald-500/20",
  },
  running: {
    dot: "bg-blue-400 animate-pulse",
    ring: "ring-blue-500/30",
    label: "RUNNING",
    bg: "border-blue-500/30",
  },
  error: {
    dot: "bg-red-400",
    ring: "ring-red-500/20",
    label: "ERROR",
    bg: "border-red-500/30",
  },
  paused: {
    dot: "bg-amber-400",
    ring: "ring-amber-500/20",
    label: "PAUSED",
    bg: "border-amber-500/20",
  },
}

export default function StatusBoardPage() {
  const [lastRefresh, setLastRefresh] = useState(new Date())

  const { data: agents, isLoading, dataUpdatedAt } = useQuery<Agent[]>({
    queryKey: ["agents"],
    queryFn: () => getAgents().then((r) => r.agents),
    refetchInterval: 5000,
  })

  useEffect(() => {
    if (dataUpdatedAt) {
      setLastRefresh(new Date(dataUpdatedAt))
    }
  }, [dataUpdatedAt])

  const running = agents?.filter((a) => a.status === "running").length ?? 0
  const errors = agents?.filter((a) => a.status === "error").length ?? 0
  const idle = agents?.filter((a) => a.status === "idle").length ?? 0

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      {/* Status board header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Agent Status Board</h1>
            <p className="text-xs text-slate-500">Live — auto-refresh every 5s</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-slate-400">
                <span className="text-blue-400 font-bold tabular-nums">{running}</span> running
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              <span className="text-slate-400">
                <span className="text-red-400 font-bold tabular-nums">{errors}</span> errors
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-slate-400">
                <span className="text-emerald-400 font-bold tabular-nums">{idle}</span> idle
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <RefreshCw className="h-3 w-3" />
            <span>
              {lastRefresh.toLocaleTimeString("en-US", {
                hour12: false,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Agent grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-40 bg-slate-900 rounded-xl border border-slate-800 animate-pulse" />
          ))}
        </div>
      ) : agents && agents.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {agents.map((agent) => {
            const config = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.idle
            return (
              <div
                key={agent.id}
                className={cn(
                  "rounded-xl bg-slate-900 border p-4 ring-1 transition-all duration-300",
                  config.bg,
                  config.ring
                )}
              >
                {/* Status indicator — big */}
                <div className="flex items-center justify-between mb-3">
                  <span className="relative flex h-3.5 w-3.5">
                    {agent.status === "running" && (
                      <span className="absolute animate-ping inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                    )}
                    <span
                      className={cn(
                        "relative inline-flex rounded-full h-3.5 w-3.5",
                        config.dot
                      )}
                    />
                  </span>
                  <span
                    className={cn(
                      "text-[9px] font-bold tracking-widest font-mono",
                      agent.status === "running"
                        ? "text-blue-400"
                        : agent.status === "error"
                        ? "text-red-400"
                        : agent.status === "paused"
                        ? "text-amber-400"
                        : "text-emerald-400"
                    )}
                  >
                    {config.label}
                  </span>
                </div>

                {/* Agent name */}
                <p className="text-sm font-semibold text-slate-100 truncate leading-tight">
                  {agent.name}
                </p>
                <p className="text-[11px] text-slate-500 truncate mt-0.5">
                  {agent.companyName}
                </p>

                {/* Model badge */}
                <Badge
                  className={cn(
                    "mt-2 text-[9px] px-1.5 py-0 h-4 border font-mono",
                    getModelBadge(agent.model)
                  )}
                >
                  {modelShortLabel(agent.model)}
                </Badge>

                {/* Last updated */}
                <p className="mt-2 text-[10px] text-slate-600">
                  {relativeTime(agent.updatedAt)}
                </p>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex items-center justify-center h-64 rounded-xl border border-dashed border-slate-800 text-slate-600 text-sm">
          No agents to display
        </div>
      )}
    </div>
  )
}
