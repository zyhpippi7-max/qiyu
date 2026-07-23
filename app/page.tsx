"use client";

import {
  Activity,
  BarChart3,
  Bot,
  BookOpen,
  Building2,
  ChevronRight,
  CircleUserRound,
  Clapperboard,
  Command,
  CreditCard,
  Crown,
  Download,
  FileImage,
  Film,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  Images,
  LayoutDashboard,
  Library,
  LogOut,
  Megaphone,
  MessageCircleMore,
  MessageSquareText,
  MessagesSquare,
  Mic2,
  MonitorSmartphone,
  MoreHorizontal,
  Play,
  Plus,
  ReceiptText,
  Reply,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Smartphone,
  UserPlus,
  UserRoundCog,
  UsersRound,
  Video,
  WalletCards,
  WandSparkles,
  Workflow,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ModulePage } from "./ModulePages";
import { AuthGate } from "./AuthGate";
import { MembershipPlans } from "./MembershipPlans";
import { UserPermissions } from "./UserPermissions";
import { ModalPortal } from "./ModalPortal";
import type { AuthUser } from "./auth-server";

const navGroups = [
  {
    label: "工作台",
    items: [
      { key: "command", icon: LayoutDashboard, text: "AI 指挥中心" },
      { key: "analytics", icon: BarChart3, text: "数据分析" },
      { key: "agent-chat", icon: Bot, text: "智能体" },
      { key: "auto-workflow", icon: Workflow, text: "自动工作流" },
      { key: "ai-employee", icon: UserRoundCog, text: "AI 员工" },
    ],
  },
  {
    label: "创作中心",
    items: [
      { key: "creation-center", icon: WandSparkles, text: "一站式创作" },
      { key: "video", icon: Clapperboard, text: "视频剪辑" },
      { key: "video-gen", icon: Film, text: "Seedance 视频" },
      { key: "media", icon: Library, text: "素材库" },
      { key: "local-files", icon: FolderOpen, text: "本地文件" },
      { key: "image-generate", icon: FileImage, text: "GPT Image 2 生图" },
      { key: "ecommerce", icon: ShoppingBag, text: "电商生图中心" },
      { key: "gallery", icon: Video, text: "作品库" },
    ],
  },
  {
    label: "数字员工",
    items: [
      { key: "ai-expert", icon: Sparkles, text: "AI 专家" },
      { key: "knowledge", icon: BookOpen, text: "知识库" },
      { key: "acquisition", icon: Megaphone, text: "公域获客" },
      { key: "public-exposure", icon: Activity, text: "平台运营" },
    ],
  },
  {
    label: "私域运营",
    items: [
      { key: "activation", icon: UserPlus, text: "主动激活" },
      { key: "moments", icon: Images, text: "朋友圈营销" },
      { key: "wechat-message", icon: MessagesSquare, text: "微信消息" },
      { key: "smart-broadcast", icon: Send, text: "智能群发" },
      { key: "auto-reply", icon: Reply, text: "自动回复" },
      { key: "wechat-sop", icon: Workflow, text: "微信 SOP" },
      { key: "wechat-tags", icon: UsersRound, text: "客户标签" },
    ],
  },
  {
    label: "系统",
    items: [
      { key: "tasks", icon: Activity, text: "任务监控" },
      { key: "devices", icon: MonitorSmartphone, text: "设备管理", badge: "0" },
      { key: "mobile-remote", icon: Smartphone, text: "移动遥控" },
      { key: "accounts", icon: UsersRound, text: "账号绑定", badge: "0" },
      { key: "user-permissions", icon: UserRoundCog, text: "用户与权限" },
      { key: "membership-plans", icon: Crown, text: "会员套餐" },
      { key: "card-redeem", icon: CreditCard, text: "卡密兑换" },
    ],
  },
  {
    label: "AI 服务",
    items: [
      { key: "ai-recharge", icon: WalletCards, text: "AI 充值" },
      { key: "bookkeeping", icon: ReceiptText, text: "记账报税" },
      { key: "contract-center", icon: FileImage, text: "合同中心" },
      { key: "enterprise", icon: Building2, text: "企业中心" },
      { key: "settings", icon: SlidersHorizontal, text: "设置" },
    ],
  },
];

