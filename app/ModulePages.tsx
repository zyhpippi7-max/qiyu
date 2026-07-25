"use client";

import {
  Activity,
  Bot,
  CheckCircle2,
  ChevronRight,
  CirclePlay,
  Clock3,
  Cloud,
  Download,
  Film,
  Folder,
  HardDrive,
  Image as ImageIcon,
  Laptop,
  MessageCircle,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Square,
  Upload,
  UsersRound,
  WandSparkles,
  Workflow,
  XCircle,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PrivateDomain } from "./PrivateDomain";
import { Acquisition } from "./Acquisition";
import { EcommerceStudio } from "./EcommerceStudio";
import { AIExperts } from "./AIExperts";
import { AccountBinding, AgentChat, AnalyticsPage, CreationCenter, LocalFileManager, SettingsStatus, TaskMonitor, WorkflowStudio } from "./ProductModules";
import { VideoEditor } from "./VideoEditor";
import { AIEmployee, ContractCenter, DeferredBilling, KnowledgeBase, PlatformOperations } from "./OperationalModules";
import { ModalPortal } from "./ModalPortal";

type Props = {
  page: string;
  notify: (message: string) => void;
};

type ProductRecord = {
  id: number;
  module: string;
  title: string;
  description: string;
  status: string;
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

type AutomationDevice = {
  id: number; deviceId: string; name: string; platform: string; version: string;
  online: boolean; lastSeenAt: string; capabilities: string[];
};

type AutomationJob = {
  id: number; deviceId?: string; type: string; status: string; progress: number;
  result: Record<string, unknown>; error: string; createdAt: string;
};

const platformAccounts = [
  { platform: "抖音", name: "奇遇AI产品号", color: "#191919", status: "登录正常", fans: "12.8万" },
  { platform: "小红书", name: "奇遇生活研究所", color: "#ff2948", status: "登录正常", fans: "3.6万" },
  { platform: "快手", name: "奇遇智能科技", color: "#ff6a22", status: "需要验证", fans: "8,920" },
  { platform: "视频号", name: "奇遇AI", color: "#20b26b", status: "登录正常", fans: "2.1万" },
];

function PageHeader({ eyebrow, title, desc, action, onAction }: { eyebrow: string; title: string; desc: string; action: string; onAction: () => void }) {
  return (
    <div className="module-header">
      <div><span>{eyebrow}</span><h2>{title}</h2><p>{desc}</p></div>
      <button className="primary-action" onClick={onAction}><Plus size={16} />{action}</button>
    </div>
  );
}

function VideoDirector({ notify }: Pick<Props, "notify">) {
  const steps = ["创意策划", "脚本", "故事分镜", "关键帧", "视频生成", "配音字幕", "合成审核"];
  return (
    <div className="module-page">
      <PageHeader eyebrow="AI VIDEO DIRECTOR" title="AI 视频导演" desc="从一句话到完整成片，让AI负责策划、分镜、生成与合成。" action="创建视频项目" onAction={() => notify("已打开视频项目创建流程：下一步填写主题、平台和成片时长。")}/>
      <div className="director-grid">
        <section className="director-create dark-panel">
          <div className="director-glow" />
          <span className="small-kicker"><Sparkles size={14} />智能导演模式</span>
          <h3>描述你想创作的视频</h3>
          <p>奇遇AI会自动判断文生视频、图生视频或分镜关键帧方案。</p>
          <textarea defaultValue="为一款智能办公产品制作30秒竖屏宣传视频，风格高级、未来感，突出节省时间。" />
          <div className="director-options">
            <button className="selected">短视频广告</button><button>剧情短片</button><button>口播视频</button><button>自定义</button>
          </div>
          <button className="director-start" onClick={() => notify("导演任务已创建，将先生成脚本和分镜供你确认。")}>开始智能创作 <ChevronRight size={16}/></button>
        </section>
        <section className="pipeline-card panel">
          <div className="panel-heading"><div><h3>标准创作流程</h3><p>每一步都可以暂停、修改和重新生成</p></div><Workflow size={20}/></div>
          <div className="pipeline-list">
            {steps.map((step, index) => <div key={step} className={index < 3 ? "done" : index === 3 ? "active" : ""}><i>{index < 3 ? <CheckCircle2 size={14}/> : index + 1}</i><span><strong>{step}</strong><small>{index < 3 ? "已完成" : index === 3 ? "等待确认" : "尚未开始"}</small></span>{index === 3 && <button onClick={() => notify("正在打开关键帧审核页面。")}>审核</button>}</div>)}
          </div>
        </section>
      </div>
      <section className="module-section">
        <div className="section-title"><div><h3>最近项目</h3><p>继续编辑或查看生成结果</p></div><button>查看全部 <ChevronRight size={15}/></button></div>
        <div className="project-grid">
          {[
            ["夏季新品发布片", "Seedance 2.0 · 9:16", "72%", "shot-a"],
            ["企业服务品牌片", "图生视频 · 16:9", "100%", "shot-b"],
            ["咖啡馆治愈短片", "故事分镜 · 9:16", "35%", "shot-c"],
          ].map((project) => <button className="project-card" key={project[0]} onClick={() => notify(`已打开项目：${project[0]}`)}><span className={`project-cover ${project[3]}`}><CirclePlay size={28}/><em>{project[2]}</em></span><span className="project-info"><strong>{project[0]}</strong><small>{project[1]}</small></span><MoreHorizontal size={17}/></button>)}
        </div>
      </section>
    </div>
  );
}

function MediaLibrary({ notify }: Pick<Props, "notify">) {
  const assets = [
    ["产品展示-正面.mp4", "视频 · 38.2 MB", "asset-one", Film],
    ["办公场景-团队.jpg", "图片 · 4.6 MB", "asset-two", ImageIcon],
    ["品牌片段-城市.mp4", "视频 · 92.1 MB", "asset-three", Film],
    ["AI生成分镜-06.png", "图片 · 3.1 MB", "asset-four", ImageIcon],
    ["旁白-专业女声.wav", "音频 · 8.4 MB", "asset-five", Activity],
    ["新品KV-竖版.png", "图片 · 6.2 MB", "asset-six", ImageIcon],
  ];
  return <div className="module-page">
    <PageHeader eyebrow="MEDIA LIBRARY" title="素材中心" desc="统一管理视频、图片、音频、分镜与AI生成内容。" action="上传素材" onAction={() => notify("上传面板已准备：后端接通后支持分片上传到OSS/COS。")}/>
    <div className="library-toolbar panel"><div className="search-box"><Search size={16}/><input placeholder="搜索文件名、标签或项目…"/></div><div><button className="filter-active">全部</button><button>视频</button><button>图片</button><button>音频</button><button>AI生成</button></div><button className="outline-action" onClick={() => notify("正在同步云端素材目录。") }><RefreshCw size={14}/>同步存储</button></div>
    <div className="folder-grid">
      {[["产品素材", "126 个文件", "violet"], ["AI生成内容", "48 个文件", "blue"], ["背景音乐", "32 个文件", "pink"], ["品牌资产", "19 个文件", "amber"]].map(folder => <button className="folder-card" key={folder[0]}><span className={folder[2]}><Folder size={21} fill="currentColor"/></span><strong>{folder[0]}</strong><small>{folder[1]}</small><MoreHorizontal size={16}/></button>)}
    </div>
    <section className="module-section"><div className="section-title"><div><h3>最近素材</h3><p>共 225 个文件 · 已使用 18.6 GB</p></div><button>批量管理</button></div>
      <div className="asset-grid">{assets.map(asset => {const Icon=asset[3] as typeof Film; return <button className="asset-card" key={asset[0]} onClick={() => notify(`正在预览：${asset[0]}`)}><span className={`asset-preview ${asset[2]}`}><Icon size={22}/><i>预览</i></span><span><strong>{asset[0]}</strong><small>{asset[1]}</small></span><MoreHorizontal size={16}/></button>})}</div>
    </section>
  </div>;
}

function SopCenter({ notify }: Pick<Props, "notify">) {
  const templates = [
    ["七天客户跟进", "新客户加入后，按时间自动触达", MessageCircle, "violet"],
    ["内容生成与发布", "每天生成内容并提交人工审核", WandSparkles, "blue"],
    ["评论区线索整理", "收集符合条件的公开互动线索", UsersRound, "pink"],
  ];
  return <div className="module-page">
    <PageHeader eyebrow="AUTOMATION STUDIO" title="自动化 SOP" desc="把重复工作编排成可审核、可重试、可追踪的自动流程。" action="新建 SOP" onAction={() => notify("已进入可视化SOP创建器。")}/>
    <div className="sop-templates">{templates.map(row => {const Icon=row[2] as typeof Workflow; return <button key={row[0] as string} className="sop-card" onClick={() => notify(`已选择模板：${row[0]}`)}><span className={`sop-icon ${row[3]}`}><Icon size={21}/></span><strong>{row[0]}</strong><p>{row[1]}</p><span className="use-template">使用模板 <ChevronRight size={14}/></span></button>})}</div>
    <section className="panel workflow-table"><div className="panel-heading"><div><h3>运行中的 SOP</h3><p>任务由服务器调度，在线电脑负责执行</p></div><button className="outline-action"><Settings2 size={14}/>运行规则</button></div>
      {[ ["每日品牌内容生产", "每天 09:00", "办公室电脑", "今日已完成", "success"], ["新客户七天跟进", "新增客户触发", "微信助手", "运行中 · 第3步", "running"], ["短视频矩阵发布", "周一至周五 18:30", "运营电脑", "等待审核", "waiting"] ].map(row => <div className="workflow-row" key={row[0]}><span className={`workflow-status ${row[4]}`}><Workflow size={16}/></span><span><strong>{row[0]}</strong><small>{row[1]}</small></span><span><small>执行设备</small><strong>{row[2]}</strong></span><em className={row[4]}>{row[3]}</em><button><MoreHorizontal size={17}/></button></div>)}
    </section>
  </div>;
}

function Devices({ notify }: Pick<Props, "notify">) {
  return <div className="module-page">
    <PageHeader eyebrow="DESKTOP EXECUTORS" title="电脑设备" desc="管理奇遇AI自动化助手、运行能力和远程任务。" action="绑定新设备" onAction={() => notify("设备绑定码已生成：QY-2026-0715，有效期10分钟。")}/>
    <div className="device-stats"><div><Laptop/><span><strong>2</strong><small>在线设备</small></span></div><div><Activity/><span><strong>1</strong><small>正在执行</small></span></div><div><ShieldCheck/><span><strong>1.3.54</strong><small>最新客户端</small></span></div><div><Clock3/><span><strong>38h</strong><small>本周运行</small></span></div></div>
    <div className="device-list-large">
      {[ ["办公室电脑", "Windows 11 · 上海", "正在发布到小红书", "online", "62%"], ["视频工作站", "Windows 11 · 成都", "空闲，等待任务", "online", "0%"], ["备用云电脑", "Windows Server · 北京", "离线 2 小时", "offline", "0%"] ].map(row => <article className="device-large panel" key={row[0]}><div className={`computer-visual ${row[3]}`}><Laptop size={30}/><i/></div><div className="device-detail"><div><strong>{row[0]}</strong><em className={row[3]}>{row[3] === "online" ? "在线" : "离线"}</em></div><small>{row[1]}</small><p>{row[2]}</p>{row[4] !== "0%" && <div className="device-progress"><i style={{width:row[4]}}/><span>{row[4]}</span></div>}<div className="capability-tags"><span>视频发布</span><span>微信</span><span>浏览器</span><span>截图</span></div></div><div className="device-actions"><button onClick={() => notify(`已向${row[0]}发送截图指令。`)}><Smartphone size={15}/>截图</button><button onClick={() => notify(`正在查看${row[0]}的运行日志。`)}><Activity size={15}/>日志</button><button><MoreHorizontal size={17}/></button></div></article>)}
    </div>
  </div>;
}

function Accounts({ notify }: Pick<Props, "notify">) {
  return <div className="module-page">
    <PageHeader eyebrow="SOCIAL ACCOUNTS" title="平台账号" desc="账号扫码登录在本地电脑保存，服务器只记录状态和任务归属。" action="绑定平台账号" onAction={() => notify("请选择平台和执行电脑，然后在电脑端扫码登录。")}/>
    <div className="account-summary panel"><div><strong>8</strong><small>已绑定账号</small></div><div><strong>7</strong><small>登录正常</small></div><div><strong>4</strong><small>支持自动发布</small></div><div><strong>46.2万</strong><small>总粉丝数</small></div></div>
    <div className="account-grid">{platformAccounts.map(account => <article className="account-card panel" key={account.name}><div className="platform-logo" style={{background:account.color}}>{account.platform.slice(0,1)}</div><div className="account-main"><span>{account.platform}</span><strong>{account.name}</strong><small>粉丝 {account.fans}</small></div><em className={account.status === "登录正常" ? "success" : "warning"}>{account.status}</em><button onClick={() => notify(`正在检查${account.name}的登录状态。`)}><RefreshCw size={15}/></button><div className="account-footer"><span>绑定设备：办公室电脑</span><button>账号设置 <ChevronRight size={14}/></button></div></article>)}</div>
  </div>;
}

function TaskCenter({ notify }: Pick<Props, "notify">) {
  const rows = [
    ["夏季新品短视频", "AI视频导演", "正在生成镜头 6/8", "72%", "running"],
    ["小红书矩阵发布", "自动化发布", "正在上传视频", "44%", "running"],
    ["七天客户跟进", "微信SOP", "等待明日执行", "3/7", "waiting"],
    ["品牌海报生成", "GPT Image 2", "已完成", "4张", "success"],
    ["昨日抖音发布", "自动化发布", "登录状态失效", "失败", "failed"],
  ];
  return <div className="module-page">
    <PageHeader eyebrow="TASK CONTROL" title="任务中心" desc="统一查看AI生成、视频处理和电脑自动执行任务。" action="创建任务" onAction={() => notify("可以从AI指挥中心用自然语言创建任务。")}/>
    <div className="task-summary">{[["运行中","2",Activity,"violet"],["等待中","6",Clock3,"blue"],["今日完成","18",CheckCircle2,"green"],["需要处理","1",XCircle,"red"]].map(row=>{const Icon=row[2] as typeof Activity;return <div className="summary-card" key={row[0] as string}><span className={row[3] as string}><Icon size={18}/></span><div><strong>{row[1]}</strong><small>{row[0]}</small></div></div>})}</div>
    <section className="panel task-table"><div className="library-toolbar embedded"><div className="search-box"><Search size={15}/><input placeholder="搜索任务…"/></div><div><button className="filter-active">全部</button><button>AI生成</button><button>自动执行</button><button>失败</button></div></div>
      {rows.map(row => <button className="task-table-row" key={row[0]} onClick={() => notify(`正在打开任务：${row[0]}`)}><span className={`task-type-icon ${row[4]}`}>{row[1] === "AI视频导演" ? <Film size={17}/> : row[1] === "微信SOP" ? <MessageCircle size={17}/> : <Bot size={17}/>}</span><span><strong>{row[0]}</strong><small>{row[1]}</small></span><span className="task-stage">{row[2]}</span><em className={row[4]}>{row[3]}</em><ChevronRight size={16}/></button>)}
    </section>
  </div>;
}

const featureMeta: Record<string, { eyebrow: string; title: string; desc: string; action: string; icon: typeof Bot; stats: string[] }> = {
  video: { eyebrow: "VIDEO CREATION", title: "视频剪辑", desc: "创建剪辑项目，管理素材、脚本、镜头、配音、字幕和导出任务。", action: "新建剪辑项目", icon: Film, stats: [] },
  media: { eyebrow: "MEDIA LIBRARY", title: "素材库", desc: "上传和管理视频、图片、音频、文档及AI生成素材。", action: "上传素材", icon: Folder, stats: [] },
  tasks: { eyebrow: "TASK MONITOR", title: "任务监控", desc: "查看AI生成、视频处理和桌面自动化任务的真实执行状态。", action: "创建任务", icon: Activity, stats: [] },
  devices: { eyebrow: "DEVICE MANAGER", title: "设备管理", desc: "绑定桌面自动化助手，管理设备能力、在线状态和执行权限。", action: "绑定设备", icon: Laptop, stats: [] },
  accounts: { eyebrow: "ACCOUNT BINDING", title: "账号绑定", desc: "管理各平台账号与执行设备的绑定关系和登录状态。", action: "绑定账号", icon: UsersRound, stats: [] },
  analytics: { eyebrow: "DATA ANALYTICS", title: "数据分析", desc: "汇总内容生产、发布转化、账号增长和自动化执行效果。", action: "创建数据看板", icon: Activity, stats: ["今日触达 12.6万", "内容转化 8.4%", "新增线索 286"] },
  "agent-chat": { eyebrow: "AI AGENT", title: "智能体", desc: "为不同业务创建可以调用知识、工具和工作流的专属智能体。", action: "创建智能体", icon: Bot, stats: ["已创建 6 个", "今日对话 328", "知识命中 91%"] },
  "ai-employee": { eyebrow: "AI EMPLOYEE", title: "AI 员工", desc: "配置岗位目标、工作时间、审批规则与自动执行任务。", action: "招聘 AI 员工", icon: UsersRound, stats: ["在岗 4 位", "执行中 12 项", "本周节省 38h"] },
  "local-files": { eyebrow: "LOCAL FILES", title: "本地文件", desc: "通过桌面助手读取已授权的本地素材目录，并同步到创作任务。", action: "连接本地目录", icon: Folder, stats: ["已连接 2 台设备", "本地素材 1,286", "待同步 24"] },
  "image-generate": { eyebrow: "GPT IMAGE 2", title: "GPT Image 2 生图", desc: "生成营销海报、商品图、封面和视频分镜关键帧。", action: "开始生成图片", icon: ImageIcon, stats: ["今日生成 48 张", "高清任务 6 个", "成功率 98%"] },
  ecommerce: { eyebrow: "E-COMMERCE STUDIO", title: "电商生图中心", desc: "批量完成白底图、场景图、模特换装、主图和详情页设计。", action: "创建商品项目", icon: WandSparkles, stats: ["商品项目 18 个", "待处理 SKU 42", "已生成 326 张"] },
  gallery: { eyebrow: "VIDEO GALLERY", title: "作品库", desc: "查看视频剪辑、AI生成和本地上传的全部成片作品。", action: "上传作品", icon: Film, stats: ["作品总数 126", "本周新增 18", "云端占用 26GB"] },
  "ai-expert": { eyebrow: "AI EXPERT", title: "AI 专家", desc: "创建客服、销售、内容、营销和运营等专业数字角色。", action: "新建 AI 专家", icon: Sparkles, stats: ["专家 8 位", "今日调用 1,204", "满意度 94%"] },
  knowledge: { eyebrow: "KNOWLEDGE BASE", title: "知识库", desc: "管理产品资料、话术模板、常见问题和企业知识文档。", action: "新建知识库", icon: Cloud, stats: ["知识条目 2,846", "今日命中 892", "待解析文件 3"] },
  acquisition: { eyebrow: "PUBLIC ACQUISITION", title: "公域获客", desc: "配置公开渠道的内容线索发现、筛选、去重和人工审核。", action: "新建获客任务", icon: Search, stats: ["今日发现 386", "有效线索 72", "待审核 19"] },
  activation: { eyebrow: "ACTIVE ACTIVATION", title: "主动激活", desc: "对已授权客户分组执行合规的激活、跟进和回访计划。", action: "创建激活计划", icon: Zap, stats: ["计划 6 个", "今日触达 128", "回复率 32%"] },
  moments: { eyebrow: "MOMENTS MARKETING", title: "朋友圈营销", desc: "编排朋友圈内容、素材、发布时间和电脑端自动执行。", action: "创建发布计划", icon: ImageIcon, stats: ["待发布 12 条", "在线账号 5 个", "本周完成 48"] },
  "wechat-message": { eyebrow: "WECHAT MESSAGE", title: "微信消息", desc: "在授权设备上统一查看待处理会话、标签与跟进状态。", action: "创建消息任务", icon: MessageCircle, stats: ["待处理 28", "今日回复 186", "平均响应 42秒"] },
  "auto-reply": { eyebrow: "AUTO REPLY", title: "自动回复", desc: "配置关键词、知识库和AI专家驱动的自动回复策略。", action: "新建回复策略", icon: Send, stats: ["启用策略 18", "今日回复 326", "知识命中 89%"] },
  "card-redeem": { eyebrow: "CARD REDEEM", title: "卡密兑换", desc: "兑换套餐、设备时长或AI服务额度，并查看兑换记录。", action: "兑换卡密", icon: Download, stats: ["当前专业版", "设备额度 3 台", "有效期 286 天"] },
  "ai-recharge": { eyebrow: "AI BALANCE", title: "AI 充值", desc: "统一查看文本、图片、视频和语音模型的额度与用量。", action: "充值 AI 额度", icon: Zap, stats: ["可用余额 ¥2,680", "本月消耗 ¥486", "预计可用 42天"] },
  bookkeeping: { eyebrow: "BOOKKEEPING", title: "记账报税", desc: "企业票据、收支、申报事项和服务进度的统一入口。", action: "添加企业", icon: ShieldCheck, stats: ["本月票据 126", "待确认 8 项", "申报进度正常"] },
  enterprise: { eyebrow: "ENTERPRISE CENTER", title: "企业中心", desc: "管理企业资料、成员、套餐、合同和服务授权。", action: "添加企业主体", icon: UsersRound, stats: ["企业主体 2 个", "团队成员 8 位", "有效合同 3 份"] },
  settings: { eyebrow: "SYSTEM SETTINGS", title: "设置", desc: "管理模型接口、存储、通知、安全策略与自动化权限。", action: "保存配置", icon: Settings2, stats: ["模型接口正常", "存储连接正常", "2 台设备在线"] },
  "public-exposure": { eyebrow: "PLATFORM OPERATIONS", title: "平台运营", desc: "管理合规的内容浏览、发布和人工确认任务，不执行无差别互动。", action: "新建运营任务", icon: Activity, stats: [] },
  "smart-broadcast": { eyebrow: "SMART BROADCAST", title: "智能群发", desc: "按联系人或标签选择人群，生成内容、预览并受控发送。", action: "新建群发任务", icon: Send, stats: [] },
  "wechat-sop": { eyebrow: "WECHAT SOP", title: "微信 SOP", desc: "把客户跟进拆成多步骤、可暂停、可审核的执行流程。", action: "新建微信 SOP", icon: Workflow, stats: [] },
  "wechat-tags": { eyebrow: "WECHAT TAGS", title: "客户标签", desc: "管理微信联系人标签和目标人群。", action: "管理联系人", icon: UsersRound, stats: [] },
  "mobile-remote": { eyebrow: "MOBILE REMOTE", title: "移动遥控", desc: "远程查看在线电脑和任务状态，并下发受控命令。", action: "刷新设备", icon: Smartphone, stats: [] },
  "contract-center": { eyebrow: "CONTRACT CENTER", title: "合同中心", desc: "管理合同草稿、模板、AI起草内容和发送状态。", action: "新建合同", icon: ShieldCheck, stats: [] },
};

type FieldDefinition = { key: string; label: string; placeholder?: string; type?: "text" | "number" | "datetime-local" | "select" | "textarea"; options?: string[] };
const moduleFields: Record<string, FieldDefinition[]> = {
  analytics: [{ key: "range", label: "统计周期", type: "select", options: ["最近7天", "最近30天", "本季度", "自定义"] }],
  "agent-chat": [{ key: "model", label: "对话模型", placeholder: "例如 GPT-5.5" }, { key: "instruction", label: "会话目标", type: "textarea", placeholder: "说明希望智能体完成什么" }],
  "ai-employee": [{ key: "role", label: "岗位角色", type: "select", options: ["内容运营", "销售助理", "客服", "数据分析", "自定义"] }, { key: "schedule", label: "工作时间", placeholder: "例如 工作日 09:00-18:00" }],
  video: [{ key: "ratio", label: "画面比例", type: "select", options: ["9:16", "16:9", "1:1", "4:3"] }, { key: "duration", label: "目标时长（秒）", type: "number", placeholder: "30" }, { key: "brief", label: "创作要求", type: "textarea", placeholder: "主题、风格、平台和核心卖点" }],
  "local-files": [{ key: "device", label: "执行设备", placeholder: "选择或填写设备名称" }, { key: "path", label: "授权目录", placeholder: "由桌面助手选择本地目录" }],
  "image-generate": [{ key: "model", label: "图片模型", type: "select", options: ["GPT Image 2", "自定义模型"] }, { key: "size", label: "画面比例", type: "select", options: ["1:1 方形", "3:4 竖版", "4:3 横版", "4:5 社媒竖图", "5:4 商品横图", "9:16 手机竖屏", "16:9 视频横屏"] }, { key: "prompt", label: "生成提示词", type: "textarea", placeholder: "描述主体、场景、构图、光线和文字要求" }],
  ecommerce: [{ key: "sku", label: "商品/SKU", placeholder: "商品名称或SKU" }, { key: "output", label: "生成类型", type: "select", options: ["白底主图", "场景图", "模特换装", "详情页", "批量套图"] }],
  "ai-expert": [{ key: "role", label: "专家角色", type: "select", options: ["客服专家", "销售专家", "内容专家", "营销专家", "自定义"] }, { key: "model", label: "模型", placeholder: "例如 GPT-5.5" }, { key: "prompt", label: "专家指令", type: "textarea", placeholder: "职责、知识边界和回复要求" }],
  knowledge: [{ key: "category", label: "知识类型", type: "select", options: ["产品资料", "话术模板", "常见问题", "政策规则", "其他"] }, { key: "content", label: "知识内容", type: "textarea", placeholder: "输入知识正文，文件上传将在素材能力中完成" }],
  acquisition: [{ key: "platform", label: "目标平台", type: "select", options: ["抖音", "小红书", "快手", "视频号", "自定义"] }, { key: "keywords", label: "搜索关键词", placeholder: "多个关键词用逗号分隔" }],
  activation: [{ key: "group", label: "客户分组", placeholder: "选择已授权的客户分组" }, { key: "schedule", label: "执行时间", type: "datetime-local" }, { key: "message", label: "激活内容", type: "textarea", placeholder: "发送内容或引用话术模板" }],
  moments: [{ key: "account", label: "发布账号", placeholder: "选择已绑定微信账号" }, { key: "schedule", label: "发布时间", type: "datetime-local" }, { key: "content", label: "朋友圈文案", type: "textarea", placeholder: "输入文案，素材可从素材库选择" }],
  "wechat-message": [{ key: "contact", label: "联系人", placeholder: "填写微信昵称或备注" }, { key: "message", label: "消息内容", type: "textarea", placeholder: "输入要发送的内容" }],
  "auto-reply": [{ key: "trigger", label: "策略类型", type: "select", options: ["关键词回复", "AI回复", "新好友问候"] }, { key: "keywords", label: "触发关键词", placeholder: "多个关键词用逗号分隔" }, { key: "reply", label: "回复内容/AI要求", type: "textarea", placeholder: "填写固定回复或AI回复规则" }],
  tasks: [{ key: "type", label: "任务类型", type: "select", options: ["AI生成", "视频处理", "自动发布", "微信任务", "数据任务"] }, { key: "executor", label: "执行设备/服务", placeholder: "选择执行设备或云端服务" }],
  devices: [{ key: "code", label: "设备绑定码", placeholder: "输入桌面助手显示的绑定码" }, { key: "os", label: "操作系统", type: "select", options: ["Windows", "macOS", "Linux"] }],
  accounts: [{ key: "platform", label: "平台", type: "select", options: ["抖音", "小红书", "快手", "视频号", "微信"] }, { key: "device", label: "绑定设备", placeholder: "选择已在线设备" }],
  "card-redeem": [{ key: "code", label: "卡密", placeholder: "输入兑换卡密" }],
  bookkeeping: [{ key: "company", label: "企业名称", placeholder: "输入企业全称" }, { key: "service", label: "服务项目", type: "select", options: ["代理记账", "纳税申报", "工商服务", "其他"] }],
  enterprise: [{ key: "company", label: "企业全称", placeholder: "输入营业执照名称" }, { key: "creditCode", label: "统一社会信用代码", placeholder: "输入18位代码" }, { key: "contact", label: "联系人", placeholder: "输入联系人姓名" }],
  settings: [{ key: "baseUrl", label: "模型接口地址", placeholder: "例如 https://qiyuai.com.cn/v1" }, { key: "model", label: "默认模型", placeholder: "例如 GPT-5.5" }, { key: "storage", label: "对象存储", type: "select", options: ["奇遇AI R2", "腾讯云 COS", "阿里云 OSS"] }],
  "public-exposure": [{ key: "platform", label: "目标平台", type: "select", options: ["抖音", "小红书", "快手", "视频号"] }, { key: "task", label: "任务类型", type: "select", options: ["内容浏览", "发布内容", "查看评论", "人工互动"] }, { key: "rule", label: "执行规则", type: "textarea", placeholder: "时间、内容范围和人工审核要求" }],
  "smart-broadcast": [{ key: "target", label: "目标标签/人群", placeholder: "从微信联系人标签中选择" }, { key: "dailyLimit", label: "每日上限", type: "number", placeholder: "20" }, { key: "message", label: "消息内容", type: "textarea", placeholder: "支持先让 AI 生成再人工修改" }],
  "wechat-sop": [{ key: "target", label: "目标联系人/标签", placeholder: "选择人群" }, { key: "steps", label: "执行步骤", type: "textarea", placeholder: "例如：立即问候；1天后跟进；3天后回访" }],
  "wechat-tags": [{ key: "color", label: "标签颜色", placeholder: "例如 紫色" }, { key: "rule", label: "自动归类规则", type: "textarea", placeholder: "说明哪些联系人进入该标签" }],
  "contract-center": [{ key: "party", label: "合同相对方", placeholder: "客户或供应商名称" }, { key: "amount", label: "合同金额", type: "number", placeholder: "0" }, { key: "content", label: "主要条款", type: "textarea", placeholder: "合作内容、交付、付款、违约与争议解决" }],
};

function VideoGenerator({ notify }: Pick<Props, "notify">) {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"text" | "image">("text");
  const [ratio, setRatio] = useState("9:16");
  const [duration, setDuration] = useState(5);
  const [resolution, setResolution] = useState("720p");
  const [referenceImage, setReferenceImage] = useState("");
  const [referenceName, setReferenceName] = useState("");
  const [records, setRecords] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const referenceInput = useRef<HTMLInputElement>(null);

  const loadRecords = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch("/api/records?module=video", { cache: "no-store" });
      const data = await response.json() as { records?: ProductRecord[] };
      if (response.ok) setRecords(data.records || []);
    } finally { if (showLoading) setLoading(false); }
  };

  const syncRecord = async (record: ProductRecord) => {
    const taskId = record.metadata.taskId;
    if (!taskId || record.status !== "active") return;
    try {
      const response = await fetch(`/api/video?id=${encodeURIComponent(taskId)}&recordId=${record.id}`, { cache: "no-store" });
      const data = await response.json() as { record?: ProductRecord; error?: string };
      if (response.ok && data.record) setRecords(current => current.map(item => item.id === record.id ? data.record! : item));
    } catch { /* 下次轮询继续 */ }
  };

  useEffect(() => { loadRecords(); }, []);
  const activeTasks = records.filter(record => record.status === "active" && record.metadata.taskId).map(record => `${record.id}:${record.metadata.taskId}`).join("|");
  useEffect(() => {
    if (!activeTasks) return;
    const refresh = () => records.filter(record => record.status === "active").forEach(record => syncRecord(record));
    refresh();
    const timer = window.setInterval(refresh, 6_000);
    return () => window.clearInterval(timer);
  }, [activeTasks]);

  const chooseReference = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { notify("请选择图片文件。 "); return; }
    if (file.size > 10 * 1024 * 1024) { notify("参考图片不能超过 10MB。 "); return; }
    const reader = new FileReader();
    reader.onload = () => { setReferenceImage(String(reader.result || "")); setReferenceName(file.name); };
    reader.onerror = () => notify("参考图片读取失败。 ");
    reader.readAsDataURL(file);
  };

  const optimizePrompt = async () => {
    if (!prompt.trim()) { notify("先写一句你想拍什么，我再帮你扩成导演提示词。 "); return; }
    setOptimizing(true);
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "chat",
          model: "gpt-5.5",
          messages: [
            { role: "system", content: "你是专业AI视频导演。把用户创意改写成可直接交给Seedance 2.0的中文提示词，包含主体、场景、镜头、动作时序、光线、风格、声音和成片目标。不要解释，不要添加参数，只输出最终提示词。" },
            { role: "user", content: prompt.trim() },
          ],
        }),
      });
      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: string };
      if (!response.ok) throw new Error(data.error || "提示词优化失败");
      const result = data.choices?.[0]?.message?.content?.trim();
      if (!result) throw new Error("模型没有返回提示词");
      setPrompt(result);
      notify("AI导演已经把创意整理成可生成的视频提示词。 ");
    } catch (error) { notify(error instanceof Error ? error.message : "提示词优化失败"); }
    finally { setOptimizing(false); }
  };

  const generate = async () => {
    if (!prompt.trim()) { notify("请先描述要生成的视频。 "); return; }
    if (mode === "image" && !referenceImage) { notify("图生视频需要先上传一张参考图。 "); return; }
    setGenerating(true);
    try {
      const response = await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), ratio, duration, resolution, referenceImages: mode === "image" ? [referenceImage] : [] }),
      });
      const data = await response.json() as { record?: ProductRecord; error?: string };
      if (!response.ok || !data.record) throw new Error(data.error || "视频任务创建失败");
      setRecords(current => [data.record!, ...current]);
      notify("Seedance 2.0 已接收任务，完成后会自动保存到作品库。 ");
    } catch (error) { notify(error instanceof Error ? error.message : "视频任务创建失败"); }
    finally { setGenerating(false); }
  };

  const remove = async (record: ProductRecord) => {
    if (record.status === "active") { notify("正在生成的任务暂时不能删除。 "); return; }
    if (!window.confirm(`确定删除“${record.title}”吗？`)) return;
    const objectKey = record.metadata.objectKey;
    const response = await fetch(objectKey ? "/api/media" : "/api/records", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: record.id, module: "video", key: objectKey }),
    });
    if (response.ok) setRecords(current => current.filter(item => item.id !== record.id));
    else notify("视频删除失败，请稍后重试。 ");
  };

  const statusLabel = (record: ProductRecord) => {
    if (record.status === "completed") return "生成完成";
    if (record.status === "failed") return "生成失败";
    return ({ queued: "排队中", running: "生成中", cancelled: "已取消" }[record.metadata.arkStatus] || "任务已提交");
  };

  return <div className="module-page video-studio">
    <PageHeader eyebrow="DOUBAO SEEDANCE 2.0" title="AI 视频导演" desc="支持文生视频与图生视频，成片完成后自动保存到奇遇AI作品库。" action="创作新视频" onAction={() => document.querySelector<HTMLTextAreaElement>("#video-prompt")?.focus()}/>
    <div className="video-studio-layout">
      <section className="video-generator-panel panel">
        <div className="panel-heading"><div><h3>导演工作台</h3><p>GPT-5.5 负责提示词，Seedance 2.0 负责生成画面与原生声音</p></div><Film size={23}/></div>
        <div className="video-mode-switch"><button className={mode === "text" ? "active" : ""} onClick={() => setMode("text")}><Sparkles size={16}/>文生视频</button><button className={mode === "image" ? "active" : ""} onClick={() => setMode("image")}><ImageIcon size={16}/>图生视频</button></div>
        {mode === "image" && <div className="video-reference">
          <input ref={referenceInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={chooseReference}/>
          {referenceImage ? <><img src={referenceImage} alt="视频参考图"/><div><strong>{referenceName}</strong><small>Seedance 将参考主体、构图和风格</small><button onClick={() => { setReferenceImage(""); setReferenceName(""); }}>移除图片</button></div></> : <button onClick={() => referenceInput.current?.click()}><Upload size={22}/><span><strong>上传参考图片</strong><small>JPG、PNG、WebP，最大 10MB</small></span></button>}
        </div>}
        <label className="video-prompt-label"><span>视频创意 <button disabled={optimizing || !prompt.trim()} onClick={optimizePrompt}><WandSparkles size={15}/>{optimizing ? "AI导演整理中…" : "AI导演优化"}</button></span><textarea id="video-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="例如：一款黑色智能耳机悬浮在玻璃展台上，镜头缓慢环绕，冷蓝色电影光线，最后出现品牌标志，背景有未来感电子音乐……"/></label>
        <div className="video-option-grid"><label>画面比例<select value={ratio} onChange={event => setRatio(event.target.value)}><option>9:16</option><option>16:9</option><option>1:1</option><option>4:3</option><option>3:4</option><option>21:9</option></select></label><label>清晰度<select value={resolution} onChange={event => setResolution(event.target.value)}><option value="480p">480P · 省额度</option><option value="720p">720P · 推荐</option><option value="1080p">1080P · 高清</option></select></label><label>视频时长<select value={duration} onChange={event => setDuration(Number(event.target.value))}>{Array.from({ length: 12 }, (_, index) => index + 4).map(value => <option key={value} value={value}>{value} 秒</option>)}</select></label></div>
        <button className="video-generate-button" disabled={generating || !prompt.trim() || (mode === "image" && !referenceImage)} onClick={generate}>{generating ? <><RefreshCw className="spin" size={18}/>正在提交任务…</> : <><CirclePlay size={19}/>开始生成视频</>}</button>
        <small className="video-cost-note"><ShieldCheck size={14}/>点击后由火山方舟按实际 Token 计费；生成通常需要数分钟。</small>
      </section>
      <aside className="video-director-guide panel"><span><Workflow size={21}/></span><h3>推荐创作方式</h3><ol><li><i>1</i><div><strong>描述核心创意</strong><small>只需先写产品、场景或故事</small></div></li><li><i>2</i><div><strong>让 AI 导演优化</strong><small>自动补充镜头、动作、声音与节奏</small></div></li><li><i>3</i><div><strong>选择规格并生成</strong><small>成片会自动下载并保存</small></div></li></ol><div className="video-model-badge"><Film size={17}/><span><strong>Doubao-Seedance-2.0</strong><small>模型版本 260128</small></span></div></aside>
    </div>
    <section className="video-results panel">
      <div className="panel-heading"><div><h3>视频任务与成片</h3><p>{records.length === 0 ? "还没有视频任务" : `共 ${records.length} 个真实任务`}</p></div><button className="outline-action" onClick={() => loadRecords()}><RefreshCw size={14}/>刷新</button></div>
      {loading ? <div className="records-empty"><RefreshCw className="spin" size={25}/><strong>正在读取视频任务</strong></div> : records.length === 0 ? <div className="video-empty"><Film size={40}/><strong>创作你的第一条视频</strong><p>生成任务、实时状态和成片都会显示在这里。</p></div> : <div className="video-task-grid">{records.map(record => <article key={record.id} className={record.status}>
        <div className="video-preview">{record.status === "completed" && record.metadata.url ? <video src={record.metadata.url} controls preload="metadata"/> : <div><span className={record.status}>{record.status === "failed" ? <XCircle size={30}/> : <RefreshCw className={record.status === "active" ? "spin" : ""} size={30}/>}</span><strong>{statusLabel(record)}</strong><small>{record.status === "active" ? "页面会自动刷新进度" : record.metadata.error || "请修改提示词后重新生成"}</small></div>}</div>
        <div className="video-task-info"><span><strong>{record.title}</strong><small>{record.metadata.sourceMode === "image-to-video" ? "图生视频" : "文生视频"} · {record.metadata.ratio} · {record.metadata.duration}秒 · {record.metadata.resolution}</small></span><em className={record.status}>{statusLabel(record)}</em></div>
        <p>{record.description}</p><div className="video-task-actions">{record.metadata.url && <><a href={record.metadata.url} target="_blank" rel="noreferrer"><CirclePlay size={15}/>打开成片</a><a href={record.metadata.url} download><Download size={15}/>下载</a></>}<button disabled={record.status === "active"} onClick={() => remove(record)}><XCircle size={15}/>删除</button></div>
      </article>)}</div>}
    </section>
  </div>;
}

