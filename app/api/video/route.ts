import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { productRecords } from "../../../db/schema";
import { getSessionUser, unauthorized } from "../../auth-server";

const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const DEFAULT_MODEL = "doubao-seedance-2-0-260128";
const MODULE = "video";

type RuntimeEnv = {
  ARK_API_KEY?: string;
  ARK_VIDEO_BASE_URL?: string;
  ARK_VIDEO_MODEL?: string;
};

type VideoMetadata = Record<string, string>;

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

function config() {
  const runtime = env as unknown as RuntimeEnv;
  return {
    apiKey: runtime.ARK_API_KEY || "",
    baseUrl: (runtime.ARK_VIDEO_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ""),
    model: runtime.ARK_VIDEO_MODEL || DEFAULT_MODEL,
  };
}

function upstreamMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const value = payload as { error?: { message?: string }; message?: string };
  return value.error?.message || value.message || fallback;
}

function parseMetadata(value: string): VideoMetadata {
  try { return JSON.parse(value || "{}"); }
  catch { return {}; }
}

async function triggerVideoWorkflows(workspaceId: number, video: { id: number; title: string; description: string; taskId: string; mediaUrl: string }) {
  const workflows = await env.DB.prepare("SELECT id,title,description,metadata FROM product_records WHERE workspace_id=? AND module='auto-workflow'").bind(workspaceId).all();
  const statements: D1PreparedStatement[] = [];
  for (const workflow of workflows.results) {
    const metadata = parseMetadata(String(workflow.metadata || "{}")); if (metadata.trigger !== "视频生成完成") continue;
    const declaredAction = String(metadata.action || ""); const action = declaredAction === "等待人工审核" ? String(metadata.nextAction || metadata.approvalAction || "") : declaredAction;
    const approvalRequired = declaredAction === "等待人工审核" || ["发送微信消息", "平台发布"].includes(action) || metadata.approval === "true";
    const payload = { executionAction: action, reviewOnly: declaredAction === "等待人工审核" && !action, approvalRequired, target: video.mediaUrl, content: String(workflow.description || ""), context: video.description, platform: String(metadata.platform || ""), title: String(metadata.title || workflow.title || video.title), mediaUrl: video.mediaUrl, deviceId: String(metadata.deviceId || ""), videoRecordId: video.id, videoTaskId: video.taskId };
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO workflow_runs(workspace_id,workflow_id,trigger_type,action_type,status,max_attempts,dedupe_key,payload)
      VALUES(?,?,?,?,?,?,?,?)`).bind(workspaceId, Number(workflow.id), "视频生成完成", action || declaredAction, approvalRequired ? "awaiting_approval" : "queued", Math.max(1, Math.min(5, Number(metadata.maxAttempts || 3))), `video:${video.id}:${video.taskId}`, JSON.stringify(payload)));
  }
  for (let index = 0; index < statements.length; index += 80) await env.DB.batch(statements.slice(index, index + 80));
}

async function fetchArk(path: string, init?: RequestInit) {
  const { apiKey, baseUrl } = config();
  if (!apiKey) return { response: null, data: null, error: "Seedance API 尚未配置" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(init?.headers || {}),
      },
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    return { response, data, error: "" };
  } catch (error) {
    return { response: null, data: null, error: error instanceof Error && error.name === "AbortError" ? "Seedance 请求超时" : "暂时无法连接 Seedance" };
  } finally { clearTimeout(timer); }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser(request); if (!user) return unauthorized();
    await ensureSchema();
    const body = await request.json() as {
      title?: string;
      prompt?: string;
      ratio?: string;
      duration?: number;
      resolution?: string;
      referenceImages?: string[];
    };
    const prompt = String(body.prompt || "").trim();
    const ratio = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"].includes(String(body.ratio)) ? String(body.ratio) : "9:16";
    const duration = Math.max(4, Math.min(15, Math.round(Number(body.duration) || 5)));
    const resolution = ["480p", "720p", "1080p"].includes(String(body.resolution)) ? String(body.resolution) : "720p";
    const referenceImages = Array.isArray(body.referenceImages) ? body.referenceImages.filter(item => /^data:image\/[a-z0-9.+-]+;base64,/i.test(item) || /^https:\/\//i.test(item)).slice(0, 9) : [];
    if (!prompt) return Response.json({ error: "请先填写视频创意" }, { status: 400 });
    if (prompt.length > 8_000) return Response.json({ error: "视频创意不能超过 8000 个字符" }, { status: 400 });

    const { model } = config();
    const directedPrompt = `${prompt} --ratio ${ratio} --dur ${duration} --resolution ${resolution}`;
    const content: Array<Record<string, unknown>> = [{ type: "text", text: directedPrompt }];
    referenceImages.forEach(url => content.push({ type: "image_url", image_url: { url }, role: "reference_image" }));
    const upstream = await fetchArk("/contents/generations/tasks", {
      method: "POST",
      body: JSON.stringify({ model, content, return_last_frame: true }),
    });
    if (!upstream.response) return Response.json({ error: upstream.error }, { status: 502 });
    if (!upstream.response.ok) return Response.json({ error: upstreamMessage(upstream.data, "Seedance 创建任务失败"), details: upstream.data }, { status: upstream.response.status });
    const task = upstream.data as { id?: string; status?: string };
    if (!task?.id) return Response.json({ error: "Seedance 没有返回任务编号" }, { status: 502 });

    const metadata: VideoMetadata = {
      taskId: task.id,
      model,
      prompt,
      ratio,
      duration: String(duration),
      resolution,
      sourceMode: referenceImages.length ? "image-to-video" : "text-to-video",
      referenceCount: String(referenceImages.length),
      arkStatus: task.status || "queued",
    };
    const title = String(body.title || "").trim() || prompt.slice(0, 42) || "Seedance 视频";
    const [record] = await getDb().insert(productRecords).values({
      workspaceId: user.workspaceId,
      module: MODULE,
      title,
      description: prompt,
      status: "active",
      metadata: JSON.stringify(metadata),
    }).returning();
    return Response.json({ task, record: { ...record, metadata } }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "视频任务创建失败" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const user = await getSessionUser(request); if (!user) return unauthorized();
    await ensureSchema();
    const url = new URL(request.url);
    const taskId = String(url.searchParams.get("id") || "").trim();
    const recordId = Number(url.searchParams.get("recordId") || 0);
    if (!taskId || !recordId) return Response.json({ error: "缺少视频任务记录" }, { status: 400 });
    const [current] = await getDb().select().from(productRecords).where(and(eq(productRecords.id, recordId), eq(productRecords.workspaceId, user.workspaceId), eq(productRecords.module, MODULE))).limit(1);
    if (!current) return Response.json({ error: "视频记录不存在" }, { status: 404 });
    const metadata = parseMetadata(current.metadata);
    if (metadata.taskId !== taskId) return Response.json({ error: "视频任务不匹配" }, { status: 404 });
    const upstream = await fetchArk(`/contents/generations/tasks/${encodeURIComponent(taskId)}`);
    if (!upstream.response) return Response.json({ error: upstream.error }, { status: 502 });
    if (!upstream.response.ok) return Response.json({ error: upstreamMessage(upstream.data, "读取 Seedance 任务失败"), details: upstream.data }, { status: upstream.response.status });
    const task = upstream.data as {
      id: string;
      status: string;
      model?: string;
      content?: { video_url?: string; last_frame_url?: string };
      error?: { code?: string; message?: string };
      usage?: { completion_tokens?: number; total_tokens?: number };
    };

    metadata.arkStatus = task.status;
    metadata.model = task.model || metadata.model || config().model;
    if (task.usage?.total_tokens != null) metadata.totalTokens = String(task.usage.total_tokens);
    if (task.content?.last_frame_url) metadata.lastFrameUrl = task.content.last_frame_url;
    const status = task.status === "succeeded" ? "completed" : task.status === "failed" || task.status === "cancelled" ? "failed" : "active";
    if (task.error?.message) metadata.error = task.error.message;

    if (task.status === "succeeded" && task.content?.video_url && !metadata.objectKey) {
      metadata.arkVideoUrl = task.content.video_url;
      try {
        const videoResponse = await fetch(task.content.video_url);
        if (!videoResponse.ok || !videoResponse.body) throw new Error("成片下载失败");
        const objectKey = `workspace/${user.workspaceId}/video/${Date.now()}-${crypto.randomUUID()}-seedance.mp4`;
        await env.MEDIA.put(objectKey, videoResponse.body, {
          httpMetadata: { contentType: videoResponse.headers.get("content-type") || "video/mp4", contentDisposition: "inline; filename=seedance-video.mp4" },
        });
        metadata.objectKey = objectKey;
        metadata.url = `/api/media?key=${encodeURIComponent(objectKey)}`;
        const size = videoResponse.headers.get("content-length");
        if (size) metadata.size = size;
      } catch (error) {
        metadata.url = task.content.video_url;
        metadata.storageError = error instanceof Error ? error.message : "成片保存失败";
      }
    } else if (task.content?.video_url && !metadata.url) {
      metadata.url = task.content.video_url;
    }

    const [record] = await getDb().update(productRecords).set({
      status,
      metadata: JSON.stringify(metadata),
      updatedAt: new Date().toISOString(),
    }).where(and(eq(productRecords.id, recordId), eq(productRecords.workspaceId, user.workspaceId), eq(productRecords.module, MODULE))).returning();
    if (task.status === "succeeded" && record) {
      await triggerVideoWorkflows(user.workspaceId, { id: record.id, title: record.title, description: record.description, taskId, mediaUrl: metadata.arkVideoUrl || metadata.url || "" });
    }
    return Response.json({ task, record: record ? { ...record, metadata } : null });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取视频任务失败" }, { status: 500 });
  }
}
