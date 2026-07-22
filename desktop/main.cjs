const { app, BrowserWindow, desktopCapturer, ipcMain, Menu, Tray, nativeImage, safeStorage, session, shell, systemPreferences } = require("electron");
const { execFile, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { QiyuAgent } = require("./agent.cjs");

app.setName(process.env.QIYU_APP_NAME || "奇遇AI");
let mainWindow, tray, agent, activeServer = "", lastStatus = {}, authAttempted = false, showingLogin = false, runtimeCredentials = null;
const keychainService = "com.qiyuai.desktop.http-auth";
const configPath = () => path.join(app.getPath("userData"), "desktop.json");
const readConfig = () => { try { return JSON.parse(fs.readFileSync(configPath(), "utf8")); } catch { return {}; } };
const writeConfig = (data) => fs.writeFileSync(configPath(), JSON.stringify(data, null, 2));
const contactScannerRoot = () => app.isPackaged
  ? path.join(process.resourcesPath, "app.asar.unpacked", "desktop", "bin")
  : path.join(__dirname, "bin");
const bundledContactScannerAppPath = () => path.join(contactScannerRoot(), "奇遇AI屏幕助手.app");
const installedContactScannerAppPath = () => path.join(app.getPath("home"), "Applications", "奇遇AI自动化助手.app");
const helperExecutable = application => path.join(application, "Contents", "MacOS", "qiyu-wechat-contact-scanner");
function helperVersion(application) {
  try {
    const plist = fs.readFileSync(path.join(application, "Contents", "Info.plist"), "utf8");
    return plist.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/)?.[1] || "";
  } catch { return ""; }
}
function ensureContactScannerApp() {
  if (process.platform !== "darwin" || !app.isPackaged) return bundledContactScannerAppPath();
  const source = bundledContactScannerAppPath();
  const destination = installedContactScannerAppPath();
  if (!fs.existsSync(source)) return destination;
  const destinationExecutable = helperExecutable(destination);
  const sourceVersion = helperVersion(source);
  const destinationVersion = helperVersion(destination);
  // The helper is signed with one stable designated requirement
  // (`identifier "com.qiyuai.automation"`). Only replace it when the bundled
  // helper version changes, so normal launches keep the exact same permission
  // owner while real feature upgrades still reach existing installations.
  if (
    fs.existsSync(destinationExecutable) &&
    sourceVersion &&
    sourceVersion === destinationVersion
  ) return destination;
  const parent = path.dirname(destination);
  const staging = path.join(parent, `.奇遇AI自动化助手-${process.pid}.app`);
  fs.mkdirSync(parent, { recursive: true });
  fs.rmSync(staging, { recursive: true, force: true });
  fs.cpSync(source, staging, { recursive: true });
  fs.rmSync(destination, { recursive: true, force: true });
  fs.renameSync(staging, destination);
  return destination;
}
const contactScannerAppPath = () => {
  const installed = installedContactScannerAppPath();
  return app.isPackaged && fs.existsSync(installed) ? installed : bundledContactScannerAppPath();
};
const contactScannerPath = () => {
  const bundled = helperExecutable(contactScannerAppPath());
  return fs.existsSync(bundled) ? bundled : path.join(contactScannerRoot(), "qiyu-wechat-contact-scanner");
};
function runPermissionHelper(args, timeout = 12000) {
  const helperApp = contactScannerAppPath();
  const helper = contactScannerPath();
  return new Promise(resolve => {
    if (!fs.existsSync(helperApp)) {
      if (!fs.existsSync(helper)) return resolve({ error: "permission_helper_missing" });
      execFile(helper, args, { timeout }, (error, stdout) => {
        try { resolve(JSON.parse(String(stdout || "{}"))); }
        catch { resolve({ error: error?.message || "permission_helper_invalid_response" }); }
      });
      return;
    }
    const stamp = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const output = path.join(app.getPath("temp"), `qiyu-helper-${stamp}.json`);
    const stderr = path.join(app.getPath("temp"), `qiyu-helper-${stamp}.err`);
    execFile("/usr/bin/open", ["-n", "-W", "-g", "-o", output, "--stderr", stderr, helperApp, "--args", ...args], { timeout }, error => {
      try { resolve(JSON.parse(fs.readFileSync(output, "utf8"))); }
      catch {
        let detail = "";
        try { detail = fs.readFileSync(stderr, "utf8").trim(); } catch {}
        resolve({ error: detail || error?.message || "permission_helper_invalid_response" });
      }
      try { fs.unlinkSync(output); } catch {}
      try { fs.unlinkSync(stderr); } catch {}
    });
  });
}
async function permissionStatus() {
  if (process.platform !== "darwin") return { accessibility: true, screen: true };
  const mainAccessibility = systemPreferences.isTrustedAccessibilityClient(false);
  const mainScreen = systemPreferences.getMediaAccessStatus("screen") === "granted";
  const helper = contactScannerPath();
  let helperAccessibility = false, helperScreen = false, helperError = "";
  if (fs.existsSync(helper)) {
    // LaunchServices makes the stable bundled helper the TCC permission owner.
    // A raw child process inherits the frequently updated Electron parent and
    // makes an enabled permission appear disabled after an application update.
    const helperState = await runPermissionHelper(["--check-permissions"]);
    helperAccessibility = Boolean(helperState.accessibility);
    helperScreen = Boolean(helperState.screen);
    helperError = String(helperState.error || "");
  } else helperError = "permission_helper_missing";
  return {
    accessibility: helperAccessibility,
    screen: helperScreen,
    mainAccessibility, mainScreen, helperAccessibility, helperScreen, helperError,
  };
}

