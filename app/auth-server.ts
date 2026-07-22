import { env } from "cloudflare:workers";

export type AuthUser = {
  id: number;
  phone: string;
  displayName: string;
  role: "admin" | "member";
  planId: number | null;
  planName: string;
  membershipExpiresAt: string | null;
  workspaceId: number;
  workspaceName: string;
  workspaceRole: "owner" | "member";
};

type WorkspaceMembership = Pick<AuthUser, "workspaceId" | "workspaceName" | "workspaceRole">;

const encoder = new TextEncoder();
const SESSION_COOKIE = "qiyu_session";
const SESSION_DAYS = 30;

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomToken(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return bytesToBase64(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password: string) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const iterations = 210_000;
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return `pbkdf2$${iterations}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, iterationText, saltText, expectedText] = stored.split("$");
  if (scheme !== "pbkdf2" || !iterationText || !saltText || !expectedText) return false;
  const iterations = Number(iterationText);
  if (!Number.isInteger(iterations) || iterations < 100_000) return false;
  const salt = base64ToBytes(saltText);
  const expected = base64ToBytes(expectedText);
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, expected.length * 8));
  if (bits.length !== expected.length) return false;
  let different = 0;
  for (let index = 0; index < bits.length; index += 1) different |= bits[index] ^ expected[index];
  return different === 0;
}

export function normalizePhone(value: unknown) {
  let phone = String(value || "").trim().replace(/[\s-]/g, "");
  phone = phone.replace(/^(\+86|0086)/, "");
  return /^1[3-9]\d{9}$/.test(phone) ? phone : "";
}

export async function ensureAuthSchema() {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS membership_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '', price_cents INTEGER NOT NULL DEFAULT 0,
      duration_days INTEGER NOT NULL DEFAULT 30, device_limit INTEGER NOT NULL DEFAULT 1,
      ai_credits INTEGER NOT NULL DEFAULT 0, features TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active', sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', membership_plan_id INTEGER,
      membership_expires_at TEXT, status TEXT NOT NULL DEFAULT 'active', last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, owner_user_id INTEGER NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS workspace_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'member', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(workspace_id, user_id)
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS workspace_members_user_idx ON workspace_members(user_id, workspace_id)"),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS auth_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id, expires_at)"),
  ]);
}

export async function ensurePersonalWorkspace(userId: number, displayName: string): Promise<WorkspaceMembership> {
  const existing = await env.DB.prepare(`SELECT w.id AS workspaceId,w.name AS workspaceName,m.role AS workspaceRole
    FROM workspace_members m JOIN workspaces w ON w.id=m.workspace_id
    WHERE m.user_id=? ORDER BY CASE WHEN m.role='owner' THEN 0 ELSE 1 END,w.id LIMIT 1`)
    .bind(userId).first<WorkspaceMembership>();
  if (existing) return existing;

  await env.DB.prepare("INSERT OR IGNORE INTO workspaces(name,owner_user_id) VALUES(?,?)")
    .bind(`${displayName} 的工作空间`, userId).run();
  const workspace = await env.DB.prepare("SELECT id,name FROM workspaces WHERE owner_user_id=? LIMIT 1")
    .bind(userId).first<{ id: number; name: string }>();
  if (!workspace) throw new Error("无法创建个人工作空间");
  await env.DB.prepare("INSERT OR IGNORE INTO workspace_members(workspace_id,user_id,role) VALUES(?,?,'owner')")
    .bind(workspace.id, userId).run();
  return { workspaceId: workspace.id, workspaceName: workspace.name, workspaceRole: "owner" };
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}

function sessionCookie(request: Request, token: string, maxAge: number) {
  const forwarded = request.headers.get("x-forwarded-proto");
  const secure = forwarded === "https" || new URL(request.url).protocol === "https:";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export async function getSessionUser(request: Request): Promise<AuthUser | null> {
  await ensureAuthSchema();
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`SELECT u.id,u.phone,u.display_name AS displayName,u.role,
      u.membership_plan_id AS planId,u.membership_expires_at AS membershipExpiresAt,
      COALESCE(p.name,'免费版') AS planName
    FROM auth_sessions s JOIN users u ON u.id=s.user_id
    LEFT JOIN membership_plans p ON p.id=u.membership_plan_id
    WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP AND u.status='active' LIMIT 1`)
    .bind(tokenHash).first<Omit<AuthUser, "workspaceId" | "workspaceName" | "workspaceRole">>();
  if (!row) return null;
  await env.DB.prepare("UPDATE auth_sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE token_hash=?").bind(tokenHash).run();
  const workspace = await ensurePersonalWorkspace(row.id, row.displayName);
  return { ...row, ...workspace };
}

export async function createSessionResponse(request: Request, userId: number, body: unknown, status = 200) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  await env.DB.prepare("DELETE FROM auth_sessions WHERE user_id=? OR expires_at<=CURRENT_TIMESTAMP").bind(userId).run();
  await env.DB.prepare(`INSERT INTO auth_sessions(user_id,token_hash,expires_at)
    VALUES(?,?,datetime(CURRENT_TIMESTAMP, ?))`).bind(userId, tokenHash, `+${SESSION_DAYS} days`).run();
  return Response.json(body, { status, headers: { "Set-Cookie": sessionCookie(request, token, SESSION_DAYS * 86400) } });
}

export async function logoutResponse(request: Request) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (token) await env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash=?").bind(await sha256(token)).run();
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(request, "", 0) } });
}

export function unauthorized(message = "请先登录奇遇AI") {
  return Response.json({ error: message }, { status: 401 });
}

export function forbidden(message = "需要管理员权限") {
  return Response.json({ error: message }, { status: 403 });
}
