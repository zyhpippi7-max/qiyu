import { env } from "cloudflare:workers";
import { forbidden, getSessionUser, unauthorized } from "../../../auth-server";

function cleanCode(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);
}

function planBody(body: Record<string, unknown>) {
  const name = String(body.name || "").trim().slice(0, 30);
  const code = cleanCode(body.code);
  const description = String(body.description || "").trim().slice(0, 300);
  const priceCents = Math.max(0, Math.round(Number(body.priceYuan || 0) * 100));
  const durationDays = Math.max(1, Math.min(3650, Math.round(Number(body.durationDays || 30))));
  const deviceLimit = Math.max(1, Math.min(999, Math.round(Number(body.deviceLimit || 1))));
  const aiCredits = Math.max(0, Math.min(100_000_000, Math.round(Number(body.aiCredits || 0))));
  const features = Array.isArray(body.features)
    ? body.features.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 20)
    : String(body.features || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 20);
  const status = body.status === "inactive" ? "inactive" : "active";
  const sortOrder = Math.max(-999, Math.min(999, Math.round(Number(body.sortOrder || 0))));
  return { name, code, description, priceCents, durationDays, deviceLimit, aiCredits, features, status, sortOrder };
}

async function admin(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return { response: unauthorized() };
  if (user.role !== "admin") return { response: forbidden() };
  return { user };
}

export async function GET(request: Request) {
  const access = await admin(request);
  if ("response" in access) return access.response;
  const plans = await env.DB.prepare(`SELECT id,code,name,description,price_cents AS priceCents,duration_days AS durationDays,
    device_limit AS deviceLimit,ai_credits AS aiCredits,features,status,sort_order AS sortOrder,
    created_at AS createdAt,updated_at AS updatedAt FROM membership_plans ORDER BY sort_order,id`).all();
  return Response.json({ plans: plans.results.map((plan) => ({ ...plan, features: JSON.parse(String(plan.features || "[]")) })) });
}

export async function POST(request: Request) {
  const access = await admin(request);
  if ("response" in access) return access.response;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || "save");
  const id = Number(body.id || 0);

  if (action === "toggle") {
    if (!id) return Response.json({ error: "套餐不存在" }, { status: 400 });
    const status = body.status === "inactive" ? "inactive" : "active";
    await env.DB.prepare("UPDATE membership_plans SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status, id).run();
    return Response.json({ ok: true });
  }

  const plan = planBody(body);
  if (!plan.name || !plan.code) return Response.json({ error: "请填写套餐名称和英文编号" }, { status: 400 });
  try {
    if (id) {
      await env.DB.prepare(`UPDATE membership_plans SET code=?,name=?,description=?,price_cents=?,duration_days=?,
        device_limit=?,ai_credits=?,features=?,status=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .bind(plan.code, plan.name, plan.description, plan.priceCents, plan.durationDays, plan.deviceLimit,
          plan.aiCredits, JSON.stringify(plan.features), plan.status, plan.sortOrder, id).run();
    } else {
      await env.DB.prepare(`INSERT INTO membership_plans(code,name,description,price_cents,duration_days,device_limit,
        ai_credits,features,status,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?)`)
        .bind(plan.code, plan.name, plan.description, plan.priceCents, plan.durationDays, plan.deviceLimit,
          plan.aiCredits, JSON.stringify(plan.features), plan.status, plan.sortOrder).run();
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "套餐编号已经存在，请换一个编号" }, { status: 409 });
  }
}
