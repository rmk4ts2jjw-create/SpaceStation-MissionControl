import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

// ── Server-side Workboard client ───────────────────────────────────────────
// This route proxies browser requests to the OpenClaw Workboard via Gateway
// WebSocket. The browser never connects to the Gateway directly.

const GATEWAY_URL = process.env.GATEWAY_URL || "ws://localhost:18789";
const WORKBOARD_BOARD_ID = process.env.WORKBOARD_BOARD_ID || "main";

function getGatewayToken(): string {
  // 1. Check env var first
  if (process.env.GATEWAY_TOKEN) return process.env.GATEWAY_TOKEN;
  // 2. Read from gateway config
  try {
    const configPath = path.join(os.homedir(), ".openclaw/openclaw.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return config?.gateway?.auth?.token || "";
  } catch {
    return "";
  }
}

const GATEWAY_TOKEN = getGatewayToken();

// ── WebSocket RPC helper ────────────────────────────────────────────────────
interface RPCResult {
  ok: boolean;
  payload?: unknown;
  error?: { message: string };
}

function gatewayRPC(
  method: string,
  params: Record<string, unknown>,
  token: string,
): Promise<RPCResult> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(GATEWAY_URL, {
      headers: {
        Origin: process.env.GATEWAY_ORIGIN || "http://localhost:18789",
      },
    });
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error(`RPC call "${method}" timed out after 15s`));
    }, 15000);

    let connected = false;

    ws.onopen = () => {
      // Send handshake frame with string ID "connect"
      ws.send(
        JSON.stringify({
          type: "req",
          id: "connect",
          method: "connect",
          params: {
            minProtocol: 4,
            maxProtocol: 4,
            client: {
              id: "openclaw-control-ui",
              version: "1.0.0",
              platform: "web",
              mode: "ui",
            },
            auth: { token },
          },
        }),
      );
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as Record<string, unknown>;

        // Handle connect response
        if (data.type === "res" && data.id === "connect") {
          if (data.ok === true) {
            connected = true;
            // Send the actual RPC with string ID
            ws.send(
              JSON.stringify({
                type: "req",
                id: "rpc-1",
                method,
                params,
              }),
            );
          } else {
            clearTimeout(timeout);
            ws.close();
            reject(
              new Error(
                (data.error as { message?: string })?.message ||
                  "Gateway handshake failed",
              ),
            );
          }
          return;
        }

        // Handle RPC response
        if (data.type === "res" && data.id === "rpc-1") {
          clearTimeout(timeout);
          ws.close();
          if (data.ok === true) {
            resolve({ ok: true, payload: data.payload });
          } else {
            resolve({
              ok: false,
              error: {
                message:
                  (data.error as { message?: string })?.message ||
                  "RPC error",
              },
            });
          }
        }
      } catch {
        // ignore malformed
      }
    };

    ws.onerror = (err) => {
      clearTimeout(timeout);
      reject(
        new Error(`WebSocket error: ${err.message || "connection failed"}`),
      );
    };

    ws.onclose = () => {
      clearTimeout(timeout);
      if (!connected) {
        reject(new Error("WebSocket closed before connection established"));
      }
    };
  });
}

// ── GET /api/workboard/cards — list cards ──────────────────────────────────
export async function GET() {
  try {
    if (!GATEWAY_TOKEN) {
      return NextResponse.json(
        { cards: [], error: "GATEWAY_TOKEN not configured" },
        { status: 503 },
      );
    }

    const result = await gatewayRPC(
      "workboard.cards.list",
      { boardId: WORKBOARD_BOARD_ID },
      GATEWAY_TOKEN,
    );

    if (!result.ok) {
      return NextResponse.json(
        { cards: [], error: result.error?.message || "Failed to list cards" },
        { status: 502 },
      );
    }

    return NextResponse.json(result.payload);
  } catch (error) {
    console.error("[workboard/cards] GET error:", error);
    return NextResponse.json(
      { cards: [], error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ── POST /api/workboard/cards — create card ────────────────────────────────
export async function POST(request: Request) {
  try {
    if (!GATEWAY_TOKEN) {
      return NextResponse.json(
        { error: "GATEWAY_TOKEN not configured" },
        { status: 503 },
      );
    }

    const body = await request.json();
    const { title, description, priority, assignee, labels, projectId } = body;

    if (!title) {
      return NextResponse.json(
        { error: "title is required" },
        { status: 400 },
      );
    }

    const result = await gatewayRPC(
      "workboard.cards.create",
      {
        boardId: WORKBOARD_BOARD_ID,
        title,
        description: description || "",
        priority: priority || "normal",
        assignee: assignee || undefined,
        labels: labels || [],
        projectId: projectId || undefined,
      },
      GATEWAY_TOKEN,
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error?.message || "Failed to create card" },
        { status: 502 },
      );
    }

    return NextResponse.json(result.payload, { status: 201 });
  } catch (error) {
    console.error("[workboard/cards] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ── PATCH /api/workboard/cards — update/move card ──────────────────────────
export async function PATCH(request: Request) {
  try {
    if (!GATEWAY_TOKEN) {
      return NextResponse.json(
        { error: "GATEWAY_TOKEN not configured" },
        { status: 503 },
      );
    }

    const body = await request.json();
    const { id, status, priority, assignee, labels, description, projectId } =
      body;

    if (!id) {
      return NextResponse.json(
        { error: "card id is required" },
        { status: 400 },
      );
    }

    const params: Record<string, unknown> = {
      boardId: WORKBOARD_BOARD_ID,
      id,
    };
    if (status !== undefined) params.status = status;
    if (priority !== undefined) params.priority = priority;
    if (assignee !== undefined) params.assignee = assignee;
    if (labels !== undefined) params.labels = labels;
    if (description !== undefined) params.description = description;
    if (projectId !== undefined) params.projectId = projectId;

    const result = await gatewayRPC(
      "workboard.cards.update",
      params,
      GATEWAY_TOKEN,
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error?.message || "Failed to update card" },
        { status: 502 },
      );
    }

    return NextResponse.json(result.payload);
  } catch (error) {
    console.error("[workboard/cards] PATCH error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ── DELETE /api/workboard/cards — delete card ──────────────────────────────
export async function DELETE(request: Request) {
  try {
    if (!GATEWAY_TOKEN) {
      return NextResponse.json(
        { error: "GATEWAY_TOKEN not configured" },
        { status: 503 },
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "card id is required" },
        { status: 400 },
      );
    }

    const result = await gatewayRPC(
      "workboard.cards.delete",
      { boardId: WORKBOARD_BOARD_ID, id },
      GATEWAY_TOKEN,
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error?.message || "Failed to delete card" },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[workboard/cards] DELETE error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
