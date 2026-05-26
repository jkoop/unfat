import { getDb, type User } from "./db.ts";

const SESSION_MAX_AGE = 34560000; // 400 days in seconds

export function generateToken(): string {
  return crypto.randomUUID() + "-" + crypto.randomUUID();
}

export async function createSession(userId: number): Promise<string> {
  const db = getDb();
  const token = generateToken();
  db.run(
    "INSERT INTO sessions (token, user_id) VALUES (?, ?)",
    [token, userId]
  );
  return token;
}

export function getSessionUser(token: string): User | null {
  const db = getDb();
  db.run(
    "UPDATE sessions SET last_seen = datetime('now') WHERE token = ?",
    [token]
  );
  const row = db.query<User, [string]>(`
    SELECT u.* FROM users u
    JOIN sessions s ON s.user_id = u.id
    WHERE s.token = ?
  `).get(token);
  return row ?? null;
}

export function deleteSession(token: string) {
  const db = getDb();
  db.run("DELETE FROM sessions WHERE token = ?", [token]);
}

export function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of cookieHeader.split(";")) {
    const [k, ...vs] = part.trim().split("=");
    if (k) cookies[k.trim()] = decodeURIComponent(vs.join("=").trim());
  }
  return cookies;
}

export function getRequestUser(req: Request): User | null {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const cookies = parseCookies(cookieHeader);
  const token = cookies["session"];
  if (!token) return null;
  return getSessionUser(token);
}

export function sessionCookie(token: string): string {
  return `session=${token}; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}; Path=/`;
}

export function clearSessionCookie(): string {
  return `session=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/`;
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await Bun.password.verify(plain, hash);
  } catch {
    return false;
  }
}

export async function hashPassword(plain: string): Promise<string> {
  return Bun.password.hash(plain);
}

export function redirect(location: string, status = 302): Response {
  return new Response(null, {
    status,
    headers: { Location: location },
  });
}

export function requireAuth(user: User | null): Response | null {
  if (!user) return redirect("/login");
  if (user.is_disabled) return redirect("/disabled");
  return null;
}

export function requireAdmin(user: User | null): Response | null {
  const authCheck = requireAuth(user);
  if (authCheck) return authCheck;
  if (!user!.is_admin) return redirect("/food");
  return null;
}

export function requirePasswordChange(user: User, currentPath: string): Response | null {
  const allowed = ["/change-password", "/logout"];
  if (user.must_change_password && !allowed.some(p => currentPath.startsWith(p))) {
    return redirect("/change-password");
  }
  return null;
}

export function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pass = "";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  for (const b of bytes) pass += chars[b % chars.length];
  return pass;
}
