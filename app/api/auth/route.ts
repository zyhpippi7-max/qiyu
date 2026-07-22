import { env } from "cloudflare:workers";
import {
  createSessionResponse,
  ensureAuthSchema,
  ensurePersonalWorkspace,
  getSessionUser,
  hashPassword,
  logoutResponse,
  normalizePhone,
  verifyPassword,
} from "../../auth-server";

export async function GET(request: Request) {
  await ensureAuthSchema();
  const user = await getSessionUser(request);
  const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>();
  return Response.json({ user, bootstrap: Number(count?.count || 0) === 0 });
}

export async function POST(request: Request) {
  await ensureAuthSchema();
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || "");
  if (action === "logout") return logoutResponse(request);

  const phone = normalizePhone(body.phone);
  const password = String(body.password || "");
  if (!phone) return Response.json({ error: "请输入正确的11位中国大陆手机号" }, { status: 400 });
  if (password.length < 8 || password.length > 72) {
    return Response.json({ error: "密码需为8到72位" }, { status: 400 });
  }

  if (action === "register") {
    const displayName = String(body.displayName || "").trim();
    if (displayName.length < 2 || displayName.length > 30) {
      return Response.json({ error: "姓名或昵称需为2到30个字" }, { status: 400 });
    }
    if (password !== String(body.confirmPassword || "")) {
      return Response.json({ error: "两次输入的密码不一致" }, { status: 400 });
    }
    const exists = await env.DB.prepare("SELECT id FROM users WHERE phone=?").bind(phone).first();
    if (exists) return Response.json({ error: "该手机号已经注册，请直接登录" }, { status: 409 });
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>();
    const role = Number(count?.count || 0) === 0 ? "admin" : "member";
    const inserted = await env.DB.prepare(`INSERT INTO users(phone,password_hash,display_name,role,last_login_at)
      VALUES(?,?,?,?,CURRENT_TIMESTAMP) RETURNING id`).bind(phone, await hashPassword(password), displayName, role).first<{ id: number }>();
    const userId = Number(inserted?.id);
    if (!userId) return Response.json({ error: "账号创建失败" }, { status: 500 });
    const workspace = await ensurePersonalWorkspace(userId, displayName);
    return createSessionResponse(request, userId, {
      ok: true,
      user: { id: userId, phone, displayName, role, planId: null, planName: role === "admin" ? "管理员版" : "免费版", membershipExpiresAt: null, ...workspace },
    }, 201);
  }

  if (action === "login") {
    const row = await env.DB.prepare(`SELECT id,phone,password_hash AS passwordHash,display_name AS displayName,role,status,
      membership_plan_id AS planId,membership_expires_at AS membershipExpiresAt FROM users WHERE phone=? LIMIT 1`)
      .bind(phone).first<Record<string, unknown>>();
    if (!row || !(await verifyPassword(password, String(row.passwordHash || "")))) {
      return Response.json({ error: "手机号或密码不正确" }, { status: 401 });
    }
    if (row.status !== "active") return Response.json({ error: "该账号已被停用，请联系管理员" }, { status: 403 });
    const workspace = await ensurePersonalWorkspace(Number(row.id), String(row.displayName || ""));
    await env.DB.prepare("UPDATE users SET last_login_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.id).run();
    const plan = row.planId ? await env.DB.prepare("SELECT name FROM membership_plans WHERE id=?").bind(row.planId).first<{ name: string }>() : null;
    return createSessionResponse(request, Number(row.id), {
      ok: true,
      user: {
        id: row.id, phone: row.phone, displayName: row.displayName, role: row.role,
        planId: row.planId || null, planName: plan?.name || (row.role === "admin" ? "管理员版" : "免费版"),
        membershipExpiresAt: row.membershipExpiresAt || null, ...workspace,
      },
    });
  }

  return Response.json({ error: "不支持的登录操作" }, { status: 400 });
}
