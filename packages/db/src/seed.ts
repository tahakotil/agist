/**
 * Demo seed data — 4 companies, 16 agents, sample routines.
 * Usage: tsx src/seed.ts [db-path]
 */

import { createDb } from "./db.js";
import {
  makeCompanyQueries,
  makeAgentQueries,
  makeRoutineQueries,
  makeIssueQueries,
} from "./queries.js";
import { resolve } from "path";

const dbPath = resolve(process.argv[2] ?? "agist.db");
const db = await createDb(dbPath);

const companies = makeCompanyQueries(db);
const agents = makeAgentQueries(db);
const routines = makeRoutineQueries(db);
const issues = makeIssueQueries(db);

// ─── Companies ────────────────────────────────────────────────────────────────

const paperclip = companies.create({
  name: "Paperclip AI",
  description: "AI-first productivity platform for knowledge workers.",
  status: "active",
  budgetMonthlyCents: 500_000, // $5,000 / month
});

const nexus = companies.create({
  name: "Nexus Commerce",
  description: "E-commerce automation and growth platform.",
  status: "active",
  budgetMonthlyCents: 300_000, // $3,000 / month
});

const vantage = companies.create({
  name: "Vantage Analytics",
  description: "Business intelligence and data pipeline company.",
  status: "active",
  budgetMonthlyCents: 200_000, // $2,000 / month
});

const stealthCo = companies.create({
  name: "Stealth Startup",
  description: "Stealth-mode company building AI infrastructure.",
  status: "paused",
  budgetMonthlyCents: 100_000, // $1,000 / month
});

console.log(`Created companies: ${[paperclip, nexus, vantage, stealthCo].map((c) => c.name).join(", ")}`);

// ─── Paperclip AI agents (6 agents) ──────────────────────────────────────────

const pcCeo = agents.create({
  companyId: paperclip.id,
  name: "Atlas",
  role: "ceo",
  title: "Chief Executive Agent",
  model: "claude-opus-4-6",
  capabilities: "Strategic planning, stakeholder communication, product vision, OKR management",
  status: "idle",
  adapterType: "claude",
  adapterConfig: { model: "claude-opus-4-6", maxTokens: 8192 },
  budgetMonthlyCents: 150_000,
});

const pcEngineer = agents.create({
  companyId: paperclip.id,
  name: "Forge",
  role: "engineer",
  title: "Lead Software Engineer",
  model: "claude-sonnet-4-6",
  capabilities: "TypeScript, React, Node.js, PostgreSQL, API design, code review",
  status: "idle",
  reportsTo: pcCeo.id,
  adapterType: "claude",
  adapterConfig: { model: "claude-sonnet-4-6", maxTokens: 16384 },
  budgetMonthlyCents: 100_000,
});

const pcDevops = agents.create({
  companyId: paperclip.id,
  name: "Orbit",
  role: "devops",
  title: "DevOps & Infrastructure Engineer",
  model: "claude-sonnet-4-6",
  capabilities: "Docker, Kubernetes, CI/CD, AWS, monitoring, incident response",
  status: "idle",
  reportsTo: pcCeo.id,
  adapterType: "claude",
  adapterConfig: { model: "claude-sonnet-4-6", maxTokens: 8192 },
  budgetMonthlyCents: 80_000,
});

const pcMarketing = agents.create({
  companyId: paperclip.id,
  name: "Spark",
  role: "marketing",
  title: "Growth & Marketing Manager",
  model: "claude-haiku-4-5-20251001",
  capabilities: "Content strategy, SEO, email campaigns, social media, A/B testing",
  status: "idle",
  reportsTo: pcCeo.id,
  adapterType: "claude",
  adapterConfig: { model: "claude-haiku-4-5-20251001", maxTokens: 4096 },
  budgetMonthlyCents: 60_000,
});

