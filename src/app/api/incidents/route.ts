import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { OPENCLAW_WORKSPACE } from "@/lib/paths";

export const dynamic = "force-dynamic";

interface Incident {
  id: string;
  title: string;
  severity: string;
  status: string;
  owner: string;
  acknowledged: boolean;
  escalated: boolean;
  opened: string;
  lastActivity: string;
  summary: string;
  tags: string[];
  timeline: Array<{ ts: string; message: string }>;
  actions: string[];
  actionsGenerated: boolean;
  _recurrence: number | null;
  _fingerprint: string;
}

export async function GET() {
  try {
    const incidentsPath = `${OPENCLAW_WORKSPACE}/data/incidents.json`;
    const raw = readFileSync(incidentsPath, "utf-8");
    const incidents: Incident[] = JSON.parse(raw);
    return NextResponse.json({ incidents, total: incidents.length });
  } catch (error) {
    console.error("[incidents API] Error reading incidents.json:", error);
    return NextResponse.json(
      { incidents: [], total: 0, error: "Failed to load incidents" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { incidentId, action } = body;

    if (!incidentId || !action) {
      return NextResponse.json(
        { success: false, error: "Missing incidentId or action" },
        { status: 400 }
      );
    }

    const incidentsPath = `${OPENCLAW_WORKSPACE}/data/incidents.json`;
    const raw = readFileSync(incidentsPath, "utf-8");
    const incidents: Incident[] = JSON.parse(raw);

    const idx = incidents.findIndex((i) => i.id === incidentId);
    if (idx === -1) {
      return NextResponse.json(
        { success: false, error: "Incident not found" },
        { status: 404 }
      );
    }

    const incident = incidents[idx];

    if (action === "resolve") {
      incident.status = "RESOLVED";
      incident.lastActivity = new Date().toISOString();
      incident.timeline.push({
        ts: new Date().toISOString(),
        message: "Incident resolved via dashboard",
      });
    } else if (action === "acknowledge") {
      incident.acknowledged = true;
      incident.lastActivity = new Date().toISOString();
      incident.timeline.push({
        ts: new Date().toISOString(),
        message: "Incident acknowledged via dashboard",
      });
    } else if (action === "escalate") {
      incident.escalated = true;
      incident.lastActivity = new Date().toISOString();
      incident.timeline.push({
        ts: new Date().toISOString(),
        message: "Incident escalated via dashboard",
      });
    } else {
      return NextResponse.json(
        { success: false, error: `Unknown action: ${action}` },
        { status: 400 }
      );
    }

    incidents[idx] = incident;

    // Write back
    const { writeFileSync } = await import("fs");
    writeFileSync(incidentsPath, JSON.stringify(incidents, null, 2));

    return NextResponse.json({ success: true, incident });
  } catch (error) {
    console.error("[incidents API] Error updating incident:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update incident" },
      { status: 500 }
    );
  }
}
