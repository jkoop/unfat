import { mkdir, rm } from "fs/promises";
import { join } from "path";
import {
  FoodEntry,
  NUTRIENT_FIELDS,
  type SleepEntry,
  type User,
  type WeightEntry,
  getDb,
  getSetting,
  setSetting,
} from "./db.ts";
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  generateTempPassword,
  getRequestUser,
  hashPassword,
  redirect,
  requireAdmin,
  requireAuth,
  requirePasswordChange,
  sessionCookie,
  verifyPassword,
} from "./auth.ts";
import { enqueueJob, startQueue } from "./queue.ts";
import { createSseResponse } from "./sse.ts";
import { extractTakenAt, fromInputValue, nowLocal, toLocalInputValue } from "./exif.ts";
import { loginPage, changePasswordPage, disabledPage } from "./views/login.ts";
import { foodEditPage, foodListPage, foodNewPage } from "./views/food.ts";
import { sleepFormPage, sleepListPage } from "./views/sleep.ts";
import { weightFormPage, weightListPage } from "./views/weight.ts";
import { chartsPage } from "./views/charts.ts";
import { settingsPage } from "./views/settings.ts";
import { adminPage } from "./views/admin.ts";

const DATA_DIR = process.env.DATA_DIR ?? "./data";
const PORT = Number(process.env.PORT ?? "3000");

await mkdir(DATA_DIR, { recursive: true });
await mkdir(join(DATA_DIR, "photos"), { recursive: true });
getDb();
startQueue();

function html(body: string, status = 200, headers: HeadersInit = {}): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", ...headers },
  });
}

function text(body: string, status = 200, headers: HeadersInit = {}): Response {
  return new Response(body, { status, headers });
}

function withFlash(path: string, msg: string, type: "success" | "error" | "info" = "success"): string {
  const u = new URL(path, "http://localhost");
  u.searchParams.set("msg", msg);
  u.searchParams.set("type", type);
  return u.pathname + u.search;
}

function flashFrom(req: Request): { msg?: string; type?: "success" | "error" | "info" } {
  const u = new URL(req.url);
  const msg = u.searchParams.get("msg") ?? undefined;
  const type = (u.searchParams.get("type") as "success" | "error" | "info" | null) ?? undefined;
  return { msg, type };
}

