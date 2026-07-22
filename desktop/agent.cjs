const { app, BrowserWindow, clipboard, dialog, Notification, shell } = require("electron");
const { execFile } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");

const VERSION = app.getVersion();

function macWechatHelperPaths() {
  const root = app.isPackaged
    ? path.join(process.resourcesPath, "app.asar.unpacked", "desktop", "bin")
    : path.join(__dirname, "bin");
  const installed = path.join(app.getPath("home"), "Applications", "奇遇AI自动化助手.app");
  const application = app.isPackaged && fs.existsSync(installed) ? installed : path.join(root, "奇遇AI屏幕助手.app");
  const bundled = path.join(application, "Contents", "MacOS", "qiyu-wechat-contact-scanner");
  return { application, executable: fs.existsSync(bundled) ? bundled : path.join(root, "qiyu-wechat-contact-scanner") };
}

function runMacWechatHelper(args = [], timeout = 30000) {
  const { application, executable } = macWechatHelperPaths();
  if (!fs.existsSync(executable)) return Promise.resolve({ ok: false, code: "ENOENT", output: "微信自动化组件缺失，请重新安装最新版奇遇AI" });
  if (!fs.existsSync(application)) return run(executable, args, timeout);
  const stamp = `${process.pid}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const outputFile = path.join(app.getPath("temp"), `qiyu-automation-${stamp}.json`);
  const errorFile = path.join(app.getPath("temp"), `qiyu-automation-${stamp}.err`);
  return new Promise(resolve => {
    execFile("/usr/bin/open", ["-n", "-W", "-g", "-o", outputFile, "--stderr", errorFile, application, "--args", ...args], { timeout }, error => {
      let output = "";
      try { output = fs.readFileSync(outputFile, "utf8").trim(); } catch {}
      if (!output) try { output = fs.readFileSync(errorFile, "utf8").trim(); } catch {}
      try { fs.unlinkSync(outputFile); } catch {}
      try { fs.unlinkSync(errorFile); } catch {}
      resolve({ ok: !error, code: error?.code || 0, output: output || error?.message || "" });
    });
  });
}

function run(file, args = [], timeout = 20000) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout }, (error, stdout, stderr) => resolve({
      ok: !error, code: error?.code || 0, output: String(stdout || stderr || error?.message || "").trim(),
    }));
  });
}

class QiyuAgent {
  constructor(options) {
    this.server = options.server.replace(/\/$/, "");
    this.onStatus = options.onStatus || (() => {});
    this.userData = app.getPath("userData");
    this.configFile = path.join(this.userData, "agent.json");
    this.logDir = path.join(this.userData, "logs");
    this.running = false;
    this.registration = null;
    this.basicAuth = options.basicAuth || null;
    this.platformWindows = new Map();
    this.config = this.loadConfig();
  }

  loadConfig() {
    fs.mkdirSync(this.logDir, { recursive: true });
    let data = {};
    try { data = JSON.parse(fs.readFileSync(this.configFile, "utf8")); } catch {}
    if (!data.deviceId) data.deviceId = crypto.randomUUID();
    data.name ||= `${os.hostname()} · 奇遇AI`;
    return data;
  }

  saveConfig() { fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2)); }
  log(message) {
    const line = `${new Date().toISOString()}  ${message}`;
    fs.appendFileSync(path.join(this.logDir, "desktop-agent.log"), `${line}\n`);
    this.onStatus({ message, at: new Date().toISOString() });
  }

  async request(method = "GET", query = {}, body, authenticated = false) {
    const url = new URL(`${this.server}/api/automation`);
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    const headers = { "Content-Type": "application/json", "User-Agent": `QiyuDesktop/${VERSION}` };
    if (authenticated && this.config.token) headers.Authorization = `Bearer ${this.config.token}`;
    const response = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `服务器返回 ${response.status}`);
    return data;
  }

  async post(body) {
    body.deviceId = this.config.deviceId;
    return this.request("POST", {}, body, Boolean(this.config.token));
  }

  async register() {
    const capabilities = ["system_test", "wechat_probe", "wechat_open", "wechat_draft", "wechat_send", "wechat_sop_step", "platform_open_login", "platform_publish", "local_folder_scan", "acquisition_search"];
    if (["darwin", "win32"].includes(process.platform)) capabilities.push("wechat_contact_scan", "wechat_inbox_scan", "wechat_chat_context", "wechat_ai_reply");
    const result = await this.post({
      action: "register", name: this.config.name, platform: process.platform, version: VERSION,
      capabilities,
    });
    this.config.token = result.token;
    this.saveConfig();
    this.log(`设备已连接：${this.config.name}`);
  }

  async ensureRegistered() {
    if (!this.registration) this.registration = this.register().finally(() => { this.registration = null; });
    return this.registration;
  }

  async pair(pairingCode) {
    const code = String(pairingCode || "").replace(/\s+/g, "").toUpperCase();
    if (!code) throw new Error("请输入网站生成的一次性配对码");
    await this.ensureRegistered();
    const result = await this.post({ action: "pair_device", pairingCode: code });
    this.config.workspaceId = result.workspaceId;
    this.saveConfig();
    this.log("电脑已绑定到当前工作空间");
    return result;
  }

  async openTarget(target) {
    await shell.openExternal(target);
    return { opened: true, url: target };
  }

  async openWechat() {
    if (process.platform === "darwin") {
      const result = await run("open", ["-a", "WeChat"]);
      if (!result.ok) throw new Error("没有找到微信，请先安装并登录微信桌面版");
      return { opened: true, application: "WeChat" };
    }
    if (process.platform === "win32") {
      const result = await this.runWindowsWechat("open");
      let data = {};
      try { data = JSON.parse(result.output); } catch {}
      if (!result.ok || data.ok === false) throw new Error(data.message || result.output || "没有找到微信");
      return { opened: true, application: "微信 Windows 版", pid: data.pid || null, notice: data.message || "微信已打开" };
    }
    throw new Error("当前系统暂不支持微信自动化");
  }

  async probeWechat() {
    if (process.platform === "win32") {
      const result = await this.runWindowsWechat("probe");
      let data = {};
      try { data = JSON.parse(result.output); } catch {}
      if (!result.ok || data.ok === false) return { running: false, installedOrRunning: false, details: data.message || result.output || "微信检测组件执行失败" };
      return { running: data.running === true, installedOrRunning: data.installed === true || data.running === true, windowReady: data.windowReady === true, executable: data.executable || "", details: data.message || "未找到微信" };
    }
    const result = await run("pgrep", ["-ifl", "WeChat|微信"]);
    return { running: result.ok, installedOrRunning: result.ok, details: result.output.slice(0, 500) };
  }

  async wechatDraft(contact, message, shouldSend = false) {
    if (!contact || !message) throw new Error("联系人和消息不能为空");
    await this.openWechat();
    if (process.platform === "win32") {
      clipboard.writeText(contact);
      let result = await this.runWindowsWechat("focus-contact");
      if (!result.ok) throw new Error(result.output || "没有找到已登录的微信窗口");
      clipboard.writeText(message);
      result = await this.runWindowsWechat(shouldSend ? "paste-send" : "paste-draft");
      if (!result.ok) throw new Error(result.output || "填写微信失败");
      return { drafted: true, sent: shouldSend, contact, notice: shouldSend ? "消息已按授权发送" : "消息已填入，等待人工发送" };
    }
    if (process.platform !== "darwin") throw new Error("当前系统暂不支持微信自动化");
    const result = await runMacWechatHelper(["--wechat-draft", contact, message, ...(shouldSend ? ["--send"] : [])], 30000);
    let data;
    try { data = JSON.parse(result.output); } catch { throw new Error(result.output || "填写微信失败"); }
    const errors = {
      permission_accessibility: "请在系统设置 → 隐私与安全性 → 辅助功能中允许奇遇AI",
      wechat_not_open: "请先打开并登录微信桌面版",
      conversation_not_verified: `没有可靠打开并验证联系人“${contact}”，已停止且不会发送`,
      conversation_changed_before_send: "发送前联系人发生变化，已停止发送",
    };
    if (!result.ok || !data?.ok) {
      const message = errors[data?.error] || data?.error || result.output || "填写微信失败";
      throw new Error(data?.debug ? `${message}（诊断：${data.debug}）` : message);
    }
    return { drafted: true, sent: shouldSend, contact, notice: shouldSend ? "消息已按授权发送" : "消息已填入，等待人工发送" };
  }

  async scanWechatContacts() {
    if (process.platform === "win32") {
      await this.openWechat();
      const result = await this.runWindowsWechat("scan-contacts", [], 300000);
      let data;
      try { data = JSON.parse(result.output); } catch { throw new Error(result.output || "微信通讯录没有返回有效结果"); }
      if (!result.ok || !data?.ok) throw new Error(data?.message || data?.error || "未能读取微信通讯录，请保持微信已登录并更新到最新版");
      const contacts = Array.isArray(data.contacts) ? data.contacts.map(name => ({ name: String(name || "").trim(), confidence: 1 })).filter(item => item.name) : [];
      if (!contacts.length) throw new Error("微信没有暴露可读取的通讯录，请打开微信通讯录页面后重试");
      return { contacts, count: contacts.length, pages: Number(data.pages || 1), notice: "已从当前登录微信读取联系人，等待你在网站确认导入" };
    }
    if (process.platform !== "darwin") throw new Error("当前系统暂不支持微信联系人同步");
    await this.openWechat();
    const result = await runMacWechatHelper([], 300000);
    let data;
    try { data = JSON.parse(result.output); } catch { throw new Error(result.output || "微信联系人扫描没有返回有效结果"); }
    const errors = {
      permission_accessibility: "请在系统设置 → 隐私与安全性 → 辅助功能中允许奇遇AI，然后重新同步",
      permission_screen_recording: "请在系统设置 → 隐私与安全性 → 屏幕录制中允许奇遇AI，重启助手后再同步",
      wechat_not_open: "请先打开并登录微信桌面版",
      screen_capture_failed: "无法读取微信窗口，请检查屏幕录制权限后重试",
      no_contacts_recognized: "没有识别到联系人，请保持微信通讯录窗口可见后重试",
      contact_tab_not_open: "没有进入微信通讯录，已停止扫描，未保存任何结果",
      scan_incomplete: "联系人列表尚未扫描到底，已停止且未保存半截结果，请重试",
      contact_count_mismatch: "联系人识别结果未通过数量校验，已停止且未保存，请保持微信窗口清晰可见后重试",
    };
    if (!result.ok || !data?.ok) throw new Error(errors[data?.error] || data?.error || result.output || "联系人扫描失败");
    const contacts = Array.isArray(data.contacts)
      ? data.contacts.map(item => ({ name: String(item.name || "").trim(), confidence: Number(item.confidence || 0) })).filter(item => item.name)
      : [];
    if (!contacts.length) throw new Error("没有识别到联系人，请保持微信通讯录窗口可见后重试");
    return { contacts, count: contacts.length, pages: Number(data.pages || 0), notice: "仅提取了微信可见的昵称或备注名，等待你在网站确认导入" };
  }

  async scanWechatInbox() {
    if (process.platform === "win32") {
      await this.openWechat();
      const result = await this.runWindowsWechat("scan-inbox", [], 60000);
      let data;
      try { data = JSON.parse(result.output); } catch { throw new Error(result.output || "微信消息识别没有返回有效结果"); }
      if (!result.ok || !data?.ok) throw new Error(data?.message || data?.error || "微信消息识别失败");
      if (data.unread && data.contact && !Array.isArray(data.history)) {
        try {
          const context = await this.scanWechatChatContext(data.contact, 40);
          data.history = context.history;
        } catch { data.history = data.message ? [{ direction: "incoming", text: data.message }] : []; }
      }
      return data;
    }
    if (process.platform !== "darwin") throw new Error("当前系统暂不支持微信AI接管");
    await this.openWechat();
    const result = await runMacWechatHelper(["--inbox"], 45000);
    let data;
    try { data = JSON.parse(result.output); } catch { throw new Error(result.output || "微信消息识别没有返回有效结果"); }
    const errors = {
      permission_accessibility: "请在系统设置 → 隐私与安全性 → 辅助功能中允许奇遇AI",
      permission_screen_recording: "请在系统设置 → 隐私与安全性 → 屏幕录制中允许奇遇AI，重启后再试",
      wechat_not_open: "请先打开并登录微信桌面版",
      screen_capture_failed: "无法读取微信窗口，请检查屏幕录制权限",
      inbox_message_not_recognized: "发现未读会话，但本次没有可靠识别出联系人和消息；未执行回复",
    };
    if (!result.ok || !data?.ok) throw new Error(errors[data?.error] || data?.error || result.output || "微信未读消息识别失败");
    if (data.unread && data.contact && !Array.isArray(data.history)) {
      try {
        const context = await this.scanWechatChatContext(data.contact, 40);
        data.history = context.history;
      } catch { data.history = data.message ? [{ direction: "incoming", text: data.message }] : []; }
    }
    return data;
  }

  async scanWechatChatContext(contact, limit = 40) {
    if (!contact) throw new Error("缺少要读取上下文的微信联系人");
    const safeLimit = Math.max(30, Math.min(50, Number(limit || 40)));
    await this.openWechat();
    if (process.platform === "win32") {
      clipboard.writeText(contact);
      const focused = await this.runWindowsWechat("focus-contact");
      if (!focused.ok) throw new Error(focused.output || "没有打开联系人会话");
      const result = await this.runWindowsWechat("scan-history", ["-Limit", String(safeLimit)], 90000);
      let data;
      try { data = JSON.parse(result.output); } catch { throw new Error(result.output || "Windows 微信没有返回聊天上下文"); }
      if (!result.ok || !data?.ok) throw new Error(data?.message || data?.error || "Windows 微信未暴露可读取的聊天内容");
      return { contact, history: Array.isArray(data.history) ? data.history.slice(-safeLimit) : [], count: Number(data.count || 0), source: "windows_uia" };
    }
    if (process.platform !== "darwin") throw new Error("当前系统不支持微信聊天上下文读取");
    const result = await runMacWechatHelper(["--chat-history", contact, String(safeLimit)], 90000);
    let data;
    try { data = JSON.parse(result.output); } catch { throw new Error(result.output || "Mac 微信没有返回聊天上下文"); }
    const errors = {
      permission_accessibility: "请允许奇遇AI自动化助手使用辅助功能",
      permission_screen_recording: "请允许奇遇AI自动化助手进行屏幕录制",
      wechat_not_open: "请先打开并登录微信桌面版",
      chat_history_not_recognized: "没有可靠识别到聊天记录，请打开目标会话并保持微信窗口可见",
    };
    if (!result.ok || !data?.ok) throw new Error(errors[data?.error] || data?.error || "读取聊天上下文失败");
    return { contact, history: Array.isArray(data.history) ? data.history.slice(-safeLimit) : [], count: Number(data.count || 0), source: "mac_window_ocr" };
  }

  wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  windowsScript() {
    return app.isPackaged
      ? path.join(process.resourcesPath, "app.asar.unpacked", "desktop", "windows", "qiyu-wechat.ps1")
      : path.join(__dirname, "windows", "qiyu-wechat.ps1");
  }

  async runWindowsWechat(mode, args = [], timeout = 30000) {
    if (process.platform !== "win32") return { ok: false, output: "Windows 微信助手只能在 Windows 中运行" };
    const script = this.windowsScript();
    if (!fs.existsSync(script)) return { ok: false, output: "Windows 微信自动化组件缺失，请重新安装奇遇AI" };
    return run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, "-Mode", mode, ...args], timeout);
  }

  platformUrl(payload) {
    let target = String(payload.target || "").trim();
    if (/^https?:\/\//.test(target)) return target;
    const encoded = encodeURIComponent(target);
    const urls = {
      douyin: `https://www.douyin.com/search/${encoded}?type=${payload.sourceType === "competitor" ? "user" : "video"}`,
      xiaohongshu: `https://www.xiaohongshu.com/search_result?keyword=${encoded}`,
      kuaishou: `https://www.kuaishou.com/search/video?searchKey=${encoded}`,
    };
    return urls[payload.platform] || "";
  }

  platformWindow(platform) {
    const existing = this.platformWindows.get(platform);
    if (existing && !existing.isDestroyed()) return existing;
    const win = new BrowserWindow({
      width: 1280, height: 860, minWidth: 960, minHeight: 680, show: true,
      title: `奇遇AI · ${platform}公开线索采集`,
      webPreferences: {
        partition: `persist:qiyu-platform-${platform}`,
        contextIsolation: true, nodeIntegration: false, sandbox: true,
      },
    });
    win.on("closed", () => this.platformWindows.delete(platform));
    this.platformWindows.set(platform, win);
    return win;
  }

  async collectPublicLeads(payload) {
    const target = this.platformUrl(payload);
    if (!target) throw new Error("搜索目标或平台不正确");
    const win = this.platformWindow(String(payload.platform || "public"));
    win.show();
    win.focus();
    await win.loadURL(target);
    await this.wait(2500);
    for (let index = 0; index < 4; index += 1) {
      await win.webContents.executeJavaScript("window.scrollBy({top: Math.max(700, window.innerHeight * .85), behavior: 'smooth'})");
      await this.wait(1200);
    }
    const input = JSON.stringify({
      platform: String(payload.platform || ""),
      keywords: String(payload.keywords || payload.target || "").split(/[，,、\s]+/).filter(Boolean),
      limit: Math.max(1, Math.min(100, Number(payload.dailyLimit || payload.settings?.dailyLimit || 20))),
    });
    const result = await win.webContents.executeJavaScript(`(() => {
      const input = ${input};
      const patterns = {
        douyin: /\\/user\\//i,
        xiaohongshu: /\\/user\\/profile\\//i,
        kuaishou: /\\/profile\\//i,
      };
      const pattern = patterns[input.platform];
      const text = (node) => String(node?.innerText || node?.textContent || "").replace(/\\s+/g, " ").trim();
      const pageText = text(document.body).slice(0, 10000);
      const blockedByVerification = /请完成验证|安全验证|滑块验证|验证中心|captcha/i.test(pageText);
      const needsLogin = blockedByVerification || (/扫码登录|登录后|手机号登录|验证码登录/.test(pageText) && document.querySelectorAll('a[href]').length < 15);
      const seen = new Set();
      const leads = [];
      for (const anchor of document.querySelectorAll('a[href]')) {
        const url = new URL(anchor.href, location.href);
        if (!pattern || !pattern.test(url.pathname) || seen.has(url.href)) continue;
        const container = anchor.closest('article, li, [data-e2e], [class*=card], [class*=item]') || anchor.parentElement;
        const context = text(container).slice(0, 800);
        const nickname = (text(anchor) || anchor.getAttribute('aria-label') || context.split(' ')[0] || '公开用户').slice(0, 80);
        if (!nickname || nickname.length > 80 || /登录|首页|消息|发布/.test(nickname)) continue;
        seen.add(url.href);
        leads.push({
          nickname,
          profileUrl: url.href,
          sourceUrl: location.href,
          evidence: context,
          matchedKeywords: input.keywords.filter(keyword => context.toLowerCase().includes(keyword.toLowerCase())),
        });
        if (leads.length >= input.limit) break;
      }
      return { leads, count: leads.length, needsLogin, title: document.title, url: location.href };
    })()`);
    if (result.needsLogin) {
      return { ...result, notice: "平台登录页已打开。请在奇遇AI窗口完成登录，然后回到网站重新运行任务。" };
    }
    return { ...result, notice: result.count ? `已读取 ${result.count} 条当前页面可见的公开候选线索，正在交给AI筛选` : "当前页面没有读取到候选线索，请确认已登录并能看到搜索结果后重试" };
  }

  async scanLocalFolder() {
    const picked = await dialog.showOpenDialog({ title: "选择奇遇AI可以读取的素材目录", properties: ["openDirectory"] });
    if (picked.canceled || !picked.filePaths[0]) return { cancelled: true, files: [], notice: "用户取消了目录选择" };
    const root = picked.filePaths[0];
    const files = [];
    const allowed = new Set([".mp4", ".mov", ".m4v", ".avi", ".mkv", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".wav", ".mp3", ".m4a", ".aac", ".pdf", ".txt", ".doc", ".docx"]);
    const walk = (folder) => {
      if (files.length >= 500) return;
      let entries = [];
      try { entries = fs.readdirSync(folder, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (files.length >= 500 || entry.name.startsWith(".")) break;
        const full = path.join(folder, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!entry.isFile() || !allowed.has(path.extname(entry.name).toLowerCase())) continue;
        try {
          const stat = fs.statSync(full);
          files.push({ name: entry.name, relativePath: path.relative(root, full), extension: path.extname(entry.name).toLowerCase(), size: stat.size, modifiedAt: stat.mtime.toISOString() });
        } catch { /* 单个文件无法读取时继续 */ }
      }
    };
    walk(root);
    return { rootName: path.basename(root), files, count: files.length, truncated: files.length >= 500, notice: `已读取 ${files.length} 个授权目录中的素材文件` };
  }

  async preparePlatformPublish(payload) {
    const urls = { douyin: "https://creator.douyin.com/creator-micro/content/upload", xiaohongshu: "https://creator.xiaohongshu.com/publish/publish", kuaishou: "https://cp.kuaishou.com/article/publish/video", shipinhao: "https://channels.weixin.qq.com/platform/post/create" };
    const url = urls[payload.platform];
    if (!url) throw new Error("暂不支持该平台");
    const win = this.platformWindow(String(payload.platform || "public"));
    win.show();
    win.focus();
    await win.loadURL(url);
    await this.wait(2600);
    let mediaFile = "";
    if (payload.mediaUrl && /^https?:\/\//i.test(String(payload.mediaUrl))) {
      const mediaUrl = new URL(String(payload.mediaUrl), this.server);
      const headers = {};
      if (this.basicAuth && mediaUrl.origin === new URL(this.server).origin) {
        headers.Authorization = `Basic ${Buffer.from(`${this.basicAuth.username}:${this.basicAuth.password}`).toString("base64")}`;
      }
      const response = await fetch(mediaUrl, { headers, signal: AbortSignal.timeout(120000) });
      if (!response.ok || !response.body) throw new Error(`下载发布素材失败（${response.status}）`);
      const type = response.headers.get("content-type") || "";
      const typeExtension = type.includes("video/mp4") ? ".mp4" : type.includes("quicktime") ? ".mov" : type.includes("png") ? ".png" : type.includes("webp") ? ".webp" : type.includes("jpeg") ? ".jpg" : "";
      const sourceExtension = path.extname(mediaUrl.pathname).slice(0, 8);
      const uploadDir = path.join(this.userData, "publish-uploads");
      fs.mkdirSync(uploadDir, { recursive: true });
      mediaFile = path.join(uploadDir, `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${sourceExtension || typeExtension || ".bin"}`);
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(mediaFile));
      if (!win.webContents.debugger.isAttached()) win.webContents.debugger.attach("1.3");
      try {
        const document = await win.webContents.debugger.sendCommand("DOM.getDocument", { depth: -1, pierce: true });
        const inputs = await win.webContents.debugger.sendCommand("DOM.querySelectorAll", { nodeId: document.root.nodeId, selector: 'input[type="file"]' });
        if (!inputs.nodeIds?.length) throw new Error("发布页尚未显示素材上传入口，请先完成平台登录后重试");
        await win.webContents.debugger.sendCommand("DOM.setFileInputFiles", { nodeId: inputs.nodeIds[0], files: [mediaFile] });
      } finally {
        if (win.webContents.debugger.isAttached()) win.webContents.debugger.detach();
      }
    }
    const form = JSON.stringify({ title: String(payload.title || ""), content: String(payload.content || "") });
    const filled = await win.webContents.executeJavaScript(`(() => {
      const data = ${form};
      const visible = (node) => node && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden';
      const setValue = (node, value) => {
        if (!node || !value) return false;
        if (node.isContentEditable) { node.focus(); node.textContent = value; node.dispatchEvent(new InputEvent('input', { bubbles:true, inputType:'insertText', data:value })); return true; }
        const proto = node.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        setter ? setter.call(node, value) : node.value = value;
        node.dispatchEvent(new Event('input', { bubbles:true })); node.dispatchEvent(new Event('change', { bubbles:true })); return true;
      };
      const fields = [...document.querySelectorAll('input:not([type=file]):not([type=hidden]), textarea, [contenteditable=true]')].filter(visible);
      const titleField = fields.find(node => /标题|title/i.test([node.placeholder,node.getAttribute('aria-label'),node.getAttribute('name')].filter(Boolean).join(' '))) || fields.find(node => node.tagName === 'INPUT');
      const contentField = fields.find(node => /描述|正文|文案|内容|caption|description/i.test([node.placeholder,node.getAttribute('aria-label'),node.getAttribute('name')].filter(Boolean).join(' '))) || fields.find(node => node.tagName === 'TEXTAREA' || node.isContentEditable);
      return { title:setValue(titleField,data.title), content:setValue(contentField,data.content), page:document.title };
    })()`);
    if (payload.title) clipboard.writeText(String(payload.title));
    return { prepared: true, platform: payload.platform, mediaUploaded: Boolean(mediaFile), ...filled, notice: `发布页已打开${mediaFile ? "并装入素材" : ""}，标题和文案已尽量自动填写；请检查预览后点击平台的最终发布按钮` };
  }

  async execute(job) {
    const payload = job.payload || {};
    switch (job.type) {
      case "system_test":
        if (Notification.isSupported()) new Notification({ title: "奇遇AI", body: "客户端已成功收到网站任务" }).show();
        return { message: "奇遇AI客户端连接正常", hostname: os.hostname(), platform: `${process.platform}-${process.arch}` };
      case "wechat_probe": {
        return this.probeWechat();
      }
      case "wechat_open": return this.openWechat();
      case "wechat_contact_scan": return this.scanWechatContacts();
      case "wechat_inbox_scan": return this.scanWechatInbox();
      case "wechat_chat_context": return this.scanWechatChatContext(payload.contact, payload.historyLimit);
      case "wechat_ai_reply": {
        const historyResult = payload.aiSettings?.useChatHistory === false
          ? { history: [], count: 0 }
          : await this.scanWechatChatContext(payload.contact, payload.aiSettings?.historyLimit);
        const generated = await this.post({
          action: "generate_reply", jobId: job.id, contact: payload.contact, goal: payload.goal,
          history: historyResult.history, settings: payload.aiSettings || {},
        });
        const executed = await this.wechatDraft(payload.contact, generated.content, payload.sendApproved === true);
        return { ...executed, aiGenerated: true, historyCount: generated.historyCount, knowledgeUsed: generated.knowledgeUsed, customerDataUsed: generated.customerDataUsed };
      }
      case "wechat_draft": return this.wechatDraft(payload.contact, payload.message, false);
      case "wechat_send":
        if (!payload.sendApproved) throw new Error("缺少人工发送授权");
        return this.wechatDraft(payload.contact, payload.message, true);
      case "wechat_sop_step":
        if (payload.action === "wait") return { notice: "等待步骤已完成" };
        if (payload.action === "moments_publish") {
          if (process.platform !== "win32") throw new Error("朋友圈自动发布当前仅在Windows微信中提供");
          if (payload.content) clipboard.writeText(String(payload.content));
          const result = await this.runWindowsWechat("open-moments");
          if (!result.ok) throw new Error(result.output || "打开朋友圈失败");
          return { opened: true, notice: "已打开朋友圈发布入口并复制文案，请检查素材后确认发布" };
        }
        if (payload.aiRequested) {
          const historyResult = payload.aiSettings?.useChatHistory === false
            ? { history: [], count: 0 }
            : await this.scanWechatChatContext(payload.contact, payload.aiSettings?.historyLimit);
          const generated = await this.post({
            action: "generate_reply", jobId: job.id, contact: payload.contact, goal: payload.goal,
            history: historyResult.history, settings: payload.aiSettings || {},
          });
          const executed = await this.wechatDraft(payload.contact, generated.content, payload.approval === false);
          return { ...executed, aiGenerated: true, historyCount: generated.historyCount, knowledgeUsed: generated.knowledgeUsed, customerDataUsed: generated.customerDataUsed };
        }
        return this.wechatDraft(payload.contact, payload.content, payload.approval === false);
      case "platform_open_login": {
        const urls = { douyin: "https://creator.douyin.com/", xiaohongshu: "https://creator.xiaohongshu.com/", kuaishou: "https://cp.kuaishou.com/", shipinhao: "https://channels.weixin.qq.com/platform/" };
        if (!urls[payload.platform]) throw new Error("暂不支持该平台");
        const win = this.platformWindow(String(payload.platform));
        win.show(); win.focus(); await win.loadURL(urls[payload.platform]);
        return { opened: true, platform: payload.platform, notice: "登录页已在奇遇AI独立窗口打开；登录状态会安全保存在这台电脑" };
      }
      case "platform_publish": return this.preparePlatformPublish(payload);
      case "local_folder_scan": return this.scanLocalFolder();
      case "acquisition_search": {
        return this.collectPublicLeads(payload);
      }
      default: throw new Error(`当前客户端不支持任务：${job.type}`);
    }
  }

  async loop() {
    let heartbeatAt = 0;
    while (this.running) {
      try {
        if (Date.now() - heartbeatAt > 25000) { await this.post({ action: "heartbeat" }); heartbeatAt = Date.now(); }
        const response = await this.request("GET", { action: "claim", deviceId: this.config.deviceId }, undefined, true);
        const job = response.job;
        if (job) {
          this.log(`领取任务 #${job.id}：${job.type}`);
          await this.post({ action: "report", jobId: job.id, status: "running", progress: 10 });
          try {
            const result = await this.execute(job);
            await this.post({ action: "report", jobId: job.id, status: "succeeded", progress: 100, result });
            this.log(`任务 #${job.id} 已完成`);
          } catch (error) {
            await this.post({ action: "report", jobId: job.id, status: "failed", progress: 100, error: error.message });
            this.log(`任务 #${job.id} 失败：${error.message}`);
          }
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        this.log(`连接暂时中断：${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  async start() { this.running = true; await this.ensureRegistered(); this.loop(); }
  stop() { this.running = false; }
}

module.exports = { QiyuAgent };
