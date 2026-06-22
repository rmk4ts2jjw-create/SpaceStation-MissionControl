import { NextRequest, NextResponse } from "next/server";
import { safeWrite, safeRead } from "@/services/safe-write";
import { OPENCLAW_WORKSPACE } from "@/lib/paths";

export const dynamic = "force-dynamic";

const TASKS_PATH = `${OPENCLAW_WORKSPACE}/data/tasks.json`;
const TEST_TASKS_PATH = `${OPENCLAW_WORKSPACE}/data/tasks-test.json`;

const AGENTS = ["monkey", "lion", "owl", "fox"] as const;

/**
 * Find the least-burdened agent by counting active in_progress tasks.
 * Falls back to round-robin if counts are equal.
 */
function findLeastBurdenedAgent(tasks: Task[], now: string): string {
  const counts: Record<string, number> = {};
  for (const agent of AGENTS) {
    counts[agent] = 0;
  }
  for (const t of tasks) {
    if (t.status === "in_progress" && t.assignee && AGENTS.includes(t.assignee as typeof AGENTS[number])) {
      counts[t.assignee] = (counts[t.assignee] || 0) + 1;
    }
  }
  // Find minimum count, with round-robin fallback (first in array wins ties)
  let minAgent = AGENTS[0];
  let minCount = counts[minAgent];
  for (const agent of AGENTS) {
    if (counts[agent] < minCount) {
      minCount = counts[agent];
      minAgent = agent;
    }
  }
  console.log(`[LoadBalancer] Agent counts: ${JSON.stringify(counts)} → assigned: ${minAgent}`);
  return minAgent;
}

function getTasksPath(request: NextRequest): string {
  // Use test file if CANARY_USE_TEST_FILE env var is set OR if request has ?test=1
  const useTest = process.env.CANARY_USE_TEST_FILE === "true" || request.nextUrl.searchParams.get("test") === "1";
  return useTest ? TEST_TASKS_PATH : TASKS_PATH;
}

export interface Task {
  id: string;
  title: string;
  assignee: string;
  status: string;
  priority: string;
  ts: string;
  note?: string;
  linkedIncidentId?: string;
  tags?: string[];
  projectId?: string;
  history?: Array<{
    ts: string;
    action: string;
    actor: string;
    details?: string;
  }>;
  lastActivity?: string;
  currentStep?: string | null;
  progress?: number;
  stalledAt?: string | null;
  wasStalled?: boolean;
  dispatchCount?: number;
  dispatchFailed?: boolean;
  dispatchFailedReason?: string;
  rcaConfidence?: number;
}

// ── GET ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const filePath = getTasksPath(request);
    const result = safeRead<Task[]>(filePath, []);
    if (!result.ok) {
      console.error("[tasks API] Error reading tasks file:", result.error);
      return NextResponse.json(
        { tasks: [], total: 0, error: "Failed to load tasks" },
        { status: 500 }
      );
    }
    return NextResponse.json({ tasks: result.data, total: result.data.length });
  } catch (error) {
    console.error("[tasks API] Unhandled error:", error);
    return NextResponse.json(
      { tasks: [], total: 0, error: "Failed to load tasks" },
      { status: 500 }
    );
  }
}

