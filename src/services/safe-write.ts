/**
 * safe-write.ts — Atomic JSON write utility for tasks.json and incidents.json.
 *
 * Wraps the legacy safe_write.py (Python) via child_process.execFileSync to
 * ensure cross-process file locking (fcntl.flock) is maintained.
 *
 * This is the ONLY write path for task/incident data files. All services
 * (stall-detector, incident-detector, auto-resolve) must use this to persist
 * state changes.
 *
 * Guarantees (inherited from safe_write.py):
 * - Atomic: writes to temp file first, then os.rename (atomic on same filesystem)
 * - Safe: preserves original file on error (no partial writes)
 * - Locked: fcntl.flock prevents concurrent writes from corrupting data
 * - Backed up: keeps last 3 versions as .bak.1, .bak.2, .bak.3
 */

import { execFileSync } from "child_process";
import { readFileSync, existsSync } from "fs";

const SAFE_WRITE_SCRIPT = "/Users/spacemonkey/.openclaw/workspace/scripts/safe_write.py";

export interface SafeWriteResult {
  ok: boolean;
  error?: string;
}

export interface SafeReadResult<T> {
  data: T;
  ok: boolean;
  error?: string;
}

/**
 * Atomically write JSON data to a file using the legacy safe_write.py.
 * The Python script handles atomic writes, file locking, and backup rotation.
 */
export function safeWrite<T>(filePath: string, data: T): SafeWriteResult {
  try {
    const jsonStr = JSON.stringify(data, null, 2);
    execFileSync("python3", [SAFE_WRITE_SCRIPT, filePath], {
      input: jsonStr,
      encoding: "utf-8",
      timeout: 10_000, // 10s timeout
    });
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[safe-write] Failed to write ${filePath}:`, message);
    return { ok: false, error: message };
  }
}

/**
 * Safely read JSON from a file.
 * If the main file is corrupt, safe_write.py's backup rotation means
 * we can try .bak, .bak.2, .bak.3. For now we read directly and let
 * the caller handle fallback if needed.
 */
export function safeRead<T>(filePath: string, fallback: T): SafeReadResult<T> {
  try {
    if (!existsSync(filePath)) {
      return { data: fallback, ok: true };
    }
    const raw = readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as T;
    return { data, ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[safe-read] Failed to read ${filePath}:`, message);
    return { data: fallback, ok: false, error: message };
  }
}
