export interface AgistTemplate {
  version: '1.0';
  name: string;
  description: string;
  author?: string;
  url?: string;
  company: {
    name: string;
    description?: string;
    budget_monthly_cents?: number;
  };
  agents: TemplateAgent[];
  routines: TemplateRoutine[];
}

export interface TemplateAgent {
  slug: string;
  name: string;
  role: string;
  title?: string;
  model: string;
  capabilities?: string;
  reports_to?: string;
  budget_monthly_cents?: number;
  context_capsule?: string;
}

export interface TemplateRoutine {
  agent_slug: string;
  title: string;
  cron_expression: string;
  timezone?: string;
}