const imageRatioOptions = [
  { value: "1:1", name: "方形", usage: "头像 / 主图", width: 1, height: 1, apiSize: "1024x1024" },
  { value: "3:4", name: "标准竖版", usage: "海报 / 电商", width: 3, height: 4, apiSize: "1024x1536" },
  { value: "4:3", name: "标准横版", usage: "文章 / 展示", width: 4, height: 3, apiSize: "1536x1024" },
  { value: "4:5", name: "社媒竖图", usage: "小红书 / 朋友圈", width: 4, height: 5, apiSize: "1024x1536" },
  { value: "5:4", name: "商品横图", usage: "电商 / 广告", width: 5, height: 4, apiSize: "1536x1024" },
  { value: "9:16", name: "手机竖屏", usage: "短视频 / 故事", width: 9, height: 16, apiSize: "1024x1536" },
  { value: "16:9", name: "视频横屏", usage: "封面 / 大屏", width: 16, height: 9, apiSize: "1536x1024" },
] as const;

type ImageRatioOption = typeof imageRatioOptions[number];

function displayImageRatio(metadata: Record<string, string>) {
  if (metadata.aspectRatio) return metadata.aspectRatio;
  return metadata.imageSize === "1024x1536" ? "3:4" : metadata.imageSize === "1536x1024" ? "4:3" : "1:1";
}

