import { env } from "cloudflare:workers";
import { getSessionUser, unauthorized } from "../../auth-server";

type RuntimeEnv = { QIYU_AI_BASE_URL?: string; QIYU_AI_API_KEY?: string; QIYU_AI_CHAT_PATH?: string };
const expertInstructions: Record<string, string> = {
  service: "你是耐心、准确的客服专家。先解决问题，不夸大承诺；信息不足时只问一个最关键的问题。",
  sales: "你是顾问式销售专家。先理解客户需求，再说明最相关的价值，不施压，结尾给出一个自然且容易回答的问题。",
  private: "你是私域运营专家。像熟悉客户的真人顾问一样简洁交流，根据当前关系自然推进下一步，避免模板感。",
  success: "你是客户成功专家。关注客户是否得到结果，发现阻碍并给出明确而简短的下一步建议。",
  content: "你是内容营销专家。表达有吸引力但不标题党，突出真实场景、受众痛点与明确行动建议。",
};

async function aiDraft(role: string, contact: string, goal: string, context: string) {
  const runtime = env as unknown as RuntimeEnv;
  if (!runtime.QIYU_AI_BASE_URL || !runtime.QIYU_AI_API_KEY) throw new Error("服务器尚未配置AI模型");
  const path = runtime.QIYU_AI_CHAT_PATH || "/v1/chat/completions";
  const response = await fetch(`${runtime.QIYU_AI_BASE_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${runtime.QIYU_AI_API_KEY}` },
    body: JSON.stringify({ model: "gpt-5.5", stream: false, temperature: 0.4, max_tokens: 500, messages: [
      { role: "system", content: `${expertInstructions[role] || expertInstructions.private}\n${context ? `业务背景：${context}` : ""}\n只输出一条可以直接发送的中文微信消息，120字以内；不要分析、标题、引号和Markdown。` },
      { role: "user", content: `联系人：${contact || "客户"}\n沟通目标：${goal || "自然跟进并了解需求"}` },
    ] }), signal: AbortSignal.timeout(90000),
  });
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: string | { message?: string } };
  if (!response.ok) throw new Error(typeof data.error === "object" ? String(data.error?.message || "AI生成失败") : String(data.error || "AI生成失败"));
  const content = String(data.choices?.[0]?.message?.content || "").trim();
  if (!content) throw new Error("AI没有返回可用消息");
  return content;
}

async function ensureSchema() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS private_contacts (id INTEGER PRIMARY KEY AUTOINCREMENT,workspace_id INTEGER NOT NULL DEFAULT 0,name TEXT NOT NULL,remark TEXT NOT NULL DEFAULT '',source TEXT NOT NULL DEFAULT 'manual',status TEXT NOT NULL DEFAULT 'active',last_contact_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS private_tags (id INTEGER PRIMARY KEY AUTOINCREMENT,workspace_id INTEGER NOT NULL DEFAULT 0,name TEXT NOT NULL,color TEXT NOT NULL DEFAULT '#7657e5',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(workspace_id,name))`,
    `CREATE TABLE IF NOT EXISTS private_contact_tags (id INTEGER PRIMARY KEY AUTOINCREMENT,contact_id INTEGER NOT NULL,tag_id INTEGER NOT NULL,UNIQUE(contact_id,tag_id))`,
    `CREATE TABLE IF NOT EXISTS private_plans (id INTEGER PRIMARY KEY AUTOINCREMENT,workspace_id INTEGER NOT NULL DEFAULT 0,module TEXT NOT NULL,name TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',target_mode TEXT NOT NULL DEFAULT 'contacts',target_value TEXT NOT NULL DEFAULT '[]',settings TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS private_plan_steps (id INTEGER PRIMARY KEY AUTOINCREMENT,plan_id INTEGER NOT NULL,step_order INTEGER NOT NULL,action TEXT NOT NULL DEFAULT 'message',delay_minutes INTEGER NOT NULL DEFAULT 0,content TEXT NOT NULL DEFAULT '',settings TEXT NOT NULL DEFAULT '{}',enabled INTEGER NOT NULL DEFAULT 1)`,
    `CREATE TABLE IF NOT EXISTS private_runs (id INTEGER PRIMARY KEY AUTOINCREMENT,workspace_id INTEGER NOT NULL DEFAULT 0,plan_id INTEGER NOT NULL,contact_id INTEGER,device_id TEXT,status TEXT NOT NULL DEFAULT 'scheduled',current_step INTEGER NOT NULL DEFAULT 1,next_run_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,error TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,finished_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS private_inbound_messages (id INTEGER PRIMARY KEY AUTOINCREMENT,fingerprint TEXT NOT NULL UNIQUE,device_id TEXT NOT NULL,contact_id INTEGER NOT NULL,contact_name TEXT NOT NULL,message TEXT NOT NULL,plan_id INTEGER,response TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'received',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,replied_at TEXT)`,
    `CREATE INDEX IF NOT EXISTS private_contacts_workspace_idx ON private_contacts(workspace_id,status)`,
    `CREATE INDEX IF NOT EXISTS private_plans_workspace_module_idx ON private_plans(workspace_id,module)`,
    `CREATE INDEX IF NOT EXISTS private_runs_workspace_due_idx ON private_runs(workspace_id,status,next_run_at)`,
  ];
  await env.DB.batch(statements.map(sql => env.DB.prepare(sql)));
}

