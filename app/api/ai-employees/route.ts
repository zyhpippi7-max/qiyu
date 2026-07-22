import { env } from "cloudflare:workers";
import { getSessionUser, unauthorized } from "../../auth-server";

const EMPLOYEE_MODULE = "ai-employee";
const KNOWLEDGE_MODULE = "knowledge";
type Json = Record<string, unknown>;
type EmployeeRow = { id: number; title: string; description: string; metadata: string; status: string; createdAt: string; updatedAt: string };
type RunRow = { id: number; workspaceId: number; employeeId: number; triggerType: string; status: string; attempt: number; maxAttempts: number; dedupeKey: string | null; payload: string; result: string; error: string; scheduledFor: string; startedAt: string | null; finishedAt: string | null; createdAt: string; updatedAt: string };
type KnowledgeRow = { id: number; title: string; description: string; metadata: string };

function json(value: unknown): Json { try { return typeof value === "string" ? JSON.parse(value) as Json : value && typeof value === "object" ? value as Json : {}; } catch { return {}; } }
function text(value: unknown) { return String(value || "").trim(); }
function bool(value: unknown) { return value === true || value === "true"; }
function fail(error: unknown, status = 400) { return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status }); }
function publicRun(row: RunRow) { return { ...row, payload: json(row.payload), result: json(row.result) }; }

async function ensureEmployeeRunSchema() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ai_employee_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id INTEGER NOT NULL DEFAULT 0, employee_id INTEGER NOT NULL,
    trigger_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', attempt INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3, dedupe_key TEXT, payload TEXT NOT NULL DEFAULT '{}', result TEXT NOT NULL DEFAULT '{}',
    error TEXT NOT NULL DEFAULT '', scheduled_for TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, started_at TEXT, finished_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await env.DB.batch([
    env.DB.prepare("CREATE INDEX IF NOT EXISTS ai_employee_runs_workspace_employee_created_idx ON ai_employee_runs(workspace_id,employee_id,created_at)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS ai_employee_runs_workspace_status_scheduled_idx ON ai_employee_runs(workspace_id,status,scheduled_for)"),
    env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS ai_employee_runs_workspace_employee_dedupe_unique ON ai_employee_runs(workspace_id,employee_id,dedupe_key)"),
  ]);
}

async function employee(workspaceId: number, id: number) {
  return env.DB.prepare(`SELECT id,title,description,metadata,status,created_at AS createdAt,updated_at AS updatedAt FROM product_records
    WHERE id=? AND workspace_id=? AND module=?`).bind(id, workspaceId, EMPLOYEE_MODULE).first<EmployeeRow>();
}
async function run(workspaceId: number, id: number) {
  return env.DB.prepare(`SELECT id,workspace_id AS workspaceId,employee_id AS employeeId,trigger_type AS triggerType,status,attempt,
    max_attempts AS maxAttempts,dedupe_key AS dedupeKey,payload,result,error,scheduled_for AS scheduledFor,started_at AS startedAt,
    finished_at AS finishedAt,created_at AS createdAt,updated_at AS updatedAt FROM ai_employee_runs WHERE id=? AND workspace_id=?`)
    .bind(id, workspaceId).first<RunRow>();
}

function keywords(value: string) {
  return [...new Set((value.toLowerCase().match(/[a-z0-9]{2,}|[\u4e00-\u9fff]{2,6}/g) || []).filter(word => word.length > 1))].slice(0, 30);
}

async function relatedKnowledge(workspaceId: number, context: string) {
  const rows = await env.DB.prepare(`SELECT id,title,description,metadata FROM product_records
    WHERE workspace_id=? AND module=? ORDER BY updated_at DESC,id DESC LIMIT 50`).bind(workspaceId, KNOWLEDGE_MODULE).all<KnowledgeRow>();
  const terms = keywords(context);
  const candidates = rows.results.map(row => {
    const metadata = json(row.metadata); const content = text(metadata.content || row.description); const haystack = `${row.title}\n${content}`.toLowerCase();
    return { row, content, score: terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0) };
  }).filter(item => item.content).sort((left, right) => right.score - left.score || right.row.id - left.row.id);
  const selected = (candidates.some(item => item.score > 0) ? candidates.filter(item => item.score > 0) : candidates).slice(0, 6);
  let size = 0; const excerpts: string[] = []; const sources: Array<{ id: number; title: string }> = [];
  for (const item of selected) {
    const excerpt = item.content.slice(0, 1600); if (size + excerpt.length > 7200) break;
    size += excerpt.length; excerpts.push(`【${item.row.title}】\n${excerpt}`); sources.push({ id: item.row.id, title: item.row.title });
  }
  return { context: excerpts.join("\n\n"), sources };
}

