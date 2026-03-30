export interface AgentTemplate {
  name: string
  role: string
  model: string
  adapterType: string
}

export interface CompanyTemplate {
  name: string
  description: string
  agents: AgentTemplate[]
}

export type TemplateName =
  | 'saas-monitoring'
  | 'content-agency'
  | 'solo-founder'
  | 'empty'

export const TEMPLATES: Record<TemplateName, CompanyTemplate> = {
  'saas-monitoring': {
    name: 'SaaS Monitoring Team',
    description: 'Automated monitoring and alerting for a SaaS product',
    agents: [
      {
        name: 'devops-monitor',
        role: 'monitors server health, uptime, and deployment status',
        model: 'claude-haiku-4-5',
        adapterType: 'mock',
      },
      {
        name: 'error-tracker',
        role: 'scans error logs and triages issues by severity',
        model: 'claude-haiku-4-5',
        adapterType: 'mock',
      },
      {
        name: 'cost-analyst',
        role: 'tracks API costs, usage trends, and budget alerts',
        model: 'claude-haiku-4-5',
        adapterType: 'mock',
      },
    ],
  },

  'content-agency': {
    name: 'Content Agency',
    description: 'Multi-agent content production and publishing pipeline',
    agents: [
      {
        name: 'researcher',
        role: 'researches topics, gathers facts, and summarizes sources',
        model: 'claude-sonnet-4-5',
        adapterType: 'mock',
      },
      {
        name: 'writer',
        role: 'writes blog posts, landing pages, and marketing copy',
        model: 'claude-sonnet-4-5',
        adapterType: 'mock',
      },
      {
        name: 'seo-optimizer',
        role: 'optimizes content for search engines and adds meta tags',
        model: 'claude-haiku-4-5',
        adapterType: 'mock',
      },
      {
        name: 'publisher',
        role: 'publishes approved content and distributes to channels',
        model: 'claude-haiku-4-5',
        adapterType: 'mock',
      },
    ],
  },

  'solo-founder': {
    name: 'Solo Founder Stack',
    description: 'Lean agent team to help a solo founder run a startup',
    agents: [
      {
        name: 'product-agent',
        role: 'manages feature backlog, writes specs, and tracks metrics',
        model: 'claude-sonnet-4-5',
        adapterType: 'mock',
      },
      {
        name: 'growth-agent',
        role: 'handles SEO, social media, and outreach campaigns',
        model: 'claude-haiku-4-5',
        adapterType: 'mock',
      },
      {
        name: 'support-agent',
        role: 'responds to user issues, triages bugs, and writes FAQs',
        model: 'claude-haiku-4-5',
        adapterType: 'mock',
      },
    ],
  },

  empty: {
    name: 'My First Team',
    description: 'Empty team — add agents from the dashboard',
    agents: [],
  },
}

export const TEMPLATE_CHOICES: Array<{ title: string; value: TemplateName | 'none'; description: string }> = [
  {
    title: 'None (skip)',
    value: 'none',
    description: 'Start with a blank platform',
  },
  {
    title: 'SaaS Monitoring',
    value: 'saas-monitoring',
    description: '3 agents: DevOps monitor, error tracker, cost analyst',
  },
  {
    title: 'Content Agency',
    value: 'content-agency',
    description: '4 agents: researcher, writer, SEO optimizer, publisher',
  },
  {
    title: 'Solo Founder',
    value: 'solo-founder',
    description: '3 agents: product, growth, support',
  },
  {
    title: 'Empty Team',
    value: 'empty',
    description: 'Create a company with no agents',
  },
]
