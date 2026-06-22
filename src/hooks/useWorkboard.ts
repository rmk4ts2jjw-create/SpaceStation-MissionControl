"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

export interface WorkboardCard {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee?: string;
  description?: string;
  tags?: string[];
  projectId?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

function getTokenFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("gatewayToken");
}

function subscribeToToken(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

export function useWorkboard() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef<Map<number, PendingRequest>>(new Map());
  const idCounterRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<((token: string) => void) | null>(null);

  const token = useSyncExternalStore(subscribeToToken, getTokenFromStorage, getTokenFromStorage);
  const noToken = token === null;

  const connect = useCallback((t: string) => {
    const ws = new WebSocket(`ws://localhost:18789?token=${t}`);

    ws.onopen = () => {
      setConnected(true);
      setError(null);
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectTimerRef.current = setTimeout(() => {
        const nextToken = getTokenFromStorage();
        if (nextToken) connectRef.current?.(nextToken);
      }, 3000);
    };

    ws.onerror = () => {
      setError("WebSocket connection error");
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as {
          id: number;
          result?: unknown;
          error?: { message: string; code?: number };
        };
        const pending = pendingRef.current.get(data.id);
        if (pending) {
          clearTimeout(pending.timer);
          if (data.error) {
            pending.reject(new Error(data.error.message || String(data.error.code)));
          } else {
            pending.resolve(data.result);
          }
          pendingRef.current.delete(data.id);
        }
      } catch {
        // Ignore non-JSON or unparseable messages
      }
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connectRef.current = connect;
  });

  // Connect/disconnect based on token availability
  useEffect(() => {
    if (!token) return;
    connect(token);
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect, token]);

  const derivedError = noToken
    ? "No gateway token found in localStorage (key: 'gatewayToken')"
    : error;

  const call = useCallback(
    async (method: string, params: Record<string, unknown> = {}): Promise<unknown> => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error("WebSocket not connected");
      }

      const id = ++idCounterRef.current;

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingRef.current.delete(id);
          reject(new Error(`RPC call "${method}" timed out after 30s`));
        }, 30000);

        pendingRef.current.set(id, { resolve, reject, timer });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    []
  );

  const reconnect = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    const t = getTokenFromStorage();
    if (t) connectRef.current?.(t);
  }, []);

  return { call, connected, error: derivedError, reconnect };
}
