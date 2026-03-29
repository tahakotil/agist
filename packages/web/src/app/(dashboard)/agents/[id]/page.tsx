"use client"

import { use } from "react"
import { useQuery } from "@tanstack/react-query"
import { api, type Agent, type Run } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { LogViewer } from "@/components/log-viewer"
import { relativeTime, formatDuration, formatCost, cn } from "@/lib/utils"
import {
  ArrowLeft,
  Bot,
  Clock,
  Play,
  Pause,
  Building2,
  CheckCircle,
  XCircle,
  Timer,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
} from "recharts"

interface PageProps {
  params: Promise<{ id: string }>
}

const MODEL_BADGE: Record<string, string> = {
  haiku: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  sonnet: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  opus: "bg-violet-500/15 text-violet-400 border-violet-500/30",
}

const STATUS_BADGE: Record<string, string> = {
  idle: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  running: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  error: "bg-red-500/15 text-red-400 border-red-500/30",
  paused: "bg-amber-500/15 text-amber-400 border-amber-500/30",
}

const RUN_STATUS_BADGE: Record<string, string> = {
  success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  error: "bg-red-500/15 text-red-400 border-red-500/30",
  running: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  cancelled: "bg-slate-500/15 text-slate-400 border-slate-500/30",
}

export default function AgentDetailPage({ params }: PageProps) {
  const { id } = use(params)

  const { data: agent, isLoading } = useQuery<Agent>({
    queryKey: ["agents", id],
    queryFn: () => api<Agent>(`/agents/${id}`),
  })

  const { data: runs } = useQuery<Run[]>({
    queryKey: ["agents", id, "runs"],
    queryFn: () => api<Run[]>(`/agents/${id}/runs?limit=20`),
  })

  async function handleWake() {
    try {
      await api(`/agents/${id}/wake`, { method: "POST" })
      toast.success("Agent woken")
    } catch {
      toast.error("Failed to wake agent")
    }
  }

  async function handlePause() {
    try {
      await api(`/agents/${id}/pause`, { method: "POST" })
      toast.success("Agent paused")
    } catch {
      toast.error("Failed to pause agent")
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 w-48 bg-slate-900 rounded animate-pulse" />
        <div className="h-32 bg-slate-900 rounded-lg animate-pulse" />
        <div className="h-96 bg-slate-900 rounded-lg animate-pulse" />
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="p-6 text-center text-slate-500">Agent not found</div>
    )
  }

  // Build cost sparkline from runs
  const costData = (runs ?? [])
    .slice()
    .reverse()
    .map((r) => ({ cost: r.cost, status: r.status }))

  return (
    <div className="p-6 space-y-8 max-w-[1600px] mx-auto">
      {/* Back */}
      <Link
        href="/agents"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "text-slate-400 hover:text-slate-200 -ml-2"
        )}
      >
        <ArrowLeft className="h-4 w-4 mr-1.5" />
        Agents
      </Link>

      {/* Agent header */}
      <div className="flex items-start gap-4 flex-wrap">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-700 border border-slate-600 flex items-center justify-center flex-shrink-0">
          <Bot className="h-7 w-7 text-slate-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-100">{agent.name}</h1>
            <Badge
              className={cn(
                "border text-[11px]",
                STATUS_BADGE[agent.status] ?? "bg-slate-500/15 text-slate-400"
              )}
            >
              {agent.status}
            </Badge>
            <Badge
              className={cn(
                "border font-mono text-[11px]",
                MODEL_BADGE[agent.model] ?? "bg-slate-500/15 text-slate-400"
              )}
            >
              {agent.model}
            </Badge>
          </div>
          <div className="flex items-center gap-4 mt-2 text-sm text-slate-500 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              <Link href={`/companies/${agent.companyId}`} className="hover:text-slate-300 transition-colors">
                {agent.companyName}
              </Link>
            </div>
            <span className="text-slate-700">·</span>
            <span>{agent.role}</span>
            {agent.cronSchedule && (
              <>
                <span className="text-slate-700">·</span>
                <div className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  <span className="font-mono text-xs">{agent.cronSchedule}</span>
                </div>
              </>
            )}
          </div>
          {agent.description && (
            <p className="text-slate-400 text-sm mt-2 max-w-2xl">{agent.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/40"
            onClick={handleWake}
            disabled={agent.status === "running"}
          >
            <Play className="h-3.5 w-3.5 mr-1.5" />
            Wake
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/40"
            onClick={handlePause}
            disabled={agent.status === "paused"}
          >
            <Pause className="h-3.5 w-3.5 mr-1.5" />
            Pause
          </Button>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <Clock className="h-3 w-3" /> Last Run
            </p>
            <p className="text-sm font-medium text-slate-200 mt-1">
              {relativeTime(agent.lastRunAt)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <Timer className="h-3 w-3" /> Next Run
            </p>
            <p className="text-sm font-medium text-slate-200 mt-1">
              {relativeTime(agent.nextRunAt)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-emerald-400" /> Total Runs
            </p>
            <p className="text-sm font-medium text-slate-200 mt-1">
              {runs?.length ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 mb-1">Cost Trend</p>
            <ResponsiveContainer width="100%" height={36}>
              <AreaChart data={costData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="cost"
                  stroke="#3b82f6"
                  strokeWidth={1.5}
                  fill="url(#sparkGrad)"
                  dot={false}
                />
                <Tooltip
                  content={({ active, payload }) =>
                    active && payload?.[0] ? (
                      <div className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] font-mono text-slate-300">
                        ${Number(payload[0].value).toFixed(5)}
                      </div>
                    ) : null
                  }
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Live log viewer */}
      <section>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Live Logs</h2>
        <LogViewer agentId={id} height="380px" />
      </section>

      {/* Run history */}
      <section>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Run History</h2>
        <div className="space-y-2">
          {runs && runs.length > 0 ? (
            runs.map((run, i) => (
              <Link key={run.id} href={`/runs/${run.id}`}>
                <div className="flex items-center gap-4 p-3 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all hover:-translate-y-0.5 hover:shadow-md group">
                  <div className="flex-shrink-0">
                    {run.status === "success" ? (
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                    ) : run.status === "error" ? (
                      <XCircle className="h-4 w-4 text-red-400" />
                    ) : run.status === "running" ? (
                      <Play className="h-4 w-4 text-blue-400 animate-pulse" />
                    ) : (
                      <div className="h-4 w-4 rounded-full bg-slate-700" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge
                        className={cn(
                          "text-[10px] px-1.5 py-0 h-4 border capitalize",
                          RUN_STATUS_BADGE[run.status] ?? ""
                        )}
                      >
                        {run.status}
                      </Badge>
                      <span className="text-xs text-slate-500">
                        {relativeTime(run.startedAt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500 font-mono">
                    <span>{formatDuration(run.durationMs)}</span>
                    <span>{formatCost(run.cost)}</span>
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="flex items-center justify-center h-32 rounded-lg border border-dashed border-slate-800 text-slate-600 text-sm">
              No runs yet for this agent
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
