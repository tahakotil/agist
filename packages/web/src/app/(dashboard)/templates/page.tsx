"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { importTemplate, type AgistTemplate } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Upload, Bot, Timer, Building2, FileJson, Loader2, CheckCircle2, ArrowRight } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// ── Built-in templates (static metadata) ──────────────────────────────────────

interface BuiltinTemplate {
  id: string
  name: string
  description: string
  agentCount: number
  routineCount: number
  roles: string[]
  file: string
}

const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    id: "saas-monitoring",
    name: "SaaS Monitoring Team",
    description: "Production monitoring, SEO tracking, and revenue analysis for a SaaS product.",
    agentCount: 3,
    routineCount: 5,
    roles: ["devops", "seo", "analyst"],
    file: "saas-monitoring.json",
  },
  {
    id: "content-agency",
    name: "Content Agency Pipeline",
    description: "End-to-end content production pipeline with researcher, writer, editor, and publisher roles.",
    agentCount: 4,
    routineCount: 5,
    roles: ["research", "content", "editor", "marketing"],
    file: "content-agency.json",
  },
  {
    id: "solo-founder",
    name: "Solo Founder Stack",
    description: "Full-stack AI team for a solo founder — infrastructure, leads, SEO, trends, and brand.",
    agentCount: 5,
    routineCount: 9,
    roles: ["devops", "sales", "seo", "research", "marketing"],
    file: "solo-founder.json",
  },
]

// Embedded built-in template data (loaded from JSON at build time via fetch would require server)
// For the frontend we embed the templates inline as constants so no server-side FS access needed

