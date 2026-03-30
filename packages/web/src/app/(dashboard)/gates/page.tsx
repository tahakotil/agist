"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "next/navigation"
import {
  getCompanies,
  getCompanyGates,
  approveGate,
  rejectGate,
  type Company,
  type ApprovalGate,
  type Pagination,
} from "@/lib/api"
import { Paginator } from "@/components/paginator"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { relativeTime, cn } from "@/lib/utils"
import { CheckCircle, XCircle, Clock, ShieldCheck, Bot } from "lucide-react"
import { toast } from "sonner"

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  rejected: "bg-red-500/15 text-red-400 border-red-500/30",
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Clock className="h-3.5 w-3.5" />,
  approved: <CheckCircle className="h-3.5 w-3.5" />,
  rejected: <XCircle className="h-3.5 w-3.5" />,
}

export default function GatesPage() {
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const page = parseInt(searchParams.get("page") ?? "1", 10)
  const [companyId, setCompanyId] = useState<string>("")
  const [statusFilter, setStatusFilter] = useState<string>("pending")
  const [deciding, setDeciding] = useState<string | null>(null)

  const { data: companiesData } = useQuery({
    queryKey: ["companies"],
    queryFn: () => getCompanies({ limit: 100 }),
  })

  const companies: Company[] = companiesData?.companies ?? []

  const selectedCompanyId = companyId || companies[0]?.id || ""

  const { data, isLoading } = useQuery<{ gates: ApprovalGate[]; pagination: Pagination }>({
    queryKey: ["gates", selectedCompanyId, statusFilter, page],
    queryFn: () =>
      getCompanyGates(selectedCompanyId, {
        status: statusFilter || undefined,
        page,
        limit: 20,
      }),
    enabled: !!selectedCompanyId,
  })

  const gates = data?.gates ?? []
  const pagination = data?.pagination

  async function handleApprove(gate: ApprovalGate) {
    setDeciding(gate.id)
    try {
      await approveGate(gate.companyId, gate.id)
      toast.success(`Gate approved: ${gate.title}`)
      queryClient.invalidateQueries({ queryKey: ["gates"] })
    } catch {
      toast.error("Failed to approve gate")
    } finally {
      setDeciding(null)
    }
  }

  async function handleReject(gate: ApprovalGate) {
    setDeciding(gate.id)
    try {
      await rejectGate(gate.companyId, gate.id)
      toast.success(`Gate rejected: ${gate.title}`)
      queryClient.invalidateQueries({ queryKey: ["gates"] })
    } catch {
      toast.error("Failed to reject gate")
    } finally {
      setDeciding(null)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2.5">
            <ShieldCheck className="h-7 w-7 text-amber-400" />
            Approval Gates
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Review and decide on agent approval requests
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

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 bg-slate-900 border-slate-700 text-slate-300">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700">
            <SelectItem value="pending" className="text-slate-300">Pending</SelectItem>
            <SelectItem value="approved" className="text-slate-300">Approved</SelectItem>
            <SelectItem value="rejected" className="text-slate-300">Rejected</SelectItem>
            <SelectItem value="" className="text-slate-300">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 bg-slate-900 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : gates.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
          <ShieldCheck className="h-10 w-10 text-slate-700" />
          <p className="text-sm">No approval gates found</p>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-800 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableHead className="text-slate-400 font-medium">Gate</TableHead>
                <TableHead className="text-slate-400 font-medium">Agent</TableHead>
                <TableHead className="text-slate-400 font-medium">Type</TableHead>
                <TableHead className="text-slate-400 font-medium">Status</TableHead>
                <TableHead className="text-slate-400 font-medium">Created</TableHead>
                <TableHead className="text-slate-400 font-medium text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {gates.map((gate) => (
                <TableRow key={gate.id} className="border-slate-800 hover:bg-slate-900/50">
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium text-slate-200">{gate.title}</p>
                      {gate.description && (
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{gate.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Bot className="h-3.5 w-3.5" />
                      {gate.agentName ?? gate.agentId.slice(0, 8)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded">
                      {gate.gateType}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs flex items-center gap-1 w-fit",
                        STATUS_BADGE[gate.status]
                      )}
                    >
                      {STATUS_ICON[gate.status]}
                      {gate.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-500">{relativeTime(gate.createdAt)}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    {gate.status === "pending" && (
                      <div className="flex items-center gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                          disabled={deciding === gate.id}
                          onClick={() => handleApprove(gate)}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-red-500/40 text-red-400 hover:bg-red-500/10"
                          disabled={deciding === gate.id}
                          onClick={() => handleReject(gate)}
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          Reject
                        </Button>
                      </div>
                    )}
                    {gate.status !== "pending" && (
                      <span className="text-xs text-slate-600">
                        {gate.decidedBy ?? "human"} · {gate.decidedAt ? relativeTime(gate.decidedAt) : "—"}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <Paginator pagination={pagination} />
      )}
    </div>
  )
}
