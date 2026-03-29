import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';

interface SubscribeMessage {
  type: 'subscribe';
  agentId: string;
}

interface UnsubscribeMessage {
  type: 'unsubscribe';
  agentId: string;
}

type ClientMessage = SubscribeMessage | UnsubscribeMessage;

export interface LogLine {
  type: 'log';
  runId: string;
  line: string;
  timestamp: string;
}

export interface StatusChange {
  type: 'status';
  agentId: string;
  status: string;
  runId?: string;
}

export type WSPush = LogLine | StatusChange;

// Map of agentId -> Set of WebSocket clients
const agentSubscriptions = new Map<string, Set<WebSocket>>();
// Map of WebSocket -> Set of agentIds it's subscribed to
const clientSubscriptions = new Map<WebSocket, Set<string>>();

export let wss: WebSocketServer;

export function initWebSocketServer(): WebSocketServer {
  wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws: WebSocket) => {
    clientSubscriptions.set(ws, new Set());

    ws.on('message', (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        return;
      }

      if (msg.type === 'subscribe' && msg.agentId) {
        const agentId = msg.agentId;

        if (!agentSubscriptions.has(agentId)) {
          agentSubscriptions.set(agentId, new Set());
        }
        agentSubscriptions.get(agentId)!.add(ws);
        clientSubscriptions.get(ws)!.add(agentId);

        ws.send(
          JSON.stringify({
            type: 'subscribed',
            agentId,
            ts: new Date().toISOString(),
          })
        );
      } else if (msg.type === 'unsubscribe' && msg.agentId) {
        const agentId = msg.agentId;
        agentSubscriptions.get(agentId)?.delete(ws);
        clientSubscriptions.get(ws)?.delete(agentId);
      }
    });

    ws.on('close', () => {
      const subs = clientSubscriptions.get(ws);
      if (subs) {
        for (const agentId of subs) {
          agentSubscriptions.get(agentId)?.delete(ws);
        }
      }
      clientSubscriptions.delete(ws);
    });

    ws.on('error', () => {
      // Connection errors — clean up handled by 'close'
    });

    // Ping to keep connection alive
    ws.send(JSON.stringify({ type: 'connected', ts: new Date().toISOString() }));
  });

  return wss;
}

export function pushToAgent(agentId: string, payload: WSPush): void {
  const clients = agentSubscriptions.get(agentId);
  if (!clients || clients.size === 0) return;

  const message = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(message);
      } catch {
        // Client gone
      }
    }
  }
}

export function handleUpgrade(
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer
): void {
  if (!wss) return;
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
}
