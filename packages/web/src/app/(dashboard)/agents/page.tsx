"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "next/navigation"
import { getAgents, getCompanies, createAgent, wakeAgent, updateAgent, type Agent, type Company, type Pagination } from "@/lib/api"
import { Paginator } from "@/components/paginator"
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
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { relativeTime, cn } from "@/lib/utils"
import { Play, Pause, FileText, Plus, Bot } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

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
}

const STATUS_DOT: Record<string, string> = {
  idle: "bg-emerald-400",
  running: "bg-blue-400 animate-pulse",
  error: "bg-red-400",
  paused: "bg-amber-400",
}

const MODEL_LABELS: { value: string; label: string }[] = [
  { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5 — Fast & Cheap" },
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6 — Balanced" },
  { value: "claude-opus-4-6", label: "Opus 4.6 — Deep Reasoning" },
]

function modelLabel(model: string): string {
  const found = MODEL_LABELS.find((m) => m.value === model)
  if (found) return found.label
  if (model.includes("haiku")) return "Haiku"
  if (model.includes("sonnet")) return "Sonnet"
  if (model.includes("opus")) return "Opus"
  return model
}

export default function AgentsPage() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [agentName, setAgentName] = useState("")
  const [agentTitle, setAgentTitle] = useState("")
  const [agentRole, setAgentRole] = useState("worker")
  const [agentModel, setAgentModel] = useState("claude-sonnet-4-6")
  const [agentCompanyId, setAgentCompanyId] = useState("")
  const [agentWorkingDir, setAgentWorkingDir] = useState("")
  const [creating, setCreating] = useState(false)

  const { data: agents, isLoading } = useQuery<Agent[]>({
    queryKey: ["agents"],
    queryFn: () => getAgents().then((r) => r.agents),
  })

  const { data: companies } = useQuery<Company[]>({
    queryKey: ["companies"],
    queryFn: () => getCompanies().then((r) => r.companies),
  })

  async function handleWake(id: string) {
    try {
      await wakeAgent(id)
      toast.success("Agent woken")
      queryClient.invalidateQueries({ queryKey: ["agents"] })
    } catch {
      toast.error("Failed to wake agent")
    }
  }

  async function handlePause(id: string) {
    try {
      await updateAgent(id, { status: "paused" })
      toast.success("Agent paused")
      queryClient.invalidateQueries({ queryKey: ["agents"] })
    } catch {
      toast.error("Failed to pause agent")
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!agentName.trim() || !agentCompanyId) return
    setCreating(true)
    try {
      await createAgent(agentCompanyId, {
        name: agentName.trim(),
        title: agentTitle.trim() || undefined,
        role: agentRole,
        model: agentModel,
        workingDirectory: agentWorkingDir.trim() || null,
      })
      toast.success("Agent created")
      queryClient.invalidateQueries({ queryKey: ["agents"] })
      queryClient.invalidateQueries({ queryKey: ["companies"] })
      setOpen(false)
      setAgentName("")
      setAgentTitle("")
      setAgentRole("worker")
      setAgentModel("claude-sonnet-4-6")
      setAgentCompanyId("")
      setAgentWorkingDir("")
    } catch (err) {
      toast.error("Failed to create agent: " + (err instanceof Error ? err.message : "Unknown error"))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Agents</h1>
          <p className="text-sm text-slate-500 mt-1">All agents across all companies</p>
        </div>
        <Button
          size="sm"
          className="bg-blue-600 hover:bg-blue-500 text-white"
          onClick={() => setOpen(true)}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          New Agent
        </Button>
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
              <TableHead className="text-slate-500 text-xs">Last Active</TableHead>
              <TableHead className="text-slate-500 text-xs pr-6 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i} className="border-slate-800">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <TableCell key={j} className="py-4">
                      <div className="h-4 bg-slate-800 rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : agents && agents.length > 0 ? (
              agents.map((agent) => (
                <TableRow key={agent.id} className="border-slate-800 hover:bg-slate-800/40 transition-colors">
                  <TableCell className="pl-6 py-4">
                    <Link
                      href={`/agents/${agent.id}`}
                      className="font-medium text-slate-200 hover:text-blue-400 transition-colors"
                    >
                      {agent.name}
                    </Link>
                    {agent.title && (
                      <p className="text-xs text-slate-500 mt-0.5">{agent.title}</p>
                    )}
                  </TableCell>
                  <TableCell className="py-4">
                    <Link
                      href={`/companies/${agent.companyId}`}
                      className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      {agent.companyName || agent.companyId}
                    </Link>
                  </TableCell>
                  <TableCell className="py-4">
                    <span className="text-xs text-slate-500 capitalize">{agent.role}</span>
                  </TableCell>
                  <TableCell className="py-4">
                    <Badge
                      className={cn(
                        "text-[10px] px-1.5 py-0 h-4 border font-mono",
                        MODEL_BADGE[agent.model] ?? "bg-slate-500/15 text-slate-400 border-slate-500/30"
                      )}
                    >
                      {modelLabel(agent.model)}
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
                    <span className="text-xs text-slate-500">{relativeTime(agent.updatedAt)}</span>
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
                        title="View details"
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
                <TableCell colSpan={7} className="py-16">
                  <div className="flex flex-col items-center gap-3 text-slate-600">
                    <Bot className="h-10 w-10 text-slate-700" />
                    <span className="text-sm">No agents found.</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-slate-700 text-slate-400 hover:text-slate-200"
                      onClick={() => setOpen(true)}
                    >
                      <Plus className="h-4 w-4 mr-1.5" />
                      Create your first agent
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-slate-100">
          <DialogHeader>
            <DialogTitle>New Agent</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Company *</label>
              <Select value={agentCompanyId} onValueChange={setAgentCompanyId} required>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100">
                  <SelectValue placeholder="Select company..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {companies?.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-slate-200 focus:bg-slate-700">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Name *</label>
              <Input
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="e.g. Marketing Lead"
                className="bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-600"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Title</label>
              <Input
                value={agentTitle}
                onChange={(e) => setAgentTitle(e.target.value)}
                placeholder="e.g. Senior Marketing Strategist"
                className="bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-600"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Working Directory</label>
              <Input
                value={agentWorkingDir}
                onChange={(e) => setAgentWorkingDir(e.target.value)}
                placeholder="e.g. /home/user/myproject"
                className="bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-600 font-mono text-sm"
              />
              <p className="text-[10px] text-slate-600 mt-1">Absolute path. Claude CLI will run from this directory.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Role</label>
                <Select value={agentRole} onValueChange={setAgentRole}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="lead" className="text-slate-200 focus:bg-slate-700">Lead</SelectItem>
                    <SelectItem value="worker" className="text-slate-200 focus:bg-slate-700">Worker</SelectItem>
                    <SelectItem value="specialist" className="text-slate-200 focus:bg-slate-700">Specialist</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Model</label>
                <Select value={agentModel} onValueChange={setAgentModel}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {MODEL_LABELS.map((m) => (
                      <SelectItem key={m.value} value={m.value} className="text-slate-200 focus:bg-slate-700">
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                disabled={!agentName.trim() || !agentCompanyId || creating}
              >
                {creating ? "Creating..." : "Create Agent"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
