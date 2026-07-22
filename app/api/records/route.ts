import { and, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { productRecords } from "../../../db/schema";
import { getSessionUser, unauthorized } from "../../auth-server";

async function ensureSchema() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS product_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL DEFAULT 0,
    module TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS product_records_workspace_module_idx ON product_records (workspace_id,module)").run();
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "服务器处理失败";
  return Response.json({ error: message }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const user = await getSessionUser(request); if (!user) return unauthorized();
    await ensureSchema();
    const module = new URL(request.url).searchParams.get("module")?.trim();
    if (!module) return Response.json({ error: "module is required" }, { status: 400 });
    const rows = await getDb().select().from(productRecords).where(and(eq(productRecords.workspaceId, user.workspaceId), eq(productRecords.module, module))).orderBy(desc(productRecords.updatedAt), desc(productRecords.id));
    return Response.json({ records: rows.map(row => ({ ...row, metadata: JSON.parse(row.metadata || "{}") })) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser(request); if (!user) return unauthorized();
    await ensureSchema();
    const body = await request.json() as { module?: string; title?: string; description?: string; status?: string; metadata?: Record<string, string> };
    const module = body.module?.trim() || "";
    const title = body.title?.trim() || "";
    if (!module || !title) return Response.json({ error: "模块和名称不能为空" }, { status: 400 });
    const [record] = await getDb().insert(productRecords).values({ workspaceId: user.workspaceId, module, title, description: body.description?.trim() || "", status: body.status || "draft", metadata: JSON.stringify(body.metadata || {}) }).returning();
    return Response.json({ record: { ...record, metadata: JSON.parse(record.metadata) } }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const user = await getSessionUser(request); if (!user) return unauthorized();
    await ensureSchema();
    const body = await request.json() as { id?: number; module?: string; title?: string; description?: string; status?: string; metadata?: Record<string, string> };
    if (!body.id || !body.module || !body.title?.trim()) return Response.json({ error: "记录参数不完整" }, { status: 400 });
    const [record] = await getDb().update(productRecords).set({ title: body.title.trim(), description: body.description?.trim() || "", status: body.status || "draft", metadata: JSON.stringify(body.metadata || {}), updatedAt: new Date().toISOString() }).where(and(eq(productRecords.id, body.id), eq(productRecords.workspaceId, user.workspaceId), eq(productRecords.module, body.module))).returning();
    if (!record) return Response.json({ error: "记录不存在" }, { status: 404 });
    return Response.json({ record: { ...record, metadata: JSON.parse(record.metadata) } });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const user = await getSessionUser(request); if (!user) return unauthorized();
    await ensureSchema();
    const body = await request.json() as { id?: number; module?: string };
    if (!body.id || !body.module) return Response.json({ error: "记录参数不完整" }, { status: 400 });
    const deleted = await getDb().delete(productRecords).where(and(eq(productRecords.id, body.id), eq(productRecords.workspaceId, user.workspaceId), eq(productRecords.module, body.module))).returning({ id: productRecords.id });
    if (!deleted.length) return Response.json({ error: "记录不存在" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
