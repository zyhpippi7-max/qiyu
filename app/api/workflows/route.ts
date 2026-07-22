import { env } from "cloudflare:workers";
import { getSessionUser, unauthorized } from "../../auth-server";

const WORKFLOW_MODULE = "auto-workflow";
const PLATFORMS = new Set(["douyin", "xiaohongshu", "kuaishou", "shipinhao"]);
type Json = Record<string, unknown>;
type WorkflowRow = { id: number; title: string; description: string; metadata: string; status: string; createdAt: string; updatedAt: string };
type RunRow = { id: number; workspaceId: number; workflowId: number; triggerType: string; actionType: string; status: string; deviceId: string | null; automationJobId: number | null; attempt: number; maxAttempts: number; dedupeKey: string | null; payload: string; result: string; error: string; scheduledFor: string; startedAt: string | null; finishedAt: string | null; createdAt: string; updatedAt: string };

function json(value: unknown): Json { try { return typeof value === "string" ? JSON.parse(value) as Json : value && typeof value === "object" ? value as Json : {}; } catch { return {}; } }
function text(value: unknown) { return String(value || "").trim(); }
function fail(error: string, status = 400) { return Response.json({ error }, { status }); }
function publicRun(row: RunRow) { return { ...row, payload: json(row.payload), result: json(row.result) }; }

async function ensureWorkflowSchema() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS workflow_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id INTEGER NOT NULL DEFAULT 0, workflow_id INTEGER NOT NULL, trigger_type TEXT NOT NULL, action_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', device_id TEXT, automation_job_id INTEGER, attempt INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 3, dedupe_key TEXT, payload TEXT NOT NULL DEFAULT '{}', result TEXT NOT NULL DEFAULT '{}', error TEXT NOT NULL DEFAULT '', scheduled_for TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, started_at TEXT, finished_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await env.DB.batch([
    env.DB.prepare("CREATE INDEX IF NOT EXISTS workflow_runs_workspace_workflow_created_idx ON workflow_runs(workspace_id,workflow_id,created_at)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS workflow_runs_workspace_status_scheduled_idx ON workflow_runs(workspace_id,status,scheduled_for)"),
    env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS workflow_runs_automation_job_unique ON workflow_runs(automation_job_id)"),
    env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS workflow_runs_workspace_workflow_dedupe_unique ON workflow_runs(workspace_id,workflow_id,dedupe_key)"),
  ]);
}

async function workflow(workspaceId: number, id: number) {
  return env.DB.prepare(`SELECT id,title,description,metadata,status,created_at AS createdAt,updated_at AS updatedAt FROM product_records
    WHERE id=? AND workspace_id=? AND module=?`).bind(id, workspaceId, WORKFLOW_MODULE).first<WorkflowRow>();
}
async function run(workspaceId: number, id: number) {
  return env.DB.prepare(`SELECT id,workspace_id AS workspaceId,workflow_id AS workflowId,trigger_type AS triggerType,action_type AS actionType,status,device_id AS deviceId,automation_job_id AS automationJobId,attempt,max_attempts AS maxAttempts,dedupe_key AS dedupeKey,payload,result,error,scheduled_for AS scheduledFor,started_at AS startedAt,finished_at AS finishedAt,created_at AS createdAt,updated_at AS updatedAt FROM workflow_runs WHERE id=? AND workspace_id=?`).bind(id, workspaceId).first<RunRow>();
}
async function pairedDevice(workspaceId: number, deviceId: string, online = false) {
  if (!deviceId) return null;
  return env.DB.prepare(`SELECT device_id AS deviceId FROM automation_devices WHERE workspace_id=? AND device_id=?${online ? " AND status='online' AND last_seen_at>=datetime('now','-75 seconds')" : ""}`)
    .bind(workspaceId, deviceId).first<{ deviceId: string }>();
}

function actionSpec(value: string) {
  if (value === "AI生成内容") return { jobType: "", sensitive: false };
  if (value === "填写微信草稿") return { jobType: "wechat_draft", sensitive: false };
  if (value === "发送微信消息") return { jobType: "wechat_send", sensitive: true };
  if (value === "打开内容平台") return { jobType: "platform_open_login", sensitive: false };
  if (value === "平台发布") return { jobType: "platform_publish", sensitive: true };
  return null;
}

