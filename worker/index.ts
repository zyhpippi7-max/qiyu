/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  MEDIA: R2Bucket;
  QIYU_AI_BASE_URL?: string;
  QIYU_AI_API_KEY?: string;
  QIYU_AI_CHAT_PATH?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

async function ensureProductRecords(env: Env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS product_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS product_records_module_idx ON product_records (module)").run();
}

function safeObjectName(value: string) {
  return value.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, "_").slice(0, 180) || "file";
}

type WorkflowRun = { id: number; workspaceId: number; workflowId: number; actionType: string; attempt: number; maxAttempts: number; payload: string; title: string; description: string };
type WorkflowDefinition = { id: number; workspaceId: number; title: string; description: string; metadata: string };
const workflowActions = new Set(["AI生成内容", "填写微信草稿", "发送微信消息", "打开内容平台", "平台发布"]);
const workflowPlatforms = new Set(["douyin", "xiaohongshu", "kuaishou", "shipinhao"]);

function workflowJson(value: unknown) { try { return typeof value === "string" ? JSON.parse(value) as Record<string, unknown> : value && typeof value === "object" ? value as Record<string, unknown> : {}; } catch { return {}; } }
function workflowText(value: unknown) { return String(value || "").trim(); }
function workflowReviewRequired(action: string, payload: Record<string, unknown>) { return payload.reviewOnly === true || payload.approvalRequired === true || action === "发送微信消息" || action === "平台发布" || action === "等待人工审核"; }

function chinaClock() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value || "00";
  return { date: `${value("year")}-${value("month")}-${value("day")}`, minutes: Number(value("hour")) * 60 + Number(value("minute")), weekday: value("weekday") };
}

async function enqueueDailyWorkflowRuns(env: Env) {
  const now = chinaClock();
  const workflows = await env.DB.prepare(`SELECT id,workspace_id AS workspaceId,title,description,metadata FROM product_records WHERE module='auto-workflow'`).all<WorkflowDefinition>();
  const statements: D1PreparedStatement[] = [];
  for (const workflow of workflows.results) {
    const metadata = workflowJson(workflow.metadata); if (workflowText(metadata.trigger) !== "每天定时") continue;
    const [hour, minute] = workflowText(metadata.schedule).split(":").map(Number); if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) continue;
    if ((now.minutes - (hour * 60 + minute) + 1440) % 1440 > 4) continue;
    const declaredAction = workflowText(metadata.action); const action = declaredAction === "等待人工审核" ? workflowText(metadata.nextAction || metadata.approvalAction) : declaredAction;
    const payload = { executionAction: action, reviewOnly: declaredAction === "等待人工审核" && !action, approvalRequired: declaredAction === "等待人工审核" || metadata.approval === "true" || ["发送微信消息", "平台发布"].includes(action), target: workflowText(metadata.target), content: workflow.description, platform: workflowText(metadata.platform), title: workflow.title, mediaUrl: workflowText(metadata.mediaUrl), deviceId: workflowText(metadata.deviceId) };
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO workflow_runs(workspace_id,workflow_id,trigger_type,action_type,status,max_attempts,dedupe_key,payload)
      VALUES(?,?,?,?,?,?,?,?)`).bind(workflow.workspaceId, workflow.id, "每天定时", action || declaredAction, payload.approvalRequired ? "awaiting_approval" : "queued", Math.max(1, Math.min(5, Number(metadata.maxAttempts || 3))), `daily:${now.date}:${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, JSON.stringify(payload)));
  }
  for (let index = 0; index < statements.length; index += 80) await env.DB.batch(statements.slice(index, index + 80));
}

async function failWorkflowRun(env: Env, row: WorkflowRun, error: string) {
  await env.DB.prepare(`UPDATE workflow_runs SET status='failed',attempt=attempt+1,error=?,updated_at=CURRENT_TIMESTAMP,finished_at=CURRENT_TIMESTAMP
    WHERE id=? AND workspace_id=? AND status='queued'`).bind(error.slice(0, 1000), row.id, row.workspaceId).run();
}