function runSecurity(args, input = "") {
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/security", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim() || `系统钥匙串返回 ${code}`)));
    child.stdin.end(input);
  });
}

async function loadCredentials() {
  const config = readConfig();
  runtimeCredentials = null;
  if (process.platform === "darwin" && config.authFormat === 3 && config.authUsername) {
    try {
      const password = await runSecurity(["find-generic-password", "-a", String(config.authUsername), "-s", keychainService, "-w"]);
      if (password) runtimeCredentials = { username: String(config.authUsername), password };
    } catch {}
    return runtimeCredentials;
  }
  if (process.platform !== "darwin" && config.authFormat === 2 && config.authUsername && config.authPassword && safeStorage.isEncryptionAvailable()) {
    try { runtimeCredentials = { username: String(config.authUsername), password: safeStorage.decryptString(Buffer.from(config.authPassword, "base64")) }; }
    catch {}
  }
  return runtimeCredentials;
}

async function saveCredentials(username, password) {
  const config = readConfig();
  if (process.platform === "darwin") {
    // Use the login keychain directly. Electron safeStorage can block after an
    // ad-hoc signed development build is replaced, which made the login button
    // appear to do nothing even though the password was correct.
    // The security CLI asks twice when the item is first created and once when
    // an existing item is updated; the extra line is ignored in the latter case.
    await runSecurity(["add-generic-password", "-U", "-a", username, "-s", keychainService, "-w"], `${password}\n${password}\n`);
    const next = { ...config, authFormat: 3, authUsername: username };
    delete next.authPassword;
    writeConfig(next);
  } else {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("系统安全存储暂不可用，请重新启动电脑后再试");
    writeConfig({ ...config, authFormat: 2, authUsername: username, authPassword: safeStorage.encryptString(password).toString("base64") });
  }
  runtimeCredentials = { username, password };
}

function clearCredentials() {
  const config = readConfig();
  delete config.authFormat; delete config.authUsername; delete config.authPassword;
  writeConfig(config);
  runtimeCredentials = null;
  if (process.platform === "darwin") runSecurity(["delete-generic-password", "-s", keychainService]).catch(() => {});
}

function readCredentials() { return runtimeCredentials; }

async function reachable(server) {
  try {
    const response = await fetch(`${server.replace(/\/$/, "")}/api/automation?action=devices`, {
      signal: AbortSignal.timeout(3500),
    });
    return response.ok || response.status === 401;
  } catch { return false; }
}

async function chooseServer() {
  const config = readConfig();
  // Development builds may deliberately point at a local tunnel, but that
  // address must never survive into a packaged customer build.  Keeping an
  // old 127.0.0.1 value made the shell load while protected management APIs
  // returned 401, so the sidebar and the device page disagreed.
  const configuredServer = app.isPackaged && /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(String(config.server || ""))
    ? ""
    : config.server;
  const candidates = [process.env.QIYU_SERVER_URL, configuredServer, "https://xcx.qiyuai.com.cn", "http://localhost:3000"].filter(Boolean);
  for (const candidate of [...new Set(candidates)]) if (await reachable(candidate)) return candidate.replace(/\/$/, "");
  return configuredServer || "https://xcx.qiyuai.com.cn";
}