const pcResearch = agents.create({
  companyId: paperclip.id,
  name: "Lens",
  role: "research",
  title: "Market Research Analyst",
  model: "claude-haiku-4-5-20251001",
  capabilities: "Competitive analysis, user research, trend spotting, reports",
  status: "idle",
  reportsTo: pcCeo.id,
  adapterType: "claude",
  adapterConfig: { model: "claude-haiku-4-5-20251001", maxTokens: 4096 },
  budgetMonthlyCents: 50_000,
});

const pcContent = agents.create({
  companyId: paperclip.id,
  name: "Quill",
  role: "content",
  title: "Content Writer",
  model: "claude-haiku-4-5-20251001",
  capabilities: "Blog posts, landing pages, product copy, email sequences",
  status: "idle",
  reportsTo: pcMarketing.id,
  adapterType: "claude",
  adapterConfig: { model: "claude-haiku-4-5-20251001", maxTokens: 4096 },
  budgetMonthlyCents: 40_000,
});

// ─── Nexus Commerce agents (4 agents) ────────────────────────────────────────

const nxCeo = agents.create({
  companyId: nexus.id,
  name: "Vector",
  role: "ceo",
  title: "Chief Executive Agent",
  model: "claude-opus-4-6",
  capabilities: "E-commerce strategy, vendor management, revenue optimization",
  status: "idle",
  adapterType: "claude",
  adapterConfig: { model: "claude-opus-4-6", maxTokens: 8192 },
  budgetMonthlyCents: 100_000,
});

const nxSales = agents.create({
  companyId: nexus.id,
  name: "Pulse",
  role: "sales",
  title: "Sales & Conversion Specialist",
  model: "claude-sonnet-4-6",
  capabilities: "Funnel optimization, outbound prospecting, CRM management, deal closing",
  status: "idle",
  reportsTo: nxCeo.id,
  adapterType: "claude",
  adapterConfig: { model: "claude-sonnet-4-6", maxTokens: 8192 },
  budgetMonthlyCents: 80_000,
});

const nxSeo = agents.create({
  companyId: nexus.id,
  name: "Beacon",
  role: "seo",
  title: "SEO Specialist",
  model: "claude-haiku-4-5-20251001",
  capabilities: "Technical SEO, keyword research, link building, schema markup",
  status: "idle",
  reportsTo: nxCeo.id,
  adapterType: "claude",
  adapterConfig: { model: "claude-haiku-4-5-20251001", maxTokens: 4096 },
  budgetMonthlyCents: 60_000,
});

const nxEngineer = agents.create({
  companyId: nexus.id,
  name: "Circuit",
  role: "engineer",
  title: "Full-Stack Engineer",
  model: "claude-sonnet-4-6",
  capabilities: "Shopify, Python, APIs, checkout optimization, performance",
  status: "idle",
  reportsTo: nxCeo.id,
  adapterType: "claude",
  adapterConfig: { model: "claude-sonnet-4-6", maxTokens: 16384 },
  budgetMonthlyCents: 80_000,
});

// ─── Vantage Analytics agents (4 agents) ─────────────────────────────────────

const vaGm = agents.create({
  companyId: vantage.id,
  name: "Summit",
  role: "ceo",
  title: "General Manager",
  model: "claude-sonnet-4-6",
  capabilities: "Business analytics, client reporting, pipeline management",
  status: "idle",
  adapterType: "claude",
  adapterConfig: { model: "claude-sonnet-4-6", maxTokens: 8192 },
  budgetMonthlyCents: 70_000,
});

const vaEngineer = agents.create({
  companyId: vantage.id,
  name: "Datum",
  role: "engineer",
  title: "Data Engineer",
  model: "claude-sonnet-4-6",
  capabilities: "Python, dbt, Spark, Airflow, data pipelines, SQL",
  status: "idle",
  reportsTo: vaGm.id,
  adapterType: "claude",
  adapterConfig: { model: "claude-sonnet-4-6", maxTokens: 16384 },
  budgetMonthlyCents: 70_000,
});

