"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import {
  Activity, Bot, CheckCircle2, ChevronRight, CirclePlay, Clock3,
  FileText, Film, FolderOpen, HardDrive, MessageCircle, Pause, Plus, RefreshCw, RotateCcw, Send,
  Settings2, ShieldCheck, Sparkles, Square, Trash2, UsersRound,
  WandSparkles, Workflow, X, XCircle,
} from "lucide-react";
import { ModalPortal } from "./ModalPortal";
import { useEffect, useRef, useState } from "react";

type Notify = (message: string) => void;
type RecordItem = { id: number; module: string; title: string; description: string; status: string; metadata: Record<string, string>; createdAt: string; updatedAt: string };
type Device = { deviceId: string; name: string; platform: string; version: string; online: boolean; capabilities: string[]; lastSeenAt: string };
type Job = { id: number; deviceId?: string; type: string; status: string; progress: number; error: string; payload?: Record<string, unknown>; result?: Record<string, unknown>; createdAt: string };
type WorkflowRun = { id: number; workflowId: number; triggerType: string; actionType: string; status: string; deviceId?: string | null; automationJobId?: number | null; attempt: number; maxAttempts: number; payload: Record<string, unknown>; result: Record<string, unknown>; error: string; scheduledFor: string; startedAt?: string | null; finishedAt?: string | null; createdAt: string; updatedAt: string };
type Overview = { metrics: Record<string, number>; services: Record<string, boolean>; recent: Job[] };

const statusText: Record<string, string> = { draft: "草稿", active: "运行中", completed: "已完成", failed: "失败", queued: "等待领取", claimed: "已领取", running: "执行中", awaiting_approval: "待人工审核", succeeded: "已完成", cancelled: "已取消", paused: "已暂停" };
const taskText: Record<string, string> = { system_test: "电脑连通测试", wechat_probe: "检测微信", wechat_open: "打开微信", wechat_contact_scan: "同步微信联系人", wechat_inbox_scan: "读取微信新消息", wechat_draft: "填写微信草稿", wechat_send: "发送微信消息", wechat_sop_step: "执行微信SOP", platform_open_login: "打开平台登录页", platform_publish: "准备平台发布", local_folder_scan: "扫描本地素材目录", acquisition_search: "公开线索采集" };

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "操作失败");
  return data;
}

async function loadRecords(module: string) {
  return (await readJson<{ records: RecordItem[] }>(await fetch(`/api/records?module=${encodeURIComponent(module)}`, { cache: "no-store" }))).records || [];
}