function offlineHtml(server) {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;background:radial-gradient(circle at 20% 15%,#cce4ff,transparent 38%),radial-gradient(circle at 85% 20%,#e3d6ff,transparent 42%),#eef3f9;color:#272935}.card{width:min(560px,calc(100% - 40px));padding:38px;border:1px solid rgba(255,255,255,.9);border-radius:28px;background:rgba(255,255,255,.62);box-shadow:0 25px 70px rgba(50,60,90,.16);backdrop-filter:blur(28px)}h1{font-size:30px;margin:0 0 12px}p{color:#737785;line-height:1.7}input{width:100%;padding:14px;border:1px solid #dfe2eb;border-radius:14px;font-size:15px}button{margin-top:12px;width:100%;padding:14px;border:0;border-radius:14px;color:white;background:#7052dc;font-size:15px;font-weight:700}</style><body><div class="card"><h1>奇遇AI正在连接服务器</h1><p>当前地址：${server}<br>请确认服务器和HTTPS已经部署，或者填写新的奇遇AI网站地址。</p><input id="server" value="${server}"><button onclick="connect()">保存并重新连接</button><script>async function connect(){const value=document.getElementById('server').value;await window.qiyuDesktop.chooseServer(value);}</script></div></body></html>`;
}

function onboardingHtml() {
  if (process.platform === "win32") return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;font-family:"Microsoft YaHei UI",sans-serif;background:radial-gradient(circle at 15% 10%,#cce5ff,transparent 38%),radial-gradient(circle at 85% 18%,#e6d7ff,transparent 42%),#edf3fa;color:#282a36}.wrap{width:min(790px,calc(100% - 40px));margin:48px auto}.brand{color:#6246d2;font-weight:800}.card{margin-top:18px;padding:34px;border:1px solid rgba(255,255,255,.92);border-radius:28px;background:rgba(255,255,255,.7);box-shadow:0 28px 75px rgba(50,60,90,.16)}h1{margin:0 0 9px;font-size:30px}p{margin:0;color:#747784;line-height:1.7}.steps{display:grid;gap:12px;margin:25px 0}.step{display:grid;grid-template-columns:42px 1fr auto auto;align-items:center;gap:13px;padding:15px;border:1px solid rgba(220,222,231,.86);border-radius:16px;background:rgba(248,249,252,.82)}.num{width:38px;height:38px;display:grid;place-items:center;color:#6549d0;background:#eeeaff;border-radius:12px;font-weight:800}.step strong,.step small{display:block}.step small{margin-top:4px;color:#8c8f9b}.status{padding:7px 10px;border-radius:999px;color:#208256;background:#ddf7e9;font-size:12px;font-style:normal;font-weight:800}.step button,.continue{padding:11px 14px;border:0;border-radius:11px;font-weight:750}.step button{color:#6044cb;background:#ece8ff}.continue{width:100%;color:#fff;background:linear-gradient(135deg,#8062ed,#5c43d1);font-size:15px}</style><body><main class="wrap"><div class="brand">奇遇AI · Windows 自动化电脑助手</div><section class="card"><h1>三步开始使用</h1><p>自动化组件已内置，不需要在系统里寻找辅助功能开关。</p><div class="steps"><div class="step"><span class="num">1</span><span><strong>电脑自动化组件</strong><small>联系人读取、消息草稿和平台窗口均已随安装包提供</small></span><em class="status">已内置</em><button onclick="alert('组件完整，可以直接使用')">检查组件</button></div><div class="step"><span class="num">2</span><span><strong>登录微信</strong><small>请安装并登录 Windows 微信桌面版</small></span><em class="status">本机运行</em><button onclick="window.qiyuDesktop.openWechat()">打开微信</button></div><div class="step"><span class="num">3</span><span><strong>连接奇遇AI网站</strong><small>助手会自动绑定本机并领取你创建的任务</small></span><em class="status">自动连接</em><button onclick="finish(this)">连接网站</button></div></div><button class="continue" onclick="finish(this)">进入奇遇AI</button></section></main><script>async function finish(button){button.disabled=true;button.textContent='正在连接…';const result=await window.qiyuDesktop.completeOnboarding();if(!result?.ok){button.disabled=false;button.textContent='重新连接';alert(result?.error||'连接失败');}}</script></body></html>`;
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;background:radial-gradient(circle at 15% 10%,#cce5ff,transparent 38%),radial-gradient(circle at 85% 18%,#e6d7ff,transparent 42%),#edf3fa;color:#282a36}.wrap{width:min(790px,calc(100% - 40px));margin:48px auto}.brand{color:#6246d2;font-weight:800}.card{margin-top:18px;padding:34px;border:1px solid rgba(255,255,255,.92);border-radius:28px;background:rgba(255,255,255,.65);box-shadow:0 28px 75px rgba(50,60,90,.16);backdrop-filter:blur(30px)}h1{margin:0 0 9px;font-size:30px}p{margin:0;color:#747784;line-height:1.7}.steps{display:grid;gap:12px;margin:25px 0}.step{display:grid;grid-template-columns:42px 1fr auto auto;align-items:center;gap:13px;padding:15px;border:1px solid rgba(220,222,231,.86);border-radius:16px;background:rgba(248,249,252,.76)}.num{width:38px;height:38px;display:grid;place-items:center;color:#6549d0;background:#eeeaff;border-radius:12px;font-weight:800}.step strong,.step small{display:block}.step small{margin-top:4px;color:#8c8f9b}.status{min-width:68px;padding:7px 9px;border-radius:999px;color:#a05b30;background:#fff0df;text-align:center;font-size:12px;font-style:normal;font-weight:800}.status.on{color:#208256;background:#ddf7e9}.step button{min-width:92px;padding:10px 13px;color:#6044cb;background:#ece8ff;border:0;border-radius:11px;font-weight:700}.step button.on{color:#208256;background:#ddf7e9}.continue{width:100%;padding:15px;border:0;border-radius:14px;color:#fff;background:linear-gradient(135deg,#8062ed,#5c43d1);font-size:15px;font-weight:800}.continue:disabled{opacity:.55}</style><body><main class="wrap"><div class="brand">奇遇AI · 自动化电脑助手</div><section class="card"><h1>三步开启 AI 自动接管</h1><p>权限统一交给内置的“奇遇AI自动化助手”，开启一次后普通界面更新不会再次要求授权。</p><div class="steps"><div class="step"><span class="num">1</span><span><strong>允许辅助功能</strong><small>请在系统列表开启“奇遇AI自动化助手”，用于搜索联系人和填写消息</small></span><em id="accessibility-status" class="status">未开启</em><button id="accessibility-button" onclick="openPermission('accessibility',this)">去开启</button></div><div class="step"><span class="num">2</span><span><strong>允许屏幕录制</strong><small>请在系统列表开启“奇遇AI自动化助手”，用于读取当前微信通讯录</small></span><em id="screen-status" class="status">未开启</em><button id="screen-button" onclick="openPermission('screen',this)">去开启</button></div><div class="step"><span class="num">3</span><span><strong>登录微信</strong><small>平台和微信登录状态只保存在这台电脑</small></span><em class="status on">本机检查</em><button onclick="window.qiyuDesktop.openWechat()">打开微信</button></div></div><button class="continue" onclick="finish(this)">检查权限并进入奇遇AI</button></section></main><script>async function refresh(){const state=await window.qiyuDesktop.getPermissions();for(const key of ['accessibility','screen']){const enabled=Boolean(state?.[key]);const status=document.getElementById(key+'-status');const button=document.getElementById(key+'-button');status.textContent=enabled?'已开启':'未开启';status.classList.toggle('on',enabled);button.textContent=enabled?'已开启':'去开启';button.classList.toggle('on',enabled);}}async function openPermission(type,button){button.disabled=true;button.textContent='正在注册…';await window.qiyuDesktop.openPermission(type);button.disabled=false;setTimeout(refresh,900);}async function finish(button){button.disabled=true;button.textContent='正在检查权限…';const result=await window.qiyuDesktop.completeOnboarding();if(!result?.ok){button.disabled=false;button.textContent='检查权限并进入奇遇AI';alert(result?.error||'连接失败');}}refresh();setInterval(refresh,1500);</script></body></html>`;
}

function pairingHtml() {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;background:radial-gradient(circle at 16% 14%,#c9e4ff,transparent 38%),radial-gradient(circle at 84% 17%,#e4d7ff,transparent 40%),#edf3fa;color:#272935}.card{width:min(560px,calc(100% - 40px));padding:38px;border:1px solid rgba(255,255,255,.92);border-radius:28px;background:rgba(255,255,255,.68);box-shadow:0 28px 75px rgba(50,60,90,.17);backdrop-filter:blur(30px)}.brand{color:#6246d2;font-weight:800}.code{margin:22px 0 10px;padding:15px;border:1px solid #ded7f7;border-radius:14px;background:#f7f5ff}.code strong,.code small{display:block}.code small{margin-top:5px;color:#7d7890;line-height:1.6}input{width:100%;margin-top:8px;padding:14px;border:1px solid #dfe2eb;border-radius:13px;background:rgba(255,255,255,.86);font:700 18px ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.12em;text-transform:uppercase;outline:none}input:focus{border-color:#8062ed;box-shadow:0 0 0 4px rgba(112,82,218,.1)}button{width:100%;margin-top:14px;padding:14px;border:0;border-radius:14px;color:#fff;background:linear-gradient(135deg,#8063ee,#6044d4);font-size:15px;font-weight:750}button:disabled{opacity:.55}.notice{min-height:22px;margin:13px 0 0;color:#6f6d7c;font-size:13px;line-height:1.5}.notice.error{color:#b84c5c}.notice.ok{color:#208256}h1{margin:20px 0 9px;font-size:29px}p{margin:0;color:#747784;line-height:1.7}</style><body><main class="card"><div class="brand">奇遇AI · 电脑助手</div><h1>绑定当前工作空间</h1><p>先在网站的“电脑助手”页面生成一次性配对码，再粘贴到这里。配对码只使用一次，十分钟后失效。</p><div class="code"><strong>不会上传微信或平台登录凭据</strong><small>本步骤只把这台电脑与当前网站工作空间建立授权关系。</small></div><label>一次性配对码<input id="pairing-code" autocomplete="one-time-code" maxlength="12" placeholder="例如 A1B2C3D4E5F6" onkeydown="if(event.key==='Enter')pairDevice()"></label><button id="pair-button" onclick="pairDevice()">绑定这台电脑</button><p id="notice" class="notice"></p></main><script>async function pairDevice(){const input=document.getElementById('pairing-code');const button=document.getElementById('pair-button');const notice=document.getElementById('notice');const code=input.value.replace(/\\s+/g,'').toUpperCase();if(!code){notice.className='notice error';notice.textContent='请输入一次性配对码';return;}button.disabled=true;button.textContent='正在绑定…';notice.className='notice';notice.textContent='';try{const result=await window.qiyuDesktop.pairDevice(code);if(!result||!result.ok)throw new Error(result&&result.error||'绑定失败');notice.className='notice ok';notice.textContent='绑定成功，正在进入奇遇AI…';input.value='';}catch(error){notice.className='notice error';notice.textContent=error&&error.message||'绑定失败';button.disabled=false;button.textContent='重新绑定';}}</script></body></html>`;
}

function loadPairing() {
  const file = path.join(app.getPath("userData"), "workspace-pairing.html");
  fs.writeFileSync(file, pairingHtml());
  return mainWindow.loadFile(file);
}

function loadOnboarding() {
  const file = path.join(app.getPath("userData"), "onboarding.html");
  let html = onboardingHtml();
  if (process.platform === "darwin") {
    html = html
      .replace('<em id="accessibility-status" class="status">未开启</em><button id="accessibility-button"', '<em id="accessibility-status" class="status">检测中</em><button disabled id="accessibility-button"')
      .replace('<em id="screen-status" class="status">未开启</em><button id="screen-button"', '<em id="screen-status" class="status">检测中</em><button disabled id="screen-button"')
      .replace("status.textContent=enabled?'已开启':'未开启';", "status.textContent=enabled?'已开启':'需要开启';")
      .replace("refresh();setInterval(refresh,1500);", "")
      .replace('<button class="continue" onclick="finish(this)">检查权限并进入奇遇AI</button>', '<button id="permission-refresh" style="width:100%;margin:0 0 10px;padding:12px;border:1px solid #ded7f7;border-radius:13px;color:#6549d0;background:#f5f2ff;font-weight:750" onclick="window.qiyuPermissionRefresh(true)">重新检测权限</button><button class="continue" onclick="finish(this)">检查权限并进入奇遇AI</button>');
    const enhancement = `<script>let qiyuAutoEntering=false;window.qiyuPermissionRefresh=async function(manual=false){const refreshButton=document.getElementById('permission-refresh');if(manual&&refreshButton){refreshButton.disabled=true;refreshButton.textContent='正在检测…';}try{const state=await window.qiyuDesktop.getPermissions();for(const key of ['accessibility','screen']){const enabled=Boolean(state&&state[key]);const status=document.getElementById(key+'-status');const button=document.getElementById(key+'-button');status.textContent=enabled?'已开启':'需要开启';status.classList.toggle('on',enabled);button.disabled=enabled;button.textContent=enabled?'已开启':'去开启';button.classList.toggle('on',enabled);}if(state&&state.accessibility&&state.screen&&!qiyuAutoEntering){qiyuAutoEntering=true;const result=await window.qiyuDesktop.completeOnboarding();if(!result||!result.ok){qiyuAutoEntering=false;throw new Error(result&&result.error||'权限复检失败');}}}catch(error){for(const key of ['accessibility','screen']){const status=document.getElementById(key+'-status');if(status.textContent==='检测中')status.textContent='检测失败';}}finally{if(refreshButton){refreshButton.disabled=false;refreshButton.textContent='重新检测权限';}}};window.qiyuPermissionRefresh();setInterval(()=>window.qiyuPermissionRefresh(),2000);</script>`;
    html = html.replace("</body>", `${enhancement}</body>`);
  }
  fs.writeFileSync(file, html);
  return mainWindow.loadFile(file);
}

function permissionCheckHtml() {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;background:radial-gradient(circle at 18% 12%,#c9e3ff,transparent 38%),radial-gradient(circle at 86% 18%,#e4d4ff,transparent 40%),#edf3fa;color:#272935}.card{width:min(500px,calc(100% - 40px));padding:42px;border:1px solid rgba(255,255,255,.92);border-radius:28px;background:rgba(255,255,255,.66);box-shadow:0 28px 75px rgba(50,60,90,.17);text-align:center;backdrop-filter:blur(30px)}.spinner{width:46px;height:46px;margin:0 auto 21px;border:4px solid #e7e1fa;border-top-color:#7152d8;border-radius:50%;animation:spin .9s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}h1{margin:0 0 10px;font-size:27px}p{margin:0;color:#747784;line-height:1.7}</style><body><main class="card"><div class="spinner"></div><h1>正在检查电脑权限</h1><p>奇遇AI每次启动都会重新检测。已经开启的权限不会重复提示。</p></main></body></html>`;
}

function loadPermissionCheck() {
  const file = path.join(app.getPath("userData"), "permission-check.html");
  fs.writeFileSync(file, permissionCheckHtml());
  return mainWindow.loadFile(file);
}

async function checkPermissionsAndRecord() {
  const permissions = await permissionStatus();
  const ready = Boolean(permissions.accessibility && permissions.screen);
  const config = readConfig();
  writeConfig({
    ...config,
    onboardingDone: ready ? true : Boolean(config.onboardingDone),
    lastPermissionCheckAt: new Date().toISOString(),
    lastPermissions: {
      accessibility: Boolean(permissions.accessibility),
      screen: Boolean(permissions.screen),
      mainAccessibility: Boolean(permissions.mainAccessibility),
      helperAccessibility: Boolean(permissions.helperAccessibility),
      helperScreen: Boolean(permissions.helperScreen),
      mainScreen: Boolean(permissions.mainScreen),
    },
  });
  return { permissions, ready };
}

async function startApplication() {
  if (process.env.QIYU_SKIP_ONBOARDING === "1") return connect();
  const config = readConfig();
  const connectForPairing = async () => { await connect(); return loadPairing(); };
  if (process.platform !== "darwin") return config.onboardingDone ? (config.workspacePaired ? connect() : connectForPairing()) : loadOnboarding();
  await loadPermissionCheck();
  const { ready } = await checkPermissionsAndRecord();
  return ready ? (config.workspacePaired ? connect() : connectForPairing()) : loadOnboarding();
}

async function showAndRecheckPermissions() {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
  if (process.platform !== "darwin") return;
  const { ready } = await checkPermissionsAndRecord();
  if (!ready && !mainWindow.webContents.getURL().endsWith("onboarding.html")) await loadOnboarding();
}

function loginHtml(server, invalid = false) {
  const safeServer = server.replace(/[&<>"']/g, value => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" })[value]);
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;background:radial-gradient(circle at 18% 12%,#c9e3ff,transparent 38%),radial-gradient(circle at 86% 18%,#e4d4ff,transparent 40%),#edf3fa;color:#272935}.card{width:min(500px,calc(100% - 40px));padding:38px;border:1px solid rgba(255,255,255,.92);border-radius:28px;background:rgba(255,255,255,.65);box-shadow:0 28px 75px rgba(50,60,90,.17);backdrop-filter:blur(30px)}.brand{display:flex;align-items:center;gap:11px;color:#6045ce;font-weight:800}.logo{width:38px;height:38px;display:grid;place-items:center;border-radius:13px;background:#ece6ff;font-size:20px}h1{margin:24px 0 9px;font-size:29px}p{margin:0 0 20px;color:#747784;line-height:1.65}.server{padding:10px 12px;border-radius:11px;background:rgba(240,242,248,.75);font-size:12px}.error{margin:13px 0 0;color:#bd4e59;font-size:13px}label{display:block;margin-top:15px;color:#555762;font-size:13px;font-weight:700}input{width:100%;margin-top:7px;padding:13px 14px;border:1px solid #dfe2eb;border-radius:13px;background:rgba(255,255,255,.76);outline:none;font-size:15px}input:focus{border-color:#8469df;box-shadow:0 0 0 4px rgba(112,82,218,.09)}button{width:100%;margin-top:20px;padding:14px;border:0;border-radius:14px;color:white;background:linear-gradient(135deg,#8063ee,#6044d4);font-size:15px;font-weight:750}button:disabled{opacity:.6}small{display:block;margin-top:13px;color:#92949e;text-align:center}</style><body><main class="card"><div class="brand"><span class="logo">Q</span>奇遇AI</div><h1>登录奇遇AI工作台</h1><p>服务器开启了访问保护。登录一次后，凭据会由系统加密保存，不会再出现白色 401 页面。</p><div class="server">${safeServer}</div>${invalid?'<div class="error">账号或密码不正确，请重新输入。</div>':''}<label>账号<input id="username" autocomplete="username" autofocus></label><label>密码<input id="password" type="password" autocomplete="current-password" onkeydown="if(event.key==='Enter')login()"></label><button id="submit" onclick="login()">登录并进入</button><small>凭据只保存在当前电脑的系统安全存储中</small></main><script>async function login(){const button=document.getElementById('submit');button.disabled=true;button.textContent='正在登录…';const result=await window.qiyuDesktop.setCredentials(document.getElementById('username').value,document.getElementById('password').value);if(!result.ok){button.disabled=false;button.textContent='登录并进入';alert(result.error||'登录失败');}}</script></body></html>`;
}

async function showLogin(invalid = false) {
  if (!mainWindow || showingLogin) return;
  showingLogin = true;
  try { await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loginHtml(activeServer, invalid))}`); }
  catch (error) {
    if (error?.code !== "ERR_ABORTED") throw error;
  } finally { showingLogin = false; }
}

async function connect() {
  activeServer = await chooseServer();
  if (await reachable(activeServer)) {
    writeConfig({ ...readConfig(), server: activeServer });
    authAttempted = false;
    try { await mainWindow.loadURL(activeServer); }
    catch (error) { if (!mainWindow.webContents.getURL().startsWith("data:text/html")) throw error; }
    agent?.stop();
    agent = new QiyuAgent({ server: activeServer, basicAuth: readCredentials(), onStatus: status => { lastStatus = status; rebuildTray(); } });
    agent.start().catch(error => { lastStatus = { message: error.message }; rebuildTray(); });
  } else {
    await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(offlineHtml(activeServer))}`);
  }
}

app.on("login", (event, webContents, details, authInfo, callback) => {
  let serverHost = "";
  try { serverHost = new URL(activeServer).hostname; } catch {}
  if (authInfo.scheme !== "basic" || authInfo.host !== serverHost) return;
  event.preventDefault();
  const credentials = readCredentials();
  if (credentials && !authAttempted) {
    authAttempted = true;
    callback(credentials.username, credentials.password);
    return;
  }
  if (authAttempted) clearCredentials();
  callback();
  setImmediate(() => showLogin(authAttempted).catch(() => {}));
});

function rebuildTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "打开奇遇AI", click: () => showAndRecheckPermissions().catch(() => {}) },
    { label: lastStatus.message || "自动化助手准备中", enabled: false },
    { label: `服务器：${activeServer || "连接中"}`, enabled: false },
    { type: "separator" },
    { label: "重新连接", click: connect },
    { label: "打开日志目录", click: () => shell.openPath(path.join(app.getPath("userData"), "logs")) },
    { label: "退出", click: () => { app.isQuitting = true; app.quit(); } },
  ]));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 940, minWidth: 1040, minHeight: 680, title: "奇遇AI",
    backgroundColor: "#eef3f9", icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWindow.setWindowButtonVisibility(true);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (!url.startsWith(activeServer)) shell.openExternal(url); else mainWindow.loadURL(url); return { action: "deny" }; });
  mainWindow.on("close", event => { if (!app.isQuitting) { event.preventDefault(); mainWindow.hide(); } });
  startApplication().catch(error => {
    lastStatus = { message: error instanceof Error ? error.message : "启动检查失败" };
    loadOnboarding().catch(() => {});
    rebuildTray();
  });
}

