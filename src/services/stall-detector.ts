/**
 * stall-detector.ts — Autonomous task stall detection and recovery.
 *
 * Ported from the legacy stall-detector.sh / stall-detector.py.
 * Three-phase detection:
 *   Phase 0 (Ghost Dispatch): currentStep is "Agent starting…" (or null) + lastActivity >60s ago
 *   Phase 1 (Stale Reset):   in_progress tasks with no activity for >threshold (default 30 min)
 *   Phase 2 (Cooldown Clear): stalledAt cleared after 2h in backlog; wasStalled cleared after 3h
 *
 * All state changes are persisted via safe-write.ts (atomic + file-locked).
 */

import { safeWrite, safeRead, SafeWriteResult } from "./safe-write";
import { OPENCLAW_WORKSPACE } from "@/lib/paths";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Task {
  id: string;
  title: string;
  assignee?: string;
  status: string;
  priority?: string;
  ts?: string;
  note?: string;
  linkedIncidentId?: string;
  tags?: string[];
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

export interface StallDetectResult {
  ok: boolean;
  ghostResets: StaleReset[];
  staleResets: StaleReset[];
  cooldownsCleared: CooldownClear[];
  error?: string;
}

export interface StaleReset {
  taskId: string;
  title: string;
  reason: string;
  staleMinutes: number;
}

export interface CooldownClear {
  taskId: string;
  title: string;
  field: "stalledAt" | "wasStalled";
  inBacklogMinutes: number;
}

// ── Config ───────────────────────────────────────────────────────────────────

const TASKS_FILE = `${OPENCLAW_WORKSPACE}/data/tasks.json`;
const DEFAULT_THRESHOLD_MIN = 30;
const GHOST_DISPATCH_SEC = 60;
const STALLED_AT_COOLDOWN_MIN = 120; // 2 hours
const WAS_STALLED_COOLDOWN_MIN = 180; // 3 hours

// ── Helpers ──────────────────────────────────────────────────────────────────

function now(): Date {
  return new Date();
}

function parseTimestamp(ts: string | undefined | null): Date | null {
  if (!ts || ts === "just now") return null;
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
}

/**
 * Compute staleness in minutes for an in_progress task.
 * Cascading fallback: lastActivity → ts → history[].ts
 */
function computeStalenessMinutes(task: Task): { minutes: number; source: string } {
  // Primary: lastActivity
  const lastActivity = parseTimestamp(task.lastActivity);
  if (lastActivity) {
    return {
      minutes: (now().getTime() - lastActivity.getTime()) / 60_000,
      source: "lastActivity",
    };
  }

  // Fallback: ts
  const ts = parseTimestamp(task.ts);
  if (ts) {
    return {
      minutes: (now().getTime() - ts.getTime()) / 60_000,
      source: "ts",
    };
  }

  // Fallback: most recent history entry
  if (task.history && task.history.length > 0) {
    for (let i = task.history.length - 1; i >= 0; i--) {
      const h = parseTimestamp(task.history[i].ts);
      if (h) {
        return {
          minutes: (now().getTime() - h.getTime()) / 60_000,
          source: "history",
        };
      }
    }
  }

  // No valid timestamp at all — treat as extremely stale
  return { minutes: 99999, source: "none" };
}

function addHistoryEntry(task: Task, action: string, details: string): void {
  if (!task.history) task.history = [];
  task.history.push({
    ts: now().toISOString(),
    action,
    actor: "stall-detector",
    details,
  });
}

// ── Main detection logic ─────────────────────────────────────────────────────

export function detectStalls(thresholdMin: number = DEFAULT_THRESHOLD_MIN): StallDetectResult {
  const ghostResets: StaleReset[] = [];
  const staleResets: StaleReset[] = [];
  const cooldownsCleared: CooldownClear[] = [];

  // ── Read ─────────────────────────────────────────────────────────────────
  const readResult = safeRead<Task[]>(TASKS_FILE, []);
  if (!readResult.ok) {
    return {
      ok: false,
      ghostResets: [],
      staleResets: [],
      cooldownsCleared: [],
      error: `Failed to read tasks.json: ${readResult.error}`,
    };
  }
  const tasks = readResult.data;
  const currentIso = now().toISOString();

  // ── Phase 0: Ghost Dispatch Detection ────────────────────────────────────
  for (const task of tasks) {
    if (task.status !== "in_progress") continue;

    const step = task.currentStep ?? null;
    const isGhostStep =
      step === null ||
      step === "Agent starting…" ||
      step === "Agent starting...";

    if (!isGhostStep) continue;

    const { minutes, source } = computeStalenessMinutes(task);
    const staleSec = minutes * 60;

    if (staleSec > GHOST_DISPATCH_SEC) {
      const oldStep = step ?? "(null)";
      task.status = "backlog";
      task.currentStep = null;
      task.progress = 0;
      task.stalledAt = currentIso;
      task.lastActivity = currentIso;
      task.dispatchCount = (task.dispatchCount ?? 0) + 1;
      task.wasStalled = true;
      addHistoryEntry(
        task,
        "ghost_dispatch_reset",
        `Ghost dispatch reset — Agent starting for ${staleSec.toFixed(0)}s with no progress (step: ${oldStep})`
      );
      ghostResets.push({
        taskId: task.id,
        title: task.title,
        reason: `Ghost dispatch — step "${oldStep}" for ${staleSec.toFixed(0)}s`,
        staleMinutes: minutes,
      });
    }
  }

  // ── Phase 1: Stale Task Reset ────────────────────────────────────────────
  for (const task of tasks) {
    if (task.status !== "in_progress") continue;

    // Skip tasks already reset in Phase 0
    if (ghostResets.some((r) => r.taskId === task.id)) continue;

    const { minutes, source } = computeStalenessMinutes(task);

    if (minutes > thresholdMin) {
      const oldStep = task.currentStep ?? "(null)";
      task.status = "backlog";
      task.currentStep = null;
      task.progress = 0;
      task.stalledAt = currentIso;
      task.lastActivity = currentIso;
      task.dispatchCount = (task.dispatchCount ?? 0) + 1;
      task.wasStalled = true;
      addHistoryEntry(
        task,
        "stalled_reset",
        `Auto-reset by stall detector — in_progress for ${minutes.toFixed(0)} min with no activity (threshold: ${thresholdMin} min). Was: ${oldStep}. Timestamp source: ${source}`
      );
      staleResets.push({
        taskId: task.id,
        title: task.title,
        reason: `Stale ${minutes.toFixed(0)} min (threshold: ${thresholdMin} min)`,
        staleMinutes: minutes,
      });
    }
  }

  // ── Phase 2: Cooldown Clear ──────────────────────────────────────────────
  for (const task of tasks) {
    if (task.status !== "backlog" || !task.stalledAt) continue;

    const stalledAt = parseTimestamp(task.stalledAt);
    if (!stalledAt) continue;

    const inBacklogMin = (now().getTime() - stalledAt.getTime()) / 60_000;

    // Clear stalledAt after 2 hours in backlog
    if (inBacklogMin >= STALLED_AT_COOLDOWN_MIN) {
      task.stalledAt = null;
      addHistoryEntry(
        task,
        "stalled_cleared",
        `stalledAt cleared after ${inBacklogMin.toFixed(0)} min in backlog — task eligible for re-dispatch`
      );
      cooldownsCleared.push({
        taskId: task.id,
        title: task.title,
        field: "stalledAt",
        inBacklogMinutes: inBacklogMin,
      });
    }

    // Clear wasStalled after 3 hours in backlog
    if (inBacklogMin >= WAS_STALLED_COOLDOWN_MIN && task.wasStalled) {
      delete task.wasStalled;
      addHistoryEntry(
        task,
        "was_stalled_cleared",
        `wasStalled cleared after ${inBacklogMin.toFixed(0)} min in backlog`
      );
      cooldownsCleared.push({
        taskId: task.id,
        title: task.title,
        field: "wasStalled",
        inBacklogMinutes: inBacklogMin,
      });
    }
  }

  // ── Write (only if changes were made) ────────────────────────────────────
  const totalChanges = ghostResets.length + staleResets.length + cooldownsCleared.length;
  if (totalChanges > 0) {
    const writeResult: SafeWriteResult = safeWrite(TASKS_FILE, tasks);
    if (!writeResult.ok) {
      return {
        ok: false,
        ghostResets,
        staleResets,
        cooldownsCleared,
        error: `Detection succeeded but write failed: ${writeResult.error}`,
      };
    }
  }

  return {
    ok: true,
    ghostResets,
    staleResets,
    cooldownsCleared,
  };
}
