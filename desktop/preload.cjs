const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("qiyuDesktop", {
  isDesktop: true,
  platform: process.platform,
  getStatus: () => ipcRenderer.invoke("qiyu:get-status"),
  retryConnection: () => ipcRenderer.invoke("qiyu:retry"),
  chooseServer: (url) => ipcRenderer.invoke("qiyu:set-server", url),
  openExternal: (url) => ipcRenderer.invoke("qiyu:open-external", url),
  setCredentials: (username, password) => ipcRenderer.invoke("qiyu:set-credentials", username, password),
  openLogFolder: () => ipcRenderer.invoke("qiyu:open-logs"),
  getPermissions: () => ipcRenderer.invoke("qiyu:get-permissions"),
  openPermission: (type) => ipcRenderer.invoke("qiyu:open-permission", type),
  openWechat: () => ipcRenderer.invoke("qiyu:open-wechat"),
  pairDevice: (code) => ipcRenderer.invoke("qiyu:pair-device", code),
  completeOnboarding: () => ipcRenderer.invoke("qiyu:complete-onboarding"),
});