function executionPayload(workflowRow: WorkflowRow, input: Json) {
  const metadata = json(workflowRow.metadata);
  const declaredAction = text(metadata.action);
  const nextAction = declaredAction === "等待人工审核" ? text(input.nextAction || metadata.nextAction || metadata.approvalAction) : declaredAction;
  const spec = actionSpec(nextAction);
  if (!spec && !(declaredAction === "等待人工审核" && !nextAction)) throw new Error("工作流动作不受支持");
  const platform = text(input.platform || metadata.platform);
  if (nextAction.includes("平台") && !PLATFORMS.has(platform)) throw new Error("请选择受支持的内容平台");
  const target = text(input.target || metadata.target);
  const content = text(input.content || input.message || workflowRow.description);
  if (nextAction.includes("微信") && (!target || !content)) throw new Error("微信动作需要联系人和内容");
  return {
    declaredAction, executionAction: nextAction, reviewOnly: declaredAction === "等待人工审核" && !nextAction,
    approvalRequired: declaredAction === "等待人工审核" || Boolean(spec?.sensitive) || input.approval === true || metadata.approval === "true",
    target, content, platform, title: workflowRow.title, mediaUrl: text(input.mediaUrl || metadata.mediaUrl),
  };
}

async function failRun(row: RunRow, message: string) {
  await env.DB.prepare(`UPDATE workflow_runs SET status='failed',attempt=attempt+1,error=?,updated_at=CURRENT_TIMESTAMP,finished_at=CURRENT_TIMESTAMP
    WHERE id=? AND workspace_id=? AND status='queued'`).bind(message.slice(0, 1000), row.id, row.workspaceId).run();
  return run(row.workspaceId, row.id);
}

async function callAi(content: string) {
  const runtime = env as unknown as { QIYU_AI_BASE_URL?: string; QIYU_AI_API_KEY?: string; QIYU_AI_CHAT_PATH?: string };
  if (!runtime.QIYU_AI_BASE_URL || !runtime.QIYU_AI_API_KEY) throw new Error("服务器尚未配置AI模型");
  const endpoint = runtime.QIYU_AI_CHAT_PATH || "/v1/chat/completions";
  const response = await fetch(`${runtime.QIYU_AI_BASE_URL.replace(/\/$/, "")}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${runtime.QIYU_AI_API_KEY}` },
    body: JSON.stringify({ model: "gpt-5.5", stream: false, temperature: 0.3, max_tokens: 1800, messages: [
      { role: "system", content: "你是奇遇AI自动工作流执行器。严格按要求产出可直接审核使用的中文结果，不虚构外部执行状态。" }, { role: "user", content },
    ] }), signal: AbortSignal.timeout(90000),
  });
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: string | { message?: string } };
  if (!response.ok) throw new Error(typeof data.error === "object" ? String(data.error?.message || "AI调用失败") : String(data.error || "AI调用失败"));
  const output = text(data.choices?.[0]?.message?.content); if (!output) throw new Error("模型没有返回工作流结果");
  return output;
}

async function execute(row: RunRow, workflowRow: WorkflowRow) {
  const payload = json(row.payload); const action = text(payload.executionAction || row.actionType); const spec = actionSpec(action);
  if (!spec) return failRun(row, "工作流后续动作不受支持");
  if (spec.jobType === "") {
    const started = await env.DB.prepare("UPDATE workflow_runs SET status='running',attempt=attempt+1,error='',started_at=COALESCE(started_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=? AND status='queued'").bind(row.id, row.workspaceId).run();
    if (!started.meta.changes) return run(row.workspaceId, row.id);
    try {
      const output = await callAi(`流程：${workflowRow.title}\n执行要求：${workflowRow.description}\n目标：${text(payload.target) || "未指定"}`);
      await env.DB.prepare("UPDATE workflow_runs SET status='succeeded',result=?,updated_at=CURRENT_TIMESTAMP,finished_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=? AND status='running'").bind(JSON.stringify({ output }), row.id, row.workspaceId).run();
    } catch (error) {
      await env.DB.prepare("UPDATE workflow_runs SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP,finished_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=? AND status='running'").bind(error instanceof Error ? error.message.slice(0, 1000) : "AI执行失败", row.id, row.workspaceId).run();
    }
    return run(row.workspaceId, row.id);
  }
  const deviceId = text(payload.deviceId || row.deviceId); const device = await pairedDevice(row.workspaceId, deviceId, true);
  if (!device) return failRun(row, "需要当前工作空间内已配对且在线的电脑");
  const jobPayload: Json = { workflowRunId: row.id, workflowId: row.workflowId, contact: text(payload.target), message: text(payload.content), title: text(payload.title), content: text(payload.content), platform: text(payload.platform) };
  if (text(payload.mediaUrl)) jobPayload.mediaUrl = text(payload.mediaUrl);
  if (spec.jobType === "wechat_send") jobPayload.sendApproved = true;
  const job = await env.DB.prepare("INSERT INTO automation_jobs(workspace_id,device_id,type,payload,status) VALUES(?,?,?,?, 'queued') RETURNING id")
    .bind(row.workspaceId, device.deviceId, spec.jobType, JSON.stringify(jobPayload)).first<{ id: number }>();
  const linked = await env.DB.prepare(`UPDATE workflow_runs SET status='queued',device_id=?,automation_job_id=?,attempt=attempt+1,error='',started_at=COALESCE(started_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND workspace_id=? AND status='queued'`).bind(device.deviceId, job?.id || null, row.id, row.workspaceId).run();
  if (!linked.meta.changes && job?.id) await env.DB.prepare("UPDATE automation_jobs SET status='cancelled',error='工作流状态已变化',finished_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=?").bind(job.id, row.workspaceId).run();
  return run(row.workspaceId, row.id);
}

