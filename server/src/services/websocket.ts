import type { WebSocket } from 'ws';
import type { SocketStream } from '@fastify/websocket';
import type { WsMessage, EventItem, SessionSummary, Stats } from '../types/index.js';

class WebSocketBroadcaster {
  private clients: Set<WebSocket> = new Set();

  addClient(connection: SocketStream): void {
    const socket = connection.socket;
    this.clients.add(socket);
    console.log(`[WS] Client connected. Total clients: ${this.clients.size}`);

    socket.on('close', () => {
      this.clients.delete(socket);
      console.log(`[WS] Client disconnected. Total clients: ${this.clients.size}`);
    });

    socket.on('error', (error: Error) => {
      console.error('[WS] Client error:', error);
      this.clients.delete(socket);
    });
  }

  broadcast(message: WsMessage): void {
    const data = JSON.stringify(message);
    let sent = 0;

    for (const client of this.clients) {
      if (client.readyState === 1) { // WebSocket.OPEN
        try {
          client.send(data);
          sent++;
        } catch (error) {
          console.error('[WS] Error sending message:', error);
          this.clients.delete(client);
        }
      }
    }

    if (sent > 0) {
      console.log(`[WS] Broadcast ${message.type} to ${sent} clients`);
    }
  }

  broadcastEvent(event: EventItem): void {
    this.broadcast({ type: 'event', payload: event });
  }

  broadcastSessionStart(session: SessionSummary): void {
    this.broadcast({ type: 'session_start', payload: session });
  }

  broadcastSessionEnd(session: SessionSummary): void {
    this.broadcast({ type: 'session_end', payload: session });
  }

  broadcastStats(stats: Stats): void {
    this.broadcast({ type: 'stats_update', payload: stats });
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

export const wsBroadcaster = new WebSocketBroadcaster();
