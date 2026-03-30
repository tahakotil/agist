"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "next/navigation"
import { getCompanies, createCompany, type Company, type Pagination } from "@/lib/api"
import { Paginator } from "@/components/paginator"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Building2, Bot, DollarSign, TrendingUp, Plus } from "lucide-react"
import { formatCost } from "@/lib/utils"
import Link from "next/link"
import { toast } from "sonner"

export default function CompaniesPage() {
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const page = Number(searchParams.get("page") ?? 1)
  const limit = Number(searchParams.get("limit") ?? 20)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [creating, setCreating] = useState(false)

  const { data, isLoading } = useQuery<{ companies: Company[]; pagination: Pagination }>({
    queryKey: ["companies", { page, limit }],
    queryFn: () => getCompanies({ page, limit }),
  })
  const companies = data?.companies
  const pagination = data?.pagination

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    try {
      await createCompany({ name: name.trim(), description: description.trim() || undefined })
      toast.success("Company created")
      queryClient.invalidateQueries({ queryKey: ["companies"] })
    queryClient.invalidateQueries({ queryKey: ["companies", { page, limit }] })
      setOpen(false)
      setName("")
      setDescription("")
    } catch (err) {
      toast.error("Failed to create company: " + (err instanceof Error ? err.message : "Unknown error"))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Companies</h1>
          <p className="text-sm text-slate-500 mt-1">Manage organizations and their agent teams</p>
        </div>
        <Button
          size="sm"
          className="bg-blue-600 hover:bg-blue-500 text-white"
          onClick={() => setOpen(true)}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          New Company
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 rounded-lg bg-slate-900 border border-slate-800 animate-pulse" />
          ))}
        </div>
      ) : companies && companies.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {companies.map((company) => (
              <CompanyCard key={company.id} company={company} />
            ))}
          </div>
          {pagination && <Paginator pagination={pagination} />}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-48 rounded-lg border border-dashed border-slate-800 text-slate-600 text-sm gap-3">
          <Building2 className="h-10 w-10 text-slate-700" />
          <span>No companies yet.</span>
          <Button
            size="sm"
            variant="outline"
            className="border-slate-700 text-slate-400 hover:text-slate-200"
            onClick={() => setOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Create your first company
          </Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-slate-100">
          <DialogHeader>
            <DialogTitle>New Company</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Name *</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Corp"
                className="bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-600"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Description</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description..."
                className="bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-600 resize-none"
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                className="text-slate-400"
                onClick={() => setOpen(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-500 text-white"
                disabled={!name.trim() || creating}
              >
                {creating ? "Creating..." : "Create Company"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CompanyCard({ company }: { company: Company }) {
  const budgetUsedPct =
    company.budgetMonthlyCents > 0
      ? Math.min(100, (company.spentMonthlyCents / company.budgetMonthlyCents) * 100)
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
                <p className="text-xs text-slate-500 mt-0.5 capitalize">{company.status}</p>
              </div>
            </div>
            <Badge className="bg-blue-500/15 text-blue-400 border border-blue-500/30 text-[10px]">
              Active
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {company.description && (
            <p className="text-xs text-slate-400 line-clamp-2">{company.description}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 bg-slate-800/50 rounded-lg p-2.5">
              <Bot className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-500">Agents</p>
                <p className="text-sm font-semibold text-slate-200 tabular-nums">{company.agentCount}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-slate-800/50 rounded-lg p-2.5">
              <TrendingUp className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-500">Spent</p>
                <p className="text-sm font-semibold text-slate-200 tabular-nums">
                  {formatCost(company.spentMonthlyCents / 100)}
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
                {formatCost(company.spentMonthlyCents / 100)} / {formatCost(company.budgetMonthlyCents / 100)}
              </span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${budgetColor}`}
                style={{ width: `${budgetUsedPct}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-600 mt-1 text-right">{budgetUsedPct.toFixed(1)}% used</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