async function callAi(employeeRow: EmployeeRow, payload: Json, knowledge: { context: string; sources: Array<{ id: number; title: string }> }) {
  const runtime = env as unknown as { QIYU_AI_BASE_URL?: string; QIYU_AI_API_KEY?: string; QIYU_AI_CHAT_PATH?: string };
  if (!runtime.QIYU_AI_BASE_URL || !runtime.QIYU_AI_API_KEY) throw new Error("服务器尚未配置AI模型");
  const metadata = json(employeeRow.metadata); const prompt = text(payload.prompt || metadata.prompt || "你是奇遇AI员工。");
  const task = text(payload.task || employeeRow.description); const endpoint = runtime.QIYU_AI_CHAT_PATH || "/v1/chat/completions";
  const knowledgeSection = knowledge.context ? `\n\n可参考的企业知识：\n${knowledge.context}` : "\n\n当前没有可用企业知识；缺少信息时明确列出待补充项。";
  const response = await fetch(`${runtime.QIYU_AI_BASE_URL.replace(/\/$/, "")}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${runtime.QIYU_AI_API_KEY}` },
    body: JSON.stringify({ model: "gpt-5.5", stream: false, temperature: 0.3, max_tokens: 1800, messages: [
      { role: "system", content: `${prompt}\n只能输出真实可执行的工作结果，不得声称已经发送、发布、操作电脑或取得外部数据。${knowledgeSection}` },
      { role: "user", content: `工作目标：${task}\n请完成本次工作，并给出可供人工审核的结果与下一步。` },
    ] }), signal: AbortSignal.timeout(90000),
  });
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: string | { message?: string } };
  if (!response.ok) throw new Error(typeof data.error === "object" ? String(data.error?.message || "AI调用失败") : String(data.error || "AI调用失败"));
  const output = text(data.choices?.[0]?.message?.content); if (!output) throw new Error("模型没有返回员工工作结果");
  return { output, knowledgeSources: knowledge.sources };
}

async function enqueueWorkflowHandoff(workspaceId: number, employeeRun: RunRow, employeeRow: EmployeeRow, result: Json) {
  const employeeMetadata = json(employeeRow.metadata); const workflowId = Number(employeeMetadata.handoffWorkflowId || 0);
  if (!workflowId) return { status: "not_configured" };
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS workflow_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id INTEGER NOT NULL DEFAULT 0, workflow_id INTEGER NOT NULL, trigger_type TEXT NOT NULL,
    action_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', device_id TEXT, automation_job_id INTEGER, attempt INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3, dedupe_key TEXT, payload TEXT NOT NULL DEFAULT '{}', result TEXT NOT NULL DEFAULT '{}', error TEXT NOT NULL DEFAULT '',
    scheduled_for TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, started_at TEXT, finished_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS workflow_runs_workspace_workflow_dedupe_unique ON workflow_runs(workspace_id,workflow_id,dedupe_key)").run();
  const workflow = await env.DB.prepare(`SELECT id,title,description,metadata FROM product_records WHERE id=? AND workspace_id=? AND module='auto-workflow'`)
    .bind(workflowId, workspaceId).first<{ id: number; title: string; description: string; metadata: string }>();
  if (!workflow) return { status: "failed", error: "交接工作流不存在或不属于当前工作空间" };
  const metadata = json(workflow.metadata); const declaredAction = text(metadata.action); const action = declaredAction === "等待人工审核" ? text(metadata.nextAction || metadata.approvalAction) : declaredAction;
  const supported = new Set(["AI生成内容", "填写微信草稿", "发送微信消息", "打开内容平台", "平台发布"]);
  if (!supported.has(action)) return { status: "failed", error: "交接工作流动作不受支持" };
  const approvalRequired = declaredAction === "等待人工审核" || bool(metadata.approval) || ["发送微信消息", "平台发布"].includes(action);
  const payload = {
    executionAction: action, declaredAction, approvalRequired, reviewOnly: declaredAction === "等待人工审核" && !action,
    target: text(metadata.target), content: text(result.output), context: text(result.output), platform: text(metadata.platform),
    title: workflow.title, mediaUrl: text(metadata.mediaUrl), deviceId: text(metadata.deviceId), employeeRunId: employeeRun.id,
  };
  await env.DB.prepare(`INSERT OR IGNORE INTO workflow_runs(workspace_id,workflow_id,trigger_type,action_type,status,device_id,max_attempts,dedupe_key,payload)
    VALUES(?,?,?,?,?,?,?,?,?)`).bind(workspaceId, workflow.id, "AI员工完成", action, approvalRequired ? "awaiting_approval" : "queued", payload.deviceId || null,
    Math.max(1, Math.min(5, Number(metadata.maxAttempts || 3))), `employee:${employeeRun.id}`, JSON.stringify(payload)).run();
  const handoff = await env.DB.prepare("SELECT id,status FROM workflow_runs WHERE workspace_id=? AND workflow_id=? AND dedupe_key=?").bind(workspaceId, workflow.id, `employee:${employeeRun.id}`).first<{ id: number; status: string }>();
  return { status: handoff?.status || "failed", workflowId: workflow.id, workflowRunId: handoff?.id || null };
}

