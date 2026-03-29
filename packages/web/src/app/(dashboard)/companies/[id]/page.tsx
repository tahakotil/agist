"use client"

import { use } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getCompany, getCompanyAgents, getCompanyRoutines, wakeAgent, updateAgent, type Company, type Agent, type Routine } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { OrgChart } from "@/components/org-chart"
import { AgentCard } from "@/components/agent-card"
import { Building2, Clock, DollarSign, Bot, ArrowLeft } from "lucide-react"
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
    queryFn: () => getCompanyAgents(id),
  })

  const { data: routines } = useQuery<Routine[]>({
    queryKey: ["companies", id, "routines"],
    queryFn: () => getCompanyRoutines(id),
  })

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
    </div>
  )
}