function parsed(value: unknown, fallback: unknown) { try { return typeof value === "string" ? JSON.parse(value) : value ?? fallback; } catch { return fallback; } }
function fail(error: unknown, status = 400) { return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status }); }

async function triggerNewContactWorkflows(workspaceId: number, contacts: Array<{ id: number; name: string }>) {
  if (!contacts.length) return 0;
  const workflows = await env.DB.prepare("SELECT id,title,description,metadata FROM product_records WHERE workspace_id=? AND module='auto-workflow'").bind(workspaceId).all();
  const statements: D1PreparedStatement[] = [];
  for (const workflow of workflows.results) {
    const metadata = parsed(workflow.metadata, {}) as Record<string, unknown>; if (String(metadata.trigger || "") !== "新增联系人") continue;
    const declaredAction = String(metadata.action || ""); const action = declaredAction === "等待人工审核" ? String(metadata.nextAction || metadata.approvalAction || "") : declaredAction;
    const approvalRequired = declaredAction === "等待人工审核" || ["发送微信消息", "平台发布"].includes(action) || metadata.approval === true || metadata.approval === "true";
    for (const contact of contacts) {
      const payload = { executionAction: action, reviewOnly: declaredAction === "等待人工审核" && !action, approvalRequired, target: contact.name, content: String(workflow.description || ""), platform: String(metadata.platform || ""), title: String(workflow.title || ""), mediaUrl: String(metadata.mediaUrl || ""), deviceId: String(metadata.deviceId || ""), contactId: contact.id };
      statements.push(env.DB.prepare(`INSERT OR IGNORE INTO workflow_runs(workspace_id,workflow_id,trigger_type,action_type,status,max_attempts,dedupe_key,payload)
        VALUES(?,?,?,?,?,?,?,?)`).bind(workspaceId, Number(workflow.id), "新增联系人", action || declaredAction, approvalRequired ? "awaiting_approval" : "queued", Math.max(1, Math.min(5, Number(metadata.maxAttempts || 3))), `contact:${contact.id}`, JSON.stringify(payload)));
    }
  }
  for (let index = 0; index < statements.length; index += 80) await env.DB.batch(statements.slice(index, index + 80));
  return statements.length;
}

async function contactsWithTags(workspaceId: number) {
  const contacts = await env.DB.prepare(`SELECT id,name,remark,source,status,last_contact_at AS lastContactAt,created_at AS createdAt FROM private_contacts WHERE workspace_id=? ORDER BY updated_at DESC`).bind(workspaceId).all();
  const tagRows = await env.DB.prepare(`SELECT ct.contact_id AS contactId,t.id,t.name,t.color FROM private_contact_tags ct JOIN private_tags t ON t.id=ct.tag_id JOIN private_contacts c ON c.id=ct.contact_id WHERE c.workspace_id=? AND t.workspace_id=?`).bind(workspaceId, workspaceId).all();
  return contacts.results.map(contact => ({ ...contact, tags: tagRows.results.filter(tag => tag.contactId === contact.id).map(({ contactId: _, ...tag }) => tag) }));
}

