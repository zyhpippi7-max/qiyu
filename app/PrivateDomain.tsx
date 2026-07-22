"use client";

import {
  Activity,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Edit3,
  Laptop,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  UsersRound,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ModalPortal } from "./ModalPortal";

type Props = { page: string; notify: (message: string) => void };
type TagItem = { id: number; name: string; color: string };
type Contact = {
  id: number;
  name: string;
  remark: string;
  source?: string;
  status: string;
  lastContactAt?: string;
  tags: TagItem[];
};
type Step = {
  id?: number;
  stepOrder?: number;
  action: string;
  delayMinutes: number;
  content: string;
  enabled?: boolean;
  settings?: Record<string, unknown>;
};
type Plan = {
  id: number;
  module: string;
  name: string;
  status: string;
  targetMode: string;
  targetValue: number[];
  settings: Record<string, unknown>;
  steps: Step[];
  updatedAt: string;
};
type Run = {
  id: number;
  planId: number;
  planName: string;
  contactName?: string;
  status: string;
  currentStep: number;
  nextRunAt: string;
  error: string;
};
type Device = {
  deviceId: string;
  name: string;
  version: string;
  online: boolean;
  capabilities: string[];
};
type SyncCandidate = { name: string; confidence: number };

const moduleKey: Record<string, string> = {
  activation: "activation",
  moments: "moments",
  "wechat-message": "message",
  "smart-broadcast": "broadcast",
  "auto-reply": "auto-reply",
  "wechat-sop": "sop",
  "wechat-tags": "tags",
};
const pageCopy: Record<
  string,
  {
    title: string;
    desc: string;
    action: string;
    nameLabel: string;
    namePlaceholder: string;
    nameHelp: string;
  }
> = {
  activation: {
    title: "主动激活",
    desc: "按客户标签和时间间隔运行多步骤跟进，逐步唤醒沉默客户。",
    action: "新建激活方案",
    nameLabel: "激活方案名称",
    namePlaceholder: "例如：30天未互动客户唤醒",
    nameHelp: "建议写清客户范围和激活目的，后续查找更方便。",
  },
  moments: {
    title: "朋友圈营销",
    desc: "编排内容、素材和发布时间，审核后交给在线电脑执行。",
    action: "新建发布计划",
    nameLabel: "发布计划名称",
    namePlaceholder: "例如：7月新品朋友圈预热",
    nameHelp: "建议包含活动主题或发布时间，便于区分不同计划。",
  },
  "wechat-message": {
    title: "微信消息",
    desc: "管理联系人和标签，创建单聊任务，并查看电脑执行结果。",
    action: "新建消息",
    nameLabel: "消息任务名称",
    namePlaceholder: "例如：展会客户首次跟进",
    nameHelp: "只用于后台识别任务，不会发送给客户。",
  },
  "auto-reply": {
    title: "自动回复",
    desc: "配置关键词、AI回复、新好友问候、适用人群与频率限制。",
    action: "新建回复策略",
    nameLabel: "回复策略名称",
    namePlaceholder: "例如：产品价格咨询自动回复",
    nameHelp: "名称应能说明触发场景，方便后续管理多条回复策略。",
  },
  "smart-broadcast": {
    title: "智能群发",
    desc: "按联系人或标签选择目标人群，预览后批量加入受控发送队列。",
    action: "新建群发任务",
    nameLabel: "群发任务名称",
    namePlaceholder: "例如：老客户新品到店通知",
    nameHelp: "建议写清发送对象和内容主题，仅用于后台管理。",
  },
  "wechat-sop": {
    title: "微信 SOP",
    desc: "按客户阶段编排多步骤消息、等待时间、审核和执行回写。",
    action: "新建微信 SOP",
    nameLabel: "SOP 流程名称",
    namePlaceholder: "例如：新客户7天跟进流程",
    nameHelp: "建议体现客户阶段和执行周期，方便团队复用。",
  },
  "wechat-tags": {
    title: "客户标签",
    desc: "从已登录微信同步联系人，并维护客户标签和目标人群。",
    action: "管理联系人",
    nameLabel: "标签方案名称",
    namePlaceholder: "例如：高意向客户分组",
    nameHelp: "用于区分不同客户分组方案。",
  },
};

const emptyStep = (): Step => ({
  action: "message",
  delayMinutes: 0,
  content: "",
  enabled: true,
  settings: {},
});