async function cropImageToRatio(blob: Blob, option: ImageRatioOption) {
  try {
    const bitmap = await createImageBitmap(blob);
    const targetRatio = option.width / option.height;
    const sourceRatio = bitmap.width / bitmap.height;
    let sourceX = 0, sourceY = 0, sourceWidth = bitmap.width, sourceHeight = bitmap.height;
    if (sourceRatio > targetRatio) { sourceWidth = bitmap.height * targetRatio; sourceX = (bitmap.width - sourceWidth) / 2; }
    else if (sourceRatio < targetRatio) { sourceHeight = bitmap.width / targetRatio; sourceY = (bitmap.height - sourceHeight) / 2; }
    const canvas = document.createElement("canvas");
    if (targetRatio >= 1) { canvas.width = Math.round(sourceWidth); canvas.height = Math.round(canvas.width / targetRatio); }
    else { canvas.height = Math.round(sourceHeight); canvas.width = Math.round(canvas.height * targetRatio); }
    const context = canvas.getContext("2d");
    if (!context) { bitmap.close(); return blob; }
    context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise<Blob>(resolve => canvas.toBlob(result => resolve(result || blob), "image/png", .96));
  } catch { return blob; }
}

function ImageGenerator({ notify }: Pick<Props, "notify">) {
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState<ImageRatioOption["value"]>("1:1");
  const [generating, setGenerating] = useState(false);
  const [records, setRecords] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRecords = async () => {
    try {
      const response = await fetch("/api/records?module=image-generate", { cache: "no-store" });
      const data = await response.json() as { records?: ProductRecord[] };
      if (response.ok) setRecords(data.records || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadRecords(); }, []);

  const selectedRatio = imageRatioOptions.find(option => option.value === ratio) || imageRatioOptions[0];

  const persistImage = async (image: { b64_json?: string; url?: string }, index: number) => {
    const imageUrl = image.b64_json ? `data:image/png;base64,${image.b64_json}` : image.url;
    if (!imageUrl) throw new Error("模型没有返回图片数据");
    const imageResponse = await fetch(imageUrl);
    const blob = await cropImageToRatio(await imageResponse.blob(), selectedRatio);
    const formData = new FormData();
    formData.append("file", new File([blob], `qiyu-image-${Date.now()}-${index + 1}.png`, { type: blob.type || "image/png" }));
    formData.append("module", "image-generate");
    formData.append("title", prompt.trim().slice(0, 42) || "奇遇AI生成图片");
    formData.append("description", prompt.trim());
    formData.append("metadata", JSON.stringify({ model: "gpt-image-2", aspectRatio: selectedRatio.value, sourceSize: selectedRatio.apiSize, prompt: prompt.trim() }));
    const uploadResponse = await fetch("/api/media", { method: "POST", body: formData });
    const uploadData = await uploadResponse.json() as { record?: ProductRecord; error?: string };
    if (!uploadResponse.ok || !uploadData.record) throw new Error(uploadData.error || "保存图片失败");
    return uploadData.record;
  };

  const generate = async () => {
    if (!prompt.trim()) { notify("请先描述要生成的图片。"); return; }
    setGenerating(true);
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "image", model: "gpt-image-2", prompt: `${prompt.trim()}\n请按 ${selectedRatio.value} 画幅构图，主体保留安全边距以适配最终画面。`, size: selectedRatio.apiSize, n: 1 }),
      });
      const data = await response.json() as { data?: Array<{ b64_json?: string; url?: string }>; error?: string };
      if (!response.ok) throw new Error(data.error || "图片生成失败");
      const images = data.data || [];
      if (images.length === 0) throw new Error("模型没有返回图片");
      const saved = await Promise.all(images.map(persistImage));
      setRecords(current => [...saved, ...current]);
      notify("图片生成完成，已自动保存到奇遇AI作品库。");
    } catch (error) { notify(error instanceof Error ? error.message : "图片生成失败"); }
    finally { setGenerating(false); }
  };

  const remove = async (record: ProductRecord) => {
    if (!window.confirm("确定删除这张生成图片吗？")) return;
    const response = await fetch("/api/media", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: record.id, module: "image-generate", key: record.metadata.objectKey }),
    });
    if (response.ok) setRecords(current => current.filter(item => item.id !== record.id));
    else notify("删除失败，请稍后重试。");
  };

  return <div className="module-page image-studio">
    <PageHeader eyebrow="GPT IMAGE 2" title="GPT Image 2 生图" desc="输入创意描述，生成结果会自动保存到你的作品库。" action="生成新图片" onAction={() => document.querySelector<HTMLTextAreaElement>("#image-prompt")?.focus()}/>
    <div className="image-studio-layout">
      <section className="image-generator-panel panel">
        <div className="panel-heading"><div><h3>创意工作台</h3><p>使用服务器端 GPT Image 2，密钥不会发送到浏览器</p></div><WandSparkles size={22}/></div>
        <label>图片描述<textarea id="image-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="例如：为高端AI工作室设计一张竖版宣传海报，蓝紫色液态玻璃，留出中文标题区域，电影级光影……"/></label>
        <div className="image-ratio-picker"><div className="image-ratio-title"><strong>画面比例</strong><small>选择用途即可，不需要理解像素尺寸</small></div><div className="image-ratio-grid">{imageRatioOptions.map(option=><button type="button" key={option.value} className={ratio===option.value?"active":""} onClick={()=>setRatio(option.value)}><i><span style={option.width<option.height?{height:30,aspectRatio:`${option.width} / ${option.height}`}:{width:30,aspectRatio:`${option.width} / ${option.height}`}}/></i><span><strong>{option.value}</strong><small>{option.name}</small><em>{option.usage}</em></span></button>)}</div></div>
        <button className="image-generate-button" disabled={generating || !prompt.trim()} onClick={generate}>{generating ? <><RefreshCw className="spin" size={18}/>正在生成并保存…</> : <><Sparkles size={18}/>开始生成图片</>}</button>
        <small className="image-generation-note"><ShieldCheck size={14}/>生成通常需要约30—120秒，请不要重复点击。</small>
      </section>
      <section className="image-tips panel"><span><Sparkles size={19}/></span><h3>提示词建议</h3><p>写清楚主体、用途、构图、风格、光线、颜色和需要出现的文字。用于视频时，可以注明“分镜关键帧”和画面比例。</p><div><b>营销海报</b><b>商品主图</b><b>视频分镜</b><b>社媒封面</b></div></section>
    </div>
    <section className="image-results panel">
      <div className="panel-heading"><div><h3>生成作品</h3><p>{records.length === 0 ? "还没有生成图片" : `共 ${records.length} 张，全部已保存`}</p></div><button className="outline-action" onClick={loadRecords}><RefreshCw size={14}/>刷新</button></div>
      {loading ? <div className="records-empty"><RefreshCw className="spin" size={25}/><strong>正在读取作品</strong></div> : records.length === 0 ? <div className="image-empty"><ImageIcon size={38}/><strong>描述你的第一张图片</strong><p>生成结果会出现在这里，并自动进入作品库。</p></div> : <div className="generated-image-grid">{records.map(record => <article key={record.id}><a href={record.metadata.url} target="_blank" rel="noreferrer"><img src={record.metadata.url} alt={record.title}/></a><div><span><strong>{record.title}</strong><small>{record.metadata.model || "gpt-image-2"} · {displayImageRatio(record.metadata)}</small></span><a href={record.metadata.url} download><Download size={16}/></a><button onClick={() => remove(record)}><XCircle size={16}/></button></div></article>)}</div>}
    </section>
  </div>;
}