const BUILTIN_TEMPLATE_DATA: Record<string, AgistTemplate> = {
  "saas-monitoring": {
    version: "1.0",
    name: "SaaS Monitoring Team",
    description: "Production monitoring, SEO tracking, and revenue analysis for a SaaS product",
    author: "Agist",
    company: {
      name: "SaaS Monitoring Team",
      description: "Production monitoring, SEO tracking, and revenue analysis for a SaaS product",
      budget_monthly_cents: 5000,
    },
    agents: [
      {
        slug: "devops-monitor",
        name: "DevOps Monitor",
        role: "devops",
        title: "Infrastructure & Reliability Engineer",
        model: "claude-haiku-4-5",
        capabilities: "uptime monitoring, error rate tracking, deployment health checks, alert escalation",
        budget_monthly_cents: 2000,
        context_capsule: "I monitor production infrastructure health. I check API response times, error rates, and deployment status.",
      },
      {
        slug: "seo-tracker",
        name: "SEO Tracker",
        role: "seo",
        title: "Search Engine Optimization Analyst",
        model: "claude-haiku-4-5",
        capabilities: "keyword ranking tracking, competitor analysis, content gap identification, backlink monitoring",
        reports_to: "devops-monitor",
        budget_monthly_cents: 1500,
      },
      {
        slug: "revenue-analyst",
        name: "Revenue Analyst",
        role: "general",
        title: "Revenue & Growth Analyst",
        model: "claude-sonnet-4-6",
        capabilities: "MRR tracking, churn analysis, cohort analysis, revenue forecasting, pricing experiments",
        reports_to: "devops-monitor",
        budget_monthly_cents: 1500,
      },
    ],
    routines: [
      { agent_slug: "devops-monitor", title: "Production Health Check", cron_expression: "*/15 * * * *" },
      { agent_slug: "devops-monitor", title: "Daily Infrastructure Report", cron_expression: "0 8 * * *" },
      { agent_slug: "seo-tracker", title: "Weekly SEO Rankings Check", cron_expression: "0 9 * * 1" },
      { agent_slug: "revenue-analyst", title: "Weekly Revenue Report", cron_expression: "0 10 * * 1" },
      { agent_slug: "revenue-analyst", title: "Daily MRR Snapshot", cron_expression: "0 7 * * *" },
    ],
  },
  "content-agency": {
    version: "1.0",
    name: "Content Agency Pipeline",
    description: "End-to-end content production pipeline with researcher, writer, editor, and publisher roles",
    author: "Agist",
    company: {
      name: "Content Agency Pipeline",
      description: "End-to-end content production pipeline",
      budget_monthly_cents: 8000,
    },
    agents: [
      {
        slug: "content-researcher",
        name: "Content Researcher",
        role: "research",
        title: "Senior Content Researcher",
        model: "claude-sonnet-4-6",
        capabilities: "topic research, keyword analysis, competitor content audit, source verification, trend identification",
        budget_monthly_cents: 2000,
      },
      {
        slug: "content-writer",
        name: "Content Writer",
        role: "content",
        title: "Senior Content Writer",
        model: "claude-sonnet-4-6",
        capabilities: "long-form article writing, SEO copywriting, technical writing, storytelling",
        reports_to: "content-researcher",
        budget_monthly_cents: 2500,
      },
      {
        slug: "content-editor",
        name: "Content Editor",
        role: "content",
        title: "Senior Editor & QA",
        model: "claude-sonnet-4-6",
        capabilities: "copy editing, fact-checking, SEO review, readability scoring, brand voice consistency",
        reports_to: "content-writer",
        budget_monthly_cents: 2000,
      },
      {
        slug: "content-publisher",
        name: "Content Publisher",
        role: "marketing",
        title: "Content Publishing & Distribution Manager",
        model: "claude-haiku-4-5",
        capabilities: "CMS publishing, social media distribution, newsletter scheduling, content calendar management",
        reports_to: "content-editor",
        budget_monthly_cents: 1500,
      },
    ],
    routines: [
      { agent_slug: "content-researcher", title: "Weekly Topic Research Sprint", cron_expression: "0 8 * * 1" },
      { agent_slug: "content-writer", title: "Daily Writing Session", cron_expression: "0 9 * * 1-5" },
      { agent_slug: "content-editor", title: "Editorial Review Queue", cron_expression: "0 14 * * 1-5" },
      { agent_slug: "content-publisher", title: "Publish Approved Content", cron_expression: "0 10 * * 2,4" },
      { agent_slug: "content-publisher", title: "Weekly Performance Report", cron_expression: "0 16 * * 5" },
    ],
  },
  "solo-founder": {
    version: "1.0",
    name: "Solo Founder Stack",
    description: "Full-stack AI team for a solo founder — infrastructure, leads, SEO, trends, and brand",
    author: "Agist",
    company: {
      name: "Solo Founder Stack",
      description: "Full-stack AI team for a solo founder",
      budget_monthly_cents: 10000,
    },
    agents: [
      {
        slug: "infra-monitor",
        name: "Infra Monitor",
        role: "devops",
        title: "Infrastructure Watchdog",
        model: "claude-haiku-4-5",
        capabilities: "uptime monitoring, SSL certificate checks, deployment status, error log analysis",
        budget_monthly_cents: 1500,
      },
      {
        slug: "lead-hunter",
        name: "Lead Hunter",
        role: "sales",
        title: "Outbound Lead Generation Specialist",
        model: "claude-sonnet-4-6",
        capabilities: "ICP profiling, lead research, cold outreach personalization, LinkedIn prospecting",
        reports_to: "infra-monitor",
        budget_monthly_cents: 2500,
      },
      {
        slug: "seo-engine",
        name: "SEO Engine",
        role: "seo",
        title: "Organic Growth & SEO Specialist",
        model: "claude-haiku-4-5",
        capabilities: "keyword research, content gap analysis, technical SEO audits, link building outreach",
        reports_to: "infra-monitor",
        budget_monthly_cents: 2000,
      },
      {
        slug: "trend-scout",
        name: "Trend Scout",
        role: "research",
        title: "Market Trends & Competitor Intelligence",
        model: "claude-sonnet-4-6",
        capabilities: "competitor monitoring, product hunt tracking, Hacker News scanning, emerging market identification",
        reports_to: "infra-monitor",
        budget_monthly_cents: 2000,
      },
      {
        slug: "brand-voice",
        name: "Brand Voice",
        role: "marketing",
        title: "Brand & Social Media Manager",
        model: "claude-sonnet-4-6",
        capabilities: "brand storytelling, Twitter/X content, LinkedIn thought leadership, newsletter writing",
        reports_to: "trend-scout",
        budget_monthly_cents: 2000,
      },
    ],
    routines: [
      { agent_slug: "infra-monitor", title: "Infrastructure Health Check", cron_expression: "*/15 * * * *" },
      { agent_slug: "infra-monitor", title: "Daily Status Digest", cron_expression: "0 7 * * *" },
      { agent_slug: "lead-hunter", title: "Daily Lead Prospecting", cron_expression: "0 9 * * 1-5" },
      { agent_slug: "lead-hunter", title: "Weekly Pipeline Review", cron_expression: "0 10 * * 1" },
      { agent_slug: "seo-engine", title: "Weekly SEO Audit", cron_expression: "0 8 * * 2" },
      { agent_slug: "trend-scout", title: "Daily Market Scan", cron_expression: "0 6 * * *" },
      { agent_slug: "trend-scout", title: "Weekly Competitor Intelligence Report", cron_expression: "0 11 * * 5" },
      { agent_slug: "brand-voice", title: "Publish Weekly Newsletter", cron_expression: "0 12 * * 4" },
      { agent_slug: "brand-voice", title: "Social Content Batch", cron_expression: "0 9 * * 2,4" },
    ],
  },
}

