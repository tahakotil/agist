import { Hono } from 'hono';

export type SSEEventType =
  | 'agent.status'
  | 'run.completed'
  | 'run.started'
  | 'issue.created'
  | 'issue.updated'
  | 'signal.created'
  | 'heartbeat';

export interface SSEEvent {
  type: SSEEventType;
  data: Record<string, unknown>;
}

type SSESubscriber = (event: SSEEvent) => void;

const subscribers = new Set<SSESubscriber>();

export function broadcast(event: SSEEvent): void {
  for (const sub of subscribers) {
    try {
      sub(event);
    } catch {
      // Subscriber disconnected, will be cleaned up on next tick
    }
  }
}

export function subscribe(fn: SSESubscriber): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

export const sseRouter = new Hono();

sseRouter.get('/api/events', (c) => {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  let eventId = 0;
  let closed = false;

  const writeSSE = async (
    event: string,
    data: string,
    id?: string
  ): Promise<void> => {
    if (closed) return;
    try {
      const idLine = id !== undefined ? `id: ${id}\n` : '';
      const payload = `${idLine}event: ${event}\ndata: ${data}\n\n`;
      await writer.write(encoder.encode(payload));
    } catch {
      closed = true;
    }
  };

  const close = () => {
    if (closed) return;
    closed = true;
    unsubscribe();
    clearInterval(heartbeatTimer);
    writer.close().catch(() => undefined);
  };

  const unsubscribe = subscribe((event) => {
    writeSSE(event.type, JSON.stringify(event.data), String(eventId++)).catch(
      () => {
        close();
      }
    );
  });

  // Initial heartbeat
  writeSSE('heartbeat', JSON.stringify({ ts: new Date().toISOString() }), String(eventId++)).catch(() => undefined);

  // Periodic heartbeat every 30s
  const heartbeatTimer = setInterval(() => {
    writeSSE('heartbeat', JSON.stringify({ ts: new Date().toISOString() }), String(eventId++)).catch(
      () => {
        close();
      }
    );
  }, 30_000);

  // Detect client disconnect via request abort signal
  const signal = c.req.raw.signal;
  if (signal) {
    signal.addEventListener('abort', () => {
      close();
    });
  }

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
});