function FeatureModule({ page, notify }: Props) {
  const meta = featureMeta[page] || featureMeta.analytics;
  const Icon = meta.icon;
  const [records, setRecords] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ title: "", description: "", status: "draft" });
  const [extraForm, setExtraForm] = useState<Record<string, string>>({});
  const isFileModule = page === "media" || page === "gallery";
  const sourceModules = page === "media"
    ? ["media", "gallery", "image-generate", "ecommerce", "video", "video-gen"]
    : page === "gallery"
      ? ["gallery", "image-generate", "ecommerce", "video", "video-gen"]
      : [page];

  const loadRecords = async () => {
    setLoading(true); setError("");
    try {
      const responses = await Promise.all(sourceModules.map(module => fetch(`/api/records?module=${encodeURIComponent(module)}`, { cache: "no-store" })));
      const payloads = await Promise.all(responses.map(response => response.json() as Promise<{ records?: ProductRecord[]; error?: string }>));
      const failed = responses.findIndex(response => !response.ok);
      if (failed >= 0) throw new Error(payloads[failed]?.error || "加载失败");
      setRecords(payloads.flatMap(payload => payload.records || []).sort((a, b) =>
        new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载失败");
    } finally { setLoading(false); }
  };

  useEffect(() => { loadRecords(); }, [page]);

  const visibleRecords = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return keyword ? records.filter(record => `${record.title} ${record.description}`.toLowerCase().includes(keyword)) : records;
  }, [query, records]);

  const openCreate = () => { setEditing(null); setForm({ title: "", description: "", status: "draft" }); setExtraForm(Object.fromEntries((moduleFields[page] || []).map(field => [field.key, ""]))); setDialogOpen(true); };
  const openEdit = (record: ProductRecord) => { setEditing(record); setForm({ title: record.title, description: record.description, status: record.status }); setExtraForm(record.metadata || {}); setDialogOpen(true); };
  const saveRecord = async () => {
    if (!form.title.trim()) { notify("请输入名称后再保存。"); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/records", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editing?.id, module: page, ...form, metadata: extraForm }) });
      const data = await response.json() as { record?: ProductRecord; error?: string };
      if (!response.ok) throw new Error(data.error || "保存失败");
      setDialogOpen(false); await loadRecords(); notify(`${meta.title}记录已保存。`);
    } catch (saveError) { notify(saveError instanceof Error ? saveError.message : "保存失败"); }
    finally { setSaving(false); }
  };
  const deleteRecord = async (record: ProductRecord) => {
    if (!window.confirm(`确定删除“${record.title}”吗？`)) return;
    const objectKey = record.metadata?.objectKey;
    const response = await fetch(objectKey ? "/api/media" : "/api/records", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: record.id, module: record.module || page, key: objectKey }) });
    if (response.ok) { setRecords(current => current.filter(item => item.id !== record.id)); notify("记录已删除。"); }
    else notify("删除失败，请稍后重试。");
  };
  const uploadFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData(); body.append("file", file); body.append("module", page);
      const response = await fetch("/api/media", { method: "POST", body });
      const data = await response.json() as { record?: ProductRecord; error?: string };
      if (!response.ok) throw new Error(data.error || "上传失败");
      await loadRecords(); notify(`${file.name} 已上传。`);
    } catch (uploadError) { notify(uploadError instanceof Error ? uploadError.message : "上传失败"); }
    finally { setUploading(false); }
  };

  const activeCount = records.filter(record => record.status === "active").length;
  const completedCount = records.filter(record => record.status === "completed").length;
  return <div className="module-page">
    <PageHeader eyebrow={meta.eyebrow} title={meta.title} desc={meta.desc} action={uploading ? "上传中…" : meta.action} onAction={() => isFileModule ? fileInputRef.current?.click() : openCreate()}/>
    {isFileModule && <input ref={fileInputRef} className="hidden-file-input" type="file" accept={page === "gallery" ? "video/*" : "image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"} onChange={uploadFile}/>}
    <div className="feature-overview">
      {[["全部记录", records.length], ["运行中", activeCount], ["已完成", completedCount]].map((stat, index) => <div className="feature-stat" key={stat[0]}><span className={`feature-stat-icon tone-${index + 1}`}><Icon size={19}/></span><strong>{stat[1]}</strong><small>{stat[0]}</small></div>)}
    </div>
    <section className="records-panel panel">
      <div className="records-toolbar"><div className="search-box"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder={`搜索${meta.title}记录…`}/></div><button className="outline-action" onClick={loadRecords}><RefreshCw size={14}/>刷新</button></div>
      {loading ? <div className="records-empty"><RefreshCw className="spin" size={24}/><strong>正在加载</strong></div> : error ? <div className="records-empty error"><XCircle size={26}/><strong>暂时无法读取数据</strong><p>{error}</p><button onClick={loadRecords}>重新加载</button></div> : visibleRecords.length === 0 ? <div className="records-empty"><Icon size={32}/><strong>{query ? "没有符合条件的记录" : `还没有${meta.title}记录`}</strong><p>{query ? "请调整搜索关键词。" : `点击“${meta.action}”创建第一条真实记录。`}</p>{!query && <button onClick={() => isFileModule ? fileInputRef.current?.click() : openCreate()}>{meta.action}</button>}</div> : <div className="records-list">{visibleRecords.map(record => <article className="record-row" key={record.id}><span className="record-icon"><Icon size={18}/></span><div><strong>{record.title}</strong><p>{record.description || "暂无说明"}</p><small>{new Date(record.updatedAt || record.createdAt).toLocaleString("zh-CN")}</small></div><em className={record.status}>{record.status === "active" ? "运行中" : record.status === "completed" ? "已完成" : "草稿"}</em>{record.metadata?.url && <a className="record-preview" href={record.metadata.url} target="_blank" rel="noreferrer">预览</a>}{!isFileModule && <button onClick={() => openEdit(record)}>编辑</button>}<button className="danger" onClick={() => deleteRecord(record)}>删除</button></article>)}</div>}
    </section>
    {dialogOpen && <ModalPortal><div className="record-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setDialogOpen(false); }}><div className="record-dialog"><div className="record-dialog-title"><div><span>{editing ? "编辑记录" : meta.action}</span><h3>{meta.title}</h3></div><button onClick={() => setDialogOpen(false)}><XCircle size={21}/></button></div><label>名称<input autoFocus value={form.title} onChange={event => setForm(current => ({...current,title:event.target.value}))} placeholder={`输入${meta.title}名称`}/></label>{(moduleFields[page] || []).map(field => <label key={field.key}>{field.label}{field.type === "select" ? <select value={extraForm[field.key] || ""} onChange={event => setExtraForm(current => ({...current,[field.key]:event.target.value}))}><option value="">请选择</option>{field.options?.map(option => <option value={option} key={option}>{option}</option>)}</select> : field.type === "textarea" ? <textarea value={extraForm[field.key] || ""} onChange={event => setExtraForm(current => ({...current,[field.key]:event.target.value}))} placeholder={field.placeholder}/> : <input type={field.type || "text"} value={extraForm[field.key] || ""} onChange={event => setExtraForm(current => ({...current,[field.key]:event.target.value}))} placeholder={field.placeholder}/>}</label>)}<label>说明<textarea value={form.description} onChange={event => setForm(current => ({...current,description:event.target.value}))} placeholder="补充备注或执行要求"/></label><label>状态<select value={form.status} onChange={event => setForm(current => ({...current,status:event.target.value}))}><option value="draft">草稿</option><option value="active">运行中</option><option value="completed">已完成</option></select></label><div className="record-dialog-actions"><button onClick={() => setDialogOpen(false)}>取消</button><button className="primary-action" disabled={saving} onClick={saveRecord}>{saving ? "保存中…" : "保存"}</button></div></div></div></ModalPortal>}
  </div>;
}

