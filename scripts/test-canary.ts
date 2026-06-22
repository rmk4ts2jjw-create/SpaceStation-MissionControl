#!/usr/bin/env bun
/**
 * Canary Test Script
 *
 * Verifies the task API loop is fully functional:
 * 1. POST a task with title "CANARY TEST"
 * 2. Wait 5 seconds
 * 3. GET /api/tasks to confirm it exists
 * 4. Log the result
 */

const BASE_URL = "http://localhost:3000";
const AUTH_COOKIE = "mc_auth=development-secret-key-32-chars-long-min";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("🐤 CANARY TEST — Starting...\n");

  // Step 1: POST a new task
  console.log("📤 Step 1: POST /api/tasks — Creating CANARY TEST task...");
  let postRes: Response;
  let postData: { success: boolean; task?: { id: string; title: string }; error?: string };
  try {
    postRes = await fetch(`${BASE_URL}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": AUTH_COOKIE },
      body: JSON.stringify({
        title: "CANARY TEST",
        description: "Automated canary test task — safe to delete",
        assignee: "monkey",
        priority: "P3",
        status: "backlog",
      }),
    });
    postData = await postRes.json();
  } catch (err) {
    console.error("❌ Step 1 FAILED: Could not reach API:", err);
    process.exit(1);
  }

  if (!postRes.ok || !postData.success) {
    console.error(`❌ Step 1 FAILED: HTTP ${postRes.status} — ${postData.error || "Unknown error"}`);
    process.exit(1);
  }

  const taskId = postData.task!.id;
  console.log(`✅ Step 1 OK — Task created: ${taskId}`);
  console.log(`   Title: ${postData.task!.title}`);
  console.log(`   HTTP ${postRes.status}\n`);

  // Step 2: Wait 5 seconds
  console.log("⏳ Step 2: Waiting 5 seconds...");
  await sleep(5000);
  console.log("✅ Step 2 OK — Wait complete\n");

  // Step 3: GET tasks and confirm
  console.log("📥 Step 3: GET /api/tasks — Verifying task exists...");
  let getRes: Response;
  let getData: { tasks?: Array<{ id: string; title: string }>; error?: string };
  try {
    getRes = await fetch(`${BASE_URL}/api/tasks`, { headers: { "Cookie": AUTH_COOKIE } });
    getData = await getRes.json();
  } catch (err) {
    console.error("❌ Step 3 FAILED: Could not reach API:", err);
    process.exit(1);
  }

  if (!getRes.ok) {
    console.error(`❌ Step 3 FAILED: HTTP ${getRes.status} — ${getData.error || "Unknown error"}`);
    process.exit(1);
  }

  const found = getData.tasks?.find((t) => t.id === taskId);
  if (!found) {
    console.error("❌ Step 3 FAILED: Task not found in GET response!");
    console.error(`   Searched for ID: ${taskId}`);
    console.error(`   Total tasks returned: ${getData.tasks?.length ?? 0}`);
    process.exit(1);
  }

  console.log(`✅ Step 3 OK — Task confirmed in GET response`);
  console.log(`   ID: ${found.id}`);
  console.log(`   Title: ${found.title}`);
  console.log(`   HTTP ${getRes.status}\n`);

  // Summary
  console.log("═══════════════════════════════════════");
  console.log("🐤 CANARY TEST — ALL STEPS PASSED ✅");
  console.log("═══════════════════════════════════════");
  console.log(`   Task ID:  ${taskId}`);
  console.log(`   POST:     ${postRes.status} OK`);
  console.log(`   GET:      ${getRes.status} OK`);
  console.log(`   Latency:  ~5s (includes 5s wait)`);
  console.log("═══════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("💥 CANARY TEST — Unexpected error:", err);
  process.exit(1);
});
