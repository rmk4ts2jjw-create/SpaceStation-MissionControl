import { NextRequest, NextResponse } from "next/server";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join } from "path";
import { OPENCLAW_WORKSPACE } from "@/lib/paths";

export const dynamic = "force-dynamic";

interface ActivityEvent {
  id: string;
  timestamp: string;
  type: string;
  description: string;
  status: string;
  actor: string;
  source: "memory" | "tasks" | "incidents";
}

/**
 * Parse daily memory markdown files into activity events.
 * Each ## heading section becomes one activity event.
 */
function parseMemoryActivities(limit: number): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const memDir = join(OPENCLAW_WORKSPACE, "memory");

  if (!existsSync(memDir)) return events;

  try {
    // Get daily log files, sorted newest first
    const files = readdirSync(memDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort()
      .reverse()
      .slice(0, 7); // Last 7 days

    for (const file of files) {
      const filePath = join(memDir, file);
      const content = readFileSync(filePath, "utf-8");
      const stat = statSync(filePath);
      const dateStr = file.replace(".md", "");

      // Split into sections by ## headings
      const sections = content.split(/^## /m).filter(Boolean);

      for (const section of sections) {
        const lines = section.trim().split("\n");
        const heading = lines[0]?.trim();
        if (!heading) continue;

        // Extract the first meaningful line as description
        const bodyLines = lines.slice(1).filter((l) => l.trim() && !l.startsWith("#"));
        const description = bodyLines[0]?.replace(/^[-*]\s*/, "").trim() || heading;

        // Determine type from content
        let type = "memory";
        let status = "success";
        const lowerContent = section.toLowerCase();
        if (lowerContent.includes("error") || lowerContent.includes("fail") || lowerContent.includes("crash")) {
          status = "error";
        } else if (lowerContent.includes("warning") || lowerContent.includes("alert")) {
          status = "warning";
        }
        if (lowerContent.includes("heartbeat")) type = "heartbeat";
        else if (lowerContent.includes("incident")) type = "incident";
        else if (lowerContent.includes("task")) type = "task";
        else if (lowerContent.includes("cron")) type = "cron";
        else if (lowerContent.includes("dispatch")) type = "dispatch";

        // Use file mtime as timestamp base, with offset for ordering
        const ts = new Date(stat.mtime);
        // Add seconds based on section position for ordering within file
        ts.setSeconds(ts.setSeconds(ts.getSeconds() + events.length));

        events.push({
          id: `mem-${dateStr}-${events.length}`,
          timestamp: ts.toISOString(),
          type,
          description: description.length > 120 ? description.slice(0, 120) + "…" : description,
          status,
          actor: "system",
          source: "memory",
        });

        if (events.length >= limit * 2) break;
      }
      if (events.length >= limit * 2) break;
    }
  } catch (err) {
    console.error("[activity API] Error parsing memory files:", err);
  }

  return events;
}

/**
 * Read recent task activity from tasks.json
 */
function parseTaskActivities(limit: number): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const tasksPath = join(OPENCLAW_WORKSPACE, "data", "tasks.json");

  try {
    if (!existsSync(tasksPath)) return events;
    const raw = readFileSync(tasksPath, "utf-8");
    const tasks = JSON.parse(raw);

    // Recent done tasks
    const doneTasks = tasks
      .filter((t: any) => t.status === "done" && t.lastActivity)
      .sort((a: any, b: any) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())
      .slice(0, limit);

    for (const t of doneTasks) {
      events.push({
        id: `task-${t.id}`,
        timestamp: t.lastActivity,
        type: "task",
        description: `Completed: ${t.title}`,
        status: "success",
        actor: t.assignee || "unknown",
        source: "tasks",
      });
    }

    // Active tasks
    const activeTasks = tasks
      .filter((t: any) => t.status === "in_progress" || t.status === "triage")
      .slice(0, limit);

    for (const t of activeTasks) {
      events.push({
        id: `task-active-${t.id}`,
        timestamp: t.lastActivity || t.ts,
        type: "task",
        description: `${t.status === "triage" ? "Triage" : "Working"}: ${t.title}`,
        status: t.status === "triage" ? "warning" : "running",
        actor: t.assignee || "unknown",
        source: "tasks",
      });
    }
  } catch (err) {
    console.error("[activity API] Error parsing tasks:", err);
  }

  return events;
}

/**
 * Read recent incident activity from incidents.json
 */
function parseIncidentActivities(limit: number): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const incidentsPath = join(OPENCLAW_WORKSPACE, "data", "incidents.json");

  try {
    if (!existsSync(incidentsPath)) return events;
    const raw = readFileSync(incidentsPath, "utf-8");
    const incidents = JSON.parse(raw);

    // Open incidents sorted by lastActivity
    const openIncidents = incidents
      .filter((i: any) => i.status !== "RESOLVED")
      .sort((a: any, b: any) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())
      .slice(0, limit);

    for (const inc of openIncidents) {
      events.push({
        id: `inc-${inc.id}`,
        timestamp: inc.lastActivity,
        type: "incident",
        description: `${inc.id}: ${inc.title}`,
        status: inc.severity === "P1" ? "error" : "warning",
        actor: inc.owner || "system",
        source: "incidents",
      });
    }
  } catch (err) {
    console.error("[activity API] Error parsing incidents:", err);
  }

  return events;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const type = searchParams.get("type") || undefined;

    // Aggregate from all live sources
    const memoryEvents = parseMemoryActivities(limit);
    const taskEvents = parseTaskActivities(limit);
    const incidentEvents = parseIncidentActivities(limit);

    // Merge and sort by timestamp descending
    let allEvents = [...memoryEvents, ...taskEvents, ...incidentEvents];
    allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Filter by type if specified
    if (type) {
      allEvents = allEvents.filter((e) => e.type === type);
    }

    // Deduplicate by description similarity
    const seen = new Set<string>();
    const deduped = allEvents.filter((e) => {
      const key = e.description.slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const result = deduped.slice(0, limit);

    return NextResponse.json({
      activities: result,
      total: result.length,
      limit,
      offset: 0,
      hasMore: false,
      sources: {
        memory: memoryEvents.length,
        tasks: taskEvents.length,
        incidents: incidentEvents.length,
      },
    });
  } catch (error) {
    console.error("[activity API] Error:", error);
    return NextResponse.json(
      { activities: [], total: 0, error: "Failed to load activities" },
      { status: 500 }
    );
  }
}
