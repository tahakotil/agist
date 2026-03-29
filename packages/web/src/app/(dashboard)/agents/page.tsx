"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, type Agent } from "@/lib/api"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { relativeTime, cn } from "@/lib/utils"
import {
  Play,
  Pause,
  FileText,
  Clock,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

const MODEL_BADGE: Record<string, string> = {
  haiku: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  sonnet: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  opus: "bg-violet-500/15 text-violet-400 border-violet-500/30",
}

const STATUS_BADGE: Record<string, string> = {
  idle: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  running: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  error: "bg-red-500/15 text-red-400 border-red-500/30",
  paused: "bg-amber-500/15 text-amber-400 border-amber-500/30",
}

const STATUS_DOT: Record<string, string> = {
  idle: "bg-emerald-400",
  running: "bg-blue-400 animate-pulse",
  error: "bg-red-400",
  paused: "bg-amber-400",
}

export default function AgentsPage() {
  const queryClient = useQueryClient()

  const { data: agents, isLoading } = useQuery<Agent[]>({
    queryKey: ["agents"],
    queryFn: () => api<Agent[]>("/agents"),
  })

  async function handleWake(id: string) {
    try {
      await api(`/agents/${id}/wake`, { method: "POST" })
      toast.success("Agent woken")
      queryClient.invalidateQueries({ queryKey: ["agents"] })
    } catch {
      toast.error("Failed to wake agent")
    }
  }

  async function handlePause(id: string) {
    try {
      await api(`/agents/${id}/pause`, { method: "POST" })
      toast.success("Agent paused")
      queryClient.invalidateQueries({ queryKey: ["agents"] })
    } catch {
      toast.error("Failed to pause agent")
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Agents</h1>
        <p className="text-sm text-slate-500 mt-1">
          All agents across all companies
        </p>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-800 hover:bg-transparent">
              <TableHead className="text-slate-500 text-xs pl-6">Name</TableHead>
              <TableHead className="text-slate-500 text-xs">Company</TableHead>
              <TableHead className="text-slate-500 text-xs">Role</TableHead>
              <TableHead className="text-slate-500 text-xs">Model</TableHead>
              <TableHead className="text-slate-500 text-xs">Status</TableHead>
              <TableHead className="text-slate-500 text-xs">Schedule</TableHead>
              <TableHead className="text-slate-500 text-xs">Last Run</TableHead>
              <TableHead className="text-slate-500 text-xs pr-6 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i} className="border-slate-800">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <TableCell key={j} className="py-4">
                      <div className="h-4 bg-slate-800 rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : agents && agents.length > 0 ? (
              agents.map((agent) => (
                <TableRow
                  key={agent.id}
                  className="border-slate-800 hover:bg-slate-800/40 transition-colors"
                >
                  <TableCell className="pl-6 py-4">
                    <Link
                      href={`/agents/${agent.id}`}
                      className="font-medium text-slate-200 hover:text-blue-400 transition-colors"
                    >
                      {agent.name}
                    </Link>
                  </TableCell>
                  <TableCell className="py-4">
                    <Link
                      href={`/companies/${agent.companyId}`}
                      className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      {agent.companyName}
                    </Link>
                  </TableCell>
                  <TableCell className="py-4">
                    <span className="text-xs text-slate-500">{agent.role}</span>
                  </TableCell>
                  <TableCell className="py-4">
                    <Badge
                      className={cn(
                        "text-[10px] px-1.5 py-0 h-4 border font-mono",
                        MODEL_BADGE[agent.model] ?? "bg-slate-500/15 text-slate-400 border-slate-500/30"
                      )}
                    >
                      {agent.model}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full flex-shrink-0",
                          STATUS_DOT[agent.status] ?? "bg-slate-400"
                        )}
                      />
                      <Badge
                        className={cn(
                          "text-[10px] px-1.5 py-0 h-4 border capitalize",
                          STATUS_BADGE[agent.status] ?? "bg-slate-500/15 text-slate-400 border-slate-500/30"
                        )}
                      >
                        {agent.status}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    {agent.cronSchedule ? (
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="h-3 w-3" />
                        <span className="font-mono text-[11px]">{agent.cronSchedule}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </TableCell>
                  <TableCell className="py-4">
                    <span className="text-xs text-slate-500">{relativeTime(agent.lastRunAt)}</span>
                  </TableCell>
                  <TableCell className="py-4 pr-6">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10"
                        onClick={() => handleWake(agent.id)}
                        disabled={agent.status === "running"}
                        title="Wake agent"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10"
                        onClick={() => handlePause(agent.id)}
                        disabled={agent.status === "paused"}
                        title="Pause agent"
                      >
                        <Pause className="h-3.5 w-3.5" />
                      </Button>
                      <Link
                        href={`/agents/${agent.id}`}
                        title="View logs"
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "sm" }),
                          "h-7 w-7 p-0 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10"
                        )}
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow className="border-0">
                <TableCell colSpan={8} className="text-center text-slate-600 py-16 text-sm">
                  No agents found. Create agents through the API.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
