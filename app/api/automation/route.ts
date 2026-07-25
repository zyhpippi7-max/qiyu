import { env } from "cloudflare:workers";
import { getSessionUser } from "../../auth-server";

type RuntimeEnv = {
  QIYU_AI_BASE_URL?: string;
  QIYU_AI_API_KEY?: string;
  QIYU_AI_CHAT_PATH?: string;
};

async function ensureSchema() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS automation_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id INTEGER NOT NULL DEFAULT 0, device_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL, platform TEXT NOT NULL, version TEXT NOT NULL DEFAULT '0.1.0',
    token TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'offline', capabilities TEXT NOT NULL DEFAULT '[]',
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS automation_pairing_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id INTEGER NOT NULL, code_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL, consumed_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS automation_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id INTEGER NOT NULL DEFAULT 0, device_id TEXT, type TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'queued', progress INTEGER NOT NULL DEFAULT 0,
    result TEXT NOT NULL DEFAULT '{}', error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, claimed_at TEXT, finished_at TEXT
  )`).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS automation_devices_workspace_seen_idx ON automation_devices (workspace_id, last_seen_at)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS automation_jobs_workspace_claim_idx ON automation_jobs (workspace_id, status, device_id, created_at)").run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS acquisition_tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,workspace_id INTEGER NOT NULL DEFAULT 0,name TEXT NOT NULL,platform TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',source_type TEXT NOT NULL DEFAULT 'keyword_search',target TEXT NOT NULL DEFAULT '',keywords TEXT NOT NULL DEFAULT '[]',exclude_keywords TEXT NOT NULL DEFAULT '[]',settings TEXT NOT NULL DEFAULT '{}',device_id TEXT,last_run_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS acquisition_leads (id INTEGER PRIMARY KEY AUTOINCREMENT,workspace_id INTEGER NOT NULL DEFAULT 0,task_id INTEGER,platform TEXT NOT NULL,nickname TEXT NOT NULL,platform_id TEXT NOT NULL DEFAULT '',profile_url TEXT NOT NULL DEFAULT '',source_url TEXT NOT NULL DEFAULT '',source_text TEXT NOT NULL DEFAULT '',matched_keywords TEXT NOT NULL DEFAULT '[]',score INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'new',notes TEXT NOT NULL DEFAULT '',converted_contact_id INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS acquisition_leads_workspace_dedupe_idx ON acquisition_leads(workspace_id,platform,nickname,platform_id,profile_url)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS private_inbound_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id INTEGER NOT NULL DEFAULT 0, fingerprint TEXT NOT NULL UNIQUE, device_id TEXT NOT NULL,
    contact_id INTEGER NOT NULL, contact_name TEXT NOT NULL, message TEXT NOT NULL, plan_id INTEGER,
    response TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'received',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, replied_at TEXT
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS product_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,workspace_id INTEGER NOT NULL DEFAULT 0,module TEXT NOT NULL,title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'draft',
    metadata TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

function jsonValue(value: unknown, fallback: unknown) {
  try { return typeof value === "string" ? JSON.parse(value) : value ?? fallback; }
  catch { return fallback; }
}

function bearer(request: Request) {
  const header = request.headers.get("authorization") || "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

async function authenticate(request: Request, deviceId: string) {
  return env.DB.prepare("SELECT device_id AS deviceId,workspace_id AS workspaceId FROM automation_devices WHERE device_id = ? AND token = ?").bind(deviceId, bearer(request)).first<{ deviceId: string; workspaceId: number }>();
}

function modelForTier(tier: unknown) {
  const value = String(tier || "smart");
  if (value === "fast") return "gpt-5.5";
  if (value === "quality") return "gpt-5.5";
  return "gpt-5.5";
}

async function callAi(system: string, user: string, tier?: unknown) {
  const runtime = env as unknown as RuntimeEnv;
  if (!runtime.QIYU_AI_BASE_URL || !runtime.QIYU_AI_API_KEY) throw new Error("服务器尚未配置AI模型");
  const path = runtime.QIYU_AI_CHAT_PATH || "/v1/chat/completions";
  const response = await fetch(`${runtime.QIYU_AI_BASE_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${runtime.QIYU_AI_API_KEY}` },
    body: JSON.stringify({
      model: modelForTier(tier), stream: false, temperature: 0.35, max_tokens: 1800,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(90000),
  });
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: string | { message?: string } };
  if (!response.ok) throw new Error(typeof data.error === "object" ? String(data.error?.message || "AI调用失败") : String(data.error || "AI调用失败"));
  return String(data.choices?.[0]?.message?.content || "").trim();
}

const expertPrompts: Record<string, string> = {
  service: "你是耐心、准确的客服专家。先解决问题，不夸大承诺，不编造政策；信息不足时只提出一个最关键的问题。",
  sales: "你是顾问式销售专家。先理解需求，再说明与客户最相关的价值；不施压、不虚构优惠，结尾给出一个自然且容易回复的问题。",
  private: "你是私域运营专家。像熟悉客户的真人顾问一样简洁交流，结合当前跟进阶段推进下一步，避免模板感和连续轰炸。",
  success: "你是客户成功专家。关注客户是否真正用出结果，主动发现阻碍，给出明确而简短的下一步建议。",
  content: "你是内容营销专家。表达有吸引力但不标题党，突出真实场景、受众痛点和明确行动建议。",
};

type ChatHistoryItem = { direction: "incoming" | "outgoing" | "unknown"; text: string };

function normalizeHistory(value: unknown, limit = 40): ChatHistoryItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-Math.max(1, Math.min(50, limit))).map(item => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : { text: item };
    const direction = ["incoming", "outgoing"].includes(String(row.direction)) ? String(row.direction) as "incoming" | "outgoing" : "unknown";
    return { direction, text: String(row.text || "").replace(/\s+/g, " ").trim().slice(0, 800) };
  }).filter(item => item.text);
}

async function relatedKnowledge(query: string, workspaceId: number) {
  const rows = await env.DB.prepare(`SELECT title,description,metadata FROM product_records
    WHERE workspace_id=? AND module='knowledge' AND status='active' ORDER BY updated_at DESC LIMIT 80`).bind(workspaceId).all();
  const normalizedQuery = query.toLowerCase();
  const latinTerms = normalizedQuery.match(/[a-z0-9][a-z0-9._-]{1,}/g) || [];
  const chineseRuns = normalizedQuery.match(/[\p{Script=Han}]{2,}/gu) || [];
  const chineseTerms = chineseRuns.flatMap(run => {
    const terms: string[] = [run];
    for (let size = 2; size <= Math.min(4, run.length); size += 1) {
      for (let index = 0; index <= run.length - size; index += 1) {
        terms.push(run.slice(index, index + size));
      }
    }
    return terms;
  });
  const terms = [...new Set([...latinTerms, ...chineseTerms])].slice(0, 160);
  const ranked = rows.results.map(row => {
    const metadata = jsonValue(row.metadata, {}) as Record<string, unknown>;
    const content = `${String(row.title || "")} ${String(row.description || "")} ${String(metadata.content || "")}`;
    const normalized = content.toLowerCase();
    const score = terms.reduce((total, term) => total + (normalized.includes(term) ? Math.min(6, term.length) : 0), 0);
    return { title: String(row.title || "企业知识"), content: String(metadata.content || row.description || "").slice(0, 2200), score };
  }).filter(item => item.content).sort((a, b) => b.score - a.score);
  const selected = ranked.filter(item => item.score > 0).slice(0, 6);
  return (selected.length ? selected : ranked.slice(0, 3)).map(item => `【${item.title}】${item.content}`).join("\n");
}

async function customerContext(contactName: string, workspaceId: number) {
  try {
    const contact = await env.DB.prepare(`SELECT id,name,remark,last_contact_at AS lastContactAt
      FROM private_contacts WHERE workspace_id=? AND (name=? OR remark=?) ORDER BY CASE WHEN name=? THEN 0 ELSE 1 END LIMIT 1`)
      .bind(workspaceId, contactName, contactName, contactName).first<{ id: number; name: string; remark: string; lastContactAt?: string }>();
    if (!contact) return "";
    const tags = await env.DB.prepare(`SELECT t.name FROM private_contact_tags ct
      JOIN private_tags t ON t.id=ct.tag_id WHERE ct.contact_id=? AND t.workspace_id=? ORDER BY t.id`).bind(contact.id, workspaceId).all();
    return `客户名称：${contact.name}\n客户备注：${contact.remark || "未填写"}\n客户标签：${tags.results.map(row => String(row.name)).join("、") || "未设置"}\n最近跟进：${contact.lastContactAt || "暂无记录"}`;
  } catch {
    return "";
  }
}

async function contextualReply(contact: string, goal: string, historyValue: unknown, settings: Record<string, unknown>, workspaceId: number) {
  const history = normalizeHistory(historyValue, Number(settings.historyLimit || 40));
  const role = String(settings.expertRole || "private");
  const rolePrompt = expertPrompts[role] || expertPrompts.private;
  const transcript = history.map(item => `${item.direction === "outgoing" ? "我方" : item.direction === "incoming" ? "客户" : "对话"}：${item.text}`).join("\n");
  const knowledge = settings.useKnowledge === false ? "" : await relatedKnowledge(`${goal}\n${transcript}`, workspaceId);
  const customer = settings.useCustomerData === false ? "" : await customerContext(contact, workspaceId);
  const system = `${rolePrompt}
你正在基于真实客户上下文拟写下一条回复。只能使用提供的聊天记录、客户资料和企业知识；资料没有写明的价格、库存、政策或承诺不得编造。
${String(settings.businessContext || "").trim() ? `本次业务补充：${String(settings.businessContext).trim()}` : ""}
${customer ? `\n客户资料：\n${customer}` : ""}
${knowledge ? `\n可引用的企业知识：\n${knowledge}` : ""}
只输出一条可以直接发送的中文微信消息，控制在160字内，不输出分析、标题、引号或Markdown。`;
  const user = `联系人：${contact || "客户"}\n本次目标：${goal || "结合当前对话自然推进下一步"}\n最近对话（按时间从旧到新，共${history.length}条）：\n${transcript || "本次没有读取到可见聊天记录；请保持保守，只提出一个用于确认上下文的问题。"}`;
  const content = await callAi(system, user, settings.modelTier);
  return { content, historyCount: history.length, knowledgeUsed: Boolean(knowledge), customerDataUsed: Boolean(customer) };
}

async function privateMessage(run: Record<string, unknown>, planSettings: Record<string, unknown>) {
  if (planSettings.aiEnabled !== true && planSettings.replyType !== "ai") return String(run.content || "");
  const role = String(planSettings.expertRole || "private");
  const instruction = expertPrompts[role] || expertPrompts.private;
  const business = String(planSettings.businessContext || "").trim();
  const stepGoal = String(run.content || "跟进客户并自然推进下一步").trim();
  const output = await callAi(
    `${instruction}\n${business ? `业务背景：${business}` : ""}\n只输出一条可以直接发给客户的中文微信消息，控制在120字内，不输出分析、标题、引号或Markdown。`,
    `联系人：${String(run.contactName || "客户")}\n本次跟进目标：${stepGoal}`,
    planSettings.modelTier,
  );
  return output || stepGoal;
}

async function dispatchDueRun(workspaceId: number, deviceId: string) {
  const run = await env.DB.prepare(`SELECT r.id,r.plan_id AS planId,r.contact_id AS contactId,r.current_step AS currentStep,
    c.name AS contactName,p.settings AS planSettings,s.action,s.content,s.delay_minutes AS delayMinutes,s.settings AS stepSettings
    FROM private_runs r JOIN private_plans p ON p.id=r.plan_id AND p.workspace_id=? JOIN private_contacts c ON c.id=r.contact_id AND c.workspace_id=?
    JOIN private_plan_steps s ON s.plan_id=r.plan_id AND s.step_order=r.current_step
    WHERE r.workspace_id=? AND r.status='scheduled' AND r.next_run_at<=CURRENT_TIMESTAMP AND r.device_id=?
    AND s.enabled=1 ORDER BY r.next_run_at,r.id LIMIT 1`).bind(workspaceId, workspaceId, workspaceId, deviceId).first();
  if (!run) return;
  const planSettings = jsonValue(run.planSettings, {}) as Record<string, unknown>;
  const dailyLimit = Math.max(1, Math.min(200, Number(planSettings.dailyLimit || 20)));
  const sentToday = await env.DB.prepare(`SELECT COUNT(*) AS count FROM automation_jobs WHERE workspace_id=? AND type='wechat_sop_step' AND status='succeeded' AND date(finished_at)=date('now') AND json_extract(payload,'$.planId')=?`).bind(workspaceId, run.planId).first<{ count: number }>();
  if (Number(sentToday?.count || 0) >= dailyLimit) {
    await env.DB.prepare("UPDATE private_runs SET next_run_at=datetime('now','start of day','+1 day','+9 hours'),updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=?").bind(run.id, workspaceId).run();
    return;
  }
  const aiRequested = planSettings.aiEnabled === true || planSettings.replyType === "ai";
  const content = aiRequested ? "" : String(run.content || "");
  const payload = { runId: run.id, planId: run.planId, stepOrder: run.currentStep, contact: run.contactName,
    action: run.action, content, goal: String(run.content || "结合当前聊天自然推进下一步"), approval: planSettings.approval !== false,
    aiRequested, aiGenerated: false, aiSettings: {
      expertRole: String(planSettings.expertRole || "private"), modelTier: String(planSettings.modelTier || "smart"),
      businessContext: String(planSettings.businessContext || ""), useKnowledge: planSettings.useKnowledge !== false,
      useCustomerData: planSettings.useCustomerData !== false, useChatHistory: planSettings.useChatHistory !== false,
      historyLimit: Math.max(30, Math.min(50, Number(planSettings.historyLimit || 40))),
    }, settings: jsonValue(run.stepSettings, {}) };
  const inserted = await env.DB.prepare("INSERT INTO automation_jobs(workspace_id,device_id,type,payload,status) VALUES(?, ?, 'wechat_sop_step', ?, 'queued') RETURNING id").bind(workspaceId, deviceId, JSON.stringify(payload)).first();
  await env.DB.prepare("UPDATE private_runs SET status='running',updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=? AND status='scheduled'").bind(run.id, workspaceId).run();
  return inserted;
}

async function dispatchInboxScan(workspaceId: number, deviceId: string) {
  const active = await env.DB.prepare("SELECT id FROM private_plans WHERE workspace_id=? AND module='auto-reply' AND status='active' LIMIT 1").bind(workspaceId).first();
  if (!active) return;
  const recent = await env.DB.prepare(`SELECT id FROM automation_jobs WHERE workspace_id=? AND device_id=? AND type='wechat_inbox_scan'
    AND (status IN ('queued','claimed','running') OR created_at>=datetime('now','-8 seconds')) LIMIT 1`).bind(workspaceId, deviceId).first();
  if (recent) return;
  await env.DB.prepare("INSERT INTO automation_jobs(workspace_id,device_id,type,payload,status) VALUES(?,?,'wechat_inbox_scan',?,'queued')")
    .bind(workspaceId, deviceId, JSON.stringify({ source: "auto-reply-monitor" })).run();
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map(item => item.toString(16).padStart(2, "0")).join("");
}

async function planIncludesContact(plan: Record<string, unknown>, contactId: number, workspaceId: number) {
  const targets = jsonValue(plan.targetValue, []) as unknown[];
  const mode = String(plan.targetMode || "all");
  if (mode === "all") return true;
  if (mode === "contacts" || mode === "manual") return targets.map(Number).includes(contactId);
  if (mode === "tags") {
    const tagIds = targets.map(Number).filter(Boolean);
    if (!tagIds.length) return false;
    const placeholders = tagIds.map(() => "?").join(",");
    const row = await env.DB.prepare(`SELECT 1 AS found FROM private_contact_tags ct JOIN private_tags t ON t.id=ct.tag_id WHERE ct.contact_id=? AND t.workspace_id=? AND ct.tag_id IN (${placeholders}) LIMIT 1`).bind(contactId, workspaceId, ...tagIds).first();
    return Boolean(row);
  }
  return false;
}

type IncomingWechatEvent = { contact: string; message: string; history: ChatHistoryItem[]; kind: "message" | "new_friend" };

function incomingWechatEvents(value: Record<string, unknown>) {
  const rows = Array.isArray(value.messages) ? value.messages : [value];
  return rows.map(row => {
    const source = row && typeof row === "object" ? row as Record<string, unknown> : {};
    return {
      contact: String(source.contact || "").trim(),
      message: String(source.message || "").replace(/\s+/g, " ").trim(),
      history: normalizeHistory(source.history, 40),
      kind: source.kind === "new_friend" ? "new_friend" : "message",
    } satisfies IncomingWechatEvent;
  }).filter(event => event.contact && (event.kind === "new_friend" || event.message));
}

function matchesAutoReplyRule(settings: Record<string, unknown>, event: IncomingWechatEvent) {
  const type = String(settings.type || "ai");
  if (type === "greet") return event.kind === "new_friend";
  if (event.kind !== "message") return false;
  if (type !== "keyword") return true;
  const keywords = String(settings.keywords || "").split(/[，,、\s]+/).map(word => word.trim()).filter(Boolean);
  if (!keywords.length) return false;
  const message = event.message.trim();
  const matchType = String(settings.matchType || "contains");
  if (matchType === "exact") return keywords.some(word => message.localeCompare(word, "zh-Hans-CN", { sensitivity: "accent" }) === 0);
  if (matchType === "regex") {
    try { return keywords.some(pattern => new RegExp(pattern, "i").test(message)); }
    catch { return false; }
  }
  const normalizedMessage = message.toLocaleLowerCase();
  return keywords.some(word => normalizedMessage.includes(word.toLocaleLowerCase()));
}

async function triggerWechatMessageWorkflows(workspaceId: number, deviceId: string, contact: { id: number; name: string }, message: string, fingerprint: string) {
  const workflows = await env.DB.prepare("SELECT id,title,description,metadata FROM product_records WHERE workspace_id=? AND module='auto-workflow'").bind(workspaceId).all();
  const statements: D1PreparedStatement[] = [];
  for (const workflow of workflows.results) {
    const metadata = jsonValue(workflow.metadata, {}) as Record<string, unknown>; if (String(metadata.trigger || "") !== "收到微信消息") continue;
    const declaredAction = String(metadata.action || ""); const action = declaredAction === "等待人工审核" ? String(metadata.nextAction || metadata.approvalAction || "") : declaredAction;
    const approvalRequired = declaredAction === "等待人工审核" || ["发送微信消息", "平台发布"].includes(action) || metadata.approval === true || metadata.approval === "true";
    const payload = { executionAction: action, reviewOnly: declaredAction === "等待人工审核" && !action, approvalRequired, target: contact.name, content: String(workflow.description || ""), context: message, platform: String(metadata.platform || ""), title: String(workflow.title || ""), mediaUrl: String(metadata.mediaUrl || ""), deviceId: String(metadata.deviceId || deviceId), contactId: contact.id, inboundFingerprint: fingerprint };
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO workflow_runs(workspace_id,workflow_id,trigger_type,action_type,status,max_attempts,dedupe_key,payload)
      VALUES(?,?,?,?,?,?,?,?)`).bind(workspaceId, Number(workflow.id), "收到微信消息", action || declaredAction, approvalRequired ? "awaiting_approval" : "queued", Math.max(1, Math.min(5, Number(metadata.maxAttempts || 3))), `wechat:${fingerprint}`, JSON.stringify(payload)));
  }
  for (let index = 0; index < statements.length; index += 80) await env.DB.batch(statements.slice(index, index + 80));
}

