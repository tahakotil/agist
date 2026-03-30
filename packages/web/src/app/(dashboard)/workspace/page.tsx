"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useSearchParams, useRouter } from "next/navigation"
import {
  getCompanies,
  getWorkspaceReports,
  getAgentReportFiles,
  getReportFileContent,
  getWorkspaceSynergy,
  type Company,
  type ReportDirEntry,
  type ReportFileEntry,
} from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { FolderOpen, File, Zap, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

export default function WorkspacePage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const companyId = searchParams.get("companyId") ?? ""
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("reports")

  const { data: companiesData } = useQuery({
    queryKey: ["companies"],
    queryFn: () => getCompanies({ limit: 100 }),
  })
  const companies = companiesData?.companies ?? []

  const { data: reports = [], isLoading: reportsLoading } = useQuery({
    queryKey: ["workspace-reports", companyId],
    queryFn: () => getWorkspaceReports(companyId),
    enabled: !!companyId,
  })

  const { data: files = [], isLoading: filesLoading } = useQuery({
    queryKey: ["workspace-files", companyId, selectedSlug],
    queryFn: () => getAgentReportFiles(companyId, selectedSlug!),
    enabled: !!companyId && !!selectedSlug,
  })

  const { data: fileContent, isLoading: contentLoading } = useQuery({
    queryKey: ["workspace-file-content", companyId, selectedSlug, selectedFile],
    queryFn: () => getReportFileContent(companyId, selectedSlug!, selectedFile!),
    enabled: !!companyId && !!selectedSlug && !!selectedFile,
  })

  const { data: synergySignals = [], isLoading: synergyLoading } = useQuery({
    queryKey: ["workspace-synergy", companyId],
    queryFn: () => getWorkspaceSynergy(companyId),
    enabled: !!companyId && activeTab === "synergy",
  })

  function handleCompanyChange(id: string) {
    setSelectedSlug(null)
    setSelectedFile(null)
    router.push(`/workspace?companyId=${id}`)
  }

  function handleSlugClick(slug: string) {
    setSelectedSlug(slug)
    setSelectedFile(null)
  }

  function handleFileClick(name: string) {
    setSelectedFile(name)
  }

  function renderFileContent(content: string, filename: string) {
    const isJson = filename.endsWith(".json") || filename.endsWith(".jsonl")
    if (isJson) {
      try {
        const parsed = JSON.parse(content)
        return (
          <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-all">
            {JSON.stringify(parsed, null, 2)}
          </pre>
        )
      } catch {
        // fall through to plain text
      }
    }
    return (
      <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-all">
        {content}
      </pre>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Workspace</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Shared reports and inter-agent file communication
          </p>
        </div>
        <Select value={companyId} onValueChange={handleCompanyChange}>
          <SelectTrigger className="w-56 bg-slate-900 border-slate-700 text-slate-200">
            <SelectValue placeholder="Select company" />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700">
            {companies.map((c: Company) => (
              <SelectItem key={c.id} value={c.id} className="text-slate-200">
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!companyId && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="flex items-center justify-center py-16 text-slate-500">
            <div className="text-center">
              <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>Select a company to view its workspace</p>
            </div>
          </CardContent>
        </Card>
      )}

      {companyId && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-slate-900 border border-slate-800">
            <TabsTrigger value="reports" className="data-[state=active]:bg-slate-800">
              Reports
            </TabsTrigger>
            <TabsTrigger value="synergy" className="data-[state=active]:bg-slate-800">
              Synergy Signals
            </TabsTrigger>
          </TabsList>

          <TabsContent value="reports" className="mt-4">
            <div className="grid grid-cols-12 gap-4">
              {/* Left panel: agent dirs */}
              <div className="col-span-3">
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardHeader className="pb-2 px-4 pt-4">
                    <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-wide">
                      Agents
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-2 pb-2">
                    {reportsLoading && (
                      <p className="text-xs text-slate-500 px-2 py-4 text-center">Loading...</p>
                    )}
                    {!reportsLoading && reports.length === 0 && (
                      <p className="text-xs text-slate-500 px-2 py-4 text-center">
                        No report directories found
                      </p>
                    )}
                    <ScrollArea className="h-[60vh]">
                      {reports.map((dir: ReportDirEntry) => (
                        <button
                          key={dir.slug}
                          onClick={() => handleSlugClick(dir.slug)}
                          className={cn(
                            "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors",
                            selectedSlug === dir.slug
                              ? "bg-blue-500/15 text-blue-400"
                              : "text-slate-300 hover:bg-slate-800/60"
                          )}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <FolderOpen className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
                            <span className="truncate font-mono text-xs">{dir.slug}</span>
                          </span>
                          <span className="flex items-center gap-1 flex-shrink-0 ml-1">
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 border-slate-700 text-slate-500"
                            >
                              {dir.fileCount}
                            </Badge>
                            <ChevronRight className="h-3 w-3 opacity-40" />
                          </span>
                        </button>
                      ))}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>

              {/* Middle panel: file list */}
              <div className="col-span-3">
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardHeader className="pb-2 px-4 pt-4">
                    <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-wide">
                      {selectedSlug ? (
                        <span className="font-mono text-blue-400">{selectedSlug}</span>
                      ) : (
                        "Files"
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-2 pb-2">
                    {!selectedSlug && (
                      <p className="text-xs text-slate-500 px-2 py-4 text-center">
                        Select an agent
                      </p>
                    )}
                    {selectedSlug && filesLoading && (
                      <p className="text-xs text-slate-500 px-2 py-4 text-center">Loading...</p>
                    )}
                    {selectedSlug && !filesLoading && files.length === 0 && (
                      <p className="text-xs text-slate-500 px-2 py-4 text-center">
                        No files yet
                      </p>
                    )}
                    <ScrollArea className="h-[60vh]">
                      {files.map((file: ReportFileEntry) => (
                        <button
                          key={file.name}
                          onClick={() => handleFileClick(file.name)}
                          className={cn(
                            "w-full flex flex-col px-3 py-2 rounded-lg text-sm transition-colors text-left",
                            selectedFile === file.name
                              ? "bg-blue-500/15 text-blue-400"
                              : "text-slate-300 hover:bg-slate-800/60"
                          )}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <File className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
                            <span className="truncate font-mono text-xs">{file.name}</span>
                          </span>
                          <span className="text-[10px] text-slate-500 mt-0.5 pl-5">
                            {formatBytes(file.size)} · {formatDate(file.modifiedAt)}
                          </span>
                        </button>
                      ))}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>

              {/* Right panel: file content */}
              <div className="col-span-6">
                <Card className="bg-slate-900/50 border-slate-800">
                  <CardHeader className="pb-2 px-4 pt-4">
                    <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-wide">
                      {selectedFile ? (
                        <span className="font-mono text-slate-300">{selectedFile}</span>
                      ) : (
                        "Content"
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    {!selectedFile && (
                      <div className="flex items-center justify-center h-[56vh] text-slate-500">
                        <div className="text-center">
                          <File className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          <p className="text-sm">Select a file to view its content</p>
                        </div>
                      </div>
                    )}
                    {selectedFile && contentLoading && (
                      <p className="text-xs text-slate-500 py-4 text-center">Loading...</p>
                    )}
                    {selectedFile && !contentLoading && fileContent !== undefined && (
                      <ScrollArea className="h-[56vh]">
                        <div className="bg-slate-950 rounded-lg p-3">
                          {renderFileContent(fileContent, selectedFile)}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="synergy" className="mt-4">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader className="px-4 pt-4 pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-300">
                  <Zap className="h-4 w-4 text-yellow-400" />
                  Cross-Agent Synergy Signals
                  <span className="text-xs text-slate-500 font-normal">(last 50 entries)</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {synergyLoading && (
                  <p className="text-sm text-slate-500 py-4 text-center">Loading...</p>
                )}
                {!synergyLoading && synergySignals.length === 0 && (
                  <div className="flex items-center justify-center py-12 text-slate-500">
                    <div className="text-center">
                      <Zap className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No synergy signals yet</p>
                      <p className="text-xs mt-1 opacity-60">
                        Agents write to{" "}
                        <code className="font-mono">reports/_synergy/signals.jsonl</code>
                      </p>
                    </div>
                  </div>
                )}
                {synergySignals.length > 0 && (
                  <ScrollArea className="h-[60vh]">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-slate-800">
                          <TableHead className="text-slate-400 text-xs">#</TableHead>
                          <TableHead className="text-slate-400 text-xs">Signal</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {synergySignals.map((signal, idx) => (
                          <TableRow key={idx} className="border-slate-800 hover:bg-slate-800/30">
                            <TableCell className="text-slate-500 text-xs font-mono w-10">
                              {idx + 1}
                            </TableCell>
                            <TableCell>
                              <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-all">
                                {typeof signal === "object"
                                  ? JSON.stringify(signal, null, 2)
                                  : String(signal)}
                              </pre>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