function toNumOrNull(v: FormDataEntryValue | null): number | null {
  if (v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function getTzOffsetMinutes(form: FormData): number | undefined {
  const raw = form.get("tz_offset_min");
  if (raw === null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function staticFile(pathname: string): Response | null {
  const publicFile = join(process.cwd(), "public", pathname.replace(/^\/+/, ""));
  const file = Bun.file(publicFile);
  if (file.size === 0 && pathname !== "/sw.js") return null;
  return new Response(file);
}

async function parseForm(req: Request): Promise<FormData> {
  return req.formData();
}

function ownFoodEntry(user: User, id: number): FoodEntry | null {
  const db = getDb();
  return db.query<FoodEntry, [number, number]>(
    "SELECT * FROM food_entries WHERE id = ? AND user_id = ?"
  ).get(id, user.id);
}

Bun.serve({
  port: PORT,
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method.toUpperCase();
    const db = getDb();

    // Static assets.
    if (
      path === "/app.css" ||
      path === "/app.js" ||
      path === "/manifest.json" ||
      path === "/sw.js" ||
      path === "/offline.html" ||
      path === "/icon-192.svg" ||
      path === "/icon-512.svg"
    ) {
      const fileRes = staticFile(path);
      return fileRes ?? text("Not found", 404);
    }

    // Public routes.
    if (path === "/login" && method === "GET") {
      return html(loginPage({ error: url.searchParams.get("error") ?? undefined, redirect: url.searchParams.get("redirect") ?? undefined }));
    }
    if (path === "/login" && method === "POST") {
      const form = await parseForm(req);
      const username = String(form.get("username") ?? "").trim();
      const password = String(form.get("password") ?? "");
      const user = db.query<User, [string]>("SELECT * FROM users WHERE username = ?").get(username);
      if (!user || !(await verifyPassword(password, user.password_hash))) {
        return html(loginPage({ error: "Invalid username or password." }), 401);
      }
      if (user.is_disabled) return html(disabledPage(), 403);
      const token = await createSession(user.id);
      const target = String(form.get("redirect") ?? "/food");
      return new Response(null, {
        status: 302,
        headers: {
          Location: target.startsWith("/") ? target : "/food",
          "Set-Cookie": sessionCookie(token),
        },
      });
    }

    const user = getRequestUser(req);

    if (path === "/" && method === "GET") {
      return redirect(user ? "/food" : "/login");
    }

    if (path.startsWith("/photos/")) {
      const auth = requireAuth(user);
      if (auth) return auth;
      const rel = decodeURIComponent(path.slice("/photos/".length));
      if (!user!.is_admin && !rel.startsWith(`${user!.id}/`)) return text("Forbidden", 403);
      const file = Bun.file(join(DATA_DIR, "photos", rel));
      return new Response(file);
    }

    if (path === "/disabled" && method === "GET") return html(disabledPage());
    if (path === "/logout" && method === "POST") {
      const cookieHeader = req.headers.get("cookie") ?? "";
      const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
      if (match) deleteSession(decodeURIComponent(match[1]));
      return new Response(null, { status: 302, headers: { Location: "/login", "Set-Cookie": clearSessionCookie() } });
    }

    const auth = requireAuth(user);
    if (auth) return auth;
    const pwGate = requirePasswordChange(user!, path);
    if (pwGate) return pwGate;

    if (path === "/change-password" && method === "GET") {
      return html(changePasswordPage({ isFirstLogin: !!user!.must_change_password }));
    }
    if (path === "/change-password" && method === "POST") {
      const form = await parseForm(req);
      const password = String(form.get("password") ?? "");
      const confirm = String(form.get("confirm") ?? "");
      if (password.length < 8) return html(changePasswordPage({ error: "Password must be at least 8 characters.", isFirstLogin: !!user!.must_change_password }), 400);
      if (password !== confirm) return html(changePasswordPage({ error: "Passwords do not match.", isFirstLogin: !!user!.must_change_password }), 400);
      const hash = await hashPassword(password);
      db.run("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?", [hash, user!.id]);
      return redirect(withFlash("/food", "Password changed."));
    }

    if (path === "/sse" && method === "GET") {
      return createSseResponse(user!.id);
    }

    // Food routes.
    if (path === "/food" && method === "GET") {
      const entries = db.query<FoodEntry, [number]>("SELECT * FROM food_entries WHERE user_id = ? ORDER BY taken_at DESC, id DESC").all(user!.id);
      const f = flashFrom(req);
      return html(foodListPage({ user: user!, entries, flash: f.msg, flashType: f.type }));
    }
    if (path === "/food/new" && method === "GET") {
      return html(foodNewPage({ user: user! }));
    }
    if (path === "/food" && method === "POST") {
      const form = await parseForm(req);
      const desc = String(form.get("description") ?? "").trim() || null;
      const takenInput = String(form.get("taken_at") ?? "").trim();
      const tzOffset = getTzOffsetMinutes(form);
      const file = form.get("photo");
      let takenAt = takenInput ? fromInputValue(takenInput, tzOffset) : nowLocal();
      let photoPath: string | null = null;
      let status = "no_photo";

      if (file instanceof File && file.size > 0) {
        const ext = ".jpg";
        const relPath = `${user!.id}/${crypto.randomUUID()}${ext}`;
        const fullDir = join(DATA_DIR, "photos", String(user!.id));
        await mkdir(fullDir, { recursive: true });
        const buf = await file.arrayBuffer();
        await Bun.write(join(DATA_DIR, "photos", relPath), new Uint8Array(buf));
        photoPath = relPath;
        takenAt = await extractTakenAt(buf);
        status = "pending";
      }

      db.run(
        `INSERT INTO food_entries (user_id, taken_at, photo_path, description, ollama_status)
         VALUES (?, ?, ?, ?, ?)`,
        [user!.id, takenAt, photoPath, desc, status]
      );
      const row = db.query<{ id: number }, []>("SELECT last_insert_rowid() AS id").get();
      const id = row?.id ?? 0;
      if (photoPath && id) enqueueJob(id);
      return redirect(withFlash("/food", "Entry saved.", "success"));
    }
    const foodEditMatch = path.match(/^\/food\/(\d+)\/edit$/);
    if (foodEditMatch && method === "GET") {
      const id = Number(foodEditMatch[1]);
      const entry = ownFoodEntry(user!, id);
      if (!entry) return text("Not found", 404);
      return html(foodEditPage({ user: user!, entry, error: url.searchParams.get("error") ?? undefined }));
    }
    if (foodEditMatch && method === "POST") {
      const id = Number(foodEditMatch[1]);
      const entry = ownFoodEntry(user!, id);
      if (!entry) return text("Not found", 404);
      const form = await parseForm(req);
      const tzOffset = getTzOffsetMinutes(form);
      const takenAt = fromInputValue(String(form.get("taken_at") ?? toLocalInputValue(entry.taken_at)), tzOffset);
      const description = String(form.get("description") ?? "").trim() || null;

      const sets = ["taken_at = ?", "description = ?", "updated_at = datetime('now')"];
      const vals: (string | number | null)[] = [takenAt, description];
      for (const f of NUTRIENT_FIELDS) {
        sets.push(`${f} = ?`);
        vals.push(toNumOrNull(form.get(f)));
      }
      vals.push(id, user!.id);
      db.run(`UPDATE food_entries SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`, vals);
      return redirect(withFlash("/food", "Entry updated.", "success"));
    }
    const foodDeleteMatch = path.match(/^\/food\/(\d+)\/delete$/);
    if (foodDeleteMatch && method === "POST") {
      const id = Number(foodDeleteMatch[1]);
      const entry = ownFoodEntry(user!, id);
      if (!entry) return text("Not found", 404);
      if (entry.photo_path) await rm(join(DATA_DIR, "photos", entry.photo_path), { force: true });
      db.run("DELETE FROM food_entries WHERE id = ? AND user_id = ?", [id, user!.id]);
      return redirect(withFlash("/food", "Entry deleted.", "success"));
    }
    const foodRevertMatch = path.match(/^\/food\/(\d+)\/revert$/);
    if (foodRevertMatch && method === "POST") {
      const id = Number(foodRevertMatch[1]);
      const entry = ownFoodEntry(user!, id);
      if (!entry) return text("Not found", 404);
      const setExpr = NUTRIENT_FIELDS.map((f) => `${f} = ai_${f}`).join(", ");
      db.run(`UPDATE food_entries SET ${setExpr}, updated_at = datetime('now') WHERE id = ? AND user_id = ?`, [id, user!.id]);
      return redirect(withFlash(`/food/${id}/edit`, "Reverted to AI estimate.", "info"));
    }
    const foodRetryMatch = path.match(/^\/food\/(\d+)\/retry-ai$/);
    if (foodRetryMatch && method === "POST") {
      const id = Number(foodRetryMatch[1]);
      const entry = ownFoodEntry(user!, id);
      if (!entry) return text("Not found", 404);
      if (!entry.photo_path) {
        return redirect(withFlash("/food", "Cannot retry AI without a photo.", "error"));
      }
      db.run(
        `UPDATE food_entries
         SET ollama_status = 'pending', updated_at = datetime('now')
         WHERE id = ? AND user_id = ?`,
        [id, user!.id]
      );
      enqueueJob(id);
      return redirect(withFlash("/food", "AI retry queued.", "info"));
    }

    // Sleep routes.
    if (path === "/sleep" && method === "GET") {
      const entries = db.query<SleepEntry, [number]>("SELECT * FROM sleep_entries WHERE user_id = ? ORDER BY start_time DESC, id DESC").all(user!.id);
      const f = flashFrom(req);
      return html(sleepListPage({ user: user!, entries, flash: f.msg, flashType: f.type }));
    }
    if (path === "/sleep/new" && method === "GET") return html(sleepFormPage({ user: user! }));
    if (path === "/sleep" && method === "POST") {
      const form = await parseForm(req);
      const tzOffset = getTzOffsetMinutes(form);
      const start = fromInputValue(String(form.get("start_time")), tzOffset);
      const end = fromInputValue(String(form.get("end_time")), tzOffset);
      const score = Math.max(1, Math.min(10, Number(form.get("score") ?? 7)));
      db.run("INSERT INTO sleep_entries (user_id, start_time, end_time, score) VALUES (?, ?, ?, ?)", [user!.id, start, end, score]);
      return redirect(withFlash("/sleep", "Sleep entry saved."));
    }
    const sleepEditMatch = path.match(/^\/sleep\/(\d+)\/edit$/);
    if (sleepEditMatch && method === "GET") {
      const entry = db.query<SleepEntry, [number, number]>("SELECT * FROM sleep_entries WHERE id = ? AND user_id = ?").get(Number(sleepEditMatch[1]), user!.id);
      if (!entry) return text("Not found", 404);
      return html(sleepFormPage({ user: user!, entry }));
    }
    if (sleepEditMatch && method === "POST") {
      const id = Number(sleepEditMatch[1]);
      const form = await parseForm(req);
      const tzOffset = getTzOffsetMinutes(form);
      const start = fromInputValue(String(form.get("start_time")), tzOffset);
      const end = fromInputValue(String(form.get("end_time")), tzOffset);
      const score = Math.max(1, Math.min(10, Number(form.get("score") ?? 7)));
      db.run("UPDATE sleep_entries SET start_time = ?, end_time = ?, score = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?", [start, end, score, id, user!.id]);
      return redirect(withFlash("/sleep", "Sleep entry updated."));
    }
    const sleepDeleteMatch = path.match(/^\/sleep\/(\d+)\/delete$/);
    if (sleepDeleteMatch && method === "POST") {
      db.run("DELETE FROM sleep_entries WHERE id = ? AND user_id = ?", [Number(sleepDeleteMatch[1]), user!.id]);
      return redirect(withFlash("/sleep", "Sleep entry deleted."));
    }

    // Weight routes.
    if (path === "/weight" && method === "GET") {
      const entries = db.query<WeightEntry, [number]>("SELECT * FROM weight_entries WHERE user_id = ? ORDER BY measured_at DESC, id DESC").all(user!.id);
      const f = flashFrom(req);
      return html(weightListPage({ user: user!, entries, flash: f.msg, flashType: f.type }));
    }
    if (path === "/weight/new" && method === "GET") return html(weightFormPage({ user: user! }));
    if (path === "/weight" && method === "POST") {
      const form = await parseForm(req);
      const tzOffset = getTzOffsetMinutes(form);
      const measuredAt = fromInputValue(String(form.get("measured_at")), tzOffset);
      const weight = Number(form.get("weight"));
      if (!Number.isFinite(weight) || weight <= 0) return html(weightFormPage({ user: user!, error: "Weight must be a positive number." }), 400);
      db.run("INSERT INTO weight_entries (user_id, weight, measured_at) VALUES (?, ?, ?)", [user!.id, weight, measuredAt]);
      return redirect(withFlash("/weight", "Weight entry saved."));
    }
    const weightEditMatch = path.match(/^\/weight\/(\d+)\/edit$/);
    if (weightEditMatch && method === "GET") {
      const entry = db.query<WeightEntry, [number, number]>("SELECT * FROM weight_entries WHERE id = ? AND user_id = ?").get(Number(weightEditMatch[1]), user!.id);
      if (!entry) return text("Not found", 404);
      return html(weightFormPage({ user: user!, entry }));
    }
    if (weightEditMatch && method === "POST") {
      const id = Number(weightEditMatch[1]);
      const form = await parseForm(req);
      const tzOffset = getTzOffsetMinutes(form);
      const measuredAt = fromInputValue(String(form.get("measured_at")), tzOffset);
      const weight = Number(form.get("weight"));
      if (!Number.isFinite(weight) || weight <= 0) return html(weightFormPage({ user: user!, error: "Weight must be a positive number." }), 400);
      db.run("UPDATE weight_entries SET weight = ?, measured_at = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?", [weight, measuredAt, id, user!.id]);
      return redirect(withFlash("/weight", "Weight entry updated."));
    }
    const weightDeleteMatch = path.match(/^\/weight\/(\d+)\/delete$/);
    if (weightDeleteMatch && method === "POST") {
      db.run("DELETE FROM weight_entries WHERE id = ? AND user_id = ?", [Number(weightDeleteMatch[1]), user!.id]);
      return redirect(withFlash("/weight", "Weight entry deleted."));
    }

    // Charts.
    if (path === "/charts" && method === "GET") {
      const daysParam = Number(url.searchParams.get("days") ?? 15);
      const days = [7, 15, 30, 90].includes(daysParam) ? daysParam : 15;

      let fromIso = url.searchParams.get("from");
      let toIso = url.searchParams.get("to");
      if (!fromIso || !toIso) {
        const toDate = new Date();
        const fromDate = new Date(toDate.getTime() - (days - 1) * 86400000);
        fromIso = fromDate.toISOString().slice(0, 10);
        toIso = toDate.toISOString().slice(0, 10);
      }
      const fromSql = `${fromIso} 00:00:00`;
      const toSql = `${toIso} 23:59:59`;

      const foods = db.query<FoodEntry, [number, string, string]>(
        `SELECT * FROM food_entries WHERE user_id = ? AND taken_at BETWEEN ? AND ? ORDER BY taken_at ASC`
      ).all(user!.id, fromSql, toSql);
      const sleeps = db.query<SleepEntry, [number, string, string]>(
        `SELECT * FROM sleep_entries WHERE user_id = ? AND start_time BETWEEN ? AND ? ORDER BY start_time ASC`
      ).all(user!.id, fromSql, toSql);
      const weights = db.query<WeightEntry, [number, string, string]>(
        `SELECT * FROM weight_entries WHERE user_id = ? AND measured_at BETWEEN ? AND ? ORDER BY measured_at ASC`
      ).all(user!.id, fromSql, toSql);

      const nutrientMap: Record<string, (number | null)[]> = {};
      for (const f of NUTRIENT_FIELDS) nutrientMap[f] = foods.map((r) => r[f]);

      return html(
        chartsPage({
          user: user!,
          days,
          from: fromIso,
          to: toIso,
          data: {
            foodDates: foods.map((r) => r.taken_at.slice(0, 16).replace("T", " ")),
            nutrients: nutrientMap,
            sleepDates: sleeps.map((r) => r.start_time.slice(0, 16).replace("T", " ")),
            sleepStart: sleeps.map((r) => r.start_time),
            sleepEnd: sleeps.map((r) => r.end_time),
            sleepScore: sleeps.map((r) => r.score),
            weightDates: weights.map((r) => r.measured_at.slice(0, 16).replace("T", " ")),
            weightValues: weights.map((r) => r.weight),
          },
        })
      );
    }

    // User settings.
    if (path === "/settings" && method === "GET") {
      const refreshed = db.query<User, [number]>("SELECT * FROM users WHERE id = ?").get(user!.id) ?? user!;
      const f = flashFrom(req);
      return html(settingsPage({ user: refreshed, flash: f.msg, flashType: f.type }));
    }
    if (path === "/settings" && method === "POST") {
      const form = await parseForm(req);
      db.run(
        `UPDATE users
         SET unit_mass = ?, unit_volume = ?, unit_water = ?, unit_food_weight = ?, unit_user_weight = ?
         WHERE id = ?`,
        [
          String(form.get("unit_mass") ?? "g"),
          String(form.get("unit_volume") ?? "ml"),
          String(form.get("unit_water") ?? "fl oz"),
          String(form.get("unit_food_weight") ?? "g"),
          String(form.get("unit_user_weight") ?? "lbs"),
          user!.id,
        ]
      );
      return redirect(withFlash("/settings", "Settings saved."));
    }

    // Admin routes.
    if (path.startsWith("/admin")) {
      const adminGuard = requireAdmin(user);
      if (adminGuard) return adminGuard;
    }
    if (path === "/admin" && method === "GET") {
      const users = db.query("SELECT id, username, is_admin, is_disabled, created_at FROM users ORDER BY username ASC").all() as {
        id: number; username: string; is_admin: number; is_disabled: number; created_at: string;
      }[];
      const f = flashFrom(req);
      return html(adminPage({
        user: user!,
        users,
        ollamaUrl: getSetting("ollama_url") ?? "http://localhost:11434",
        ollamaModel: getSetting("ollama_model") ?? "llava",
        flashMessage: f.msg,
        flashType: f.type,
        tempPassword: url.searchParams.get("temp") ?? undefined,
      }));
    }
    if (path === "/admin/users/create" && method === "POST") {
      const form = await parseForm(req);
      const username = String(form.get("username") ?? "").trim();
      const password = String(form.get("password") ?? "");
      if (!username || password.length < 8) {
        return redirect(withFlash("/admin", "Username required and password must be at least 8 characters.", "error"));
      }
      const hash = await hashPassword(password);
      try {
        db.run("INSERT INTO users (username, password_hash) VALUES (?, ?)", [username, hash]);
      } catch {
        return redirect(withFlash("/admin", "Username already exists.", "error"));
      }
      return redirect(withFlash("/admin", "User created.", "success"));
    }
    const adminResetMatch = path.match(/^\/admin\/users\/(\d+)\/reset-password$/);
    if (adminResetMatch && method === "POST") {
      const uid = Number(adminResetMatch[1]);
      const temp = generateTempPassword();
      const hash = await hashPassword(temp);
      db.run("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?", [hash, uid]);
      return redirect(`/admin?msg=${encodeURIComponent("Password reset.")}&type=info&temp=${encodeURIComponent(temp)}`);
    }
    const adminDisableMatch = path.match(/^\/admin\/users\/(\d+)\/disable$/);
    if (adminDisableMatch && method === "POST") {
      db.run("UPDATE users SET is_disabled = 1 WHERE id = ? AND is_admin = 0", [Number(adminDisableMatch[1])]);
      return redirect(withFlash("/admin", "User disabled.", "info"));
    }
    const adminEnableMatch = path.match(/^\/admin\/users\/(\d+)\/enable$/);
    if (adminEnableMatch && method === "POST") {
      db.run("UPDATE users SET is_disabled = 0 WHERE id = ?", [Number(adminEnableMatch[1])]);
      return redirect(withFlash("/admin", "User enabled.", "success"));
    }
    const adminDeleteMatch = path.match(/^\/admin\/users\/(\d+)\/delete$/);
    if (adminDeleteMatch && method === "POST") {
      const uid = Number(adminDeleteMatch[1]);
      if (uid === user!.id) return redirect(withFlash("/admin", "You cannot delete yourself.", "error"));
      await rm(join(DATA_DIR, "photos", String(uid)), { force: true, recursive: true });
      db.run("DELETE FROM users WHERE id = ?", [uid]);
      return redirect(withFlash("/admin", "User and related data deleted.", "success"));
    }
    if (path === "/admin/settings" && method === "POST") {
      const form = await parseForm(req);
      const ollamaUrl = String(form.get("ollama_url") ?? "").trim();
      const ollamaModel = String(form.get("ollama_model") ?? "").trim();
      if (!ollamaUrl || !ollamaModel) return redirect(withFlash("/admin", "Ollama URL and model are required.", "error"));
      setSetting("ollama_url", ollamaUrl);
      setSetting("ollama_model", ollamaModel);
      return redirect(withFlash("/admin", "Ollama settings saved."));
    }

    return text("Not found", 404);
  },
});

console.log(`Unfat listening on http://0.0.0.0:${PORT}`);
