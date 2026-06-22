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

interface QueuedCall {
  doSend: () => void;
  reject: (reason: unknown) => void;
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
  const isReadyRef = useRef(false);
  const callQueueRef = useRef<QueuedCall[]>([]);

  const token = useSyncExternalStore(subscribeToToken, getTokenFromStorage, getTokenFromStorage);
  const noToken = token === null;

  const connect = useCallback((t: string) => {
    const ws = new WebSocket("ws://localhost:18789");

    isReadyRef.current = false;
    setConnected(false);
    setError(null);

    for (const queued of callQueueRef.current) {
      queued.reject(new Error("WebSocket reconnecting"));
    }
    callQueueRef.current = [];

    ws.onopen = () => {};

    ws.onclose = () => {
      isReadyRef.current = false;
      setConnected(false);

      pendingRef.current.forEach((pending) => {
        clearTimeout(pending.timer);
        pending.reject(new Error("WebSocket disconnected"));
      });
      pendingRef.current.clear();

      callQueueRef.current.forEach((queued) => {
        queued.reject(new Error("WebSocket disconnected"));
      });
      callQueueRef.current = [];

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
        const data = JSON.parse(event.data) as Record<string, unknown>;

        if (data.type === "event" && data.event === "connect.challenge") {
          ws.send(JSON.stringify({
            type: "req",
            id: "connect",
            method: "connect",
            params: {
              minProtocol: 4,
              maxProtocol: 4,
              client: {
                id: "spacestation",
                version: "1.0.0",
                platform: "web",
                mode: "operator",
              },
              role: "operator",
              scopes: ["operator.read", "operator.write"],
              auth: { token: t },
            },
          }));
          return;
        }

        if (data.type === "res" && data.id === "connect") {
          if (data.ok === true) {
            isReadyRef.current = true;
            setConnected(true);
            setError(null);

            const queue = callQueueRef.current;
            callQueueRef.current = [];
            queue.forEach(({ doSend }) => {
              doSend();
            });
          } else {
            const errMsg = (data.error as { message?: string })?.message ?? "Handshake failed";
            setError(errMsg);
            ws.close();
          }
          return;
        }

        if (data.type === "res" && typeof data.id === "number") {
          const pending = pendingRef.current.get(data.id);
          if (pending) {
            clearTimeout(pending.timer);
            if (data.ok === true) {
              pending.resolve(data.payload);
            } else {
              const errMsg = (data.error as { message?: string })?.message ?? "RPC error";
              pending.reject(new Error(errMsg));
            }
            pendingRef.current.delete(data.id);
          }
          return;
        }
      } catch {
        // Ignore unparseable messages
      }
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connectRef.current = connect;
  });

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
        const doSend = () => {
          const timer = setTimeout(() => {
            pendingRef.current.delete(id);
            reject(new Error(`RPC call "${method}" timed out after 30s`));
          }, 30000);
          pendingRef.current.set(id, { resolve, reject, timer });
          ws.send(JSON.stringify({ type: "req", id, method, params }));
        };

        if (isReadyRef.current) {
          doSend();
        } else {
          callQueueRef.current.push({ doSend, reject });
        }
      });
    },
    [],
  );

  const reconnect = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    const t = getTokenFromStorage();
    if (t) connectRef.current?.(t);
  }, []);

  return { call, connected, error: derivedError, reconnect };
}