async function queueInboundReply(workspaceId: number, deviceId: string, event: IncomingWechatEvent) {
  const contactName = event.contact.replace(/[（(]\d+[）)]\s*$/, "").trim();
  const contact = await env.DB.prepare("SELECT id,name FROM private_contacts WHERE workspace_id=? AND (name=? OR remark=?) ORDER BY CASE WHEN name=? THEN 0 ELSE 1 END LIMIT 1").bind(workspaceId, contactName, contactName, contactName).first<{ id: number; name: string }>();
  if (!contact) return;
  const history = event.history;
  const recentContext = history.slice(-6).map(item => `${item.direction}:${item.text}`).join("|");
  const dayBucket = new Date().toISOString().slice(0, 10);
  const fingerprint = await digest(`${event.kind}|${contact.id}|${event.message}|${recentContext}|${dayBucket}`);
  if (event.kind === "message") await triggerWechatMessageWorkflows(workspaceId, deviceId, contact, event.message, fingerprint);
  const plans = await env.DB.prepare("SELECT id,target_mode AS targetMode,target_value AS targetValue,settings FROM private_plans WHERE workspace_id=? AND module='auto-reply' AND status='active' ORDER BY id").bind(workspaceId).all();
  let selected: Record<string, unknown> | undefined;
  for (const candidate of plans.results as Record<string, unknown>[]) {
    if (!(await planIncludesContact(candidate, Number(contact.id), workspaceId))) continue;
    const settings = jsonValue(candidate.settings, {}) as Record<string, unknown>;
    if (!matchesAutoReplyRule(settings, event)) continue;
    selected = candidate; break;
  }
  if (!selected) return;
  const inserted = await env.DB.prepare("INSERT OR IGNORE INTO private_inbound_messages(fingerprint,device_id,contact_id,contact_name,message,plan_id) VALUES(?,?,?,?,?,?)")
    .bind(fingerprint,deviceId,contact.id,contact.name,event.message,selected.id).run();
  if (!inserted.meta.changes) return;
  const settings = jsonValue(selected.settings, {}) as Record<string, unknown>;
  const dailyLimit = Math.max(1, Math.min(200, Number(settings.dailyLimit || 20)));
  const used = await env.DB.prepare(`SELECT COUNT(*) AS count FROM automation_jobs WHERE workspace_id=? AND type IN ('wechat_send','wechat_draft','wechat_ai_reply') AND date(created_at)=date('now') AND json_extract(payload,'$.source')='auto_reply' AND json_extract(payload,'$.planId')=?`).bind(workspaceId, selected.id).first<{ count: number }>();
  if (Number(used?.count || 0) >= dailyLimit) {
    await env.DB.prepare("UPDATE private_inbound_messages SET status='daily_limit' WHERE fingerprint=?").bind(fingerprint).run(); return;
  }
  let response = "";
  if (String(settings.replyType || "ai") === "ai" || settings.aiEnabled === true) {
    const replyHistory = normalizeHistory(event.history, Number(settings.historyLimit || 40));
    if (event.kind === "message" && !replyHistory.some(item => item.direction === "incoming" && item.text === event.message)) replyHistory.push({ direction: "incoming", text: event.message });
    const generated = await contextualReply(contact.name, String(settings.aiPrompt || (event.kind === "new_friend" ? "用自然、简短的语气欢迎新好友，并询问对方需要什么帮助。" : "先解决客户当前问题，再自然推进一个下一步")), replyHistory, settings, workspaceId);
    response = generated.content;
  } else {
    const step = await env.DB.prepare("SELECT content FROM private_plan_steps WHERE plan_id=? AND enabled=1 ORDER BY step_order LIMIT 1").bind(selected.id).first<{ content: string }>();
    response = String(step?.content || "").trim();
  }
  if (!response) { await env.DB.prepare("UPDATE private_inbound_messages SET status='no_response' WHERE fingerprint=?").bind(fingerprint).run(); return; }
  const automaticSend = settings.approval === false;
  const type = automaticSend ? "wechat_send" : "wechat_draft";
  const payload = {
    contact: contact.name, message: response, sendApproved: automaticSend, source: "auto_reply",
    planId: selected.id, inboundFingerprint: fingerprint,
    safety: {
      approvalRequired: !automaticSend,
      trigger: event.kind,
    },
  };
  await env.DB.prepare("INSERT INTO automation_jobs(workspace_id,device_id,type,payload,status) VALUES(?,?,?,?,'queued')").bind(workspaceId, deviceId, type, JSON.stringify(payload)).run();
  await env.DB.prepare("UPDATE private_inbound_messages SET response=?,status=? WHERE fingerprint=?").bind(response,automaticSend?"queued_send":"queued_review",fingerprint).run();
}

