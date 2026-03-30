"use client"

import { use, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { getRun, getRunOutputs, type Run, type RunOutput } from "@/lib/api"
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
  ChevronDown,
  ChevronRight,
  Activity,
  BarChart2,
  Search,
  AlertTriangle,
  FileText,
  Zap,
} from "lucide-react"
import Link from "next/link"

interface PageProps {
  params: Promise<{ id: string }>
}

const RUN_STATUS_BADGE: Record<string, string> = {
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  failed: "bg-red-500/15 text-red-400 border-red-500/30",
  running: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  queued: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  cancelled: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  timeout: "bg-orange-500/15 text-orange-400 border-orange-500/30",
}

const OUTPUT_TYPE_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  health: {
    label: "Health",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    icon: <Activity className="h-3 w-3" />,
  },
  analytics: {
    label: "Analytics",
    className: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    icon: <BarChart2 className="h-3 w-3" />,
  },
  seo: {
    label: "SEO",
    className: "bg-violet-500/15 text-violet-400 border-violet-500/30",
    icon: <Search className="h-3 w-3" />,
  },
  alert: {
    label: "Alert",
    className: "bg-red-500/15 text-red-400 border-red-500/30",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  report: {
    label: "Report",
    className: "bg-slate-500/15 text-slate-400 border-slate-500/30",
    icon: <FileText className="h-3 w-3" />,
  },
  content: {
    label: "Content",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    icon: <FileText className="h-3 w-3" />,
  },
}

const CHECK_STATUS_CLASS: Record<string, string> = {
  PASS: "text-emerald-400",
  WARN: "text-amber-400",
  WARNING: "text-amber-400",
  CRITICAL: "text-red-400",
  FAIL: "text-red-400",
  ERROR: "text-red-400",
  OK: "text-emerald-400",
}

function OutputCard({ output }: { output: RunOutput }) {
  const [expanded, setExpanded] = useState(false)
  const config = OUTPUT_TYPE_CONFIG[output.outputType] ?? OUTPUT_TYPE_CONFIG["report"]
  const data = output.data

  // Extract top-level status string if present
  const topStatus = (data.status as string) ?? (data.overall_status as string) ?? null
  const topStatusClass = topStatus ? (CHECK_STATUS_CLASS[topStatus.toUpperCase()] ?? "text-slate-300") : null

  // Extract checks array for health reports
  const checks = Array.isArray(data.checks) ? (data.checks as Record<string, unknown>[]) : null

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardContent className="p-0">
        <button
          className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-800/50 transition-colors rounded-lg"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-slate-500 flex-shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-500 flex-shrink-0" />
          )}
          <Badge className={cn("border text-[11px] flex items-center gap-1", config.className)}>
            {config.icon}
            {config.label}
          </Badge>
          {topStatus && (
            <span className={cn("text-xs font-mono font-semibold", topStatusClass)}>
              {topStatus}
            </span>
          )}
          <span className="text-xs text-slate-500 ml-auto">{relativeTime(output.createdAt)}</span>
        </button>

        {expanded && (
          <div className="px-4 pb-4 space-y-3 border-t border-slate-800 pt-3">
            {/* Health checks inline display */}
            {checks && checks.length > 0 && (
              <div className="space-y-1.5">
                {checks.map((check, i) => {
                  const checkStatus = ((check.status as string) ?? "").toUpperCase()
                  const statusClass = CHECK_STATUS_CLASS[checkStatus] ?? "text-slate-400"
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className={cn("font-mono font-semibold w-16 flex-shrink-0", statusClass)}>
                        {checkStatus || "—"}
                      </span>
                      <span className="text-slate-300">{(check.name as string) ?? (check.check as string) ?? `Check ${i + 1}`}</span>
                      {check.message && (
                        <span className="text-slate-500 truncate">{check.message as string}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Raw JSON display */}
            <div className="rounded border border-slate-800 bg-slate-950 p-3 max-h-[320px] overflow-y-auto">
              <pre className="text-[11px] font-mono text-slate-300 whitespace-pre-wrap break-all leading-5">
                {JSON.stringify(data, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function RunDetailPage({ params }: PageProps) {
  const { id } = use(params)

  const { data: run, isLoading } = useQuery<Run>({
    queryKey: ["runs", id],
    queryFn: () => getRun(id),
  })

  const { data: outputs } = useQuery<RunOutput[]>({
    queryKey: ["runs", id, "outputs"],
    queryFn: () => getRunOutputs(id),
    enabled: !!run,
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
          {run.status === "completed" ? (
            <CheckCircle className="h-8 w-8 text-emerald-400" />
          ) : run.status === "failed" ? (
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
            {run.source.startsWith("chain:") && (
              <>
                <span className="text-slate-700">·</span>
                <div className="flex items-center gap-1.5 text-amber-400">
                  <Zap className="h-3.5 w-3.5" />
                  <span>Triggered by <span className="font-mono">{run.source.slice(6)}</span></span>
                  {(run.chainDepth ?? 0) > 0 && (
                    <span className="text-slate-600">· depth {run.chainDepth}</span>
                  )}
                </div>
              </>
            )}
            {run.source === "scheduler" || run.source === "routine" ? (
              <>
                <span className="text-slate-700">·</span>
                <span className="text-blue-400">Scheduled</span>
              </>
            ) : null}
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

      {/* Parsed Outputs */}
      {outputs && outputs.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-4">
            Parsed Outputs
            <span className="ml-2 text-sm font-normal text-slate-500">({outputs.length})</span>
          </h2>
          <div className="space-y-3">
            {outputs.map((output) => (
              <OutputCard key={output.id} output={output} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