const vaResearch = agents.create({
  companyId: vantage.id,
  name: "Prism",
  role: "research",
  title: "Research Analyst",
  model: "claude-haiku-4-5-20251001",
  capabilities: "Statistical analysis, report writing, data visualization",
  status: "idle",
  reportsTo: vaGm.id,
  adapterType: "claude",
  adapterConfig: { model: "claude-haiku-4-5-20251001", maxTokens: 4096 },
  budgetMonthlyCents: 40_000,
});

const vaContent = agents.create({
  companyId: vantage.id,
  name: "Slate",
  role: "content",
  title: "Technical Content Writer",
  model: "claude-haiku-4-5-20251001",
  capabilities: "Technical documentation, case studies, whitepapers",
  status: "idle",
  reportsTo: vaGm.id,
  adapterType: "claude",
  adapterConfig: { model: "claude-haiku-4-5-20251001", maxTokens: 4096 },
  budgetMonthlyCents: 20_000,
});

// ─── Stealth Startup agents (2 agents) ───────────────────────────────────────

const stFounder = agents.create({
  companyId: stealthCo.id,
  name: "Ghost",
  role: "general",
  title: "Founding Agent",
  model: "claude-opus-4-6",
  capabilities: "Full-stack development, product strategy, fundraising research",
  status: "paused",
  adapterType: "claude",
  adapterConfig: { model: "claude-opus-4-6", maxTokens: 8192 },
  budgetMonthlyCents: 60_000,
});

const stEngineer = agents.create({
  companyId: stealthCo.id,
  name: "Cipher",
  role: "engineer",
  title: "AI Infrastructure Engineer",
  model: "claude-sonnet-4-6",
  capabilities: "LLM integrations, vector databases, embeddings, inference optimization",
  status: "paused",
  reportsTo: stFounder.id,
  adapterType: "claude",
  adapterConfig: { model: "claude-sonnet-4-6", maxTokens: 16384 },
  budgetMonthlyCents: 40_000,
});

const allAgents = [
  pcCeo, pcEngineer, pcDevops, pcMarketing, pcResearch, pcContent,
  nxCeo, nxSales, nxSeo, nxEngineer,
  vaGm, vaEngineer, vaResearch, vaContent,
  stFounder, stEngineer,
];
console.log(`Created ${allAgents.length} agents.`);

// ─── Routines ─────────────────────────────────────────────────────────────────

const pcRoutines = [
  routines.create({
    companyId: paperclip.id,
    agentId: pcCeo.id,
    title: "Weekly OKR Review",
    description: "Review team OKRs, assess progress, adjust priorities, and send executive summary.",
    cronExpression: "0 9 * * 1",
    timezone: "America/New_York",
    enabled: true,
  }),
  routines.create({
    companyId: paperclip.id,
    agentId: pcEngineer.id,
    title: "Daily Code Health Check",
    description: "Run static analysis, check test coverage, scan for dependency vulnerabilities.",
    cronExpression: "0 8 * * 1-5",
    timezone: "America/New_York",
    enabled: true,
  }),
  routines.create({
    companyId: paperclip.id,
    agentId: pcDevops.id,
    title: "Infrastructure Health Monitor",
    description: "Check all services, review error rates, inspect resource utilization.",
    cronExpression: "*/30 * * * *",
    timezone: "UTC",
    enabled: true,
  }),
  routines.create({
    companyId: paperclip.id,
    agentId: pcMarketing.id,
    title: "Weekly Marketing Report",
    description: "Compile traffic, conversion, and campaign performance metrics. Draft next week's plan.",
    cronExpression: "0 10 * * 5",
    timezone: "America/New_York",
    enabled: true,
  }),
  routines.create({
    companyId: paperclip.id,
    agentId: pcResearch.id,
    title: "Competitor Intelligence Sweep",
    description: "Monitor competitor product updates, pricing changes, and press releases.",
    cronExpression: "0 7 * * 1",
    timezone: "America/New_York",
    enabled: true,
  }),
  routines.create({
    companyId: paperclip.id,
    agentId: pcContent.id,
    title: "Daily Blog Content Draft",
    description: "Draft one SEO-targeted blog post based on the current content calendar.",
    cronExpression: "0 9 * * 1-5",
    timezone: "America/New_York",
    enabled: true,
  }),
];