async function handleInboxResult(jobId: number, status: string) {
  if (status !== "succeeded") return;
  const job = await env.DB.prepare("SELECT workspace_id AS workspaceId,device_id AS deviceId,result FROM automation_jobs WHERE id=? AND type='wechat_inbox_scan'").bind(jobId).first<{ workspaceId: number; deviceId: string; result: string }>();
  if (!job) return;
  const result = jsonValue(job.result, {}) as Record<string, unknown>;
  if (result.unread !== true) return;
  for (const event of incomingWechatEvents(result)) await queueInboundReply(job.workspaceId, String(job.deviceId || ""), event);
}

async function advancePrivateRun(jobId: number, status: string, error: string) {
  const job = await env.DB.prepare("SELECT workspace_id AS workspaceId,payload FROM automation_jobs WHERE id=? AND type='wechat_sop_step'").bind(jobId).first<{ workspaceId: number; payload: string }>();
  if (!job) return;
  const payload = jsonValue(job.payload, {}) as Record<string, unknown>; const runId = Number(payload.runId || 0); const planId = Number(payload.planId || 0); const stepOrder = Number(payload.stepOrder || 0);
  if (!runId) return;
  if (status === "failed") { await env.DB.prepare("UPDATE private_runs SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP,finished_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=?").bind(error,runId,job.workspaceId).run(); return; }
  if (status !== "succeeded") return;
  const next = await env.DB.prepare("SELECT step_order AS stepOrder,delay_minutes AS delayMinutes FROM private_plan_steps WHERE plan_id=? AND step_order>? AND enabled=1 ORDER BY step_order LIMIT 1").bind(planId,stepOrder).first();
  await env.DB.prepare("UPDATE private_contacts SET last_contact_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE workspace_id=? AND id=(SELECT contact_id FROM private_runs WHERE id=? AND workspace_id=?)").bind(job.workspaceId,runId,job.workspaceId).run();
  if (!next) await env.DB.prepare("UPDATE private_runs SET status='completed',updated_at=CURRENT_TIMESTAMP,finished_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=?").bind(runId,job.workspaceId).run();
  else {
    const randomDelay = Math.floor(Math.random() * 4);
    await env.DB.prepare("UPDATE private_runs SET status='scheduled',current_step=?,next_run_at=datetime(CURRENT_TIMESTAMP, ?),updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=?").bind(next.stepOrder,`+${Number(next.delayMinutes||0) + randomDelay} minutes`,runId,job.workspaceId).run();
  }
}

