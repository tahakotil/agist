"use client"

import { use } from "react"
import { useQuery } from "@tanstack/react-query"
import { getRun, type Run } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { LogViewer } from "@/components/log-viewer"
import { relativeTime, formatDuration, formatCost, cn } from "@/lib/utils"
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Play,
  Clock,
  Timer,
  DollarSign,
  Bot,
} from "lucide-react"
import Link from "next/link"

interface PageProps {
  params: Promise<{ id: string }>
}

const RUN_STATUS_BADGE: Record<string, string> = {
  success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  error: "bg-red-500/15 text-red-400 border-red-500/30",
  running: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  cancelled: "bg-slate-500/15 text-slate-400 border-slate-500/30",
}

export default function RunDetailPage({ params }: PageProps) {
  const { id } = use(params)

  const { data: run, isLoading } = useQuery<Run>({
    queryKey: ["runs", id],
    queryFn: () => getRun(id),
  })

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 w-48 bg-slate-900 rounded animate-pulse" />
        <div className="h-32 bg-slate-900 rounded-lg animate-pulse" />
        <div className="h-96 bg-slate-900 rounded-lg animate-pulse" />
      </div>
    )
  }

  if (!run) {
    return (
      <div className="p-6 text-center text-slate-500">Run not found</div>
    )
  }

  return (
    <div className="p-6 space-y-8 max-w-[1600px] mx-auto">
      <Link
        href="/runs"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "text-slate-400 hover:text-slate-200 -ml-2"
        )}
      >
        <ArrowLeft className="h-4 w-4 mr-1.5" />
        Runs
      </Link>

      {/* Run header */}
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 mt-1">
          {run.status === "success" ? (
            <CheckCircle className="h-8 w-8 text-emerald-400" />
          ) : run.status === "error" ? (
            <XCircle className="h-8 w-8 text-red-400" />
          ) : run.status === "running" ? (
            <Play className="h-8 w-8 text-blue-400 animate-pulse" />
          ) : (
            <div className="h-8 w-8 rounded-full bg-slate-700 border border-slate-600" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-slate-100 font-mono text-sm">
              Run {run.id}
            </h1>
            <Badge
              className={cn(
                "border text-[11px] capitalize",
                RUN_STATUS_BADGE[run.status] ?? ""
              )}
            >
              {run.status}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-2 text-sm text-slate-500 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Bot className="h-3.5 w-3.5" />
              <Link href={`/agents/${run.agentId}`} className="hover:text-slate-300 transition-colors">
                {run.agentName}
              </Link>
            </div>
            <span className="text-slate-700">·</span>
            <Link href={`/companies/${run.companyId}`} className="hover:text-slate-300 transition-colors">
              {run.companyName}
            </Link>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-blue-400 flex-shrink-0" />
            <div>
              <p className="text-xs text-slate-500">Started</p>
              <p className="text-sm font-medium text-slate-200 mt-0.5">
                {relativeTime(run.startedAt)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-slate-400 flex-shrink-0" />
            <div>
              <p className="text-xs text-slate-500">Finished</p>
              <p className="text-sm font-medium text-slate-200 mt-0.5">
                {run.finishedAt ? relativeTime(run.finishedAt) : "—"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4 flex items-center gap-3">
            <Timer className="h-5 w-5 text-amber-400 flex-shrink-0" />
            <div>
              <p className="text-xs text-slate-500">Duration</p>
              <p className="text-sm font-medium text-slate-200 mt-0.5 font-mono">
                {formatDuration(run.durationMs)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4 flex items-center gap-3">
            <DollarSign className="h-5 w-5 text-emerald-400 flex-shrink-0" />
            <div>
              <p className="text-xs text-slate-500">Cost</p>
              <p className="text-sm font-medium text-slate-200 mt-0.5 font-mono">
                {formatCost(run.cost)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Logs */}
      <section>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Logs</h2>
        {run.status === "running" ? (
          <LogViewer
            agentId={run.agentId}
            runId={run.id}
            height="500px"
          />
        ) : run.logExcerpt ? (
          <div className="rounded-lg border border-slate-800 bg-slate-950 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-900/50">
              <span className="text-xs font-medium text-slate-400 font-mono uppercase tracking-wider">Log Excerpt</span>
            </div>
            <div className="p-4 max-h-[500px] overflow-y-auto">
              <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap break-all leading-5">
                {run.logExcerpt}
              </pre>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-8 text-center text-slate-600 text-xs font-mono">
            No logs available for this run
          </div>
        )}
      </section>
    </div>
  )
}