const nxRoutines = [
  routines.create({
    companyId: nexus.id,
    agentId: nxCeo.id,
    title: "Daily Revenue Briefing",
    description: "Summarize yesterday's revenue, top SKUs, and conversion funnel metrics.",
    cronExpression: "0 6 * * *",
    timezone: "America/Los_Angeles",
    enabled: true,
  }),
  routines.create({
    companyId: nexus.id,
    agentId: nxSales.id,
    title: "Outbound Prospecting Run",
    description: "Identify 10 new prospects, enrich data, draft personalised outreach emails.",
    cronExpression: "0 8 * * 1-5",
    timezone: "America/Los_Angeles",
    enabled: true,
  }),
  routines.create({
    companyId: nexus.id,
    agentId: nxSeo.id,
    title: "Weekly Keyword Ranking Report",
    description: "Pull keyword positions, identify drops, queue technical SEO fixes.",
    cronExpression: "0 8 * * 2",
    timezone: "America/Los_Angeles",
    enabled: true,
  }),
  routines.create({
    companyId: nexus.id,
    agentId: nxEngineer.id,
    title: "Checkout Performance Audit",
    description: "Measure checkout funnel drop-off, run Lighthouse, flag regressions.",
    cronExpression: "0 22 * * *",
    timezone: "America/Los_Angeles",
    enabled: true,
  }),
];

const vaRoutines = [
  routines.create({
    companyId: vantage.id,
    agentId: vaGm.id,
    title: "Weekly Client Report Generation",
    description: "Pull client KPIs, generate PDF report, prepare commentary draft.",
    cronExpression: "0 7 * * 5",
    timezone: "Europe/London",
    enabled: true,
  }),
  routines.create({
    companyId: vantage.id,
    agentId: vaEngineer.id,
    title: "Data Pipeline Health Check",
    description: "Verify all Airflow DAGs succeeded, check for schema drift, alert on failures.",
    cronExpression: "0 */4 * * *",
    timezone: "UTC",
    enabled: true,
  }),
];

const allRoutines = [...pcRoutines, ...nxRoutines, ...vaRoutines];
console.log(`Created ${allRoutines.length} routines.`);

// ─── Sample Issues ─────────────────────────────────────────────────────────────

const sampleIssues = [
  issues.create({
    companyId: paperclip.id,
    agentId: pcEngineer.id,
    title: "Upgrade React to v19",
    description: "Upgrade the web app from React 18 to React 19 and resolve breaking changes.",
    status: "open",
    priority: "medium",
  }),
  issues.create({
    companyId: paperclip.id,
    agentId: pcDevops.id,
    title: "Set up staging environment",
    description: "Create a staging environment mirroring production for pre-release testing.",
    status: "in_progress",
    priority: "high",
  }),
  issues.create({
    companyId: paperclip.id,
    agentId: pcMarketing.id,
    title: "Launch Product Hunt campaign",
    description: "Plan and execute Product Hunt launch. Target top 5 product of the day.",
    status: "open",
    priority: "high",
  }),
  issues.create({
    companyId: nexus.id,
    agentId: nxEngineer.id,
    title: "Fix mobile checkout crash on iOS 17",
    description: "Payment form throws JS error on Safari iOS 17. Affects ~15% of mobile users.",
    status: "in_progress",
    priority: "critical",
  }),
  issues.create({
    companyId: nexus.id,
    agentId: nxSeo.id,
    title: "Add structured data to product pages",
    description: "Implement Product schema.org JSON-LD on all product detail pages.",
    status: "open",
    priority: "medium",
  }),
  issues.create({
    companyId: vantage.id,
    agentId: vaEngineer.id,
    title: "Migrate from Redshift to BigQuery",
    description: "Plan and execute data warehouse migration. Estimate: 3 sprints.",
    status: "open",
    priority: "high",
  }),
];