async function advanceWorkflowRun(jobId: number, workspaceId: number, deviceId: string, status: string, result: unknown, error: string) {
  if (status === "running") {
    await env.DB.prepare(`UPDATE workflow_runs SET status='running',error='',started_at=COALESCE(started_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP
      WHERE automation_job_id=? AND workspace_id=? AND device_id=? AND status='queued'`).bind(jobId, workspaceId, deviceId).run();
    return;
  }
  if (status === "succeeded" || status === "failed") {
    await env.DB.prepare(`UPDATE workflow_runs SET status=?,result=?,error=?,updated_at=CURRENT_TIMESTAMP,finished_at=CURRENT_TIMESTAMP
      WHERE automation_job_id=? AND workspace_id=? AND device_id=? AND status IN ('queued','running')`)
      .bind(status, JSON.stringify(result || {}), status === "failed" ? error.slice(0, 1000) : "", jobId, workspaceId, deviceId).run();
  }
}

async function advanceInboundReply(jobId: number, status: string, error: string) {
  if (status !== "succeeded" && status !== "failed") return;
  const job = await env.DB.prepare("SELECT workspace_id AS workspaceId,payload,result FROM automation_jobs WHERE id=? AND type IN ('wechat_send','wechat_draft','wechat_ai_reply')").bind(jobId).first<{ workspaceId: number; payload: string; result: string }>();
  if (!job) return;
  const payload = jsonValue(job.payload, {}) as Record<string, unknown>; const fingerprint = String(payload.inboundFingerprint || "");
  if (!fingerprint) return;
  const result = jsonValue(job.result, {}) as Record<string, unknown>;
  const response = String(result.message || "").trim();
  await env.DB.prepare("UPDATE private_inbound_messages SET status=?,response=CASE WHEN ?<>'' THEN ? ELSE response END,replied_at=CURRENT_TIMESTAMP WHERE fingerprint=?")
    .bind(status === "succeeded" ? (payload.sendApproved ? "sent" : "drafted") : `failed:${error.slice(0,180)}`, response, response, fingerprint).run();
}