async function runWorkflowAi(env: Env, row: WorkflowRun, payload: Record<string, unknown>) {
  if (!env.QIYU_AI_BASE_URL || !env.QIYU_AI_API_KEY) throw new Error("服务器尚未配置AI模型");
  const endpoint = env.QIYU_AI_CHAT_PATH || "/v1/chat/completions";
  const response = await fetch(`${env.QIYU_AI_BASE_URL.replace(/\/$/, "")}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.QIYU_AI_API_KEY}` },
    body: JSON.stringify({ model: "gpt-5.5", stream: false, temperature: 0.3, max_tokens: 1800, messages: [
      { role: "system", content: "你是奇遇AI自动工作流执行器。严格按要求产出可直接审核使用的中文结果，不虚构外部执行状态。" }, { role: "user", content: `流程：${row.title}\n执行要求：${row.description}\n目标：${workflowText(payload.target) || "未指定"}${workflowText(payload.context) ? `\n触发上下文：${workflowText(payload.context)}` : ""}` },
    ] }), signal: AbortSignal.timeout(90000),
  });
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: string | { message?: string } };
  if (!response.ok) throw new Error(typeof data.error === "object" ? String(data.error?.message || "AI调用失败") : String(data.error || "AI调用失败"));
  const output = workflowText(data.choices?.[0]?.message?.content); if (!output) throw new Error("模型没有返回工作流结果");
  return output;
}

async function executeQueuedWorkflow(env: Env, row: WorkflowRun) {
  const payload = workflowJson(row.payload); const action = workflowText(payload.executionAction || row.actionType);
  if (workflowReviewRequired(action, payload)) {
    await env.DB.prepare("UPDATE workflow_runs SET status='awaiting_approval',updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=? AND status='queued'").bind(row.id, row.workspaceId).run();
    return;
  }
  if (row.attempt >= row.maxAttempts) return failWorkflowRun(env, row, "已达到最大重试次数");
  if (action === "AI生成内容") {
    const started = await env.DB.prepare("UPDATE workflow_runs SET status='running',attempt=attempt+1,error='',started_at=COALESCE(started_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=? AND status='queued' AND attempt<max_attempts").bind(row.id, row.workspaceId).run();
    if (!started.meta.changes) return;
    try {
      const output = await runWorkflowAi(env, row, payload);
      await env.DB.prepare("UPDATE workflow_runs SET status='succeeded',result=?,updated_at=CURRENT_TIMESTAMP,finished_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=? AND status='running'").bind(JSON.stringify({ output }), row.id, row.workspaceId).run();
    } catch (error) {
      await env.DB.prepare("UPDATE workflow_runs SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP,finished_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=? AND status='running'").bind(error instanceof Error ? error.message.slice(0, 1000) : "AI执行失败", row.id, row.workspaceId).run();
    }
    return;
  }
  const type = action === "填写微信草稿" ? "wechat_draft" : action === "打开内容平台" ? "platform_open_login" : "";
  if (!type || !workflowActions.has(action)) return failWorkflowRun(env, row, "工作流动作不受支持");
  const deviceId = workflowText(payload.deviceId); const device = await env.DB.prepare("SELECT device_id AS deviceId FROM automation_devices WHERE workspace_id=? AND device_id=? AND status='online' AND last_seen_at>=datetime('now','-75 seconds')").bind(row.workspaceId, deviceId).first<{ deviceId: string }>();
  if (!device) return failWorkflowRun(env, row, "需要当前工作空间内已配对且在线的电脑");
  if (type === "wechat_draft" && (!workflowText(payload.target) || !workflowText(payload.content))) return failWorkflowRun(env, row, "微信草稿需要联系人和内容");
  if (type === "platform_open_login" && !workflowPlatforms.has(workflowText(payload.platform))) return failWorkflowRun(env, row, "请选择受支持的内容平台");
  const job = await env.DB.prepare("INSERT INTO automation_jobs(workspace_id,device_id,type,payload,status) VALUES(?,?,?,?, 'queued') RETURNING id").bind(row.workspaceId, device.deviceId, type, JSON.stringify({ workflowRunId: row.id, workflowId: row.workflowId, contact: workflowText(payload.target), message: workflowText(payload.content), platform: workflowText(payload.platform), title: workflowText(payload.title), content: workflowText(payload.content) })).first<{ id: number }>();
  const linked = await env.DB.prepare("UPDATE workflow_runs SET device_id=?,automation_job_id=?,attempt=attempt+1,error='',started_at=COALESCE(started_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=? AND status='queued'").bind(device.deviceId, job?.id || null, row.id, row.workspaceId).run();
  if (!linked.meta.changes && job?.id) await env.DB.prepare("UPDATE automation_jobs SET status='cancelled',error='工作流状态已变化',finished_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=?").bind(job.id, row.workspaceId).run();
}

