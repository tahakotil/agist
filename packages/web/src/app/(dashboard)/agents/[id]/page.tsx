"use client"

import { use, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getAgent, getAgentRuns, getAgentLatestOutput, wakeAgent, getAgentContext, updateAgentContext, pauseAgent, resumeAgent, type Agent, type Run, type RunOutput } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { LogViewer } from "@/components/log-viewer"
import { relativeTime, formatDuration, formatCost, cn } from "@/lib/utils"
import {
  ArrowLeft,
  Bot,
  Brain,
  Clock,
  Play,
  Pause,
  PlayCircle,
  DollarSign,
  Building2,
  CheckCircle,
  XCircle,
  Timer,
  FolderOpen,
  Save,
  Activity,
  BarChart2,
  Search,
  AlertTriangle,
  FileText,
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
  "claude-haiku-4-5-20251001": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "claude-sonnet-4-6": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "claude-opus-4-5": "bg-violet-500/15 text-violet-400 border-violet-500/30",
  "claude-opus-4-6": "bg-violet-500/15 text-violet-400 border-violet-500/30",
  haiku: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  sonnet: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  opus: "bg-violet-500/15 text-violet-400 border-violet-500/30",
}

const STATUS_BADGE: Record<string, string> = {
  idle: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  running: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  error: "bg-red-500/15 text-red-400 border-red-500/30",
  paused: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  budget_exceeded: "bg-red-500/15 text-red-400 border-red-500/30",
}

const RUN_STATUS_BADGE: Record<string, string> = {
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  failed: "bg-red-500/15 text-red-400 border-red-500/30",
  running: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  queued: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  cancelled: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  timeout: "bg-orange-500/15 text-orange-400 border-orange-500/30",
}

