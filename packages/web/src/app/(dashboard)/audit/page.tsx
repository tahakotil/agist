"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useSearchParams } from "next/navigation"
import {
  getCompanies,
  getAuditLog,
  type Company,
  type AuditLogEntry,
  type Pagination,
} from "@/lib/api"
import { Paginator } from "@/components/paginator"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { relativeTime, cn } from "@/lib/utils"
import {
  ClipboardList,
  Bot,
  Play,
  Pause,
  PlayCircle,
  ShieldCheck,
  Activity,
  Zap,
} from "lucide-react"

const ACTION_STYLES: Record<string, { color: string; icon: React.ReactNode }> = {
  "agent.wake":      { color: "text-emerald-400", icon: <Play className="h-3.5 w-3.5" /> },
  "agent.paused":    { color: "text-amber-400",   icon: <Pause className="h-3.5 w-3.5" /> },
  "agent.resumed":   { color: "text-blue-400",    icon: <PlayCircle className="h-3.5 w-3.5" /> },
  "run.started":     { color: "text-blue-400",    icon: <Activity className="h-3.5 w-3.5" /> },
  "run.completed":   { color: "text-emerald-400", icon: <Activity className="h-3.5 w-3.5" /> },
  "run.failed":      { color: "text-red-400",     icon: <Activity className="h-3.5 w-3.5" /> },
  "gate.created":    { color: "text-violet-400",  icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  "gate.approved":   { color: "text-emerald-400", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  "gate.rejected":   { color: "text-red-400",     icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  "signal.created":  { color: "text-cyan-400",    icon: <Zap className="h-3.5 w-3.5" /> },
}

function getActionStyle(action: string) {
  return ACTION_STYLES[action] ?? { color: "text-slate-400", icon: <Activity className="h-3.5 w-3.5" /> }
}

const ACTION_OPTIONS = [
  "agent.wake",
  "agent.paused",
  "agent.resumed",
  "run.started",
  "run.completed",
  "run.failed",
  "gate.created",
  "gate.approved",
  "gate.rejected",
  "signal.created",
]

export default function AuditPage() {
  const searchParams = useSearchParams()
  const page = parseInt(searchParams.get("page") ?? "1", 10)
  const [companyId, setCompanyId] = useState<string>("")
  const [actionFilter, setActionFilter] = useState<string>("")

  const { data: companiesData } = useQuery({
    queryKey: ["companies"],
    queryFn: () => getCompanies({ limit: 100 }),
  })

  const companies: Company[] = companiesData?.companies ?? []
  const selectedCompanyId = companyId || companies[0]?.id || ""

  const { data, isLoading } = useQuery<{ entries: AuditLogEntry[]; pagination: Pagination }>({
    queryKey: ["audit", selectedCompanyId, actionFilter, page],
    queryFn: () =>
      getAuditLog(selectedCompanyId, {
        action: actionFilter || undefined,
        limit: 50,
        page,
      }),
    enabled: !!selectedCompanyId,
  })

  const entries = data?.entries ?? []
  const pagination = data?.pagination

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2.5">
            <ClipboardList className="h-7 w-7 text-blue-400" />
            Audit Log
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Full activity history for agents, runs, gates, and signals
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Select value={selectedCompanyId} onValueChange={setCompanyId}>
          <SelectTrigger className="w-48 bg-slate-900 border-slate-700 text-slate-300">
            <SelectValue placeholder="Select company" />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700">
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-slate-300">
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-40 bg-slate-900 border-slate-700 text-slate-300">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700">
            <SelectItem value="" className="text-slate-300">All actions</SelectItem>
            {ACTION_OPTIONS.map((a) => (
              <SelectItem key={a} value={a} className="text-slate-300">
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 bg-slate-900 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
          <ClipboardList className="h-10 w-10 text-slate-700" />
          <p className="text-sm">No audit entries found</p>
        </div>
      ) : (
        <div className="space-y-1">
          {entries.map((entry) => {
            const style = getActionStyle(entry.action)
            return (
              <div
                key={entry.id}
                className="flex items-start gap-3 px-4 py-3 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors"
              >
                <div className={cn("mt-0.5 flex-shrink-0", style.color)}>
                  {style.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-mono px-1.5 py-0 border-0 bg-slate-800",
                        style.color
                      )}
                    >
                      {entry.action}
                    </Badge>
                    {entry.agentName && (
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Bot className="h-3 w-3" />
                        {entry.agentName}
                      </span>
                    )}
                    <span className="text-xs text-slate-600">by {entry.actor}</span>
                  </div>
                  {Object.keys(entry.detail).length > 0 && (
                    <p className="text-xs text-slate-600 mt-0.5 font-mono truncate">
                      {JSON.stringify(entry.detail)}
                    </p>
                  )}
                </div>
                <span className="text-xs text-slate-600 flex-shrink-0 mt-0.5">
                  {relativeTime(entry.createdAt)}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <Paginator pagination={pagination} />
      )}
    </div>
  )
}