export async function GET(request: Request) {
  try {
    const user = await getSessionUser(request); if (!user) return unauthorized(); await ensureWorkflowSchema();
    const url = new URL(request.url); const workflowId = Number(url.searchParams.get("workflowId") || 0); const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || 100)));
    const workflows = await env.DB.prepare(`SELECT id,title,description,metadata,status,created_at AS createdAt,updated_at AS updatedAt FROM product_records WHERE workspace_id=? AND module=? ORDER BY updated_at DESC,id DESC`).bind(user.workspaceId, WORKFLOW_MODULE).all<WorkflowRow>();
    const runs = await env.DB.prepare(`SELECT id,workspace_id AS workspaceId,workflow_id AS workflowId,trigger_type AS triggerType,action_type AS actionType,status,device_id AS deviceId,automation_job_id AS automationJobId,attempt,max_attempts AS maxAttempts,dedupe_key AS dedupeKey,payload,result,error,scheduled_for AS scheduledFor,started_at AS startedAt,finished_at AS finishedAt,created_at AS createdAt,updated_at AS updatedAt FROM workflow_runs WHERE workspace_id=?${workflowId ? " AND workflow_id=?" : ""} ORDER BY id DESC LIMIT ?`).bind(user.workspaceId, ...(workflowId ? [workflowId, limit] : [limit])).all<RunRow>();
    return Response.json({ workflows: workflows.results.map(row => ({ ...row, metadata: json(row.metadata) })), runs: runs.results.map(publicRun) });
  } catch (error) { return fail(error instanceof Error ? error.message : "读取工作流失败", 500); }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser(request); if (!user) return unauthorized(); await ensureWorkflowSchema();
    const body = await request.json() as Json; const action = text(body.action); const workflowId = Number(body.workflowId || 0); const runId = Number(body.runId || 0); const input = json(body.payload);
    if (action === "start") {
      if (!workflowId) return fail("缺少工作流"); const workflowRow = await workflow(user.workspaceId, workflowId); if (!workflowRow) return fail("工作流不存在", 404);
      const payload = executionPayload(workflowRow, input); const key = text(body.idempotencyKey) || null;
      if (key) { const duplicate = await env.DB.prepare("SELECT id FROM workflow_runs WHERE workspace_id=? AND workflow_id=? AND dedupe_key=?").bind(user.workspaceId, workflowId, key).first<{ id: number }>(); if (duplicate) return Response.json({ run: publicRun((await run(user.workspaceId, duplicate.id))!), duplicate: true }); }
      const selectedDevice = text(input.deviceId); if (selectedDevice && !(await pairedDevice(user.workspaceId, selectedDevice))) return fail("设备不属于当前工作空间", 404);
      const inserted = await env.DB.prepare(`INSERT INTO workflow_runs(workspace_id,workflow_id,trigger_type,action_type,status,device_id,max_attempts,dedupe_key,payload)
        VALUES(?,?,?,?,?,?,?,?,?) RETURNING id`).bind(user.workspaceId, workflowId, text(body.triggerType) || "manual", payload.executionAction || payload.declaredAction, payload.approvalRequired ? "awaiting_approval" : "queued", selectedDevice || null, Math.max(1, Math.min(5, Number(input.maxAttempts || 3))), key, JSON.stringify({ ...payload, deviceId: selectedDevice || "" })).first<{ id: number }>();
      const created = await run(user.workspaceId, inserted!.id); if (!created) throw new Error("创建执行记录失败");
      return Response.json({ run: publicRun(payload.approvalRequired ? created : (await execute(created, workflowRow))!) }, { status: 201 });
    }
    if (!runId) return fail("缺少运行记录"); const existing = await run(user.workspaceId, runId); if (!existing) return fail("运行记录不存在", 404);
    if (action === "reject") {
      const changed = await env.DB.prepare("UPDATE workflow_runs SET status='cancelled',error=?,result=?,updated_at=CURRENT_TIMESTAMP,finished_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=? AND status='awaiting_approval'").bind(text(body.reason) || "人工拒绝执行", JSON.stringify({ decision: "rejected" }), runId, user.workspaceId).run();
      if (!changed.meta.changes) return fail("该运行当前不能拒绝", 409); return Response.json({ run: publicRun((await run(user.workspaceId, runId))!) });
    }
    if (action === "cancel") {
      const changed = await env.DB.prepare("UPDATE workflow_runs SET status='cancelled',error=?,updated_at=CURRENT_TIMESTAMP,finished_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=? AND status IN ('queued','running','awaiting_approval')").bind(text(body.reason) || "用户已取消", runId, user.workspaceId).run();
      if (!changed.meta.changes) return fail("该运行当前不能取消", 409);
      if (existing.automationJobId) await env.DB.prepare("UPDATE automation_jobs SET status='cancelled',error='工作流已取消',progress=0,updated_at=CURRENT_TIMESTAMP,finished_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=? AND status NOT IN ('succeeded','failed','cancelled')").bind(existing.automationJobId, user.workspaceId).run();
      return Response.json({ run: publicRun((await run(user.workspaceId, runId))!) });
    }
    const workflowRow = await workflow(user.workspaceId, existing.workflowId); if (!workflowRow) return fail("工作流已删除", 409);
    if (action === "approve") {
      const deviceId = text(input.deviceId); if (deviceId && !(await pairedDevice(user.workspaceId, deviceId))) return fail("设备不属于当前工作空间", 404);
      const approved = await env.DB.prepare("UPDATE workflow_runs SET status='queued',device_id=COALESCE(?,device_id),error='',updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=? AND status='awaiting_approval'").bind(deviceId || null, runId, user.workspaceId).run();
      if (!approved.meta.changes) return fail("该运行当前不能批准", 409);
      const current = await run(user.workspaceId, runId); const currentPayload = json(current?.payload); if (currentPayload.reviewOnly === true) {
        await env.DB.prepare("UPDATE workflow_runs SET status='succeeded',result=?,updated_at=CURRENT_TIMESTAMP,finished_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=? AND status='queued'").bind(JSON.stringify({ decision: "approved" }), runId, user.workspaceId).run();
        return Response.json({ run: publicRun((await run(user.workspaceId, runId))!) });
      }
      return Response.json({ run: publicRun((await execute(current!, workflowRow))!) });
    }
    if (action === "retry") {
      if (existing.status !== "failed") return fail("只有失败的运行可以重试", 409); if (existing.attempt >= existing.maxAttempts) return fail("已达到最大重试次数", 409);
      const payload = json(existing.payload); const spec = actionSpec(text(payload.executionAction || existing.actionType)); const awaiting = Boolean(payload.reviewOnly) || Boolean(spec?.sensitive) || payload.approvalRequired === true;
      const reset = await env.DB.prepare("UPDATE workflow_runs SET status=?,automation_job_id=NULL,result='{}',error='',started_at=NULL,finished_at=NULL,scheduled_for=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=? AND status='failed'").bind(awaiting ? "awaiting_approval" : "queued", runId, user.workspaceId).run();
      if (!reset.meta.changes) return fail("运行状态已变化", 409); const current = await run(user.workspaceId, runId);
      return Response.json({ run: publicRun(awaiting ? current! : (await execute(current!, workflowRow))!) });
    }
    return fail("未知工作流操作");
  } catch (error) { return fail(error instanceof Error ? error.message : "工作流操作失败", 500); }
}