app.whenReady().then(async () => {
  // Keep the network user agent ASCII-only so reverse proxies and Node runtimes
  // do not reject the product's Chinese display name in HTTP headers.
  session.defaultSession.setUserAgent(`Mozilla/5.0 QiyuAIDesktop/${app.getVersion()} Electron/${process.versions.electron}`);
  session.defaultSession.setDisplayMediaRequestHandler((_, callback) => {
    desktopCapturer.getSources({ types: ["screen"] })
      .then(sources => callback(sources[0] ? { video: sources[0] } : {}))
      .catch(() => callback({}));
  });
  try { ensureContactScannerApp(); } catch (error) { lastStatus = { message: `自动化助手安装失败：${error.message}` }; }
  await loadCredentials();
  if (process.env.QIYU_BASIC_USERNAME && process.env.QIYU_BASIC_PASSWORD) await saveCredentials(process.env.QIYU_BASIC_USERNAME, process.env.QIYU_BASIC_PASSWORD);
  createWindow();
  app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
  const icon = nativeImage.createFromPath(path.join(__dirname, "build", "tray.png")).resize({ width: 18, height: 18 });
  tray = new Tray(icon); tray.setToolTip("奇遇AI自动化助手"); tray.on("click", () => mainWindow.isVisible() ? mainWindow.hide() : showAndRecheckPermissions().catch(() => {})); rebuildTray();
  app.on("activate", () => mainWindow ? showAndRecheckPermissions().catch(() => {}) : createWindow());
});

