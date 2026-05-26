import { getDb, NUTRIENT_FIELDS } from "./db.ts";
import { analyzeImage } from "./ollama.ts";
import { broadcastToUser } from "./sse.ts";

const MAX_ATTEMPTS = 3;
const POLL_INTERVAL_MS = 2000;

let running = false;

export function startQueue() {
  if (running) return;
  running = true;

  // On startup, reset any stuck 'processing' jobs back to 'pending'
  const db = getDb();
  db.run(`UPDATE ollama_jobs SET status = 'pending' WHERE status = 'processing'`);

  loop();
}

async function loop() {
  while (running) {
    try {
      await processNext();
    } catch (err) {
      console.error("[queue] Unexpected error in loop:", err);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

async function processNext() {
  const db = getDb();

  const job = db.query<
    { id: string; food_entry_id: number; attempts: number },
    []
  >(
    `SELECT id, food_entry_id, attempts FROM ollama_jobs
     WHERE status = 'pending' AND attempts < ?
     ORDER BY created_at ASC LIMIT 1`
  ).get(MAX_ATTEMPTS);

  if (!job) return;

  db.run(
    `UPDATE ollama_jobs SET status = 'processing', updated_at = datetime('now') WHERE id = ?`,
    [job.id]
  );
  db.run(
    `UPDATE food_entries SET ollama_status = 'processing', updated_at = datetime('now') WHERE id = ?`,
    [job.food_entry_id]
  );

  const entry = db.query<{ photo_path: string | null; user_id: number }, [number]>(
    `SELECT photo_path, user_id FROM food_entries WHERE id = ?`
  ).get(job.food_entry_id);

  if (!entry?.photo_path) {
    db.run(
      `UPDATE ollama_jobs SET status = 'failed', last_error = 'No photo path', updated_at = datetime('now') WHERE id = ?`,
      [job.id]
    );
    return;
  }

  try {
    const result = await analyzeImage(entry.photo_path);

    // Build update for both main and ai_ mirror columns
    const sets: string[] = ["ollama_status = 'done'", "ollama_description = ?", "updated_at = datetime('now')"];
    const vals: (string | number | null)[] = [result.description];

    for (const field of NUTRIENT_FIELDS) {
      const val = result[field as keyof typeof result] as number | null;
      sets.push(`${field} = ?`, `ai_${field} = ?`);
      vals.push(val, val);
    }

    vals.push(job.food_entry_id);
    db.run(`UPDATE food_entries SET ${sets.join(", ")} WHERE id = ?`, vals);

    db.run(
      `UPDATE ollama_jobs SET status = 'done', updated_at = datetime('now') WHERE id = ?`,
      [job.id]
    );

    // Broadcast SSE update to user
    const updatedEntry = db.query(`SELECT * FROM food_entries WHERE id = ?`).get(job.food_entry_id);
    broadcastToUser(entry.user_id, { type: "food_updated", entry: updatedEntry });
    console.log(`[queue] Job ${job.id} done for food entry ${job.food_entry_id}`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const newAttempts = job.attempts + 1;
    const newStatus = newAttempts >= MAX_ATTEMPTS ? "failed" : "pending";
    const foodStatus = newAttempts >= MAX_ATTEMPTS ? "failed" : "pending";

    db.run(
      `UPDATE ollama_jobs SET status = ?, attempts = ?, last_error = ?, updated_at = datetime('now') WHERE id = ?`,
      [newStatus, newAttempts, errMsg, job.id]
    );
    db.run(
      `UPDATE food_entries SET ollama_status = ?, updated_at = datetime('now') WHERE id = ?`,
      [foodStatus, job.food_entry_id]
    );

    if (newStatus === "failed") {
      broadcastToUser(entry.user_id, {
        type: "food_updated",
        entry: db.query(`SELECT * FROM food_entries WHERE id = ?`).get(job.food_entry_id),
      });
      console.error(`[queue] Job ${job.id} permanently failed after ${newAttempts} attempts: ${errMsg}`);
    } else {
      console.warn(`[queue] Job ${job.id} attempt ${newAttempts} failed, will retry: ${errMsg}`);
    }
  }
}

export function enqueueJob(foodEntryId: number) {
  const db = getDb();
  const id = crypto.randomUUID();
  db.run(
    `INSERT INTO ollama_jobs (id, food_entry_id) VALUES (?, ?)`,
    [id, foodEntryId]
  );
  return id;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
