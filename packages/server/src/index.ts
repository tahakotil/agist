import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStatic } from '@hono/node-server/serve-static';
import { serve } from '@hono/node-server';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';

import { initDb } from './db.js';
import { healthRouter } from './routes/health.js';
import { companiesRouter } from './routes/companies.js';
import { agentsRouter } from './routes/agents.js';
import { routinesRouter } from './routes/routines.js';
import { runsRouter } from './routes/runs.js';
import { issuesRouter } from './routes/issues.js';
import { sseRouter } from './sse.js';
import { initWebSocketServer, handleUpgrade } from './ws.js';
import { startScheduler, initializeNextRunAts } from './scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = parseInt(process.env.PORT ?? '4400', 10);

const app = new Hono();

// Middleware
app.use(
  '*',
  cors({
    origin: [
      'http://localhost:3004',
      'http://localhost:3000',
      'http://localhost:4400',
      'http://127.0.0.1:3004',
      'http://127.0.0.1:3000',
    ],
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

app.use('*', logger());

// Routes
app.route('/', healthRouter);
app.route('/', companiesRouter);
app.route('/', agentsRouter);
app.route('/', routinesRouter);
app.route('/', runsRouter);
app.route('/', issuesRouter);
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
  console.log(`[server] Serving static files from ${webOutDir}`);
}

// Global error handler
app.onError((err, c) => {
  console.error('[server] Unhandled error:', err);
  return c.json(
    {
      error: 'Internal server error',
      message: err.message,
    },
    500
  );
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
      console.log(`[server] HTTP server listening on http://localhost:${info.port}`);
      console.log(`[server] WebSocket available at ws://localhost:${info.port}/ws`);
      console.log(`[server] SSE events at http://localhost:${info.port}/api/events`);
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
}

main().catch((err: unknown) => {
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});

export default app;
