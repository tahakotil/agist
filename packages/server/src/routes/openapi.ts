import { Hono } from 'hono';

export const openapiRouter = new Hono();

const SPEC = {
  openapi: '3.1.0',
  info: {
    title: 'Agist API',
    version: '0.1.0',
    description: 'Open-source AI agent orchestration platform API',
  },
  servers: [
    { url: 'http://localhost:4400/api', description: 'Local development' },
  ],
  components: {
    schemas: {
      Pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 20 },
          total: { type: 'integer', example: 100 },
          totalPages: { type: 'integer', example: 5 },
        },
        required: ['page', 'limit', 'total', 'totalPages'],
      },
      Company: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string', enum: ['active', 'paused', 'archived'] },
          budgetMonthlyCents: { type: 'integer' },
          spentMonthlyCents: { type: 'integer' },
          agentCount: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Agent: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          companyId: { type: 'string' },
          companyName: { type: 'string' },
          name: { type: 'string' },
          role: { type: 'string' },
          title: { type: 'string' },
          model: { type: 'string' },
          capabilities: { type: 'array', items: { type: 'string' } },
          status: { type: 'string', enum: ['idle', 'running', 'paused', 'error'] },
          reportsTo: { type: 'string', nullable: true },
          adapterType: { type: 'string' },
          adapterConfig: { type: 'object' },
          workingDirectory: { type: 'string', nullable: true },
          budgetMonthlyCents: { type: 'integer' },
          spentMonthlyCents: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Run: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          agentId: { type: 'string' },
          agentName: { type: 'string' },
          companyId: { type: 'string' },
          companyName: { type: 'string' },
          routineId: { type: 'string', nullable: true },
          status: { type: 'string', enum: ['queued', 'running', 'completed', 'failed', 'timeout', 'cancelled'] },
          model: { type: 'string' },
          source: { type: 'string', enum: ['manual', 'routine', 'schedule', 'event'] },
          startedAt: { type: 'string', format: 'date-time', nullable: true },
          finishedAt: { type: 'string', format: 'date-time', nullable: true },
          exitCode: { type: 'integer', nullable: true },
          error: { type: 'string', nullable: true },
          tokenInput: { type: 'integer' },
          tokenOutput: { type: 'integer' },
          cost: { type: 'number' },
          costCents: { type: 'integer' },
          durationMs: { type: 'integer' },
          logExcerpt: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Routine: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          companyId: { type: 'string' },
          agentId: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          cronExpression: { type: 'string', example: '0 9 * * *' },
          timezone: { type: 'string', example: 'UTC' },
          enabled: { type: 'boolean' },
          lastRunAt: { type: 'string', format: 'date-time', nullable: true },
          nextRunAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Issue: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          companyId: { type: 'string' },
          projectId: { type: 'string', nullable: true },
          agentId: { type: 'string', nullable: true },
          title: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string', enum: ['open', 'in_progress', 'resolved', 'closed', 'wont_fix'] },
          priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
        },
        required: ['error'],
      },
    },
    parameters: {
      page: {
        name: 'page',
        in: 'query',
        schema: { type: 'integer', minimum: 1, default: 1 },
        description: '1-based page number',
      },
      limit: {
        name: 'limit',
        in: 'query',
        schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        description: 'Items per page (max 100)',
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        operationId: 'getHealth',
        responses: {
          '200': {
            description: 'Server is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['ok', 'degraded'] },
                    version: { type: 'string' },
                    ts: { type: 'string', format: 'date-time' },
                    db: { type: 'string', enum: ['ok', 'error'] },
                  },
                },
              },
            },
          },
          '503': { description: 'Database unavailable' },
        },
      },
    },
    '/dashboard/stats': {
      get: {
        tags: ['System'],
        summary: 'Dashboard KPI stats',
        operationId: 'getDashboardStats',
        responses: {
          '200': {
            description: 'Dashboard stats',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    totalAgents: { type: 'integer' },
                    runningNow: { type: 'integer' },
                    successRate24h: { type: 'number', nullable: true },
                    costToday: { type: 'number' },
                  },
                },
              },
            },
          },
          '500': { $ref: '#/components/schemas/Error' },
        },
      },
    },
    '/companies': {
      get: {
        tags: ['Companies'],
        summary: 'List companies',
        operationId: 'listCompanies',
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Filter by name (case-insensitive)' },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'paused', 'archived'] } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['name', 'createdAt'], default: 'createdAt' } },
        ],
        responses: {
          '200': {
            description: 'Paginated company list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    companies: { type: 'array', items: { $ref: '#/components/schemas/Company' } },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Companies'],
        summary: 'Create company',
        operationId: 'createCompany',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 200 },
                  description: { type: 'string', maxLength: 2000 },
                  budgetMonthlyCents: { type: 'integer', minimum: 0 },
                  status: { type: 'string', enum: ['active', 'paused', 'archived'] },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Created',
            content: { 'application/json': { schema: { type: 'object', properties: { company: { $ref: '#/components/schemas/Company' } } } } },
          },
          '400': { description: 'Validation error' },
          '403': { description: 'Admin access required' },
        },
      },
    },
    '/companies/{id}': {
      get: {
        tags: ['Companies'],
        summary: 'Get company',
        operationId: 'getCompany',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { content: { 'application/json': { schema: { type: 'object', properties: { company: { $ref: '#/components/schemas/Company' } } } } } },
          '404': { description: 'Not found' },
        },
      },
      patch: {
        tags: ['Companies'],
        summary: 'Update company',
        operationId: 'updateCompany',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  status: { type: 'string', enum: ['active', 'paused', 'archived'] },
                  budgetMonthlyCents: { type: 'integer' },
                },
              },
            },
          },
        },
        responses: {
          '200': { content: { 'application/json': { schema: { type: 'object', properties: { company: { $ref: '#/components/schemas/Company' } } } } } },
          '403': { description: 'Admin access required' },
          '404': { description: 'Not found' },
        },
      },
      delete: {
        tags: ['Companies'],
        summary: 'Delete company',
        operationId: 'deleteCompany',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Deleted' },
          '403': { description: 'Admin access required' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/agents': {
      get: {
        tags: ['Agents'],
        summary: 'List all agents across all companies',
        operationId: 'listAgents',
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['idle', 'running', 'paused', 'error'] } },
          { name: 'model', in: 'query', schema: { type: 'string' } },
          { name: 'role', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Filter by name' },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['name', 'status', 'createdAt'], default: 'createdAt' } },
        ],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    agents: { type: 'array', items: { $ref: '#/components/schemas/Agent' } },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/companies/{companyId}/agents': {
      get: {
        tags: ['Agents'],
        summary: 'List agents for a company',
        operationId: 'listCompanyAgents',
        parameters: [
          { name: 'companyId', in: 'path', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['idle', 'running', 'paused', 'error'] } },
          { name: 'model', in: 'query', schema: { type: 'string' } },
          { name: 'role', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['name', 'status', 'createdAt'], default: 'createdAt' } },
        ],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    agents: { type: 'array', items: { $ref: '#/components/schemas/Agent' } },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
          '404': { description: 'Company not found' },
        },
      },
      post: {
        tags: ['Agents'],
        summary: 'Create agent',
        operationId: 'createAgent',
        parameters: [{ name: 'companyId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string' },
                  role: { type: 'string' },
                  title: { type: 'string' },
                  model: { type: 'string' },
                  capabilities: { type: 'array', items: { type: 'string' } },
                  workingDirectory: { type: 'string', nullable: true },
                  budgetMonthlyCents: { type: 'integer' },
                },
              },
            },
          },
        },
        responses: {
          '201': { content: { 'application/json': { schema: { type: 'object', properties: { agent: { $ref: '#/components/schemas/Agent' } } } } } },
          '400': { description: 'Validation error' },
          '404': { description: 'Company not found' },
        },
      },
    },
    '/agents/{id}': {
      get: {
        tags: ['Agents'],
        summary: 'Get agent',
        operationId: 'getAgent',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { content: { 'application/json': { schema: { type: 'object', properties: { agent: { $ref: '#/components/schemas/Agent' } } } } } },
          '404': { description: 'Not found' },
        },
      },
      patch: {
        tags: ['Agents'],
        summary: 'Update agent',
        operationId: 'updateAgent',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  role: { type: 'string' },
                  title: { type: 'string' },
                  model: { type: 'string' },
                  status: { type: 'string', enum: ['idle', 'running', 'paused', 'error'] },
                  workingDirectory: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        responses: {
          '200': { content: { 'application/json': { schema: { type: 'object', properties: { agent: { $ref: '#/components/schemas/Agent' } } } } } },
          '404': { description: 'Not found' },
        },
      },
      delete: {
        tags: ['Agents'],
        summary: 'Delete agent',
        operationId: 'deleteAgent',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Deleted' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/agents/{id}/wake': {
      post: {
        tags: ['Agents'],
        summary: 'Wake (manually trigger) an agent',
        operationId: 'wakeAgent',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { prompt: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          '202': { description: 'Run queued' },
          '404': { description: 'Not found' },
          '409': { description: 'Agent already running' },
          '429': { description: 'Rate limit: too many wake requests' },
        },
      },
    },
    '/agents/{id}/runs': {
      get: {
        tags: ['Runs'],
        summary: 'List runs for an agent',
        operationId: 'listAgentRuns',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['queued', 'running', 'completed', 'failed', 'timeout', 'cancelled'] } },
          { name: 'source', in: 'query', schema: { type: 'string', enum: ['manual', 'routine', 'schedule', 'event'] } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Filter startedAt >= this date' },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Filter startedAt <= this date' },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['startedAt', 'cost', 'durationMs'], default: 'startedAt' } },
        ],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    runs: { type: 'array', items: { $ref: '#/components/schemas/Run' } },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
          '404': { description: 'Agent not found' },
        },
      },
      delete: {
        tags: ['Runs'],
        summary: 'Bulk delete runs for an agent',
        operationId: 'deleteAgentRuns',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'olderThan', in: 'query', schema: { type: 'string', pattern: '^\\d+d$' }, description: 'Delete runs older than N days (e.g. "30d")' },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['queued', 'running', 'completed', 'failed', 'timeout', 'cancelled'] }, description: 'Only delete runs with this status' },
        ],
        responses: {
          '200': {
            description: 'Number of deleted runs',
            content: { 'application/json': { schema: { type: 'object', properties: { deleted: { type: 'integer' } } } } },
          },
          '400': { description: 'Invalid olderThan format' },
          '404': { description: 'Agent not found' },
        },
      },
    },
    '/runs': {
      get: {
        tags: ['Runs'],
        summary: 'List all runs (paginated)',
        operationId: 'listRuns',
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['queued', 'running', 'completed', 'failed', 'timeout', 'cancelled'] } },
          { name: 'source', in: 'query', schema: { type: 'string', enum: ['manual', 'routine', 'schedule', 'event'] } },
          { name: 'agentId', in: 'query', schema: { type: 'string' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['startedAt', 'cost', 'durationMs'], default: 'startedAt' } },
        ],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    runs: { type: 'array', items: { $ref: '#/components/schemas/Run' } },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/runs/recent': {
      get: {
        tags: ['Runs'],
        summary: 'Get recent runs (alias, no pagination)',
        operationId: 'getRecentRuns',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { runs: { type: 'array', items: { $ref: '#/components/schemas/Run' } } },
                },
              },
            },
          },
        },
      },
    },
    '/runs/{id}': {
      get: {
        tags: ['Runs'],
        summary: 'Get run detail',
        operationId: 'getRun',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { content: { 'application/json': { schema: { type: 'object', properties: { run: { $ref: '#/components/schemas/Run' } } } } } },
          '404': { description: 'Not found' },
        },
      },
    },
    '/routines': {
      get: {
        tags: ['Routines'],
        summary: 'List all routines (global)',
        operationId: 'listRoutines',
        parameters: [
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
          { name: 'enabled', in: 'query', schema: { type: 'boolean' } },
          { name: 'agentId', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    routines: { type: 'array', items: { $ref: '#/components/schemas/Routine' } },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/companies/{companyId}/routines': {
      get: {
        tags: ['Routines'],
        summary: 'List routines for a company',
        operationId: 'listCompanyRoutines',
        parameters: [
          { name: 'companyId', in: 'path', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
          { name: 'enabled', in: 'query', schema: { type: 'boolean' } },
          { name: 'agentId', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    routines: { type: 'array', items: { $ref: '#/components/schemas/Routine' } },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
          '404': { description: 'Company not found' },
        },
      },
      post: {
        tags: ['Routines'],
        summary: 'Create routine',
        operationId: 'createRoutine',
        parameters: [{ name: 'companyId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['agentId', 'title', 'cronExpression'],
                properties: {
                  agentId: { type: 'string' },
                  title: { type: 'string' },
                  description: { type: 'string' },
                  cronExpression: { type: 'string', example: '0 9 * * *' },
                  timezone: { type: 'string', example: 'UTC' },
                  enabled: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          '201': { content: { 'application/json': { schema: { type: 'object', properties: { routine: { $ref: '#/components/schemas/Routine' } } } } } },
          '404': { description: 'Company or agent not found' },
          '422': { description: 'Invalid cron expression' },
        },
      },
    },
    '/routines/{id}': {
      patch: {
        tags: ['Routines'],
        summary: 'Update routine',
        operationId: 'updateRoutine',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  cronExpression: { type: 'string' },
                  timezone: { type: 'string' },
                  enabled: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          '200': { content: { 'application/json': { schema: { type: 'object', properties: { routine: { $ref: '#/components/schemas/Routine' } } } } } },
          '404': { description: 'Not found' },
          '422': { description: 'Invalid cron expression' },
        },
      },
      delete: {
        tags: ['Routines'],
        summary: 'Delete routine',
        operationId: 'deleteRoutine',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Deleted' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/companies/{companyId}/issues': {
      get: {
        tags: ['Issues'],
        summary: 'List issues for a company',
        operationId: 'listCompanyIssues',
        parameters: [
          { name: 'companyId', in: 'path', required: true, schema: { type: 'string' } },
          { $ref: '#/components/parameters/page' },
          { $ref: '#/components/parameters/limit' },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['open', 'in_progress', 'resolved', 'closed', 'wont_fix'] } },
          { name: 'priority', in: 'query', schema: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] } },
          { name: 'agentId', in: 'query', schema: { type: 'string' } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['priority', 'createdAt', 'status'], default: 'priority' } },
        ],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    issues: { type: 'array', items: { $ref: '#/components/schemas/Issue' } },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
          '404': { description: 'Company not found' },
        },
      },
      post: {
        tags: ['Issues'],
        summary: 'Create issue',
        operationId: 'createIssue',
        parameters: [{ name: 'companyId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title'],
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  status: { type: 'string', enum: ['open', 'in_progress', 'resolved', 'closed', 'wont_fix'] },
                  priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
                  agentId: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        responses: {
          '201': { content: { 'application/json': { schema: { type: 'object', properties: { issue: { $ref: '#/components/schemas/Issue' } } } } } },
          '404': { description: 'Company not found' },
        },
      },
    },
    '/issues/{id}': {
      get: {
        tags: ['Issues'],
        summary: 'Get issue',
        operationId: 'getIssue',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { content: { 'application/json': { schema: { type: 'object', properties: { issue: { $ref: '#/components/schemas/Issue' } } } } } },
          '404': { description: 'Not found' },
        },
      },
      patch: {
        tags: ['Issues'],
        summary: 'Update issue',
        operationId: 'updateIssue',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  status: { type: 'string', enum: ['open', 'in_progress', 'resolved', 'closed', 'wont_fix'] },
                  priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
                  agentId: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        responses: {
          '200': { content: { 'application/json': { schema: { type: 'object', properties: { issue: { $ref: '#/components/schemas/Issue' } } } } } },
          '404': { description: 'Not found' },
        },
      },
      delete: {
        tags: ['Issues'],
        summary: 'Delete issue',
        operationId: 'deleteIssue',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Deleted' },
          '404': { description: 'Not found' },
        },
      },
    },
  },
};

// GET /api/openapi.json
openapiRouter.get('/api/openapi.json', (c) => {
  return c.json(SPEC);
});

// GET /api/docs — Swagger UI
openapiRouter.get('/api/docs', (c) => {
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Agist API Docs</title>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" >
</head>
<body>
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"> </script>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"> </script>
<script>
window.onload = function() {
  const ui = SwaggerUIBundle({
    url: "/api/openapi.json",
    dom_id: '#swagger-ui',
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    layout: "StandaloneLayout"
  })
  window.ui = ui
}
</script>
</body>
</html>`;
  return c.html(html);
});
