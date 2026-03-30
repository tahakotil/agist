import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { serve } from '@hono/node-server';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import { ZodError } from 'zod';

import { logger } from './logger.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { incHttpRequest } from './metrics.js';
import { initDb, shutdownDb } from './db.js';
import { healthRouter } from './routes/health.js';
import { companiesRouter } from './routes/companies.js';
import { agentsRouter } from './routes/agents.js';
import { routinesRouter } from './routes/routines.js';
import { runsRouter } from './routes/runs.js';
import { issuesRouter } from './routes/issues.js';
import { openapiRouter } from './routes/openapi.js';
import { apiKeysRouter } from './routes/api-keys.js';
import { metricsRouter } from './routes/metrics.js';
import { projectsRouter } from './routes/projects.js';
import { webhooksRouter } from './routes/webhooks.js';
import { workspaceRouter } from './routes/workspace.js';
import { signalsRouter } from './routes/signals.js';
import { outputsRouter } from './routes/outputs.js';
import { sseRouter } from './sse.js';
import { initWebSocketServer, handleUpgrade, closeAllConnections } from './ws.js';
import { startScheduler, initializeNextRunAts, stopScheduler } from './scheduler.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimit } from './middleware/rate-limit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = parseInt(process.env.PORT ?? '4400', 10);

const app = new Hono();

// ── CORS ─────────────────────────────────────────────────────────────────────
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim())
  : [
      'http://localhost:3004',
      'http://localhost:3000',
      'http://localhost:4400',
      'http://127.0.0.1:3004',
      'http://127.0.0.1:3000',
    ];

app.use(
  '/api/*',
  cors({
    origin: corsOrigins,
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Api-Key'],
    maxAge: 86400,
    credentials: true,
  })
);

// ── Request-ID middleware ─────────────────────────────────────────────────────
app.use('*', requestIdMiddleware());

// ── Structured request logging ────────────────────────────────────────────────
app.use('/api/*', async (c, next) => {
  const start = Date.now()
  await next()
  const ms = Date.now() - start
  const requestId = (c.get as (key: string) => string | undefined)('requestId')
  logger.info('request', {
    requestId,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs: ms,
  })
  incHttpRequest(c.req.method, c.req.path, c.res.status, ms)
})

// ── Authentication ────────────────────────────────────────────────────────────
app.use('/api/*', authMiddleware());

// ── Rate limiting (mutating endpoints) ───────────────────────────────────────
// 60 write requests per minute per API key / IP
app.use('/api/*', rateLimit({ max: 60, windowMs: 60_000 }));

// Routes
app.route('/', healthRouter);
app.route('/', companiesRouter);
app.route('/', agentsRouter);
app.route('/', routinesRouter);
app.route('/', runsRouter);
app.route('/', issuesRouter);
app.route('/', projectsRouter);
app.route('/', openapiRouter);
app.route('/', apiKeysRouter);
app.route('/', metricsRouter);
app.route('/', webhooksRouter);
app.route('/', workspaceRouter);
app.route('/', signalsRouter);
app.route('/', outputsRouter);
app.route('/', sseRouter);

// Serve static files from web build if available (production)
const webOutDir = join(__dirname, '..', '..', 'web', 'out');
if (existsSync(webOutDir)) {
  app.use(
    '/*',
    serveStatic({
      root: join('..', 'web', 'out'),
    })
  );
  logger.info('Serving static files', { path: webOutDir });
}

// Global error handler
app.onError((err, c) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  if (err instanceof ZodError) {
    return c.json({ error: 'Validation error', details: err.errors }, 400);
  }
  return c.json({ error: 'Internal server error' }, 500);
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found', path: c.req.path }, 404);
});

async function main() {
  // Initialize database (sql.js async init)
  await initDb();

  // Initialize WebSocket server
  initWebSocketServer();

  // Initialize scheduler
  initializeNextRunAts();
  startScheduler();

  // Start HTTP server
  const server = serve(
    {
      fetch: app.fetch,
      port: PORT,
    },
    (info) => {
      logger.info('HTTP server listening', { url: `http://localhost:${info.port}` });
      logger.info('WebSocket available', { url: `ws://localhost:${info.port}/ws` });
      logger.info('SSE events available', { url: `http://localhost:${info.port}/api/events` });
      logger.info('Prometheus metrics available', { url: `http://localhost:${info.port}/api/metrics` });
    }
  );

  // Attach WebSocket upgrade handler
  server.on(
    'upgrade',
    (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      const url = request.url ?? '';
      if (url === '/ws' || url.startsWith('/ws?')) {
        handleUpgrade(request, socket, head);
      } else {
        socket.destroy();
      }
    }
  );

  // Graceful shutdown handler
  async function shutdown(signal: string): Promise<void> {
    logger.info('Shutting down gracefully', { signal });

    // 1. Stop the scheduler (no new runs)
    stopScheduler();

    // 2. Close all WebSocket connections
    closeAllConnections();

    // 3. Stop auto-save interval and do final DB save before exit
    try {
      shutdownDb();
      logger.info('Database saved');
    } catch (err) {
      logger.error('Failed to save DB on shutdown', { error: String(err) });
    }

    // 4. Close the HTTP server
    server.close((err) => {
      if (err) {
        logger.error('HTTP server close error', { error: String(err) });
        process.exit(1);
      }
      logger.info('HTTP server closed. Goodbye.');
      process.exit(0);
    });

    // Force exit after 10 seconds if graceful shutdown stalls
    setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 10_000).unref();
  }

  process.on('SIGTERM', () => { shutdown('SIGTERM').catch((err: unknown) => logger.error('Shutdown error', { error: String(err) })); });
  process.on('SIGINT', () => { shutdown('SIGINT').catch((err: unknown) => logger.error('Shutdown error', { error: String(err) })); });
}

main().catch((err: unknown) => {
  logger.error('Fatal startup error', { error: String(err) });
  process.exit(1);
});

export default app;
