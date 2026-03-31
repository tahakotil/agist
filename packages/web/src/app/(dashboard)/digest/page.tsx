"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  getCompanies,
  getCompanyDigest,
  getCompanyDigestByDate,
  generateCompanyDigest,
  type Company,
  type DailyDigest,
  type ActionItem,
  type AgentDigestEntry,
} from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatCost, cn } from "@/lib/utils"
import {
  BookOpen,
  Bot,
  CheckCircle,
  DollarSign,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Clock,
  TrendingUp,
  RefreshCw,
} from "lucide-react"
import { toast } from "sonner"

const PRIORITY_BADGE: Record<string, string> = {
  high: "bg-red-500/15 text-red-400 border-red-500/30",
  medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  low: "bg-slate-500/15 text-slate-400 border-slate-500/30",
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }

function AgentCard({ entry }: { entry: AgentDigestEntry }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 overflow-hidden">
      <button
        className="w-full flex items-start justify-between gap-4 px-4 py-3 hover:bg-slate-800/40 transition-colors text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
            <Bot className="h-4 w-4 text-blue-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-200 truncate">{entry.agentName}</p>
            <p className="text-xs text-slate-500">
              {entry.runs} runs &middot; {formatCost(entry.costUsd)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1">
            <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-xs text-emerald-400">{entry.runs}</span>
          </div>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-slate-500" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-800 pt-3 space-y-3">
          {entry.highlights.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-emerald-600 font-semibold mb-1.5">
                Highlights
              </p>
              <ul className="space-y-1">
                {entry.highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                    <span className="mt-1 w-1 h-1 rounded-full bg-emerald-400 flex-shrink-0" />
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {entry.issues.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-red-600 font-semibold mb-1.5">
                Issues
              </p>
              <ul className="space-y-1">
                {entry.issues.map((issue, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                    <span className="mt-1 w-1 h-1 rounded-full bg-red-400 flex-shrink-0" />
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ActionItemsList({ items }: { items: ActionItem[] }) {
  const sorted = [...items].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2)
  )
  return (
    <ul className="space-y-2">
      {sorted.map((item, i) => (
        <li key={i} className="flex items-start gap-3">
          <Badge
            className={cn(
              "text-[10px] px-1.5 py-0 h-4 border font-medium capitalize shrink-0 mt-0.5",
              PRIORITY_BADGE[item.priority]
            )}
          >
            {item.priority}
          </Badge>
          <span className="text-sm text-slate-300">{item.description}</span>
          {item.source && (
            <span className="text-xs text-slate-500 shrink-0 ml-auto">{item.source}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

export default function DigestPage() {
  const queryClient = useQueryClient()
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("")
  const [dateInput, setDateInput] = useState("")
  const [generating, setGenerating] = useState(false)

  const { data: companiesData } = useQuery({
    queryKey: ["companies"],
    queryFn: () => getCompanies({ limit: 100 }),
    staleTime: 60_000,
  })
  const companies: Company[] = companiesData?.companies ?? []

  const activeCompanyId = selectedCompanyId || companies[0]?.id || ""

  const queryDate = dateInput || undefined
  const queryKey = queryDate
    ? ["digest", activeCompanyId, queryDate]
    : ["digest", activeCompanyId, "today"]

  const { data: digest, isLoading: digestLoading } = useQuery<DailyDigest | null>({
    queryKey,
    queryFn: () =>
      queryDate
        ? getCompanyDigestByDate(activeCompanyId, queryDate)
        : getCompanyDigest(activeCompanyId),
    enabled: !!activeCompanyId,
    staleTime: 5 * 60_000,
  })

  async function handleGenerate() {
    if (!activeCompanyId) return
    setGenerating(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      await generateCompanyDigest(activeCompanyId, queryDate ?? today)
      toast.success("Digest generated successfully")
      queryClient.invalidateQueries({ queryKey: ["digest", activeCompanyId] })
    } catch (err) {
      toast.error("Failed to generate digest: " + String(err))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-violet-400" />
            Daily Digest
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            End-of-day summary of agent activity, costs, and action items
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {companies.length > 1 && (
            <Select
              value={activeCompanyId}
              onValueChange={setSelectedCompanyId}
            >
              <SelectTrigger className="w-48 bg-slate-900 border-slate-700 text-slate-200 text-sm h-9">
                <SelectValue placeholder="Select company" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Input
            type="date"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            className="w-40 bg-slate-900 border-slate-700 text-slate-200 text-sm h-9"
            placeholder="YYYY-MM-DD"
          />
          <Button
            size="sm"
            variant="outline"
            className="border-slate-700 text-slate-200 hover:bg-slate-800 h-9 gap-1.5"
            onClick={handleGenerate}
            disabled={generating || !activeCompanyId}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", generating && "animate-spin")} />
            {generating ? "Generating..." : "Generate Now"}
          </Button>
        </div>
      </div>

      {digestLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-lg bg-slate-900 border border-slate-800 animate-pulse" />
          ))}
        </div>
      ) : !digest ? (
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <BookOpen className="h-10 w-10 text-slate-700" />
            <div>
              <p className="text-slate-400 font-medium">No digest available</p>
              <p className="text-slate-600 text-sm mt-1">
                {dateInput
                  ? `No digest found for ${dateInput}.`
                  : "No digest for today yet. Digests are auto-generated at 23:00 UTC."}
              </p>
            </div>
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={generating || !activeCompanyId}
              className="gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {generating ? "Generating..." : "Generate Now"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Date / generated at */}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Clock className="h-3.5 w-3.5" />
            <span>
              Digest for <span className="text-slate-300 font-medium">{digest.date}</span>
              {" · "}generated{" "}
              {new Date(digest.createdAt).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-slate-500 mb-1">Total Runs</p>
                <p className="text-3xl font-bold text-slate-100">{digest.summary.totalRuns}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-slate-500 mb-1">Successful</p>
                <p className="text-3xl font-bold text-emerald-400">{digest.summary.successful}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-slate-500 mb-1">Failed</p>
                <p className="text-3xl font-bold text-red-400">{digest.summary.failed}</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-slate-500 mb-1">Total Cost</p>
                <p className="text-3xl font-bold text-amber-400">
                  {formatCost(digest.summary.totalCostUsd)}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-slate-500 mb-1">Pending Approvals</p>
                <p
                  className={cn(
                    "text-3xl font-bold",
                    digest.pendingApprovals > 0 ? "text-orange-400" : "text-slate-400"
                  )}
                >
                  {digest.pendingApprovals}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Budget status */}
          {digest.budgetStatus && digest.budgetStatus.limitMonth > 0 && (
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-amber-400" />
                  Budget Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">
                    {formatCost(digest.budgetStatus.spentMonth)} spent of{" "}
                    {formatCost(digest.budgetStatus.limitMonth)} monthly budget
                  </span>
                  <Badge
                    className={cn(
                      "border text-xs",
                      digest.budgetStatus.burnRate !== "over pace"
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : "bg-red-500/15 text-red-400 border-red-500/30"
                    )}
                  >
                    {digest.budgetStatus.burnRate}
                  </Badge>
                </div>
                <div className="relative h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      digest.budgetStatus.burnRate !== "over pace" ? "bg-emerald-500" : "bg-red-500"
                    )}
                    style={{
                      width: `${Math.min(100, (digest.budgetStatus.spentMonth / digest.budgetStatus.limitMonth) * 100).toFixed(1)}%`,
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action items */}
          {digest.actionItems.length > 0 && (
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-400" />
                  Action Items ({digest.actionItems.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ActionItemsList items={digest.actionItems} />
              </CardContent>
            </Card>
          )}

          {/* Per-agent breakdown */}
          {digest.byAgent.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-slate-500" />
                <h2 className="text-sm font-semibold text-slate-300">
                  Agent Breakdown ({digest.byAgent.length})
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {digest.byAgent.map((entry) => (
                  <AgentCard key={entry.agentId} entry={entry} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