async function createRecord(module: string, title: string, description: string, metadata: Record<string, string>, status = "draft") {
  return readJson<{ record: RecordItem }>(await fetch("/api/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ module, title, description, status, metadata }) }));
}

function Header({ eyebrow, title, desc, action, onAction }: { eyebrow: string; title: string; desc: string; action?: string; onAction?: () => void }) {
  return <div className="module-header"><div><span>{eyebrow}</span><h2>{title}</h2><p>{desc}</p></div>{action && <button className="primary-action" onClick={onAction}><Plus size={16}/>{action}</button>}</div>;
}

function Empty({ icon, title, text, action, onAction }: { icon: React.ReactNode; title: string; text: string; action?: string; onAction?: () => void }) {
  return <div className="records-empty">{icon}<strong>{title}</strong><p>{text}</p>{action && <button onClick={onAction}>{action}</button>}</div>;
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return <ModalPortal><div className="record-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className={`private-modal ${wide ? "wide" : ""}`}><header><h3>{title}</h3><button onClick={onClose}><X/></button></header>{children}</div></div></ModalPortal>;
}

export function AnalyticsPage({ notify }: { notify: Notify }) {
  const [data, setData] = useState<Overview | null>(null); const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); try { setData(await readJson<Overview>(await fetch("/api/overview", { cache: "no-store" }))); } catch (error) { notify(error instanceof Error ? error.message : "读取失败"); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const m = data?.metrics || {};
  const cards = [["内容与作品", m.records || 0, FileText], ["公开潜客", m.leads || 0, UsersRound], ["私域联系人", m.contacts || 0, MessageCircle], ["自动化成功率", `${m.successRate || 0}%`, CheckCircle2]] as const;
  return <div className="module-page"><Header eyebrow="REAL DATA ANALYTICS" title="数据分析" desc="所有数字都来自当前工作空间的真实记录，没有数据时显示 0。"/><div className="analytics-real-grid">{cards.map(([label, value, Icon]) => <article className="panel" key={label}><Icon/><strong>{value}</strong><small>{label}</small></article>)}</div><section className="panel analytics-funnel"><div className="panel-heading"><div><h3>业务漏斗</h3><p>从公开潜客到私域联系人，再到自动化任务完成</p></div><button className="outline-action" onClick={load}><RefreshCw size={14}/>{loading ? "读取中" : "刷新"}</button></div><div className="funnel-row"><span><strong>{m.leads || 0}</strong><small>公开潜客</small></span><ChevronRight/><span><strong>{m.contacts || 0}</strong><small>私域联系人</small></span><ChevronRight/><span><strong>{m.activeJobs || 0}</strong><small>进行中任务</small></span><ChevronRight/><span><strong>{m.completedJobs || 0}</strong><small>已完成任务</small></span></div></section><section className="panel service-readiness"><div className="panel-heading"><div><h3>能力连接状态</h3><p>只显示服务器实际检测到的配置</p></div><Settings2/></div><div>{Object.entries({ llm: "LLM 文案", image: "GPT Image 2", video: "Seedance 2.0", storage: "对象存储", desktop: "电脑助手", asr: "语音识别 ASR", tts: "配音 TTS" }).map(([key, label]) => <span className={data?.services?.[key] ? "ready" : "pending"} key={key}>{data?.services?.[key] ? <CheckCircle2/> : <Clock3/>}<strong>{label}</strong><small>{data?.services?.[key] ? "已连接" : "需要配置"}</small></span>)}</div></section></div>;
}

type ChatMessage = { id?: number; role: "user" | "assistant"; content: string; createdAt?: string };
type ChatConversation = { id: number; title: string; expertId: string; expertName: string; modelTier: string; createdAt: string; updatedAt: string; lastMessage?: string; messageCount?: number };

async function agentChatRequest<T>(payload: Record<string, unknown>) {
  return readJson<T>(await fetch("/api/agent-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
}

export function AgentChat({ notify }: { notify: Notify }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]); const [input, setInput] = useState(""); const [sending, setSending] = useState(false); const [experts, setExperts] = useState<RecordItem[]>([]); const [knowledge, setKnowledge] = useState<RecordItem[]>([]); const [expertId, setExpertId] = useState(""); const [tier, setTier] = useState("smart");
  const [conversations, setConversations] = useState<ChatConversation[]>([]); const [activeConversationId, setActiveConversationId] = useState<number | null>(null); const [historyLoading, setHistoryLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const selected = experts.find(item => String(item.id) === expertId);
  const loadConversations = async () => {
    const data = await readJson<{ conversations?: ChatConversation[] }>(await fetch("/api/agent-chat", { cache: "no-store" }));
    setConversations(data.conversations || []);
  };
  const openConversation = async (conversationId: number) => {
    setHistoryLoading(true);
    try {
      const data = await readJson<{ conversation: ChatConversation; messages: ChatMessage[] }>(await fetch(`/api/agent-chat?conversationId=${conversationId}`, { cache: "no-store" }));
      setActiveConversationId(conversationId); setMessages(data.messages || []); setExpertId(data.conversation.expertId || ""); setTier(data.conversation.modelTier || "smart"); setInput("");
    } catch (error) { notify(error instanceof Error ? error.message : "读取历史对话失败"); }
    finally { setHistoryLoading(false); }
  };
  const startNewConversation = () => {
    if (conversations.length >= 50) { notify("已保存 50 条对话，请先删除不需要的历史记录。"); return; }
    setActiveConversationId(null); setMessages([]); setInput("");
  };
  useEffect(() => {
    Promise.all([loadRecords("ai-expert"), loadRecords("knowledge"), loadConversations()]).then(([expertRows, knowledgeRows]) => { setExperts(expertRows); setKnowledge(knowledgeRows); }).catch(() => { setExperts([]); setKnowledge([]); notify("历史对话读取失败"); });
    const queued = window.sessionStorage.getItem("qiyu_agent_prompt"); if (queued) { setInput(queued); window.sessionStorage.removeItem("qiyu_agent_prompt"); }
  }, []);
  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    const maxHeight = 280;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [input]);
  const renameConversation = async (conversation: ChatConversation) => {
    const title = window.prompt("修改对话名称", conversation.title)?.replace(/\s+/g, " ").trim();
    if (!title || title === conversation.title) return;
    try { await agentChatRequest({ action: "rename", conversationId: conversation.id, title }); await loadConversations(); }
    catch (error) { notify(error instanceof Error ? error.message : "修改名称失败"); }
  };
  const deleteConversation = async (conversation: ChatConversation) => {
    if (!window.confirm(`删除“${conversation.title}”？此操作无法恢复。`)) return;
    try {
      await agentChatRequest({ action: "delete", conversationId: conversation.id });
      setConversations(current => current.filter(item => item.id !== conversation.id));
      if (activeConversationId === conversation.id) startNewConversation();
    } catch (error) { notify(error instanceof Error ? error.message : "删除对话失败"); }
  };
  const send = async () => {
    const text = input.trim(); if (!text || sending) return;
    const previousMessages = messages; let conversationId = activeConversationId; let userMessageSaved = false;
    setSending(true); setInput("");
    try {
      if (!conversationId) {
        const created = await agentChatRequest<{ conversation: ChatConversation }>({ action: "create", expertId, expertName: selected?.title || "通用业务助手", modelTier: tier });
        if (!created.conversation) throw new Error("创建对话失败");
        conversationId = created.conversation.id; setActiveConversationId(conversationId); setConversations(current => [created.conversation, ...current]);
      }
      const next = [...previousMessages, { role: "user", content: text } as ChatMessage]; setMessages(next);
      await agentChatRequest({ action: "append", conversationId, role: "user", content: text });
      userMessageSaved = true;
      const system = selected?.metadata?.prompt || "你是奇遇AI业务助手。回答清楚、可执行；信息不足时先提出一个关键问题，不编造执行结果。";
      const terms = text.toLowerCase().split(/[\s，。！？、；：,.!?;:]+/).filter(item => item.length > 1);
      const related = knowledge.filter(item => { const content = `${item.title} ${item.description} ${item.metadata.content || ""}`.toLowerCase(); return terms.some(term => content.includes(term)); }).slice(0, 6);
      const contextRows = (related.length ? related : knowledge.slice(0, 3)).map(item => `【${item.title}】${(item.metadata.content || item.description || "").slice(0, 1800)}`);
      const knowledgeContext = contextRows.length ? `\n以下是当前工作空间的可用知识，只能在相关时引用；与问题无关时忽略：\n${contextRows.join("\n")}` : "";
      const data = await readJson<{ choices?: Array<{ message?: { content?: string } }> }>(await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "chat", model: "gpt-5.5", temperature: tier === "quality" ? 0.45 : 0.25, messages: [{ role: "system", content: `${system}\n业务背景：${selected?.metadata?.business || "未单独设置"}${knowledgeContext}` }, ...next] }) }));
      const answer = data.choices?.[0]?.message?.content?.trim(); if (!answer) throw new Error("模型没有返回内容");
      await agentChatRequest({ action: "append", conversationId, role: "assistant", content: answer });
      setMessages(current => [...current, { role: "assistant", content: answer }]); await loadConversations();
    } catch (error) { if (!userMessageSaved) { setMessages(previousMessages); setInput(text); } else setMessages([...previousMessages, { role: "user", content: text }]); notify(error instanceof Error ? error.message : "AI 对话失败"); }
    finally { setSending(false); }
  };
  return <div className="module-page agent-chat-page"><Header eyebrow="AI AGENT" title="智能体" desc="每个工作空间最多保存 50 条完整对话；可随时继续、改名或删除历史会话。" action="新建对话" onAction={startNewConversation}/><div className="agent-chat-layout"><aside className="panel agent-selector"><Bot/><h3>本次使用的专家</h3><label>专家角色<select value={expertId} onChange={event => setExpertId(event.target.value)}><option value="">通用业务助手</option>{experts.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>智能程度<select value={tier} onChange={event => setTier(event.target.value)}><option value="smart">智能推荐</option><option value="quality">高质量</option><option value="fast">快速省成本</option></select></label><div className="agent-boundary"><ShieldCheck/><span><strong>{knowledge.length ? `已连接 ${knowledge.length} 条知识` : "执行结果不会伪造"}</strong><small>{knowledge.length ? "系统会按当前问题自动选取相关知识，不需要客户手动粘贴。" : "需要操作电脑的请求会转成待确认任务，而不是直接声称已经完成。"}</small></span></div><div className="conversation-history"><div><h4>历史对话</h4><small>{conversations.length}/50</small></div>{conversations.length === 0 ? <p>发送第一条消息后会保存在这里。</p> : <ul>{conversations.map(conversation => <li className={activeConversationId === conversation.id ? "active" : ""} key={conversation.id}><button className="conversation-open" onClick={() => openConversation(conversation.id)}><strong>{conversation.title}</strong><small>{conversation.lastMessage || "暂无消息"}</small></button><span><button title="改名" onClick={() => renameConversation(conversation)}>改名</button><button className="danger" title="删除" onClick={() => deleteConversation(conversation)}><Trash2 size={13}/></button></span></li>)}</ul>}</div></aside><section className="panel chat-window"><div className="chat-scroll">{historyLoading ? <Empty icon={<RefreshCw className="spin"/>} title="正在读取对话" text="请稍候…"/> : messages.length === 0 ? <Empty icon={<Sparkles/>} title="开始一次真实 AI 对话" text="可以让专家写文案、分析客户、生成方案或整理自动化步骤。"/> : messages.map((message, index) => <article className={message.role} key={message.id || index}><span>{message.role === "assistant" ? <Bot/> : "你"}</span><p>{message.content}</p></article>)}</div><div className="chat-composer"><textarea ref={inputRef} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder="输入业务问题或要完成的任务…"/><button disabled={!input.trim() || sending || historyLoading} onClick={send}>{sending ? <RefreshCw className="spin"/> : <Send/>}</button></div></section></div></div>;
}