const automationTaskNames: Record<string, string> = {
  system_test: "测试电脑连接", wechat_probe: "检测微信", wechat_open: "打开微信",
  wechat_draft: "填写微信草稿", wechat_send: "发送微信消息", wechat_sop_step: "执行私域SOP步骤",
  platform_open_login: "打开平台登录页", platform_publish: "准备发布内容", local_folder_scan: "扫描本地目录", acquisition_search: "公域获客搜索",
};

function AutomationControl({ notify }: Pick<Props, "notify">) {
  const [devices, setDevices] = useState<AutomationDevice[]>([]);
  const [jobs, setJobs] = useState<AutomationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState("");
  const [contact, setContact] = useState("");
  const [draft, setDraft] = useState("");
  const [platform, setPlatform] = useState("douyin");
  const [pairingCode, setPairingCode] = useState("");
  const [pairingExpiresAt, setPairingExpiresAt] = useState("");
  const [pairingBusy, setPairingBusy] = useState(false);

  const refresh = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [deviceResponse, jobResponse] = await Promise.all([
        fetch("/api/automation?action=devices", { cache: "no-store" }),
        fetch("/api/automation?action=jobs", { cache: "no-store" }),
      ]);
      const deviceData = await deviceResponse.json() as { devices?: AutomationDevice[]; error?: string };
      const jobData = await jobResponse.json() as { jobs?: AutomationJob[]; error?: string };
      if (!deviceResponse.ok || !jobResponse.ok) throw new Error(deviceData.error || jobData.error || "读取失败");
      setDevices(deviceData.devices || []); setJobs(jobData.jobs || []);
    } catch (error) { if (!quiet) notify(error instanceof Error ? error.message : "读取自动化数据失败"); }
    finally { if (!quiet) setLoading(false); }
  };

  useEffect(() => {
    refresh();
    const timer = window.setInterval(() => refresh(true), 3000);
    return () => window.clearInterval(timer);
  }, []);

  const onlineDevice = devices.find(device => device.online);
  const createTask = async (type: string, payload: Record<string, unknown> = {}) => {
    if (!onlineDevice) { notify("还没有在线电脑，请先启动奇遇AI电脑助手。"); return; }
    setCreating(type);
    try {
      const response = await fetch("/api/automation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", type, deviceId: onlineDevice.deviceId, payload }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "任务创建失败");
      notify(`${automationTaskNames[type] || "自动化"}任务已发送到${onlineDevice.name}。`);
      await refresh(true);
    } catch (error) { notify(error instanceof Error ? error.message : "任务创建失败"); }
    finally { setCreating(""); }
  };

  const createPairingCode = async () => {
    setPairingBusy(true);
    try {
      const response = await fetch("/api/automation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pairing_code_create" }) });
      const data = await response.json() as { code?: string; expiresAt?: string; error?: string };
      if (!response.ok || !data.code) throw new Error(data.error || "配对码生成失败");
      setPairingCode(data.code); setPairingExpiresAt(data.expiresAt || "");
      notify("一次性配对码已生成，请在电脑助手中粘贴；10分钟内仅可使用一次。");
    } catch (error) { notify(error instanceof Error ? error.message : "配对码生成失败"); }
    finally { setPairingBusy(false); }
  };

  const statusLabel = (status: string) => ({ queued: "等待领取", claimed: "已领取", running: "执行中", succeeded: "已完成", failed: "失败" }[status] || status);
  const recentJobs = jobs.slice(0, 20);
  return <div className="module-page automation-control">
    <PageHeader eyebrow="DESKTOP AUTOMATION" title="自动化控制台" desc="网站负责下发任务，本地电脑助手负责操作微信和已登录的平台，并回传真实结果。" action="刷新设备" onAction={() => refresh()}/>
    <div className="device-stats">
      <div><Laptop/><span><strong>{devices.filter(device => device.online).length}</strong><small>在线设备</small></span></div>
      <div><Activity/><span><strong>{jobs.filter(job => ["claimed", "running"].includes(job.status)).length}</strong><small>正在执行</small></span></div>
      <div><CheckCircle2/><span><strong>{jobs.filter(job => job.status === "succeeded").length}</strong><small>已完成任务</small></span></div>
      <div><XCircle/><span><strong>{jobs.filter(job => job.status === "failed").length}</strong><small>失败任务</small></span></div>
    </div>

    <section className="agent-setup panel"><span className="setup-icon"><ShieldCheck size={25}/></span><div><h3>绑定电脑助手</h3><p>每台电脑必须先输入一次性配对码，才会获得当前工作空间的任务和私域数据。</p><div className="agent-download-row"><button className="agent-download" disabled={pairingBusy} onClick={createPairingCode}><ShieldCheck size={16}/>{pairingBusy ? "正在生成…" : "生成一次性配对码"}</button>{pairingCode && <strong>{pairingCode}</strong>}</div><small>{pairingCode ? `有效至 ${pairingExpiresAt ? new Date(pairingExpiresAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "10分钟后"}；复制到电脑助手的“配对工作空间”页面。` : "配对码只显示一次、10分钟有效且使用后立即失效。"}</small></div></section>

    {loading ? <div className="records-empty panel"><RefreshCw className="spin" size={24}/><strong>正在读取设备</strong></div> : devices.length === 0 ? <section className="agent-setup panel"><span className="setup-icon"><Download size={25}/></span><div><h3>安装奇遇AI电脑助手</h3><p>安装后自动绑定电脑，并在后台接收公域获客、AI私域跟进和平台任务。</p><div className="agent-download-row"><a className="agent-download" href="/download/QiyuAI-Mac-latest.dmg"><Download size={16}/>下载 0.5.7 Apple 芯片 Mac 版</a><a className="agent-download" href="/download/QiyuAI-Windows-latest.exe"><Download size={16}/>下载 0.5.22 Windows 版</a></div><small>支持读取最近微信聊天、结合企业知识库和客户资料生成草稿或经授权发送，也支持联系人同步、本地目录索引和平台发布准备。</small></div></section> : <div className="device-list-large">{devices.map(device => <article className="device-large panel" key={device.deviceId}><div className={`computer-visual ${device.online ? "online" : "offline"}`}><Laptop size={30}/><i/></div><div className="device-detail"><div><strong>{device.name}</strong><em className={device.online ? "online" : "offline"}>{device.online ? "在线" : "离线"}</em></div><small>{device.platform} · 助手 {device.version} · 最近心跳 {new Date(device.lastSeenAt).toLocaleString("zh-CN")}</small><p>{device.online ? "空闲或正在领取任务" : "请在这台电脑上重新启动助手"}</p><div className="capability-tags">{device.capabilities.map(item => <span key={item}>{automationTaskNames[item] || item}</span>)}</div></div><div className="device-actions"><button disabled={!device.online || Boolean(creating)} onClick={() => createTask("system_test")}><Zap size={15}/>连通测试</button><button disabled={!device.online || Boolean(creating)} onClick={() => createTask("wechat_probe")}><MessageCircle size={15}/>检测微信</button><button disabled={!device.online || Boolean(creating)} onClick={() => createTask("wechat_open")}><Square size={15}/>打开微信</button></div></article>)}</div>}

    <div className="automation-grid">
      <section className="automation-form panel"><div className="panel-heading"><div><h3>微信安全测试</h3><p>搜索联系人并把内容填入输入框，最后由你人工检查和发送</p></div><MessageCircle size={20}/></div><label>联系人或备注名<input value={contact} onChange={event => setContact(event.target.value)} placeholder="输入微信联系人"/></label><label>草稿内容<textarea value={draft} onChange={event => setDraft(event.target.value)} placeholder="输入测试内容，不会自动发送"/></label><button className="primary-action" disabled={!contact.trim() || !draft.trim() || Boolean(creating)} onClick={() => createTask("wechat_draft", { contact: contact.trim(), message: draft, send: false })}><Send size={16}/>{creating === "wechat_draft" ? "正在下发…" : "填入微信草稿"}</button><small className="safety-note"><ShieldCheck size={14}/>安全锁已开启：电脑助手不会点击发送按钮</small></section>
      <section className="automation-form panel"><div className="panel-heading"><div><h3>平台发布登录</h3><p>先在当前电脑打开创作者中心并扫码登录，账号凭证保留在本地</p></div><Cloud size={20}/></div><label>内容平台<select value={platform} onChange={event => setPlatform(event.target.value)}><option value="douyin">抖音</option><option value="xiaohongshu">小红书</option><option value="kuaishou">快手</option><option value="shipinhao">视频号</option></select></label><button className="primary-action" disabled={Boolean(creating)} onClick={() => createTask("platform_open_login", { platform })}><CirclePlay size={16}/>{creating === "platform_open_login" ? "正在打开…" : "在电脑上打开登录页"}</button><small className="safety-note"><ShieldCheck size={14}/>正式发布前仍需单独配置素材、标题和人工确认</small></section>
    </div>

    <section className="panel automation-jobs"><div className="panel-heading"><div><h3>任务执行记录</h3><p>以下均为电脑助手回传的真实状态</p></div><button className="outline-action" onClick={() => refresh()}><RefreshCw size={14}/>刷新</button></div>{recentJobs.length === 0 ? <div className="records-empty"><Activity size={28}/><strong>还没有自动化任务</strong><p>在线设备出现后，可以先点击“连通测试”。</p></div> : <div className="job-list">{recentJobs.map(job => <article key={job.id}><span className={`job-status ${job.status}`}><Activity size={16}/></span><div><strong>#{job.id} {automationTaskNames[job.type] || job.type}</strong><small>{new Date(job.createdAt).toLocaleString("zh-CN")} · {statusLabel(job.status)}</small>{job.error && <p>{job.error}</p>}{job.status === "succeeded" && Object.keys(job.result || {}).length > 0 && <p>{String(job.result.message || job.result.notice || "执行成功")}</p>}</div><em className={job.status}>{job.progress}%</em></article>)}</div>}</section>
  </div>;
}

export function ModulePage({ page, notify }: Props) {
  if (page === "analytics") return <AnalyticsPage notify={notify}/>;
  if (page === "agent-chat") return <AgentChat notify={notify}/>;
  if (page === "auto-workflow") return <WorkflowStudio notify={notify}/>;
  if (page === "creation-center") return <CreationCenter notify={notify}/>;
  if (page === "ai-employee") return <AIEmployee notify={notify}/>;
  if (page === "video") return <VideoEditor notify={notify}/>;
  if (page === "local-files") return <LocalFileManager notify={notify}/>;
  if (page === "tasks") return <TaskMonitor notify={notify}/>;
  if (page === "accounts") return <AccountBinding notify={notify}/>;
  if (page === "settings") return <SettingsStatus notify={notify}/>;
  if (["devices", "mobile-remote"].includes(page)) return <AutomationControl notify={notify}/>;
  if (page === "ai-expert") return <AIExperts notify={notify}/>;
  if (page === "knowledge") return <KnowledgeBase notify={notify}/>;
  if (page === "acquisition") return <Acquisition notify={notify}/>;
  if (page === "public-exposure") return <PlatformOperations notify={notify}/>;
  if (page === "video-gen") return <VideoGenerator notify={notify}/>;
  if (page === "image-generate") return <ImageGenerator notify={notify}/>;
  if (page === "ecommerce") return <EcommerceStudio notify={notify}/>;
  if (page === "contract-center") return <ContractCenter notify={notify}/>;
  if (page === "card-redeem" || page === "ai-recharge") return <DeferredBilling page={page} notify={notify}/>;
  if (["activation", "moments", "wechat-message", "smart-broadcast", "auto-reply", "wechat-sop", "wechat-tags"].includes(page)) return <PrivateDomain page={page} notify={notify}/>;
  return <FeatureModule page={page} notify={notify}/>;
}
