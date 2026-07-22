import { env } from "cloudflare:workers";
import {
  forbidden,
  getSessionUser,
  hashPassword,
  normalizePhone,
  unauthorized,
} from "../../../auth-server";

type AdminAccess =
  | { user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>> }
  | { response: Response };

async function admin(request: Request): Promise<AdminAccess> {
  const user = await getSessionUser(request);
  if (!user) return { response: unauthorized() };
  if (user.role !== "admin") return { response: forbidden() };
  return { user };
}

function cleanDisplayName(value: unknown) {
  return String(value || "").trim().slice(0, 30);
}

function cleanRole(value: unknown) {
  return value === "admin" ? "admin" : "member";
}

function cleanStatus(value: unknown) {
  return value === "inactive" ? "inactive" : "active";
}

function cleanExpiry(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

async function cleanPlan(value: unknown, role: string) {
  if (role === "admin") return null;
  const id = Number(value || 0);
  if (!Number.isInteger(id) || id <= 0) return null;
  const plan = await env.DB.prepare("SELECT id FROM membership_plans WHERE id=? LIMIT 1").bind(id).first();
  return plan ? id : undefined;
}

export async function GET(request: Request) {
  const access = await admin(request);
  if ("response" in access) return access.response;
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 30) || "";
  const pattern = `%${query}%`;
  const [usersResult, plansResult] = await Promise.all([
    env.DB.prepare(`SELECT u.id,u.phone,u.display_name AS displayName,u.role,u.membership_plan_id AS planId,
      COALESCE(p.name,'') AS planName,u.membership_expires_at AS membershipExpiresAt,u.status,
      u.last_login_at AS lastLoginAt,u.created_at AS createdAt
      FROM users u LEFT JOIN membership_plans p ON p.id=u.membership_plan_id
      WHERE (?='' OR u.phone LIKE ? OR u.display_name LIKE ?)
      ORDER BY CASE WHEN u.role='admin' THEN 0 ELSE 1 END,u.created_at DESC LIMIT 300`)
      .bind(query, pattern, pattern).all(),
    env.DB.prepare(`SELECT id,name,duration_days AS durationDays,status
      FROM membership_plans ORDER BY sort_order,id`).all(),
  ]);
  const users = usersResult.results;
  return Response.json({
    users,
    plans: plansResult.results,
    summary: {
      total: users.length,
      active: users.filter((item) => item.status === "active").length,
      members: users.filter((item) => item.role === "member" && item.planId).length,
      admins: users.filter((item) => item.role === "admin").length,
    },
    currentUserId: access.user.id,
  });
}

export async function POST(request: Request) {
  const access = await admin(request);
  if ("response" in access) return access.response;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || "create");
  const displayName = cleanDisplayName(body.displayName);
  const role = cleanRole(body.role);
  const status = cleanStatus(body.status);
  const expiry = cleanExpiry(body.membershipExpiresAt);
  const planId = await cleanPlan(body.planId, role);

  if (displayName.length < 2) return Response.json({ error: "姓名或昵称需为2到30个字" }, { status: 400 });
  if (expiry === undefined) return Response.json({ error: "会员到期时间格式不正确" }, { status: 400 });
  if (planId === undefined) return Response.json({ error: "选择的会员套餐不存在" }, { status: 400 });

  if (action === "create") {
    const phone = normalizePhone(body.phone);
    const password = String(body.password || "");
    if (!phone) return Response.json({ error: "请输入正确的11位中国大陆手机号" }, { status: 400 });
    if (password.length < 8 || password.length > 72) return Response.json({ error: "初始密码需为8到72位" }, { status: 400 });
    try {
      const inserted = await env.DB.prepare(`INSERT INTO users(
        phone,password_hash,display_name,role,membership_plan_id,membership_expires_at,status
      ) VALUES(?,?,?,?,?,?,?) RETURNING id`)
        .bind(phone, await hashPassword(password), displayName, role, planId, role === "admin" ? null : expiry, status)
        .first<{ id: number }>();
      return Response.json({ ok: true, id: inserted?.id }, { status: 201 });
    } catch {
      return Response.json({ error: "该手机号已经存在，不能重复添加" }, { status: 409 });
    }
  }

  if (action === "update") {
    const id = Number(body.id || 0);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "账号不存在" }, { status: 400 });
    const existing = await env.DB.prepare("SELECT id,role,status FROM users WHERE id=? LIMIT 1").bind(id)
      .first<{ id: number; role: string; status: string }>();
    if (!existing) return Response.json({ error: "账号不存在" }, { status: 404 });
    if (id === access.user.id && (role !== "admin" || status !== "active")) {
      return Response.json({ error: "不能停用当前登录的管理员，也不能取消自己的管理员权限" }, { status: 400 });
    }
    if (existing.role === "admin" && (role !== "admin" || status !== "active")) {
      const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE role='admin' AND status='active'")
        .first<{ count: number }>();
      if (Number(count?.count || 0) <= 1) {
        return Response.json({ error: "必须至少保留一个启用中的管理员账号" }, { status: 400 });
      }
    }

    const password = String(body.password || "");
    if (password && (password.length < 8 || password.length > 72)) {
      return Response.json({ error: "新密码需为8到72位" }, { status: 400 });
    }
    if (password) {
      await env.DB.prepare(`UPDATE users SET display_name=?,role=?,membership_plan_id=?,membership_expires_at=?,
        status=?,password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .bind(displayName, role, planId, role === "admin" ? null : expiry, status, await hashPassword(password), id).run();
      await env.DB.prepare("DELETE FROM auth_sessions WHERE user_id=?").bind(id).run();
    } else {
      await env.DB.prepare(`UPDATE users SET display_name=?,role=?,membership_plan_id=?,membership_expires_at=?,
        status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .bind(displayName, role, planId, role === "admin" ? null : expiry, status, id).run();
      if (status === "inactive") await env.DB.prepare("DELETE FROM auth_sessions WHERE user_id=?").bind(id).run();
    }
    return Response.json({ ok: true });
  }

  return Response.json({ error: "不支持的账号操作" }, { status: 400 });
}
