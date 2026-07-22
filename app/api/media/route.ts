import { and, eq } from "drizzle-orm";
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
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return unauthorized();
  await ensureSchema();
  const key = new URL(request.url).searchParams.get("key");
  if (!key) return Response.json({ error: "key is required" }, { status: 400 });
  const record = await env.DB.prepare(`SELECT id FROM product_records
    WHERE workspace_id=? AND json_valid(metadata) AND json_extract(metadata,'$.objectKey')=? LIMIT 1`)
    .bind(user.workspaceId, key).first();
  if (!record) return Response.json({ error: "文件不存在" }, { status: 404 });
  const object = await env.MEDIA.get(key);
  if (!object) return Response.json({ error: "文件不存在" }, { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=3600");
  return new Response(object.body, { headers });
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser(request); if (!user) return unauthorized();
    await ensureSchema();
    const formData = await request.formData();
    const file = formData.get("file");
    const module = String(formData.get("module") || "media");
    const customTitle = String(formData.get("title") || "").trim();
    const customDescription = String(formData.get("description") || "").trim();
    let extraMetadata: Record<string, string> = {};
    try { extraMetadata = JSON.parse(String(formData.get("metadata") || "{}")); } catch { /* 使用空元数据 */ }
    if (!(file instanceof File) || file.size === 0) return Response.json({ error: "请选择文件" }, { status: 400 });
    if (file.size > 500 * 1024 * 1024) return Response.json({ error: "单个文件不能超过 500MB" }, { status: 400 });
    const safeName = file.name.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, "_");
    const safeModule = module.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "media";
    const key = `workspace/${user.workspaceId}/${safeModule}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
    await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type || "application/octet-stream", contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(file.name)}` } });
    const metadata = { ...extraMetadata, objectKey: key, contentType: file.type || "application/octet-stream", size: String(file.size), url: `/api/media?key=${encodeURIComponent(key)}` };
    const [record] = await getDb().insert(productRecords).values({ workspaceId: user.workspaceId, module, title: customTitle || file.name, description: customDescription || `${file.type || "文件"} · ${(file.size / 1024 / 1024).toFixed(2)} MB`, status: "completed", metadata: JSON.stringify(metadata) }).returning();
    return Response.json({ record: { ...record, metadata } }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "上传失败" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getSessionUser(request); if (!user) return unauthorized();
    await ensureSchema();
    const body = await request.json() as { id?: number; module?: string; key?: string };
    if (!body.id || !body.module || !body.key) return Response.json({ error: "参数不完整" }, { status: 400 });
    const [record] = await getDb().select().from(productRecords).where(and(eq(productRecords.id, body.id), eq(productRecords.workspaceId, user.workspaceId), eq(productRecords.module, body.module))).limit(1);
    if (!record) return Response.json({ error: "文件不存在" }, { status: 404 });
    let metadata: Record<string, unknown> = {};
    try { metadata = JSON.parse(record.metadata || "{}"); } catch { return Response.json({ error: "文件记录无效" }, { status: 409 }); }
    if (metadata.objectKey !== body.key) return Response.json({ error: "文件记录不匹配" }, { status: 409 });
    await env.MEDIA.delete(body.key);
    await getDb().delete(productRecords).where(and(eq(productRecords.id, body.id), eq(productRecords.workspaceId, user.workspaceId), eq(productRecords.module, body.module)));
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "删除失败" }, { status: 500 }); }
}
