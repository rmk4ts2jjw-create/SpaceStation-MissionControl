#!/usr/bin/env bun
/**
 * Agent Swarm Simulator
 *
 * Simulates a real workload being spread across 4 agents:
 * 1. Create 8 tasks for projectId "proj-ui-overhaul"
 * 2. Dispatch: move all to 'in_progress', assign 2 tasks each to monkey/lion/owl/fox
 * 3. Simulate work: append completion notes to all 8 tasks
 * 4. Complete: move all 8 to 'done'
 *
 * Uses ?test=1 to isolate from production data.
 */

const BASE_URL = "http://localhost:3000";
const AUTH_COOKIE = "mc_auth=development-secret-key-32-chars-long-min";
const TEST = true;

function api(path: string, init?: RequestInit) {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${BASE_URL}${path}${TEST ? `${sep}test=1` : ""}`;
  return fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Cookie": AUTH_COOKIE,
      ...init?.headers,
    },
  });
}

const AGENTS = ["monkey", "lion", "owl", "fox"] as const;
const TASKS = [
  { title: "SWARM-001: Design System Tokens", note: "Defined color palette, typography scale, spacing grid. Created Figma library." },
  { title: "SWARM-002: Button Component Refactor", note: "Migrated 24 button variants to compound component pattern. All snapshots updated." },
  { title: "SWARM-003: Navigation Sidebar", note: "Built collapsible sidebar with nested routes. Added keyboard navigation support." },
  { title: "SWARM-004: Dark Mode Toggle", note: "Implemented CSS custom property switching. Persisted preference to localStorage." },
  { title: "SWARM-005: Data Table Component", note: "Built sortable, filterable table with virtual scrolling. Handles 10K+ rows." },
  { title: "SWARM-006: Form Validation Hook", note: "Created useFormValidation hook with async schema support. Zod integration." },
  { title: "SWARM-007: Toast Notification System", note: "Stacked toast notifications with auto-dismiss. 4 severity levels." },
  { title: "SWARM-008: Settings Page Layout", note: "Tabbed settings page with profile, notifications, and security sections." },
];

async function main() {
  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  console.log("  🤖 AGENT SWARM SIMULATOR");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Agents: ${AGENTS.join(", ")}`);
  console.log(`  Tasks:  ${TASKS.length}`);
  console.log(`  Project: proj-ui-overhaul`);
  console.log("═══════════════════════════════════════════════════════");
  console.log("");

  const taskIds: string[] = [];

  // ── ACTION 1: Create 8 tasks ─────────────────────────────────────────────
  console.log("📌 ACTION 1: Creating 8 tasks...");
  for (let i = 0; i < TASKS.length; i++) {
    const t = TASKS[i];
    const res = await api("/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: t.title,
        description: "",
        assignee: "monkey",
        priority: i < 2 ? "P1" : i < 5 ? "P2" : "P3",
        status: "backlog",
        projectId: "proj-ui-overhaul",
        tags: ["swarm", "ui-overhaul"],
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      console.error(`  ❌ Failed to create ${t.title}: ${data.error}`);
      process.exit(1);
    }
    taskIds.push(data.task.id);
    console.log(`  ✅ ${t.title} → ${data.task.id}`);
  }
  console.log(`  → ${taskIds.length} tasks created\n`);

  // ── ACTION 2: Dispatch — move to in_progress, assign agents ──────────────
  console.log("📌 ACTION 2: Dispatching to agents (2 tasks each)...");
  for (let i = 0; i < taskIds.length; i++) {
    const agent = AGENTS[Math.floor(i / 2)];
    const res = await api("/api/tasks", {
      method: "PATCH",
      body: JSON.stringify({
        id: taskIds[i],
        status: "in_progress",
        assignee: agent,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      console.error(`  ❌ Failed to dispatch ${taskIds[i]}`);
      process.exit(1);
    }
    const emoji = agent === "monkey" ? "🐒" : agent === "lion" ? "🦁" : agent === "owl" ? "🦉" : "🦊";
    console.log(`  ${emoji} ${agent}: ${TASKS[i].title.slice(0, 35)}`);
  }
  console.log("  → All 8 tasks dispatched\n");

  // ── ACTION 3: Simulate work — append completion notes ────────────────────
  console.log("📌 ACTION 3: Simulating work (appending notes)...");
  for (let i = 0; i < taskIds.length; i++) {
    const res = await api("/api/tasks", {
      method: "PATCH",
      body: JSON.stringify({
        id: taskIds[i],
        note: TASKS[i].note,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      console.error(`  ❌ Failed to update ${taskIds[i]}`);
      process.exit(1);
    }
    const historyLen = data.task.history?.length ?? 0;
    console.log(`  ✅ ${TASKS[i].title.slice(0, 30)}... (${historyLen} history entries)`);
  }
  console.log("  → All notes appended\n");

  // ── ACTION 4: Complete — move all to done ────────────────────────────────
  console.log("📌 ACTION 4: Moving all tasks to 'done'...");
  for (let i = 0; i < taskIds.length; i++) {
    const res = await api("/api/tasks", {
      method: "PATCH",
      body: JSON.stringify({ id: taskIds[i], status: "done" }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      console.error(`  ❌ Failed to complete ${taskIds[i]}`);
      process.exit(1);
    }
    console.log(`  ✅ ${TASKS[i].title.slice(0, 35)} → done`);
  }
  console.log("  → All 8 tasks completed\n");

  // ── VERIFICATION ─────────────────────────────────────────────────────────
  console.log("📌 VERIFICATION: Querying final state...");
  const getRes = await api("/api/tasks");
  const getData = await getRes.json();
  const swarmTasks = getData.tasks?.filter((t: any) =>
    taskIds.includes(t.id)
  ) ?? [];

  const allDone = swarmTasks.every((t: any) => t.status === "done");
  const allHaveNotes = swarmTasks.every((t: any) => (t.note?.length ?? 0) > 0);
  const allHaveProject = swarmTasks.every((t: any) => t.projectId === "proj-ui-overhaul");
  const agentCounts: Record<string, number> = {};
  for (const t of swarmTasks) {
    agentCounts[t.assignee] = (agentCounts[t.assignee] || 0) + 1;
  }

  console.log(`  Tasks found:     ${swarmTasks.length}/8 ${swarmTasks.length === 8 ? "✅" : "❌"}`);
  console.log(`  All done:        ${allDone ? "✅" : "❌"}`);
  console.log(`  All have notes:  ${allHaveNotes ? "✅" : "❌"}`);
  console.log(`  All in project:  ${allHaveProject ? "✅" : "❌"}`);
  console.log(`  Agent distribution:`);
  for (const [agent, count] of Object.entries(agentCounts)) {
    const emoji = agent === "monkey" ? "🐒" : agent === "lion" ? "🦁" : agent === "owl" ? "🦉" : "🦊";
    console.log(`    ${emoji} ${agent}: ${count} tasks`);
  }

  // Verify production untouched
  const prodRes = await fetch(`${BASE_URL}/api/tasks`, { headers: { "Cookie": AUTH_COOKIE } });
  const prodData = await prodRes.json();
  const swarmInProd = prodData.tasks?.filter((t: any) => taskIds.includes(t.id)) ?? [];
  console.log(`  Production clean: ${swarmInProd.length === 0 ? "✅" : "❌"} (${prodData.total} prod tasks)`);

  // ── CLEANUP ──────────────────────────────────────────────────────────────
  console.log("\n🧹 Cleanup: Deleting swarm tasks...");
  let cleaned = 0;
  for (const id of taskIds) {
    const delRes = await api(`/api/tasks?id=${id}`, { method: "DELETE" });
    if (delRes.ok) cleaned++;
  }
  console.log(`  → Deleted ${cleaned}/${taskIds.length} tasks`);

  // ── SUMMARY ──────────────────────────────────────────────────────────────
  const allPassed = swarmTasks.length === 8 && allDone && allHaveNotes && allHaveProject && swarmInProd.length === 0;
  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  if (allPassed) {
    console.log("  ✅ AGENT SWARM SIMULATION SUCCESSFUL");
  } else {
    console.log("  ❌ SIMULATION FAILED — SEE ERRORS ABOVE");
  }
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Tasks:     ${swarmTasks.length}/8 completed`);
  console.log(`  Project:   proj-ui-overhaul`);
  console.log(`  Agents:    ${AGENTS.join(", ")} (2 tasks each)`);
  console.log(`  Production: ${prodData.total} tasks (untouched)`);
  console.log("═══════════════════════════════════════════════════════");
  console.log("");

  if (!allPassed) process.exit(1);
}

main().catch((err) => {
  console.error("💥 SWARM SIMULATOR — Unexpected error:", err);
  process.exit(1);
});
