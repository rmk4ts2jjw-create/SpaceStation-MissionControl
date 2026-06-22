/**
 * POST /api/watchdog/stall-detect
 *
 * Triggers the stall detector service. Intended to be called by OpenClaw cron
 * on a regular schedule (e.g., every 15 minutes).
 *
 * Query params:
 *   threshold — staleness threshold in minutes (default: 30)
 *
 * Returns JSON summary of ghost resets, stale resets, and cooldown clears.
 */

import { NextRequest, NextResponse } from "next/server";
import { detectStalls } from "@/services/stall-detector";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const thresholdParam = searchParams.get("threshold");
    const threshold = thresholdParam ? parseInt(thresholdParam, 10) : 30;

    if (isNaN(threshold) || threshold < 1) {
      return NextResponse.json(
        { ok: false, error: "Invalid threshold parameter" },
        { status: 400 }
      );
    }

    const result = detectStalls(threshold);

    return NextResponse.json({
      ok: result.ok,
      timestamp: new Date().toISOString(),
      threshold: threshold,
      summary: {
        ghostResets: result.ghostResets.length,
        staleResets: result.staleResets.length,
        cooldownsCleared: result.cooldownsCleared.length,
        totalChanges:
          result.ghostResets.length +
          result.staleResets.length +
          result.cooldownsCleared.length,
      },
      ghostResets: result.ghostResets,
      staleResets: result.staleResets,
      cooldownsCleared: result.cooldownsCleared,
      error: result.error ?? null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[watchdog/stall-detect] Unhandled error:", message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/watchdog/stall-detect
 *
 * Dry-run: returns the current state of in_progress tasks without modifying anything.
 * Useful for debugging and manual inspection.
 */
export async function GET() {
  try {
    const { safeRead } = await import("@/services/safe-write");
    const { OPENCLAW_WORKSPACE } = await import("@/lib/paths");
    const tasksFile = `${OPENCLAW_WORKSPACE}/data/tasks.json`;

    const { data: tasks } = safeRead<Record<string, unknown>[]>(tasksFile, []);

    const inProgress = tasks.filter(
      (t: Record<string, unknown>) => t.status === "in_progress"
    );

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      inProgressCount: inProgress.length,
      tasks: inProgress.map((t: Record<string, unknown>) => ({
        id: t.id,
        title: t.title,
        currentStep: t.currentStep ?? null,
        lastActivity: t.lastActivity ?? null,
        stalledAt: t.stalledAt ?? null,
        wasStalled: t.wasStalled ?? false,
        dispatchCount: t.dispatchCount ?? 0,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
