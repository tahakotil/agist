"use client"

import { useQuery } from "@tanstack/react-query"
import { getRecentRuns, type Run } from "@/lib/api"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { relativeTime, formatDuration, formatCost, cn } from "@/lib/utils"
import { CheckCircle, XCircle, Play, Ban } from "lucide-react"
import Link from "next/link"

const RUN_STATUS_BADGE: Record<string, string> = {
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  failed: "bg-red-500/15 text-red-400 border-red-500/30",
  running: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  queued: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  cancelled: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  timeout: "bg-orange-500/15 text-orange-400 border-orange-500/30",
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  completed: <CheckCircle className="h-4 w-4 text-emerald-400" />,
  failed: <XCircle className="h-4 w-4 text-red-400" />,
  running: <Play className="h-4 w-4 text-blue-400 animate-pulse" />,
  cancelled: <Ban className="h-4 w-4 text-slate-500" />,
}

export default function RunsPage() {
  const { data: runs, isLoading } = useQuery<Run[]>({
    queryKey: ["runs", "recent"],
    queryFn: () => getRecentRuns(100),
  })

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Runs</h1>
        <p className="text-sm text-slate-500 mt-1">
          Execution history across all agents
        </p>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-800 hover:bg-transparent">
              <TableHead className="text-slate-500 text-xs pl-6 w-8" />
              <TableHead className="text-slate-500 text-xs">Agent</TableHead>
              <TableHead className="text-slate-500 text-xs">Company</TableHead>
              <TableHead className="text-slate-500 text-xs">Status</TableHead>
              <TableHead className="text-slate-500 text-xs">Duration</TableHead>
              <TableHead className="text-slate-500 text-xs">Cost</TableHead>
              <TableHead className="text-slate-500 text-xs pr-6">Started</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i} className="border-slate-800">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <TableCell key={j} className="py-4">
                      <div className="h-4 bg-slate-800 rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : runs && runs.length > 0 ? (
              runs.map((run) => (
                <TableRow
                  key={run.id}
                  className="border-slate-800 hover:bg-slate-800/40 transition-colors cursor-pointer"
                >
                  <TableCell className="pl-6 py-4 w-8">
                    {STATUS_ICON[run.status] ?? <div className="h-4 w-4 rounded-full bg-slate-700" />}
                  </TableCell>
                  <TableCell className="py-4">
                    <Link
                      href={`/runs/${run.id}`}
                      className="font-medium text-slate-200 hover:text-blue-400 transition-colors"
                    >
                      {run.agentName}
                    </Link>
                  </TableCell>
                  <TableCell className="py-4">
                    <Link
                      href={`/companies/${run.companyId}`}
                      className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      {run.companyName}
                    </Link>
                  </TableCell>
                  <TableCell className="py-4">
                    <Badge
                      className={cn(
                        "text-[10px] px-1.5 py-0 h-4 border capitalize",
                        RUN_STATUS_BADGE[run.status] ?? ""
                      )}
                    >
                      {run.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-4">
                    <span className="text-xs font-mono text-slate-400">
                      {formatDuration(run.durationMs)}
                    </span>
                  </TableCell>
                  <TableCell className="py-4">
                    <span className="text-xs font-mono text-slate-400">
                      {formatCost(run.cost)}
                    </span>
                  </TableCell>
                  <TableCell className="pr-6 py-4">
                    <span className="text-xs text-slate-500">
                      {relativeTime(run.startedAt)}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow className="border-0">
                <TableCell colSpan={7} className="text-center text-slate-600 py-16 text-sm">
                  No runs found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