async function processWorkflowRuns(env: Env) {
  const due = await env.DB.prepare(`SELECT r.id,r.workspace_id AS workspaceId,r.workflow_id AS workflowId,r.action_type AS actionType,r.attempt,r.max_attempts AS maxAttempts,r.payload,w.title,w.description
    FROM workflow_runs r JOIN product_records w ON w.id=r.workflow_id AND w.workspace_id=r.workspace_id AND w.module='auto-workflow'
    WHERE r.status='queued' AND r.scheduled_for<=CURRENT_TIMESTAMP ORDER BY r.id LIMIT 20`).all<WorkflowRun>();
  for (const row of due.results) await executeQueuedWorkflow(env, row);
}

type EmployeeRun = { id: number; workspaceId: number; employeeId: number; attempt: number; maxAttempts: number; payload: string; title: string; description: string; metadata: string };
type EmployeeDefinition = { id: number; workspaceId: number; title: string; description: string; metadata: string };

function employeeSchedule(metadata: Record<string, unknown>, now: ReturnType<typeof chinaClock>) {
  const raw = workflowText(metadata.scheduleTime || metadata.schedule); const match = raw.match(/(\d{1,2}):(\d{2})/); if (!match) return null;
  const hour = Number(match[1]); const minute = Number(match[2]); if (hour > 23 || minute > 59) return null;
  const mode = workflowText(metadata.scheduleMode) || (raw.includes("工作日") ? "weekdays" : "daily");
  if (mode === "manual") return null;
  if (mode === "weekdays" && ["Sat", "Sun"].includes(now.weekday)) return null;
  return { hour, minute, key: `${mode}:${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` };
}

async function ensureEmployeeRunSchema(env: Env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ai_employee_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id INTEGER NOT NULL DEFAULT 0, employee_id INTEGER NOT NULL, trigger_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued', attempt INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 3, dedupe_key TEXT,
    payload TEXT NOT NULL DEFAULT '{}', result TEXT NOT NULL DEFAULT '{}', error TEXT NOT NULL DEFAULT '', scheduled_for TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TEXT, finished_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS ai_employee_runs_workspace_employee_dedupe_unique ON ai_employee_runs(workspace_id,employee_id,dedupe_key)").run();
}