function modelShortLabel(model: string): string {
  if (model.includes("haiku")) return "Haiku"
  if (model.includes("sonnet")) return "Sonnet"
  if (model.includes("opus")) return "Opus"
  return model
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
  content: {
    label: "Content",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    icon: <FileText className="h-3 w-3" />,
  },
  report: {
    label: "Report",
    className: "bg-slate-500/15 text-slate-400 border-slate-500/30",
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

function LatestReportCard({ output }: { output: RunOutput }) {
  const config = OUTPUT_TYPE_CONFIG[output.outputType] ?? OUTPUT_TYPE_CONFIG["report"]
  const data = output.data
  const topStatus = (data.status as string) ?? (data.overall_status as string) ?? null
  const topStatusClass = topStatus ? (CHECK_STATUS_CLASS[topStatus.toUpperCase()] ?? "text-slate-300") : null
  const checks = Array.isArray(data.checks) ? (data.checks as Record<string, unknown>[]) : null

  // Extract key metrics for analytics
  const metrics = data.metrics as Record<string, unknown> | null

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Badge className={cn("border text-[11px] flex items-center gap-1", config.className)}>
            {config.icon}
            {config.label}
          </Badge>
          {topStatus && (
            <span className={cn("text-xs font-mono font-semibold", topStatusClass)}>
              {topStatus}
            </span>
          )}
          <span className="ml-auto text-xs text-slate-500">{relativeTime(output.createdAt)}</span>
        </div>

        {/* Health checks */}
        {checks && checks.length > 0 && (
          <div className="space-y-1.5">
            {checks.slice(0, 6).map((check, i) => {
              const checkStatus = ((check.status as string) ?? "").toUpperCase()
              const statusClass = CHECK_STATUS_CLASS[checkStatus] ?? "text-slate-400"
              return (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className={cn("font-mono font-semibold w-16 flex-shrink-0", statusClass)}>
                    {checkStatus || "—"}
                  </span>
                  <span className="text-slate-300 truncate">
                    {(check.name as string) ?? (check.check as string) ?? `Check ${i + 1}`}
                  </span>
                </div>
              )
            })}
            {checks.length > 6 && (
              <p className="text-xs text-slate-600">+{checks.length - 6} more checks</p>
            )}
          </div>
        )}

        {/* Key metrics for analytics */}
        {metrics && !checks && (
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(metrics).slice(0, 4).map(([key, val]) => (
              <div key={key} className="rounded bg-slate-800 p-2">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">{key.replace(/_/g, " ")}</p>
                <p className="text-sm font-mono text-slate-200 mt-0.5">{String(val)}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function AgentDetailPage({ params }: PageProps) {
  const { id } = use(params)
  const queryClient = useQueryClient()
  const [wakeOpen, setWakeOpen] = useState(false)
  const [prompt, setPrompt] = useState("")
  const [waking, setWaking] = useState(false)
  const [capsuleText, setCapsuleText] = useState<string | null>(null)
  const [savingCapsule, setSavingCapsule] = useState(false)

  const { data: agent, isLoading } = useQuery<Agent>({
    queryKey: ["agents", id],
    queryFn: () => getAgent(id),
  })

  const { data: runs } = useQuery<Run[]>({
    queryKey: ["agents", id, "runs"],
    queryFn: () => getAgentRuns(id, { limit: 20 }).then((r) => r.runs),
  })

  const { data: latestOutput } = useQuery<RunOutput | null>({
    queryKey: ["agents", id, "outputs", "latest"],
    queryFn: () => getAgentLatestOutput(id),
  })

  const { data: contextData } = useQuery<{ capsule: string }>({
    queryKey: ["agents", id, "context"],
    queryFn: () => getAgentContext(id),
    enabled: !!id,
  })

  const currentCapsule = capsuleText ?? contextData?.capsule ?? ""

  async function handleSaveCapsule() {
    setSavingCapsule(true)
    try {
      await updateAgentContext(id, currentCapsule)
      toast.success("Context capsule saved")
      queryClient.invalidateQueries({ queryKey: ["agents", id, "context"] })
      setCapsuleText(null)
    } catch (err) {
      toast.error("Failed to save capsule: " + (err instanceof Error ? err.message : "Unknown error"))
    } finally {
      setSavingCapsule(false)
    }
  }

  async function handleWake() {
    setWaking(true)
    try {
      await wakeAgent(id, prompt.trim() || undefined)
      toast.success("Agent woken")
      queryClient.invalidateQueries({ queryKey: ["agents", id] })
      queryClient.invalidateQueries({ queryKey: ["agents", id, "runs"] })
      setWakeOpen(false)
      setPrompt("")
    } catch (err) {
      toast.error("Failed to wake agent: " + (err instanceof Error ? err.message : "Unknown error"))
    } finally {
      setWaking(false)
    }
  }

  async function handlePause() {
    try {
      await pauseAgent(id)
      toast.success("Agent paused")
      queryClient.invalidateQueries({ queryKey: ["agents", id] })
    } catch {
      toast.error("Failed to pause agent")
    }
  }

  async function handleResume() {
    try {
      await resumeAgent(id)
      toast.success("Agent resumed")
      queryClient.invalidateQueries({ queryKey: ["agents", id] })
    } catch {
      toast.error("Failed to resume agent")
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
      <div className="p-6 flex flex-col items-center gap-4 text-slate-500">
        <Bot className="h-12 w-12 text-slate-700" />
        <p>Agent not found</p>
        <Link href="/agents" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-slate-400")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Agents
        </Link>
      </div>
    )
  }

  const costData = (runs ?? [])
    .slice()
    .reverse()
    .map((r) => ({ cost: r.cost, status: r.status }))

  return (
    <div className="p-6 space-y-8 max-w-[1600px] mx-auto">
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
              {modelShortLabel(agent.model)}
            </Badge>
          </div>
          <div className="flex items-center gap-4 mt-2 text-sm text-slate-500 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              <Link href={`/companies/${agent.companyId}`} className="hover:text-slate-300 transition-colors">
                {agent.companyName || agent.companyId}
              </Link>
            </div>
            <span className="text-slate-700">·</span>
            <span className="capitalize">{agent.role}</span>
            {agent.title && (
              <>
                <span className="text-slate-700">·</span>
                <span>{agent.title}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/40"
            onClick={() => setWakeOpen(true)}
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
            disabled={agent.status === "paused" || agent.status === "budget_exceeded"}
          >
            <Pause className="h-3.5 w-3.5 mr-1.5" />
            Pause
          </Button>
          {(agent.status === "paused" || agent.status === "budget_exceeded") && (
            <Button
              size="sm"
              variant="outline"
              className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/40"
              onClick={handleResume}
            >
              <PlayCircle className="h-3.5 w-3.5 mr-1.5" />
              Resume
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <Clock className="h-3 w-3" /> Updated
            </p>
            <p className="text-sm font-medium text-slate-200 mt-1">{relativeTime(agent.updatedAt)}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <Timer className="h-3 w-3" /> Created
            </p>
            <p className="text-sm font-medium text-slate-200 mt-1">{relativeTime(agent.createdAt)}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-emerald-400" /> Total Runs
            </p>
            <p className="text-sm font-medium text-slate-200 mt-1">{runs?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 mb-1">Cost Trend</p>
            {costData.length > 0 ? (
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
            ) : (
              <p className="text-xs text-slate-600 mt-1">No data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {agent.budgetMonthlyCents > 0 && (
        <Card className={cn(
          "border",
          agent.status === "budget_exceeded"
            ? "bg-red-950/20 border-red-500/30"
            : "bg-slate-900 border-slate-800"
        )}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" />
                Monthly Budget
              </p>
              <span className={cn(
                "text-xs font-mono",
                agent.status === "budget_exceeded" ? "text-red-400" : "text-slate-400"
              )}>
                {formatCost(agent.spentMonthlyCents)} / {formatCost(agent.budgetMonthlyCents)}
              </span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2">
              <div
                className={cn(
                  "h-2 rounded-full transition-all",
                  agent.status === "budget_exceeded" ? "bg-red-500" : "bg-emerald-500"
                )}
                style={{
                  width: `${Math.min(100, (agent.spentMonthlyCents / agent.budgetMonthlyCents) * 100).toFixed(1)}%`
                }}
              />
            </div>
            {agent.status === "budget_exceeded" && (
              <p className="text-xs text-red-400 mt-2">Budget exceeded — agent is paused. Resume to reset.</p>
            )}
          </CardContent>
        </Card>
      )}

      {agent.workingDirectory ? (
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 flex items-center gap-1.5 mb-2">
              <FolderOpen className="h-3.5 w-3.5" />
              Working Directory
            </p>
            <code className="text-sm font-mono text-emerald-400 break-all">{agent.workingDirectory}</code>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-slate-900 border-slate-800 border-dashed">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 flex items-center gap-1.5 mb-1">
              <FolderOpen className="h-3.5 w-3.5" />
              Working Directory
            </p>
            <p className="text-xs text-slate-600">Not set — Claude CLI will run from the server process directory.</p>
          </CardContent>
        </Card>
      )}

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Brain className="h-5 w-5 text-violet-400" />
            Context Capsule
          </h2>
          {agent.updatedAt && contextData?.capsule && (
            <span className="text-xs text-slate-500">Last updated {relativeTime(agent.updatedAt)}</span>
          )}
        </div>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4 space-y-3">
            <p className="text-xs text-slate-500">
              Persistent memory injected into every run. Claude can update this automatically by outputting{" "}
              <code className="font-mono text-slate-400 bg-slate-800 px-1 py-0.5 rounded text-[11px]">__agist_context_update__</code>{" "}
              followed by new content. Max 10,000 characters.
            </p>
            <Textarea
              value={currentCapsule}
              onChange={(e) => setCapsuleText(e.target.value)}
              placeholder="No context capsule yet. Add persistent memory here — IDENTITY, goals, current project state, preferences — anything you want injected into every run."
              className="bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-600 resize-none font-mono text-xs leading-relaxed"
              rows={10}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600 font-mono">
                {currentCapsule.length} / 10,000 chars
              </span>
              <Button
                size="sm"
                className="bg-violet-600 hover:bg-violet-500 text-white"
                onClick={handleSaveCapsule}
                disabled={savingCapsule || capsuleText === null}
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {savingCapsule ? "Saving..." : "Save"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {latestOutput && (
        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-4">Latest Report</h2>
          <LatestReportCard output={latestOutput} />
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Live Logs</h2>
        <LogViewer agentId={id} height="380px" />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Run History</h2>
        <div className="space-y-2">
          {runs && runs.length > 0 ? (
            runs.map((run) => (
              <Link key={run.id} href={`/runs/${run.id}`}>
                <div className="flex items-center gap-4 p-3 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all hover:-translate-y-0.5 hover:shadow-md group">
                  <div className="flex-shrink-0">
                    {run.status === "completed" ? (
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                    ) : run.status === "failed" ? (
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
                      <span className="text-xs text-slate-500">{relativeTime(run.startedAt)}</span>
                    </div>
                    {run.error && (
                      <p className="text-xs text-red-400 mt-0.5 truncate">{run.error}</p>
                    )}
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

      <Dialog open={wakeOpen} onOpenChange={setWakeOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-slate-100">
          <DialogHeader>
            <DialogTitle>Wake {agent.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-xs text-slate-400 block">Custom prompt (optional)</label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Leave empty to use the agent default prompt..."
              className="bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-600 resize-none"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              className="text-slate-400"
              onClick={() => setWakeOpen(false)}
              disabled={waking}
            >
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
              onClick={handleWake}
              disabled={waking}
            >
              <Play className="h-3.5 w-3.5 mr-1.5" />
              {waking ? "Waking..." : "Wake Agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