export function PrivateDomain({ page, notify }: Props) {
  const module = moduleKey[page] || "activation";
  const copy = pageCopy[page];
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const initialTab =
    page === "wechat-message"
      ? "compose"
      : page === "wechat-tags"
        ? "contacts"
        : "plans";
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(initialTab);
  const [contactDialog, setContactDialog] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactRemark, setContactRemark] = useState("");
  const [tagName, setTagName] = useState("");
  const [editingTags, setEditingTags] = useState<Contact | null>(null);
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [builder, setBuilder] = useState(false);
  const [builderStage, setBuilderStage] = useState(1);
  const [editingPlan, setEditingPlan] = useState<number | null>(null);
  const [planName, setPlanName] = useState("");
  const [targetMode, setTargetMode] = useState("all");
  const [targets, setTargets] = useState<number[]>([]);
  const [steps, setSteps] = useState<Step[]>([emptyStep()]);
  const [targetQuery, setTargetQuery] = useState("");
  const [targetTagFilter, setTargetTagFilter] = useState("");
  const [targetSelectedOnly, setTargetSelectedOnly] = useState(false);
  const [strategy, setStrategy] = useState({
    type: "ai",
    matchType: "contains",
    keywords: "",
    replyType: "ai",
    delayMin: 1,
    delayMax: 5,
    dailyLimit: 20,
    aiPrompt: "先回答客户当前问题，再自然推进一个下一步。",
    aiEnabled: true,
    expertRole: "private",
    modelTier: "smart",
    businessContext: "",
    useKnowledge: true,
    useCustomerData: true,
    useChatHistory: true,
    historyLimit: 40,
    approval: true,
  });
  const [messageContact, setMessageContact] = useState("");
  const [messageContent, setMessageContent] = useState("");
  const [messageRole, setMessageRole] = useState("private");
  const [messageGoal, setMessageGoal] = useState("");
  const [messageMode, setMessageMode] = useState<"ai" | "fixed">("ai");
  const [messageHistoryLimit, setMessageHistoryLimit] = useState(40);
  const [messageUseKnowledge, setMessageUseKnowledge] = useState(true);
  const [messageUseCustomerData, setMessageUseCustomerData] = useState(true);
  const [sendApproved, setSendApproved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [launchingPlan, setLaunchingPlan] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncJobId, setSyncJobId] = useState<number | null>(null);
  const [syncPreview, setSyncPreview] = useState<SyncCandidate[]>([]);
  const [selectedSyncNames, setSelectedSyncNames] = useState<string[]>([]);
  const [syncDialog, setSyncDialog] = useState(false);

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [domainResponse, deviceResponse] = await Promise.all([
        fetch(`/api/private-domain?action=bootstrap&module=${module}`, {
          cache: "no-store",
        }),
        fetch("/api/automation?action=devices", { cache: "no-store" }),
      ]);
      const data = await domainResponse.json();
      const deviceData = await deviceResponse.json();
      if (!domainResponse.ok) throw new Error(data.error || "加载失败");
      setContacts(data.contacts || []);
      setTags(data.tags || []);
      setPlans(data.plans || []);
      setRuns(data.runs || []);
      setDevices(deviceData.devices || []);
    } catch (error) {
      if (!quiet) notify(error instanceof Error ? error.message : "加载失败");
    } finally {
      if (!quiet) setLoading(false);
    }
  };
  useEffect(() => {
    setTab(
      page === "wechat-message"
        ? "compose"
        : page === "wechat-tags"
          ? "contacts"
          : "plans",
    );
    load();
  }, [page]);
  useEffect(() => {
    const timer = window.setInterval(() => load(true), 5000);
    return () => window.clearInterval(timer);
  }, [module]);
  useEffect(() => {
    if (!syncJobId) return;
    let cancelled = false;
    const check = async () => {
      try {
        const response = await fetch(
          `/api/private-domain?action=contact_scan_status&jobId=${syncJobId}`,
          { cache: "no-store" },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "读取同步进度失败");
        if (cancelled || !["succeeded", "failed"].includes(data.job.status))
          return;
        setSyncJobId(null);
        setSyncing(false);
        if (data.job.status === "failed") {
          notify(data.job.error || "微信联系人同步失败");
          return;
        }
        const candidates = (
          Array.isArray(data.job.result?.contacts)
            ? data.job.result.contacts
            : []
        )
          .map((item: Record<string, unknown>) => ({
            name: String(item.name || "").trim(),
            confidence: Number(item.confidence || 0),
          }))
          .filter((item: SyncCandidate) => item.name);
        setSyncPreview(candidates);
        setSelectedSyncNames(
          candidates.map((item: SyncCandidate) => item.name),
        );
        setSyncDialog(true);
        notify(`已读取 ${candidates.length} 个联系人，请确认后导入。`);
      } catch (error) {
        if (!cancelled) {
          setSyncJobId(null);
          setSyncing(false);
          notify(error instanceof Error ? error.message : "联系人同步失败");
        }
      }
    };
    check();
    const timer = window.setInterval(check, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [syncJobId]);
  const post = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/private-domain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "操作失败");
    return data;
  };
  const onlineDevice = devices.find((device) => device.online);
  const planStats = useMemo(
    () => ({
      active: plans.filter((plan) => plan.status === "active").length,
      running: runs.filter((run) =>
        ["scheduled", "running"].includes(run.status),
      ).length,
      complete: runs.filter((run) => run.status === "completed").length,
    }),
    [plans, runs],
  );
  const filteredTargetContacts = useMemo(() => {
    const keyword = targetQuery.trim().toLocaleLowerCase("zh-CN");
    return contacts.filter((contact) => {
      if (targetSelectedOnly && !targets.includes(contact.id)) return false;
      if (
        targetTagFilter &&
        !contact.tags.some((tag) => String(tag.id) === targetTagFilter)
      )
        return false;
      if (!keyword) return true;
      return [
        contact.name,
        contact.remark,
        ...contact.tags.map((tag) => tag.name),
      ].some((value) => value.toLocaleLowerCase("zh-CN").includes(keyword));
    });
  }, [contacts, targetQuery, targetTagFilter, targetSelectedOnly, targets]);
  const filteredTargetTags = useMemo(() => {
    const keyword = targetQuery.trim().toLocaleLowerCase("zh-CN");
    return tags.filter(
      (tag) =>
        (!targetSelectedOnly || targets.includes(tag.id)) &&
        (!keyword || tag.name.toLocaleLowerCase("zh-CN").includes(keyword)),
    );
  }, [tags, targetQuery, targetSelectedOnly, targets]);
  const visibleTargetContacts = filteredTargetContacts.slice(0, 200);

  const resetTargetFilters = () => {
    setTargetQuery("");
    setTargetTagFilter("");
    setTargetSelectedOnly(false);
  };
  const resetBuilder = () => {
    setEditingPlan(null);
    setPlanName("");
    setTargetMode("all");
    setTargets([]);
    resetTargetFilters();
    setSteps([emptyStep()]);
    setStrategy({
      type: "ai",
      matchType: "contains",
      keywords: "",
      replyType: "ai",
      delayMin: 1,
      delayMax: 5,
      dailyLimit: 20,
      aiPrompt: "先回答客户当前问题，再自然推进一个下一步。",
      aiEnabled: true,
      expertRole: "private",
      modelTier: "smart",
      businessContext: "",
      useKnowledge: true,
      useCustomerData: true,
      useChatHistory: true,
      historyLimit: 40,
      approval: true,
    });
    setBuilderStage(1);
    setBuilder(true);
  };
  const editPlan = (plan: Plan) => {
    setEditingPlan(plan.id);
    setPlanName(plan.name);
    setTargetMode(plan.targetMode === "contacts" ? "manual" : plan.targetMode);
    setTargets(plan.targetValue || []);
    resetTargetFilters();
    setSteps(plan.steps.length ? plan.steps : [emptyStep()]);
    setStrategy((current) => ({ ...current, ...plan.settings }));
    setBuilderStage(1);
    setBuilder(true);
  };
  const selectTargetMode = (mode: string) => {
    setTargetMode(mode);
    setTargets([]);
    resetTargetFilters();
  };
  const targetSummary = (plan: Plan) =>
    plan.targetMode === "all"
      ? `全部好友（当前 ${contacts.length} 人）`
      : plan.targetMode === "tags"
        ? `${plan.targetValue.length} 个标签`
        : `手动选择 ${plan.targetValue.length} 人`;
  const savePlan = async () => {
    if (!planName.trim()) {
      notify(`请填写${copy.nameLabel}。`);
      return;
    }
    if (module !== "auto-reply" && !steps.some((step) => step.content.trim())) {
      notify("请至少填写一个步骤内容。");
      return;
    }
    if (module === "auto-reply" && targetMode === "all" && strategy.approval === false) {
      notify("全部好友模式只能生成草稿。自动发送请改用标签或手动白名单。");
      return;
    }
    setSaving(true);
    try {
      await post({
        action: "plan_save",
        id: editingPlan,
        module,
        name: planName,
        status: editingPlan
          ? plans.find((p) => p.id === editingPlan)?.status
          : "draft",
        targetMode,
        targetValue: targets,
        settings: strategy,
        steps:
          module === "auto-reply"
            ? [
                {
                  ...emptyStep(),
                  content:
                    strategy.replyType === "ai"
                      ? strategy.aiPrompt
                      : steps[0]?.content || "",
                },
              ]
            : steps,
      });
      setBuilder(false);
      await load(true);
      notify("方案已保存，可以审核后启动。");
    } catch (error) {
      notify(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };
  const runPlan = async (plan: Plan) => {
    if (!onlineDevice) {
      notify("没有在线电脑，请先启动奇遇AI助手。");
      return;
    }
    if (!onlineDevice.capabilities?.includes("wechat_sop_step")) {
      notify("当前电脑助手版本太旧，请先安装最新版后再启动。");
      return;
    }
    const aiEnabled =
      plan.settings.aiEnabled === true || plan.settings.replyType === "ai";
    if (
      aiEnabled &&
      !onlineDevice.capabilities?.includes("wechat_ai_reply")
    ) {
      notify("当前电脑助手不支持AI上下文消息，请先升级到0.5.7或更高版本。");
      return;
    }
    const automaticSend = plan.settings.approval === false;
    const executionMode = automaticSend
      ? "电脑助手会生成消息并直接点击发送，不再逐条等待确认。"
      : "电脑助手只会把消息填入微信草稿，由你逐条确认后发送。";
    if (
      !window.confirm(
        `确认启动“${plan.name}”？\n\n目标：${targetSummary(plan)}\n模式：${aiEnabled ? "AI结合客户上下文生成" : "固定消息"}\n${executionMode}`,
      )
    )
      return;
    setLaunchingPlan(plan.id);
    try {
      const data = await post({
        action: "run_plan",
        planId: plan.id,
        deviceId: onlineDevice.deviceId,
      });
      await load(true);
      setTab("runs");
      notify(
        `已创建 ${data.count} 条执行流程，正在“执行记录”中显示实时状态。`,
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "启动失败");
    } finally {
      setLaunchingPlan(null);
    }
  };
  const togglePlan = async (plan: Plan) => {
    await post({
      action: "plan_toggle",
      id: plan.id,
      status: plan.status === "active" ? "paused" : "active",
    });
    await load(true);
  };
  const deletePlan = async (plan: Plan) => {
    if (!window.confirm(`删除“${plan.name}”？`)) return;
    await post({ action: "plan_delete", id: plan.id });
    await load(true);
  };
  const saveContact = async () => {
    try {
      await post({
        action: "contact_save",
        name: contactName,
        remark: contactRemark,
      });
      setContactDialog(false);
      setContactName("");
      setContactRemark("");
      await load(true);
      notify("联系人已保存。");
    } catch (error) {
      notify(error instanceof Error ? error.message : "保存失败");
    }
  };
  const startContactSync = async () => {
    if (!onlineDevice) {
      notify("没有在线电脑，请先启动奇遇AI助手。");
      return;
    }
    if (!onlineDevice.capabilities?.includes("wechat_contact_scan")) {
      notify("当前助手版本太旧，请先安装最新版助手。");
      return;
    }
    setSyncing(true);
    try {
      const data = await post({
        action: "contact_scan_task",
        deviceId: onlineDevice.deviceId,
      });
      setSyncJobId(Number(data.job.id));
      notify(
        "正在打开已登录微信并读取通讯录，首次使用请允许辅助功能和屏幕录制权限。",
      );
    } catch (error) {
      setSyncing(false);
      notify(error instanceof Error ? error.message : "联系人同步失败");
    }
  };
  const confirmContactImport = async () => {
    if (!selectedSyncNames.length) {
      notify("请至少选择一个联系人。");
      return;
    }
    setSaving(true);
    try {
      const data = await post({
        action: "contacts_import",
        contacts: selectedSyncNames.map((name) => ({ name })),
      });
      setSyncDialog(false);
      setSyncPreview([]);
      setSelectedSyncNames([]);
      await load(true);
      notify(
        `已导入 ${data.imported} 位联系人，更新 ${data.updated} 位已有联系人。`,
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "导入失败");
    } finally {
      setSaving(false);
    }
  };
  const saveTag = async () => {
    try {
      await post({
        action: "tag_save",
        name: tagName,
        color: ["#7657e5", "#2f9d6a", "#d85b89", "#c77a2e"][tags.length % 4],
      });
      setTagName("");
      await load(true);
    } catch (error) {
      notify(error instanceof Error ? error.message : "保存失败");
    }
  };
  const openTags = (contact: Contact) => {
    setEditingTags(contact);
    setSelectedTags(contact.tags.map((tag) => tag.id));
  };
  const saveContactTags = async () => {
    if (!editingTags) return;
    await post({
      action: "contact_tags",
      contactId: editingTags.id,
      tagIds: selectedTags,
    });
    setEditingTags(null);
    await load(true);
  };
  const createMessage = async () => {
    if (!onlineDevice) {
      notify("没有在线电脑，请先启动电脑助手。");
      return;
    }
    const aiRequested = messageMode === "ai";
    if (!messageContact || (aiRequested ? !messageGoal.trim() : !messageContent.trim())) {
      notify(aiRequested ? "请选择联系人并填写本次沟通目标。" : "请选择联系人并填写消息。");
      return;
    }
    if (
      sendApproved &&
      !window.confirm(
        "你已开启自动发送。确认消息内容和联系人无误，并授权电脑助手点击发送？",
      )
    )
      return;
    setSaving(true);
    try {
      await post({
        action: "message_task",
        deviceId: onlineDevice.deviceId,
        contact: messageContact,
        content: messageContent,
        goal: messageGoal,
        aiRequested,
        expertRole: messageRole,
        useKnowledge: messageUseKnowledge,
        useCustomerData: messageUseCustomerData,
        useChatHistory: true,
        historyLimit: messageHistoryLimit,
        sendApproved,
      });
      notify(
        aiRequested
          ? sendApproved
            ? "电脑助手将读取最近对话和企业知识，生成后按授权发送。"
            : "电脑助手将读取最近对话和企业知识，生成草稿后停下等待你确认。"
          : sendApproved
            ? "消息任务已进入发送队列。"
            : "草稿任务已下发，电脑只会填写不发送。",
      );
      setMessageContent("");
    } catch (error) {
      notify(error instanceof Error ? error.message : "创建失败");
    } finally {
      setSaving(false);
    }
  };

  const tabs =
    page === "wechat-message"
      ? [
          ["compose", "发消息"],
          ["contacts", "联系人与标签"],
          ["runs", "任务记录"],
        ]
      : page === "auto-reply"
        ? [
            ["plans", "回复策略"],
            ["contacts", "适用人群"],
            ["runs", "运行日志"],
          ]
        : page === "wechat-tags"
          ? [
              ["contacts", "联系人与标签"],
              ["runs", "变更记录"],
            ]
          : [
              [
                "plans",
                page === "moments"
                  ? "发布计划"
                  : page === "smart-broadcast"
                    ? "群发任务"
                    : page === "wechat-sop"
                      ? "微信 SOP"
                      : "激活方案",
              ],
              ["contacts", "目标人群"],
              ["runs", "执行记录"],
            ];
  return (
    <div className="module-page private-domain">
      <div className="module-header">
        <div>
          <span>PRIVATE DOMAIN AUTOMATION</span>
          <h2>{copy.title}</h2>
          <p>{copy.desc}</p>
        </div>
        <button
          className="primary-action"
          onClick={() =>
            page === "wechat-message"
              ? setTab("compose")
              : page === "wechat-tags"
                ? setTab("contacts")
                : resetBuilder()
          }
        >
          <Plus size={16} />
          {copy.action}
        </button>
      </div>
      <div className="private-flow">
        <span className={contacts.length ? "done" : "active"}>
          <i>1</i>客户与标签
        </span>
        <ChevronRight />
        <span
          className={plans.length ? "done" : contacts.length ? "active" : ""}
        >
          <i>2</i>策略与步骤
        </span>
        <ChevronRight />
        <span className={onlineDevice ? "done" : plans.length ? "active" : ""}>
          <i>3</i>在线设备
        </span>
        <ChevronRight />
        <span className={runs.length ? "done" : ""}>
          <i>4</i>执行与回写
        </span>
      </div>
      <div className="private-tabs">
        {tabs.map((item) => (
          <button
            key={item[0]}
            className={tab === item[0] ? "active" : ""}
            onClick={() => setTab(item[0])}
          >
            {item[1]}
          </button>
        ))}
        <button className="private-refresh" onClick={() => load()}>
          <RefreshCw size={14} />
          刷新
        </button>
      </div>
      {loading ? (
        <div className="records-empty panel">
          <RefreshCw className="spin" />
          <strong>正在读取私域数据</strong>
        </div>
      ) : (
        <>
          {tab === "compose" && (
            <div className="private-compose-grid">
              <section className="panel private-composer">
                <div className="panel-heading">
                  <div>
                    <h3>AI 微信沟通</h3>
                    <p>选择专家和沟通目标，AI生成后可编辑、审核或自动发送</p>
                  </div>
                  <MessageCircle />
                </div>
                <label>
                  联系人
                  <div className="contact-combobox">
                    <Search />
                    <input
                      list="wechat-contact-options"
                      value={messageContact}
                      onChange={(e) => setMessageContact(e.target.value)}
                      placeholder="输入微信昵称或备注搜索…"
                    />
                    <datalist id="wechat-contact-options">
                      {contacts.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.remark ||
                            c.tags.map((tag) => tag.name).join("、") ||
                            "微信好友"}
                        </option>
                      ))}
                    </datalist>
                  </div>
                  <small>可输入昵称、备注中的关键词快速查找</small>
                </label>
                <div className="message-mode-picker">
                  <button className={messageMode === "ai" ? "active" : ""} onClick={() => setMessageMode("ai")}>
                    <Sparkles />
                    <span><strong>AI 上下文回复</strong><small>读取最近聊天、客户资料和企业知识后生成</small></span>
                  </button>
                  <button className={messageMode === "fixed" ? "active" : ""} onClick={() => setMessageMode("fixed")}>
                    <MessageCircle />
                    <span><strong>固定消息</strong><small>按你填写的原文直接放入微信</small></span>
                  </button>
                </div>
                <div className="field-pair">
                  <label>
                    {messageMode === "ai" ? "回复角色" : "消息类型"}
                    <select
                      value={messageRole}
                      onChange={(e) => setMessageRole(e.target.value)}
                      disabled={messageMode === "fixed"}
                    >
                      <option value="private">私域运营顾问</option>
                      <option value="sales">销售顾问</option>
                      <option value="service">客服顾问</option>
                      <option value="success">客户成功顾问</option>
                    </select>
                  </label>
                  <label>
                    {messageMode === "ai" ? "本次沟通目标" : "内部备注"}
                    <input
                      value={messageGoal}
                      onChange={(e) => setMessageGoal(e.target.value)}
                      placeholder={messageMode === "ai" ? "例如：确认客户预算并自然预约演示" : "例如：展会客户首次跟进"}
                    />
                  </label>
                </div>
                {messageMode === "ai" ? (
                  <div className="message-context-settings">
                    <div className="context-source-row">
                      <label><input type="checkbox" checked={messageUseKnowledge} onChange={(e) => setMessageUseKnowledge(e.target.checked)}/><span><strong>企业知识库</strong><small>产品、价格、FAQ和政策</small></span></label>
                      <label><input type="checkbox" checked={messageUseCustomerData} onChange={(e) => setMessageUseCustomerData(e.target.checked)}/><span><strong>客户数据库</strong><small>备注、标签和跟进记录</small></span></label>
                      <label className="always-on"><input type="checkbox" checked readOnly/><span><strong>最近聊天记录</strong><small>受控读取可见的30–50条</small></span></label>
                    </div>
                    <label>读取消息数量<select value={messageHistoryLimit} onChange={(e) => setMessageHistoryLimit(Number(e.target.value))}><option value={30}>最近30条</option><option value={40}>最近40条（推荐）</option><option value={50}>最近50条</option></select></label>
                    <p><ShieldCheck/>只读取当前目标会话窗口中的可见文字，不直接访问微信数据库；截图识别完成后立即删除本地临时图片。</p>
                  </div>
                ) : (
                  <>
                    <div className="ai-compose-heading"><span>固定消息内容</span></div>
                    <textarea value={messageContent} onChange={(e) => setMessageContent(e.target.value)} placeholder="输入要原样放入微信的消息…"/>
                  </>
                )}
                <label className="approval-switch">
                  <input
                    type="checkbox"
                    checked={sendApproved}
                    onChange={(e) => setSendApproved(e.target.checked)}
                  />
                  <span>
                    <strong>
                      {sendApproved ? "AI接管发送已开启" : "仅填入草稿（推荐）"}
                    </strong>
                    <small>
                      {sendApproved
                        ? "电脑助手会点击发送；请确认联系人范围和频率"
                        : "电脑助手填写后停下，由你人工确认"}
                    </small>
                  </span>
                </label>
                <button
                  className="primary-action"
                  disabled={saving}
                  onClick={createMessage}
                >
                  <Send size={16} />
                  {saving
                    ? "下发中…"
                    : messageMode === "ai"
                      ? sendApproved
                        ? "读取上下文、生成并发送"
                        : "读取上下文并生成微信草稿"
                      : sendApproved
                        ? "确认并加入自动发送队列"
                        : "下发固定消息草稿"}
                </button>
              </section>
              <section className="panel execution-readiness">
                <h3>自动化准备情况</h3>
                <div className={onlineDevice ? "ready" : "warn"}>
                  <Laptop />
                  <span>
                    <strong>
                      {onlineDevice ? onlineDevice.name : "电脑助手未在线"}
                    </strong>
                    <small>
                      {onlineDevice
                        ? "可以领取微信任务"
                        : "前往设备管理启动助手"}
                    </small>
                  </span>
                </div>
                <div className={contacts.length ? "ready" : "warn"}>
                  <UsersRound />
                  <span>
                    <strong>{contacts.length} 位联系人</strong>
                    <small>
                      {contacts.length
                        ? "已能按微信名称执行"
                        : "请先从微信同步联系人"}
                    </small>
                  </span>
                </div>
                <div className="ready">
                  <Sparkles />
                  <span>
                    <strong>AI 专家已启用</strong>
                    <small>客户无需了解具体模型全称</small>
                  </span>
                </div>
                <div className="ready">
                  <ShieldCheck />
                  <span>
                    <strong>频率与审核保护</strong>
                    <small>自动接管仍受联系人范围和每日上限控制</small>
                  </span>
                </div>
              </section>
            </div>
          )}
          {tab === "contacts" && (
            <section className="panel private-contacts">
              <div className="panel-heading">
                <div>
                  <h3>联系人与标签</h3>
                  <p>
                    电脑助手从当前已登录微信读取通讯录联系人；预览确认后才会导入，并自动去重。
                  </p>
                </div>
                <div className="contact-sync-actions">
                  <button
                    className="sync-action"
                    disabled={syncing}
                    onClick={startContactSync}
                  >
                    <RefreshCw className={syncing ? "spin" : ""} size={15} />
                    {syncing ? "正在读取微信…" : "从微信同步"}
                  </button>
                  <button
                    className="primary-action"
                    onClick={() => setContactDialog(true)}
                  >
                    <Plus size={15} />
                    手动添加
                  </button>
                </div>
              </div>
              {onlineDevice &&
                !onlineDevice.capabilities?.includes("wechat_contact_scan") && (
                  <div className="contact-upgrade-note">
                    <span>
                      这台电脑的助手版本过旧，更新后才能自动读取微信联系人。
                    </span>
                    <a href="/download/QiyuAI-Mac-latest.dmg">
                      下载 Mac 最新版
                    </a>
                  </div>
                )}
              <div className="tag-editor">
                <Tag size={16} />
                <input
                  value={tagName}
                  onChange={(e) => setTagName(e.target.value)}
                  placeholder="新标签名称"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveTag();
                  }}
                />
                <button onClick={saveTag}>添加标签</button>
                {tags.map((tag) => (
                  <span
                    key={tag.id}
                    style={{ color: tag.color, borderColor: tag.color }}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
              {contacts.length === 0 ? (
                <Empty
                  icon={<UsersRound />}
                  title="还没有联系人"
                  text="先启动电脑助手，再从当前已登录微信同步联系人。"
                  action={syncing ? "正在读取微信…" : "从微信同步"}
                  onAction={syncing ? undefined : startContactSync}
                />
              ) : (
                <div className="contact-table">
                  {contacts.map((contact) => (
                    <article key={contact.id}>
                      <span className="contact-avatar">
                        {contact.name.slice(0, 1)}
                      </span>
                      <div>
                        <strong>{contact.name}</strong>
                        <small>
                          {contact.remark || "暂无备注"} ·{" "}
                          {contact.source === "wechat_desktop"
                            ? "微信同步"
                            : "手动添加"}
                        </small>
                      </div>
                      <div className="contact-tags">
                        {contact.tags.length ? (
                          contact.tags.map((tag) => (
                            <span
                              key={tag.id}
                              style={{
                                color: tag.color,
                                background: `${tag.color}14`,
                              }}
                            >
                              {tag.name}
                            </span>
                          ))
                        ) : (
                          <small>未标签</small>
                        )}
                      </div>
                      <button onClick={() => openTags(contact)}>
                        <Tag size={14} />
                        设置标签
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
          {tab === "plans" && (
            <>
              <div className="private-stat-grid">
                <Stat icon={<Zap />} value={plans.length} label="全部方案" />
                <Stat
                  icon={<Activity />}
                  value={planStats.active}
                  label="已启用"
                />
                <Stat
                  icon={<Clock3 />}
                  value={planStats.running}
                  label="执行中"
                />
                <Stat
                  icon={<CheckCircle2 />}
                  value={planStats.complete}
                  label="已完成"
                />
              </div>
              {plans.length === 0 ? (
                <section className="panel">
                  <Empty
                    icon={<Sparkles />}
                    title={`还没有${copy.title}方案`}
                    text="创建方案后依次选择目标人群、设置步骤与延迟，再交给在线电脑执行。"
                    action={copy.action}
                    onAction={resetBuilder}
                  />
                </section>
              ) : (
                <div className="private-plan-list">
                  {plans.map((plan) => (
                    <article className="panel" key={plan.id}>
                      <div className="plan-icon">
                        <Zap />
                      </div>
                      <div>
                        <div className="plan-title">
                          <strong>{plan.name}</strong>
                          <em className={plan.status}>
                            {plan.status === "active"
                              ? "启用"
                              : plan.status === "paused"
                                ? "暂停"
                                : "草稿"}
                          </em>
                        </div>
                        <p>
                          {module === "auto-reply"
                            ? `${String(plan.settings.type || "keyword")} · 每日上限 ${String(plan.settings.dailyLimit || 0)}`
                            : `${plan.steps.length} 个步骤 · ${targetSummary(plan)}`}
                        </p>
                        <div className="step-preview">
                          {plan.steps.slice(0, 4).map((step, index) => (
                            <span key={index}>
                              <i>{index + 1}</i>
                              {step.delayMinutes
                                ? `${step.delayMinutes}分钟后`
                                : "立即"}{" "}
                              · {step.content.slice(0, 18) || step.action}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="plan-actions">
                        <button onClick={() => editPlan(plan)}>
                          <Edit3 size={14} />
                          编辑
                        </button>
                        {module !== "auto-reply" && (
                          <button
                            className="run"
                            disabled={launchingPlan === plan.id}
                            onClick={() => runPlan(plan)}
                          >
                            <Send size={14} />
                            {launchingPlan === plan.id ? "启动中…" : "启动"}
                          </button>
                        )}
                        <button onClick={() => togglePlan(plan)}>
                          {plan.status === "active" ? "暂停" : "启用"}
                        </button>
                        <button
                          className="danger"
                          onClick={() => deletePlan(plan)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
          {tab === "runs" && (
            <section className="panel private-runs">
              <div className="panel-heading">
                <div>
                  <h3>执行记录</h3>
                  <p>每位联系人独立推进步骤，失败不会伪装成成功</p>
                </div>
              </div>
              {runs.length === 0 ? (
                <Empty
                  icon={<Activity />}
                  title="暂无执行记录"
                  text="启动一个已配置的方案后，记录会出现在这里。"
                />
              ) : (
                <div>
                  {runs.map((run) => (
                    <article key={run.id}>
                      <span className={`run-dot ${run.status}`} />
                      <div>
                        <strong>{run.planName}</strong>
                        <small>
                          {run.contactName || "系统策略"} · 当前第{" "}
                          {run.currentStep} 步
                        </small>
                        {run.error && <p>{run.error}</p>}
                      </div>
                      <span>
                        {run.status === "scheduled"
                          ? "等待执行"
                          : run.status === "running"
                            ? "执行中"
                            : run.status === "completed"
                              ? "已完成"
                              : "失败"}
                      </span>
                      <time>
                        {new Date(run.nextRunAt).toLocaleString("zh-CN")}
                      </time>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
      {contactDialog && (
        <Modal title="添加联系人" onClose={() => setContactDialog(false)}>
          <label>
            微信昵称或备注名
            <input
              autoFocus
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="必须与微信搜索名称一致"
            />
          </label>
          <label>
            内部备注
            <input
              value={contactRemark}
              onChange={(e) => setContactRemark(e.target.value)}
              placeholder="例如：7月展会客户"
            />
          </label>
          <div className="modal-actions">
            <button onClick={() => setContactDialog(false)}>取消</button>
            <button className="primary-action" onClick={saveContact}>
              保存联系人
            </button>
          </div>
        </Modal>
      )}
      {syncDialog && (
        <Modal
          wide
          title="确认导入微信联系人"
          onClose={() => setSyncDialog(false)}
        >
          <div className="sync-privacy-note">
            <ShieldCheck size={19} />
            <span>
              <strong>只导入你勾选的昵称或备注名</strong>
              <small>不会上传聊天记录、手机号或微信本地数据库。</small>
            </span>
          </div>
          <div className="sync-preview-toolbar">
            <span>
              识别到 {syncPreview.length} 位，已选择 {selectedSyncNames.length}{" "}
              位
            </span>
            <div>
              <button
                onClick={() =>
                  setSelectedSyncNames(syncPreview.map((item) => item.name))
                }
              >
                全选
              </button>
              <button onClick={() => setSelectedSyncNames([])}>清空</button>
            </div>
          </div>
          <div className="sync-preview-list">
            {syncPreview.map((item) => (
              <label key={item.name}>
                <input
                  type="checkbox"
                  checked={selectedSyncNames.includes(item.name)}
                  onChange={(e) =>
                    setSelectedSyncNames((current) =>
                      e.target.checked
                        ? [...current, item.name]
                        : current.filter((name) => name !== item.name),
                    )
                  }
                />
                <span className="contact-avatar">{item.name.slice(0, 1)}</span>
                <strong>{item.name}</strong>
                <small>{Math.round(item.confidence * 100)}% 识别可信度</small>
              </label>
            ))}
          </div>
          <div className="modal-actions">
            <button onClick={() => setSyncDialog(false)}>取消</button>
            <button
              className="primary-action"
              disabled={saving || !selectedSyncNames.length}
              onClick={confirmContactImport}
            >
              {saving ? "正在导入…" : `确认导入 ${selectedSyncNames.length} 位`}
            </button>
          </div>
        </Modal>
      )}
      {editingTags && (
        <Modal
          title={`设置标签 · ${editingTags.name}`}
          onClose={() => setEditingTags(null)}
        >
          <div className="tag-choice">
            {tags.map((tag) => (
              <label key={tag.id}>
                <input
                  type="checkbox"
                  checked={selectedTags.includes(tag.id)}
                  onChange={(e) =>
                    setSelectedTags((current) =>
                      e.target.checked
                        ? [...current, tag.id]
                        : current.filter((id) => id !== tag.id),
                    )
                  }
                />
                <span style={{ borderColor: tag.color }}>{tag.name}</span>
              </label>
            ))}
          </div>
          <div className="modal-actions">
            <button onClick={() => setEditingTags(null)}>取消</button>
            <button className="primary-action" onClick={saveContactTags}>
              保存标签
            </button>
          </div>
        </Modal>
      )}
      {builder && (
        <Modal
          wide
          title={editingPlan ? `编辑${copy.nameLabel}` : copy.action}
          onClose={() => setBuilder(false)}
        >
          <div className="builder-stages">
            <span className={builderStage >= 1 ? "active" : ""}>
              1 基本设置
            </span>
            <span className={builderStage >= 2 ? "active" : ""}>
              2 目标人群
            </span>
            <span className={builderStage >= 3 ? "active" : ""}>
              3 步骤与审核
            </span>
          </div>
          {builderStage === 1 && (
            <div className="builder-body builder-basics">
              <div className="builder-stage-heading">
                <strong>先给这项任务起一个清晰的名称</strong>
                <p>名称只用于后台管理，客户不会看到。</p>
              </div>
              <label className="builder-name-field">
                <span>
                  {copy.nameLabel}
                  <em>必填</em>
                </span>
                <input
                  autoFocus
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  placeholder={copy.namePlaceholder}
                />
                <small>{copy.nameHelp}</small>
              </label>
              {module === "auto-reply" && (
                <>
                  <div className="field-pair">
                    <label>
                      策略类型
                      <select
                        value={strategy.type}
                        onChange={(e) =>
                          setStrategy({ ...strategy, type: e.target.value })
                        }
                      >
                        <option value="keyword">关键词回复</option>
                        <option value="ai">AI智能回复</option>
                        <option value="greet">新好友问候</option>
                      </select>
                    </label>
                    <label>
                      匹配方式
                      <select
                        value={strategy.matchType}
                        onChange={(e) =>
                          setStrategy({
                            ...strategy,
                            matchType: e.target.value,
                          })
                        }
                      >
                        <option value="contains">包含关键词</option>
                        <option value="exact">完全匹配</option>
                        <option value="regex">正则表达式</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    触发关键词
                    <input
                      value={strategy.keywords}
                      onChange={(e) =>
                        setStrategy({ ...strategy, keywords: e.target.value })
                      }
                      placeholder="多个关键词用逗号分隔"
                    />
                  </label>
                  <div className="field-pair">
                    <label>
                      回复方式
                      <select
                        value={strategy.replyType}
                        onChange={(e) =>
                          setStrategy({
                            ...strategy,
                            replyType: e.target.value,
                          })
                        }
                      >
                        <option value="text">固定文本</option>
                        <option value="ai">AI生成</option>
                      </select>
                    </label>
                    <label>
                      每日上限
                      <input
                        type="number"
                        value={strategy.dailyLimit}
                        onChange={(e) =>
                          setStrategy({
                            ...strategy,
                            dailyLimit: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                </>
              )}
            </div>
          )}
          {builderStage === 2 && (
            <div className="builder-body">
              <div className="target-mode-picker">
                <button
                  className={targetMode === "all" ? "active" : ""}
                  onClick={() => selectTargetMode("all")}
                >
                  <UsersRound />
                  <span>
                    <strong>全部好友</strong>
                    <small>直接覆盖当前全部联系人，无需逐个选择</small>
                  </span>
                </button>
                <button
                  className={targetMode === "tags" ? "active" : ""}
                  onClick={() => selectTargetMode("tags")}
                >
                  <Tag />
                  <span>
                    <strong>按标签选择</strong>
                    <small>选择客户标签，自动匹配标签下的好友</small>
                  </span>
                </button>
                <button
                  className={targetMode === "manual" ? "active" : ""}
                  onClick={() => selectTargetMode("manual")}
                >
                  <CheckCircle2 />
                  <span>
                    <strong>手动选择</strong>
                    <small>只在需要指定少数好友时使用</small>
                  </span>
                </button>
              </div>
              {targetMode === "all" ? (
                <div className="target-all-summary">
                  <UsersRound />
                  <span>
                    <strong>将覆盖当前全部 {contacts.length} 位好友</strong>
                    <small>以后新增的联系人在任务启动时也会自动包含。</small>
                  </span>
                </div>
              ) : (
                <>
                  <div className="target-filter-bar">
                    <label>
                      <Search />
                      <input
                        autoFocus
                        value={targetQuery}
                        onChange={(e) => setTargetQuery(e.target.value)}
                        placeholder={
                          targetMode === "tags"
                            ? "搜索标签名称…"
                            : "搜索微信昵称、备注或标签…"
                        }
                      />
                    </label>
                    {targetMode === "manual" && (
                      <select
                        aria-label="按客户标签筛选"
                        value={targetTagFilter}
                        onChange={(e) => setTargetTagFilter(e.target.value)}
                      >
                        <option value="">全部标签</option>
                        {tags.map((tag) => (
                          <option key={tag.id} value={tag.id}>
                            {tag.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      className={targetSelectedOnly ? "active" : ""}
                      onClick={() => setTargetSelectedOnly((value) => !value)}
                    >
                      <CheckCircle2 />
                      仅看已选
                    </button>
                  </div>
                  <div className="target-selection-toolbar">
                    <span>
                      {targetMode === "tags"
                        ? `已选择 ${targets.length} 个标签 · 找到 ${filteredTargetTags.length} 个`
                        : `已选择 ${targets.length} 位好友 · 找到 ${filteredTargetContacts.length} 位`}
                    </span>
                    <div>
                      <button
                        onClick={() =>
                          setTargets((current) =>
                            Array.from(
                              new Set([
                                ...current,
                                ...(targetMode === "tags"
                                  ? filteredTargetTags
                                  : filteredTargetContacts
                                ).map((item) => item.id),
                              ]),
                            ),
                          )
                        }
                      >
                        全选筛选结果
                      </button>
                      <button onClick={() => setTargets([])}>清空已选</button>
                    </div>
                  </div>
                  <div className="target-list">
                    {(targetMode === "tags"
                      ? filteredTargetTags
                      : visibleTargetContacts
                    ).map((item) => (
                      <label key={item.id}>
                        <input
                          type="checkbox"
                          checked={targets.includes(item.id)}
                          onChange={(e) =>
                            setTargets((current) =>
                              e.target.checked
                                ? Array.from(new Set([...current, item.id]))
                                : current.filter((id) => id !== item.id),
                            )
                          }
                        />
                        <span>
                          <strong>{item.name}</strong>
                          {"remark" in item && (
                            <small>
                              {item.remark ||
                                item.tags.map((tag) => tag.name).join("、") ||
                                "暂无备注"}
                            </small>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                  {targetMode === "manual" &&
                    filteredTargetContacts.length >
                      visibleTargetContacts.length && (
                      <p className="target-result-note">
                        共有 {filteredTargetContacts.length}{" "}
                        位匹配好友，当前显示前 {visibleTargetContacts.length}{" "}
                        位；继续输入昵称或备注可快速缩小范围。
                      </p>
                    )}
                  {(targetMode === "tags"
                    ? filteredTargetTags
                    : filteredTargetContacts
                  ).length === 0 && (
                    <p className="builder-hint">
                      没有找到匹配的{targetMode === "tags" ? "标签" : "好友"}
                      ，请更换关键词或筛选条件。
                    </p>
                  )}
                </>
              )}
            </div>
          )}
          {builderStage === 3 && (
            <div className="builder-body">
              {module !== "moments" && (
                <section className="ai-context-config">
                  <header>
                    <div>
                      <strong>客户上下文与 AI</strong>
                      <small>
                        让每条消息结合当前客户，而不是把同一句话群发给所有人
                      </small>
                    </div>
                    <Sparkles />
                  </header>
                  <div className="field-pair">
                    <label>
                      生成方式
                      <select
                        value={strategy.aiEnabled ? "ai" : "fixed"}
                        onChange={(e) => {
                          const aiEnabled = e.target.value === "ai";
                          setStrategy({
                            ...strategy,
                            aiEnabled,
                            replyType:
                              module === "auto-reply"
                                ? aiEnabled
                                  ? "ai"
                                  : "fixed"
                                : strategy.replyType,
                          });
                        }}
                      >
                        <option value="ai">AI 结合客户上下文生成</option>
                        <option value="fixed">固定内容</option>
                      </select>
                    </label>
                    <label>
                      回复角色
                      <select
                        value={strategy.expertRole}
                        disabled={!strategy.aiEnabled}
                        onChange={(e) =>
                          setStrategy({
                            ...strategy,
                            expertRole: e.target.value,
                          })
                        }
                      >
                        <option value="private">私域运营顾问</option>
                        <option value="sales">销售顾问</option>
                        <option value="service">客服顾问</option>
                        <option value="success">客户成功顾问</option>
                      </select>
                    </label>
                  </div>
                  {strategy.aiEnabled && (
                    <>
                      <div className="context-source-row">
                        <label>
                          <input
                            type="checkbox"
                            checked={strategy.useKnowledge}
                            onChange={(e) =>
                              setStrategy({
                                ...strategy,
                                useKnowledge: e.target.checked,
                              })
                            }
                          />
                          <span>
                            <strong>企业知识库</strong>
                            <small>产品、价格、FAQ和政策</small>
                          </span>
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={strategy.useCustomerData}
                            onChange={(e) =>
                              setStrategy({
                                ...strategy,
                                useCustomerData: e.target.checked,
                              })
                            }
                          />
                          <span>
                            <strong>客户数据库</strong>
                            <small>备注、标签和跟进记录</small>
                          </span>
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={strategy.useChatHistory}
                            onChange={(e) =>
                              setStrategy({
                                ...strategy,
                                useChatHistory: e.target.checked,
                              })
                            }
                          />
                          <span>
                            <strong>最近聊天记录</strong>
                            <small>从当前会话读取可见文字</small>
                          </span>
                        </label>
                      </div>
                      <div className="field-pair">
                        <label>
                          读取聊天数量
                          <select
                            value={strategy.historyLimit}
                            disabled={!strategy.useChatHistory}
                            onChange={(e) =>
                              setStrategy({
                                ...strategy,
                                historyLimit: Number(e.target.value),
                              })
                            }
                          >
                            <option value={30}>最近30条</option>
                            <option value={40}>最近40条（推荐）</option>
                            <option value={50}>最近50条</option>
                          </select>
                        </label>
                        <label>
                          智能程度
                          <select
                            value={strategy.modelTier}
                            onChange={(e) =>
                              setStrategy({
                                ...strategy,
                                modelTier: e.target.value,
                              })
                            }
                          >
                            <option value="fast">快速</option>
                            <option value="smart">智能（推荐）</option>
                            <option value="quality">高质量</option>
                          </select>
                        </label>
                      </div>
                      <label>
                        本次业务补充
                        <textarea
                          value={strategy.businessContext}
                          onChange={(e) =>
                            setStrategy({
                              ...strategy,
                              businessContext: e.target.value,
                            })
                          }
                          placeholder="例如：本周主推企业版，未确认预算前不要直接报价；不能承诺的内容要明确说明。"
                        />
                      </label>
                      <p className="context-privacy-note">
                        <ShieldCheck />
                        屏幕截图只在客户电脑本地临时用于文字识别，识别后删除；不会直接读取或破解微信数据库。
                      </p>
                    </>
                  )}
                </section>
              )}
              {module === "auto-reply" ? (
                <>
                  <label>
                    {strategy.replyType === "ai" ? "AI回复要求" : "回复内容"}
                    <textarea
                      value={
                        strategy.replyType === "ai"
                          ? strategy.aiPrompt
                          : steps[0]?.content || ""
                      }
                      onChange={(e) =>
                        strategy.replyType === "ai"
                          ? setStrategy({
                              ...strategy,
                              aiPrompt: e.target.value,
                            })
                          : setSteps([{ ...steps[0], content: e.target.value }])
                      }
                      placeholder="输入回复内容或AI角色、语气和边界…"
                    />
                  </label>
                  <div className="field-pair">
                    <label>
                      最短延迟（秒）
                      <input
                        type="number"
                        value={strategy.delayMin}
                        onChange={(e) =>
                          setStrategy({
                            ...strategy,
                            delayMin: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      最长延迟（秒）
                      <input
                        type="number"
                        value={strategy.delayMax}
                        onChange={(e) =>
                          setStrategy({
                            ...strategy,
                            delayMax: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <label className="approval-switch">
                    <input
                      type="checkbox"
                      checked={strategy.approval}
                      onChange={(e) =>
                        setStrategy({ ...strategy, approval: e.target.checked })
                      }
                    />
                    <span>
                      <strong>AI回复先人工审核</strong>
                      <small>建议正式稳定前保持开启</small>
                    </span>
                  </label>
                </>
              ) : (
                <div className="step-builder">
                  {steps.map((step, index) => (
                    <article key={index}>
                      <span>{index + 1}</span>
                      <div>
                        <div className="field-pair">
                          <label>
                            动作
                            <select
                              value={step.action}
                              onChange={(e) =>
                                setSteps((current) =>
                                  current.map((s, i) =>
                                    i === index
                                      ? { ...s, action: e.target.value }
                                      : s,
                                  ),
                                )
                              }
                            >
                              <option
                                value={
                                  module === "moments"
                                    ? "moments_publish"
                                    : "message"
                                }
                              >
                                {module === "moments"
                                  ? "发布朋友圈"
                                  : "发送微信消息"}
                              </option>
                              <option value="wait">仅等待</option>
                            </select>
                          </label>
                          <label>
                            延迟分钟
                            <input
                              type="number"
                              min="0"
                              value={step.delayMinutes}
                              onChange={(e) =>
                                setSteps((current) =>
                                  current.map((s, i) =>
                                    i === index
                                      ? {
                                          ...s,
                                          delayMinutes: Number(e.target.value),
                                        }
                                      : s,
                                  ),
                                )
                              }
                            />
                          </label>
                        </div>
                        <label>
                          {strategy.aiEnabled ? "这一步的 AI 目标" : "固定消息内容"}
                          <textarea
                            value={step.content}
                            onChange={(e) =>
                              setSteps((current) =>
                                current.map((s, i) =>
                                  i === index
                                    ? { ...s, content: e.target.value }
                                    : s,
                                ),
                              )
                            }
                            placeholder={
                              strategy.aiEnabled
                                ? "例如：根据当前聊天确认客户需求，自然推进预约演示，不编造价格和承诺"
                                : "输入要原样放入微信的消息"
                            }
                          />
                        </label>
                      </div>
                      {steps.length > 1 && (
                        <button
                          onClick={() =>
                            setSteps((current) =>
                                  current.filter((_, i) => i !== index),
                            )
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </article>
                  ))}
                  <button
                    className="add-step"
                    onClick={() =>
                      setSteps((current) => [...current, emptyStep()])
                    }
                  >
                    <Plus size={15} />
                    添加下一步
                  </button>
                  <label className="approval-switch">
                    <input
                      type="checkbox"
                      checked={strategy.approval}
                      onChange={(e) =>
                        setStrategy({ ...strategy, approval: e.target.checked })
                      }
                    />
                    <span>
                      <strong>每步执行前人工审核</strong>
                      <small>关闭后将按计划自动交给电脑助手</small>
                    </span>
                  </label>
                </div>
              )}
            </div>
          )}
          <div className="modal-actions">
            <button
              onClick={() =>
                builderStage === 1
                  ? setBuilder(false)
                  : setBuilderStage((stage) => stage - 1)
              }
            >
              {builderStage === 1 ? "取消" : "上一步"}
            </button>
            {builderStage < 3 ? (
              <button
                className="primary-action"
                onClick={() => setBuilderStage((stage) => stage + 1)}
              >
                下一步
              </button>
            ) : (
              <button
                className="primary-action"
                disabled={saving}
                onClick={savePlan}
              >
                {saving ? "保存中…" : "保存方案"}
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

function Empty({
  icon,
  title,
  text,
  action,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="records-empty">
      {icon}
      <strong>{title}</strong>
      <p>{text}</p>
      {action && <button onClick={onAction}>{action}</button>}
    </div>
  );
}
function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div>
      <span>{icon}</span>
      <strong>{value}</strong>
      <small>{label}</small>
    </div>
  );
}
function Modal({
  title,
  onClose,
  wide = false,
  children,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <ModalPortal>
      <div
        className="record-dialog-backdrop"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className={`private-modal ${wide ? "wide" : ""}`}>
          <header>
            <h3>{title}</h3>
            <button onClick={onClose}>
              <X />
            </button>
          </header>
          {children}
        </div>
      </div>
    </ModalPortal>
  );
}
