import { useEffect, useRef, useCallback } from 'react';
import type { WsMessage, EventItem, Stats } from '@/types';
import { useEventStore } from '@/stores/eventStore';

const WS_URL = `ws://${window.location.hostname}:3456/ws`;
const RECONNECT_DELAY = 3000;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { addEvent, setStats, setConnected } = useEventStore();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    console.log('[WS] Connecting to', WS_URL);
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log('[WS] Connected');
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WsMessage;

        switch (message.type) {
          case 'event':
            addEvent(message.payload as EventItem);
            break;
          case 'stats_update':
            setStats(message.payload as Stats);
            break;
          case 'session_start':
          case 'session_end':
            // Could trigger session list refresh
            break;
        }
      } catch (error) {
        console.error('[WS] Error parsing message:', error);
      }
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected');
      setConnected(false);
      wsRef.current = null;

      // Attempt to reconnect
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, RECONNECT_DELAY);
    };

    ws.onerror = (error) => {
      console.error('[WS] Error:', error);
    };

    wsRef.current = ws;
  }, [addEvent, setStats, setConnected]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return wsRef.current;
}