// ── PATCH ───────────────────────────────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, action } = body;

    // Archive action: move task to ARCHIVED status
    if (action === "archive" && id) {
      const filePath = getTasksPath(request);
      const result = safeRead<Task[]>(filePath, []);
      if (!result.ok) {
        return NextResponse.json({ error: "Failed to read tasks" }, { status: 500 });
      }
      const tasks = result.data;
      const task = tasks.find((t) => t.id === id);
      if (!task) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      }
      const now = new Date().toISOString();
      task.status = "archived";
      task.lastActivity = now;
      if (!task.history) task.history = [];
      task.history.push({
        ts: now,
        action: "archived",
        actor: "user",
        details: `Task archived from ${task.status}`,
      });
      const writeResult = safeWrite(filePath, tasks);
      if (!writeResult.ok) {
        return NextResponse.json({ error: "Failed to save" }, { status: 500 });
      }
      return NextResponse.json({ success: true, task });
    }

    // Status update (for drag-and-drop)
    if (id && status) {
      const validStatuses = ["triage", "backlog", "in_progress", "done", "archived"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
          { status: 400 }
        );
      }

      const filePath = getTasksPath(request);
      const result = safeRead<Task[]>(filePath, []);
      if (!result.ok) {
        return NextResponse.json({ error: "Failed to read tasks" }, { status: 500 });
      }
      const tasks = result.data;
      const task = tasks.find((t) => t.id === id);
      if (!task) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      }

      const now = new Date().toISOString();
      const oldStatus = task.status;
      task.status = status;
      task.lastActivity = now;

      // Auto-assign agent when moving to in_progress with no assignee
      const autoAssignedAgent = status === "in_progress" && !task.assignee;
      if (autoAssignedAgent) {
        const agent = findLeastBurdenedAgent(tasks, now);
        task.assignee = agent;
        console.log(`[LoadBalancer] Auto-assigned ${task.id} to ${agent}`);
      }

      // Clear stall-related fields when moving out of in_progress
      if (status !== "in_progress") {
        task.currentStep = null;
        task.progress = 0;
        task.stalledAt = null;
      }

      // Add history entry
      if (!task.history) task.history = [];
      const historyDetails = autoAssignedAgent
        ? `Status changed from ${oldStatus} to ${status} (drag-and-drop). Auto-assigned to ${task.assignee} via Load Balancer.`
        : `Status changed from ${oldStatus} to ${status} (drag-and-drop)`;
      task.history.push({
        ts: now,
        action: "status_change",
        actor: "system",
        details: historyDetails,
      });

      const writeResult = safeWrite(filePath, tasks);
      if (!writeResult.ok) {
        return NextResponse.json({ error: "Failed to save" }, { status: 500 });
      }

      return NextResponse.json({ success: true, task });
    }

    // Field updates (for Detail Drawer: title, note, assignee)
    if (id && (body.title !== undefined || body.note !== undefined || body.assignee !== undefined || body.projectId !== undefined)) {
      const filePath = getTasksPath(request);
      const result = safeRead<Task[]>(filePath, []);
      if (!result.ok) {
        return NextResponse.json({ error: "Failed to read tasks" }, { status: 500 });
      }
      const tasks = result.data;
      const task = tasks.find((t) => t.id === id);
      if (!task) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      }

      const now = new Date().toISOString();
      const changes: string[] = [];

      if (body.title !== undefined && body.title !== task.title) {
        changes.push(`title: "${task.title}" → "${body.title}"`);
        task.title = body.title;
      }
      if (body.note !== undefined && body.note !== task.note) {
        changes.push("description updated");
        task.note = body.note;
      }
      if (body.assignee !== undefined && body.assignee !== task.assignee) {
        changes.push(`assignee: ${task.assignee} → ${body.assignee}`);
        task.assignee = body.assignee;
      }
      if (body.projectId !== undefined && body.projectId !== task.projectId) {
        changes.push(`project: ${task.projectId || "none"} → ${body.projectId}`);
        task.projectId = body.projectId;
      }

      if (changes.length > 0) {
        task.lastActivity = now;
        if (!task.history) task.history = [];
        task.history.push({
          ts: now,
          action: "updated",
          actor: "user",
          details: changes.join(", "),
        });

        const writeResult = safeWrite(filePath, tasks);
        if (!writeResult.ok) {
          return NextResponse.json({ error: "Failed to save" }, { status: 500 });
        }
      }

      return NextResponse.json({ success: true, task });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (error) {
    console.error("[tasks API] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

// ── POST ───────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, description, assignee, priority, status } = body;

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const filePath = getTasksPath(request);
    const result = safeRead<Task[]>(filePath, []);
    if (!result.ok) {
      return NextResponse.json({ error: "Failed to read tasks" }, { status: 500 });
    }
    const tasks = result.data;

    const now = new Date().toISOString();
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const newTask: Task = {
      id,
      title,
      assignee: assignee || "",
      status: status || "backlog",
      priority: priority || "P3",
      ts: now,
      note: description || "",
      projectId: body.projectId || undefined,
      lastActivity: now,
      currentStep: null,
      progress: 0,
      history: [
        {
          ts: now,
          action: "created",
          actor: "user",
          details: `Task created via API`,
        },
      ],
    };

    tasks.push(newTask);

    const writeResult = safeWrite(filePath, tasks);
    if (!writeResult.ok) {
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    return NextResponse.json({ success: true, task: newTask }, { status: 201 });
  } catch (error) {
    console.error("[tasks API] POST error:", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}

// ── DELETE ──────────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Task ID required" }, { status: 400 });
    }

    const filePath = getTasksPath(request);
    const result = safeRead<Task[]>(filePath, []);
    if (!result.ok) {
      return NextResponse.json({ error: "Failed to read tasks" }, { status: 500 });
    }
    const tasks = result.data;
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx === -1) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const deleted = tasks.splice(idx, 1)[0];

    const writeResult = safeWrite(filePath, tasks);
    if (!writeResult.ok) {
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    return NextResponse.json({ success: true, deleted: deleted.id });
  } catch (error) {
    console.error("[tasks API] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
