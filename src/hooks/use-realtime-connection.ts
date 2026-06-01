"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "offline";

export interface RealtimeEvent {
  type: string;
  [key: string]: unknown;
}

export interface UseRealtimeConnectionOptions {
  url?: string;
  onEvent?: (event: RealtimeEvent) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export function useRealtimeConnection(options: UseRealtimeConnectionOptions = {}) {
  const {
    url = "/api/chat/realtime",
    onEvent,
    onStatusChange,
    reconnectInterval = 5000,
    maxReconnectAttempts = 5,
  } = options;

  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const updateStatus = useCallback((newStatus: ConnectionStatus) => {
    setStatus(newStatus);
    onStatusChange?.(newStatus);
  }, [onStatusChange]);

  const connect = useCallback(() => {
    if (eventSourceRef.current?.readyState === EventSource.OPEN) {
      return;
    }

    updateStatus("connecting");
    setError(null);

    try {
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        updateStatus("connected");
        reconnectAttemptsRef.current = 0;
        setError(null);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onEvent?.(data);
        } catch (err) {
          console.error("Failed to parse realtime event:", err);
        }
      };

      eventSource.onerror = (event) => {
        console.error("EventSource error:", event);
        setError("Connection failed");
        updateStatus("offline");

        // Attempt reconnection
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current += 1;
          updateStatus("reconnecting");

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        }
      };
    } catch {
      setError("Failed to establish connection");
      updateStatus("offline");
    }
  }, [url, onEvent, updateStatus, maxReconnectAttempts, reconnectInterval]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    updateStatus("offline");
  }, [updateStatus]);

  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect, disconnect]);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    status,
    error,
    connect,
    disconnect,
    reconnect,
    isConnected: status === "connected",
    isReconnecting: status === "reconnecting",
  };
}