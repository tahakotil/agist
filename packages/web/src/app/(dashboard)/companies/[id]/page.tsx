"use client"

import { use, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getCompany, getCompanyAgents, getCompanyRoutines, getCompanySignals, getAgentRuns, wakeAgent, updateAgent, exportCompanyTemplate, type Company, type Agent, type Routine, type Signal, type Run } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { buttonVariants, Button } from "@/components/ui/button"
import { OrgChart } from "@/components/org-chart"
import { AgentCard } from "@/components/agent-card"
import { Building2, Clock, DollarSign, Bot, ArrowLeft, Radio, CheckCircle2, XCircle, Loader2, PauseCircle, Download } from "lucide-react"
import { formatCost, relativeTime, cn } from "@/lib/utils"
import Link from "next/link"
import { toast } from "sonner"

interface PageProps {
  params: Promise<{ id: string }>
}

export default function CompanyDetailPage({ params }: PageProps) {
  const { id } = use(params)
  const queryClient = useQueryClient()

  const { data: company, isLoading: companyLoading } = useQuery<Company>({
    queryKey: ["companies", id],
    queryFn: () => getCompany(id),
  })

  const { data: agents, isLoading: agentsLoading } = useQuery<Agent[]>({
    queryKey: ["companies", id, "agents"],
    queryFn: () => getCompanyAgents(id).then((r) => r.agents),
  })

  const { data: routines } = useQuery<Routine[]>({
    queryKey: ["companies", id, "routines"],
    queryFn: () => getCompanyRoutines(id).then((r) => r.routines),
  })

  const [signalTypeFilter, setSignalTypeFilter] = useState<string>("all")

  const { data: signals } = useQuery<Signal[]>({
    queryKey: ["companies", id, "signals"],
    queryFn: () => getCompanySignals(id, { limit: 50 }),
    refetchInterval: 15_000,
  })

  const [exporting, setExporting] = useState(false)

  async function handleExport() {
    setExporting(true)
    try {
      const template = await exportCompanyTemplate(id)
      const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${template.name.toLowerCase().replace(/\s+/g, "-")}-template.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success("Template exported")
    } catch {
      toast.error("Failed to export template")
    } finally {
      setExporting(false)
    }
  }

  async function handleWake(agentId: string) {
    try {
      await wakeAgent(agentId)
      toast.success("Agent woken")
      queryClient.invalidateQueries({ queryKey: ["companies", id, "agents"] })
    } catch {
      toast.error("Failed to wake agent")
    }
  }

  async function handlePause(agentId: string) {
    try {
      await updateAgent(agentId, { status: "paused" })
      toast.success("Agent paused")
      queryClient.invalidateQueries({ queryKey: ["companies", id, "agents"] })
    } catch {
      toast.error("Failed to pause agent")
    }
  }

  if (companyLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 w-48 bg-slate-900 rounded animate-pulse" />
        <div className="h-32 bg-slate-900 rounded animate-pulse" />
        <div className="h-64 bg-slate-900 rounded animate-pulse" />
      </div>
    )
  }

  if (!company) {
    return (
      <div className="p-6 flex flex-col items-center gap-4 text-slate-500">
        <Building2 className="h-12 w-12 text-slate-700" />
        <p>Company not found</p>
        <Link href="/companies" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-slate-400")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Companies
        </Link>
      </div>
    )
  }

  const budgetUsedPct = company.budgetMonthlyCents > 0
    ? Math.min(100, (company.spentMonthlyCents / company.budgetMonthlyCents) * 100)
    : 0

  return (
    <div className="p-6 space-y-8 max-w-[1600px] mx-auto">
      <Link
        href="/companies"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "text-slate-400 hover:text-slate-200 -ml-2"
        )}
      >
        <ArrowLeft className="h-4 w-4 mr-1.5" />
        Companies
      </Link>

      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
          <Building2 className="h-7 w-7 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-100">{company.name}</h1>
            <Badge className="bg-blue-500/15 text-blue-400 border border-blue-500/30 text-[11px] capitalize">
              {company.status}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExport}
              disabled={exporting}
              className="ml-auto border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500"
            >
              {exporting ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5 mr-1.5" />
              )}
              Export Template
            </Button>
          </div>
          {company.description && (
            <p className="text-slate-400 text-sm mt-2 max-w-2xl">{company.description}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4 flex items-center gap-3">
            <Bot className="h-5 w-5 text-blue-400" />
            <div>
              <p className="text-xs text-slate-500">Agents</p>
              <p className="text-xl font-bold text-slate-100">{company.agentCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4 flex items-center gap-3">
            <DollarSign className="h-5 w-5 text-amber-400" />
            <div>
              <p className="text-xs text-slate-500">Budget</p>
              <p className="text-xl font-bold text-slate-100">{formatCost(company.budgetMonthlyCents / 100)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4 flex items-center gap-3">
            <DollarSign className="h-5 w-5 text-emerald-400" />
            <div>
              <p className="text-xs text-slate-500">Spent</p>
              <p className="text-xl font-bold text-slate-100">{formatCost(company.spentMonthlyCents / 100)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 mb-2">Budget Used</p>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  budgetUsedPct > 90 ? "bg-red-500" : budgetUsedPct > 70 ? "bg-amber-500" : "bg-emerald-500"
                )}
                style={{ width: `${budgetUsedPct}%` }}
              />
            </div>
            <p className="text-sm font-bold text-slate-100 mt-1">
              {budgetUsedPct.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Organization Chart</h2>
        {agentsLoading ? (
          <div className="h-64 bg-slate-900 rounded-lg border border-slate-800 animate-pulse" />
        ) : agents && agents.length > 0 ? (
          <OrgChart agents={agents} />
        ) : (
          <div className="flex items-center justify-center h-40 rounded-lg border border-dashed border-slate-800 text-slate-600 text-sm">
            No agents to display
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">
          Agents
          <span className="ml-2 text-sm font-normal text-slate-500">
            ({agents?.length ?? 0})
          </span>
        </h2>
        {agentsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-48 bg-slate-900 rounded-lg border border-slate-800 animate-pulse" />
            ))}
          </div>
        ) : agents && agents.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} onWake={handleWake} onPause={handlePause} />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-32 rounded-lg border border-dashed border-slate-800 text-slate-600 text-sm">
            No agents in this company
          </div>
        )}
      </section>

      {routines && routines.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-4">Routines</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {routines.map((routine) => (
              <Card key={routine.id} className="bg-slate-900 border-slate-800">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold text-slate-200">
                      {routine.title}
                    </CardTitle>
                    <Badge
                      className={cn(
                        "text-[10px] border",
                        routine.enabled
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : "bg-slate-500/15 text-slate-400 border-slate-500/30"
                      )}
                    >
                      {routine.enabled ? "Active" : "Paused"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Clock className="h-3 w-3" />
                    <span className="font-mono">{routine.cronExpression}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-600 block">Last run</span>
                      <span className="text-slate-400">{routine.lastRunAt ? relativeTime(routine.lastRunAt) : "Never"}</span>
                    </div>
                    <div>
                      <span className="text-slate-600 block">Next run</span>
                      <span className="text-slate-400">{routine.nextRunAt ? relativeTime(routine.nextRunAt) : "—"}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Fleet Overview */}
      {agents && agents.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-4">Fleet Overview</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {agents.map((agent) => (
              <FleetAgentCard key={agent.id} agent={agent} companyId={id} />
            ))}
          </div>
        </section>
      )}

      {/* Signal Feed */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-violet-400" />
            <h2 className="text-lg font-semibold text-slate-100">Signal Feed</h2>
            {signals && signals.length > 0 && (
              <span className="text-sm text-slate-500">({signals.length})</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {["all", "alert", "kpi-change", "product-update", "social-proof", "seo-tactic", "market-trend"].map((type) => (
              <button
                key={type}
                onClick={() => setSignalTypeFilter(type)}
                className={cn(
                  "px-2 py-0.5 rounded text-[11px] font-medium border transition-colors",
                  signalTypeFilter === type
                    ? "bg-violet-500/20 text-violet-300 border-violet-500/40"
                    : "text-slate-500 border-slate-800 hover:text-slate-300 hover:border-slate-700"
                )}
              >
                {type === "all" ? "All" : type}
              </button>
            ))}
          </div>
        </div>

        {!signals ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 bg-slate-900 rounded-lg border border-slate-800 animate-pulse" />
            ))}
          </div>
        ) : signals.length === 0 ? (
          <div className="flex items-center justify-center h-32 rounded-lg border border-dashed border-slate-800 text-slate-600 text-sm">
            No signals yet — agents will broadcast here
          </div>
        ) : (
          <div className="space-y-2">
            {signals
              .filter((s) => signalTypeFilter === "all" || s.signalType === signalTypeFilter)
              .map((signal) => (
                <SignalRow key={signal.id} signal={signal} />
              ))}
            {signals.filter((s) => signalTypeFilter === "all" || s.signalType === signalTypeFilter).length === 0 && (
              <div className="flex items-center justify-center h-20 rounded-lg border border-dashed border-slate-800 text-slate-600 text-sm">
                No signals of this type
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

// ─── Signal type badge color map ────────────────────────────────────────────

const SIGNAL_TYPE_COLORS: Record<string, string> = {
  "alert":          "bg-red-500/15 text-red-400 border-red-500/30",
  "kpi-change":     "bg-orange-500/15 text-orange-400 border-orange-500/30",
  "product-update": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "social-proof":   "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "seo-tactic":     "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "market-trend":   "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
}

function signalTypeBadgeClass(type: string): string {
  return SIGNAL_TYPE_COLORS[type] ?? "bg-slate-500/15 text-slate-400 border-slate-500/30"
}

// ─── SignalRow ────────────────────────────────────────────────────────────────

function SignalRow({ signal }: { signal: Signal }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={cn("text-[10px] border font-medium", signalTypeBadgeClass(signal.signalType))}>
            {signal.signalType}
          </Badge>
          <span className="text-xs font-medium bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
            {signal.sourceAgentName || "unknown agent"}
          </span>
          <span className="text-xs text-slate-500 ml-auto">{relativeTime(signal.createdAt)}</span>
        </div>
        <p className="text-sm text-slate-200 mt-1.5 leading-snug">{signal.title}</p>
        {signal.payload && Object.keys(signal.payload).length > 0 && (
          <p className="text-[11px] text-slate-600 mt-1 font-mono truncate">
            {JSON.stringify(signal.payload)}
          </p>
        )}
        {signal.consumedBy && signal.consumedBy.length > 0 && (
          <p className="text-[10px] text-slate-700 mt-1">
            consumed by {signal.consumedBy.length} agent{signal.consumedBy.length > 1 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── FleetAgentCard ──────────────────────────────────────────────────────────

function FleetAgentCard({ agent }: { agent: Agent; companyId: string }) {
  const { data: runs } = useQuery<Run[]>({
    queryKey: ["agents", agent.id, "runs", "fleet"],
    queryFn: () => getAgentRuns(agent.id, { limit: 1 }).then((r) => r.runs),
    staleTime: 30_000,
  })

  const lastRun = runs?.[0]
  const lastRunFailed = lastRun?.status === "failed" || lastRun?.status === "timeout"

  const statusIcon = (status: string) => {
    if (status === "running") return <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />
    if (status === "completed") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
    if (status === "failed" || status === "timeout") return <XCircle className="h-3.5 w-3.5 text-red-400" />
    if (status === "paused") return <PauseCircle className="h-3.5 w-3.5 text-amber-400" />
    return null
  }

  const modelShort = (model: string | null) => {
    if (!model) return null
    if (model.includes("haiku")) return { label: "Haiku", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" }
    if (model.includes("sonnet")) return { label: "Sonnet", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" }
    if (model.includes("opus")) return { label: "Opus", cls: "bg-violet-500/15 text-violet-400 border-violet-500/30" }
    return { label: model.split("-")[1] ?? model, cls: "bg-slate-500/15 text-slate-400 border-slate-500/30" }
  }

  const modelBadge = modelShort(agent.model)

  return (
    <Link href={`/agents/${agent.id}`}>
      <Card
        className={cn(
          "bg-slate-900 border-slate-800 hover:border-slate-600 transition-colors cursor-pointer",
          lastRunFailed && "border-red-500/40 bg-red-500/5 hover:border-red-500/60"
        )}
      >
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-200 truncate">{agent.name}</p>
              <p className="text-[11px] text-slate-500 capitalize">{agent.role}</p>
            </div>
            {modelBadge && (
              <Badge className={cn("text-[10px] border flex-shrink-0", modelBadge.cls)}>
                {modelBadge.label}
              </Badge>
            )}
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[11px]">
            <span className="text-slate-600">
              {lastRun ? relativeTime(lastRun.createdAt) : "No runs"}
            </span>
            {lastRun && (
              <div className="flex items-center gap-1">
                {statusIcon(lastRun.status)}
                <span className={cn(
                  "capitalize",
                  lastRun.status === "completed" ? "text-emerald-400" :
                  lastRun.status === "failed" || lastRun.status === "timeout" ? "text-red-400" :
                  lastRun.status === "running" ? "text-blue-400" :
                  "text-slate-500"
                )}>
                  {lastRun.status}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