export async function GET(request: Request) {
  try {
    const user = await getSessionUser(request); if (!user) return unauthorized();
    await ensureSchema();
    const url = new URL(request.url); const action = url.searchParams.get("action") || "bootstrap"; const module = url.searchParams.get("module") || "activation";
    if (action === "bootstrap") {
      const [contacts, tags, plans, runs] = await Promise.all([
        contactsWithTags(user.workspaceId), env.DB.prepare("SELECT id,name,color,created_at AS createdAt FROM private_tags WHERE workspace_id=? ORDER BY id").bind(user.workspaceId).all(),
        env.DB.prepare(`SELECT id,module,name,status,target_mode AS targetMode,target_value AS targetValue,settings,created_at AS createdAt,updated_at AS updatedAt FROM private_plans WHERE workspace_id=? AND module=? ORDER BY id DESC`).bind(user.workspaceId, module).all(),
        env.DB.prepare(`SELECT r.id,r.plan_id AS planId,r.contact_id AS contactId,r.device_id AS deviceId,r.status,r.current_step AS currentStep,r.next_run_at AS nextRunAt,r.error,r.created_at AS createdAt,p.name AS planName,c.name AS contactName FROM private_runs r JOIN private_plans p ON p.id=r.plan_id LEFT JOIN private_contacts c ON c.id=r.contact_id WHERE r.workspace_id=? AND p.workspace_id=? AND p.module=? ORDER BY r.id DESC LIMIT 100`).bind(user.workspaceId, user.workspaceId, module).all(),
      ]);
      const planList = [];
      for (const plan of plans.results) {
        const steps = await env.DB.prepare(`SELECT id,step_order AS stepOrder,action,delay_minutes AS delayMinutes,content,settings,enabled FROM private_plan_steps WHERE plan_id=? ORDER BY step_order`).bind(plan.id).all();
        planList.push({ ...plan, targetValue: parsed(plan.targetValue, []), settings: parsed(plan.settings, {}), steps: steps.results.map(step => ({ ...step, enabled: Boolean(step.enabled), settings: parsed(step.settings, {}) })) });
      }
      let runList = runs.results;
      if (module === "auto-reply") {
        const inbound = await env.DB.prepare(`SELECT m.id,m.plan_id AS planId,p.name AS planName,m.contact_name AS contactName,m.message,m.response,m.status,m.created_at AS createdAt
          FROM private_inbound_messages m JOIN private_plans p ON p.id=m.plan_id WHERE p.workspace_id=? ORDER BY m.id DESC LIMIT 100`).bind(user.workspaceId).all();
        runList = inbound.results.map(row => ({ ...row, currentStep: 1, nextRunAt: row.createdAt, error: String(row.status).startsWith("failed:") ? String(row.status).slice(7) : row.status === "daily_limit" ? "已达到每日回复上限" : row.status === "no_response" ? "没有生成可用回复" : "", status: ["sent","drafted"].includes(String(row.status)) ? "completed" : String(row.status).startsWith("failed:") || ["daily_limit","no_response"].includes(String(row.status)) ? "failed" : "running" }));
      }
      return Response.json({ contacts, tags: tags.results, plans: planList, runs: runList });
    }
    if (action === "contact_scan_status") {
      const jobId = Number(url.searchParams.get("jobId") || 0);
      if (!jobId) return fail("缺少联系人扫描任务", 400);
      const job = await env.DB.prepare(`SELECT id,status,progress,result,error,created_at AS createdAt,updated_at AS updatedAt
        FROM automation_jobs WHERE id=? AND workspace_id=? AND type='wechat_contact_scan'`)
        .bind(jobId, user.workspaceId).first();
      if (!job) return fail("联系人扫描任务不存在", 404);
      return Response.json({ job: { ...job, result: parsed(job.result, {}) } });
    }
    return fail("未知操作");
  } catch (error) { return fail(error, 500); }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser(request); if (!user) return unauthorized();
    await ensureSchema(); const body = await request.json() as Record<string, unknown>; const action = String(body.action || "");
    if (action === "contact_save") {
      const name = String(body.name || "").trim(); if (!name) return fail("请填写联系人名称");
      const id = Number(body.id || 0); let row; let created = false;
      if (id) row = await env.DB.prepare("UPDATE private_contacts SET name=?,remark=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=? RETURNING id").bind(name, String(body.remark || ""), id, user.workspaceId).first();
      else { row = await env.DB.prepare("INSERT INTO private_contacts(workspace_id,name,remark) VALUES(?,?,?) RETURNING id").bind(user.workspaceId, name, String(body.remark || "")).first(); created = true; }
      if (!row) return fail("联系人不存在", 404);
      const workflowTriggered = created ? await triggerNewContactWorkflows(user.workspaceId, [{ id: Number(row.id), name }]) : 0;
      return Response.json({ contact: row, workflowTriggered });
    }
    if (action === "contact_scan_task") {
      const deviceId = String(body.deviceId || "").trim();
      if (!deviceId) return fail("请选择已配对的电脑助手");
      const device = await env.DB.prepare("SELECT capabilities FROM automation_devices WHERE device_id=? AND workspace_id=?")
        .bind(deviceId, user.workspaceId).first<{ capabilities: string }>();
      if (!device) return fail("设备不存在或不属于当前工作空间", 404);
      if (!(parsed(device.capabilities, []) as string[]).includes("wechat_contact_scan")) return fail("电脑助手版本不支持联系人同步，请升级后再试");
      const existing = await env.DB.prepare(`SELECT id,status,progress FROM automation_jobs WHERE workspace_id=? AND device_id=?
        AND type='wechat_contact_scan' AND status IN ('queued','claimed','running') ORDER BY id DESC LIMIT 1`)
        .bind(user.workspaceId, deviceId).first();
      if (existing) return Response.json({ job: existing, reused: true });
      const job = await env.DB.prepare("INSERT INTO automation_jobs(workspace_id,device_id,type,payload,status) VALUES(?,?, 'wechat_contact_scan','{}','queued') RETURNING id,status,progress")
        .bind(user.workspaceId, deviceId).first();
      return Response.json({ job }, { status: 201 });
    }
    if (action === "contacts_import") {
      const input = Array.isArray(body.contacts) ? body.contacts.slice(0, 5000) : [];
      const names = [...new Set(input.map(item => String(typeof item === "string" ? item : (item as Record<string, unknown>)?.name || "").replace(/\s+/g, " ").trim()).filter(name => name.length >= 1 && name.length <= 80))];
      if (!names.length) return fail("请选择要导入的联系人");
      const existing = await env.DB.prepare("SELECT name FROM private_contacts WHERE workspace_id=?").bind(user.workspaceId).all();
      const known = new Set(existing.results.map(row => String(row.name)));
      const statements = names.map(name => known.has(name)
        ? env.DB.prepare("UPDATE private_contacts SET remark=CASE WHEN remark='' THEN '微信自动同步' ELSE remark END,status='active',updated_at=CURRENT_TIMESTAMP WHERE workspace_id=? AND name=?").bind(user.workspaceId, name)
        : env.DB.prepare("INSERT INTO private_contacts(workspace_id,name,remark,source,status) VALUES(?,?,'微信自动同步','wechat_desktop','active')").bind(user.workspaceId, name));
      for (let index = 0; index < statements.length; index += 80) await env.DB.batch(statements.slice(index, index + 80));
      const imported = names.filter(name => !known.has(name)).length;
      const addedNames = names.filter(name => !known.has(name)); const addedContacts: Array<{ id: number; name: string }> = [];
      for (let index = 0; index < addedNames.length; index += 300) {
        const chunk = addedNames.slice(index, index + 300); const placeholders = chunk.map(() => "?").join(",");
        const rows = await env.DB.prepare(`SELECT id,name FROM private_contacts WHERE workspace_id=? AND name IN (${placeholders})`).bind(user.workspaceId, ...chunk).all<{ id: number; name: string }>();
        addedContacts.push(...rows.results);
      }
      const workflowTriggered = await triggerNewContactWorkflows(user.workspaceId, addedContacts);
      return Response.json({ ok: true, imported, updated: names.length - imported, total: names.length, workflowTriggered });
    }
    if (action === "contact_delete") { const contact = await env.DB.prepare("SELECT id FROM private_contacts WHERE id=? AND workspace_id=?").bind(body.id, user.workspaceId).first(); if (!contact) return fail("联系人不存在", 404); await env.DB.batch([env.DB.prepare("DELETE FROM private_contact_tags WHERE contact_id=?").bind(body.id), env.DB.prepare("DELETE FROM private_contacts WHERE id=? AND workspace_id=?").bind(body.id, user.workspaceId)]); return Response.json({ ok: true }); }
    if (action === "tag_save") {
      const name = String(body.name || "").trim(); if (!name) return fail("请输入标签名称");
      const row = await env.DB.prepare("INSERT INTO private_tags(workspace_id,name,color) VALUES(?,?,?) ON CONFLICT(workspace_id,name) DO UPDATE SET color=excluded.color RETURNING id").bind(user.workspaceId, name, String(body.color || "#7657e5")).first(); return Response.json({ tag: row });
    }
    if (action === "contact_tags") {
      const contactId = Number(body.contactId); const tagIds = [...new Set(Array.isArray(body.tagIds) ? body.tagIds.map(Number).filter(Boolean) : [])];
      const contact = await env.DB.prepare("SELECT id FROM private_contacts WHERE id=? AND workspace_id=?").bind(contactId, user.workspaceId).first(); if (!contact) return fail("联系人不存在", 404);
      if (tagIds.length) { const placeholders = tagIds.map(() => "?").join(","); const tags = await env.DB.prepare(`SELECT id FROM private_tags WHERE workspace_id=? AND id IN (${placeholders})`).bind(user.workspaceId, ...tagIds).all(); if (tags.results.length !== tagIds.length) return fail("标签不存在", 404); }
      await env.DB.prepare("DELETE FROM private_contact_tags WHERE contact_id=?").bind(contactId).run();
      if (tagIds.length) await env.DB.batch(tagIds.map(tagId => env.DB.prepare("INSERT OR IGNORE INTO private_contact_tags(contact_id,tag_id) VALUES(?,?)").bind(contactId, tagId)));
      return Response.json({ ok: true });
    }
    if (action === "plan_save") {
      const name = String(body.name || "").trim(); const module = String(body.module || "activation"); if (!name) return fail("请输入方案名称");
      const id = Number(body.id || 0); const targetValue = JSON.stringify(body.targetValue || []); const settings = JSON.stringify(body.settings || {}); let planId = id;
      const requestedTargetMode = String(body.targetMode || "all"); const targetMode = ["all","tags","manual","contacts"].includes(requestedTargetMode) ? requestedTargetMode : "all";
      if (id) { const row = await env.DB.prepare("UPDATE private_plans SET name=?,status=?,target_mode=?,target_value=?,settings=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=? RETURNING id").bind(name, String(body.status || "draft"), targetMode, targetValue, settings, id, user.workspaceId).first(); if (!row) return fail("方案不存在", 404); }
      else { const row = await env.DB.prepare("INSERT INTO private_plans(workspace_id,module,name,status,target_mode,target_value,settings) VALUES(?,?,?,?,?,?,?) RETURNING id").bind(user.workspaceId, module, name, String(body.status || "draft"), targetMode, targetValue, settings).first<{id:number}>(); planId = row!.id; }
      await env.DB.prepare("DELETE FROM private_plan_steps WHERE plan_id=?").bind(planId).run();
      const steps = Array.isArray(body.steps) ? body.steps as Record<string, unknown>[] : [];
      if (steps.length) await env.DB.batch(steps.map((step, index) => env.DB.prepare("INSERT INTO private_plan_steps(plan_id,step_order,action,delay_minutes,content,settings,enabled) VALUES(?,?,?,?,?,?,?)").bind(planId,index+1,String(step.action||"message"),Math.max(0,Number(step.delayMinutes||0)),String(step.content||""),JSON.stringify(step.settings||{}),step.enabled===false?0:1)));
      return Response.json({ plan: { id: planId } });
    }
    if (action === "plan_toggle") { const row = await env.DB.prepare("UPDATE private_plans SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=? RETURNING id").bind(String(body.status || "active"), body.id, user.workspaceId).first(); if (!row) return fail("方案不存在", 404); return Response.json({ ok: true }); }
    if (action === "plan_delete") { const plan = await env.DB.prepare("SELECT id FROM private_plans WHERE id=? AND workspace_id=?").bind(body.id, user.workspaceId).first(); if (!plan) return fail("方案不存在", 404); await env.DB.batch([env.DB.prepare("DELETE FROM private_plan_steps WHERE plan_id=?").bind(body.id), env.DB.prepare("DELETE FROM private_plans WHERE id=? AND workspace_id=?").bind(body.id, user.workspaceId)]); return Response.json({ ok: true }); }
    if (action === "run_plan") {
      const planId = Number(body.planId || 0); const deviceId = String(body.deviceId || "").trim();
      if (!planId || !deviceId) return fail("请选择方案和已配对的电脑助手");
      const plan = await env.DB.prepare(`SELECT id,target_mode AS targetMode,target_value AS targetValue,settings
        FROM private_plans WHERE id=? AND workspace_id=?`).bind(planId, user.workspaceId)
        .first<{ id: number; targetMode: string; targetValue: string; settings: string }>();
      if (!plan) return fail("方案不存在", 404);
      const device = await env.DB.prepare("SELECT capabilities FROM automation_devices WHERE device_id=? AND workspace_id=?")
        .bind(deviceId, user.workspaceId).first<{ capabilities: string }>();
      if (!device) return fail("设备不存在或不属于当前工作空间", 404);
      const capabilities = parsed(device.capabilities, []) as string[];
      if (!capabilities.includes("wechat_sop_step")) return fail("电脑助手版本太旧，请先安装最新版");
      const planSettings = parsed(plan.settings, {}) as Record<string, unknown>;
      const aiEnabled = planSettings.aiEnabled === true || planSettings.replyType === "ai";
      if (aiEnabled && !capabilities.includes("wechat_ai_reply")) return fail("当前电脑助手不支持AI上下文消息，请升级后再试");
      let contactIds = Array.isArray(parsed(plan.targetValue, [])) ? parsed(plan.targetValue, []) as number[] : [];
      if (plan.targetMode === "all") {
        const rows = await env.DB.prepare("SELECT id FROM private_contacts WHERE workspace_id=? AND status='active' ORDER BY id").bind(user.workspaceId).all();
        contactIds = rows.results.map(row => Number(row.id));
      } else if (plan.targetMode === "tags") {
        const tagIds = [...new Set(contactIds.map(Number).filter(Boolean))];
        if (!tagIds.length) return fail("方案还没有选择目标标签");
        const placeholders = tagIds.map(() => "?").join(",");
        const rows = await env.DB.prepare(`SELECT DISTINCT c.id FROM private_contacts c JOIN private_contact_tags ct ON ct.contact_id=c.id
          JOIN private_tags t ON t.id=ct.tag_id WHERE c.workspace_id=? AND c.status='active' AND t.workspace_id=? AND t.id IN (${placeholders})`)
          .bind(user.workspaceId, user.workspaceId, ...tagIds).all();
        contactIds = rows.results.map(row => Number(row.id));
      }
      contactIds = [...new Set(contactIds.map(Number).filter(Boolean))];
      if (contactIds.length) {
        const placeholders = contactIds.map(() => "?").join(",");
        const valid = await env.DB.prepare(`SELECT id FROM private_contacts WHERE workspace_id=? AND status='active' AND id IN (${placeholders})`)
          .bind(user.workspaceId, ...contactIds).all();
        contactIds = valid.results.map(row => Number(row.id));
      }
      if (!contactIds.length) return fail(plan.targetMode === "all" ? "当前还没有可执行的好友" : "方案还没有选择有效目标联系人");
      const activeRows = await env.DB.prepare(`SELECT contact_id AS contactId FROM private_runs WHERE workspace_id=? AND plan_id=?
        AND status IN ('scheduled','running')`).bind(user.workspaceId, plan.id).all();
      const activeContactIds = new Set(activeRows.results.map(row => Number(row.contactId)));
      contactIds = contactIds.filter(contactId => !activeContactIds.has(contactId));
      if (!contactIds.length) return fail("这个方案的目标联系人已有任务正在执行，请到执行记录查看进度");
      const statements = contactIds.map(contactId => env.DB.prepare(`INSERT INTO private_runs(workspace_id,plan_id,contact_id,device_id,status,current_step,next_run_at)
        VALUES(?,?,?,?,'scheduled',1,CURRENT_TIMESTAMP)`).bind(user.workspaceId, plan.id, contactId, deviceId));
      for (let index = 0; index < statements.length; index += 80) await env.DB.batch(statements.slice(index, index + 80));
      await env.DB.prepare("UPDATE private_plans SET status='active',updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=?").bind(plan.id, user.workspaceId).run();
      return Response.json({ ok: true, count: contactIds.length });
    }
    /* if (action === "run_plan") {
      const planId = Number(body.planId); const deviceId = String(body.deviceId || ""); const plan = await env.DB.prepare("SELECT target_mode AS targetMode,target_value AS targetValue,settings FROM private_plans WHERE id=?").bind(planId).first(); if (!plan) return fail("方案不存在");
      const device = await env.DB.prepare("SELECT version,capabilities,last_seen_at AS lastSeenAt FROM automation_devices WHERE device_id=?").bind(deviceId).first();
      if (!device) return fail("没有找到这台电脑，请重新启动奇遇AI助手");
      const capabilities = parsed(device.capabilities, []) as string[];
      if (!capabilities.includes("wechat_sop_step")) return fail("电脑助手版本太旧，请先安装最新版");
      const planSettings = parsed(plan.settings, {}) as Record<string, unknown>;
      const aiEnabled = planSettings.aiEnabled === true || planSettings.replyType === "ai";
      if (aiEnabled && !capabilities.includes("wechat_ai_reply")) return fail("当前电脑助手不支持AI上下文消息，请升级到0.5.7或更高版本");
      let contactIds = Array.isArray(parsed(plan.targetValue, [])) ? parsed(plan.targetValue, []) as number[] : [];
      if (plan.targetMode === "all") { const rows = await env.DB.prepare("SELECT id FROM private_contacts WHERE status='active' ORDER BY id").all(); contactIds = rows.results.map(row=>Number(row.id)); }
      if (plan.targetMode === "tags") { const ids = Array.isArray(parsed(plan.targetValue, [])) ? parsed(plan.targetValue, []) as number[] : []; if (ids.length) { const placeholders=ids.map(()=>"?").join(","); const rows=await env.DB.prepare(`SELECT DISTINCT c.id FROM private_contacts c JOIN private_contact_tags pct ON pct.contact_id=c.id WHERE c.status='active' AND pct.tag_id IN (${placeholders})`).bind(...ids).all(); contactIds=rows.results.map(row=>Number(row.id)); } }
      if (!contactIds.length) return fail(plan.targetMode === "all" ? "当前还没有可执行的好友" : "方案还没有选择目标联系人");
      contactIds = [...new Set(contactIds.map(Number).filter(Boolean))];
      const activeRows = await env.DB.prepare("SELECT contact_id AS contactId FROM private_runs WHERE plan_id=? AND status IN ('scheduled','running')").bind(planId).all();
      const activeContactIds = new Set(activeRows.results.map(row => Number(row.contactId)));
      contactIds = contactIds.filter(contactId => !activeContactIds.has(contactId));
      if (!contactIds.length) return fail("这个方案的目标联系人已有任务正在执行，请到执行记录查看进度");
      await env.DB.batch(contactIds.map(contactId => env.DB.prepare("INSERT INTO private_runs(plan_id,contact_id,device_id,status,current_step,next_run_at) VALUES(?,?,?,'scheduled',1,CURRENT_TIMESTAMP)").bind(planId,contactId,deviceId||null)));
      await env.DB.prepare("UPDATE private_plans SET status='active',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(planId).run(); return Response.json({ ok: true, count: contactIds.length });
    } */
    if (action === "message_task") {
      const contact = String(body.contact || "").trim(); const content = String(body.content || "").trim(); const aiRequested = body.aiRequested === true;
      const deviceId = String(body.deviceId || "").trim();
      if (!contact || (!content && !aiRequested)) return fail(aiRequested ? "请选择联系人并填写本次沟通目标" : "联系人和消息不能为空");
      if (!deviceId) return fail("请选择已配对的电脑助手");
      const device = await env.DB.prepare("SELECT capabilities FROM automation_devices WHERE device_id=? AND workspace_id=?")
        .bind(deviceId, user.workspaceId).first<{ capabilities: string }>();
      if (!device) return fail("设备不存在或不属于当前工作空间", 404);
      if (aiRequested && !(parsed(device.capabilities, []) as string[]).includes("wechat_ai_reply")) return fail("当前电脑助手不支持AI上下文消息，请升级后再试");
      const contactRow = await env.DB.prepare(`SELECT name FROM private_contacts WHERE workspace_id=? AND (name=? OR remark=?)
        ORDER BY CASE WHEN name=? THEN 0 ELSE 1 END LIMIT 1`).bind(user.workspaceId, contact, contact, contact).first<{ name: string }>();
      if (!contactRow) return fail("联系人不存在于当前工作空间", 404);
      const type = aiRequested ? "wechat_ai_reply" : body.sendApproved ? "wechat_send" : "wechat_draft";
      const payload = aiRequested ? {
        contact: contactRow.name, goal: String(body.goal || content || "结合当前聊天自然推进下一步"), sendApproved: Boolean(body.sendApproved),
        aiSettings: {
          expertRole: String(body.expertRole || "private"), modelTier: String(body.modelTier || "smart"),
          businessContext: String(body.businessContext || ""), useKnowledge: body.useKnowledge !== false,
          useCustomerData: body.useCustomerData !== false, useChatHistory: body.useChatHistory !== false,
          historyLimit: Math.max(30, Math.min(50, Number(body.historyLimit || 40))),
        },
      } : { contact: contactRow.name, message: content, sendApproved: Boolean(body.sendApproved) };
      const job = await env.DB.prepare("INSERT INTO automation_jobs(workspace_id,device_id,type,payload,status) VALUES(?,?,?,?, 'queued') RETURNING id")
        .bind(user.workspaceId, deviceId, type, JSON.stringify(payload)).first();
      return Response.json({ job }, { status: 201 });
    }
    /* if (action === "message_task") {
      const contact = String(body.contact || "").trim(); const content = String(body.content || "").trim(); const aiRequested = body.aiRequested === true;
      if (!contact || (!content && !aiRequested)) return fail(aiRequested ? "请选择联系人并填写本次沟通目标" : "联系人和消息不能为空");
      const type = aiRequested ? "wechat_ai_reply" : body.sendApproved ? "wechat_send" : "wechat_draft";
      const payload = aiRequested ? {
        contact, goal: String(body.goal || content || "结合当前聊天自然推进下一步"), sendApproved: Boolean(body.sendApproved),
        aiSettings: {
          expertRole: String(body.expertRole || "private"), modelTier: String(body.modelTier || "smart"),
          businessContext: String(body.businessContext || ""), useKnowledge: body.useKnowledge !== false,
          useCustomerData: body.useCustomerData !== false, useChatHistory: body.useChatHistory !== false,
          historyLimit: Math.max(30, Math.min(50, Number(body.historyLimit || 40))),
        },
      } : { contact, message: content, sendApproved: Boolean(body.sendApproved) };
      const row = await env.DB.prepare("INSERT INTO automation_jobs(device_id,type,payload,status) VALUES(?,?,?,'queued') RETURNING id").bind(body.deviceId || null,type,JSON.stringify(payload)).first(); return Response.json({ job: row });
    } */
    if (action === "ai_draft") {
      const content = await aiDraft(String(body.role || "private"), String(body.contact || ""), String(body.goal || ""), String(body.context || ""));
      return Response.json({ content });
    }
    return fail("未知操作");
  } catch (error) { return fail(error, 500); }
}