async function enqueueDailyEmployeeRuns(env: Env) {
  await ensureEmployeeRunSchema(env); const now = chinaClock();
  const employees = await env.DB.prepare("SELECT id,workspace_id AS workspaceId,title,description,metadata FROM product_records WHERE module='ai-employee'").all<EmployeeDefinition>();
  const statements: D1PreparedStatement[] = [];
  for (const employee of employees.results) {
    const metadata = workflowJson(employee.metadata); if (metadata.enabled === false || metadata.enabled === "false") continue;
    const schedule = employeeSchedule(metadata, now); if (!schedule || (now.minutes - (schedule.hour * 60 + schedule.minute) + 1440) % 1440 > 4) continue;
    const approvalRequired = metadata.approval === true || metadata.approval === "true";
    const payload = { task: employee.description, prompt: workflowText(metadata.prompt), approvalRequired };
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO ai_employee_runs(workspace_id,employee_id,trigger_type,status,max_attempts,dedupe_key,payload)
      VALUES(?,?,?,?,?,?,?)`).bind(employee.workspaceId, employee.id, "每天定时", approvalRequired ? "awaiting_approval" : "queued", Math.max(1, Math.min(5, Number(metadata.maxAttempts || 3))), `daily:${now.date}:${schedule.key}`, JSON.stringify(payload)));
  }
  for (let index = 0; index < statements.length; index += 80) await env.DB.batch(statements.slice(index, index + 80));
}

function employeeTerms(value: string) { return [...new Set((value.toLowerCase().match(/[a-z0-9]{2,}|[\u4e00-\u9fff]{2,6}/g) || []).filter(term => term.length > 1))].slice(0, 30); }

async function employeeKnowledge(env: Env, workspaceId: number, context: string) {
  const rows = await env.DB.prepare("SELECT id,title,description,metadata FROM product_records WHERE workspace_id=? AND module='knowledge' ORDER BY updated_at DESC,id DESC LIMIT 50").bind(workspaceId).all<{ id: number; title: string; description: string; metadata: string }>();
  const terms = employeeTerms(context); const candidates = rows.results.map(row => {
    const content = workflowText(workflowJson(row.metadata).content || row.description); const source = `${row.title}\n${content}`.toLowerCase();
    return { row, content, score: terms.reduce((score, term) => score + (source.includes(term) ? 1 : 0), 0) };
  }).filter(item => item.content).sort((left, right) => right.score - left.score || right.row.id - left.row.id);
  const selected = (candidates.some(item => item.score > 0) ? candidates.filter(item => item.score > 0) : candidates).slice(0, 6);
  let size = 0; const excerpts: string[] = []; const sources: Array<{ id: number; title: string }> = [];
  for (const item of selected) { const excerpt = item.content.slice(0, 1600); if (size + excerpt.length > 7200) break; size += excerpt.length; excerpts.push(`【${item.row.title}】\n${excerpt}`); sources.push({ id: item.row.id, title: item.row.title }); }
  return { context: excerpts.join("\n\n"), sources };
}

async function runEmployeeAi(env: Env, row: EmployeeRun, payload: Record<string, unknown>) {
  if (!env.QIYU_AI_BASE_URL || !env.QIYU_AI_API_KEY) throw new Error("服务器尚未配置AI模型");
  const metadata = workflowJson(row.metadata); const knowledge = await employeeKnowledge(env, row.workspaceId, `${row.title}\n${row.description}`); const endpoint = env.QIYU_AI_CHAT_PATH || "/v1/chat/completions";
  const response = await fetch(`${env.QIYU_AI_BASE_URL.replace(/\/$/, "")}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.QIYU_AI_API_KEY}` },
    body: JSON.stringify({ model: "gpt-5.5", stream: false, temperature: 0.3, max_tokens: 1800, messages: [
      { role: "system", content: `${workflowText(payload.prompt || metadata.prompt || "你是奇遇AI员工。")}\n只能输出真实可执行的工作结果，不得声称已经发送、发布、操作电脑或取得外部数据。${knowledge.context ? `\n\n可参考的企业知识：\n${knowledge.context}` : "\n\n当前没有可用企业知识；缺少信息时明确列出待补充项。"}` },
      { role: "user", content: `工作目标：${workflowText(payload.task) || row.description}\n请完成本次工作，并给出可供人工审核的结果与下一步。` },
    ] }), signal: AbortSignal.timeout(90000),
  });
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: string | { message?: string } };
  if (!response.ok) throw new Error(typeof data.error === "object" ? String(data.error?.message || "AI调用失败") : String(data.error || "AI调用失败"));
  const output = workflowText(data.choices?.[0]?.message?.content); if (!output) throw new Error("模型没有返回员工工作结果");
  return { output, knowledgeSources: knowledge.sources };
}

async function enqueueEmployeeWorkflowHandoff(env: Env, row: EmployeeRun, result: Record<string, unknown>) {
  const employeeMetadata = workflowJson(row.metadata); const workflowId = Number(employeeMetadata.handoffWorkflowId || 0); if (!workflowId) return { status: "not_configured" };
  const workflow = await env.DB.prepare("SELECT id,workspace_id AS workspaceId,title,description,metadata FROM product_records WHERE id=? AND workspace_id=? AND module='auto-workflow'").bind(workflowId, row.workspaceId).first<WorkflowDefinition>();
  if (!workflow) return { status: "failed", error: "交接工作流不存在或不属于当前工作空间" };
  const metadata = workflowJson(workflow.metadata); const declaredAction = workflowText(metadata.action); const action = declaredAction === "等待人工审核" ? workflowText(metadata.nextAction || metadata.approvalAction) : declaredAction;
  if (!workflowActions.has(action)) return { status: "failed", error: "交接工作流动作不受支持" };
  const approvalRequired = declaredAction === "等待人工审核" || metadata.approval === "true" || metadata.approval === true || ["发送微信消息", "平台发布"].includes(action);
  const payload = { executionAction: action, declaredAction, approvalRequired, reviewOnly: declaredAction === "等待人工审核" && !action, target: workflowText(metadata.target), content: workflowText(result.output), context: workflowText(result.output), platform: workflowText(metadata.platform), title: workflow.title, mediaUrl: workflowText(metadata.mediaUrl), deviceId: workflowText(metadata.deviceId), employeeRunId: row.id };
  await env.DB.prepare(`INSERT OR IGNORE INTO workflow_runs(workspace_id,workflow_id,trigger_type,action_type,status,device_id,max_attempts,dedupe_key,payload)
    VALUES(?,?,?,?,?,?,?,?,?)`).bind(row.workspaceId, workflow.id, "AI员工完成", action, approvalRequired ? "awaiting_approval" : "queued", payload.deviceId || null, Math.max(1, Math.min(5, Number(metadata.maxAttempts || 3))), `employee:${row.id}`, JSON.stringify(payload)).run();
  const handoff = await env.DB.prepare("SELECT id,status FROM workflow_runs WHERE workspace_id=? AND workflow_id=? AND dedupe_key=?").bind(row.workspaceId, workflow.id, `employee:${row.id}`).first<{ id: number; status: string }>();
  return { status: handoff?.status || "failed", workflowId: workflow.id, workflowRunId: handoff?.id || null };
}

async function executeQueuedEmployee(env: Env, row: EmployeeRun) {
  if (row.attempt >= row.maxAttempts) {
    await env.DB.prepare("UPDATE ai_employee_runs SET status='failed',error='已达到最大重试次数',updated_at=CURRENT_TIMESTAMP,finished_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=? AND status='queued'").bind(row.id, row.workspaceId).run();
    return;
  }
  const started = await env.DB.prepare("UPDATE ai_employee_runs SET status='running',attempt=attempt+1,error='',started_at=COALESCE(started_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=? AND status='queued' AND attempt<max_attempts").bind(row.id, row.workspaceId).run();
  if (!started.meta.changes) return;
  try {
    const result = await runEmployeeAi(env, row, workflowJson(row.payload)); const handoff = await enqueueEmployeeWorkflowHandoff(env, row, result);
    await env.DB.prepare("UPDATE ai_employee_runs SET status='succeeded',result=?,updated_at=CURRENT_TIMESTAMP,finished_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=? AND status='running'").bind(JSON.stringify({ ...result, handoff }), row.id, row.workspaceId).run();
  } catch (error) {
    await env.DB.prepare("UPDATE ai_employee_runs SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP,finished_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=? AND status='running'").bind(error instanceof Error ? error.message.slice(0, 1000) : "AI员工执行失败", row.id, row.workspaceId).run();
  }
}

async function processEmployeeRuns(env: Env) {
  const due = await env.DB.prepare(`SELECT r.id,r.workspace_id AS workspaceId,r.employee_id AS employeeId,r.attempt,r.max_attempts AS maxAttempts,r.payload,e.title,e.description,e.metadata
    FROM ai_employee_runs r JOIN product_records e ON e.id=r.employee_id AND e.workspace_id=r.workspace_id AND e.module='ai-employee'
    WHERE r.status='queued' AND r.scheduled_for<=CURRENT_TIMESTAMP ORDER BY r.id LIMIT 20`).all<EmployeeRun>();
  for (const row of due.results) await executeQueuedEmployee(env, row);
}

async function runWorkflowScheduler(env: Env) {
  await enqueueDailyWorkflowRuns(env);
  await enqueueDailyEmployeeRuns(env);
  await processEmployeeRuns(env);
  await processWorkflowRuns(env);
}

async function handleMedia(request: Request, env: Env) {
  const url = new URL(request.url);
  if (request.method === "GET") {
    const key = url.searchParams.get("key") || "";
    if (!key) return Response.json({ error: "key is required" }, { status: 400 });
    const object = await env.MEDIA.get(key);
    if (!object) return Response.json({ error: "文件不存在" }, { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "private, max-age=3600");
    return new Response(object.body, { headers });
  }

  if (request.method === "POST") {
    await ensureProductRecords(env);
    const contentType = request.headers.get("content-type") || "application/octet-stream";
    let body: ReadableStream | Blob;
    let module = "media";
    let title = "";
    let description = "";
    let filename = "file";
    let fileType = contentType;
    let size = Number(request.headers.get("content-length") || 0);
    let extraMetadata: Record<string, string> = {};

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0) return Response.json({ error: "请选择文件" }, { status: 400 });
      body = file.stream();
      module = String(form.get("module") || "media");
      title = String(form.get("title") || "").trim();
      description = String(form.get("description") || "").trim();
      filename = file.name;
      fileType = file.type || "application/octet-stream";
      size = file.size;
      try { extraMetadata = JSON.parse(String(form.get("metadata") || "{}")); } catch { extraMetadata = {}; }
    } else {
      if (!request.body) return Response.json({ error: "文件内容为空" }, { status: 400 });
      body = request.body;
      module = request.headers.get("x-qiyu-module") || "media";
      title = decodeURIComponent(request.headers.get("x-qiyu-title") || "").trim();
      description = decodeURIComponent(request.headers.get("x-qiyu-description") || "").trim();
      filename = decodeURIComponent(request.headers.get("x-qiyu-filename") || "file");
      fileType = request.headers.get("x-qiyu-content-type") || contentType;
      try { extraMetadata = JSON.parse(decodeURIComponent(request.headers.get("x-qiyu-metadata") || "%7B%7D")); } catch { extraMetadata = {}; }
    }
    if (size > 500 * 1024 * 1024) return Response.json({ error: "单个文件不能超过 500MB" }, { status: 400 });
    const key = `${safeObjectName(module)}/${Date.now()}-${crypto.randomUUID()}-${safeObjectName(filename)}`;
    await env.MEDIA.put(key, body, { httpMetadata: { contentType: fileType, contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(filename)}` } });
    const metadata = { ...extraMetadata, objectKey: key, contentType: fileType, size: String(size), url: `/api/media?key=${encodeURIComponent(key)}` };
    const record = await env.DB.prepare(`INSERT INTO product_records(module,title,description,status,metadata)
      VALUES(?,?,?,'completed',?) RETURNING id,module,title,description,status,metadata,created_at AS createdAt,updated_at AS updatedAt`)
      .bind(module, title || filename, description || `${fileType} · ${(size / 1024 / 1024).toFixed(2)} MB`, JSON.stringify(metadata)).first();
    return Response.json({ record: { ...record, metadata } }, { status: 201 });
  }

  if (request.method === "DELETE") {
    await ensureProductRecords(env);
    const body = await request.json() as { id?: number; module?: string; key?: string };
    if (!body.id || !body.module || !body.key) return Response.json({ error: "参数不完整" }, { status: 400 });
    await env.MEDIA.delete(body.key);
    await env.DB.prepare("DELETE FROM product_records WHERE id=? AND module=?").bind(body.id, body.module).run();
    return Response.json({ ok: true });
  }
  return new Response("Method Not Allowed", { status: 405 });
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    // Route media before vinext's 1MB generic route-body guard. This keeps
    // generated images, user video uploads and R2 downloads fully streaming.
    if (url.pathname === "/api/media") return handleMedia(request, env);

    return handler.fetch(request, env, ctx);
  },
  async scheduled(_controller: unknown, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runWorkflowScheduler(env));
  },
};

export default worker;
