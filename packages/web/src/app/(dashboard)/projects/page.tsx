"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getCompanies, getCompanyProjects, createProject, type Company, type Project } from "@/lib/api"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FolderOpen, Bot, Plus, Folder } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

function ProjectCard({ project }: { project: Project & { companyName?: string } }) {
  return (
    <Card className="bg-slate-900 border-slate-800 hover:border-slate-600 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Folder className="h-4 w-4 text-blue-400 flex-shrink-0" />
            <CardTitle className="text-sm font-medium text-slate-100 truncate">
              {project.name}
            </CardTitle>
          </div>
          <Badge variant="secondary" className="text-xs bg-slate-800 text-slate-400 flex-shrink-0">
            {project.agentCount ?? 0} agents
          </Badge>
        </div>
        {project.companyName && (
          <p className="text-xs text-slate-500 mt-1">{project.companyName}</p>
        )}
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {project.description && (
          <p className="text-xs text-slate-400 line-clamp-2">{project.description}</p>
        )}
        {project.workingDirectory && (
          <p className="text-xs text-slate-500 font-mono truncate">{project.workingDirectory}</p>
        )}
      </CardContent>
    </Card>
  )
}

export default function ProjectsPage() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [workingDirectory, setWorkingDirectory] = useState("")
  const [selectedCompanyId, setSelectedCompanyId] = useState("")
  const [creating, setCreating] = useState(false)

  const { data: companies } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const res = await getCompanies()
      return res.companies
    },
  })

  // Fetch projects for all companies
  const { data: projectsByCompany, isLoading } = useQuery({
    queryKey: ["all-projects", companies?.map((c: Company) => c.id)],
    queryFn: async () => {
      if (!companies || companies.length === 0) return []
      const results = await Promise.all(
        companies.map(async (company: Company) => {
          const res = await getCompanyProjects(company.id)
          return res.projects.map((p: Project) => ({ ...p, companyName: company.name }))
        })
      )
      return results.flat()
    },
    enabled: !!companies && companies.length > 0,
  })

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !selectedCompanyId) return
    setCreating(true)
    try {
      await createProject(selectedCompanyId, {
        name: name.trim(),
        description: description.trim() || undefined,
        workingDirectory: workingDirectory.trim() || undefined,
      })
      toast.success("Project created")
      queryClient.invalidateQueries({ queryKey: ["all-projects"] })
      queryClient.invalidateQueries({ queryKey: ["projects", selectedCompanyId] })
      setOpen(false)
      setName("")
      setDescription("")
      setWorkingDirectory("")
      setSelectedCompanyId("")
    } catch (err) {
      toast.error("Failed to create project: " + (err instanceof Error ? err.message : "Unknown error"))
    } finally {
      setCreating(false)
    }
  }

  const projects = projectsByCompany ?? []

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Projects</h1>
          <p className="text-sm text-slate-500 mt-1">Organize agents by project</p>
        </div>
        <Button
          size="sm"
          className="bg-blue-600 hover:bg-blue-500 text-white"
          onClick={() => setOpen(true)}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          New Project
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 rounded-lg bg-slate-900 border border-slate-800 animate-pulse" />
          ))}
        </div>
      ) : projects.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FolderOpen className="h-12 w-12 text-slate-700 mb-4" />
          <p className="text-slate-400 font-medium">No projects yet</p>
          <p className="text-slate-500 text-sm mt-1">Create a project to group agents by codebase or goal</p>
          <Button
            size="sm"
            className="mt-4 bg-blue-600 hover:bg-blue-500 text-white"
            onClick={() => setOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Create First Project
          </Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-slate-100">
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm text-slate-400">Company</label>
              <Select value={selectedCompanyId} onValueChange={(v) => setSelectedCompanyId(v ?? "")}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100">
                  <SelectValue placeholder="Select company..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {(companies ?? []).map((company) => (
                    <SelectItem key={company.id} value={company.id} className="text-slate-100">
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-slate-400">Name</label>
              <Input
                placeholder="e.g. Frontend App"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-100"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-slate-400">Description (optional)</label>
              <Textarea
                placeholder="What does this project contain?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-100 resize-none"
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-slate-400">Working Directory (optional)</label>
              <Input
                placeholder="/home/user/myapp"
                value={workingDirectory}
                onChange={(e) => setWorkingDirectory(e.target.value)}
                className="bg-slate-800 border-slate-700 text-slate-100 font-mono text-sm"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={creating || !name.trim() || !selectedCompanyId}
                className="bg-blue-600 hover:bg-blue-500 text-white"
              >
                {creating ? "Creating..." : "Create Project"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