async function advanceAcquisitionTask(jobId: number, status: string) {
  if (status !== "succeeded" && status !== "failed") return;
  const job = await env.DB.prepare("SELECT workspace_id AS workspaceId,payload,result,error FROM automation_jobs WHERE id=? AND type='acquisition_search'").bind(jobId).first<{ workspaceId: number; payload: string; result: string; error: string }>();
  if (!job) return;
  const payload = jsonValue(job.payload, {}) as Record<string, unknown>; const taskId = Number(payload.taskId || 0);
  if (!taskId) return;
  if (status === "failed") {
    await env.DB.prepare("UPDATE acquisition_tasks SET status='error',last_run_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=?").bind(taskId,job.workspaceId).run();
    return;
  }
  const result = jsonValue(job.result, {}) as Record<string, unknown>;
  const rawLeads = Array.isArray(result.leads) ? result.leads.slice(0, 100) as Record<string, unknown>[] : [];
  const settings = jsonValue(payload.settings, {}) as Record<string, unknown>;
  const excludes = Array.isArray(payload.excludeKeywords) ? payload.excludeKeywords.map(String) : [];
  const leads = rawLeads.filter(lead => !excludes.some(word => String(lead.evidence || "").toLowerCase().includes(word.toLowerCase())));
  let scores: Array<{ index: number; score: number; reason: string; matchedKeywords?: string[] }> = [];
  if (leads.length && settings.aiMatch !== false) {
    try {
      const answer = await callAi(
        "你是合规的公开线索意向分析器。仅根据公开页面文字判断商业意向，不推断敏感属性。返回严格JSON数组；每项包含index、score(0-100)、reason(20字内)、matchedKeywords。不得输出Markdown。",
        `获客目标：${String(payload.target || "")}\n关键词：${JSON.stringify(payload.keywords || [])}\n候选：${JSON.stringify(leads.map((lead, index) => ({ index, nickname: lead.nickname, text: String(lead.evidence || "").slice(0, 500) })))}`,
        settings.modelTier,
      );
      scores = JSON.parse(answer.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
    } catch { scores = []; }
  }
  for (let index = 0; index < leads.length; index += 1) {
    const lead = leads[index]; const ai = scores.find(item => Number(item.index) === index);
    const matched = Array.isArray(ai?.matchedKeywords) ? ai!.matchedKeywords! : Array.isArray(lead.matchedKeywords) ? lead.matchedKeywords : [];
    const fallback = Math.min(95, 35 + matched.length * 15);
    await env.DB.prepare(`INSERT INTO acquisition_leads(workspace_id,task_id,platform,nickname,platform_id,profile_url,source_url,source_text,matched_keywords,score,status,notes)
      VALUES(?,?,?,?,?,?,?,?,?,?,'new',?) ON CONFLICT(workspace_id,platform,nickname,platform_id,profile_url) DO UPDATE SET task_id=excluded.task_id,source_url=excluded.source_url,source_text=excluded.source_text,matched_keywords=excluded.matched_keywords,score=excluded.score,notes=excluded.notes,updated_at=CURRENT_TIMESTAMP`)
      .bind(job.workspaceId,taskId,String(payload.platform||"douyin"),String(lead.nickname||"公开用户"),String(lead.platformId||""),String(lead.profileUrl||""),String(lead.sourceUrl||""),String(lead.evidence||"").slice(0,2000),JSON.stringify(matched),Math.max(0,Math.min(100,Number(ai?.score ?? fallback))),String(ai?.reason||"按公开关键词匹配")).run();
  }
  await env.DB.prepare("UPDATE acquisition_tasks SET status='awaiting_review',last_run_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=?").bind(taskId,job.workspaceId).run();
}

async function handleLocalFolderResult(jobId: number, status: string) {
  if (status !== "succeeded") return;
  const job = await env.DB.prepare("SELECT workspace_id AS workspaceId,device_id AS deviceId,result FROM automation_jobs WHERE id=? AND type='local_folder_scan'").bind(jobId).first<{ workspaceId: number; deviceId: string; result: string }>();
  if (!job) return;
  const result = jsonValue(job.result, {}) as Record<string, unknown>;
  const files = Array.isArray(result.files) ? result.files.slice(0, 500) as Record<string, unknown>[] : [];
  if (!files.length) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS product_records (id INTEGER PRIMARY KEY AUTOINCREMENT,workspace_id INTEGER NOT NULL DEFAULT 0,module TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'draft',metadata TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  await env.DB.prepare("DELETE FROM product_records WHERE workspace_id=? AND module='local-files' AND json_extract(metadata,'$.deviceId')=?").bind(job.workspaceId, job.deviceId).run();
  const statements = files.map(file => env.DB.prepare("INSERT INTO product_records(workspace_id,module,title,description,status,metadata) VALUES(?,'local-files',?,?, 'completed', ?)")
    .bind(job.workspaceId, String(file.name || "本地素材"), `${String(file.extension || "文件")} · ${(Number(file.size || 0) / 1024 / 1024).toFixed(2)} MB`, JSON.stringify({ deviceId: job.deviceId, rootName: String(result.rootName || "授权目录"), relativePath: String(file.relativePath || ""), extension: String(file.extension || ""), size: String(file.size || 0), modifiedAt: String(file.modifiedAt || "") })));
  for (let index = 0; index < statements.length; index += 80) await env.DB.batch(statements.slice(index, index + 80));
}

function fail(message: string, status = 400) { return Response.json({ error: message }, { status }); }

export async function GET(request: Request) {
  try {
    await ensureSchema();
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "devices";
    if (action === "devices") {
      const user = await getSessionUser(request); if (!user) return fail("请先登录", 401);
      const result = await env.DB.prepare(`SELECT id, device_id AS deviceId, name, platform, version, status,
        capabilities, last_seen_at AS lastSeenAt, created_at AS createdAt,
        CASE WHEN last_seen_at >= datetime('now','-75 seconds') THEN 1 ELSE 0 END AS online
        FROM automation_devices WHERE workspace_id=? ORDER BY last_seen_at DESC`).bind(user.workspaceId).all();
      return Response.json({ devices: result.results.map(row => ({ ...row, online: Boolean(row.online), capabilities: jsonValue(row.capabilities, []) })) });
    }
    if (action === "jobs") {
      const user = await getSessionUser(request); if (!user) return fail("请先登录", 401);
      const result = await env.DB.prepare(`SELECT id, device_id AS deviceId, type, payload, status, progress, result, error,
        created_at AS createdAt, updated_at AS updatedAt, claimed_at AS claimedAt, finished_at AS finishedAt
        FROM automation_jobs WHERE workspace_id=? ORDER BY id DESC LIMIT 100`).bind(user.workspaceId).all();
      return Response.json({ jobs: result.results.map(row => ({ ...row, payload: jsonValue(row.payload, {}), result: jsonValue(row.result, {}) })) });
    }
    if (action === "claim") {
      const deviceId = url.searchParams.get("deviceId") || "";
      const device = deviceId ? await authenticate(request, deviceId) : undefined;
      if (!device) return fail("设备认证失败", 401);
      if (device.workspaceId <= 0) return fail("设备尚未完成工作空间配对", 403);
      try { await dispatchInboxScan(device.workspaceId, deviceId); } catch { /* 私域数据未初始化时不影响普通任务 */ }
      try { await dispatchDueRun(device.workspaceId, deviceId); } catch { /* 私域数据未初始化时不影响普通任务 */ }
      const job = await env.DB.prepare(`UPDATE automation_jobs SET status='claimed', claimed_at=CURRENT_TIMESTAMP,
        updated_at=CURRENT_TIMESTAMP WHERE id = (SELECT id FROM automation_jobs WHERE status='queued'
        AND workspace_id=? AND device_id=? ORDER BY id LIMIT 1)
        RETURNING id, device_id AS deviceId, type, payload, status, progress`).bind(device.workspaceId, deviceId).first();
      return Response.json({ job: job ? { ...job, payload: jsonValue(job.payload, {}) } : null });
    }
    return fail("未知操作");
  } catch (error) { return fail(error instanceof Error ? error.message : "服务器处理失败", 500); }
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || "");
    if (action === "pairing_code_create") {
      const user = await getSessionUser(request); if (!user) return fail("请先登录", 401);
      const code = crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
      await env.DB.prepare("DELETE FROM automation_pairing_codes WHERE workspace_id=? AND (consumed_at IS NOT NULL OR expires_at<=CURRENT_TIMESTAMP)").bind(user.workspaceId).run();
      await env.DB.prepare("INSERT INTO automation_pairing_codes(workspace_id,code_hash,expires_at) VALUES(?,?,datetime('now','+10 minutes'))")
        .bind(user.workspaceId, await digest(code)).run();
      return Response.json({ code, expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
    }
    if (action === "register") {
      const deviceId = String(body.deviceId || "").trim();
      const name = String(body.name || "当前电脑").trim();
      const platform = String(body.platform || "unknown").trim();
      if (!deviceId) return fail("缺少设备标识");
      const existing = await env.DB.prepare("SELECT token FROM automation_devices WHERE device_id = ?").bind(deviceId).first<{ token: string }>();
      if (existing && bearer(request) !== existing.token) return fail("设备凭据无效，请在电脑助手中重新配对", 401);
      const token = existing?.token || `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
      await env.DB.prepare(`INSERT INTO automation_devices (device_id,name,platform,version,token,status,capabilities,last_seen_at,updated_at)
        VALUES (?,?,?,?,?,'online',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(device_id) DO UPDATE SET name=excluded.name, platform=excluded.platform, version=excluded.version,
        status='online', capabilities=excluded.capabilities, last_seen_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP`)
        .bind(deviceId, name, platform, String(body.version || "0.1.0"), token, JSON.stringify(body.capabilities || [])).run();
      return Response.json({ deviceId, token });
    }
    if (action === "pair_device") {
      const deviceId = String(body.deviceId || "").trim();
      const device = deviceId ? await authenticate(request, deviceId) : undefined;
      if (!device) return fail("设备认证失败", 401);
      if (device.workspaceId > 0) return fail("这台电脑已经绑定到其他工作空间", 409);
      const code = String(body.pairingCode || "").replace(/\s+/g, "").toUpperCase();
      if (!code) return fail("请输入配对码");
      const pairing = await env.DB.prepare("SELECT id,workspace_id AS workspaceId FROM automation_pairing_codes WHERE code_hash=? AND consumed_at IS NULL AND expires_at>CURRENT_TIMESTAMP")
        .bind(await digest(code)).first<{ id: number; workspaceId: number }>();
      if (!pairing) return fail("配对码无效或已过期", 400);
      const consumed = await env.DB.prepare("UPDATE automation_pairing_codes SET consumed_at=CURRENT_TIMESTAMP WHERE id=? AND consumed_at IS NULL AND expires_at>CURRENT_TIMESTAMP").bind(pairing.id).run();
      if (!consumed.meta.changes) return fail("配对码已被使用，请重新获取", 409);
      const bound = await env.DB.prepare("UPDATE automation_devices SET workspace_id=?,updated_at=CURRENT_TIMESTAMP WHERE device_id=? AND token=? AND workspace_id=0")
        .bind(pairing.workspaceId, deviceId, bearer(request)).run();
      if (!bound.meta.changes) return fail("设备绑定状态已变化，请重新获取配对码", 409);
      return Response.json({ ok: true, workspaceId: pairing.workspaceId });
    }
    if (action === "create") {
      const user = await getSessionUser(request); if (!user) return fail("请先登录", 401);
      const type = String(body.type || "").trim();
      if (!type) return fail("请选择任务类型");
      const deviceId = String(body.deviceId || "").trim();
      const device = deviceId ? await env.DB.prepare("SELECT device_id FROM automation_devices WHERE device_id=? AND workspace_id=?").bind(deviceId, user.workspaceId).first() : null;
      if (!device) return fail("请先选择当前工作空间内已配对的电脑", 404);
      const result = await env.DB.prepare(`INSERT INTO automation_jobs (workspace_id,device_id,type,payload,status) VALUES (?,?,?,?,'queued') RETURNING id`)
        .bind(user.workspaceId, deviceId, type, JSON.stringify(body.payload || {})).first();
      return Response.json({ job: result }, { status: 201 });
    }
    if (action === "job_control") {
      const user = await getSessionUser(request); if (!user) return fail("请先登录", 401);
      const jobId = Number(body.jobId || 0);
      const operation = String(body.operation || "");
      if (!jobId || !["retry", "cancel"].includes(operation)) return fail("任务控制参数错误");
      if (operation === "retry") {
        const source = await env.DB.prepare("SELECT device_id AS deviceId,type,payload FROM automation_jobs WHERE id=? AND workspace_id=?").bind(jobId, user.workspaceId).first<{ deviceId?: string; type: string; payload: string }>();
        if (!source) return fail("任务不存在", 404);
        const result = await env.DB.prepare("INSERT INTO automation_jobs(workspace_id,device_id,type,payload,status) VALUES(?,?,?,?,'queued') RETURNING id")
          .bind(user.workspaceId, source.deviceId || null, source.type, source.payload || "{}").first();
        return Response.json({ job: result }, { status: 201 });
      }
      const running = await env.DB.prepare("SELECT status FROM automation_jobs WHERE id=? AND workspace_id=?").bind(jobId, user.workspaceId).first<{ status: string }>();
      if (!running) return fail("任务不存在", 404);
      if (["succeeded", "failed"].includes(running.status)) return fail("已结束任务不能取消");
      await env.DB.prepare("UPDATE automation_jobs SET status='cancelled',error='用户已取消',progress=0,updated_at=CURRENT_TIMESTAMP,finished_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id=?").bind(jobId, user.workspaceId).run();
      return Response.json({ ok: true });
    }
    const deviceId = String(body.deviceId || "");
    const device = deviceId ? await authenticate(request, deviceId) : undefined;
    if (!device) return fail("设备认证失败", 401);
    if (action === "generate_reply") {
      const jobId = Number(body.jobId || 0);
      if (device.workspaceId <= 0) return fail("设备尚未完成工作空间配对", 403);
      const job = await env.DB.prepare("SELECT id FROM automation_jobs WHERE id=? AND workspace_id=? AND device_id=?").bind(jobId, device.workspaceId, deviceId).first();
      if (!job) return fail("回复任务不存在或不属于当前设备", 404);
      const contact = String(body.contact || "").trim();
      if (!contact) return fail("缺少微信联系人");
      const settings = body.settings && typeof body.settings === "object" ? body.settings as Record<string, unknown> : {};
      const generated = await contextualReply(contact, String(body.goal || ""), body.history, settings, device.workspaceId);
      if (!generated.content) return fail("AI没有生成可用回复");
      return Response.json(generated);
    }
    if (action === "heartbeat") {
      await env.DB.prepare("UPDATE automation_devices SET status='online', last_seen_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE device_id=? AND token=?").bind(deviceId, bearer(request)).run();
      return Response.json({ ok: true });
    }
    if (action === "report") {
      const jobId = Number(body.jobId || 0);
      const status = String(body.status || "running");
      if (!jobId || !["running", "succeeded", "failed"].includes(status)) return fail("任务回报参数错误");
      if (device.workspaceId <= 0) return fail("设备尚未完成工作空间配对", 403);
      const finished = status === "succeeded" || status === "failed";
      const reported = await env.DB.prepare(`UPDATE automation_jobs SET status=?, progress=?, result=?, error=?, updated_at=CURRENT_TIMESTAMP,
        finished_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE finished_at END WHERE id=? AND workspace_id=? AND device_id=? AND status NOT IN ('cancelled','succeeded','failed')`)
        .bind(status, Number(body.progress ?? (finished ? 100 : 0)), JSON.stringify(body.result || {}), String(body.error || ""), finished ? 1 : 0, jobId, device.workspaceId, deviceId).run();
      if (!reported.meta.changes) {
        const existing = await env.DB.prepare("SELECT status FROM automation_jobs WHERE id=? AND workspace_id=? AND device_id=?").bind(jobId, device.workspaceId, deviceId).first<{ status: string }>();
        if (existing) return Response.json({ ok: true, ignored: true, cancelled: existing.status === "cancelled" });
        return fail("任务不存在或不属于当前设备", 404);
      }
      await advanceWorkflowRun(jobId, device.workspaceId, deviceId, status, body.result, String(body.error || ""));
      await advancePrivateRun(jobId, status, String(body.error || ""));
      try { await advanceInboundReply(jobId, status, String(body.error || "")); } catch { /* 自动回复记录不影响普通消息任务 */ }
      try { await handleInboxResult(jobId, status); } catch { /* 单次识别或AI回复失败不影响设备继续心跳 */ }
      try { await advanceAcquisitionTask(jobId, status); } catch { /* 获客数据未初始化时不影响设备继续执行 */ }
      try { await handleLocalFolderResult(jobId, status); } catch { /* 本地目录索引失败不影响设备继续执行 */ }
      return Response.json({ ok: true });
    }
    return fail("未知操作");
  } catch (error) { return fail(error instanceof Error ? error.message : "服务器处理失败", 500); }
}