const triggerOptions = ["手动启动", "每天定时", "收到微信消息", "新增联系人", "视频生成完成"];
const actionOptions = ["AI生成内容", "填写微信草稿", "发送微信消息", "打开内容平台", "平台发布", "等待人工审核"];
const workflowPlatforms = [{ value: "douyin", label: "抖音" }, { value: "xiaohongshu", label: "小红书" }, { value: "kuaishou", label: "快手" }, { value: "shipinhao", label: "视频号" }];
const deviceActions = new Set(["填写微信草稿", "发送微信消息", "打开内容平台", "平台发布"]);
const forcedApprovalActions = new Set(["发送微信消息", "平台发布", "等待人工审核"]);

export function WorkflowStudio({ notify }: { notify: Notify }) {
  const [records, setRecords] = useState<RecordItem[]>([]); const [runs, setRuns] = useState<WorkflowRun[]>([]); const [devices, setDevices] = useState<Device[]>([]);
  const [dialog, setDialog] = useState(false); const [saving, setSaving] = useState(false); const [busy, setBusy] = useState(""); const [detail, setDetail] = useState<WorkflowRun | null>(null); const [approvalDevices, setApprovalDevices] = useState<Record<number, string>>({});
  const [form, setForm] = useState({ name: "", trigger: triggerOptions[0], action: actionOptions[0], nextAction: "", target: "", platform: "douyin", deviceId: "", schedule: "09:00", instruction: "", approval: false, maxAttempts: "3" });
  const onlineDevices = devices.filter(device => device.online); const effectiveAction = form.action === "等待人工审核" ? form.nextAction : form.action; const needsDevice = deviceActions.has(effectiveAction); const forcedApproval = forcedApprovalActions.has(form.action) || forcedApprovalActions.has(effectiveAction);
  const load = async () => {
    try {
      const [workflowData, deviceData] = await Promise.all([
        readJson<{ workflows: RecordItem[]; runs: WorkflowRun[] }>(await fetch("/api/workflows", { cache: "no-store" })),
        readJson<{ devices: Device[] }>(await fetch("/api/automation?action=devices", { cache: "no-store" })),
      ]);
      setRecords(workflowData.workflows || []); setRuns(workflowData.runs || []); setDevices(deviceData.devices || []);
    } catch (error) { notify(error instanceof Error ? error.message : "加载工作流失败"); }
  };
  useEffect(() => { load(); }, []);
  const save = async () => {
    if (!form.name.trim() || !form.instruction.trim()) { notify("请填写流程名称和执行要求。"); return; }
    if (form.action === "等待人工审核" && !form.nextAction) { notify("请选择审核同意后要继续执行的动作。"); return; }
    if (needsDevice && !form.deviceId) { notify("这个动作需要选择一台在线电脑。"); return; }
    if (form.trigger === "手动启动" && effectiveAction.includes("微信") && !form.target.trim()) { notify("手动微信流程需要填写联系人。"); return; }
    setSaving(true);
    try {
      await createRecord("auto-workflow", form.name, form.instruction, { ...form, approval: String(forcedApproval || form.approval), nextAction: form.nextAction, maxAttempts: form.maxAttempts }, "draft");
      setDialog(false); await load(); notify("工作流已保存。发送和发布动作仍会强制等待人工审核。");
    } catch (error) { notify(error instanceof Error ? error.message : "保存失败"); }
    finally { setSaving(false); }
  };
  const start = async (record: RecordItem) => {
    const isCloudAiWorkflow = record.metadata.action === "AI生成内容";
    const isReviewWorkflow = record.metadata.action === "等待人工审核";
    const requiresDesktop = deviceActions.has(record.metadata.action) || deviceActions.has(record.metadata.nextAction || "");
    if (requiresDesktop && !record.metadata.deviceId) { notify("这个动作需要操作客户电脑，请先选择一台已配对且在线的电脑。"); return; }
    setBusy(`start-${record.id}`);
    try {
      const data = await readJson<{ run: WorkflowRun; duplicate?: boolean }>(await fetch("/api/workflows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", workflowId: record.id, triggerType: "手动启动", idempotencyKey: crypto.randomUUID(), payload: { target: record.metadata.target || "", platform: record.metadata.platform || "", deviceId: record.metadata.deviceId || "", approval: record.metadata.approval === "true", maxAttempts: Number(record.metadata.maxAttempts || 3) } }) }));
      await load(); notify(data.duplicate ? "这次启动请求已处理。" : isCloudAiWorkflow && data.run.status === "succeeded" ? "云端 AI 工作流已完成。" : isReviewWorkflow ? "工作流已进入人工审核队列。" : data.run.status === "awaiting_approval" ? "流程正在等待人工审核。" : "工作流已创建真实运行记录。");
    } catch (error) { notify(error instanceof Error ? error.message : "启动失败"); }
    finally { setBusy(""); }
  };
  const control = async (run: WorkflowRun, action: "approve" | "reject" | "retry" | "cancel") => {
    setBusy(`${action}-${run.id}`);
    try {
      const deviceId = approvalDevices[run.id] || run.deviceId || "";
      await readJson<{ run: WorkflowRun }>(await fetch("/api/workflows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, runId: run.id, reason: action === "reject" ? "用户拒绝执行" : undefined, payload: { deviceId } }) }));
      await load(); notify({ approve: "已批准执行。", reject: "已拒绝执行。", retry: "已按重试规则重新排队。", cancel: "运行已取消。" }[action]);
    } catch (error) { notify(error instanceof Error ? error.message : "操作失败"); }
    finally { setBusy(""); }
  };
  const remove = async (record: RecordItem) => {
    if (runs.some(run => run.workflowId === record.id && ["queued", "running", "awaiting_approval"].includes(run.status))) { notify("请先取消该工作流仍在进行的运行记录。"); return; }
    if (!window.confirm(`删除“${record.title}”？`)) return;
    try { await readJson(await fetch("/api/records", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: record.id, module: "auto-workflow" }) })); await load(); } catch (error) { notify(error instanceof Error ? error.message : "删除失败"); }
  };
  const latest = (workflowId: number) => runs.find(run => run.workflowId === workflowId); const deviceName = (deviceId?: string | null) => devices.find(device => device.deviceId === deviceId)?.name || "未指定设备"; const time = (value?: string | null) => value ? new Date(value).toLocaleString("zh-CN") : "—";
  const templates = [
    { title: "新客户自动跟进", text: "新增联系人后生成首轮话术并填写微信草稿。", trigger: "新增联系人", action: "填写微信草稿" },
    { title: "每日内容生产", text: "每天定时生成选题与可审核文案。", trigger: "每天定时", action: "AI生成内容" },
    { title: "成片发布流程", text: "视频生成完成后准备平台发布，必须人工审核。", trigger: "视频生成完成", action: "平台发布" },
  ];
  return <div className="module-page workflow-studio"><Header eyebrow="AUTOMATION WORKFLOW" title="自动工作流" desc="运行、审核、失败和设备回传全部来自服务端记录；发送与发布不会绕过人工确认。" action="新建工作流" onAction={() => setDialog(true)}/><div className="workflow-template-grid">{templates.map(template => <button className="panel" key={template.title} onClick={() => { setForm(current => ({ ...current, name: template.title, instruction: template.text, trigger: template.trigger, action: template.action, approval: template.action === "平台发布" })); setDialog(true); }}><Workflow/><strong>{template.title}</strong><small>{template.text}</small></button>)}</div><section className="panel operation-list workflow-definition-list"><div className="panel-heading"><div><h3>我的工作流</h3><p>{records.length} 条定义 · {runs.filter(run => ["queued", "running", "awaiting_approval"].includes(run.status)).length} 条进行中</p></div><button className="outline-action" onClick={load}><RefreshCw size={14}/>刷新</button></div>{records.length === 0 ? <Empty icon={<Workflow/>} title="还没有工作流" text="选择上面的模板，或从空白流程开始。" action="创建第一个工作流" onAction={() => setDialog(true)}/> : records.map(record => { const run = latest(record.id); return <article key={record.id}><span className="operation-icon"><Workflow/></span><div><strong>{record.title}</strong><p>{record.description}</p><small>{record.metadata.trigger} → {record.metadata.action}{record.metadata.nextAction ? ` → ${record.metadata.nextAction}` : ""} · {record.metadata.approval === "true" ? "需要审核" : "可直接执行"}</small>{run && <small className="workflow-last-run">最近：{statusText[run.status] || run.status} · {time(run.updatedAt)}</small>}</div>{run && <em className={`workflow-status ${run.status}`}>{statusText[run.status] || run.status}</em>}<button disabled={Boolean(busy)} onClick={() => start(record)}><CirclePlay/>{busy === `start-${record.id}` ? "启动中" : "手动启动"}</button><button className="danger" onClick={() => remove(record)}><Trash2/></button></article>; })}</section><section className="panel workflow-run-list"><div className="panel-heading"><div><h3>最近运行记录</h3><p>显示状态、设备、错误、重试次数和实际起止时间。</p></div><button className="outline-action" onClick={load}><RefreshCw size={14}/>刷新</button></div>{runs.length === 0 ? <Empty icon={<Activity/>} title="还没有运行记录" text="手动启动或满足触发条件后，真实执行状态会出现在这里。"/> : <div>{runs.map(run => { const selectedDevice = approvalDevices[run.id] || run.deviceId || onlineDevices[0]?.deviceId || ""; const active = ["queued", "running"].includes(run.status); return <article className={`workflow-run ${run.status}`} key={run.id}><span className="workflow-run-icon"><Activity/></span><div className="workflow-run-main"><strong>#{run.id} {run.actionType}</strong><p>{run.triggerType} · {deviceName(run.deviceId)} · 第 {run.attempt}/{run.maxAttempts} 次</p><small>计划 {time(run.scheduledFor)} · 开始 {time(run.startedAt)} · 结束 {time(run.finishedAt)}</small>{run.error && <small className="workflow-error">失败原因：{run.error}</small>}</div><em className={`workflow-status ${run.status}`}>{statusText[run.status] || run.status}</em><button onClick={() => setDetail(run)}><FileText/>查看内容</button>{run.status === "awaiting_approval" && <div className="workflow-approval"><select aria-label="审批设备" value={selectedDevice} onChange={event => setApprovalDevices(current => ({ ...current, [run.id]: event.target.value }))}><option value="">选择在线电脑</option>{onlineDevices.map(device => <option key={device.deviceId} value={device.deviceId}>{device.name}</option>)}</select><button disabled={Boolean(busy)} onClick={() => control(run, "approve")}><CheckCircle2/>{busy === `approve-${run.id}` ? "提交中" : "同意执行"}</button><button className="danger" disabled={Boolean(busy)} onClick={() => control(run, "reject")}><XCircle/>拒绝</button></div>}{run.status === "failed" && <button disabled={Boolean(busy) || run.attempt >= run.maxAttempts} onClick={() => control(run, "retry")}><RotateCcw/>{run.attempt >= run.maxAttempts ? "已达上限" : "重试"}</button>}{active && <button className="danger" disabled={Boolean(busy)} onClick={() => control(run, "cancel")}><Square/>取消</button>}</article>; })}</div>}</section>{dialog && <Modal title="创建自动工作流" onClose={() => setDialog(false)} wide><div className="builder-stages"><span className="active">1 触发条件</span><span className="active">2 执行动作</span><span className="active">3 审核保护</span></div><div className="builder-body"><label>流程名称<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="例如：新客户首轮跟进"/></label><div className="field-pair"><label>触发条件<select value={form.trigger} onChange={event => setForm({ ...form, trigger: event.target.value })}>{triggerOptions.map(item => <option key={item}>{item}</option>)}</select></label><label>执行动作<select value={form.action} onChange={event => setForm({ ...form, action: event.target.value, nextAction: event.target.value === "等待人工审核" ? form.nextAction : "" })}>{actionOptions.map(item => <option key={item}>{item}</option>)}</select></label></div>{form.action === "等待人工审核" && <label>审核同意后继续<select value={form.nextAction} onChange={event => setForm({ ...form, nextAction: event.target.value })}><option value="">选择后续动作</option>{actionOptions.filter(item => item !== "等待人工审核").map(item => <option key={item}>{item}</option>)}</select></label>}<div className="field-pair"><label>{effectiveAction.includes("微信") ? "联系人或触发对象" : "目标或补充上下文"}<input value={form.target} onChange={event => setForm({ ...form, target: event.target.value })} placeholder={form.trigger === "手动启动" ? "手动流程请填写目标" : "事件触发时可由系统带入"}/></label>{form.trigger === "每天定时" && <label>定时时间<input type="time" value={form.schedule} onChange={event => setForm({ ...form, schedule: event.target.value })}/></label>}</div>{["打开内容平台", "平台发布"].includes(effectiveAction) && <label>目标平台<select value={form.platform} onChange={event => setForm({ ...form, platform: event.target.value })}>{workflowPlatforms.map(platform => <option key={platform.value} value={platform.value}>{platform.label}</option>)}</select></label>}{needsDevice && <label>执行电脑<select value={form.deviceId} onChange={event => setForm({ ...form, deviceId: event.target.value })}><option value="">选择在线电脑</option>{onlineDevices.map(device => <option key={device.deviceId} value={device.deviceId}>{device.name}</option>)}</select></label>}<label>执行要求<textarea value={form.instruction} onChange={event => setForm({ ...form, instruction: event.target.value })} placeholder="描述 AI 要生成的内容或电脑要执行的步骤"/></label><div className="field-pair"><label>最大重试次数<input type="number" min="1" max="5" value={form.maxAttempts} onChange={event => setForm({ ...form, maxAttempts: event.target.value })}/></label><label className="approval-switch"><input type="checkbox" disabled={forcedApproval} checked={forcedApproval || form.approval} onChange={event => setForm({ ...form, approval: event.target.checked })}/><span><strong>{forcedApproval ? "该动作必须人工审核" : "执行前需要人工审核"}</strong><small>微信发送和平台发布不能取消人工审核。</small></span></label></div></div><div className="modal-actions"><button onClick={() => setDialog(false)}>取消</button><button className="primary-action" disabled={saving} onClick={save}>{saving ? "保存中…" : "保存工作流"}</button></div></Modal>}{detail && <Modal title={`运行 #${detail.id} · ${detail.actionType}`} onClose={() => setDetail(null)} wide><div className="workflow-run-detail"><dl><div><dt>状态</dt><dd>{statusText[detail.status] || detail.status}</dd></div><div><dt>设备</dt><dd>{deviceName(detail.deviceId)}</dd></div><div><dt>重试</dt><dd>{detail.attempt}/{detail.maxAttempts}</dd></div><div><dt>错误</dt><dd>{detail.error || "无"}</dd></div></dl><strong>待执行内容 / 触发上下文</strong><pre className="operation-output">{String(detail.payload.content || detail.payload.context || detail.payload.target || "无")}</pre><strong>执行结果</strong><pre className="operation-output">{JSON.stringify(detail.result, null, 2) || "尚未产生结果"}</pre></div></Modal>}</div>;
}

export function CreationCenter({ notify }: { notify: Notify }) {
  const [records, setRecords] = useState<RecordItem[]>([]); const [overview, setOverview] = useState<Overview | null>(null); const [dialog, setDialog] = useState(false); const [saving, setSaving] = useState(false); const [form, setForm] = useState({ name: "", brief: "", output: "短视频成片", ratio: "9:16", duration: "30" });
  const load = async () => { try { const [rows, data] = await Promise.all([loadRecords("creation-center"), readJson<Overview>(await fetch("/api/overview", { cache: "no-store" }))]); setRecords(rows); setOverview(data); } catch (error) { notify(error instanceof Error ? error.message : "加载失败"); } };
  useEffect(() => { load(); }, []);
  const save = async () => { if (!form.name.trim() || !form.brief.trim()) { notify("请填写项目名称和创作需求。"); return; } setSaving(true); try { await createRecord("creation-center", form.name, form.brief, { ...form, currentStep: "需求分析" }, "draft"); setDialog(false); await load(); notify("项目已创建；可以按流水线进入文案、生图、视频或后期模块。"); } catch (error) { notify(error instanceof Error ? error.message : "创建失败"); } finally { setSaving(false); } };
  const go = (page: string) => { const url = `${window.location.pathname}?page=${page}`; window.history.pushState({}, "", url); window.dispatchEvent(new PopStateEvent("popstate")); };
  const services = overview?.services || {};
  return <div className="module-page"><Header eyebrow="ONE STOP CREATION" title="一站式创作" desc="把原软件分散的文案、分镜、生图、视频、配音、字幕和成片流程放进同一个项目。" action="创建创作项目" onAction={() => setDialog(true)}/><div className="creation-pipeline">{[["1", "策划与文案", true, "agent-chat"], ["2", "分镜与生图", services.image, "image-generate"], ["3", "视频生成", services.video, "video-gen"], ["4", "ASR 字幕", services.asr, "video"], ["5", "TTS 配音", services.tts, "video"], ["6", "剪辑与成片", true, "video"]].map(([step, label, ready, page]) => <button className={`panel ${ready ? "ready" : "pending"}`} key={String(step)} onClick={() => ready ? go(String(page)) : notify(`${label} 尚未配置云端服务，页面不会伪造执行结果。`)}><i>{step}</i><strong>{label}</strong><small>{ready ? "可以使用" : "需要配置"}</small><ChevronRight/></button>)}</div><section className="panel operation-list"><div className="panel-heading"><div><h3>创作项目</h3><p>每个项目保存需求、规格与当前环节</p></div><button className="outline-action" onClick={load}><RefreshCw size={14}/>刷新</button></div>{records.length === 0 ? <Empty icon={<Film/>} title="还没有创作项目" text="创建后再进入需要的生成或剪辑环节。" action="创建第一个项目" onAction={() => setDialog(true)}/> : records.map(record => <article key={record.id}><span className="operation-icon"><Film/></span><div><strong>{record.title}</strong><p>{record.description}</p><small>{record.metadata.output} · {record.metadata.ratio} · {record.metadata.duration} 秒 · 当前：{record.metadata.currentStep}</small></div><em>{statusText[record.status] || record.status}</em><button onClick={() => go("video-gen")}><CirclePlay/>继续创作</button></article>)}</section>{dialog && <Modal title="创建一站式创作项目" onClose={() => setDialog(false)} wide><div className="builder-body"><label>项目名称<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="例如：夏季新品30秒广告"/></label><label>创作需求<textarea value={form.brief} onChange={event => setForm({ ...form, brief: event.target.value })} placeholder="产品、目标受众、核心卖点、风格、平台和必须出现的信息"/></label><div className="field-pair"><label>最终交付<select value={form.output} onChange={event => setForm({ ...form, output: event.target.value })}><option>短视频成片</option><option>商品广告</option><option>数字人口播</option><option>图片分镜</option><option>图文内容</option></select></label><label>画面比例<select value={form.ratio} onChange={event => setForm({ ...form, ratio: event.target.value })}><option>9:16</option><option>16:9</option><option>1:1</option><option>4:3</option></select></label></div><label>目标时长（秒）<input type="number" min="5" max="600" value={form.duration} onChange={event => setForm({ ...form, duration: event.target.value })}/></label></div><div className="modal-actions"><button onClick={() => setDialog(false)}>取消</button><button className="primary-action" disabled={saving} onClick={save}>{saving ? "创建中…" : "创建项目"}</button></div></Modal>}</div>;
}

export function TaskMonitor({ notify }: { notify: Notify }) {
  const [jobs, setJobs] = useState<Job[]>([]); const [loading, setLoading] = useState(true); const [filter, setFilter] = useState("all");
  const load = async (quiet = false) => { if (!quiet) setLoading(true); try { setJobs((await readJson<{ jobs: Job[] }>(await fetch("/api/automation?action=jobs", { cache: "no-store" }))).jobs || []); } catch (error) { if (!quiet) notify(error instanceof Error ? error.message : "读取失败"); } finally { if (!quiet) setLoading(false); } };
  useEffect(() => { load(); const timer = window.setInterval(() => load(true), 4000); return () => window.clearInterval(timer); }, []);
  const visible = filter === "all" ? jobs : jobs.filter(job => filter === "active" ? ["queued", "claimed", "running"].includes(job.status) : job.status === filter);
  const control = async (job: Job, operation: "retry" | "cancel") => { if (operation === "cancel" && !window.confirm(`取消任务 #${job.id}？`)) return; try { await readJson(await fetch("/api/automation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "job_control", jobId: job.id, operation }) })); await load(true); notify(operation === "retry" ? "已创建重试任务。" : "任务已取消。"); } catch (error) { notify(error instanceof Error ? error.message : "控制失败"); } };
  return <div className="module-page"><Header eyebrow="REAL TASK MONITOR" title="任务监控" desc="统一查看电脑助手的真实领取、执行、成功和失败状态。" action="刷新任务" onAction={() => load()}/><div className="task-summary">{[["进行中", jobs.filter(j => ["queued", "claimed", "running"].includes(j.status)).length, Activity, "violet"], ["已完成", jobs.filter(j => j.status === "succeeded").length, CheckCircle2, "green"], ["失败", jobs.filter(j => j.status === "failed").length, XCircle, "red"], ["已取消", jobs.filter(j => j.status === "cancelled").length, Pause, "blue"]].map(([label, value, Icon, tone]) => <div className="summary-card" key={String(label)}><span className={String(tone)}><Icon size={18}/></span><div><strong>{value}</strong><small>{label}</small></div></div>)}</div><section className="panel task-monitor-real"><div className="private-tabs">{[["all", "全部"], ["active", "进行中"], ["succeeded", "已完成"], ["failed", "失败"]].map(([key, label]) => <button className={filter === key ? "active" : ""} key={key} onClick={() => setFilter(key)}>{label}</button>)}</div>{loading ? <Empty icon={<RefreshCw className="spin"/>} title="正在读取任务" text=""/> : visible.length === 0 ? <Empty icon={<Activity/>} title="当前没有任务" text="从自动工作流、公域获客或私域运营创建任务后会出现在这里。"/> : <div className="job-list">{visible.map(job => <article key={job.id}><span className={`job-status ${job.status}`}><Activity/></span><div><strong>#{job.id} {taskText[job.type] || job.type}</strong><small>{new Date(job.createdAt).toLocaleString("zh-CN")} · {statusText[job.status] || job.status}</small>{job.error && <p>{job.error}</p>}{job.result && Object.keys(job.result).length > 0 && <p>{String(job.result.message || job.result.notice || "已回传执行结果")}</p>}</div><em className={job.status}>{job.progress}%</em>{job.status === "failed" && <button onClick={() => control(job, "retry")}><RotateCcw/>重试</button>}{["queued", "claimed"].includes(job.status) && <button onClick={() => control(job, "cancel")}><Square/>取消</button>}</article>)}</div>}</section></div>;
}

export function AccountBinding({ notify }: { notify: Notify }) {
  const [records, setRecords] = useState<RecordItem[]>([]); const [devices, setDevices] = useState<Device[]>([]); const [dialog, setDialog] = useState(false); const [saving, setSaving] = useState(false); const [form, setForm] = useState({ platform: "douyin", name: "", deviceId: "" });
  const load = async () => { try { const [rows, data] = await Promise.all([loadRecords("accounts"), readJson<{ devices: Device[] }>(await fetch("/api/automation?action=devices", { cache: "no-store" }))]); setRecords(rows); setDevices(data.devices || []); } catch (error) { notify(error instanceof Error ? error.message : "加载失败"); } };
  useEffect(() => { load(); }, []);
  const device = devices.find(item => item.deviceId === form.deviceId && item.online);
  const openLogin = async () => { if (!form.name.trim() || !device) { notify("请填写账号备注并选择在线电脑。"); return; } setSaving(true); try { await readJson(await fetch("/api/automation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", type: "platform_open_login", deviceId: device.deviceId, payload: { platform: form.platform } }) })); await createRecord("accounts", form.name, "登录凭证只保留在本地电脑", { platform: form.platform, deviceId: device.deviceId, deviceName: device.name, loginState: "等待扫码确认" }, "draft"); setDialog(false); await load(); notify("登录页已在所选电脑打开；扫码后再点“确认已登录”。"); } catch (error) { notify(error instanceof Error ? error.message : "打开失败"); } finally { setSaving(false); } };
  const confirm = async (record: RecordItem) => { await readJson(await fetch("/api/records", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: record.id, module: "accounts", title: record.title, description: record.description, status: "active", metadata: { ...record.metadata, loginState: "用户已确认登录" } }) })); await load(); };
  return <div className="module-page"><Header eyebrow="LOCAL ACCOUNT BINDING" title="账号绑定" desc="网站只保存平台、账号备注与设备归属；Cookie 和登录凭证保留在客户自己的电脑。" action="绑定平台账号" onAction={() => setDialog(true)}/><div className="account-real-summary"><span><strong>{records.length}</strong><small>全部账号</small></span><span><strong>{records.filter(r => r.status === "active").length}</strong><small>已确认登录</small></span><span><strong>{devices.filter(d => d.online).length}</strong><small>在线电脑</small></span></div><section className="panel operation-list">{records.length === 0 ? <Empty icon={<UsersRound/>} title="还没有平台账号" text="先启动电脑助手，再选择平台并在本地扫码登录。" action="绑定第一个账号" onAction={() => setDialog(true)}/> : records.map(record => <article key={record.id}><span className="platform-letter">{{ douyin: "抖", xiaohongshu: "红", kuaishou: "快", shipinhao: "视", wechat: "微" }[record.metadata.platform] || "账"}</span><div><strong>{record.title}</strong><p>{record.metadata.deviceName || "未选择设备"}</p><small>{record.metadata.loginState || "等待确认"} · 凭证不上传服务器</small></div><em className={record.status}>{record.status === "active" ? "已登录" : "待确认"}</em>{record.status !== "active" && <button onClick={() => confirm(record)}><CheckCircle2/>确认已登录</button>}</article>)}</section>{dialog && <Modal title="绑定平台账号" onClose={() => setDialog(false)}><div className="builder-body"><label>平台<select value={form.platform} onChange={event => setForm({ ...form, platform: event.target.value })}><option value="douyin">抖音</option><option value="xiaohongshu">小红书</option><option value="kuaishou">快手</option><option value="shipinhao">视频号</option><option value="wechat">微信</option></select></label><label>账号备注<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="例如：品牌主账号"/></label><label>登录电脑<select value={form.deviceId} onChange={event => setForm({ ...form, deviceId: event.target.value })}><option value="">请选择在线电脑</option>{devices.filter(item => item.online).map(item => <option value={item.deviceId} key={item.deviceId}>{item.name}</option>)}</select></label><div className="expert-boundary"><ShieldCheck/><span><strong>本地登录</strong><small>扫码、Cookie 和平台会话只存在所选电脑，不会发送到奇遇AI服务器。</small></span></div></div><div className="modal-actions"><button onClick={() => setDialog(false)}>取消</button><button className="primary-action" disabled={saving} onClick={openLogin}>{saving ? "正在打开…" : "在电脑上打开登录页"}</button></div></Modal>}</div>;
}

export function LocalFileManager({ notify }: { notify: Notify }) {
  const [records, setRecords] = useState<RecordItem[]>([]); const [devices, setDevices] = useState<Device[]>([]); const [scanning, setScanning] = useState(false); const [deviceId, setDeviceId] = useState("");
  const load = async (quiet = false) => { try { const [rows, data] = await Promise.all([loadRecords("local-files"), readJson<{ devices: Device[] }>(await fetch("/api/automation?action=devices", { cache: "no-store" }))]); setRecords(rows); setDevices(data.devices || []); if (!deviceId) setDeviceId(data.devices?.find(item => item.online)?.deviceId || ""); } catch (error) { if (!quiet) notify(error instanceof Error ? error.message : "读取失败"); } };
  useEffect(() => { load(); const timer = window.setInterval(() => load(true), 5000); return () => window.clearInterval(timer); }, []);
  const start = async () => { const device = devices.find(item => item.deviceId === deviceId && item.online); if (!device) { notify("请先选择一台在线电脑。"); return; } if (!device.capabilities?.includes("local_folder_scan")) { notify("当前电脑助手版本过旧，请安装最新版后再扫描目录。"); return; } setScanning(true); try { await readJson(await fetch("/api/automation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", type: "local_folder_scan", deviceId }) })); notify("目录选择窗口已经发到电脑；选择后文件清单会自动回到这里。"); } catch (error) { notify(error instanceof Error ? error.message : "任务创建失败"); } finally { window.setTimeout(() => setScanning(false), 3500); } };
  const grouped = groupBy(records, record => record.metadata.rootName || "授权目录");
  return <div className="module-page"><Header eyebrow="AUTHORIZED LOCAL FILES" title="本地文件" desc="由客户在自己的电脑上选择授权目录；服务器只保存文件清单，不上传本地文件内容。"/><section className="panel local-file-connect"><span><HardDrive/></span><div><h3>连接本地素材目录</h3><p>先选择在线电脑，再由电脑助手弹出系统目录选择框。最多索引 500 个常用素材文件。</p></div><select value={deviceId} onChange={event => setDeviceId(event.target.value)}><option value="">选择在线电脑</option>{devices.filter(item => item.online).map(item => <option key={item.deviceId} value={item.deviceId}>{item.name}</option>)}</select><button className="primary-action" disabled={scanning} onClick={start}><FolderOpen/>{scanning ? "等待电脑选择…" : "选择并扫描目录"}</button></section><div className="local-file-stats"><span><strong>{records.length}</strong><small>已索引文件</small></span><span><strong>{Object.keys(grouped).length}</strong><small>授权目录</small></span><span><strong>{devices.filter(item => item.online).length}</strong><small>在线电脑</small></span></div><section className="panel operation-list"><div className="panel-heading"><div><h3>本地素材索引</h3><p>路径为授权目录内的相对路径</p></div><button className="outline-action" onClick={() => load()}><RefreshCw/>刷新</button></div>{records.length === 0 ? <Empty icon={<FolderOpen/>} title="还没有本地文件索引" text="启动最新版电脑助手后选择一个素材目录。"/> : records.map(record => <article key={record.id}><span className="operation-icon"><FileText/></span><div><strong>{record.title}</strong><p>{record.metadata.rootName} / {record.metadata.relativePath}</p><small>{record.description} · {record.metadata.modifiedAt ? new Date(record.metadata.modifiedAt).toLocaleString("zh-CN") : ""}</small></div><em className="completed">已索引</em></article>)}</section></div>;
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((result, item) => { const group = key(item); (result[group] ||= []).push(item); return result; }, {});
}

export function SettingsStatus({ notify }: { notify: Notify }) {
  const [data, setData] = useState<Overview | null>(null); const load = async () => { try { setData(await readJson<Overview>(await fetch("/api/overview", { cache: "no-store" }))); } catch (error) { notify(error instanceof Error ? error.message : "读取失败"); } };
  useEffect(() => { load(); }, []);
  const labels: Record<string, [string, string]> = { llm: ["文案与专家模型", "服务器中转站 / GPT-5.5"], image: ["图片生成", "GPT Image 2"], video: ["视频生成", "火山方舟 Seedance 2.0"], storage: ["文件存储", "奇遇AI对象存储"], desktop: ["电脑助手", "本地自动化执行器"], asr: ["语音识别", "ASR 服务"], tts: ["云端配音", "IndexTTS / 云显卡"] };
  return <div className="module-page"><Header eyebrow="SYSTEM READINESS" title="系统设置" desc="密钥只保存在服务器；浏览器只能看到是否已连接，不能读取或下载密钥。" action="刷新检测" onAction={load}/><section className="panel settings-status-list">{Object.entries(labels).map(([key, [title, detail]]) => <article key={key}><span className={data?.services?.[key] ? "ready" : "pending"}>{data?.services?.[key] ? <CheckCircle2/> : <Clock3/>}</span><div><strong>{title}</strong><small>{detail}</small></div><em className={data?.services?.[key] ? "ready" : "pending"}>{data?.services?.[key] ? "已连接" : "需要配置"}</em></article>)}</section><section className="panel security-settings"><ShieldCheck/><div><h3>当前安全策略</h3><p>模型密钥不写入前端；平台登录凭证只留在客户电脑；消息发送和内容发布支持人工审核；自动化任务均记录状态和错误。</p></div></section></div>;
}
