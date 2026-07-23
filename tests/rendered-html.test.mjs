import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("shows direct Mac and Windows downloads in the homepage first screen", async () => {
  const [home, styles, layout, sitesPlugin] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("build/sites-vite-plugin.ts", root), "utf8"),
  ]);

  assert.match(home, /data-testid="home-download"/);
  assert.match(home, /下载 Mac 版/);
  assert.match(home, /\/download\/QiyuAI-Mac-latest\.dmg/);
  assert.match(home, /下载 Windows 版/);
  assert.match(home, /\/download\/QiyuAI-Windows-latest\.exe/);
  assert.match(home, /查看连接状态/);
  assert.match(styles, /\.home-download/);
  assert.match(layout, /openGraph/);
  assert.match(layout, /twitter/);
  assert.match(sitesPlugin, /oversizedClientAssets/);
  assert.match(sitesPlugin, /dist", "client", "ffmpeg/);
  await access(new URL("public/og.png", root));
});

test("packages the Mac and Windows automation adapters in the 0.5.12 desktop assistant", async () => {
  const [packageText, agentText, helperText, windowsHelperText] = await Promise.all([
    readFile(new URL("package.json", root), "utf8"),
    readFile(new URL("desktop/agent.cjs", root), "utf8"),
    readFile(new URL("desktop/helpers/WeChatContactScanner.swift", root), "utf8"),
    readFile(new URL("desktop/windows/qiyu-wechat.ps1", root), "utf8"),
  ]);
  const packageJson = JSON.parse(packageText);

  assert.equal(packageJson.version, "0.5.12");
  assert.equal(packageJson.build.afterPack, "desktop/after-pack.cjs");
  assert.deepEqual(packageJson.build.asarUnpack, ["desktop/bin/**", "desktop/windows/**"]);
  assert.match(agentText, /"wechat_contact_scan"/);
  assert.match(agentText, /scanWechatContacts/);
  assert.match(agentText, /runMacWechatHelper/);
  assert.match(agentText, /--wechat-draft/);
  assert.match(helperText, /CGPreflightScreenCaptureAccess/);
  assert.match(helperText, /AXIsProcessTrustedWithOptions/);
  assert.match(windowsHelperText, /Get-WeChatRailCandidates/);
  assert.match(windowsHelperText, /next_after_selected_chats/);
  assert.match(windowsHelperText, /Test-WeChatContactsRailSelection/);
  assert.match(windowsHelperText, /CONTACTS_VIEW_NOT_CONFIRMED/);
  assert.doesNotMatch(windowsHelperText, /Click-Element \$target/);
  assert.doesNotMatch(windowsHelperText, /SendWait\("\^2"\)/);
  assert.doesNotMatch(windowsHelperText, /\$bounds\.Height \* 0\.26/);
  assert.doesNotMatch(windowsHelperText, /Max\(185/);
  assert.doesNotMatch(windowsHelperText, /foreach \(\$offset in @\(180, 225, 270\)\)/);
  await access(new URL("desktop/bin/qiyu-wechat-contact-scanner", root));
  await access(new URL("desktop/windows/qiyu-wechat.ps1", root));
});

test("covers the original product routes with real specialist pages", async () => {
  const [shell, modules, productModules, overview] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/ModulePages.tsx", root), "utf8"),
    readFile(new URL("app/ProductModules.tsx", root), "utf8"),
    readFile(new URL("app/api/overview/route.ts", root), "utf8"),
  ]);
  for (const route of ["auto-workflow", "creation-center", "video-gen", "public-exposure", "smart-broadcast", "wechat-sop", "wechat-tags", "mobile-remote", "contract-center"]) assert.match(shell, new RegExp(route));
  for (const component of ["AnalyticsPage", "AgentChat", "WorkflowStudio", "CreationCenter", "LocalFileManager", "TaskMonitor", "AccountBinding", "SettingsStatus"]) assert.match(modules, new RegExp(component));
  assert.match(productModules, /服务器只保存文件清单/);
  assert.match(overview, /successRate/);
  assert.match(overview, /private_contacts/);
});