async function execute(row: RunRow, employeeRow: EmployeeRow) {
  const started = await env.DB.prepare(`UPDATE ai_employee_runs SET status='running',attempt=attempt+1,error='',
    started_at=COALESCE(started_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=? AND status='queued'`)
    .bind(row.id, row.workspaceId).run();
  if (!started.meta.changes) return run(row.workspaceId, row.id);
  try {
    const current = await run(row.workspaceId, row.id); if (!current) throw new Error("运行记录不存在");
    const result: Json = { ...await callAi(employeeRow, json(current.payload), await relatedKnowledge(row.workspaceId, `${employeeRow.title}\n${employeeRow.description}`)) };
    result.handoff = await enqueueWorkflowHandoff(row.workspaceId, current, employeeRow, result);
    await env.DB.prepare(`UPDATE ai_employee_runs SET status='succeeded',result=?,updated_at=CURRENT_TIMESTAMP,finished_at=CURRENT_TIMESTAMP
      WHERE id=? AND workspace_id=? AND status='running'`).bind(JSON.stringify(result), row.id, row.workspaceId).run();
  } catch (error) {
    await env.DB.prepare(`UPDATE ai_employee_runs SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP,finished_at=CURRENT_TIMESTAMP
      WHERE id=? AND workspace_id=? AND status='running'`).bind(error instanceof Error ? error.message.slice(0, 1000) : "AI员工执行失败", row.id, row.workspaceId).run();
  }
  return run(row.workspaceId, row.id);
}