app.on("window-all-closed", event => event?.preventDefault?.());
app.on("before-quit", () => { app.isQuitting = true; agent?.stop(); });
ipcMain.handle("qiyu:get-status", () => ({ server: activeServer, ...lastStatus }));
ipcMain.handle("qiyu:get-permissions", () => permissionStatus());
ipcMain.handle("qiyu:retry", () => connect());
ipcMain.handle("qiyu:pair-device", async (_, code) => {
  const pairingCode = String(code || "").replace(/\s+/g, "").toUpperCase();
  if (!pairingCode) return { ok:false, error:"请输入一次性配对码" };
  try {
    if (!agent) await connect();
    if (!agent) return { ok:false, error:"电脑助手尚未连接到网站" };
    const result = await agent.pair(pairingCode);
    writeConfig({ ...readConfig(), workspacePaired: true, pairedAt: new Date().toISOString() });
    await connect();
    return { ok:true, ...result };
  } catch (error) { return { ok:false, error:error instanceof Error ? error.message : "电脑绑定失败" }; }
});
ipcMain.handle("qiyu:set-server", async (_, server) => { if (!/^https?:\/\//.test(server)) return { ok:false,error:"地址必须以 http:// 或 https:// 开头" }; writeConfig({ ...readConfig(), server:server.replace(/\/$/,"") }); await connect(); return { ok:true }; });
ipcMain.handle("qiyu:set-credentials", async (_, username, password) => {
  if (!String(username || "").trim() || !String(password || "")) return { ok:false,error:"请输入账号和密码" };
  try { await saveCredentials(String(username).trim(), String(password)); await session.defaultSession.clearAuthCache(); await connect(); return { ok:true }; }
  catch (error) { return { ok:false,error:error instanceof Error?error.message:"登录失败" }; }
});
ipcMain.handle("qiyu:open-logs", () => shell.openPath(path.join(app.getPath("userData"), "logs")));
ipcMain.handle("qiyu:open-permission", async (_, type) => {
  if (process.platform !== "darwin") return { ok: true, granted: true, notice: "Windows 不需要单独开启辅助功能；请保持微信已登录" };
  const helper = contactScannerPath();
  if (!fs.existsSync(helper)) return { ok: false, granted: false, error: "自动化助手缺失，请重新安装最新版奇遇AI" };
  const helperApp = contactScannerAppPath();
  const requestHelperPermission = permission => {
    if (fs.existsSync(helperApp)) execFile("/usr/bin/open", ["-n", "-g", helperApp, "--args", permission], { timeout: 60000 }, () => {});
    else execFile(helper, [permission], { timeout: 60000 }, () => {});
  };
  if (type === "accessibility") {
    requestHelperPermission("--request-accessibility");
    await new Promise(resolve => setTimeout(resolve, 650));
    await shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility");
    const permissions = await permissionStatus();
    return { ok: true, granted: permissions.accessibility, permissions };
  }
  if (type === "screen") {
    requestHelperPermission("--request-screen");
    await new Promise(resolve => setTimeout(resolve, 700));
    await shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
    const permissions = await permissionStatus();
    return { ok: true, granted: permissions.screen, permissions };
  }
  return { ok: false, error: "未知权限类型" };
});
ipcMain.handle("qiyu:open-wechat", async () => {
  try {
    if (agent) return { ok: true, ...(await agent.openWechat()) };
    await shell.openExternal("weixin://");
    return { ok:true };
  } catch (error) { return { ok:false, error:error instanceof Error ? error.message : "没有找到微信" }; }
});
ipcMain.handle("qiyu:complete-onboarding", async () => {
  try {
    const permissions = await permissionStatus();
    if (!permissions.accessibility || !permissions.screen) return { ok:false, error:"请先把辅助功能和屏幕录制两项都开启，再进入奇遇AI" };
    writeConfig({ ...readConfig(), onboardingDone: true }); await connect();
    if (!readConfig().workspacePaired) await loadPairing();
    return { ok:true };
  } catch(error) { return { ok:false,error:error instanceof Error?error.message:"连接失败" }; }
});
