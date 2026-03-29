"use client"

import { useQuery } from "@tanstack/react-query"
import { api, type Company } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Building2, Bot, DollarSign, TrendingUp } from "lucide-react"
import { formatCost } from "@/lib/utils"
import Link from "next/link"

export default function CompaniesPage() {
  const { data: companies, isLoading } = useQuery<Company[]>({
    queryKey: ["companies"],
    queryFn: () => api<Company[]>("/companies"),
  })

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Companies</h1>
        <p className="text-sm text-slate-500 mt-1">
          Manage organizations and their agent teams
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 rounded-lg bg-slate-900 border border-slate-800 animate-pulse" />
          ))}
        </div>
      ) : companies && companies.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {companies.map((company) => (
            <CompanyCard key={company.id} company={company} />
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center h-48 rounded-lg border border-dashed border-slate-800 text-slate-600 text-sm">
          No companies found. Add your first company through the API.
        </div>
      )}
    </div>
  )
}

function CompanyCard({ company }: { company: Company }) {
  const budgetUsedPct = company.budget > 0
    ? Math.min(100, (company.spent / company.budget) * 100)
    : 0

  const budgetColor =
    budgetUsedPct > 90
      ? "bg-red-500"
      : budgetUsedPct > 70
      ? "bg-amber-500"
      : "bg-emerald-500"

  return (
    <Link href={`/companies/${company.id}`}>
      <Card className="bg-slate-900 border-slate-800 hover:border-slate-600 transition-all duration-200 hover:shadow-lg hover:shadow-slate-900/50 hover:-translate-y-0.5 cursor-pointer group">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-blue-500/20 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold text-slate-100 group-hover:text-blue-300 transition-colors">
                  {company.name}
                </CardTitle>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  /{company.slug}
                </p>
              </div>
            </div>
            <Badge className="bg-blue-500/15 text-blue-400 border border-blue-500/30 text-[10px]">
              Active
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {company.description && (
            <p className="text-xs text-slate-400 line-clamp-2">
              {company.description}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 bg-slate-800/50 rounded-lg p-2.5">
              <Bot className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-500">Agents</p>
                <p className="text-sm font-semibold text-slate-200 tabular-nums">
                  {company.agentCount}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-slate-800/50 rounded-lg p-2.5">
              <TrendingUp className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-500">Spent</p>
                <p className="text-sm font-semibold text-slate-200 tabular-nums">
                  {formatCost(company.spent)}
                </p>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <DollarSign className="h-3 w-3 text-slate-500" />
                <span className="text-xs text-slate-500">Budget</span>
              </div>
              <span className="text-xs font-mono text-slate-400">
                {formatCost(company.spent)} / {formatCost(company.budget)}
              </span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${budgetColor}`}
                style={{ width: `${budgetUsedPct}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-600 mt-1 text-right">
              {budgetUsedPct.toFixed(1)}% used
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
