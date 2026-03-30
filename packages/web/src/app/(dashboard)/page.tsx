"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import {
  getAgents,
  getRecentRuns,
  getDashboardStats,
  getDashboardCosts,
  getCompanies,
  getCompanyDigest,
  wakeAgent,
  updateAgent,
  type Agent,
  type Run,
  type DashboardStats,
  type AgentDailyCost,
  type DigestRow,
} from "@/lib/api"
import { StatCard } from "@/components/stat-card"
import { AgentCard } from "@/components/agent-card"
import { CostChart } from "@/components/cost-chart"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { relativeTime, formatDuration, formatCost, cn } from "@/lib/utils"
import { Bot, Play, CheckCircle, DollarSign, AlertTriangle, BookOpen, ArrowRight } from "lucide-react"
import { toast } from "sonner"

const RUN_STATUS_BADGE: Record<string, string> = {
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  failed: "bg-red-500/15 text-red-400 border-red-500/30",
  running: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  queued: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  cancelled: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  timeout: "bg-orange-500/15 text-orange-400 border-orange-500/30",
}

export default function DashboardPage() {
  const queryClient = useQueryClient()

  const { data: stats, isLoading: statsLoading, isError: statsError } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats"],
    queryFn: getDashboardStats,
  })

  const { data: agents, isLoading: agentsLoading, isError: agentsError } = useQuery<Agent[]>({
    queryKey: ["agents"],
    queryFn: () => getAgents().then((r) => r.agents),
  })

  const { data: runs, isLoading: runsLoading, isError: runsError } = useQuery<Run[]>({
    queryKey: ["runs", "recent"],
    queryFn: () => getRecentRuns(20),
  })

  const { data: agentCosts } = useQuery<AgentDailyCost[]>({
    queryKey: ["dashboard-costs"],
    queryFn: () => getDashboardCosts(7),
  })

  const { data: companiesData } = useQuery({
    queryKey: ["companies"],
    queryFn: () => getCompanies({ limit: 1 }),
    staleTime: 60_000,
  })
  const firstCompanyId = companiesData?.companies?.[0]?.id

  const { data: todayDigest } = useQuery<DigestRow | null>({
    queryKey: ["digest", firstCompanyId, "today"],
    queryFn: () => getCompanyDigest(firstCompanyId!),
    enabled: !!firstCompanyId,
    staleTime: 5 * 60_000,
  })

  async function handleWake(id: string) {
    try {
      await wakeAgent(id)
      toast.success("Agent woken successfully")
      queryClient.invalidateQueries({ queryKey: ["agents"] })
    } catch {
      toast.error("Failed to wake agent")
    }
  }

  async function handlePause(id: string) {
    try {
      await updateAgent(id, { status: "paused" })
      toast.success("Agent paused")
      queryClient.invalidateQueries({ queryKey: ["agents"] })
    } catch {
      toast.error("Failed to pause agent")
    }
  }

  // When backend is down, show zeros instead of loading forever
  const isOffline = statsError && agentsError
  const totalAgents = stats?.totalAgents ?? agents?.length ?? 0
  const runningNow = stats?.runningNow ?? agents?.filter((a) => a.status === "running").length ?? 0
  const successRate = stats?.successRate24h
  const costToday = stats?.costToday ?? 0

  return (
    <div className="p-6 space-y-8 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Real-time overview of your AI agent fleet</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Total Agents"
          value={isOffline ? 0 : (statsLoading && !agents ? "-" : totalAgents)}
          icon={Bot}
          iconColor="text-blue-400"
          loading={statsLoading && !agents && !isOffline}
        />
        <StatCard
          title="Running Now"
          value={isOffline ? 0 : (statsLoading && !agents ? "-" : runningNow)}
          delta={isOffline ? undefined : runningNow}
          deltaLabel="active"
          icon={Play}
          iconColor="text-emerald-400"
          loading={statsLoading && !agents && !isOffline}
        />
        <StatCard
          title="Success Rate 24h"
          value={
            isOffline
              ? "—"
              : statsLoading
              ? "-"
              : successRate != null
              ? successRate.toFixed(1) + "%"
              : "no data"
          }
          icon={CheckCircle}
          iconColor="text-emerald-400"
          loading={statsLoading && !isOffline}
        />
        <StatCard
          title="Cost Today"
          value={isOffline ? "$0.00" : (statsLoading ? "-" : formatCost(costToday))}
          icon={DollarSign}
          iconColor="text-amber-400"
          loading={statsLoading && !isOffline}
        />
      </div>

      {/* Today's Digest summary card */}
      {firstCompanyId && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-violet-400" />
                Today&apos;s Digest
              </CardTitle>
              <Link
                href="/digest"
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                View full digest <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {todayDigest ? (
              <div className="flex flex-wrap gap-6">
                <div className="flex flex-col gap-0.5">
                  <span className="text-2xl font-bold text-slate-100">{todayDigest.digest.totalRuns}</span>
                  <span className="text-xs text-slate-500">Total runs</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-2xl font-bold text-emerald-400">{todayDigest.digest.successfulRuns}</span>
                  <span className="text-xs text-slate-500">Successful</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-2xl font-bold text-red-400">{todayDigest.digest.failedRuns}</span>
                  <span className="text-xs text-slate-500">Failed</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-2xl font-bold text-amber-400">{formatCost(todayDigest.digest.totalCostCents / 100)}</span>
                  <span className="text-xs text-slate-500">Spent today</span>
                </div>
                {todayDigest.digest.pendingApprovals > 0 && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-2xl font-bold text-orange-400">{todayDigest.digest.pendingApprovals}</span>
                    <span className="text-xs text-slate-500">Pending approvals</span>
                  </div>
                )}
                {todayDigest.digest.actionItems.length > 0 && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-2xl font-bold text-blue-400">{todayDigest.digest.actionItems.length}</span>
                    <span className="text-xs text-slate-500">Action items</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3 text-sm text-slate-500">
                <BookOpen className="h-4 w-4 text-slate-700" />
                <span>No digest for today yet. Digests are auto-generated at 23:00 UTC or you can</span>
                <Link href="/digest" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                  generate one now
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100">Agent Fleet</h2>
          <span className="text-xs text-slate-500 font-mono">{agents?.length ?? 0} agents</span>
        </div>
        {agentsLoading && !agentsError ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-48 rounded-lg bg-slate-900 border border-slate-800 animate-pulse" />
            ))}
          </div>
        ) : agents && agents.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} onWake={handleWake} onPause={handlePause} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-40 rounded-lg border border-dashed border-slate-800 text-slate-600 text-sm gap-2">
            <Bot className="h-8 w-8 text-slate-700" />
            <span>No agents configured. Create your first agent.</span>
          </div>
        )}
      </section>

      {/* Failed Run Alerts Panel */}
      {(() => {
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
        const failedRuns = runs?.filter(
          (r) =>
            (r.status === "failed" || r.status === "timeout") &&
            r.startedAt != null &&
            new Date(r.startedAt) > since24h
        ) ?? []
        if (failedRuns.length === 0) return null
        return (
          <Card className="bg-red-500/5 border-red-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-red-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Failed Runs — Last 24h ({failedRuns.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-red-500/10">
                {failedRuns.slice(0, 5).map((run) => (
                  <div key={run.id} className="px-6 py-3 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-200">{run.agentName}</p>
                      {run.error && (
                        <p className="text-xs text-red-400/80 font-mono mt-0.5 truncate max-w-md">
                          {run.error.slice(0, 120)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge
                        className={cn(
                          "text-[10px] px-1.5 py-0 h-4 border font-medium capitalize",
                          RUN_STATUS_BADGE[run.status] ?? "bg-slate-500/15 text-slate-400"
                        )}
                      >
                        {run.status}
                      </Badge>
                      <span className="text-xs text-slate-500">{relativeTime(run.startedAt)}</span>
                    </div>
                  </div>
                ))}
                {failedRuns.length > 5 && (
                  <div className="px-6 py-2 text-xs text-slate-500">
                    +{failedRuns.length - 5} more failed runs
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })()}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <Card className="xl:col-span-3 bg-slate-900 border-slate-800">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold text-slate-100">Recent Runs</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-500 text-xs pl-6">Agent</TableHead>
                  <TableHead className="text-slate-500 text-xs">Status</TableHead>
                  <TableHead className="text-slate-500 text-xs">Duration</TableHead>
                  <TableHead className="text-slate-500 text-xs">Cost</TableHead>
                  <TableHead className="text-slate-500 text-xs pr-6">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runsLoading && !runsError ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i} className="border-slate-800">
                      {Array.from({ length: 5 }).map((__, j) => (
                        <TableCell key={j} className="py-3">
                          <div className="h-4 bg-slate-800 rounded animate-pulse" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : runs && runs.length > 0 ? (
                  runs.map((run) => (
                    <TableRow key={run.id} className="border-slate-800 hover:bg-slate-800/40 transition-colors">
                      <TableCell className="pl-6 py-3">
                        <p className="text-sm font-medium text-slate-200">{run.agentName}</p>
                        <p className="text-xs text-slate-500">{run.companyName}</p>
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge
                          className={cn(
                            "text-[10px] px-1.5 py-0 h-4 border font-medium capitalize",
                            RUN_STATUS_BADGE[run.status] ?? "bg-slate-500/15 text-slate-400"
                          )}
                        >
                          {run.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3">
                        <span className="text-xs font-mono text-slate-400">{formatDuration(run.durationMs)}</span>
                      </TableCell>
                      <TableCell className="py-3">
                        <span className="text-xs font-mono text-slate-400">{formatCost(run.cost)}</span>
                      </TableCell>
                      <TableCell className="pr-6 py-3">
                        <span className="text-xs text-slate-500">{relativeTime(run.startedAt)}</span>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow className="border-0">
                    <TableCell colSpan={5} className="text-center text-slate-600 text-sm py-12">
                      No runs yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2 bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-slate-100">Cost — Last 7 Days</CardTitle>
            <p className="text-xs text-slate-500">Stacked by agent</p>
          </CardHeader>
          <CardContent>
            <CostChart data={agentCosts ?? []} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