test("lets administrators create accounts and manage durable member permissions", async () => {
  const [shell, page, route] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/UserPermissions.tsx", root), "utf8"),
    readFile(new URL("app/api/admin/users/route.ts", root), "utf8"),
  ]);
  assert.match(shell, /user-permissions/);
  assert.match(shell, /user\.role === "admin"/);
  for (const label of ["添加账号", "会员套餐", "会员到期时间", "账号状态", "管理员（全部后台权限）"]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(route, /INSERT INTO users/);
  assert.match(route, /UPDATE users SET/);
  assert.match(route, /DELETE FROM auth_sessions WHERE user_id/);
  assert.match(route, /不能停用当前登录的管理员/);
  assert.match(route, /必须至少保留一个启用中的管理员账号/);
});

test("creates a personal workspace for every authenticated account", async () => {
  const [authServer, authRoute, schema, migration] = await Promise.all([
    readFile(new URL("app/auth-server.ts", root), "utf8"),
    readFile(new URL("app/api/auth/route.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("drizzle/0005_parallel_korg.sql", root), "utf8"),
  ]);

  assert.match(authServer, /ensurePersonalWorkspace/);
  assert.match(authServer, /CREATE TABLE IF NOT EXISTS workspaces/);
  assert.match(authServer, /CREATE TABLE IF NOT EXISTS workspace_members/);
  assert.match(authRoute, /ensurePersonalWorkspace\(userId, displayName\)/);
  assert.match(authRoute, /ensurePersonalWorkspace\(Number\(row\.id\)/);
  assert.match(schema, /workspaceId: integer\("workspace_id"\)/);
  assert.match(migration, /CREATE TABLE `workspaces`/);
  assert.match(migration, /CREATE TABLE `workspace_members`/);
});

test("opens an account menu before switching accounts or logging out", async () => {
  const [shell, styles] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  for (const label of ["个人设置", "用户与权限", "切换账号", "退出登录", "确认退出"]) {
    assert.match(shell, new RegExp(label));
  }
  assert.doesNotMatch(shell, /window\.confirm\("退出当前账号/);
  assert.match(shell, /aria-haspopup="menu"/);
  assert.match(styles, /\.profile-menu/);
  assert.match(styles, /\.account-logout-dialog/);
});

test("uses the full workspace and keeps child dialogs inside the viewport", async () => {
  const modalFiles = [
    "AIExperts.tsx", "Acquisition.tsx", "MembershipPlans.tsx", "ModulePages.tsx",
    "OperationalModules.tsx", "PrivateDomain.tsx", "ProductModules.tsx",
    "UserPermissions.tsx", "page.tsx",
  ];
  const [styles, portal, ...surfaces] = await Promise.all([
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/ModalPortal.tsx", root), "utf8"),
    ...modalFiles.map((file) => readFile(new URL(`app/${file}`, root), "utf8")),
  ]);
  assert.match(styles, /\.content:has\(\.module-page\)/);
  assert.match(styles, /min\(1680px, calc\(100% - 40px\)\)/);
  assert.match(styles, /@keyframes module-fade/);
  assert.match(styles, /\.module-page \{[^}]*animation: module-fade/s);
  assert.match(styles, /max-height: calc\(100dvh - 48px\)/);
  assert.match(styles, /\.private-modal\.wide\s*\{[^}]*1040px/s);
  assert.match(styles, /--subpage-title: clamp\(32px, 2vw, 40px\)/);
  assert.match(styles, /--subpage-body: clamp\(15px, \.84vw, 17px\)/);
  assert.match(styles, /\.record-dialog-backdrop \.private-modal :where\(label, input, textarea, select\)/);
  assert.match(portal, /createPortal\(children, document\.body\)/);
  assert.match(portal, /document\.body\.style\.overflow = "hidden"/);
  for (const [index, surface] of surfaces.entries()) {
    assert.match(surface, /<ModalPortal>/, `${modalFiles[index]} should render dialogs at the viewport root`);
  }
});

test("indexes an explicitly authorized local folder through the desktop assistant", async () => {
  const [agent, automation] = await Promise.all([
    readFile(new URL("desktop/agent.cjs", root), "utf8"),
    readFile(new URL("app/api/automation/route.ts", root), "utf8"),
  ]);
  assert.match(agent, /local_folder_scan/);
  assert.match(agent, /showOpenDialog/);
  assert.match(agent, /relativePath/);
  assert.match(automation, /handleLocalFolderResult/);
  assert.match(automation, /module='local-files'/);
});

test("collects visible public leads and routes them through AI scoring", async () => {
  const [agent, automation, acquisition] = await Promise.all([
    readFile(new URL("desktop/agent.cjs", root), "utf8"),
    readFile(new URL("app/api/automation/route.ts", root), "utf8"),
    readFile(new URL("app/Acquisition.tsx", root), "utf8"),
  ]);
  assert.match(agent, /collectPublicLeads/);
  assert.match(agent, /persist:qiyu-platform-/);
  assert.match(agent, /document\.querySelectorAll\('a\[href\]'\)/);
  assert.match(agent, /滑块验证/);
  assert.match(automation, /意向分析器/);
  assert.match(automation, /INSERT INTO acquisition_leads/);
  assert.match(acquisition, /AI判断意向/);
});

test("uses preset expert prompts and customer-friendly model tiers", async () => {
  const [experts, privateRoute, automation] = await Promise.all([
    readFile(new URL("app/AIExperts.tsx", root), "utf8"),
    readFile(new URL("app/api/private-domain/route.ts", root), "utf8"),
    readFile(new URL("app/api/automation/route.ts", root), "utf8"),
  ]);
  for (const label of ["客服顾问", "销售顾问", "私域运营顾问", "客户成功顾问", "智能推荐", "高质量", "快速省成本"]) assert.match(experts, new RegExp(label));
  assert.match(privateRoute, /ai_draft/);
  assert.match(automation, /privateMessage/);
  assert.match(automation, /dailyLimit/);
});

test("monitors visible unread WeChat messages for controlled AI takeover", async () => {
  const [helper, agent, automation] = await Promise.all([
    readFile(new URL("desktop/helpers/WeChatContactScanner.swift", root), "utf8"),
    readFile(new URL("desktop/agent.cjs", root), "utf8"),
    readFile(new URL("app/api/automation/route.ts", root), "utf8"),
  ]);
  assert.match(helper, /scanInbox/);
  assert.match(helper, /unreadBadgeY/);
  assert.match(agent, /wechat_inbox_scan/);
  assert.match(automation, /dispatchInboxScan/);
  assert.match(automation, /handleInboxResult/);
  assert.match(automation, /inboundFingerprint/);
});

test("requires preview confirmation before importing WeChat contacts", async () => {
  const [page, route] = await Promise.all([
    readFile(new URL("app/PrivateDomain.tsx", root), "utf8"),
    readFile(new URL("app/api/private-domain/route.ts", root), "utf8"),
  ]);

  assert.match(page, /从微信同步/);
  assert.match(page, /确认导入微信联系人/);
  assert.match(page, /不会上传聊天记录、手机号或微信本地数据库/);
  assert.match(page, /confirmContactImport/);
  assert.match(route, /contact_scan_task/);
  assert.match(route, /contact_scan_status/);
  assert.match(route, /contacts_import/);
  assert.match(route, /wechat_desktop/);
});

test("selects private-domain audiences by type before individual contacts", async () => {
  const [page, route] = await Promise.all([
    readFile(new URL("app/PrivateDomain.tsx", root), "utf8"),
    readFile(new URL("app/api/private-domain/route.ts", root), "utf8"),
  ]);

  for (const label of ["全部好友", "按标签选择", "手动选择"]) assert.match(page, new RegExp(label));
  assert.match(page, /setTargetMode\("all"\)/);
  assert.match(route, /plan\.targetMode === "all"/);
  assert.match(route, /SELECT id FROM private_contacts WHERE status='active'/);
});

test("searches and filters large WeChat contact selections", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("app/PrivateDomain.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);

  assert.match(page, /搜索微信昵称、备注或标签/);
  assert.match(page, /按客户标签筛选/);
  assert.match(page, /仅看已选/);
  assert.match(page, /全选筛选结果/);
  assert.match(page, /filteredTargetContacts\.slice\(0, 200\)/);
  assert.match(page, /wechat-contact-options/);
  assert.match(css, /\.target-filter-bar\s*\{/);
  assert.match(css, /\.contact-combobox\s*\{/);
});

test("keeps private-domain builder forms compact and uses task-specific labels", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("app/PrivateDomain.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);

  for (const label of ["激活方案名称", "发布计划名称", "回复策略名称", "群发任务名称", "SOP 流程名称"]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /builder-name-field/);
  assert.match(css, /\.builder-body\s*\{[^}]*align-content:start;[^}]*min-height:0;/);
  assert.match(css, /\.builder-basics\{/);
  assert.match(css, /\.builder-name-field>input\{height:50px;/);
});

test("handles desktop authentication, connection recovery, and image size ratios", async () => {
  const [desktop, preload, modules] = await Promise.all([
    readFile(new URL("desktop/main.cjs", root), "utf8"),
    readFile(new URL("desktop/preload.cjs", root), "utf8"),
    readFile(new URL("app/ModulePages.tsx", root), "utf8"),
  ]);

  assert.match(desktop, /app\.on\("login"/);
  assert.match(desktop, /safeStorage\.encryptString/);
  assert.match(desktop, /response\.status === 401/);
  assert.match(desktop, /authFormat: 2/);
  assert.match(desktop, /keychainService = "com\.qiyuai\.desktop\.http-auth"/);
  assert.match(desktop, /authFormat: 3/);
  assert.match(desktop, /delete next\.authPassword/);
  assert.match(desktop, /const configuredServer = String\(config\.server \|\| ""\)\.trim\(\)/);
  assert.match(desktop, /http:\/\/localhost:3000/);
  assert.match(desktop, /async function loadServerPage/);
  assert.match(desktop, /网页加载超过 15 秒/);
  assert.match(desktop, /qiyu:open-external/);
  assert.match(desktop, /process\.platform === "darwin"\) mainWindow\.setWindowButtonVisibility/);
  assert.match(desktop, /checkPermissionsAndRecord/);
  assert.match(desktop, /showAndRecheckPermissions/);
  assert.match(desktop, /lastPermissionCheckAt/);
  assert.match(desktop, /--check-permissions/);
  assert.match(desktop, /helperAccessibility/);
  assert.match(desktop, /ensureContactScannerApp/);
  assert.match(desktop, /helperVersion/);
  assert.match(desktop, /sourceVersion === destinationVersion/);
  assert.match(desktop, /奇遇AI自动化助手\.app/);
  assert.doesNotMatch(desktop, /getDisplayMedia/);
  assert.match(desktop, /已经开启的权限不会重复提示/);
  assert.match(desktop, /重新检测权限/);
  assert.match(preload, /setCredentials/);
  assert.match(preload, /openExternal/);
  for (const ratio of ["1:1", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9"]) assert.match(modules, new RegExp(`value: "${ratio}"`));
  assert.match(modules, /不需要理解像素尺寸/);
  assert.match(modules, /cropImageToRatio/);
});

test("uses a real ecommerce image workflow instead of the generic record dialog", async () => {
  const [modules, studio, aiRoute] = await Promise.all([
    readFile(new URL("app/ModulePages.tsx", root), "utf8"),
    readFile(new URL("app/EcommerceStudio.tsx", root), "utf8"),
    readFile(new URL("app/api/ai/route.ts", root), "utf8"),
  ]);

  assert.match(modules, /page === "ecommerce".*EcommerceStudio/);
  for (const label of ["上传商品素材", "AI 智能填充", "选择生成规格", "一键详情页", "电商作品"]) assert.match(studio, new RegExp(label));
  assert.match(studio, /image: referencePreview/);
  assert.match(studio, /composeDetailPage/);
  assert.match(studio, /module", "ecommerce"/);
  assert.match(aiRoute, /body\.image \? \{ image: body\.image \}/);
});

test("aggregates generated images and videos into the media and gallery pages", async () => {
  const modules = await readFile(new URL("app/ModulePages.tsx", root), "utf8");
  assert.match(modules, /page === "media"[\s\S]*"image-generate"[\s\S]*"ecommerce"[\s\S]*"video-gen"/);
  assert.match(modules, /page === "gallery"[\s\S]*"image-generate"[\s\S]*"ecommerce"[\s\S]*"video-gen"/);
  assert.match(modules, /module: record\.module \|\| page/);
});

test("runs cloud AI workflows without requiring a desktop device", async () => {
  const workflows = await readFile(new URL("app/ProductModules.tsx", root), "utf8");
  assert.match(workflows, /record\.metadata\.action === "AI生成内容"/);
  assert.match(workflows, /云端 AI 工作流已完成/);
  assert.match(workflows, /record\.metadata\.action === "等待人工审核"/);
  assert.match(workflows, /这个动作需要操作客户电脑/);
});

test("generates WeChat replies from local chat context, customer data, and enterprise knowledge", async () => {
  const [page, css, automation, privateRoute, agent, swift, windows] =
    await Promise.all([
      readFile(new URL("app/PrivateDomain.tsx", root), "utf8"),
      readFile(new URL("app/globals.css", root), "utf8"),
      readFile(new URL("app/api/automation/route.ts", root), "utf8"),
      readFile(new URL("app/api/private-domain/route.ts", root), "utf8"),
      readFile(new URL("desktop/agent.cjs", root), "utf8"),
      readFile(
        new URL("desktop/helpers/WeChatContactScanner.swift", root),
        "utf8",
      ),
      readFile(new URL("desktop/windows/qiyu-wechat.ps1", root), "utf8"),
    ]);

  for (const label of [
    "AI 上下文回复",
    "企业知识库",
    "客户数据库",
    "最近聊天记录",
    "读取上下文并生成微信草稿",
    "客户上下文与 AI",
  ]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(css, /\.message-mode-picker\s*\{/);
  assert.match(css, /\.context-source-row\s*\{/);
  assert.match(css, /\.ai-context-config\s*\{/);
  assert.match(automation, /action === "generate_reply"/);
  assert.match(automation, /relatedKnowledge/);
  assert.match(automation, /customerContext/);
  assert.match(automation, /normalizeHistory/);
  assert.match(privateRoute, /wechat_ai_reply/);
  assert.match(agent, /wechat_chat_context/);
  assert.match(agent, /wechat_ai_reply/);
  assert.match(swift, /--chat-history/);
  assert.match(windows, /"scan-history"/);
});

test("blocks outdated automation clients and shows broadcast execution status immediately", async () => {
  const [page, route] = await Promise.all([
    readFile(new URL("app/PrivateDomain.tsx", root), "utf8"),
    readFile(new URL("app/api/private-domain/route.ts", root), "utf8"),
  ]);

  assert.match(page, /wechat_ai_reply/);
  assert.match(page, /启动中…/);
  assert.match(page, /setTab\("runs"\)/);
  assert.match(page, /直接点击发送/);
  assert.match(route, /电脑助手版本太旧/);
  assert.match(route, /wechat_ai_reply/);
  assert.match(route, /已有任务正在执行/);
});