// ── Page component ─────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [jsonInput, setJsonInput] = useState("")
  const [preview, setPreview] = useState<AgistTemplate | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  function handleJsonChange(value: string) {
    setJsonInput(value)
    setParseError(null)
    setPreview(null)
    if (!value.trim()) return
    try {
      const parsed = JSON.parse(value) as AgistTemplate
      if (parsed.version !== "1.0") {
        setParseError(`Unsupported template version: "${parsed.version}". Expected "1.0".`)
        return
      }
      if (!parsed.company?.name) {
        setParseError("Invalid template: missing company.name")
        return
      }
      if (!Array.isArray(parsed.agents)) {
        setParseError("Invalid template: agents must be an array")
        return
      }
      setPreview(parsed)
    } catch {
      setParseError("Invalid JSON — please check the format")
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      setJsonInput(text)
      handleJsonChange(text)
    }
    reader.readAsText(file)
  }

  async function handleImport(template: AgistTemplate) {
    setImporting(true)
    try {
      const { companyId } = await importTemplate(template)
      toast.success(`Company "${template.company.name}" imported successfully`)
      router.push(`/companies/${companyId}`)
    } catch (err) {
      toast.error("Import failed: " + (err instanceof Error ? err.message : "Unknown error"))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="p-6 space-y-8 max-w-[1200px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Templates</h1>
        <p className="text-sm text-slate-500 mt-1">
          Import a company template to instantly spin up a configured agent team, or export an existing company as a reusable template.
        </p>
      </div>

      {/* ── Built-in Templates ── */}
      <section>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Built-in Templates</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {BUILTIN_TEMPLATES.map((tpl) => (
            <BuiltinTemplateCard
              key={tpl.id}
              template={tpl}
              data={BUILTIN_TEMPLATE_DATA[tpl.id]}
              onImport={handleImport}
              importing={importing}
            />
          ))}
        </div>
      </section>

      {/* ── Import Template ── */}
      <section>
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Import Template</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input area */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Upload JSON file
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleFileUpload}
              />
              <span className="text-xs text-slate-600">or paste JSON below</span>
            </div>

            <Textarea
              value={jsonInput}
              onChange={(e) => handleJsonChange(e.target.value)}
              placeholder={'{\n  "version": "1.0",\n  "company": { "name": "My Team" },\n  ...\n}'}
              className="bg-slate-900 border-slate-700 text-slate-300 placeholder:text-slate-700 font-mono text-xs resize-none min-h-[280px]"
              rows={14}
            />

            {parseError && (
              <p className="text-xs text-red-400 flex items-start gap-1.5">
                <span className="mt-0.5 flex-shrink-0">!</span>
                {parseError}
              </p>
            )}
          </div>

          {/* Preview area */}
          <div>
            {preview ? (
              <TemplatePreview template={preview} onImport={handleImport} importing={importing} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-[280px] rounded-lg border border-dashed border-slate-800 text-slate-600 text-sm gap-3">
                <FileJson className="h-10 w-10 text-slate-700" />
                <span>Template preview will appear here</span>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

// ── BuiltinTemplateCard ────────────────────────────────────────────────────────

function BuiltinTemplateCard({
  template,
  data,
  onImport,
  importing,
}: {
  template: BuiltinTemplate
  data: AgistTemplate
  onImport: (tpl: AgistTemplate) => Promise<void>
  importing: boolean
}) {
  return (
    <Card className="bg-slate-900 border-slate-800 hover:border-slate-700 transition-colors flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500/20 to-blue-500/20 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
            <Building2 className="h-4 w-4 text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-semibold text-slate-100">{template.name}</CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-1 leading-relaxed">
              {template.description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <Bot className="h-3 w-3 text-slate-500" />
            {template.agentCount} agents
          </span>
          <span className="flex items-center gap-1">
            <Timer className="h-3 w-3 text-slate-500" />
            {template.routineCount} routines
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {template.roles.map((role) => (
            <Badge
              key={role}
              className="bg-slate-800 text-slate-400 border border-slate-700 text-[10px] px-1.5 py-0"
            >
              {role}
            </Badge>
          ))}
        </div>
        <Button
          size="sm"
          className="w-full bg-violet-600 hover:bg-violet-500 text-white mt-auto"
          disabled={importing}
          onClick={() => onImport(data)}
        >
          {importing ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <ArrowRight className="h-3.5 w-3.5 mr-1.5" />
          )}
          Import Template
        </Button>
      </CardContent>
    </Card>
  )
}

// ── TemplatePreview ────────────────────────────────────────────────────────────

function TemplatePreview({
  template,
  onImport,
  importing,
}: {
  template: AgistTemplate
  onImport: (tpl: AgistTemplate) => Promise<void>
  importing: boolean
}) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-5 space-y-4 h-full flex flex-col">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-slate-100">{template.company.name}</p>
          {template.company.description && (
            <p className="text-xs text-slate-500 mt-0.5">{template.company.description}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-400">
        <span className="flex items-center gap-1">
          <Bot className="h-3 w-3 text-slate-500" />
          {template.agents.length} agents
        </span>
        <span className="flex items-center gap-1">
          <Timer className="h-3 w-3 text-slate-500" />
          {template.routines.length} routines
        </span>
        {template.company.budget_monthly_cents && template.company.budget_monthly_cents > 0 && (
          <span className="text-slate-500">
            ${(template.company.budget_monthly_cents / 100).toFixed(0)}/mo budget
          </span>
        )}
      </div>

      {/* Agent list */}
      <div className="flex-1 space-y-1.5 overflow-y-auto max-h-[200px]">
        {template.agents.map((agent) => (
          <div
            key={agent.slug}
            className="flex items-center gap-2 px-3 py-2 rounded-md bg-slate-800/60 border border-slate-800"
          >
            <Bot className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-200 truncate">{agent.name}</p>
              <p className="text-[10px] text-slate-500 capitalize">{agent.role}</p>
            </div>
            <Badge className={cn(
              "text-[10px] border flex-shrink-0",
              agent.model?.includes("haiku")
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                : agent.model?.includes("sonnet")
                ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                : "bg-violet-500/15 text-violet-400 border-violet-500/30"
            )}>
              {agent.model?.includes("haiku") ? "Haiku" : agent.model?.includes("sonnet") ? "Sonnet" : "Opus"}
            </Badge>
          </div>
        ))}
      </div>

      <Button
        size="sm"
        className="w-full bg-blue-600 hover:bg-blue-500 text-white"
        disabled={importing}
        onClick={() => onImport(template)}
      >
        {importing ? (
          <>
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            Importing...
          </>
        ) : (
          <>
            <Building2 className="h-3.5 w-3.5 mr-1.5" />
            Import this template
          </>
        )}
      </Button>
    </div>
  )
}
