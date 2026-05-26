import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

type Session = {
  cookie: string;
};

let serverProc: Bun.Subprocess;
let baseUrl: string;
let dataDir: string;
const ADMIN_NEW_PASSWORD = "adminpass123";

async function waitForServer(url: string, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/login`);
      if (res.status === 200) return;
    } catch {
      // retry
    }
    await Bun.sleep(150);
  }
  throw new Error("Server did not become ready in time");
}

async function request(path: string, opts?: {
  method?: string;
  session?: Session | null;
  form?: Record<string, string>;
  followRedirects?: boolean;
}) {
  const method = opts?.method ?? "GET";
  const headers: Record<string, string> = {};
  let body: string | undefined;

  if (opts?.form) {
    body = new URLSearchParams(opts.form).toString();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  if (opts?.session?.cookie) {
    headers["Cookie"] = opts.session.cookie;
  }

  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body,
    redirect: opts?.followRedirects === false ? "manual" : "follow",
  });
}

function extractSessionCookie(setCookie: string | null): string {
  if (!setCookie) throw new Error("No set-cookie header present");
  const sessionPart = setCookie.split(", ").find((p) => p.startsWith("session=")) ?? setCookie;
  return sessionPart.split(";")[0];
}

function extractIdByAction(html: string, actionPrefix: string): number {
  const re = new RegExp(`${actionPrefix}/(\\d+)/`);
  const match = html.match(re);
  if (!match) throw new Error(`Failed to find ID for prefix ${actionPrefix}`);
  return Number(match[1]);
}

async function loginAdminSession(): Promise<Session> {
  for (let i = 0; i < 30; i++) {
    for (const password of ["admin", ADMIN_NEW_PASSWORD]) {
      const loginRes = await request("/login", {
        method: "POST",
        form: { username: "admin", password },
        followRedirects: false,
      });
      if (loginRes.status !== 302) continue;
      const session = { cookie: extractSessionCookie(loginRes.headers.get("set-cookie")) };

      const probe = await request("/food", { session, followRedirects: false });
      if (probe.status === 302 && probe.headers.get("location") === "/change-password") {
        const cpSubmit = await request("/change-password", {
          method: "POST",
          session,
          form: { password: ADMIN_NEW_PASSWORD, confirm: ADMIN_NEW_PASSWORD },
          followRedirects: false,
        });
        if (cpSubmit.status === 302) return session;
        continue;
      }

      if (probe.status === 200) return session;
    }
    await Bun.sleep(100);
  }
  throw new Error("Unable to log in as admin");
}

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "unfat-test-"));
  const port = 4311;
  baseUrl = `http://127.0.0.1:${port}`;

  serverProc = Bun.spawn({
    cmd: ["bun", "src/index.ts"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  await waitForServer(baseUrl);
});

afterAll(async () => {
  serverProc.kill();
  await serverProc.exited;
  await rm(dataDir, { recursive: true, force: true });
});

test("basic smoke: load all pages and submit all forms", async () => {
  const login = await request("/login");
  expect(login.status).toBe(200);
  expect(await login.text()).toContain("Unfat");

  const disabled = await request("/disabled");
  expect(disabled.status).toBe(200);
});

test("auth flow: login, change password gate, logout", async () => {
  const adminSession = await loginAdminSession();

  const food = await request("/food", { session: adminSession });
  expect(food.status).toBe(200);

  const logout = await request("/logout", {
    method: "POST",
    session: adminSession,
    form: {},
    followRedirects: false,
  });
  expect(logout.status).toBe(302);
});

test("page loads: authenticated pages render", async () => {
  const adminSession = await loginAdminSession();
  for (const p of ["/food", "/food/new", "/sleep", "/sleep/new", "/weight", "/weight/new", "/charts", "/settings", "/admin"]) {
    const res = await request(p, { session: adminSession });
    expect(res.status).toBe(200);
  }
});

test("food forms: create, edit, revert, delete", async () => {
  const adminSession = await loginAdminSession();

  const saveFood = await request("/food", {
    method: "POST",
    session: adminSession,
    form: {
      taken_at: "2026-05-25T20:00",
      description: "Test meal split",
    },
    followRedirects: false,
  });
  expect(saveFood.status).toBe(302);

  const foodList = await request("/food", { session: adminSession });
  const foodHtml = await foodList.text();
  expect(foodHtml).toContain("Test meal split");
  const foodId = extractIdByAction(foodHtml, "/food");

  const foodEditPage = await request(`/food/${foodId}/edit`, { session: adminSession });
  expect(foodEditPage.status).toBe(200);
  expect(await foodEditPage.text()).toContain("Water (g)");

  const foodEdit = await request(`/food/${foodId}/edit`, {
    method: "POST",
    session: adminSession,
    form: {
      taken_at: "2026-05-25T20:15",
      description: "Updated test meal split",
      calories_kcal: "450",
      water_g: "120",
      salt_mg: "600",
      sugar_g: "12",
      fibre_g: "5",
      caffeine_mg: "0",
      calcium_mg: "25",
      iron_mg: "2",
      magnesium_mg: "20",
      potassium_mg: "180",
      zinc_mg: "1",
      vitamin_a_mcg: "30",
      vitamin_c_mg: "8",
      vitamin_d_mcg: "0",
      vitamin_e_mg: "1",
      vitamin_b12_mcg: "0.3",
    },
    followRedirects: false,
  });
  expect(foodEdit.status).toBe(302);

  const foodRevert = await request(`/food/${foodId}/revert`, {
    method: "POST",
    session: adminSession,
    form: {},
    followRedirects: false,
  });
  expect(foodRevert.status).toBe(302);

  const foodRetry = await request(`/food/${foodId}/retry-ai`, {
    method: "POST",
    session: adminSession,
    form: {},
    followRedirects: false,
  });
  expect(foodRetry.status).toBe(302);

  const foodDelete = await request(`/food/${foodId}/delete`, {
    method: "POST",
    session: adminSession,
    form: {},
    followRedirects: false,
  });
  expect(foodDelete.status).toBe(302);
});

test("sleep forms: create, edit, delete", async () => {
  const adminSession = await loginAdminSession();
  const sleepCreate = await request("/sleep", {
    method: "POST",
    session: adminSession,
    form: {
      start_time: "2026-05-24T23:00",
      end_time: "2026-05-25T07:00",
      score: "8",
    },
    followRedirects: false,
  });
  expect(sleepCreate.status).toBe(302);

  const sleepList = await request("/sleep", { session: adminSession });
  const sleepHtml = await sleepList.text();
  const sleepId = extractIdByAction(sleepHtml, "/sleep");

  const sleepEditPage = await request(`/sleep/${sleepId}/edit`, { session: adminSession });
  expect(sleepEditPage.status).toBe(200);

  const sleepEdit = await request(`/sleep/${sleepId}/edit`, {
    method: "POST",
    session: adminSession,
    form: {
      start_time: "2026-05-24T23:30",
      end_time: "2026-05-25T07:15",
      score: "7",
    },
    followRedirects: false,
  });
  expect(sleepEdit.status).toBe(302);

  const sleepDelete = await request(`/sleep/${sleepId}/delete`, {
    method: "POST",
    session: adminSession,
    form: {},
    followRedirects: false,
  });
  expect(sleepDelete.status).toBe(302);
});

test("weight forms: create, edit, delete", async () => {
  const adminSession = await loginAdminSession();
  const weightCreate = await request("/weight", {
    method: "POST",
    session: adminSession,
    form: {
      measured_at: "2026-05-25T08:00",
      weight: "178.4",
    },
    followRedirects: false,
  });
  expect(weightCreate.status).toBe(302);

  const weightList = await request("/weight", { session: adminSession });
  const weightHtml = await weightList.text();
  const weightId = extractIdByAction(weightHtml, "/weight");

  const weightEditPage = await request(`/weight/${weightId}/edit`, { session: adminSession });
  expect(weightEditPage.status).toBe(200);

  const weightEdit = await request(`/weight/${weightId}/edit`, {
    method: "POST",
    session: adminSession,
    form: {
      measured_at: "2026-05-25T09:00",
      weight: "177.9",
    },
    followRedirects: false,
  });
  expect(weightEdit.status).toBe(302);

  const weightDelete = await request(`/weight/${weightId}/delete`, {
    method: "POST",
    session: adminSession,
    form: {},
    followRedirects: false,
  });
  expect(weightDelete.status).toBe(302);
});

test("settings form: update units", async () => {
  const adminSession = await loginAdminSession();
  const settingsSave = await request("/settings", {
    method: "POST",
    session: adminSession,
    form: {
      unit_mass: "kg",
      unit_volume: "ml",
      unit_water: "fl oz",
      unit_food_weight: "g",
      unit_user_weight: "lbs",
    },
    followRedirects: false,
  });
  expect(settingsSave.status).toBe(302);
});

test("admin forms: create user, reset, disable/enable, settings, delete", async () => {
  const adminSession = await loginAdminSession();
  const username = `basicuser_${Date.now()}`;

  const createUser = await request("/admin/users/create", {
    method: "POST",
    session: adminSession,
    form: {
      username,
      password: "basicpass123",
    },
    followRedirects: false,
  });
  expect(createUser.status).toBe(302);

  const adminPageRes = await request("/admin", { session: adminSession });
  const adminHtml = await adminPageRes.text();
  expect(adminHtml).toContain(username);
  const userIdMatch = adminHtml.match(new RegExp(`/admin/users/(\\d+)/reset-password[^\\n]*${username}`)) ?? adminHtml.match(/\/admin\/users\/(\d+)\/reset-password/);
  expect(userIdMatch).not.toBeNull();
  const basicUserId = Number(userIdMatch![1]);

  const resetPass = await request(`/admin/users/${basicUserId}/reset-password`, {
    method: "POST",
    session: adminSession,
    form: {},
    followRedirects: false,
  });
  expect(resetPass.status).toBe(302);

  const disableUser = await request(`/admin/users/${basicUserId}/disable`, {
    method: "POST",
    session: adminSession,
    form: {},
    followRedirects: false,
  });
  expect(disableUser.status).toBe(302);

  const enableUser = await request(`/admin/users/${basicUserId}/enable`, {
    method: "POST",
    session: adminSession,
    form: {},
    followRedirects: false,
  });
  expect(enableUser.status).toBe(302);

  const saveAdminSettings = await request("/admin/settings", {
    method: "POST",
    session: adminSession,
    form: {
      ollama_url: "http://ollama:11434",
      ollama_model: "llava:7b",
    },
    followRedirects: false,
  });
  expect(saveAdminSettings.status).toBe(302);

  const deleteUser = await request(`/admin/users/${basicUserId}/delete`, {
    method: "POST",
    session: adminSession,
    form: {},
    followRedirects: false,
  });
  expect(deleteUser.status).toBe(302);
});