export async function GET(request: Request) {
  try {
    const user = await getSessionUser(request); if (!user) return unauthorized(); await ensureEmployeeRunSchema();
    const employeeId = Number(new URL(request.url).searchParams.get("employeeId") || 0); const limit = Math.max(1, Math.min(200, Number(new URL(request.url).searchParams.get("limit") || 100)));
    const employees = await env.DB.prepare(`SELECT id,title,description,metadata,status,created_at AS createdAt,updated_at AS updatedAt
      FROM product_records WHERE workspace_id=? AND module=? ORDER BY updated_at DESC,id DESC`).bind(user.workspaceId, EMPLOYEE_MODULE).all<EmployeeRow>();
    const runs = await env.DB.prepare(`SELECT id,workspace_id AS workspaceId,employee_id AS employeeId,trigger_type AS triggerType,status,attempt,
      max_attempts AS maxAttempts,dedupe_key AS dedupeKey,payload,result,error,scheduled_for AS scheduledFor,started_at AS startedAt,
      finished_at AS finishedAt,created_at AS createdAt,updated_at AS updatedAt FROM ai_employee_runs WHERE workspace_id=?${employeeId ? " AND employee_id=?" : ""} ORDER BY id DESC LIMIT ?`)
      .bind(user.workspaceId, ...(employeeId ? [employeeId, limit] : [limit])).all<RunRow>();
    return Response.json({ employees: employees.results.map(row => ({ ...row, metadata: json(row.metadata) })), runs: runs.results.map(publicRun) });
  } catch (error) { return fail(error, 500); }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser(request); if (!user) return unauthorized(); await ensureEmployeeRunSchema();
    const body = await request.json() as Json; const action = text(body.action); const employeeId = Number(body.employeeId || 0); const runId = Number(body.runId || 0); const input = json(body.payload);
    if (action === "start") {
      if (!employeeId) return fail("缺少AI员工"); const employeeRow = await employee(user.workspaceId, employeeId); if (!employeeRow) return fail("AI员工不存在", 404);
      const metadata = json(employeeRow.metadata); const dedupeKey = text(body.idempotencyKey) || null;
      if (dedupeKey) { const duplicate = await env.DB.prepare("SELECT id FROM ai_employee_runs WHERE workspace_id=? AND employee_id=? AND dedupe_key=?").bind(user.workspaceId, employeeId, dedupeKey).first<{ id: number }>(); if (duplicate) return Response.json({ run: publicRun((await run(user.workspaceId, duplicate.id))!), duplicate: true }); }
      const approvalRequired = bool(metadata.approval) || bool(input.approval); const maxAttempts = Math.max(1, Math.min(5, Number(input.maxAttempts || metadata.maxAttempts || 3)));
      const inserted = await env.DB.prepare(`INSERT INTO ai_employee_runs(workspace_id,employee_id,trigger_type,status,max_attempts,dedupe_key,payload)
        VALUES(?,?,?,?,?,?,?) RETURNING id`).bind(user.workspaceId, employeeId, text(body.triggerType) || "手动启动", approvalRequired ? "awaiting_approval" : "queued", maxAttempts, dedupeKey, JSON.stringify({ task: text(input.task || employeeRow.description), prompt: text(input.prompt || metadata.prompt), approvalRequired })).first<{ id: number }>();
      const created = await run(user.workspaceId, inserted!.id); if (!created) throw new Error("创建员工运行记录失败");
      return Response.json({ run: publicRun(approvalRequired ? created : (await execute(created, employeeRow))!) }, { status: 201 });
    }
    if (!runId) return fail("缺少运行记录"); const existing = await run(user.workspaceId, runId); if (!existing) return fail("运行记录不存在", 404);
    if (action === "reject") {
      const changed = await env.DB.prepare(`UPDATE ai_employee_runs SET status='cancelled',error=?,result=?,updated_at=CURRENT_TIMESTAMP,finished_at=CURRENT_TIMESTAMP
        WHERE id=? AND workspace_id=? AND status='awaiting_approval'`).bind(text(body.reason) || "人工拒绝执行", JSON.stringify({ decision: "rejected" }), runId, user.workspaceId).run();
      if (!changed.meta.changes) return fail("该运行当前不能拒绝", 409); return Response.json({ run: publicRun((await run(user.workspaceId, runId))!) });
    }
    if (action === "cancel") {
      const changed = await env.DB.prepare(`UPDATE ai_employee_runs SET status='cancelled',error=?,updated_at=CURRENT_TIMESTAMP,finished_at=CURRENT_TIMESTAMP
        WHERE id=? AND workspace_id=? AND status IN ('queued','running','awaiting_approval')`).bind(text(body.reason) || "用户已取消", runId, user.workspaceId).run();
      if (!changed.meta.changes) return fail("该运行当前不能取消", 409); return Response.json({ run: publicRun((await run(user.workspaceId, runId))!) });
    }
    const employeeRow = await employee(user.workspaceId, existing.employeeId); if (!employeeRow) return fail("AI员工已删除", 409);
    if (action === "approve") {
      const approved = await env.DB.prepare("UPDATE ai_employee_runs SET status='queued',error='',updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=? AND status='awaiting_approval'").bind(runId, user.workspaceId).run();
      if (!approved.meta.changes) return fail("该运行当前不能批准", 409);
      const current = await run(user.workspaceId, runId); if (!current) throw new Error("运行记录不存在");
      return Response.json({ run: publicRun((await execute(current, employeeRow))!) });
    }
    if (action === "retry") {
      if (existing.status !== "failed") return fail("只有失败的运行可以重试", 409); if (existing.attempt >= existing.maxAttempts) return fail("已达到最大重试次数", 409);
      const payload = json(existing.payload); const waiting = bool(payload.approvalRequired); const reset = await env.DB.prepare(`UPDATE ai_employee_runs SET status=?,result='{}',error='',started_at=NULL,finished_at=NULL,
        scheduled_for=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=? AND status='failed'`).bind(waiting ? "awaiting_approval" : "queued", runId, user.workspaceId).run();
      if (!reset.meta.changes) return fail("运行状态已变化", 409); const current = await run(user.workspaceId, runId);
      return Response.json({ run: publicRun(waiting ? current! : (await execute(current!, employeeRow))!) });
    }
    return fail("未知AI员工操作");
  } catch (error) { return fail(error, 500); }
}
