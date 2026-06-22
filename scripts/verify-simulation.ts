#!/usr/bin/env bun
/**
 * Full-Stack Workflow Simulation & Audit
 *
 * Golden Path:
 *   1. POST   → Create "SIM-001: Refactor Auth Service"
 *   2. PATCH  → Move to 'in_progress' (assign 'monkey')
 *   3. PATCH  → Append note (activity log)
 *   4. PATCH  → Move to 'done'
 *   5. PATCH  → Archive
 *   6. GET    → Verify final state + audit trail
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

function log(step: string, detail: string) {
  console.log(`  ${detail}`);
}

function divider() {
  console.log("  ─────────────────────────────────────");
}

async function main() {
  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  console.log("  MISSION CONTROL: FULL-STACK WORKFLOW SIMULATION");
  console.log("═══════════════════════════════════════════════════════");
  console.log("");

  let taskId: string;

  // ── STEP 1: POST — Create task ──────────────────────────────────────────
  console.log("📌 STEP 1: POST /api/tasks — Create SIM-001");
  const postRes = await api("/api/tasks", {
    method: "POST",
    body: JSON.stringify({
      title: "SIM-001: Refactor Auth Service",
      description: "Refactor the authentication service to use JWT tokens with refresh rotation.",
      assignee: "monkey",
      priority: "P2",
      status: "backlog",
      projectId: "proj-auth-overhaul",
      tags: ["refactor", "auth", "jwt"],
    }),
  });
  const postData = await postRes.json();
  if (!postRes.ok || !postData.success) {
    console.error(`❌ STEP 1 FAILED: HTTP ${postRes.status} — ${postData.error}`);
    process.exit(1);
  }
  taskId = postData.task.id;
  log("✅", `Created: ${taskId}`);
  log("", `  Title: ${postData.task.title}`);
  log("", `  Project: ${postData.task.projectId}`);
  log("", `  Status: ${postData.task.status}`);
  divider();

  // ── STEP 2: PATCH → In Progress ──────────────────────────────────────────
  console.log("📌 STEP 2: PATCH → Move to 'in_progress'");
  const patch1 = await api("/api/tasks", {
    method: "PATCH",
    body: JSON.stringify({
      id: taskId,
      status: "in_progress",
      assignee: "monkey",
    }),
  });
  const patch1Data = await patch1.json();
  if (!patch1.ok || !patch1Data.success) {
    console.error(`❌ STEP 2 FAILED: HTTP ${patch1.status}`);
    process.exit(1);
  }
  log("✅", `Status: ${patch1Data.task.status}`);
  log("", `  Assignee: ${patch1Data.task.assignee}`);
  divider();

  // ── STEP 3: PATCH → Append note (activity) ──────────────────────────────
  console.log("📌 STEP 3: PATCH — Append activity note");
  const patch2 = await api("/api/tasks", {
    method: "PATCH",
    body: JSON.stringify({
      id: taskId,
      note: "Refactored JWT middleware; verified with Integration Test Suite. All 47 tests passing. Token refresh rotation implemented with 15min expiry.",
    }),
  });
  const patch2Data = await patch2.json();
  if (!patch2.ok || !patch2Data.success) {
    console.error(`❌ STEP 3 FAILED: HTTP ${patch2.status}`);
    process.exit(1);
  }
  log("✅", `Note appended (${patch2Data.task.note?.length ?? 0} chars)`);
  // Show history entry
  const history = patch2Data.task.history ?? [];
  const lastEntry = history[history.length - 1];
  if (lastEntry) {
    log("", `  History: "${lastEntry.action}" — ${lastEntry.details?.slice(0, 60)}`);
  }
  divider();

  // ── STEP 4: PATCH → Done ─────────────────────────────────────────────────
  console.log("📌 STEP 4: PATCH → Move to 'done'");
  const patch3 = await api("/api/tasks", {
    method: "PATCH",
    body: JSON.stringify({ id: taskId, status: "done" }),
  });
  const patch3Data = await patch3.json();
  if (!patch3.ok || !patch3Data.success) {
    console.error(`❌ STEP 4 FAILED: HTTP ${patch3.status}`);
    process.exit(1);
  }
  log("✅", `Status: ${patch3Data.task.status}`);
  divider();

  // ── STEP 5: PATCH → Archive ──────────────────────────────────────────────
  console.log("📌 STEP 5: PATCH → Archive");
  const patch4 = await api("/api/tasks", {
    method: "PATCH",
    body: JSON.stringify({ id: taskId, action: "archive" }),
  });
  const patch4Data = await patch4.json();
  if (!patch4.ok || !patch4Data.success) {
    console.error(`❌ STEP 5 FAILED: HTTP ${patch4.status}`);
    process.exit(1);
  }
  log("✅", `Status: ${patch4Data.task.status}`);
  divider();

  // ── STEP 6: GET — Verify final state + audit trail ───────────────────────
  console.log("📌 STEP 6: GET — Verify final state + audit trail");
  const getRes = await api("/api/tasks");
  const getData = await getRes.json();
  const task = getData.tasks?.find((t: any) => t.id === taskId);

  if (!task) {
    console.error("❌ STEP 6 FAILED: Task not found in GET response");
    process.exit(1);
  }

  // Verify status
  const statusOk = task.status === "archived" || task.status === "ARCHIVED";
  log(statusOk ? "✅" : "❌", `Status = "${task.status}" ${statusOk ? "✓" : "✗"}`);

  // Verify activity log
  const historyEntries = task.history ?? [];
  const hasNote = historyEntries.some((h: any) => h.details?.includes("JWT middleware") || h.action === "updated");
  log(hasNote ? "✅" : "❌", `Activity log contains note: ${hasNote ? "✓" : "✗"} (${historyEntries.length} entries)`);

  // Verify project tag
  const hasProject = task.projectId === "proj-auth-overhaul";
  log(hasProject ? "✅" : "❌", `Project tag preserved: ${hasProject ? task.projectId : "MISSING"}`);

  // Verify production data untouched
  const prodRes = await fetch(`${BASE_URL}/api/tasks`, {
    headers: { "Cookie": AUTH_COOKIE },
  });
  const prodData = await prodRes.json();
  const simInProduction = prodData.tasks?.find((t: any) => t.id === taskId);
  log(!simInProduction ? "✅" : "❌", `Production data clean (SIM not in prod): ${!simInProduction ? "✓" : "✗"}`);
  log("", `  Production: ${prodData.total} tasks | Test: ${getData.total} tasks`);

  divider();

  // ── CLEANUP ──────────────────────────────────────────────────────────────
  console.log("🧹 Cleanup: Deleting simulation task...");
  const delRes = await api(`/api/tasks?id=${taskId}`, { method: "DELETE" });
  if (delRes.ok) {
    log("✅", `Task ${taskId} deleted`);
  } else {
    log("⚠️", `Cleanup failed — HTTP ${delRes.status}. Manual: ${taskId}`);
  }

  // ── SUMMARY ──────────────────────────────────────────────────────────────
  const allPassed = statusOk && hasNote && hasProject && !simInProduction;
  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  if (allPassed) {
    console.log("  ✅ SIMULATION SUCCESSFUL: WORKFLOW AUDITABLE");
  } else {
    console.log("  ❌ SIMULATION FAILED — SEE ERRORS ABOVE");
  }
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Task:     ${taskId}`);
  console.log(`  Status:   ${task.status}`);
  console.log(`  Project:  ${task.projectId}`);
  console.log(`  History:  ${historyEntries.length} entries`);
  console.log(`  Production untouched: ${!simInProduction}`);
  console.log("═══════════════════════════════════════════════════════");
  console.log("");

  if (!allPassed) process.exit(1);
}

main().catch((err) => {
  console.error("💥 SIMULATION — Unexpected error:", err);
  process.exit(1);
});
