"use client"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { relativeTime, cn } from "@/lib/utils"
import type { Agent } from "@/lib/api"
import { Play, Pause, FileText, Clock } from "lucide-react"
import Link from "next/link"

interface AgentCardProps {
  agent: Agent
  onWake?: (id: string) => void
  onPause?: (id: string) => void
}

const MODEL_STYLES: Record<string, string> = {
  "claude-haiku-4-5-20251001": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "claude-sonnet-4-6": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "claude-opus-4-5": "bg-violet-500/15 text-violet-400 border-violet-500/30",
  "claude-opus-4-6": "bg-violet-500/15 text-violet-400 border-violet-500/30",
  haiku: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  sonnet: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  opus: "bg-violet-500/15 text-violet-400 border-violet-500/30",
}

function modelShortLabel(model: string): string {
  if (model.includes("haiku")) return "Haiku"
  if (model.includes("sonnet")) return "Sonnet"
  if (model.includes("opus")) return "Opus"
  return model
}

function modelStyle(model: string): string {
  return MODEL_STYLES[model] ?? MODEL_STYLES[Object.keys(MODEL_STYLES).find((k) => model.includes(k)) ?? ""] ?? "bg-slate-500/15 text-slate-400 border-slate-500/30"
}

const STATUS_DOT: Record<string, { color: string; animated: boolean }> = {
  idle: { color: "bg-emerald-400", animated: false },
  running: { color: "bg-blue-400", animated: true },
  error: { color: "bg-red-400", animated: false },
  paused: { color: "bg-amber-400", animated: false },
}

export function AgentCard({ agent, onWake, onPause }: AgentCardProps) {
  const dot = STATUS_DOT[agent.status] ?? { color: "bg-slate-400", animated: false }
  const mStyle = modelStyle(agent.model)

  return (
    <Card className="bg-slate-900 border-slate-800 hover:border-slate-700 transition-all duration-200 hover:shadow-lg hover:shadow-slate-900/50 hover:-translate-y-0.5 group">
      <CardHeader className="pb-3 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
              <span
                className={cn(
                  "absolute inline-flex h-full w-full rounded-full opacity-75",
                  dot.animated ? "animate-ping " + dot.color : "hidden"
                )}
              />
              <span
                className={cn(
                  "relative inline-flex rounded-full h-2.5 w-2.5",
                  dot.color
                )}
              />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-slate-100 text-sm leading-tight truncate">
                {agent.name}
              </p>
              <p className="text-xs text-slate-500 truncate mt-0.5">
                {agent.role || agent.companyName}
              </p>
            </div>
          </div>
          <Badge
            className={cn(
              "text-[10px] px-1.5 py-0 h-4 border font-mono flex-shrink-0",
              mStyle
            )}
          >
            {modelShortLabel(agent.model)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-3">
        <div className="flex items-center gap-1.5">
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 h-4 border-slate-700 text-slate-400 bg-transparent"
          >
            {agent.role}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Clock className="h-3 w-3 flex-shrink-0" />
          <span className="text-[11px]">Updated {relativeTime(agent.updatedAt)}</span>
        </div>

        <div className="flex items-center gap-1.5 pt-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs border-slate-700 bg-slate-800 text-slate-300 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/40 transition-colors"
            onClick={() => onWake?.(agent.id)}
            disabled={agent.status === "running"}
          >
            <Play className="h-3 w-3 mr-1" />
            Wake
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs border-slate-700 bg-slate-800 text-slate-300 hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/40 transition-colors"
            onClick={() => onPause?.(agent.id)}
            disabled={agent.status === "paused"}
          >
            <Pause className="h-3 w-3 mr-1" />
            Pause
          </Button>
          <Link
            href={`/agents/${agent.id}`}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "h-7 px-2 text-xs border-slate-700 bg-slate-800 text-slate-300 hover:bg-blue-500/10 hover:text-blue-400 hover:border-blue-500/40 transition-colors ml-auto"
            )}
          >
            <FileText className="h-3 w-3 mr-1" />
            Logs
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