const quickActions = [
  {
    icon: Film,
    color: "violet",
    title: "创作一条视频",
    desc: "脚本、分镜、画面、配音到成片",
    prompt: "帮我策划并生成一条产品宣传视频",
    page: "video-gen",
  },
  {
    icon: Send,
    color: "blue",
    title: "发布到多平台",
    desc: "选择素材并发布到运营账号",
    prompt: "把最新视频发布到抖音和小红书",
    page: "public-exposure",
  },
  {
    icon: ImageIcon,
    color: "pink",
    title: "生成营销图片",
    desc: "商品图、封面、海报和分镜",
    prompt: "为新品生成一组营销海报",
    page: "image-generate",
  },
  {
    icon: MessageSquareText,
    color: "amber",
    title: "启动私域 SOP",
    desc: "客户标签、跟进和智能回复",
    prompt: "创建一个新客户七天跟进SOP",
    page: "wechat-sop",
  },
];

type DashboardOverview = { metrics: Record<string, number>; recent: Array<{ id: number; type: string; status: string; progress: number; createdAt: string }> };
const dashboardTaskNames: Record<string, string> = { system_test: "电脑连通测试", wechat_probe: "检测微信", wechat_open: "打开微信", wechat_contact_scan: "同步微信联系人", wechat_inbox_scan: "读取微信消息", wechat_draft: "填写微信草稿", wechat_send: "发送微信消息", wechat_sop_step: "执行微信 SOP", platform_open_login: "打开平台登录页", platform_publish: "准备平台发布", local_folder_scan: "扫描本地素材目录", acquisition_search: "公开线索采集" };

export default function Home() {
  return <AuthGate>{(user, logout) => <Dashboard user={user} logout={logout} />}</AuthGate>;
}