console.log(`Created ${sampleIssues.length} issues.`);

// ─── Context Capsules ─────────────────────────────────────────────────────────

const capsules: Array<{ id: string; capsule: string }> = [
  {
    id: pcCeo.id,
    capsule: `IDENTITY: Atlas — Chief Executive Agent for Paperclip AI
ROLE: Strategic decision-making, OKR management, cross-team alignment
CURRENT_QUARTER: Q1 2025 — target 2x ARR growth, ship mobile app v2
KEY_PRIORITIES:
- Close Series A ($4M target) by end of Q2
- Launch enterprise tier with SSO/SCIM by March 31
- Grow MRR from $42k → $85k by June 30
TEAM_STATUS: 5 agents active; Quill (content) underperforming on output volume
CONTEXT: Product-market fit confirmed in knowledge worker segment. Churn < 3%.`,
  },
  {
    id: pcEngineer.id,
    capsule: `IDENTITY: Forge — Lead Software Engineer for Paperclip AI
STACK: TypeScript (Next.js 16 + Hono), PostgreSQL, Docker, Vercel
CURRENT_SPRINT: Sprint 14 — context capsule system + agent chaining
ACTIVE_BRANCHES: feat/context-capsule, feat/agent-chain-v2
KNOWN_ISSUES:
- N+1 query on /api/companies/:id/agents — needs dataloader
- WebSocket reconnect drops first 2 log lines on mobile Safari
LAST_MERGED: feat/run-outputs schema (2025-03-28)
CONVENTIONS: Conventional commits, all endpoints require Zod validators`,
  },
  {
    id: nxSeo.id,
    capsule: `IDENTITY: Beacon — SEO Specialist for Nexus Commerce
CURRENT_FOCUS: Technical SEO audit + schema markup rollout
TOP_KEYWORDS_TRACKED: "e-commerce automation" (pos 14), "shopify growth tools" (pos 8)
RECENT_WINS: Core Web Vitals LCP improved from 3.2s → 1.8s after image CDN migration
PENDING_TASKS:
- Add Product + BreadcrumbList JSON-LD to 340 product pages
- Fix 127 broken internal links found in Screaming Frog crawl
- Submit updated sitemap (12,483 URLs) to GSC`,
  },
  {
    id: vaEngineer.id,
    capsule: `IDENTITY: Datum — Data Engineer for Vantage Analytics
STACK: Python, dbt (v1.7), Airflow 2.8, BigQuery (migration in progress)
MIGRATION_STATUS: 60% tables migrated from Redshift to BigQuery; completion ETA April 15
CURRENT_DAGS: 14 active (2 paused for migration), 0 SLA breaches last 30 days
SCHEMA_CHANGES_PENDING:
- events table: add session_id column (blocked on Redshift→BQ cutover)
- metrics_daily: add p95_latency field (PR open, needs review)
DATA_QUALITY: 3 anomaly alerts last week — all resolved (upstream API rate limits)`,
  },
];

const ts = new Date().toISOString();
for (const { id: agentId, capsule } of capsules) {
  db.run(`UPDATE agents SET context_capsule = ?, updated_at = ? WHERE id = ?`, [capsule, ts, agentId]);
}
console.log(`Seeded ${capsules.length} context capsules.`);

console.log("\nSeed complete.");
console.log("Summary:");
console.log(`  Companies : 4`);
console.log(`  Agents    : ${allAgents.length}`);
console.log(`  Routines  : ${allRoutines.length}`);
console.log(`  Issues    : ${sampleIssues.length}`);

db.close()

