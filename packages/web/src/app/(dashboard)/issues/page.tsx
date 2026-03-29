"use client"

import { useQuery } from "@tanstack/react-query"
import { getCompanies, getCompanyIssues, type Company, type Issue } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { relativeTime, cn } from "@/lib/utils"
import { AlertCircle, AlertTriangle, Info, XCircle } from "lucide-react"
import Link from "next/link"

const SEVERITY_BADGE: Record<string, string> = {
  critical: "bg-red-500/15 text-red-400 border-red-500/30",
  high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  low: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  info: "bg-slate-500/15 text-slate-400 border-slate-500/30",
}

const SEVERITY_ICON: Record<string, React.ReactNode> = {
  critical: <XCircle className="h-4 w-4 text-red-400" />,
  high: <AlertCircle className="h-4 w-4 text-orange-400" />,
  medium: <AlertTriangle className="h-4 w-4 text-amber-400" />,
  low: <Info className="h-4 w-4 text-blue-400" />,
  info: <Info className="h-4 w-4 text-slate-400" />,
}

export default function IssuesPage() {
  const { data: companies } = useQuery<Company[]>({
    queryKey: ["companies"],
    queryFn: getCompanies,
  })

  const companyIds = companies?.map((c) => c.id) ?? []

  const { data: issues, isLoading } = useQuery<Issue[]>({
    queryKey: ["issues", "all", companyIds.join(",")],
    queryFn: async () => {
      if (companyIds.length === 0) return []
      const results = await Promise.all(companyIds.map((cid) => getCompanyIssues(cid)))
      return results.flat().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    },
    enabled: companyIds.length > 0,
  })

  const open = issues?.filter((i) => !i.resolvedAt) ?? []
  const resolved = issues?.filter((i) => !!i.resolvedAt) ?? []

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Issues</h1>
        <p className="text-sm text-slate-500 mt-1">
          Agent errors and anomalies requiring attention
        </p>
      </div>

      {open.length > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
          <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
          <span className="text-sm text-red-400 font-medium">
            {open.length} open issue{open.length !== 1 ? "s" : ""} requiring attention
          </span>
        </div>
      )}

      <div className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-800 hover:bg-transparent">
              <TableHead className="text-slate-500 text-xs pl-6 w-8" />
              <TableHead className="text-slate-500 text-xs">Issue</TableHead>
              <TableHead className="text-slate-500 text-xs">Agent</TableHead>
              <TableHead className="text-slate-500 text-xs">Company</TableHead>
              <TableHead className="text-slate-500 text-xs">Severity</TableHead>
              <TableHead className="text-slate-500 text-xs">Status</TableHead>
              <TableHead className="text-slate-500 text-xs pr-6">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="border-slate-800">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <TableCell key={j} className="py-4">
                      <div className="h-4 bg-slate-800 rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : issues && issues.length > 0 ? (
              issues.map((issue) => (
                <TableRow
                  key={issue.id}
                  className={cn(
                    "border-slate-800 hover:bg-slate-800/40 transition-colors",
                    issue.resolvedAt ? "opacity-50" : ""
                  )}
                >
                  <TableCell className="pl-6 py-4 w-8">
                    {SEVERITY_ICON[issue.severity] ?? <Info className="h-4 w-4 text-slate-400" />}
                  </TableCell>
                  <TableCell className="py-4 max-w-xs">
                    <p className="text-sm font-medium text-slate-200 truncate">
                      {issue.message}
                    </p>
                    {issue.details && (
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {issue.details}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="py-4">
                    <Link href={`/agents/${issue.agentId}`} className="text-sm text-slate-400 hover:text-slate-200 transition-colors">
                      {issue.agentName}
                    </Link>
                  </TableCell>
                  <TableCell className="py-4">
                    <Link href={`/companies/${issue.companyId}`} className="text-sm text-slate-400 hover:text-slate-200 transition-colors">
                      {issue.companyName}
                    </Link>
                  </TableCell>
                  <TableCell className="py-4">
                    <Badge
                      className={cn(
                        "text-[10px] px-1.5 py-0 h-4 border capitalize",
                        SEVERITY_BADGE[issue.severity] ?? ""
                      )}
                    >
                      {issue.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-4">
                    <Badge
                      className={
                        issue.resolvedAt
                          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] px-1.5 py-0 h-4"
                          : "bg-red-500/15 text-red-400 border border-red-500/30 text-[10px] px-1.5 py-0 h-4"
                      }
                    >
                      {issue.resolvedAt ? "Resolved" : "Open"}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-6 py-4">
                    <span className="text-xs text-slate-500">
                      {relativeTime(issue.createdAt)}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow className="border-0">
                <TableCell colSpan={7} className="text-center text-slate-600 py-16 text-sm">
                  No issues found. All systems nominal.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