function Dashboard({ user, logout }: { user: AuthUser; logout: () => Promise<void> }) {
  const [activePage, setActivePage] = useState("command");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState("全部任务");
  const [notice, setNotice] = useState("");
  const [profileMenu, setProfileMenu] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [overview, setOverview] = useState<DashboardOverview>({ metrics: {}, recent: [] });

  const pageTitles: Record<string, string> = {
    command: "AI 指挥中心",
    analytics: "数据分析",
    "agent-chat": "智能体",
    "auto-workflow": "自动工作流",
    "ai-employee": "AI 员工",
    "creation-center": "一站式创作",
    video: "视频剪辑",
    "video-gen": "Seedance 视频",
    media: "素材库",
    "local-files": "本地文件",
    "image-generate": "GPT Image 2 生图",
    ecommerce: "电商生图中心",
    gallery: "作品库",
    "ai-expert": "AI 专家",
    knowledge: "知识库",
    acquisition: "公域获客",
    "public-exposure": "平台运营",
    activation: "主动激活",
    moments: "朋友圈营销",
    "wechat-message": "微信消息",
    "smart-broadcast": "智能群发",
    "auto-reply": "自动回复",
    "wechat-sop": "微信 SOP",
    "wechat-tags": "客户标签",
    tasks: "任务监控",
    devices: "设备管理",
    "mobile-remote": "移动遥控",
    accounts: "账号绑定",
    "user-permissions": "用户与权限",
    "card-redeem": "卡密兑换",
    "membership-plans": "会员套餐",
    "ai-recharge": "AI 充值",
    bookkeeping: "记账报税",
    "contract-center": "合同中心",
    enterprise: "企业中心",
    settings: "设置",
  };

  useEffect(() => {
    const readPage = () => {
      const next = new URLSearchParams(window.location.search).get("page") || "command";
      if (pageTitles[next]) setActivePage(next);
    };
    readPage();
    window.addEventListener("popstate", readPage);
    return () => window.removeEventListener("popstate", readPage);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try { const response = await fetch("/api/overview", { cache: "no-store" }); const data = await response.json(); if (response.ok && !cancelled) setOverview(data); } catch { /* 下一轮刷新继续 */ }
    };
    load(); const timer = window.setInterval(load, 5000); return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!profileMenu) return;
    const close = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".profile-menu-wrap")) setProfileMenu(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileMenu(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [profileMenu]);

  const dashboardTasks = overview.recent.map(job => ({ title: `#${job.id} ${dashboardTaskNames[job.type] || job.type}`, type: "电脑自动化", progress: job.progress || (job.status === "succeeded" ? 100 : 0), stage: ({ queued: "等待领取", claimed: "已领取", running: "执行中", succeeded: "已完成", failed: "失败", cancelled: "已取消" } as Record<string, string>)[job.status] || job.status, tone: job.status === "failed" ? "pink" : job.status === "succeeded" ? "green" : "violet" }));

  const navigate = (page: string) => {
    setActivePage(page);
    const url = page === "command" ? window.location.pathname : `${window.location.pathname}?page=${page}`;
    window.history.pushState({}, "", url);
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const showNotice = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(""), 4200);
  };

  const submit = () => {
    if (!message.trim()) return;
    window.sessionStorage.setItem("qiyu_agent_prompt", message.trim());
    setMessage("");
    navigate("agent-chat");
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <img src="/qiyu-logo.png" alt="奇遇AI Logo" />
          </div>
          <div>
            <strong>奇遇AI</strong>
            <span>AI CREATIVE OS</span>
          </div>
        </div>

        <nav className="nav-wrap" aria-label="主导航">
          {navGroups.map((group) => (
            <section className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.filter((item) => !["membership-plans", "user-permissions"].includes(item.key) || user.role === "admin").map((item) => {
                const Icon = item.icon;
                const badge = item.key === "devices" ? overview.metrics.devices || 0 : item.key === "accounts" ? overview.metrics.accounts || 0 : item.badge;
                return (
                  <button className={`nav-item ${activePage === item.key ? "active" : ""}`} key={item.text} onClick={() => navigate(item.key)}>
                    <Icon size={18} strokeWidth={1.8} />
                    <span>{item.text}</span>
                    {item.badge !== undefined && <em>{badge}</em>}
                  </button>
                );
              })}
            </section>
          ))}
        </nav>

        <div className="device-card">
          <div className="device-card-top">
            <span className={`status-pulse ${overview.metrics.devices ? "" : "offline"}`} />
            <strong>{overview.metrics.devices ? "自动化助手在线" : "自动化助手未连接"}</strong>
          </div>
          <p>{overview.metrics.devices || 0} 台电脑在线，{overview.metrics.activeJobs || 0} 个任务进行中</p>
          <button onClick={() => navigate("devices")}>查看设备 <ChevronRight size={14} /></button>
        </div>

        <div className="profile-menu-wrap">
          {profileMenu && <div className="profile-menu" role="menu">
            <div className="profile-menu-account">
              <span className="avatar">{user.displayName.slice(0, 1).toUpperCase()}</span>
              <span><strong>{user.displayName}</strong><small>{user.phone} · {user.role === "admin" ? "管理员" : user.planName}</small></span>
            </div>
            <div className="profile-menu-actions">
              <button role="menuitem" onClick={() => { setProfileMenu(false); navigate("settings"); }}><Settings /><span><strong>个人设置</strong><small>偏好、服务与安全设置</small></span><ChevronRight /></button>
              {user.role === "admin" && <button role="menuitem" onClick={() => { setProfileMenu(false); navigate("user-permissions"); }}><UserRoundCog /><span><strong>用户与权限</strong><small>账号、会员和管理员权限</small></span><ChevronRight /></button>}
            </div>
            <div className="profile-menu-session">
              <button role="menuitem" onClick={async () => { setProfileMenu(false); await logout(); }}><RefreshCw /><span>切换账号</span></button>
              <button className="danger" role="menuitem" onClick={() => { setProfileMenu(false); setLogoutConfirm(true); }}><LogOut /><span>退出登录</span></button>
            </div>
          </div>}
          <button className="profile-row" aria-haspopup="menu" aria-expanded={profileMenu} onClick={() => setProfileMenu((open) => !open)}>
            <span className="avatar">{user.displayName.slice(0, 1).toUpperCase()}</span>
            <span><strong>{user.displayName}</strong><small>{user.role === "admin" ? "管理员" : user.planName}</small></span>
            <MoreHorizontal size={18} aria-label="打开账号菜单" />
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p>工作空间</p>
            <h1>{pageTitles[activePage]}</h1>
          </div>
          <div className="top-actions">
            <button className="icon-btn" aria-label="设置" onClick={() => navigate("settings")}><Settings size={19} /></button>
            <button className="upgrade" onClick={() => navigate("ai-recharge")}><Zap size={16} fill="currentColor" /> 升级套餐</button>
            <button className="mini-avatar" aria-label="个人中心" title={`${user.displayName} · ${user.phone}`} onClick={() => navigate(user.role === "admin" ? "user-permissions" : "enterprise")}><CircleUserRound size={23} /></button>
          </div>
        </header>

        <div className="content">
          {activePage === "command" ? <>
          <section className="home-download" aria-labelledby="home-download-title" data-testid="home-download">
            <div className="home-download-glow home-download-glow-one" />
            <div className="home-download-glow home-download-glow-two" />
            <div className="home-download-copy">
              <span className="home-download-kicker"><MonitorSmartphone size={18} /> 奇遇AI电脑助手</span>
              <h2 id="home-download-title">下载电脑助手，让 AI 自动化真正开始运行</h2>
              <p>公域获客、微信联系人同步、AI 私域跟进和多平台发布，都由电脑助手在客户电脑上安全执行。</p>
              <div className="home-download-trust">
                <span><ShieldCheck size={16} /> 任务在本机执行</span>
                <span><Zap size={16} /> 安装后自动连接</span>
              </div>
            </div>
            <div className="home-download-actions">
              <a className="download-primary" href="/download/QiyuAI-Mac-latest.dmg">
                <Download size={22} />
                <span><strong>下载 Mac 版</strong><small>Apple 芯片 · 0.5.7</small></span>
              </a>
              <a className="download-secondary" href="/download/QiyuAI-Windows-latest.exe">
                <Download size={22} />
                <span><strong>下载 Windows 版</strong><small>Windows 10 / 11 · 0.5.10</small></span>
              </a>
              <button className="download-device-link" onClick={() => navigate("devices")}>
                已经安装？查看连接状态 <ChevronRight size={16} />
              </button>
            </div>
          </section>

          <section className="command-hero">
            <div className="aurora aurora-one" />
            <div className="aurora aurora-two" />
            <div className="hero-heading">
              <span className="ai-orb"><Sparkles size={22} /></span>
              <div>
                <p>奇遇AI · 智能执行中枢</p>
                <h2>今天想让 AI 帮你完成什么？</h2>
              </div>
            </div>
            <p className="hero-copy">从一个想法到内容生成、视频制作和自动发布，用一句话调动你的全部数字能力。</p>

            <div className="composer">
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
                placeholder="例如：为我的新品策划一条 30 秒视频，生成后发布到抖音和小红书…"
                aria-label="输入任务指令"
              />
              <div className="composer-footer">
                <div>
                  <button aria-label="添加素材" onClick={() => navigate("media")}><Plus size={18} /></button>
                  <button aria-label="语音输入" onClick={() => showNotice("云端语音识别尚未配置；当前请先使用文字输入。 ")}><Mic2 size={18} /></button>
                  <span>GPT-5.5 <ChevronRight size={13} /></span>
                </div>
                <button className="send-btn" onClick={submit} aria-label="发送指令"><Command size={18} /></button>
              </div>
            </div>
            {notice && <div className="notice"><Bot size={16} /> {notice}</div>}
          </section>

          <section className="quick-section">
            <div className="section-title">
              <div><h3>快速开始</h3><p>选择一个能力，奇遇AI会为你生成执行计划</p></div>
              <button onClick={() => navigate("creation-center")}>全部能力 <ChevronRight size={15} /></button>
            </div>
            <div className="quick-grid">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button className="quick-card" key={action.title} onClick={() => { setMessage(action.prompt); navigate(action.page); }}>
                    <span className={`quick-icon ${action.color}`}><Icon size={20} /></span>
                    <span><strong>{action.title}</strong><small>{action.desc}</small></span>
                    <ChevronRight className="card-arrow" size={17} />
                  </button>
                );
              })}
            </div>
          </section>

          <section className="lower-grid">
            <div className="tasks-panel panel">
              <div className="section-title compact">
                <div><h3>正在进行</h3><p>跨设备任务实时同步</p></div>
                <div className="segmented">
                  {["全部任务", "AI创作", "自动执行"].map((item) => (
                    <button key={item} onClick={() => setSelected(item)} className={selected === item ? "selected" : ""}>{item}</button>
                  ))}
                </div>
              </div>
              <div className="task-list">
                {dashboardTasks.length === 0 && <div className="dashboard-empty"><Activity size={22}/><strong>暂无真实任务</strong><small>创建任务后会显示电脑助手回传的状态</small></div>}
                {dashboardTasks.map((task) => (
                  <article className="task-row" key={task.title}>
                    <button className={`task-play ${task.tone}`} aria-label={`查看${task.title}`} onClick={() => navigate("tasks")}><Play size={16} fill="currentColor" /></button>
                    <div className="task-main">
                      <div className="task-meta"><strong>{task.title}</strong><span>{task.type}</span></div>
                      <div className="progress-track"><i style={{ width: `${task.progress}%` }} /></div>
                      <div className="task-status"><span>{task.stage}</span><em>{task.progress}%</em></div>
                    </div>
                    <button className="more-btn" aria-label="更多任务操作" onClick={() => navigate("tasks")}><MoreHorizontal size={18} /></button>
                  </article>
                ))}
              </div>
            </div>

            <aside className="overview-panel panel">
              <div className="section-title compact"><div><h3>今日概览</h3><p>内容生产与执行情况</p></div></div>
              <div className="metric-grid">
                <div><span className="metric-icon purple"><WandSparkles size={17} /></span><strong>{overview.metrics.records || 0}</strong><small>内容与记录</small></div>
                <div><span className="metric-icon blue"><MonitorSmartphone size={17} /></span><strong>{overview.metrics.completedJobs || 0}</strong><small>已完成自动任务</small></div>
                <div><span className="metric-icon pink"><Film size={17} /></span><strong>{overview.metrics.videos || 0}</strong><small>视频任务</small></div>
                <div><span className="metric-icon green"><Activity size={17} /></span><strong>{overview.metrics.successRate || 0}%</strong><small>任务成功率</small></div>
              </div>
              <div className="executor-line">
                <span><i className={overview.metrics.devices ? "" : "offline"}/><strong>{overview.metrics.devices ? `${overview.metrics.devices} 台执行设备在线` : "暂无执行设备"}</strong><small>{overview.metrics.devices ? "可以领取自动化任务" : "请先绑定电脑助手"}</small></span><em className={overview.metrics.devices ? "online" : "offline"}>{overview.metrics.devices ? "在线" : "未连接"}</em>
              </div>
            </aside>
          </section>
          </> : activePage === "user-permissions" && user.role === "admin" ? <UserPermissions notify={showNotice} /> : activePage === "membership-plans" && user.role === "admin" ? <MembershipPlans notify={showNotice} /> : <ModulePage page={activePage} notify={showNotice} />}
        </div>
        {notice && activePage !== "command" && <div className="global-toast"><Bot size={16} /><span>{notice}</span></div>}
      </section>
      {logoutConfirm && <ModalPortal><div className="record-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setLogoutConfirm(false); }}>
        <div className="account-logout-dialog" role="dialog" aria-modal="true" aria-labelledby="logout-title">
          <span className="account-logout-icon"><LogOut /></span>
          <h3 id="logout-title">退出奇遇AI？</h3>
          <p>退出后需要重新输入手机号和密码才能进入当前工作空间。</p>
          <div>
            <button onClick={() => setLogoutConfirm(false)}>取消</button>
            <button className="danger" onClick={async () => { setLogoutConfirm(false); await logout(); }}>确认退出</button>
          </div>
        </div>
      </div></ModalPortal>}
    </main>
  );
}
